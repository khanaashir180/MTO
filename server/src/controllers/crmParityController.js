const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

function toInt(v, field) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Invalid ${field}`);
  return n;
}

async function listFlows(req, res, next) {
  try {
    const [flowsRes, runsRes] = await Promise.all([
      pool.query('SELECT * FROM crm_flows ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT fr.*, f.flow_name FROM crm_flow_runs fr JOIN crm_flows f ON f.id = fr.flow_id ORDER BY fr.started_at DESC, fr.id DESC LIMIT 300'),
    ]);
    res.json({ flows: flowsRes.rows, runs: runsRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createFlow(req, res, next) {
  const client = await pool.connect();
  try {
    const { flowName, flowType = 'RECORD_TRIGGERED', triggerObject = null, triggerEvent = null, definition = {}, active = true } = req.body || {};
    if (!String(flowName || '').trim()) throw new ApiError(400, 'flowName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_flows
       (flow_name, flow_type, trigger_object, trigger_event, definition_json, active, version_number, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, 1, $7, NOW(), NOW())
       RETURNING *`,
      [
        String(flowName).trim(),
        String(flowType || 'RECORD_TRIGGERED').toUpperCase(),
        triggerObject ? String(triggerObject).toUpperCase() : null,
        triggerEvent ? String(triggerEvent).toUpperCase() : null,
        JSON.stringify(definition || {}),
        Boolean(active),
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ flow: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function runFlowSimulation(req, res, next) {
  const client = await pool.connect();
  try {
    const flowId = toInt(req.params.id, 'flow id');
    const context = req.body?.context || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_flow_runs (flow_id, context_json, status, started_at, finished_at)
       VALUES ($1, $2::jsonb, 'SUCCESS', NOW(), NOW())
       RETURNING *`,
      [flowId, JSON.stringify(context)]
    );
    await client.query('COMMIT');
    res.status(201).json({ run: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listOmniChannel(req, res, next) {
  try {
    const [queuesRes, skillsRes, membersRes, itemsRes] = await Promise.all([
      pool.query('SELECT * FROM crm_service_queues ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT s.*, u.full_name FROM crm_agent_skills s JOIN users u ON u.id = s.user_id ORDER BY s.updated_at DESC, s.id DESC'),
      pool.query('SELECT m.*, q.queue_name, u.full_name FROM crm_queue_members m JOIN crm_service_queues q ON q.id = m.queue_id JOIN users u ON u.id = m.user_id ORDER BY m.updated_at DESC, m.id DESC'),
      pool.query('SELECT wi.*, q.queue_name, u.full_name AS assigned_user_name FROM crm_work_items wi LEFT JOIN crm_service_queues q ON q.id = wi.assigned_queue_id LEFT JOIN users u ON u.id = wi.assigned_user_id ORDER BY wi.updated_at DESC, wi.id DESC LIMIT 500'),
    ]);
    res.json({
      queues: queuesRes.rows,
      skills: skillsRes.rows,
      members: membersRes.rows,
      workItems: itemsRes.rows,
    });
  } catch (error) {
    next(error);
  }
}

async function createQueue(req, res, next) {
  const client = await pool.connect();
  try {
    const { queueName, channelType = 'CASE', priorityModel = 'FIFO', active = true } = req.body || {};
    if (!String(queueName || '').trim()) throw new ApiError(400, 'queueName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_service_queues
       (queue_name, channel_type, priority_model, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [String(queueName || '').trim(), String(channelType || 'CASE').toUpperCase(), String(priorityModel || 'FIFO').toUpperCase(), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ queue: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function upsertAgentSkill(req, res, next) {
  const client = await pool.connect();
  try {
    const { userId, skillName, proficiency = 3, active = true } = req.body || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_agent_skills (user_id, skill_name, proficiency, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (user_id, skill_name)
       DO UPDATE SET proficiency = EXCLUDED.proficiency, active = EXCLUDED.active, updated_at = NOW()
       RETURNING *`,
      [toInt(userId, 'userId'), String(skillName || '').trim(), Math.max(1, Math.min(5, Number(proficiency || 3))), Boolean(active)]
    );
    await client.query('COMMIT');
    res.status(201).json({ skill: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function upsertQueueMember(req, res, next) {
  const client = await pool.connect();
  try {
    const queueId = toInt(req.params.id, 'queue id');
    const { userId, capacity = 5, presenceStatus = 'AVAILABLE' } = req.body || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_queue_members (queue_id, user_id, capacity, presence_status, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (queue_id, user_id)
       DO UPDATE SET capacity = EXCLUDED.capacity, presence_status = EXCLUDED.presence_status, updated_at = NOW()
       RETURNING *`,
      [queueId, toInt(userId, 'userId'), Number(capacity || 5), String(presenceStatus || 'AVAILABLE').toUpperCase()]
    );
    await client.query('COMMIT');
    res.status(201).json({ member: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createWorkItem(req, res, next) {
  const client = await pool.connect();
  try {
    const { channelType, subject, priority = 'MEDIUM', requiredSkills = [], assignedQueueId = null } = req.body || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_work_items
       (channel_type, subject, priority, required_skills, status, assigned_queue_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'NEW', $5, NOW(), NOW())
       RETURNING *`,
      [String(channelType || 'CASE').toUpperCase(), String(subject || '').trim(), String(priority || 'MEDIUM').toUpperCase(), Array.isArray(requiredSkills) ? requiredSkills : [], assignedQueueId ? toInt(assignedQueueId, 'assignedQueueId') : null]
    );
    await client.query('COMMIT');
    res.status(201).json({ workItem: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function routeWorkItem(req, res, next) {
  const client = await pool.connect();
  try {
    const workItemId = toInt(req.params.id, 'work item id');
    const { assignedQueueId = null, assignedUserId = null, status = 'ROUTED' } = req.body || {};
    await client.query('BEGIN');
    await client.query(
      `UPDATE crm_work_items
       SET assigned_queue_id = $1, assigned_user_id = $2, status = $3, updated_at = NOW()
       WHERE id = $4`,
      [assignedQueueId ? toInt(assignedQueueId, 'assignedQueueId') : null, assignedUserId ? toInt(assignedUserId, 'assignedUserId') : null, String(status || 'ROUTED').toUpperCase(), workItemId]
    );
    const { rows } = await client.query('SELECT * FROM crm_work_items WHERE id = $1', [workItemId]);
    await client.query('COMMIT');
    res.json({ workItem: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listMarketplace(req, res, next) {
  try {
    const [appsRes, installedRes] = await Promise.all([
      pool.query('SELECT * FROM crm_apps ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT ia.*, a.app_name, a.app_key FROM crm_installed_apps ia JOIN crm_apps a ON a.id = ia.app_id ORDER BY ia.installed_at DESC, ia.id DESC'),
    ]);
    res.json({ apps: appsRes.rows, installed: installedRes.rows });
  } catch (error) {
    next(error);
  }
}

async function installApp(req, res, next) {
  const client = await pool.connect();
  try {
    const appId = toInt(req.params.id, 'app id');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_installed_apps (app_id, installed_by, installed_at, status, config_json)
       VALUES ($1, $2, NOW(), 'ACTIVE', '{}'::jsonb)
       ON CONFLICT (app_id)
       DO UPDATE SET status = 'ACTIVE', installed_by = EXCLUDED.installed_by, installed_at = NOW()
       RETURNING *`,
      [appId, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ installedApp: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateInstalledApp(req, res, next) {
  const client = await pool.connect();
  try {
    const id = toInt(req.params.id, 'installed app id');
    const { status, config = {} } = req.body || {};
    await client.query('BEGIN');
    await client.query(
      `UPDATE crm_installed_apps
       SET status = $1, config_json = $2::jsonb
       WHERE id = $3`,
      [String(status || 'ACTIVE').toUpperCase(), JSON.stringify(config || {}), id]
    );
    const { rows } = await client.query('SELECT * FROM crm_installed_apps WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ installedApp: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  listFlows,
  createFlow,
  runFlowSimulation,
  listOmniChannel,
  createQueue,
  upsertAgentSkill,
  upsertQueueMember,
  createWorkItem,
  routeWorkItem,
  listMarketplace,
  installApp,
  updateInstalledApp,
};
