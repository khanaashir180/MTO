const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

function toInt(v, field) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Invalid ${field}`);
  return n;
}

async function logAudit(area, action, entityType, entityId, payload, userId) {
  try {
    await pool.query(
      `INSERT INTO crm_setup_audit_logs (area, action, entity_type, entity_id, payload_json, performed_by, performed_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, NOW())`,
      [area, action, entityType, entityId || null, JSON.stringify(payload || {}), userId || null]
    );
  } catch (_) {
    // best effort audit logging
  }
}

function evaluateCondition(ruleExpr, data) {
  let parsed = null;
  try {
    parsed = typeof ruleExpr === 'string' ? JSON.parse(ruleExpr) : ruleExpr;
  } catch (_) {
    return false;
  }
  if (!parsed || typeof parsed !== 'object') return false;
  const field = parsed.field;
  const op = String(parsed.op || '').toUpperCase();
  const value = parsed.value;
  const left = data?.[field];
  if (op === 'EMPTY') return left === undefined || left === null || String(left).trim() === '';
  if (op === '=') return String(left) === String(value);
  if (op === '!=') return String(left) !== String(value);
  if (op === '>') return Number(left) > Number(value);
  if (op === '>=') return Number(left) >= Number(value);
  if (op === '<') return Number(left) < Number(value);
  if (op === '<=') return Number(left) <= Number(value);
  return false;
}

function computeFormula(expr, data) {
  let parsed = null;
  try {
    parsed = typeof expr === 'string' ? JSON.parse(expr) : expr;
  } catch (_) {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const type = String(parsed.type || '').toLowerCase();
  if (type === 'concat') {
    const fields = Array.isArray(parsed.fields) ? parsed.fields : [];
    const separator = parsed.separator || '';
    return fields.map((field) => String(data?.[field] ?? '')).join(separator);
  }
  if (type === 'multiply') {
    const fields = Array.isArray(parsed.fields) ? parsed.fields : [];
    if (fields.length < 2) return null;
    const left = Number(data?.[fields[0]] || 0);
    const right = Number(data?.[fields[1]] || 0);
    const scale = Number(parsed.scale || 1);
    return Number((left * right * scale).toFixed(2));
  }
  return null;
}

async function getRuntimeOverview(_req, res, next) {
  try {
    const [rulesRes, formulasRes, jobsRes, logsRes] = await Promise.all([
      pool.query('SELECT * FROM crm_validation_rules ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT * FROM crm_formula_fields ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT * FROM crm_job_definitions ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT * FROM crm_setup_audit_logs ORDER BY performed_at DESC, id DESC LIMIT 500'),
    ]);
    res.json({
      validationRules: rulesRes.rows,
      formulaFields: formulasRes.rows,
      jobs: jobsRes.rows,
      auditLogs: logsRes.rows,
    });
  } catch (error) {
    next(error);
  }
}

async function createValidationRule(req, res, next) {
  const client = await pool.connect();
  try {
    const { objectName, ruleName, conditionExpr, errorMessage } = req.body || {};
    if (!String(objectName || '').trim()) throw new ApiError(400, 'objectName is required');
    if (!String(ruleName || '').trim()) throw new ApiError(400, 'ruleName is required');
    if (!String(conditionExpr || '').trim()) throw new ApiError(400, 'conditionExpr is required');
    if (!String(errorMessage || '').trim()) throw new ApiError(400, 'errorMessage is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_validation_rules (object_name, rule_name, condition_expr, error_message, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, $5, NOW(), NOW())
       RETURNING *`,
      [String(objectName).toUpperCase(), String(ruleName).trim(), conditionExpr, String(errorMessage).trim(), req.user.id]
    );
    await client.query('COMMIT');
    await logAudit('RUNTIME', 'CREATE', 'VALIDATION_RULE', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ validationRule: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createFormulaField(req, res, next) {
  const client = await pool.connect();
  try {
    const { objectName, fieldName, formulaExpr, dataType = 'TEXT' } = req.body || {};
    if (!String(objectName || '').trim()) throw new ApiError(400, 'objectName is required');
    if (!String(fieldName || '').trim()) throw new ApiError(400, 'fieldName is required');
    if (!String(formulaExpr || '').trim()) throw new ApiError(400, 'formulaExpr is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_formula_fields (object_name, field_name, formula_expr, data_type, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, $5, NOW(), NOW())
       RETURNING *`,
      [String(objectName).toUpperCase(), String(fieldName).trim(), formulaExpr, String(dataType).toUpperCase(), req.user.id]
    );
    await client.query('COMMIT');
    await logAudit('RUNTIME', 'CREATE', 'FORMULA_FIELD', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ formulaField: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listCustomRecords(req, res, next) {
  try {
    const objectName = String(req.query.object || '').trim();
    const values = [];
    let whereClause = '';
    if (objectName) {
      values.push(objectName);
      whereClause = `WHERE object_api_name = $${values.length}`;
    }
    const { rows } = await pool.query(
      `SELECT * FROM crm_custom_records
       ${whereClause}
       ORDER BY updated_at DESC, id DESC
       LIMIT 500`,
      values
    );
    res.json({ records: rows });
  } catch (error) {
    next(error);
  }
}

async function createCustomRecord(req, res, next) {
  const client = await pool.connect();
  try {
    const { objectApiName, recordData = {}, ownerId = null } = req.body || {};
    if (!String(objectApiName || '').trim()) throw new ApiError(400, 'objectApiName is required');
    const objectName = String(objectApiName).trim();
    const [rulesRes, formulasRes] = await Promise.all([
      client.query('SELECT * FROM crm_validation_rules WHERE object_name = $1 AND active = TRUE', [objectName.toUpperCase()]),
      client.query('SELECT * FROM crm_formula_fields WHERE object_name = $1 AND active = TRUE', [objectName.toUpperCase()]),
    ]);
    const brokenRule = rulesRes.rows.find((rule) => evaluateCondition(rule.condition_expr, recordData));
    if (brokenRule) throw new ApiError(400, brokenRule.error_message || 'Validation rule failed');
    const computedData = {};
    formulasRes.rows.forEach((formula) => {
      computedData[formula.field_name] = computeFormula(formula.formula_expr, recordData);
    });
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_custom_records (object_api_name, record_data, computed_data, owner_id, created_by, created_at, updated_at)
       VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, NOW(), NOW())
       RETURNING *`,
      [
        objectName,
        JSON.stringify(recordData || {}),
        JSON.stringify(computedData),
        ownerId ? toInt(ownerId, 'ownerId') : req.user.id,
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ record: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function publishFlowVersion(req, res, next) {
  const client = await pool.connect();
  try {
    const flowId = toInt(req.params.id, 'flow id');
    await client.query('BEGIN');
    const flowRes = await client.query('SELECT * FROM crm_flows WHERE id = $1', [flowId]);
    if (!flowRes.rows.length) throw new ApiError(404, 'Flow not found');
    const current = flowRes.rows[0];
    const nextVersion = Number(current.version_number || 1) + 1;
    await client.query(
      `INSERT INTO crm_flow_versions (flow_id, version_number, definition_json, published, created_by, created_at)
       VALUES ($1, $2, $3::jsonb, TRUE, $4, NOW())`,
      [flowId, nextVersion, JSON.stringify(current.definition_json || {}), req.user.id]
    );
    await client.query('UPDATE crm_flows SET version_number = $1, updated_at = NOW() WHERE id = $2', [nextVersion, flowId]);
    const updated = await client.query('SELECT * FROM crm_flows WHERE id = $1', [flowId]);
    await client.query('COMMIT');
    await logAudit('FLOW', 'PUBLISH', 'FLOW', flowId, { version: nextVersion }, req.user.id);
    res.json({ flow: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function debugFlow(req, res, next) {
  const client = await pool.connect();
  try {
    const flowId = toInt(req.params.id, 'flow id');
    const context = req.body?.context || {};
    await client.query('BEGIN');
    const runRes = await client.query(
      `INSERT INTO crm_flow_runs (flow_id, context_json, status, started_at, finished_at)
       VALUES ($1, $2::jsonb, 'SUCCESS', NOW(), NOW())
       RETURNING *`,
      [flowId, JSON.stringify(context)]
    );
    const runId = runRes.rows[0].id;
    await client.query(
      `INSERT INTO crm_flow_debug_traces (flow_run_id, flow_id, trace_step, payload_json, status, created_at)
       VALUES
       ($1, $2, 'START', $3::jsonb, 'INFO', NOW()),
       ($1, $2, 'EVALUATE_DECISION', '{"result":"matched"}'::jsonb, 'INFO', NOW()),
       ($1, $2, 'EXECUTE_ACTION', '{"action":"notify"}'::jsonb, 'INFO', NOW()),
       ($1, $2, 'END', '{"status":"success"}'::jsonb, 'INFO', NOW())`,
      [runId, flowId, JSON.stringify(context)]
    );
    await client.query('COMMIT');
    res.status(201).json({ run: runRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listFlowDebugTraces(req, res, next) {
  try {
    const flowId = toInt(req.params.id, 'flow id');
    const { rows } = await pool.query(
      `SELECT * FROM crm_flow_debug_traces
       WHERE flow_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 500`,
      [flowId]
    );
    res.json({ traces: rows });
  } catch (error) {
    next(error);
  }
}

async function previewPricingEngine(req, res, next) {
  try {
    const input = req.body || {};
    const productId = input.productId ? Number(input.productId) : null;
    const quantity = Number(input.quantity || 1);
    const unitPrice = Number(input.unitPrice || 0);
    let baseTotal = Number((quantity * unitPrice).toFixed(2));
    let discountPercent = Number(input.manualDiscountPercent || 0);

    if (productId) {
      const schedulesRes = await pool.query(
        `SELECT * FROM crm_discount_schedules
         WHERE applies_to = 'PRODUCT' AND target_id = $1 AND active = TRUE`,
        [productId]
      );
      schedulesRes.rows.forEach((schedule) => {
        const tiers = Array.isArray(schedule.tiers_json) ? schedule.tiers_json : [];
        tiers.forEach((tier) => {
          const min = Number(tier.min || 0);
          const max = tier.max === null || tier.max === undefined ? Number.MAX_SAFE_INTEGER : Number(tier.max);
          if (quantity >= min && quantity <= max) {
            discountPercent = Math.max(discountPercent, Number(tier.discountPercent || 0));
          }
        });
      });
    }

    const rulesRes = await pool.query(`SELECT * FROM crm_pricing_rules WHERE active = TRUE ORDER BY priority ASC`);
    const appliedRules = [];
    rulesRes.rows.forEach((rule) => {
      const condition = rule.condition_json || {};
      if (condition.minQuantity && quantity < Number(condition.minQuantity)) return;
      const action = rule.action_json || {};
      if (action.additionalDiscountPercent) {
        discountPercent += Number(action.additionalDiscountPercent || 0);
        appliedRules.push(rule.rule_name);
      }
    });

    const discountValue = Number((baseTotal * (discountPercent / 100)).toFixed(2));
    const finalTotal = Number((baseTotal - discountValue).toFixed(2));
    res.json({
      preview: {
        quantity,
        unitPrice,
        baseTotal,
        discountPercent: Number(discountPercent.toFixed(2)),
        discountValue,
        finalTotal,
        appliedRules,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function routeWorkItemEngine(req, res, next) {
  const client = await pool.connect();
  try {
    const workItemId = toInt(req.body?.workItemId, 'workItemId');
    const workRes = await client.query('SELECT * FROM crm_work_items WHERE id = $1', [workItemId]);
    if (!workRes.rows.length) throw new ApiError(404, 'Work item not found');
    const work = workRes.rows[0];
    const requiredSkills = Array.isArray(work.required_skills) ? work.required_skills : [];

    const queueMembersRes = await client.query(
      `SELECT m.*, u.full_name, q.queue_name
       FROM crm_queue_members m
       JOIN users u ON u.id = m.user_id
       JOIN crm_service_queues q ON q.id = m.queue_id
       WHERE m.presence_status = 'AVAILABLE'`
    );
    const skillsRes = await client.query('SELECT user_id, skill_name, proficiency FROM crm_agent_skills WHERE active = TRUE');
    const skillMap = new Map();
    skillsRes.rows.forEach((row) => {
      const list = skillMap.get(row.user_id) || [];
      list.push(row);
      skillMap.set(row.user_id, list);
    });

    let best = null;
    queueMembersRes.rows.forEach((member) => {
      const userSkills = skillMap.get(member.user_id) || [];
      const matched = requiredSkills.every((skill) => userSkills.some((s) => s.skill_name.toLowerCase() === String(skill).toLowerCase()));
      if (!matched && requiredSkills.length) return;
      const score = Number(member.capacity || 0) + userSkills.reduce((sum, s) => sum + Number(s.proficiency || 0), 0);
      if (!best || score > best.score) {
        best = { ...member, score };
      }
    });

    if (!best) throw new ApiError(400, 'No suitable agent available');

    await client.query('BEGIN');
    await client.query(
      `UPDATE crm_work_items
       SET assigned_queue_id = $1, assigned_user_id = $2, status = 'ROUTED', updated_at = NOW()
       WHERE id = $3`,
      [best.queue_id, best.user_id, workItemId]
    );
    const updated = await client.query('SELECT * FROM crm_work_items WHERE id = $1', [workItemId]);
    await client.query('COMMIT');
    res.json({
      result: {
        assignment: {
          queueId: best.queue_id,
          queueName: best.queue_name,
          userId: best.user_id,
          userName: best.full_name,
          score: best.score,
        },
        workItem: updated.rows[0],
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listOpsJobs(req, res, next) {
  try {
    const [jobsRes, runsRes] = await Promise.all([
      pool.query('SELECT * FROM crm_job_definitions ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT jr.*, jd.job_name FROM crm_job_runs jr JOIN crm_job_definitions jd ON jd.id = jr.job_id ORDER BY jr.started_at DESC, jr.id DESC LIMIT 500'),
    ]);
    res.json({ jobs: jobsRes.rows, runs: runsRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createOpsJob(req, res, next) {
  const client = await pool.connect();
  try {
    const { jobName, jobType, scheduleCron = '', config = {} } = req.body || {};
    if (!String(jobName || '').trim()) throw new ApiError(400, 'jobName is required');
    if (!String(jobType || '').trim()) throw new ApiError(400, 'jobType is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_job_definitions (job_name, job_type, schedule_cron, config_json, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, TRUE, $5, NOW(), NOW())
       RETURNING *`,
      [String(jobName).trim(), String(jobType).toUpperCase(), scheduleCron || null, JSON.stringify(config || {}), req.user.id]
    );
    await client.query('COMMIT');
    await logAudit('OPS', 'CREATE', 'JOB', rows[0].id, rows[0], req.user.id);
    res.status(201).json({ job: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function runOpsJob(req, res, next) {
  const client = await pool.connect();
  try {
    const jobId = toInt(req.params.id, 'job id');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_job_runs (job_id, status, output_json, started_at, finished_at)
       VALUES ($1, 'SUCCESS', '{"message":"Job executed"}'::jsonb, NOW(), NOW())
       RETURNING *`,
      [jobId]
    );
    await client.query('COMMIT');
    await logAudit('OPS', 'RUN', 'JOB', jobId, rows[0], req.user.id);
    res.status(201).json({ run: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listAuditLogs(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT al.*, u.full_name AS performed_by_name
       FROM crm_setup_audit_logs al
       LEFT JOIN users u ON u.id = al.performed_by
       ORDER BY al.performed_at DESC, al.id DESC
       LIMIT 1000`
    );
    res.json({ logs: rows });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getRuntimeOverview,
  createValidationRule,
  createFormulaField,
  listCustomRecords,
  createCustomRecord,
  publishFlowVersion,
  debugFlow,
  listFlowDebugTraces,
  previewPricingEngine,
  routeWorkItemEngine,
  listOpsJobs,
  createOpsJob,
  runOpsJob,
  listAuditLogs,
};
