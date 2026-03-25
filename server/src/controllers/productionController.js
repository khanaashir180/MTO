const pool = require('../config/db');
const { ApiError } = require('../utils/errors');
const { isFlagEnabled } = require('../utils/featureFlags');
const { resolveWorkflowTransition } = require('../utils/workflowEngine');

const FLOW_STAGES = {
  BESPOKE: ['Verification', 'Bespoke', 'Model Room', 'Cutting', 'Closing', 'Sole', 'Lasting', 'Finishing', 'QC', 'Packing'],
  EMBROIDERY: ['Verification', 'Embroidery', 'Closing', 'Sole', 'Lasting', 'Finishing', 'QC', 'Packing'],
  LASER: ['Verification', 'Laser', 'Closing', 'Sole', 'Lasting', 'Finishing', 'QC', 'Packing'],
  MTO: ['Verification', 'Model Room', 'Cutting', 'Closing', 'Lasting', 'Finishing', 'QC', 'Packing'],
};

const STAGE_SLA_HOURS = {
  Verification: 12,
  Bespoke: 24,
  Embroidery: 18,
  Laser: 18,
  'Model Room': 24,
  Cutting: 16,
  Closing: 20,
  Sole: 16,
  Lasting: 18,
  Finishing: 12,
  QC: 10,
  Packing: 8,
};

const FACTORY_SHIFT_NAME = 'Day';
const FACTORY_SHIFT_START_HOUR = 6;
const FACTORY_SHIFT_END_HOUR = 21;
const TARGET_APPROVAL_ABSOLUTE_DELTA = 40;
const TARGET_APPROVAL_PERCENT_DELTA = 0.3;

function normalizeFlow(flow) {
  const value = String(flow || 'BESPOKE').toUpperCase();
  if (FLOW_STAGES[value]) return value;
  return 'BESPOKE';
}

function targetChangeNeedsApproval(previousTarget, nextTarget, settings = {}) {
  if (previousTarget === null || previousTarget === undefined) return false;
  const absoluteDelta = Number(settings.approval_absolute_delta ?? TARGET_APPROVAL_ABSOLUTE_DELTA);
  const percentDelta = Number(settings.approval_percent_delta ?? TARGET_APPROVAL_PERCENT_DELTA);
  const delta = Math.abs(Number(nextTarget || 0) - Number(previousTarget || 0));
  if (delta >= absoluteDelta) return true;
  const baseline = Math.max(Number(previousTarget || 0), 1);
  return (delta / baseline) >= percentDelta;
}

async function applyStageTarget(client, stageId, targetDate, shiftName, targetPairs, userId) {
  const existingTarget = await client.query(
    `SELECT target_pairs
     FROM production_stage_targets
     WHERE stage_id = $1
       AND target_date = $2::date
       AND shift_name = $3`,
    [stageId, targetDate, shiftName]
  );
  const previousTargetPairs = existingTarget.rows[0] ? Number(existingTarget.rows[0].target_pairs) : null;

  await client.query(
    `INSERT INTO production_stage_targets (stage_id, target_date, shift_name, target_pairs, created_by, updated_at)
     VALUES ($1, $2::date, $3, $4, $5, NOW())
     ON CONFLICT (stage_id, target_date, shift_name)
     DO UPDATE SET target_pairs = EXCLUDED.target_pairs, created_by = EXCLUDED.created_by, updated_at = NOW()`,
    [stageId, targetDate, shiftName, Math.trunc(targetPairs), userId]
  );

  if (previousTargetPairs === null || previousTargetPairs !== Math.trunc(targetPairs)) {
    await client.query(
      `INSERT INTO production_stage_target_audit (stage_id, target_date, shift_name, previous_target_pairs, new_target_pairs, changed_by)
       VALUES ($1, $2::date, $3, $4, $5, $6)`,
      [stageId, targetDate, shiftName, previousTargetPairs, Math.trunc(targetPairs), userId]
    );
  }

  return previousTargetPairs;
}

async function queueStageTargetApproval(client, stageId, targetDate, shiftName, previousTargetPairs, requestedTargetPairs, userId, notes = null) {
  await client.query(
    `INSERT INTO production_stage_target_approvals (
       stage_id, target_date, shift_name, existing_target_pairs, requested_target_pairs,
       requested_by, approved_by, status, decision_notes, updated_at
     )
     VALUES ($1, $2::date, $3, $4, $5, $6, NULL, 'PENDING', $7, NOW())
     ON CONFLICT (stage_id, target_date, shift_name)
     DO UPDATE SET
       existing_target_pairs = EXCLUDED.existing_target_pairs,
       requested_target_pairs = EXCLUDED.requested_target_pairs,
       requested_by = EXCLUDED.requested_by,
       approved_by = NULL,
       status = 'PENDING',
       decision_notes = EXCLUDED.decision_notes,
       updated_at = NOW()`,
    [stageId, targetDate, shiftName, previousTargetPairs, Math.trunc(requestedTargetPairs), userId, notes]
  );
}

async function getStageTargetSettings(client, stageId) {
  const { rows } = await client.query(
    `SELECT approval_absolute_delta, approval_percent_delta
     FROM production_stage_target_settings
     WHERE stage_id = $1`,
    [stageId]
  );
  return rows[0] || {
    approval_absolute_delta: TARGET_APPROVAL_ABSOLUTE_DELTA,
    approval_percent_delta: TARGET_APPROVAL_PERCENT_DELTA,
  };
}

async function createStageNotification(client, stageId, type, title, message, createdBy) {
  const ownerByType = {
    TARGET_APPROVAL_REQUIRED: 'Production Director',
    TARGET_APPROVED: 'Stage Manager',
    TARGET_REJECTED: 'Stage Manager',
  };
  await client.query(
    `INSERT INTO production_stage_notifications (stage_id, notification_type, title, message, created_by, assigned_owner)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [stageId, type, title, message, createdBy, ownerByType[type] || 'Stage Manager']
  );
}

function getNotificationSlaHours(type, escalationLevel = 0) {
  const base = {
    TARGET_APPROVAL_REQUIRED: 4,
    TARGET_APPROVED: 24,
    TARGET_REJECTED: 12,
  }[type] || 12;
  return Math.max(1, base - Number(escalationLevel || 0));
}

function getNextStageName(currentStageName, flow) {
  const flowKey = normalizeFlow(flow);
  const steps = FLOW_STAGES[flowKey];
  const idx = steps.indexOf(currentStageName);
  if (idx < 0 || idx === steps.length - 1) return null;
  return steps[idx + 1];
}

function getPreviousStageName(currentStageName, flow) {
  const flowKey = normalizeFlow(flow);
  const steps = FLOW_STAGES[flowKey];
  const idx = steps.indexOf(currentStageName);
  if (idx <= 0) return null;
  return steps[idx - 1];
}

async function findStageByName(client, stageName) {
  if (!stageName) return null;
  const result = await client.query(
    `SELECT id, name, sequence
     FROM production_stages
     WHERE name = $1`,
    [stageName]
  );
  return result.rows[0] || null;
}

function getWorkflowKeyByFlow(flow) {
  const flowKey = normalizeFlow(flow);
  if (flowKey === 'MTO') return 'default_mto';
  return `${flowKey.toLowerCase()}_flow`;
}

async function loadWorkflowRulesForOrder(client, order) {
  const workflowEnabled = await isFlagEnabled('workflow_engine_enabled', true);
  if (!workflowEnabled) return [];
  const workflowKey = getWorkflowKeyByFlow(order.production_flow);
  const definitionResult = await client.query(
    `SELECT id
     FROM workflow_definitions
     WHERE workflow_key = $1
       AND active = true
     LIMIT 1`,
    [workflowKey]
  );
  const workflow = definitionResult.rows[0];
  if (!workflow) return [];
  const rulesResult = await client.query(
    `SELECT rule_key, condition_json, action_json, priority, active
     FROM workflow_rules
     WHERE workflow_id = $1
       AND active = true
     ORDER BY priority ASC, id ASC`,
    [workflow.id]
  );
  return rulesResult.rows || [];
}

async function resolveNextStageTransition(client, order) {
  const defaultNext = getNextStageName(order.current_stage, order.production_flow);
  const rules = await loadWorkflowRulesForOrder(client, order);
  if (!rules.length) {
    return { nextStageName: defaultNext, source: 'static-flow', ruleKey: null };
  }
  return resolveWorkflowTransition({
    defaultNextStage: defaultNext,
    rules,
    context: {
      flow: normalizeFlow(order.production_flow),
      currentStage: order.current_stage,
      status: order.status,
      customPattern: Boolean(order.custom_pattern),
      mtoSoleDone: Boolean(order.mto_sole_done),
      orderType: order.order_type || null,
    },
  });
}

async function enforceVerificationByDueDate(client, user, order) {
  if (user.stage_name !== 'Verification') return;

  const { rows } = await client.query(
    `SELECT id, production_order_no, due_date
     FROM orders
     WHERE current_stage_id = $1
       AND status NOT IN ('COMPLETED', 'SHIPPED', 'HOLD_CUSTOMER', 'HOLD_SALES')
     ORDER BY due_date ASC, created_at ASC, id ASC
     LIMIT 1`,
    [user.stage_access]
  );

  const first = rows[0];
  if (!first) return;
  if (Number(first.id) !== Number(order.id)) {
    throw new ApiError(
      400,
      `Verification priority rule: approve ${first.production_order_no} first (earliest delivery date ${String(first.due_date).slice(0, 10)})`
    );
  }
}

async function getStageBoards(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT ps.id AS stage_id, ps.name AS stage_name, ps.sequence,
              o.id AS order_id, o.production_order_no, o.customer_name, o.due_date, o.status
       FROM production_stages ps
       LEFT JOIN orders o ON o.current_stage_id = ps.id AND o.status NOT IN ('COMPLETED','SHIPPED')
       ORDER BY ps.sequence, o.due_date`
    );

    const board = rows.reduce((acc, row) => {
      if (!acc[row.stage_name]) acc[row.stage_name] = [];
      if (row.order_id) {
        acc[row.stage_name].push({
          orderId: row.order_id,
          productionOrderNo: row.production_order_no,
          customerName: row.customer_name,
          dueDate: row.due_date,
          status: row.status,
        });
      }
      return acc;
    }, {});

    res.json({ board });
  } catch (error) {
    next(error);
  }
}

async function getFlowSummary(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         (
           SELECT COUNT(DISTINCT o2.production_order_no)::int
           FROM orders o2
           JOIN production_stages ps2 ON ps2.id = o2.current_stage_id
           WHERE ps2.name <> 'Packing'
             AND o2.status NOT IN ('COMPLETED', 'SHIPPED')
         ) AS total_in_production,
         (
           SELECT COUNT(DISTINCT o3.production_order_no)::int
           FROM orders o3
           JOIN production_stages ps3 ON ps3.id = o3.current_stage_id
           WHERE ps3.name NOT IN ('Verification', 'Model Room')
             AND o3.status NOT IN ('COMPLETED', 'SHIPPED')
         ) AS wip_orders,
         COUNT(*) FILTER (WHERE production_flow = 'BESPOKE')::int AS bespoke,
         COUNT(*) FILTER (WHERE production_flow = 'MTO')::int AS mto,
         COUNT(*) FILTER (WHERE production_flow = 'LASER')::int AS laser,
         COUNT(*) FILTER (WHERE production_flow = 'EMBROIDERY')::int AS embroidery,
         COUNT(*) FILTER (
           WHERE status NOT IN ('COMPLETED', 'SHIPPED')
             AND (
               (production_flow = 'MTO' AND (CURRENT_DATE - order_date) <= 14)
               OR (production_flow = 'BESPOKE' AND (CURRENT_DATE - order_date) <= 30)
               OR (production_flow IN ('LASER', 'EMBROIDERY') AND (CURRENT_DATE - order_date) <= 20)
             )
         )::int AS on_time_orders,
         COUNT(*) FILTER (
           WHERE status NOT IN ('COMPLETED', 'SHIPPED')
             AND (
               (production_flow = 'MTO' AND (CURRENT_DATE - order_date) > 14)
               OR (production_flow = 'BESPOKE' AND (CURRENT_DATE - order_date) > 30)
               OR (production_flow IN ('LASER', 'EMBROIDERY') AND (CURRENT_DATE - order_date) > 20)
             )
         )::int AS urgent_orders
       FROM orders`
    );
    res.json(rows[0] || {
      total_in_production: 0,
      wip_orders: 0,
      bespoke: 0,
      mto: 0,
      laser: 0,
      embroidery: 0,
      on_time_orders: 0,
      urgent_orders: 0,
    });
  } catch (error) {
    next(error);
  }
}

async function getDateWiseReport(req, res, next) {
  try {
    const to = req.query.to || new Date().toISOString().slice(0, 10);
    const fromDate = new Date(to);
    fromDate.setDate(fromDate.getDate() - 5);
    const from = req.query.from || fromDate.toISOString().slice(0, 10);

    const { rows } = await pool.query(
      `WITH dates AS (
         SELECT generate_series($1::date, $2::date, interval '1 day')::date AS report_date
       ),
       created AS (
         SELECT
           DATE(o.created_at) AS d,
           COUNT(*)::int AS created_total,
           COUNT(*) FILTER (WHERE o.production_flow = 'BESPOKE')::int AS created_bespoke,
           COUNT(*) FILTER (WHERE o.production_flow = 'MTO')::int AS created_mto,
           COUNT(*) FILTER (WHERE o.production_flow = 'LASER')::int AS created_laser,
           COUNT(*) FILTER (WHERE o.production_flow = 'EMBROIDERY')::int AS created_embroidery
         FROM orders o
         WHERE DATE(o.created_at) BETWEEN $1::date AND $2::date
         GROUP BY DATE(o.created_at)
       ),
       stage_done AS (
         SELECT
           DATE(h.scanned_at) AS d,
           COUNT(*) FILTER (WHERE h.status = 'COMPLETED')::int AS moved_stage_total,
           COUNT(*) FILTER (WHERE h.status = 'ON_HOLD' AND h.notes ILIKE 'HOLD_CUSTOMER:%')::int AS hold_customer,
           COUNT(*) FILTER (WHERE h.status = 'ON_HOLD' AND h.notes ILIKE 'HOLD_SALES:%')::int AS hold_sales,
           COUNT(*) FILTER (WHERE h.status = 'HOLD_RELEASED')::int AS hold_released,
           COUNT(*) FILTER (WHERE h.status = 'CUSTOM_PATTERN')::int AS custom_pattern_marked
         FROM order_stage_history h
         WHERE DATE(h.scanned_at) BETWEEN $1::date AND $2::date
         GROUP BY DATE(h.scanned_at)
       ),
       finalized AS (
         SELECT
           DATE(o.completed_at) AS d,
           COUNT(*)::int AS orders_completed
         FROM orders o
         WHERE o.completed_at IS NOT NULL
           AND DATE(o.completed_at) BETWEEN $1::date AND $2::date
         GROUP BY DATE(o.completed_at)
       )
       SELECT
         d.report_date,
         COALESCE(c.created_total, 0) AS created_total,
         COALESCE(c.created_bespoke, 0) AS created_bespoke,
         COALESCE(c.created_mto, 0) AS created_mto,
         COALESCE(c.created_laser, 0) AS created_laser,
         COALESCE(c.created_embroidery, 0) AS created_embroidery,
         COALESCE(s.moved_stage_total, 0) AS moved_stage_total,
         COALESCE(s.hold_customer, 0) AS hold_customer,
         COALESCE(s.hold_sales, 0) AS hold_sales,
         COALESCE(s.hold_released, 0) AS hold_released,
         COALESCE(s.custom_pattern_marked, 0) AS custom_pattern_marked,
         COALESCE(f.orders_completed, 0) AS orders_completed
       FROM dates d
       LEFT JOIN created c ON c.d = d.report_date
       LEFT JOIN stage_done s ON s.d = d.report_date
       LEFT JOIN finalized f ON f.d = d.report_date
       ORDER BY d.report_date DESC`,
      [from, to]
    );

    res.json({ from, to, rows });
  } catch (error) {
    next(error);
  }
}

function parseWindow(req, defaultDays = 29) {
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const fromDate = new Date(to);
  fromDate.setDate(fromDate.getDate() - defaultDays);
  const from = req.query.from || fromDate.toISOString().slice(0, 10);
  return { from, to };
}

async function getPerformanceReport(req, res, next) {
  try {
    const { from, to } = parseWindow(req, 29);
    const [stageMetricsResult, trendResult, lateResult] = await Promise.all([
      pool.query(
        `WITH stage_list AS (
           SELECT id, name, sequence
           FROM production_stages
         ),
         wip AS (
           SELECT current_stage_id AS stage_id, COUNT(*)::int AS wip_orders
           FROM orders
           WHERE status NOT IN ('COMPLETED', 'SHIPPED')
             AND current_stage_id IS NOT NULL
           GROUP BY current_stage_id
         ),
         throughput AS (
           SELECT h.stage_id, COUNT(*)::int AS completed_count
           FROM order_stage_history h
           WHERE h.status = 'COMPLETED'
             AND DATE(h.scanned_at) BETWEEN $1::date AND $2::date
           GROUP BY h.stage_id
         ),
         holds AS (
           SELECT h.stage_id, COUNT(*)::int AS hold_count
           FROM order_stage_history h
           WHERE h.status = 'ON_HOLD'
             AND DATE(h.scanned_at) BETWEEN $1::date AND $2::date
           GROUP BY h.stage_id
         ),
         reworks AS (
           SELECT h.stage_id, COUNT(*)::int AS rework_count
           FROM order_stage_history h
           WHERE h.status = 'MOVED_BACK'
             AND DATE(h.scanned_at) BETWEEN $1::date AND $2::date
           GROUP BY h.stage_id
         ),
         rejects AS (
           SELECT h.stage_id, COUNT(*)::int AS reject_count
           FROM order_stage_history h
           WHERE h.status = 'REJECTED'
             AND DATE(h.scanned_at) BETWEEN $1::date AND $2::date
           GROUP BY h.stage_id
         ),
         cycle AS (
           SELECT stage_id,
                  AVG(EXTRACT(EPOCH FROM (completed_at - entered_at)) / 3600.0) AS avg_cycle_hours
           FROM (
             SELECT
               h.order_id,
               h.stage_id,
               MIN(h.scanned_at) FILTER (WHERE h.status = 'IN_PROGRESS') AS entered_at,
               MAX(h.scanned_at) FILTER (WHERE h.status = 'COMPLETED') AS completed_at
             FROM order_stage_history h
             GROUP BY h.order_id, h.stage_id
           ) x
           WHERE entered_at IS NOT NULL
             AND completed_at IS NOT NULL
             AND DATE(completed_at) BETWEEN $1::date AND $2::date
           GROUP BY stage_id
         )
         SELECT
           sl.name AS stage_name,
           sl.sequence,
           COALESCE(w.wip_orders, 0) AS wip_orders,
           COALESCE(t.completed_count, 0) AS completed_count,
           COALESCE(h.hold_count, 0) AS hold_count,
           COALESCE(rw.rework_count, 0) AS rework_count,
           COALESCE(rj.reject_count, 0) AS reject_count,
           ROUND(COALESCE(c.avg_cycle_hours, 0)::numeric, 2) AS avg_cycle_hours,
           ROUND(
             CASE
               WHEN (COALESCE(t.completed_count, 0) + COALESCE(h.hold_count, 0)) = 0 THEN 100
               ELSE 100.0 * COALESCE(t.completed_count, 0)
                 / (COALESCE(t.completed_count, 0) + COALESCE(h.hold_count, 0))
             END::numeric,
             2
           ) AS availability_pct,
           ROUND(
             CASE
               WHEN (COALESCE(t.completed_count, 0) + COALESCE(rw.rework_count, 0)) = 0 THEN 100
               ELSE 100.0 * COALESCE(t.completed_count, 0)
                 / (COALESCE(t.completed_count, 0) + COALESCE(rw.rework_count, 0))
             END::numeric,
             2
           ) AS performance_pct,
           ROUND(
             CASE
               WHEN (COALESCE(t.completed_count, 0) + COALESCE(rj.reject_count, 0)) = 0 THEN 100
               ELSE 100.0 * COALESCE(t.completed_count, 0)
                 / (COALESCE(t.completed_count, 0) + COALESCE(rj.reject_count, 0))
             END::numeric,
             2
           ) AS quality_pct
         FROM stage_list sl
         LEFT JOIN wip w ON w.stage_id = sl.id
         LEFT JOIN throughput t ON t.stage_id = sl.id
         LEFT JOIN holds h ON h.stage_id = sl.id
         LEFT JOIN reworks rw ON rw.stage_id = sl.id
         LEFT JOIN rejects rj ON rj.stage_id = sl.id
         LEFT JOIN cycle c ON c.stage_id = sl.id
         ORDER BY sl.sequence`,
        [from, to]
      ),
      pool.query(
        `WITH days AS (
           SELECT generate_series($1::date, $2::date, interval '1 day')::date AS report_date
         ),
         completed AS (
           SELECT DATE(scanned_at) AS d, COUNT(*)::int AS completed_count
           FROM order_stage_history
           WHERE status = 'COMPLETED'
             AND DATE(scanned_at) BETWEEN $1::date AND $2::date
           GROUP BY DATE(scanned_at)
         ),
         holds AS (
           SELECT DATE(scanned_at) AS d, COUNT(*)::int AS hold_count
           FROM order_stage_history
           WHERE status = 'ON_HOLD'
             AND DATE(scanned_at) BETWEEN $1::date AND $2::date
           GROUP BY DATE(scanned_at)
         ),
         reworks AS (
           SELECT DATE(scanned_at) AS d, COUNT(*)::int AS rework_count
           FROM order_stage_history
           WHERE status = 'MOVED_BACK'
             AND DATE(scanned_at) BETWEEN $1::date AND $2::date
           GROUP BY DATE(scanned_at)
         )
         SELECT
           d.report_date,
           COALESCE(c.completed_count, 0) AS completed_count,
           COALESCE(h.hold_count, 0) AS hold_count,
           COALESCE(r.rework_count, 0) AS rework_count
         FROM days d
         LEFT JOIN completed c ON c.d = d.report_date
         LEFT JOIN holds h ON h.d = d.report_date
         LEFT JOIN reworks r ON r.d = d.report_date
         ORDER BY d.report_date`,
        [from, to]
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS completed_total,
           COUNT(*) FILTER (WHERE due_date < DATE(completed_at))::int AS late_completed
         FROM orders
         WHERE completed_at IS NOT NULL
           AND DATE(completed_at) BETWEEN $1::date AND $2::date`,
        [from, to]
      ),
    ]);

    const stages = (stageMetricsResult.rows || []).map((row) => {
      const availability = Number(row.availability_pct || 0);
      const performance = Number(row.performance_pct || 0);
      const quality = Number(row.quality_pct || 0);
      const oee = Number(((availability * performance * quality) / 10000).toFixed(2));
      const completed = Number(row.completed_count || 0);
      const holds = Number(row.hold_count || 0);
      const reworks = Number(row.rework_count || 0);
      return {
        ...row,
        hold_rate_pct: Number((completed + holds === 0 ? 0 : (holds * 100) / (completed + holds)).toFixed(2)),
        rework_rate_pct: Number((completed + reworks === 0 ? 0 : (reworks * 100) / (completed + reworks)).toFixed(2)),
        oee_pct: oee,
      };
    });

    const totals = stages.reduce((acc, row) => ({
      completed: acc.completed + Number(row.completed_count || 0),
      holds: acc.holds + Number(row.hold_count || 0),
      reworks: acc.reworks + Number(row.rework_count || 0),
      rejects: acc.rejects + Number(row.reject_count || 0),
    }), { completed: 0, holds: 0, reworks: 0, rejects: 0 });

    const weightedOee = stages.length
      ? Number((stages.reduce((sum, row) => sum + Number(row.oee_pct || 0), 0) / stages.length).toFixed(2))
      : 0;

    const lateData = lateResult.rows[0] || { completed_total: 0, late_completed: 0 };
    const completedTotal = Number(lateData.completed_total || 0);
    const lateCompleted = Number(lateData.late_completed || 0);

    res.json({
      from,
      to,
      summary: {
        total_completed: totals.completed,
        total_holds: totals.holds,
        total_reworks: totals.reworks,
        total_rejects: totals.rejects,
        avg_oee_pct: weightedOee,
        schedule_adherence_pct: completedTotal === 0
          ? 100
          : Number((((completedTotal - lateCompleted) * 100) / completedTotal).toFixed(2)),
      },
      stages,
      trend: trendResult.rows || [],
      derived_metrics_note: 'Availability, Performance, Quality and OEE are derived from stage-event logs for this period.',
    });
  } catch (error) {
    next(error);
  }
}

async function getAgingReport(req, res, next) {
  try {
    const asOf = req.query.asOf || new Date().toISOString().slice(0, 10);
    const [agingResult, overdueResult] = await Promise.all([
      pool.query(
        `SELECT
           ps.name AS stage_name,
           ps.sequence,
           COUNT(*)::int AS total_wip,
           COUNT(*) FILTER (WHERE ($1::date - o.order_date) BETWEEN 0 AND 7)::int AS age_0_7,
           COUNT(*) FILTER (WHERE ($1::date - o.order_date) BETWEEN 8 AND 14)::int AS age_8_14,
           COUNT(*) FILTER (WHERE ($1::date - o.order_date) BETWEEN 15 AND 30)::int AS age_15_30,
           COUNT(*) FILTER (WHERE ($1::date - o.order_date) > 30)::int AS age_gt_30,
           COUNT(*) FILTER (WHERE o.due_date < $1::date)::int AS overdue_count,
           ROUND(AVG(($1::date - o.order_date))::numeric, 2) AS avg_age_days
         FROM orders o
         JOIN production_stages ps ON ps.id = o.current_stage_id
         WHERE o.status NOT IN ('COMPLETED', 'SHIPPED')
         GROUP BY ps.id, ps.name, ps.sequence
         ORDER BY ps.sequence`,
        [asOf]
      ),
      pool.query(
        `SELECT
           o.id AS order_id,
           o.production_order_no,
           o.customer_name,
           o.production_flow,
           ps.name AS current_stage,
           o.order_date,
           o.due_date,
           GREATEST(($1::date - o.due_date), 0) AS overdue_days,
           ($1::date - o.order_date) AS age_days
         FROM orders o
         JOIN production_stages ps ON ps.id = o.current_stage_id
         WHERE o.status NOT IN ('COMPLETED', 'SHIPPED')
           AND o.due_date < $1::date
         ORDER BY overdue_days DESC, o.due_date ASC
         LIMIT 50`,
        [asOf]
      ),
    ]);

    const totals = (agingResult.rows || []).reduce((acc, row) => ({
      total_wip: acc.total_wip + Number(row.total_wip || 0),
      overdue_count: acc.overdue_count + Number(row.overdue_count || 0),
      age_gt_30: acc.age_gt_30 + Number(row.age_gt_30 || 0),
    }), { total_wip: 0, overdue_count: 0, age_gt_30: 0 });

    res.json({
      as_of: asOf,
      summary: {
        ...totals,
        overdue_pct: totals.total_wip === 0 ? 0 : Number(((totals.overdue_count * 100) / totals.total_wip).toFixed(2)),
      },
      stage_buckets: agingResult.rows || [],
      overdue_orders: overdueResult.rows || [],
    });
  } catch (error) {
    next(error);
  }
}

async function getAssignedItems(req, res, next) {
  try {
    const stageId = req.user.stage_access;
    const { rows } = await pool.query(
      `SELECT o.id AS order_id, o.production_order_no, o.customer_name, o.due_date, o.status, o.production_flow, o.mto_sole_done, o.custom_pattern, op.barcode,
              EXISTS (
                SELECT 1
                FROM order_stage_history h
                JOIN production_stages ps_from ON ps_from.id = h.stage_id
                WHERE h.order_id = o.id
                  AND h.status = 'MOVED_BACK'
                  AND ps_from.name IN ('Cutting', 'Closing')
              ) AS is_redo,
              COALESCE(rc.total_replacements, 0)::int AS total_replacements,
              COALESCE(rc.open_replacements, 0)::int AS open_replacements,
              COALESCE(rc.max_replacement_sequence, 0)::int AS max_replacement_sequence,
              rc.active_case_id AS active_replacement_case_id,
              rc.active_case_type AS active_replacement_case_type,
              rc.active_reason_code AS active_replacement_reason_code,
              rc.active_root_cause_bucket AS active_replacement_root_cause_bucket,
              rc.active_owner_name AS active_replacement_owner_name,
              rc.active_priority_level AS active_replacement_priority_level,
              rc.active_workflow_status AS active_replacement_workflow_status,
              rc.active_promised_resolution_date AS active_replacement_promised_resolution_date
       FROM orders o
       JOIN order_products op ON op.order_id = o.id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS total_replacements,
           COUNT(*) FILTER (WHERE workflow_status NOT IN ('CLOSED', 'REJECTED'))::int AS open_replacements,
           MAX(replacement_sequence)::int AS max_replacement_sequence,
           (
             ARRAY_AGG(id ORDER BY
               CASE WHEN workflow_status NOT IN ('CLOSED', 'REJECTED') THEN 0 ELSE 1 END,
               replacement_sequence DESC,
               created_at DESC
             )
           )[1] AS active_case_id,
           (
             ARRAY_AGG(case_type ORDER BY
               CASE WHEN workflow_status NOT IN ('CLOSED', 'REJECTED') THEN 0 ELSE 1 END,
               replacement_sequence DESC,
               created_at DESC
             )
           )[1] AS active_case_type,
           (
             ARRAY_AGG(reason_code ORDER BY
               CASE WHEN workflow_status NOT IN ('CLOSED', 'REJECTED') THEN 0 ELSE 1 END,
               replacement_sequence DESC,
               created_at DESC
             )
           )[1] AS active_reason_code,
           (
             ARRAY_AGG(root_cause_bucket ORDER BY
               CASE WHEN workflow_status NOT IN ('CLOSED', 'REJECTED') THEN 0 ELSE 1 END,
               replacement_sequence DESC,
               created_at DESC
             )
           )[1] AS active_root_cause_bucket,
           (
             ARRAY_AGG(owner_name ORDER BY
               CASE WHEN workflow_status NOT IN ('CLOSED', 'REJECTED') THEN 0 ELSE 1 END,
               replacement_sequence DESC,
               created_at DESC
             )
           )[1] AS active_owner_name,
           (
             ARRAY_AGG(priority_level ORDER BY
               CASE WHEN workflow_status NOT IN ('CLOSED', 'REJECTED') THEN 0 ELSE 1 END,
               replacement_sequence DESC,
               created_at DESC
             )
           )[1] AS active_priority_level,
           (
             ARRAY_AGG(workflow_status ORDER BY
               CASE WHEN workflow_status NOT IN ('CLOSED', 'REJECTED') THEN 0 ELSE 1 END,
               replacement_sequence DESC,
               created_at DESC
             )
           )[1] AS active_workflow_status,
           (
             ARRAY_AGG(promised_resolution_date ORDER BY
               CASE WHEN workflow_status NOT IN ('CLOSED', 'REJECTED') THEN 0 ELSE 1 END,
               replacement_sequence DESC,
               created_at DESC
             )
           )[1] AS active_promised_resolution_date
         FROM retail_recovery_cases
         WHERE original_order_id = o.id
       ) rc ON TRUE
       WHERE o.current_stage_id = $1 AND o.status NOT IN ('COMPLETED','SHIPPED')
       ORDER BY CASE WHEN o.status IN ('HOLD_CUSTOMER','HOLD_SALES') THEN 1 ELSE 0 END, o.due_date ASC, o.created_at ASC, o.id ASC`,
      [stageId]
    );

    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
}

async function getStageReport(req, res, next) {
  try {
    const requestedStageName = String(req.query.stageName || req.user.stage_name || '').trim();
    if (!requestedStageName) throw new ApiError(400, 'stageName is required');

    const stageResult = await pool.query(
      `SELECT id, name, sequence
       FROM production_stages
       WHERE name = $1`,
      [requestedStageName]
    );
    const stage = stageResult.rows[0];
    if (!stage) throw new ApiError(404, 'Stage not found');

    if (
      req.user.role === 'PRODUCTION_SUPERVISOR'
      && Number(req.user.stage_access) !== Number(stage.id)
    ) {
      throw new ApiError(403, 'Supervisors can only view their assigned stage');
    }

    const requestedSlaHours = req.query.slaHours ? Number(req.query.slaHours) : null;
    const targetDate = req.query.targetDate || new Date().toISOString().slice(0, 10);
    const [summaryRes, itemsRes, trendRes, blockersRes, operatorRes, shiftRes, dependencyRes, auditRes, chainRes, targetHistoryRes, weeklyTargetsRes, varianceRes, weeklyCompletedRes, pendingApprovalsRes, targetSettingsRes, notificationsRes] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total_in_stage,
           COUNT(*) FILTER (WHERE o.due_date < CURRENT_DATE)::int AS late_pairs,
           COUNT(*) FILTER (WHERE o.status IN ('HOLD_CUSTOMER', 'HOLD_SALES'))::int AS hold_pairs,
           (
             SELECT COUNT(*)::int
             FROM order_stage_history h
             WHERE h.stage_id = $1
               AND h.status = 'REJECTED'
               AND DATE(h.scanned_at) >= CURRENT_DATE - INTERVAL '30 days'
           ) AS reject_count_30d,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1
             FROM order_stage_history h
             WHERE h.order_id = o.id
               AND h.stage_id = $1
               AND h.status = 'MOVED_BACK'
           ))::int AS redo_pairs,
           COUNT(*) FILTER (WHERE o.due_date = CURRENT_DATE)::int AS due_today,
           ROUND(AVG((CURRENT_DATE - o.order_date))::numeric, 2) AS avg_age_days,
           (
             SELECT ROUND(AVG(EXTRACT(EPOCH FROM (completed_at - entered_at)) / 3600.0)::numeric, 2)
             FROM (
               SELECT
                 h.order_id,
                 MIN(h.scanned_at) FILTER (WHERE h.status = 'IN_PROGRESS') AS entered_at,
                 MAX(h.scanned_at) FILTER (WHERE h.status = 'COMPLETED') AS completed_at
               FROM order_stage_history h
               WHERE h.stage_id = $1
                 AND DATE(h.scanned_at) >= CURRENT_DATE - INTERVAL '30 days'
               GROUP BY h.order_id
             ) x
             WHERE entered_at IS NOT NULL
               AND completed_at IS NOT NULL
           ) AS avg_processing_hours_30d
         FROM orders o
         WHERE o.current_stage_id = $1
           AND o.status NOT IN ('COMPLETED', 'SHIPPED')`,
        [stage.id]
      ),
      pool.query(
        `SELECT
           o.id AS order_id,
           o.production_order_no,
           o.customer_name,
           o.due_date,
           o.status,
           o.production_flow,
           o.mto_sole_done,
           op.barcode,
           EXISTS (
             SELECT 1
             FROM order_stage_history h
             WHERE h.order_id = o.id
               AND h.stage_id = $1
               AND h.status = 'MOVED_BACK'
           ) AS is_redo,
           (CURRENT_DATE - o.order_date) AS age_days,
           (o.due_date - CURRENT_DATE) AS due_in_days,
           ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(se.stage_entered_at, o.created_at))) / 3600.0, 2) AS stage_age_hours
         FROM orders o
         JOIN order_products op ON op.order_id = o.id
         LEFT JOIN LATERAL (
           SELECT MAX(h.scanned_at) FILTER (WHERE h.status = 'IN_PROGRESS') AS stage_entered_at
           FROM order_stage_history h
           WHERE h.order_id = o.id
             AND h.stage_id = $1
         ) se ON TRUE
         WHERE o.current_stage_id = $1
           AND o.status NOT IN ('COMPLETED', 'SHIPPED')
         ORDER BY
           CASE WHEN o.due_date < CURRENT_DATE THEN 0 ELSE 1 END,
           o.due_date ASC,
           o.created_at ASC,
           o.id ASC`,
        [stage.id]
      ),
      pool.query(
        `WITH days AS (
           SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, interval '1 day')::date AS report_date
         ),
         entered AS (
           SELECT DATE(scanned_at) AS d, COUNT(*)::int AS entered_count
           FROM order_stage_history
           WHERE stage_id = $1
             AND status = 'IN_PROGRESS'
             AND DATE(scanned_at) BETWEEN CURRENT_DATE - INTERVAL '6 days' AND CURRENT_DATE
           GROUP BY DATE(scanned_at)
         ),
         completed AS (
           SELECT DATE(scanned_at) AS d, COUNT(*)::int AS completed_count
           FROM order_stage_history
           WHERE stage_id = $1
             AND status = 'COMPLETED'
             AND DATE(scanned_at) BETWEEN CURRENT_DATE - INTERVAL '6 days' AND CURRENT_DATE
           GROUP BY DATE(scanned_at)
         ),
         holds AS (
           SELECT DATE(scanned_at) AS d, COUNT(*)::int AS hold_count
           FROM order_stage_history
           WHERE stage_id = $1
             AND status = 'ON_HOLD'
             AND DATE(scanned_at) BETWEEN CURRENT_DATE - INTERVAL '6 days' AND CURRENT_DATE
           GROUP BY DATE(scanned_at)
         ),
         moved AS (
           SELECT DATE(scanned_at) AS d, COUNT(*)::int AS move_back_count
           FROM order_stage_history
           WHERE stage_id = $1
             AND status = 'MOVED_BACK'
             AND DATE(scanned_at) BETWEEN CURRENT_DATE - INTERVAL '6 days' AND CURRENT_DATE
           GROUP BY DATE(scanned_at)
         )
         SELECT
           d.report_date,
           COALESCE(e.entered_count, 0) AS entered_count,
           COALESCE(c.completed_count, 0) AS completed_count,
           COALESCE(h.hold_count, 0) AS hold_count,
           COALESCE(m.move_back_count, 0) AS move_back_count
         FROM days d
         LEFT JOIN entered e ON e.d = d.report_date
         LEFT JOIN completed c ON c.d = d.report_date
         LEFT JOIN holds h ON h.d = d.report_date
         LEFT JOIN moved m ON m.d = d.report_date
         ORDER BY d.report_date`,
        [stage.id]
      ),
      pool.query(
        `SELECT
           status,
           CASE
             WHEN status = 'ON_HOLD' THEN COALESCE(NULLIF(TRIM(SPLIT_PART(notes, ':', 2)), ''), 'Hold applied')
             ELSE COALESCE(NULLIF(TRIM(notes), ''), status)
           END AS blocker_reason,
           COUNT(*)::int AS event_count
         FROM order_stage_history
         WHERE stage_id = $1
           AND status IN ('ON_HOLD', 'MOVED_BACK', 'REJECTED')
           AND DATE(scanned_at) >= CURRENT_DATE - INTERVAL '30 days'
         GROUP BY status, blocker_reason
         ORDER BY event_count DESC, blocker_reason ASC
         LIMIT 8`,
        [stage.id]
      ),
      pool.query(
        `SELECT
           COALESCE(u.full_name, 'System') AS operator_name,
           COUNT(*)::int AS event_count,
           COUNT(*) FILTER (WHERE h.status = 'COMPLETED')::int AS completed_count,
           COUNT(*) FILTER (WHERE h.status = 'IN_PROGRESS')::int AS entered_count,
           COUNT(*) FILTER (WHERE h.status = 'ON_HOLD')::int AS hold_count,
           COUNT(*) FILTER (WHERE h.status = 'MOVED_BACK')::int AS move_back_count
         FROM order_stage_history h
         LEFT JOIN users u ON u.id = h.scanned_by
         WHERE h.stage_id = $1
           AND DATE(h.scanned_at) >= CURRENT_DATE - INTERVAL '14 days'
         GROUP BY COALESCE(u.full_name, 'System')
         ORDER BY event_count DESC, operator_name ASC
         LIMIT 8`,
        [stage.id]
      ),
      pool.query(
        `WITH shifts AS (
           SELECT $3::text AS shift_name, $4::int AS start_hour, $5::int AS end_hour
         ),
         targets AS (
           SELECT shift_name, target_pairs
           FROM production_stage_targets
           WHERE stage_id = $1
             AND target_date = $2::date
         )
         SELECT
           s.shift_name,
           COALESCE(t.target_pairs, 0)::int AS target_completed,
           $2::date AS target_date,
           COUNT(*) FILTER (
             WHERE h.status = 'COMPLETED'
               AND (
                 (s.start_hour <= s.end_hour AND EXTRACT(HOUR FROM h.scanned_at) BETWEEN s.start_hour AND s.end_hour)
                 OR (s.start_hour > s.end_hour AND (EXTRACT(HOUR FROM h.scanned_at) >= s.start_hour OR EXTRACT(HOUR FROM h.scanned_at) <= s.end_hour))
               )
           )::int AS completed_count,
           COUNT(*) FILTER (
             WHERE h.status = 'ON_HOLD'
               AND (
                 (s.start_hour <= s.end_hour AND EXTRACT(HOUR FROM h.scanned_at) BETWEEN s.start_hour AND s.end_hour)
                 OR (s.start_hour > s.end_hour AND (EXTRACT(HOUR FROM h.scanned_at) >= s.start_hour OR EXTRACT(HOUR FROM h.scanned_at) <= s.end_hour))
               )
           )::int AS hold_count,
           COUNT(*) FILTER (
             WHERE h.status = 'MOVED_BACK'
               AND (
                 (s.start_hour <= s.end_hour AND EXTRACT(HOUR FROM h.scanned_at) BETWEEN s.start_hour AND s.end_hour)
                 OR (s.start_hour > s.end_hour AND (EXTRACT(HOUR FROM h.scanned_at) >= s.start_hour OR EXTRACT(HOUR FROM h.scanned_at) <= s.end_hour))
               )
           )::int AS move_back_count
         FROM shifts s
         LEFT JOIN targets t ON t.shift_name = s.shift_name
         LEFT JOIN order_stage_history h
           ON h.stage_id = $1
          AND DATE(h.scanned_at) = $2::date
         GROUP BY s.shift_name, s.start_hour, t.target_pairs
         ORDER BY s.start_hour`,
        [stage.id, targetDate, FACTORY_SHIFT_NAME, FACTORY_SHIFT_START_HOUR, FACTORY_SHIFT_END_HOUR]
      ),
      pool.query(
        `SELECT
           CASE
             WHEN ps.sequence = $2 - 1 THEN 'upstream'
             WHEN ps.sequence = $2 + 1 THEN 'downstream'
             ELSE 'adjacent'
           END AS dependency_type,
           ps.name AS stage_name,
           COUNT(o.id)::int AS active_orders,
           COUNT(*) FILTER (WHERE o.due_date < CURRENT_DATE)::int AS late_pairs
         FROM production_stages ps
         LEFT JOIN orders o
           ON o.current_stage_id = ps.id
          AND o.status NOT IN ('COMPLETED', 'SHIPPED')
         WHERE ps.sequence IN ($2 - 1, $2 + 1)
         GROUP BY ps.sequence, ps.name
         ORDER BY ps.sequence`,
        [stage.id, stage.sequence]
      ),
      pool.query(
        `SELECT
           h.scanned_at,
           h.status,
           COALESCE(u.full_name, 'System') AS actor_name,
           COALESCE(NULLIF(TRIM(h.notes), ''), h.status) AS notes,
           o.production_order_no
         FROM order_stage_history h
         JOIN orders o ON o.id = h.order_id
         LEFT JOIN users u ON u.id = h.scanned_by
         WHERE h.stage_id = $1
         ORDER BY h.scanned_at DESC
         LIMIT 20`,
        [stage.id]
      ),
      pool.query(
        `WITH stage_counts AS (
           SELECT
             ps.name AS stage_name,
             ps.sequence,
             COUNT(o.id)::int AS active_orders,
             COUNT(*) FILTER (WHERE o.due_date < CURRENT_DATE)::int AS late_pairs
           FROM production_stages ps
           LEFT JOIN orders o
             ON o.current_stage_id = ps.id
            AND o.status NOT IN ('COMPLETED', 'SHIPPED')
           GROUP BY ps.name, ps.sequence
         )
         SELECT stage_name, sequence, active_orders, late_pairs
         FROM stage_counts
         ORDER BY sequence`,
        []
      ),
      pool.query(
        `SELECT
           a.target_date,
           a.shift_name,
           a.previous_target_pairs,
           a.new_target_pairs,
           a.changed_at,
           COALESCE(u.full_name, 'System') AS actor_name
         FROM production_stage_target_audit a
         LEFT JOIN users u ON u.id = a.changed_by
         WHERE a.stage_id = $1
         ORDER BY a.changed_at DESC
         LIMIT 24`,
        [stage.id]
      ),
      pool.query(
        `SELECT
           target_date,
           shift_name,
           target_pairs
         FROM production_stage_targets
         WHERE stage_id = $1
           AND target_date BETWEEN date_trunc('week', $2::date)::date AND (date_trunc('week', $2::date)::date + INTERVAL '6 days')::date
         ORDER BY target_date, shift_name`,
        [stage.id, targetDate]
      ),
      pool.query(
        `SELECT
           v.target_date,
           v.shift_name,
           v.reason_code,
           v.notes,
           v.updated_at,
           COALESCE(u.full_name, 'System') AS actor_name
         FROM production_stage_target_variances v
         LEFT JOIN users u ON u.id = v.recorded_by
         WHERE v.stage_id = $1
           AND v.target_date = $2::date
         ORDER BY v.shift_name`,
        [stage.id, targetDate]
      ),
      pool.query(
        `WITH days AS (
           SELECT generate_series(date_trunc('week', $2::date)::date, (date_trunc('week', $2::date)::date + INTERVAL '6 days')::date, interval '1 day')::date AS target_date
         ),
         shifts AS (
           SELECT $3::text AS shift_name, $4::int AS start_hour, $5::int AS end_hour
         )
         SELECT
           d.target_date,
           s.shift_name,
           COUNT(*) FILTER (
             WHERE h.status = 'COMPLETED'
               AND (
                 (s.start_hour <= s.end_hour AND EXTRACT(HOUR FROM h.scanned_at) BETWEEN s.start_hour AND s.end_hour)
                 OR (s.start_hour > s.end_hour AND (EXTRACT(HOUR FROM h.scanned_at) >= s.start_hour OR EXTRACT(HOUR FROM h.scanned_at) <= s.end_hour))
               )
           )::int AS completed_count
         FROM days d
         CROSS JOIN shifts s
         LEFT JOIN order_stage_history h
           ON h.stage_id = $1
          AND DATE(h.scanned_at) = d.target_date
         GROUP BY d.target_date, s.shift_name, s.start_hour
         ORDER BY d.target_date, s.start_hour`,
        [stage.id, targetDate, FACTORY_SHIFT_NAME, FACTORY_SHIFT_START_HOUR, FACTORY_SHIFT_END_HOUR]
      ),
      pool.query(
        `SELECT
           a.id,
           a.target_date,
           a.shift_name,
           a.existing_target_pairs,
           a.requested_target_pairs,
           a.status,
           a.decision_notes,
           a.created_at,
           COALESCE(r.full_name, 'System') AS requested_by_name
         FROM production_stage_target_approvals a
         LEFT JOIN users r ON r.id = a.requested_by
         WHERE a.stage_id = $1
           AND a.status = 'PENDING'
         ORDER BY a.target_date, a.shift_name`,
        [stage.id]
      ),
      pool.query(
        `SELECT approval_absolute_delta, approval_percent_delta
         FROM production_stage_target_settings
         WHERE stage_id = $1`,
        [stage.id]
      ),
      pool.query(
        `SELECT id, notification_type, title, message, is_read, created_at, assigned_owner, escalation_level, workflow_status
         FROM production_stage_notifications
         WHERE stage_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [stage.id]
      ),
    ]);

    const currentItems = itemsRes.rows || [];
    const operators = operatorRes.rows || [];
    const slaTargetHours = Number(requestedSlaHours || STAGE_SLA_HOURS[stage.name] || 24);
    const slaBreachCount = currentItems.filter((item) => Number(item.stage_age_hours || 0) > slaTargetHours).length;
    const slaRiskCount = currentItems.filter((item) => Number(item.stage_age_hours || 0) > (slaTargetHours * 0.8)).length;
    const flowCounts = currentItems.reduce((acc, item) => {
      const flow = String(item.production_flow || 'OTHER').toUpperCase();
      acc[flow] = (acc[flow] || 0) + 1;
      return acc;
    }, {});
    const activeOperatorCount = Math.max(operators.length, 1);
    const flowNames = Object.keys(flowCounts).sort((a, b) => flowCounts[b] - flowCounts[a]);
    const allocationPlan = flowNames.map((flow) => {
      const wip = Number(flowCounts[flow] || 0);
      const recommendedOperators = Math.max(1, Math.round((wip / Math.max(currentItems.length, 1)) * activeOperatorCount));
      let action = 'Maintain';
      if (wip >= Math.max(4, Math.ceil(currentItems.length * 0.35))) action = 'Add operator cover';
      if (currentItems.filter((item) => item.production_flow === flow && item.due_in_days < 0).length > 0) action = 'Prioritize overdue work';
      return {
        lane_name: flow,
        wip_orders: wip,
        recommended_operators: recommendedOperators,
        action,
      };
    });

    const downstreamPressure = (dependencyRes.rows || [])
      .filter((row) => row.dependency_type === 'downstream')
      .reduce((sum, row) => sum + Number(row.active_orders || 0) + (Number(row.late_pairs || 0) * 2), 0);
    const averageEventsPerOperator = operators.length
      ? operators.reduce((sum, row) => sum + Number(row.event_count || 0), 0) / operators.length
      : 0;

    const dispatchQueue = currentItems
      .map((item) => {
        const latePenalty = Number(item.due_in_days) < 0 ? Math.abs(Number(item.due_in_days || 0)) * 10 : 0;
        const redoPenalty = item.is_redo ? 18 : 0;
        const holdPenalty = ['HOLD_CUSTOMER', 'HOLD_SALES'].includes(item.status) ? 12 : 0;
        const dueTodayBonus = Number(item.due_in_days) === 0 ? 8 : 0;
        const agePenalty = Number(item.age_days || 0);
        const slaPenalty = Number(item.stage_age_hours || 0) > slaTargetHours ? 14 : 0;
        const downstreamPenalty = downstreamPressure > Math.max(currentItems.length, 1) ? 6 : 0;
        const capacityPenalty = averageEventsPerOperator > 18 ? 5 : 0;
        const priorityScore = latePenalty + redoPenalty + holdPenalty + dueTodayBonus + agePenalty + slaPenalty + downstreamPenalty + capacityPenalty;
        let recommendation = 'Process in normal sequence';
        if (latePenalty > 0) recommendation = 'Expedite immediately';
        else if (redoPenalty > 0) recommendation = 'Contain redo before new work';
        else if (holdPenalty > 0) recommendation = 'Resolve hold before release';
        else if (dueTodayBonus > 0) recommendation = 'Run in current shift';
        else if (slaPenalty > 0) recommendation = 'Escalate SLA breach';
        else if (downstreamPenalty > 0) recommendation = 'Throttle release to downstream';
        return {
          ...item,
          priority_score: priorityScore,
          recommendation,
        };
      })
      .sort((a, b) => b.priority_score - a.priority_score || Number(a.due_in_days || 9999) - Number(b.due_in_days || 9999))
      .slice(0, 12);

    const exceptionQueue = currentItems
      .filter((item) => item.is_redo || ['HOLD_CUSTOMER', 'HOLD_SALES'].includes(item.status) || Number(item.stage_age_hours || 0) > slaTargetHours)
      .map((item) => ({
        ...item,
        exception_type: item.is_redo
          ? 'Redo'
          : ['HOLD_CUSTOMER', 'HOLD_SALES'].includes(item.status)
            ? item.status
            : 'SLA Breach',
        owner: item.is_redo ? 'Production' : ['HOLD_CUSTOMER', 'HOLD_SALES'].includes(item.status) ? 'Customer Service / Sales' : 'Stage Manager',
      }))
      .sort((a, b) => Number(b.stage_age_hours || 0) - Number(a.stage_age_hours || 0))
      .slice(0, 12);

    const targetSettings = targetSettingsRes.rows[0] || {
      approval_absolute_delta: TARGET_APPROVAL_ABSOLUTE_DELTA,
      approval_percent_delta: TARGET_APPROVAL_PERCENT_DELTA,
    };
    const notifications = (notificationsRes.rows || []).map((row) => {
      const ageHours = Math.max(0, Math.round((Date.now() - new Date(row.created_at).getTime()) / 3600000));
      const slaHours = getNotificationSlaHours(row.notification_type, row.escalation_level);
      const overdue = row.workflow_status !== 'CLOSED' && ageHours > slaHours;
      return {
        ...row,
        age_hours: ageHours,
        sla_hours: slaHours,
        overdue,
      };
    });
    const chainRows = chainRes.rows || [];
    const weeklyTargets = weeklyTargetsRes.rows || [];
    const weeklyCompleted = weeklyCompletedRes.rows || [];
    const weeklyTargetMap = weeklyTargets.reduce((acc, row) => {
      acc[`${dateOnly(row.target_date)}__${row.shift_name}`] = Number(row.target_pairs || 0);
      return acc;
    }, {});
    const weeklyCompletedMap = weeklyCompleted.reduce((acc, row) => {
      acc[`${dateOnly(row.target_date)}__${row.shift_name}`] = Number(row.completed_count || 0);
      return acc;
    }, {});
    const weeklyDates = [...new Set(weeklyTargets.map((row) => dateOnly(row.target_date)).concat(weeklyCompleted.map((row) => dateOnly(row.target_date))))].sort();
    let carryForwardPairs = 0;
    const weeklyAttainment = weeklyDates.map((day) => {
      const plannedPairs = Number(weeklyTargetMap[`${day}__${FACTORY_SHIFT_NAME}`] || 0);
      const actualPairs = Number(weeklyCompletedMap[`${day}__${FACTORY_SHIFT_NAME}`] || 0);
      const adjustedTargetPairs = plannedPairs + carryForwardPairs;
      const gapPairs = actualPairs - adjustedTargetPairs;
      const shortfallPairs = Math.max(adjustedTargetPairs - actualPairs, 0);
      const row = {
        target_date: day,
        planned_pairs: plannedPairs,
        actual_pairs: actualPairs,
        carry_forward_pairs: carryForwardPairs,
        adjusted_target_pairs: adjustedTargetPairs,
        gap_pairs: gapPairs,
      };
      carryForwardPairs = shortfallPairs;
      return row;
    });
    const flowKeys = [...new Set(currentItems.map((item) => normalizeFlow(item.production_flow)))];
    const dependencyChain = flowKeys.map((flowKey) => {
      const stages = FLOW_STAGES[flowKey] || [];
      const currentIndex = stages.indexOf(stage.name);
      return {
        flow: flowKey,
        stages: stages.map((stageLabel, index) => {
          const found = chainRows.find((row) => row.stage_name === stageLabel) || {};
          return {
            stage_name: stageLabel,
            active_orders: Number(found.active_orders || 0),
            late_pairs: Number(found.late_pairs || 0),
            relation: index === currentIndex ? 'current' : (index < currentIndex ? 'upstream' : 'downstream'),
          };
        }),
      };
    });

    res.json({
      stage,
      summary: summaryRes.rows[0] || {
        total_in_stage: 0,
        late_pairs: 0,
        hold_pairs: 0,
        reject_count_30d: 0,
        redo_pairs: 0,
        due_today: 0,
        avg_age_days: 0,
        avg_processing_hours_30d: 0,
      },
      sla_alerts: {
        target_hours: slaTargetHours,
        breach_count: slaBreachCount,
        at_risk_count: slaRiskCount,
      },
      target_date: targetDate,
      current_items: currentItems,
      trend: trendRes.rows || [],
      blockers: blockersRes.rows || [],
      operators,
      shift_board: shiftRes.rows || [],
      dependency_view: dependencyRes.rows || [],
      allocation_plan: allocationPlan,
      dispatch_queue: dispatchQueue,
      exception_queue: exceptionQueue,
      action_audit: auditRes.rows || [],
      dependency_chain: dependencyChain,
      target_history: targetHistoryRes.rows || [],
      weekly_targets: weeklyTargets,
      weekly_attainment: weeklyAttainment,
      variance_reasons: varianceRes.rows || [],
      pending_target_approvals: pendingApprovalsRes.rows || [],
      target_settings: targetSettings,
      notifications,
      target_suggestion: weeklyAttainment.length
        ? (() => {
            const lastThree = weeklyAttainment.slice(-3);
            const recentAvgActual = Math.round(
              lastThree.reduce((sum, row) => sum + Number(row.actual_pairs || 0), 0) / Math.max(lastThree.length, 1)
            );
            const latestCarry = Number(weeklyAttainment[weeklyAttainment.length - 1]?.carry_forward_pairs || 0);
            const latestShortfall = Math.max(
              Number(weeklyAttainment[weeklyAttainment.length - 1]?.adjusted_target_pairs || 0)
                - Number(weeklyAttainment[weeklyAttainment.length - 1]?.actual_pairs || 0),
              0
            );
            const carryForwardPairs = Math.max(latestCarry, latestShortfall);
            const activeWip = Number(summaryRes.rows[0]?.total_in_stage || 0);
            const operatorCount = Math.max(Number(operators.length || 0), 1);
            const avgProcessingHours = Number(summaryRes.rows[0]?.avg_processing_hours_30d || 0);
            const staffingCapacityPairs = avgProcessingHours > 0
              ? Math.round((operatorCount * (FACTORY_SHIFT_END_HOUR - FACTORY_SHIFT_START_HOUR)) / avgProcessingHours)
              : recentAvgActual;
            const qualityPenalty = Math.min(Number(summaryRes.rows[0]?.reject_count_30d || 0), 10);
            const holdPenalty = Math.min(Number(summaryRes.rows[0]?.hold_pairs || 0), 10);
            const capacityBound = Math.max(0, staffingCapacityPairs - qualityPenalty - holdPenalty);
            const demandSignal = Math.min(activeWip, recentAvgActual + carryForwardPairs);
            const suggestedPairs = Math.max(0, Math.min(capacityBound || demandSignal, Math.max(demandSignal, recentAvgActual)));
            return {
              suggested_pairs: suggestedPairs,
              recent_avg_actual: recentAvgActual,
              carry_forward_pairs: carryForwardPairs,
              staffing_capacity_pairs: staffingCapacityPairs,
              active_wip_pairs: activeWip,
              basis: `Recent average ${recentAvgActual}, carry-forward ${carryForwardPairs}, staffing capacity ${staffingCapacityPairs}, WIP ${activeWip}`,
            };
          })()
        : {
            suggested_pairs: 0,
            recent_avg_actual: 0,
            carry_forward_pairs: 0,
            staffing_capacity_pairs: 0,
            active_wip_pairs: 0,
            basis: 'No attainment history available yet',
          },
    });
  } catch (error) {
    next(error);
  }
}

async function upsertStageTargets(req, res, next) {
  try {
    const { stageName, targetDate, shifts } = req.body || {};
    const effectiveStageName = stageName || req.user.stage_name;
    if (!effectiveStageName) throw new ApiError(400, 'Stage name is required');
    if (!targetDate) throw new ApiError(400, 'Target date is required');
    if (!Array.isArray(shifts) || shifts.length === 0) {
      throw new ApiError(400, 'At least one shift target is required');
    }

    const validShiftNames = new Set([FACTORY_SHIFT_NAME]);
    const stage = await findStageByName(pool, effectiveStageName);
    if (!stage) throw new ApiError(404, 'Stage not found');

    const approvalMessages = [];
    const targetSettings = await getStageTargetSettings(pool, stage.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const shift of shifts) {
        const shiftName = String(shift.shift_name || '').trim();
        const targetPairs = Number(shift.target_pairs || 0);
        if (!validShiftNames.has(shiftName)) {
          throw new ApiError(400, `Invalid shift ${shiftName}`);
        }
        if (!Number.isFinite(targetPairs) || targetPairs < 0) {
          throw new ApiError(400, `Invalid target for ${shiftName}`);
        }
        const existingTarget = await client.query(
          `SELECT target_pairs
           FROM production_stage_targets
           WHERE stage_id = $1
             AND target_date = $2::date
             AND shift_name = $3`,
          [stage.id, targetDate, shiftName]
        );
        const previousTargetPairs = existingTarget.rows[0] ? Number(existingTarget.rows[0].target_pairs) : null;

        if (req.user.role !== 'SUPER_USER' && targetChangeNeedsApproval(previousTargetPairs, targetPairs, targetSettings)) {
          await queueStageTargetApproval(client, stage.id, targetDate, shiftName, previousTargetPairs, targetPairs, req.user.id, 'Threshold breach');
          await createStageNotification(client, stage.id, 'TARGET_APPROVAL_REQUIRED', 'Target change needs approval', `${shiftName} target for ${targetDate} requested from ${previousTargetPairs ?? 0} to ${Math.trunc(targetPairs)}.`, req.user.id);
          approvalMessages.push(`${shiftName} submitted for approval`);
        } else {
          await applyStageTarget(client, stage.id, targetDate, shiftName, targetPairs, req.user.id);
          await client.query(
            `UPDATE production_stage_target_approvals
             SET status = 'APPROVED', approved_by = $4, decision_notes = 'Applied directly', updated_at = NOW()
             WHERE stage_id = $1
               AND target_date = $2::date
               AND shift_name = $3`,
            [stage.id, targetDate, shiftName, req.user.id]
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({
      message: approvalMessages.length ? `Some targets require approval: ${approvalMessages.join(', ')}` : 'Stage targets saved',
      stageName: effectiveStageName,
      targetDate,
    });
  } catch (error) {
    next(error);
  }
}

async function upsertWeeklyStageTargets(req, res, next) {
  try {
    const { stageName, weekStartDate, days } = req.body || {};
    if (!weekStartDate) throw new ApiError(400, 'weekStartDate is required');
    if (!Array.isArray(days) || days.length === 0) throw new ApiError(400, 'days are required');

    const effectiveStageName = stageName || req.user.stage_name;
    const stage = await findStageByName(pool, effectiveStageName);
    if (!stage) throw new ApiError(404, 'Stage not found');

    const approvalCount = { total: 0 };
    const targetSettings = await getStageTargetSettings(pool, stage.id);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const day of days) {
        const dayTargetDate = String(day.targetDate || '').slice(0, 10);
        const dayShifts = Array.isArray(day.shifts) ? day.shifts : [];
        if (!dayTargetDate) throw new ApiError(400, 'targetDate is required for each day');

        for (const shift of dayShifts) {
          const shiftName = String(shift.shift_name || '').trim();
          const targetPairs = Number(shift.target_pairs || 0);
          if (!Number.isFinite(targetPairs) || targetPairs < 0) {
            throw new ApiError(400, `Invalid target for ${shiftName}`);
          }
          const existingTarget = await client.query(
            `SELECT target_pairs
             FROM production_stage_targets
             WHERE stage_id = $1
               AND target_date = $2::date
               AND shift_name = $3`,
            [stage.id, dayTargetDate, shiftName]
          );
          const previousTargetPairs = existingTarget.rows[0] ? Number(existingTarget.rows[0].target_pairs) : null;

          if (req.user.role !== 'SUPER_USER' && targetChangeNeedsApproval(previousTargetPairs, targetPairs, targetSettings)) {
            await queueStageTargetApproval(client, stage.id, dayTargetDate, shiftName, previousTargetPairs, targetPairs, req.user.id, 'Weekly plan threshold breach');
            await createStageNotification(client, stage.id, 'TARGET_APPROVAL_REQUIRED', 'Weekly target change needs approval', `${shiftName} target for ${dayTargetDate} requested from ${previousTargetPairs ?? 0} to ${Math.trunc(targetPairs)}.`, req.user.id);
            approvalCount.total += 1;
          } else {
            await applyStageTarget(client, stage.id, dayTargetDate, shiftName, targetPairs, req.user.id);
            await client.query(
              `UPDATE production_stage_target_approvals
               SET status = 'APPROVED', approved_by = $4, decision_notes = 'Applied directly', updated_at = NOW()
               WHERE stage_id = $1
                 AND target_date = $2::date
                 AND shift_name = $3`,
              [stage.id, dayTargetDate, shiftName, req.user.id]
            );
          }
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    res.json({
      message: approvalCount.total ? `${approvalCount.total} weekly target changes sent for approval` : 'Weekly targets saved',
      stageName: effectiveStageName,
      weekStartDate,
    });
  } catch (error) {
    next(error);
  }
}

async function decideStageTargetApproval(req, res, next) {
  const client = await pool.connect();
  try {
    const { approvalId, decision, notes } = req.body || {};
    if (!approvalId) throw new ApiError(400, 'approvalId is required');
    if (!['APPROVED', 'REJECTED'].includes(String(decision || '').toUpperCase())) {
      throw new ApiError(400, 'decision must be APPROVED or REJECTED');
    }
    await client.query('BEGIN');

    const approvalRes = await client.query(
      `SELECT *
       FROM production_stage_target_approvals
       WHERE id = $1`,
      [approvalId]
    );
    const approval = approvalRes.rows[0];
    if (!approval) throw new ApiError(404, 'Approval request not found');

    const finalDecision = String(decision).toUpperCase();
    if (finalDecision === 'APPROVED') {
      await applyStageTarget(client, approval.stage_id, approval.target_date, approval.shift_name, approval.requested_target_pairs, req.user.id);
      await createStageNotification(client, approval.stage_id, 'TARGET_APPROVED', 'Target change approved', `${approval.shift_name} target for ${String(approval.target_date).slice(0, 10)} approved at ${approval.requested_target_pairs}.`, req.user.id);
    } else {
      await createStageNotification(client, approval.stage_id, 'TARGET_REJECTED', 'Target change rejected', `${approval.shift_name} target for ${String(approval.target_date).slice(0, 10)} was rejected.`, req.user.id);
    }

    await client.query(
      `UPDATE production_stage_target_approvals
       SET status = $2,
           approved_by = $3,
           decision_notes = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [approvalId, finalDecision, req.user.id, String(notes || '').trim() || null]
    );

    await client.query('COMMIT');
    res.json({ message: `Approval ${finalDecision.toLowerCase()}`, approvalId });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function upsertStageTargetSettings(req, res, next) {
  try {
    const { stageName, approvalAbsoluteDelta, approvalPercentDelta } = req.body || {};
    const effectiveStageName = stageName || req.user.stage_name;
    if (!effectiveStageName) throw new ApiError(400, 'Stage name is required');
    const stage = await findStageByName(pool, effectiveStageName);
    if (!stage) throw new ApiError(404, 'Stage not found');

    await pool.query(
      `INSERT INTO production_stage_target_settings (stage_id, approval_absolute_delta, approval_percent_delta, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (stage_id)
       DO UPDATE SET approval_absolute_delta = EXCLUDED.approval_absolute_delta,
                     approval_percent_delta = EXCLUDED.approval_percent_delta,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = NOW()`,
      [
        stage.id,
        Math.max(0, Number(approvalAbsoluteDelta ?? TARGET_APPROVAL_ABSOLUTE_DELTA)),
        Math.max(0, Number(approvalPercentDelta ?? TARGET_APPROVAL_PERCENT_DELTA)),
        req.user.id,
      ]
    );

    res.json({ message: 'Target approval settings saved', stageName: effectiveStageName });
  } catch (error) {
    next(error);
  }
}

async function markStageNotificationsRead(req, res, next) {
  try {
    const { stageName, notificationId, markAll } = req.body || {};
    const effectiveStageName = stageName || req.user.stage_name;
    if (!effectiveStageName) throw new ApiError(400, 'Stage name is required');
    const stage = await findStageByName(pool, effectiveStageName);
    if (!stage) throw new ApiError(404, 'Stage not found');

    if (markAll) {
      await pool.query(
        `UPDATE production_stage_notifications
         SET is_read = TRUE
         WHERE stage_id = $1`,
        [stage.id]
      );
      return res.json({ message: 'All notifications marked read' });
    }

    if (!notificationId) throw new ApiError(400, 'notificationId is required');
    await pool.query(
      `UPDATE production_stage_notifications
       SET is_read = TRUE
       WHERE id = $1
         AND stage_id = $2`,
      [notificationId, stage.id]
    );

    res.json({ message: 'Notification marked read', notificationId });
  } catch (error) {
    next(error);
  }
}

async function updateStageNotificationWorkflow(req, res, next) {
  try {
    const { stageName, notificationId, assignedOwner, escalationLevel, workflowStatus } = req.body || {};
    const effectiveStageName = stageName || req.user.stage_name;
    if (!effectiveStageName) throw new ApiError(400, 'Stage name is required');
    if (!notificationId) throw new ApiError(400, 'notificationId is required');
    const stage = await findStageByName(pool, effectiveStageName);
    if (!stage) throw new ApiError(404, 'Stage not found');

    await pool.query(
      `UPDATE production_stage_notifications
       SET assigned_owner = COALESCE($3, assigned_owner),
           escalation_level = COALESCE($4, escalation_level),
           workflow_status = COALESCE($5, workflow_status)
       WHERE id = $1
         AND stage_id = $2`,
      [
        notificationId,
        stage.id,
        assignedOwner ? String(assignedOwner).trim() : null,
        Number.isFinite(Number(escalationLevel)) ? Number(escalationLevel) : null,
        workflowStatus ? String(workflowStatus).trim().toUpperCase() : null,
      ]
    );

    res.json({ message: 'Notification workflow updated', notificationId });
  } catch (error) {
    next(error);
  }
}

async function getControlTowerReport(req, res, next) {
  try {
    const targetDate = req.query.targetDate || new Date().toISOString().slice(0, 10);
    const { rows } = await pool.query(
      `WITH shifts AS (
         SELECT $2::text AS shift_name, $3::int AS start_hour, $4::int AS end_hour
       ),
       targets AS (
         SELECT stage_id, target_pairs
         FROM production_stage_targets
         WHERE target_date = $1::date
           AND shift_name = $2
       ),
       completed AS (
         SELECT h.stage_id, COUNT(*)::int AS actual_pairs
         FROM order_stage_history h
         JOIN shifts s ON TRUE
         WHERE DATE(h.scanned_at) = $1::date
           AND h.status = 'COMPLETED'
           AND (
             (s.start_hour <= s.end_hour AND EXTRACT(HOUR FROM h.scanned_at) BETWEEN s.start_hour AND s.end_hour)
             OR (s.start_hour > s.end_hour AND (EXTRACT(HOUR FROM h.scanned_at) >= s.start_hour OR EXTRACT(HOUR FROM h.scanned_at) <= s.end_hour))
           )
         GROUP BY h.stage_id
       ),
       wip AS (
         SELECT current_stage_id AS stage_id,
                COUNT(*)::int AS active_orders,
                COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)::int AS late_pairs,
                COUNT(*) FILTER (WHERE status IN ('HOLD_CUSTOMER', 'HOLD_SALES'))::int AS hold_pairs
         FROM orders
         WHERE status NOT IN ('COMPLETED', 'SHIPPED')
           AND current_stage_id IS NOT NULL
         GROUP BY current_stage_id
       ),
       approvals AS (
         SELECT stage_id, COUNT(*)::int AS pending_approvals
         FROM production_stage_target_approvals
         WHERE status = 'PENDING'
         GROUP BY stage_id
       ),
       notifications AS (
         SELECT stage_id,
                COUNT(*) FILTER (WHERE is_read = FALSE)::int AS unread_notifications,
                MAX(escalation_level)::int AS max_escalation_level
         FROM production_stage_notifications
         GROUP BY stage_id
       )
       SELECT
         ps.name AS stage_name,
         ps.sequence,
         COALESCE(t.target_pairs, 0) AS target_pairs,
         COALESCE(c.actual_pairs, 0) AS actual_pairs,
         COALESCE(w.active_orders, 0) AS active_orders,
         COALESCE(w.late_pairs, 0) AS late_pairs,
         COALESCE(w.hold_pairs, 0) AS hold_pairs,
         COALESCE(a.pending_approvals, 0) AS pending_approvals,
         COALESCE(n.unread_notifications, 0) AS unread_notifications,
         COALESCE(n.max_escalation_level, 0) AS max_escalation_level
       FROM production_stages ps
       LEFT JOIN targets t ON t.stage_id = ps.id
       LEFT JOIN completed c ON c.stage_id = ps.id
       LEFT JOIN wip w ON w.stage_id = ps.id
       LEFT JOIN approvals a ON a.stage_id = ps.id
       LEFT JOIN notifications n ON n.stage_id = ps.id
       ORDER BY ps.sequence`,
      [targetDate, FACTORY_SHIFT_NAME, FACTORY_SHIFT_START_HOUR, FACTORY_SHIFT_END_HOUR]
    );

    const stage_rows = rows.map((row) => {
      const gapPairs = Number(row.actual_pairs || 0) - Number(row.target_pairs || 0);
      let recommendation = 'Monitor';
      if (Number(row.pending_approvals || 0) > 0) recommendation = 'Resolve pending target approvals';
      else if (Number(row.unread_notifications || 0) > 0 || Number(row.max_escalation_level || 0) > 0) recommendation = 'Review escalated notifications';
      else if (gapPairs < 0) recommendation = 'Target at risk, intervene';
      else if (Number(row.late_pairs || 0) > 0) recommendation = 'Expedite late orders';
      return {
        ...row,
        gap_pairs: gapPairs,
        recommendation,
      };
    });

    const summary = stage_rows.reduce((acc, row) => ({
      total_target_pairs: acc.total_target_pairs + Number(row.target_pairs || 0),
      total_actual_pairs: acc.total_actual_pairs + Number(row.actual_pairs || 0),
      total_active_orders: acc.total_active_orders + Number(row.active_orders || 0),
      total_late_pairs: acc.total_late_pairs + Number(row.late_pairs || 0),
      pending_approvals: acc.pending_approvals + Number(row.pending_approvals || 0),
      unread_notifications: acc.unread_notifications + Number(row.unread_notifications || 0),
    }), {
      total_target_pairs: 0,
      total_actual_pairs: 0,
      total_active_orders: 0,
      total_late_pairs: 0,
      pending_approvals: 0,
      unread_notifications: 0,
    });

    res.json({ target_date: targetDate, shift_name: FACTORY_SHIFT_NAME, summary, stage_rows });
  } catch (error) {
    next(error);
  }
}

async function upsertStageVarianceReason(req, res, next) {
  try {
    const { stageName, targetDate, shiftName, reasonCode, notes } = req.body || {};
    const effectiveStageName = stageName || req.user.stage_name;
    if (!effectiveStageName) throw new ApiError(400, 'Stage name is required');
    if (!targetDate) throw new ApiError(400, 'Target date is required');
    if (!shiftName) throw new ApiError(400, 'shiftName is required');
    if (!reasonCode) throw new ApiError(400, 'reasonCode is required');

    const stage = await findStageByName(pool, effectiveStageName);
    if (!stage) throw new ApiError(404, 'Stage not found');

    await pool.query(
      `INSERT INTO production_stage_target_variances (stage_id, target_date, shift_name, reason_code, notes, recorded_by, updated_at)
       VALUES ($1, $2::date, $3, $4, $5, $6, NOW())
       ON CONFLICT (stage_id, target_date, shift_name)
       DO UPDATE SET reason_code = EXCLUDED.reason_code, notes = EXCLUDED.notes, recorded_by = EXCLUDED.recorded_by, updated_at = NOW()`,
      [stage.id, targetDate, shiftName, String(reasonCode).trim(), String(notes || '').trim(), req.user.id]
    );

    res.json({ message: 'Variance reason saved', stageName: effectiveStageName, targetDate, shiftName });
  } catch (error) {
    next(error);
  }
}

async function getStageSummary(req, res, next) {
  try {
    const stageId = req.user.stage_access;
    const { rows } = await pool.query(
      `SELECT
         (SELECT COUNT(*)::int
          FROM orders o
          WHERE o.current_stage_id = $1
            AND o.status NOT IN ('COMPLETED','SHIPPED')) AS total_in_stage,
         (SELECT COUNT(*)::int
          FROM order_stage_history h
          WHERE h.stage_id = $1
            AND h.status = 'COMPLETED'
            AND DATE(h.scanned_at) = CURRENT_DATE) AS completed_today,
         (SELECT COUNT(*)::int
          FROM order_stage_history h
          WHERE h.stage_id = $1
            AND h.status = 'CUSTOM_PATTERN'
            AND DATE(h.scanned_at) = CURRENT_DATE) AS custom_pattern_marked_today,
         (SELECT COUNT(*)::int
          FROM order_stage_history h
          WHERE h.stage_id = $1
            AND h.status = 'CUSTOM_PATTERN') AS custom_pattern_marked_total`,
      [stageId]
    );

    res.json(rows[0] || {
      total_in_stage: 0,
      completed_today: 0,
      custom_pattern_marked_today: 0,
      custom_pattern_marked_total: 0,
    });
  } catch (error) {
    next(error);
  }
}

async function getCompletedTodayItems(req, res, next) {
  try {
    const stageId = req.user.stage_access;
    const { rows } = await pool.query(
      `SELECT DISTINCT o.id AS order_id, o.production_order_no, o.due_date
       FROM order_stage_history h
       JOIN orders o ON o.id = h.order_id
       WHERE h.stage_id = $1
         AND h.status = 'COMPLETED'
         AND DATE(h.scanned_at) = CURRENT_DATE
       ORDER BY o.production_order_no`,
      [stageId]
    );
    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
}

async function getCustomPatternItems(req, res, next) {
  try {
    const stageId = req.user.stage_access;
    const scope = String(req.query.scope || 'all').toLowerCase();
    const whereDate = scope === 'today' ? 'AND DATE(h.scanned_at) = CURRENT_DATE' : '';

    const { rows } = await pool.query(
      `SELECT DISTINCT o.id AS order_id, o.production_order_no, o.due_date
       FROM order_stage_history h
       JOIN orders o ON o.id = h.order_id
       WHERE h.stage_id = $1
         AND h.status = 'CUSTOM_PATTERN'
         ${whereDate}
       ORDER BY o.production_order_no`,
      [stageId]
    );

    res.json({ items: rows });
  } catch (error) {
    next(error);
  }
}

async function scanStage(req, res, next) {
  const client = await pool.connect();
  try {
    const { barcode } = req.body;
    if (!barcode) throw new ApiError(400, 'barcode is required');
    const normalizedScan = String(barcode).replace(/[\u0000-\u001F\u007F]/g, '').trim();
    if (!normalizedScan) throw new ApiError(400, 'barcode is required');

    await client.query('BEGIN');

    const orderQuery = await client.query(
      `SELECT o.*, op.barcode, ps.name AS current_stage
       FROM orders o
       JOIN order_products op ON op.order_id = o.id
       JOIN production_stages ps ON ps.id = o.current_stage_id
       WHERE LOWER(TRIM(op.barcode)) = LOWER($1)
          OR LOWER(TRIM(o.production_order_no)) = LOWER($1)`,
      [normalizedScan]
    );

    const order = orderQuery.rows[0];
    if (!order) throw new ApiError(404, 'Barcode not found');

    if (Number(order.current_stage_id) !== Number(req.user.stage_access)) {
      throw new ApiError(403, `Order is currently at stage ${order.current_stage}`);
    }
    if (['HOLD_CUSTOMER', 'HOLD_SALES'].includes(order.status)) {
      throw new ApiError(400, 'Order is on hold. Release hold before moving to next stage.');
    }
    await enforceVerificationByDueDate(client, req.user, order);

    const transition = await resolveNextStageTransition(client, order);
    const nextStageName = transition.nextStageName;
    const nextStage = await findStageByName(client, nextStageName);
    if (nextStageName && !nextStage) {
      throw new ApiError(400, `Workflow resolved unknown next stage: ${nextStageName}`);
    }

    if (order.production_flow === 'MTO' && order.current_stage === 'Closing' && !order.mto_sole_done) {
      throw new ApiError(400, 'For MTO flow, Sole must be completed before moving from Closing to Lasting');
    }

    let nextStageId = null;
    let status = 'COMPLETED';
    let completedAt = new Date();

    if (nextStage) {
      nextStageId = nextStage.id;
      status = 'IN_PRODUCTION';
      completedAt = null;
    }

    const nextMtoSoleDone = order.current_stage === 'Model Room' && order.production_flow === 'MTO'
      ? false
      : order.mto_sole_done;

    const updateOrder = await client.query(
      `UPDATE orders
       SET current_stage_id = $1, status = $2, completed_at = $3, mto_sole_done = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [nextStageId, status, completedAt, nextMtoSoleDone, order.id]
    );

    const noteParts = [`Scanned by ${req.user.full_name}`];
    if (transition.source === 'workflow-rule' && transition.ruleKey) {
      noteParts.push(`Workflow rule ${transition.ruleKey} applied`);
    }
    if (order.current_stage === 'Model Room' && order.production_flow === 'MTO') {
      noteParts.push('MTO parallel started: Cutting + Sole');
    }
    const stageNote = noteParts.join('. ');
    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'COMPLETED', $3, $4)`,
      [order.id, req.user.stage_access, req.user.id, stageNote]
    );
    if (nextStageId) {
      await client.query(
        `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
         VALUES ($1, $2, 'IN_PROGRESS', $3, $4)`,
        [order.id, nextStageId, req.user.id, `Order entered ${nextStage?.name}`]
      );
    }

    await client.query('COMMIT');

    const payload = {
      order: updateOrder.rows[0],
      fromStageId: req.user.stage_access,
      toStageId: nextStageId,
      fromStageName: order.current_stage,
      toStageName: nextStage?.name || 'Completed',
      transitionSource: transition.source,
      transitionRuleKey: transition.ruleKey,
      scannedBy: req.user.id,
      scannedAt: new Date().toISOString(),
    };

    req.io?.emit('stage:updated', payload);
    res.json(payload);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function advanceByOrderId(req, res, next) {
  const client = await pool.connect();
  try {
    const { orderId } = req.body;
    if (!orderId) throw new ApiError(400, 'orderId is required');

    await client.query('BEGIN');

    const orderQuery = await client.query(
      `SELECT o.*, op.barcode, ps.name AS current_stage
       FROM orders o
       JOIN order_products op ON op.order_id = o.id
       JOIN production_stages ps ON ps.id = o.current_stage_id
       WHERE o.id = $1`,
      [orderId]
    );

    const order = orderQuery.rows[0];
    if (!order) throw new ApiError(404, 'Order not found');
    const actingStageId = ['PRODUCTION_MANAGER', 'SUPER_USER'].includes(req.user.role)
      ? Number(order.current_stage_id)
      : Number(req.user.stage_access);
    if (Number(order.current_stage_id) !== actingStageId) {
      throw new ApiError(403, `Order is currently at stage ${order.current_stage}`);
    }
    if (['HOLD_CUSTOMER', 'HOLD_SALES'].includes(order.status)) {
      throw new ApiError(400, 'Order is on hold. Release hold before moving to next stage.');
    }
    await enforceVerificationByDueDate(client, req.user, order);

    const transition = await resolveNextStageTransition(client, order);
    const nextStageName = transition.nextStageName;
    const nextStage = await findStageByName(client, nextStageName);
    if (nextStageName && !nextStage) {
      throw new ApiError(400, `Workflow resolved unknown next stage: ${nextStageName}`);
    }

    if (order.production_flow === 'MTO' && order.current_stage === 'Closing' && !order.mto_sole_done) {
      throw new ApiError(400, 'For MTO flow, Sole must be completed before moving from Closing to Lasting');
    }

    let nextStageId = null;
    let status = 'COMPLETED';
    let completedAt = new Date();

    if (nextStage) {
      nextStageId = nextStage.id;
      status = 'IN_PRODUCTION';
      completedAt = null;
    }

    const nextMtoSoleDone = order.current_stage === 'Model Room' && order.production_flow === 'MTO'
      ? false
      : order.mto_sole_done;

    const updateOrder = await client.query(
      `UPDATE orders
       SET current_stage_id = $1, status = $2, completed_at = $3, mto_sole_done = $4, updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [nextStageId, status, completedAt, nextMtoSoleDone, order.id]
    );

    const noteParts = [`Advanced by ${req.user.full_name}`];
    if (transition.source === 'workflow-rule' && transition.ruleKey) {
      noteParts.push(`Workflow rule ${transition.ruleKey} applied`);
    }
    if (order.current_stage === 'Model Room' && order.production_flow === 'MTO') {
      noteParts.push('MTO parallel started: Cutting + Sole');
    }
    const stageNote = noteParts.join('. ');
    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'COMPLETED', $3, $4)`,
      [order.id, actingStageId, req.user.id, stageNote]
    );
    if (nextStageId) {
      await client.query(
        `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
         VALUES ($1, $2, 'IN_PROGRESS', $3, $4)`,
        [order.id, nextStageId, req.user.id, `Order entered ${nextStage?.name}`]
      );
    }

    await client.query('COMMIT');

    const payload = {
      order: updateOrder.rows[0],
      fromStageId: actingStageId,
      toStageId: nextStageId,
      fromStageName: order.current_stage,
      toStageName: nextStage?.name || 'Completed',
      transitionSource: transition.source,
      transitionRuleKey: transition.ruleKey,
      scannedBy: req.user.id,
      scannedAt: new Date().toISOString(),
    };

    req.io?.emit('stage:updated', payload);
    res.json(payload);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function markMtoSoleDone(req, res, next) {
  const client = await pool.connect();
  try {
    const { orderId } = req.body;
    if (!orderId) throw new ApiError(400, 'orderId is required');

    await client.query('BEGIN');

    const orderQuery = await client.query(
      `SELECT o.*, ps.name AS current_stage
       FROM orders o
       JOIN production_stages ps ON ps.id = o.current_stage_id
       WHERE o.id = $1`,
      [orderId]
    );
    const order = orderQuery.rows[0];
    if (!order) throw new ApiError(404, 'Order not found');
    if (order.production_flow !== 'MTO') throw new ApiError(400, 'Sole completion mark is only for MTO flow');
    if (order.current_stage !== 'Closing') throw new ApiError(400, 'MTO sole completion can only be marked while order is in Closing');

    if (req.user.stage_name !== 'Closing' && !['PRODUCTION_MANAGER', 'SUPER_USER'].includes(req.user.role)) {
      throw new ApiError(403, 'Only Closing stage supervisor can mark MTO sole completion');
    }

    const updated = await client.query(
      `UPDATE orders
       SET mto_sole_done = true, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [order.id]
    );

    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'MTO_SOLE_COMPLETED', $3, $4)`,
      [order.id, order.current_stage_id, req.user.id, `MTO sole completed by ${req.user.full_name}`]
    );

    await client.query('COMMIT');

    const payload = {
      order: updated.rows[0],
      action: 'MTO_SOLE_COMPLETED',
      stageName: order.current_stage,
      markedBy: req.user.id,
      markedAt: new Date().toISOString(),
    };
    req.io?.emit('stage:updated', payload);
    res.json(payload);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function holdVerificationOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const { orderId, holdType, reason } = req.body;
    if (!orderId) throw new ApiError(400, 'orderId is required');
    const type = String(holdType || '').toUpperCase();
    if (!['CUSTOMER', 'SALES'].includes(type)) throw new ApiError(400, 'holdType must be CUSTOMER or SALES');
    if (!reason || !String(reason).trim()) throw new ApiError(400, 'Hold reason is required');
    if (req.user.stage_name !== 'Verification' && !['PRODUCTION_MANAGER', 'SUPER_USER'].includes(req.user.role)) {
      throw new ApiError(403, 'Only Verification can place hold');
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, current_stage_id
       FROM orders
       WHERE id = $1`,
      [orderId]
    );
    const order = rows[0];
    if (!order) throw new ApiError(404, 'Order not found');
    if (!['PRODUCTION_MANAGER', 'SUPER_USER'].includes(req.user.role) && Number(order.current_stage_id) !== Number(req.user.stage_access)) {
      throw new ApiError(403, 'Order is not in your stage');
    }

    const nextStatus = type === 'CUSTOMER' ? 'HOLD_CUSTOMER' : 'HOLD_SALES';
    const updated = await client.query(
      `UPDATE orders
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [nextStatus, order.id]
    );

    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'ON_HOLD', $3, $4)`,
      [order.id, order.current_stage_id, req.user.id, `${nextStatus}: ${String(reason).trim()}`]
    );

    await client.query('COMMIT');
    const payload = { order: updated.rows[0], action: 'HOLD_SET', holdType: nextStatus };
    req.io?.emit('stage:updated', payload);
    res.json(payload);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function releaseVerificationHold(req, res, next) {
  const client = await pool.connect();
  try {
    const { orderId } = req.body;
    if (!orderId) throw new ApiError(400, 'orderId is required');
    if (req.user.stage_name !== 'Verification' && !['PRODUCTION_MANAGER', 'SUPER_USER'].includes(req.user.role)) {
      throw new ApiError(403, 'Only Verification can release hold');
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, current_stage_id, status
       FROM orders
       WHERE id = $1`,
      [orderId]
    );
    const order = rows[0];
    if (!order) throw new ApiError(404, 'Order not found');
    if (!['HOLD_CUSTOMER', 'HOLD_SALES'].includes(order.status)) {
      throw new ApiError(400, 'Order is not on hold');
    }
    if (!['PRODUCTION_MANAGER', 'SUPER_USER'].includes(req.user.role) && Number(order.current_stage_id) !== Number(req.user.stage_access)) {
      throw new ApiError(403, 'Order is not in your stage');
    }

    const updated = await client.query(
      `UPDATE orders
       SET status = 'PENDING', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [order.id]
    );

    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'HOLD_RELEASED', $3, $4)`,
      [order.id, order.current_stage_id, req.user.id, 'Hold released by verification']
    );

    await client.query('COMMIT');
    const payload = { order: updated.rows[0], action: 'HOLD_RELEASED' };
    req.io?.emit('stage:updated', payload);
    res.json(payload);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function markCustomPattern(req, res, next) {
  const client = await pool.connect();
  try {
    const { orderId } = req.body;
    if (!orderId) throw new ApiError(400, 'orderId is required');
    if (req.user.stage_name !== 'Model Room' && !['PRODUCTION_MANAGER', 'SUPER_USER'].includes(req.user.role)) {
      throw new ApiError(403, 'Only Model Room can mark custom pattern');
    }

    await client.query('BEGIN');
    const orderQuery = await client.query(
      `SELECT o.id, o.current_stage_id, o.custom_pattern, ps.name AS current_stage
       FROM orders o
       JOIN production_stages ps ON ps.id = o.current_stage_id
       WHERE o.id = $1`,
      [orderId]
    );
    const order = orderQuery.rows[0];
    if (!order) throw new ApiError(404, 'Order not found');
    if (!['PRODUCTION_MANAGER', 'SUPER_USER'].includes(req.user.role) && Number(order.current_stage_id) !== Number(req.user.stage_access)) {
      throw new ApiError(403, 'Order is not in your stage');
    }
    if (order.custom_pattern) {
      throw new ApiError(400, 'Custom Pattern is already marked for this order');
    }

    const updated = await client.query(
      `UPDATE orders
       SET custom_pattern = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [true, order.id]
    );

    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'CUSTOM_PATTERN', $3, $4)`,
      [order.id, order.current_stage_id, req.user.id, `Custom Pattern ENABLED by ${req.user.full_name}`]
    );

    await client.query('COMMIT');
    const payload = { order: updated.rows[0], action: 'CUSTOM_PATTERN_UPDATED', customPattern: true };
    req.io?.emit('stage:updated', payload);
    res.json(payload);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function rejectByBarcode(req, res, next) {
  const client = await pool.connect();
  try {
    const { barcode, reason } = req.body;
    if (!barcode) throw new ApiError(400, 'barcode is required');
    if (!reason || !String(reason).trim()) throw new ApiError(400, 'reason is required');
    const normalizedScan = String(barcode).replace(/[\u0000-\u001F\u007F]/g, '').trim();
    if (!normalizedScan) throw new ApiError(400, 'barcode is required');
    if (req.user.role !== 'PRODUCTION_MANAGER') {
      throw new ApiError(403, 'Only production manager can add rejections');
    }

    await client.query('BEGIN');

    const orderQuery = await client.query(
      `SELECT o.*, op.barcode, ps.name AS current_stage
       FROM orders o
       JOIN order_products op ON op.order_id = o.id
       JOIN production_stages ps ON ps.id = o.current_stage_id
       WHERE LOWER(TRIM(op.barcode)) = LOWER($1)
          OR LOWER(TRIM(o.production_order_no)) = LOWER($1)`,
      [normalizedScan]
    );

    const order = orderQuery.rows[0];
    if (!order) throw new ApiError(404, 'Barcode not found');

    const updated = await client.query(
      `UPDATE orders
       SET status = 'REJECTED', updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [order.id]
    );

    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'REJECTED', $3, $4)`,
      [order.id, order.current_stage_id, req.user.id, String(reason).trim()]
    );

    await client.query('COMMIT');

    const payload = {
      order: updated.rows[0],
      rejectedBy: req.user.id,
      rejectedAt: new Date().toISOString(),
      reason: String(reason).trim(),
    };
    req.io?.emit('stage:rejected', payload);
    req.io?.emit('stage:updated', payload);
    res.json(payload);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function moveBackByOrderId(req, res, next) {
  const client = await pool.connect();
  try {
    const { orderId, reason } = req.body;
    if (!orderId) throw new ApiError(400, 'orderId is required');
    if (!reason || !String(reason).trim()) throw new ApiError(400, 'reason is required for move back');

    await client.query('BEGIN');

    const orderQuery = await client.query(
      `SELECT o.*, op.barcode, ps.name AS current_stage
       FROM orders o
       JOIN order_products op ON op.order_id = o.id
       JOIN production_stages ps ON ps.id = o.current_stage_id
       WHERE o.id = $1`,
      [orderId]
    );

    const order = orderQuery.rows[0];
    if (!order) throw new ApiError(404, 'Order not found');
    const actingStageId = ['PRODUCTION_MANAGER', 'SUPER_USER'].includes(req.user.role)
      ? Number(order.current_stage_id)
      : Number(req.user.stage_access);
    if (Number(order.current_stage_id) !== actingStageId) {
      throw new ApiError(403, `Order is currently at stage ${order.current_stage}`);
    }
    if (!['Cutting', 'Closing'].includes(order.current_stage)) {
      throw new ApiError(403, 'Move back is only allowed in Cutting or Closing stage');
    }

    const previousStageName = getPreviousStageName(order.current_stage, order.production_flow);
    const previous = await findStageByName(client, previousStageName);
    if (!previous) throw new ApiError(400, 'No previous stage available for this order');

    const updated = await client.query(
      `UPDATE orders
       SET current_stage_id = $1, status = 'IN_PRODUCTION', completed_at = NULL, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [previous.id, order.id]
    );

    const note = `Moved back from ${order.current_stage} to ${previous.name}. Reason: ${String(reason).trim()}`;
    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'MOVED_BACK', $3, $4)`,
      [order.id, actingStageId, req.user.id, note]
    );
    await client.query(
      `INSERT INTO order_stage_history (order_id, stage_id, status, scanned_by, notes)
       VALUES ($1, $2, 'IN_PROGRESS', $3, $4)`,
      [order.id, previous.id, req.user.id, `Order re-entered ${previous.name}`]
    );

    await client.query('COMMIT');

    const payload = {
      order: updated.rows[0],
      fromStageId: actingStageId,
      toStageId: previous.id,
      fromStageName: order.current_stage,
      toStageName: previous.name,
      scannedBy: req.user.id,
      scannedAt: new Date().toISOString(),
      reason: String(reason).trim(),
      action: 'MOVE_BACK',
    };
    req.io?.emit('stage:updated', payload);
    res.json(payload);
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  getStageBoards,
  getFlowSummary,
  getDateWiseReport,
  getPerformanceReport,
  getAgingReport,
  getControlTowerReport,
  getStageReport,
  getAssignedItems,
  getStageSummary,
  getCompletedTodayItems,
  getCustomPatternItems,
  scanStage,
  rejectByBarcode,
  advanceByOrderId,
  moveBackByOrderId,
  markMtoSoleDone,
  holdVerificationOrder,
  releaseVerificationHold,
  markCustomPattern,
  upsertStageTargets,
  upsertWeeklyStageTargets,
  decideStageTargetApproval,
  upsertStageTargetSettings,
  markStageNotificationsRead,
  updateStageNotificationWorkflow,
  upsertStageVarianceReason,
};
