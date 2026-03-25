const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

const OPPORTUNITY_STAGES = ['QUALIFICATION', 'NEEDS_ANALYSIS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'];
const OPPORTUNITY_STATUSES = ['OPEN', 'WON', 'LOST'];
const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const TASK_STATUSES = ['OPEN', 'COMPLETED', 'CANCELLED'];
const CASE_TYPES = ['GENERAL', 'ORDER', 'PAYMENT', 'QUALITY', 'DELIVERY', 'RETURNS'];
const CASE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const CASE_STATUSES = ['NEW', 'WORKING', 'WAITING_CUSTOMER', 'ESCALATED', 'RESOLVED', 'CLOSED'];
const CASE_ORIGINS = ['MANUAL', 'EMAIL', 'PHONE', 'WEB', 'WHATSAPP'];
const SAVED_VIEW_MODULES = ['CRM'];
const SAVED_VIEW_SCOPES = ['PRIVATE', 'SHARED'];
const INTERACTION_TYPES = ['CALL', 'VISIT', 'WHATSAPP', 'EMAIL', 'SMS', 'NOTE'];
const INTERACTION_DIRECTIONS = ['INBOUND', 'OUTBOUND', 'INTERNAL'];
const COMMUNICATION_STATUSES = ['OPEN', 'PENDING', 'CLOSED'];
const TASK_RECURRENCE_TYPES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'];

function getCrmOutletScope(req) {
  if (req.user?.role === 'RETAIL' && req.user?.outlet_name) {
    return String(req.user.outlet_name);
  }
  return null;
}

function normalizeOpportunityStage(stage) {
  const value = String(stage || '').trim().toUpperCase();
  if (!value) return null;
  if (!OPPORTUNITY_STAGES.includes(value)) {
    throw new ApiError(400, 'Invalid opportunity stage');
  }
  return value;
}

function normalizeOpportunityStatus(status) {
  const value = String(status || '').trim().toUpperCase();
  if (!value) return null;
  if (!OPPORTUNITY_STATUSES.includes(value)) {
    throw new ApiError(400, 'Invalid opportunity status');
  }
  return value;
}

function normalizeTaskPriority(priority) {
  const value = String(priority || '').trim().toUpperCase();
  if (!value) return null;
  if (!TASK_PRIORITIES.includes(value)) {
    throw new ApiError(400, 'Invalid task priority');
  }
  return value;
}

function normalizeTaskStatus(status) {
  const value = String(status || '').trim().toUpperCase();
  if (!value) return null;
  if (!TASK_STATUSES.includes(value)) {
    throw new ApiError(400, 'Invalid task status');
  }
  return value;
}

function normalizeCaseType(caseType) {
  const value = String(caseType || '').trim().toUpperCase();
  if (!value) return null;
  if (!CASE_TYPES.includes(value)) throw new ApiError(400, 'Invalid case type');
  return value;
}

function normalizeCasePriority(priority) {
  const value = String(priority || '').trim().toUpperCase();
  if (!value) return null;
  if (!CASE_PRIORITIES.includes(value)) throw new ApiError(400, 'Invalid case priority');
  return value;
}

function normalizeCaseStatus(status) {
  const value = String(status || '').trim().toUpperCase();
  if (!value) return null;
  if (!CASE_STATUSES.includes(value)) throw new ApiError(400, 'Invalid case status');
  return value;
}

function normalizeCaseOrigin(origin) {
  const value = String(origin || '').trim().toUpperCase();
  if (!value) return null;
  if (!CASE_ORIGINS.includes(value)) throw new ApiError(400, 'Invalid case origin');
  return value;
}

function normalizeSavedViewModule(moduleName) {
  const value = String(moduleName || '').trim().toUpperCase();
  if (!value) return 'CRM';
  if (!SAVED_VIEW_MODULES.includes(value)) throw new ApiError(400, 'Invalid saved view module');
  return value;
}

function normalizeSavedViewScope(scope) {
  const value = String(scope || '').trim().toUpperCase();
  if (!value) return 'PRIVATE';
  if (!SAVED_VIEW_SCOPES.includes(value)) throw new ApiError(400, 'Invalid saved view scope');
  return value;
}

function normalizeInteractionType(interactionType) {
  const value = String(interactionType || '').trim().toUpperCase();
  if (!value) return null;
  if (!INTERACTION_TYPES.includes(value)) throw new ApiError(400, 'Invalid interaction type');
  return value;
}

function normalizeInteractionDirection(direction) {
  const value = String(direction || '').trim().toUpperCase();
  if (!value) return null;
  if (!INTERACTION_DIRECTIONS.includes(value)) throw new ApiError(400, 'Invalid interaction direction');
  return value;
}

function normalizeCommunicationStatus(status) {
  const value = String(status || '').trim().toUpperCase();
  if (!value) return null;
  if (!COMMUNICATION_STATUSES.includes(value)) throw new ApiError(400, 'Invalid communication status');
  return value;
}

function normalizeTaskRecurrenceType(recurrenceType) {
  const value = String(recurrenceType || '').trim().toUpperCase();
  if (!value) return 'NONE';
  if (!TASK_RECURRENCE_TYPES.includes(value)) throw new ApiError(400, 'Invalid recurrence type');
  return value;
}

function defaultIntervalForRecurrence(recurrenceType) {
  switch (recurrenceType) {
    case 'DAILY':
      return 1;
    case 'WEEKLY':
      return 7;
    case 'MONTHLY':
      return 30;
    default:
      return 0;
  }
}

function addDays(dateValue, days) {
  const date = new Date(String(dateValue || ''));
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function buildInteractionThreadKey(accountId, interactionType, providedThreadKey = '') {
  const explicit = String(providedThreadKey || '').trim();
  if (explicit) return explicit;
  return `acct-${accountId}-${String(interactionType || '').toUpperCase()}`;
}

function buildOpportunityWhereClause({
  search = '',
  stage = '',
  status = '',
  outlet = '',
  scopedOutlet = null,
  accountId = null,
}, values) {
  const filters = [];

  if (search) {
    values.push(`%${search}%`);
    filters.push(`(op.title ILIKE $${values.length} OR a.customer_name ILIKE $${values.length} OR a.customer_number ILIKE $${values.length})`);
  }

  const normalizedStage = normalizeOpportunityStage(stage);
  if (normalizedStage) {
    values.push(normalizedStage);
    filters.push(`op.stage = $${values.length}`);
  }

  const normalizedStatus = normalizeOpportunityStatus(status);
  if (normalizedStatus) {
    values.push(normalizedStatus);
    filters.push(`op.status = $${values.length}`);
  }

  if (accountId !== null && accountId !== undefined && String(accountId).trim() !== '') {
    const parsedAccountId = Number(accountId);
    if (!Number.isInteger(parsedAccountId) || parsedAccountId <= 0) {
      throw new ApiError(400, 'Invalid account id');
    }
    values.push(parsedAccountId);
    filters.push(`op.account_id = $${values.length}`);
  }

  if (scopedOutlet) {
    values.push(scopedOutlet);
    filters.push(
      `EXISTS (
        SELECT 1
        FROM orders ox
        WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
          AND LOWER(ox.ordered_from) = LOWER($${values.length})
      )`
    );
  } else if (outlet) {
    values.push(outlet);
    filters.push(
      `EXISTS (
        SELECT 1
        FROM orders ox
        WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
          AND LOWER(ox.ordered_from) = LOWER($${values.length})
      )`
    );
  }

  return filters.length ? `WHERE ${filters.join(' AND ')}` : '';
}

function buildTaskWhereClause({
  search = '',
  status = '',
  priority = '',
  dueBucket = '',
  outlet = '',
  scopedOutlet = null,
  accountId = null,
  assignedTo = null,
}, values) {
  const filters = [];

  if (search) {
    values.push(`%${search}%`);
    filters.push(`(t.title ILIKE $${values.length} OR a.customer_name ILIKE $${values.length} OR a.customer_number ILIKE $${values.length})`);
  }

  const normalizedStatus = normalizeTaskStatus(status);
  if (normalizedStatus) {
    values.push(normalizedStatus);
    filters.push(`t.status = $${values.length}`);
  }

  const normalizedPriority = normalizeTaskPriority(priority);
  if (normalizedPriority) {
    values.push(normalizedPriority);
    filters.push(`t.priority = $${values.length}`);
  }

  const bucket = String(dueBucket || '').trim().toUpperCase();
  if (bucket === 'OVERDUE') filters.push(`t.status = 'OPEN' AND t.due_date < CURRENT_DATE`);
  if (bucket === 'TODAY') filters.push(`t.status = 'OPEN' AND t.due_date = CURRENT_DATE`);
  if (bucket === 'UPCOMING') filters.push(`t.status = 'OPEN' AND t.due_date > CURRENT_DATE`);

  if (accountId !== null && accountId !== undefined && String(accountId).trim() !== '') {
    const parsedAccountId = Number(accountId);
    if (!Number.isInteger(parsedAccountId) || parsedAccountId <= 0) {
      throw new ApiError(400, 'Invalid account id');
    }
    values.push(parsedAccountId);
    filters.push(`t.account_id = $${values.length}`);
  }

  if (assignedTo !== null && assignedTo !== undefined && String(assignedTo).trim() !== '') {
    const parsedAssignedTo = Number(assignedTo);
    if (!Number.isInteger(parsedAssignedTo) || parsedAssignedTo <= 0) {
      throw new ApiError(400, 'Invalid assignedTo user id');
    }
    values.push(parsedAssignedTo);
    filters.push(`t.assigned_to = $${values.length}`);
  }

  if (scopedOutlet) {
    values.push(scopedOutlet);
    filters.push(
      `EXISTS (
        SELECT 1
        FROM orders ox
        WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
          AND LOWER(ox.ordered_from) = LOWER($${values.length})
      )`
    );
  } else if (outlet) {
    values.push(outlet);
    filters.push(
      `EXISTS (
        SELECT 1
        FROM orders ox
        WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
          AND LOWER(ox.ordered_from) = LOWER($${values.length})
      )`
    );
  }

  return filters.length ? `WHERE ${filters.join(' AND ')}` : '';
}

function buildCaseWhereClause({
  search = '',
  status = '',
  priority = '',
  caseType = '',
  assignedTo = '',
  outlet = '',
  scopedOutlet = null,
  accountId = null,
}, values) {
  const filters = [];

  if (search) {
    values.push(`%${search}%`);
    filters.push(`(c.subject ILIKE $${values.length} OR COALESCE(c.description, '') ILIKE $${values.length} OR a.customer_name ILIKE $${values.length} OR a.customer_number ILIKE $${values.length})`);
  }

  const normalizedStatus = normalizeCaseStatus(status);
  if (normalizedStatus) {
    values.push(normalizedStatus);
    filters.push(`c.status = $${values.length}`);
  }

  const normalizedPriority = normalizeCasePriority(priority);
  if (normalizedPriority) {
    values.push(normalizedPriority);
    filters.push(`c.priority = $${values.length}`);
  }

  const normalizedType = normalizeCaseType(caseType);
  if (normalizedType) {
    values.push(normalizedType);
    filters.push(`c.case_type = $${values.length}`);
  }

  if (assignedTo !== null && assignedTo !== undefined && String(assignedTo).trim() !== '') {
    const parsedAssignedTo = Number(assignedTo);
    if (!Number.isInteger(parsedAssignedTo) || parsedAssignedTo <= 0) {
      throw new ApiError(400, 'Invalid assignedTo user id');
    }
    values.push(parsedAssignedTo);
    filters.push(`c.assigned_to = $${values.length}`);
  }

  if (accountId !== null && accountId !== undefined && String(accountId).trim() !== '') {
    const parsedAccountId = Number(accountId);
    if (!Number.isInteger(parsedAccountId) || parsedAccountId <= 0) {
      throw new ApiError(400, 'Invalid account id');
    }
    values.push(parsedAccountId);
    filters.push(`c.account_id = $${values.length}`);
  }

  if (scopedOutlet) {
    values.push(scopedOutlet);
    filters.push(
      `EXISTS (
        SELECT 1
        FROM orders ox
        WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
          AND LOWER(ox.ordered_from) = LOWER($${values.length})
      )`
    );
  } else if (outlet) {
    values.push(outlet);
    filters.push(
      `EXISTS (
        SELECT 1
        FROM orders ox
        WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
          AND LOWER(ox.ordered_from) = LOWER($${values.length})
      )`
    );
  }

  return filters.length ? `WHERE ${filters.join(' AND ')}` : '';
}

function normalizeOpportunityState(stage, status) {
  let normalizedStage = normalizeOpportunityStage(stage) || 'QUALIFICATION';
  let normalizedStatus = normalizeOpportunityStatus(status) || 'OPEN';

  if (normalizedStatus === 'WON') normalizedStage = 'CLOSED_WON';
  if (normalizedStatus === 'LOST') normalizedStage = 'CLOSED_LOST';
  if (normalizedStage === 'CLOSED_WON') normalizedStatus = 'WON';
  if (normalizedStage === 'CLOSED_LOST') normalizedStatus = 'LOST';
  if (normalizedStatus === 'OPEN' && ['CLOSED_WON', 'CLOSED_LOST'].includes(normalizedStage)) {
    normalizedStage = 'QUALIFICATION';
  }

  return { stage: normalizedStage, status: normalizedStatus };
}

async function ensureAccountAccess(client, accountId, scopedOutlet, userId = null, requireEdit = false) {
  const accountResult = await client.query(
    `SELECT id, customer_number
     FROM customer_accounts
     WHERE id = $1`,
    [accountId]
  );
  const account = accountResult.rows[0];
  if (!account) {
    throw new ApiError(404, 'Customer not found');
  }

  if (scopedOutlet) {
    const accessResult = await client.query(
      `SELECT 1
       FROM orders
       WHERE LOWER(customer_number) = LOWER($1)
         AND LOWER(ordered_from) = LOWER($2)
       LIMIT 1`,
      [account.customer_number, scopedOutlet]
    );
    if (accessResult.rows[0]) {
      return account;
    }
    if (!userId) throw new ApiError(403, 'Forbidden for this outlet');
    const shareResult = await client.query(
      `SELECT access_level
       FROM crm_account_shares
       WHERE account_id = $1
         AND user_id = $2
       LIMIT 1`,
      [accountId, userId]
    );
    const share = shareResult.rows[0];
    if (!share) throw new ApiError(403, 'Forbidden for this outlet');
    if (requireEdit && share.access_level !== 'EDIT') {
      throw new ApiError(403, 'Edit access is required for this account');
    }
  }

  return account;
}

async function getEditableFieldMap(client, roleName) {
  const { rows } = await client.query(
    `SELECT field_name, can_edit
     FROM crm_field_permissions
     WHERE role_name = $1`,
    [String(roleName || '').toUpperCase()]
  );
  const map = new Map();
  rows.forEach((row) => map.set(row.field_name, Boolean(row.can_edit)));
  return map;
}

async function createNotification(client, {
  userId,
  title,
  message,
  severity = 'INFO',
  linkedType = null,
  linkedId = null,
  payload = {},
}) {
  if (!userId) return;
  await client.query(
    `INSERT INTO crm_notifications
     (user_id, title, message, severity, status, linked_type, linked_id, payload_json, created_at)
     VALUES ($1, $2, $3, $4, 'UNREAD', $5, $6, $7::jsonb, NOW())`,
    [userId, title, message, severity, linkedType, linkedId, JSON.stringify(payload || {})]
  );
}

async function ensureCommunicationAlerts(client) {
  const { rows } = await client.query(
    `SELECT
       ci.id,
       ci.account_id,
       ci.interaction_type,
       ci.subject,
       ci.response_due_at,
       ci.conversation_owner_id,
       ci.thread_key,
       a.customer_name,
       a.customer_number
     FROM customer_interactions ci
     JOIN customer_accounts a ON a.id = ci.account_id
     WHERE ci.direction = 'INBOUND'
       AND ci.responded_at IS NULL
       AND ci.response_due_at IS NOT NULL
       AND ci.response_due_at < NOW()
       AND ci.no_response_alerted_at IS NULL
       AND ci.channel_status IN ('OPEN', 'PENDING')
     ORDER BY ci.response_due_at ASC, ci.id ASC
     LIMIT 100`
  );

  for (const row of rows) {
    await createNotification(client, {
      userId: row.conversation_owner_id,
      title: 'No Response Alert',
      message: `${row.customer_name || row.customer_number} has an overdue ${row.interaction_type} conversation waiting for response.`,
      severity: 'HIGH',
      linkedType: 'COMMUNICATION',
      linkedId: row.id,
      payload: {
        accountId: row.account_id,
        interactionId: row.id,
        threadKey: row.thread_key,
        responseDueAt: row.response_due_at,
      },
    });
    await client.query(
      `UPDATE customer_interactions
       SET no_response_alerted_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
  }
}

async function resolveTaskTemplate(client, templateId) {
  if (!templateId) return null;
  const parsedTemplateId = Number(templateId);
  if (!Number.isInteger(parsedTemplateId) || parsedTemplateId <= 0) {
    throw new ApiError(400, 'Invalid task template id');
  }
  const { rows } = await client.query(
    `SELECT id, name, title, description, priority, default_due_in_days, default_recurrence_type, default_recurrence_interval_days, is_active
     FROM crm_task_templates
     WHERE id = $1`,
    [parsedTemplateId]
  );
  if (!rows[0]) throw new ApiError(404, 'Task template not found');
  if (!rows[0].is_active) throw new ApiError(400, 'Task template is inactive');
  return rows[0];
}

function normalizeDependencyIds(values = []) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0))];
}

async function replaceTaskDependencies(client, taskId, dependencyIds, actorUserId) {
  await client.query(`DELETE FROM crm_task_dependencies WHERE task_id = $1`, [taskId]);
  if (!dependencyIds.length) return;
  for (const dependencyId of dependencyIds) {
    if (dependencyId === taskId) continue;
    await client.query(
      `INSERT INTO crm_task_dependencies (task_id, depends_on_task_id, created_by, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (task_id, depends_on_task_id) DO NOTHING`,
      [taskId, dependencyId, actorUserId || null]
    );
  }
}

async function createNextRecurringTask(client, taskRow, actorUserId) {
  const recurrenceType = normalizeTaskRecurrenceType(taskRow.recurrence_type);
  if (recurrenceType === 'NONE') return null;

  const intervalDays = Number(taskRow.recurrence_interval_days || defaultIntervalForRecurrence(recurrenceType));
  if (intervalDays <= 0) return null;

  const nextDueDate = addDays(taskRow.due_date || taskRow.recurrence_anchor_date, intervalDays);
  if (!nextDueDate) return null;

  const existing = await client.query(
    `SELECT id
     FROM crm_tasks
     WHERE parent_task_id = $1
       AND due_date = $2
       AND status = 'OPEN'
     LIMIT 1`,
    [taskRow.id, nextDueDate]
  );
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await client.query(
    `INSERT INTO crm_tasks (
       account_id, opportunity_id, title, description, due_date, priority, status,
       assigned_to, created_by, template_id, recurrence_type, recurrence_interval_days,
       recurrence_anchor_date, parent_task_id, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'OPEN', $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
     RETURNING id`,
    [
      taskRow.account_id || null,
      taskRow.opportunity_id || null,
      taskRow.title,
      taskRow.description || null,
      nextDueDate,
      taskRow.priority || 'MEDIUM',
      taskRow.assigned_to || actorUserId || null,
      actorUserId || taskRow.created_by || null,
      taskRow.template_id || null,
      recurrenceType,
      intervalDays,
      nextDueDate,
      taskRow.id,
    ]
  );

  const dependencyRows = await client.query(
    `SELECT depends_on_task_id
     FROM crm_task_dependencies
     WHERE task_id = $1`,
    [taskRow.id]
  );
  await replaceTaskDependencies(
    client,
    inserted.rows[0].id,
    dependencyRows.rows.map((row) => row.depends_on_task_id),
    actorUserId
  );

  await client.query(
    `UPDATE crm_tasks
     SET last_generated_at = NOW()
     WHERE id = $1`,
    [taskRow.id]
  );

  return inserted.rows[0];
}

async function getActiveRuleMap(client, eventType) {
  const { rows } = await client.query(
    `SELECT id, name
     FROM crm_automation_rules
     WHERE is_active = TRUE
       AND event_type = $1`,
    [eventType]
  );
  const map = new Map();
  rows.forEach((row) => map.set(row.name, row.id));
  return map;
}

async function logAutomation(client, ruleId, eventType, referenceType, referenceId, result, detail = {}) {
  await client.query(
    `INSERT INTO crm_automation_logs
     (rule_id, event_type, reference_type, reference_id, result, detail_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, NOW())`,
    [ruleId || null, eventType, referenceType || null, referenceId || null, result || 'EXECUTED', JSON.stringify(detail || {})]
  );
}

async function runTaskAutomation(client, taskRow, actorUserId) {
  const rules = await getActiveRuleMap(client, 'TASK_SAVED');
  const isOverdueOpen = taskRow.status === 'OPEN' && String(taskRow.due_date || '').slice(0, 10) < new Date().toISOString().slice(0, 10);
  if (!isOverdueOpen) return;
  const ruleId = rules.get('task_overdue_alert');
  await createNotification(client, {
    userId: taskRow.assigned_to || actorUserId,
    title: 'Overdue CRM Task',
    message: `Task "${taskRow.title}" is overdue since ${String(taskRow.due_date).slice(0, 10)}.`,
    severity: 'HIGH',
    linkedType: 'TASK',
    linkedId: taskRow.id,
    payload: { taskId: taskRow.id, dueDate: taskRow.due_date, status: taskRow.status },
  });
  await logAutomation(client, ruleId, 'TASK_SAVED', 'TASK', taskRow.id, 'EXECUTED', { reason: 'due_date_past_and_open' });
}

async function runOpportunityAutomation(client, opportunityRow, actorUserId) {
  const rules = await getActiveRuleMap(client, 'OPPORTUNITY_UPDATED');
  if (opportunityRow.status !== 'WON') return;
  const ruleId = rules.get('opportunity_won_alert');
  await createNotification(client, {
    userId: opportunityRow.owner_id || actorUserId,
    title: 'Opportunity Closed Won',
    message: `Opportunity "${opportunityRow.title}" was marked as WON.`,
    severity: 'SUCCESS',
    linkedType: 'OPPORTUNITY',
    linkedId: opportunityRow.id,
    payload: { opportunityId: opportunityRow.id, value: opportunityRow.expected_value },
  });
  await logAutomation(client, ruleId, 'OPPORTUNITY_UPDATED', 'OPPORTUNITY', opportunityRow.id, 'EXECUTED', { reason: 'status_won' });
}

async function runCustomerAutomation(client, customerRow, actorUserId) {
  const rules = await getActiveRuleMap(client, 'CUSTOMER_UPDATED');
  const leadScore = Number(customerRow.lead_score || 0);
  if (leadScore < 80) return;
  const ruleId = rules.get('hot_lead_alert');
  await createNotification(client, {
    userId: actorUserId,
    title: 'Hot Lead Alert',
    message: `Customer "${customerRow.customer_name || customerRow.customer_number}" reached lead score ${leadScore}.`,
    severity: 'WARNING',
    linkedType: 'CUSTOMER',
    linkedId: customerRow.id,
    payload: { accountId: customerRow.id, leadScore },
  });
  await logAutomation(client, ruleId, 'CUSTOMER_UPDATED', 'CUSTOMER', customerRow.id, 'EXECUTED', { reason: 'lead_score_gte_80' });
}

async function ensureLeadFollowupTask(client, {
  accountId,
  customerNumber,
  stageName,
  ownerId,
  actorUserId,
}) {
  if (!accountId || !stageName) return;
  const normalizedStage = String(stageName || '').toUpperCase();
  if (!['ROUTED', 'WORKING', 'QUALIFIED'].includes(normalizedStage)) return;

  const taskTitle = normalizedStage === 'QUALIFIED'
    ? `Lead conversion review: ${customerNumber}`
    : `Lead follow-up: ${customerNumber}`;
  const dueDate = normalizedStage === 'QUALIFIED'
    ? addDays(new Date().toISOString().slice(0, 10), 1)
    : addDays(new Date().toISOString().slice(0, 10), 2);

  const existing = await client.query(
    `SELECT id
     FROM crm_tasks
     WHERE account_id = $1
       AND title = $2
       AND status = 'OPEN'
     LIMIT 1`,
    [accountId, taskTitle]
  );
  if (existing.rows[0]) return existing.rows[0];

  const inserted = await client.query(
    `INSERT INTO crm_tasks (
       account_id, opportunity_id, title, description, due_date, priority, status, assigned_to, created_by, created_at, updated_at
     )
     VALUES ($1, NULL, $2, $3, $4, $5, 'OPEN', $6, $7, NOW(), NOW())
     RETURNING id`,
    [
      accountId,
      taskTitle,
      normalizedStage === 'QUALIFIED'
        ? 'Review lead readiness, confirm budget/fit, and convert if validated.'
        : 'Make first contact, validate source, and move the lead forward.',
      dueDate,
      normalizedStage === 'QUALIFIED' ? 'HIGH' : 'MEDIUM',
      ownerId || actorUserId || null,
      actorUserId || ownerId || null,
    ]
  );
  return inserted.rows[0];
}

async function getOpportunityStageGate(client, stageName, expectedValue) {
  const { rows } = await client.query(
    `SELECT id, entity_type, stage_name, min_expected_value
     FROM crm_stage_gates
     WHERE entity_type = 'OPPORTUNITY'
       AND stage_name = $1
       AND is_active = TRUE
       AND requires_approval = TRUE
       AND min_expected_value <= $2
     ORDER BY min_expected_value DESC
     LIMIT 1`,
    [stageName, Number(expectedValue || 0)]
  );
  return rows[0] || null;
}

async function ensureOpportunityStageApproval(client, {
  opportunityId,
  stageName,
  expectedValue,
  requestedBy,
  payload = {},
}) {
  const gate = await getOpportunityStageGate(client, stageName, expectedValue);
  if (!gate) return null;

  const approved = await client.query(
    `SELECT id
     FROM crm_approvals
     WHERE entity_type = 'OPPORTUNITY_STAGE'
       AND entity_id = $1
       AND stage_name = $2
       AND status = 'APPROVED'
     ORDER BY decided_at DESC NULLS LAST, id DESC
     LIMIT 1`,
    [opportunityId, stageName]
  );
  if (approved.rows[0]) return null;

  const pending = await client.query(
    `WITH existing AS (
       SELECT id
       FROM crm_approvals
       WHERE entity_type = 'OPPORTUNITY_STAGE'
         AND entity_id = $1
         AND stage_name = $2
         AND status = 'PENDING'
       LIMIT 1
     ),
     inserted AS (
       INSERT INTO crm_approvals
       (entity_type, entity_id, stage_name, status, requested_payload, requested_by, requested_at)
       SELECT 'OPPORTUNITY_STAGE', $1, $2, 'PENDING', $3::jsonb, $4, NOW()
       WHERE NOT EXISTS (SELECT 1 FROM existing)
       RETURNING id
     )
     SELECT id FROM inserted
     UNION ALL
     SELECT id FROM existing
     LIMIT 1`,
    [opportunityId, stageName, JSON.stringify(payload || {}), requestedBy || null]
  );

  return {
    gate,
    approvalId: pending.rows[0]?.id || null,
  };
}

async function getCrmSummary(req, res, next) {
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const values = [];
    let whereClause = '';
    if (scopedOutlet) {
      values.push(scopedOutlet);
      whereClause = `WHERE EXISTS (
        SELECT 1
        FROM orders ox
        WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
          AND LOWER(ox.ordered_from) = LOWER($1)
      )`;
    }

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_customers,
         COALESCE(SUM(
           CASE
             WHEN TRIM(COALESCE(a.customer_name, '')) = ''
               OR TRIM(COALESCE(a.customer_number, '')) = ''
               OR TRIM(COALESCE(a.customer_address, '')) = ''
               OR TRIM(COALESCE(a.email, '')) = ''
               OR TRIM(COALESCE(a.preferred_contact, '')) = ''
             THEN 1
             ELSE 0
           END
         ), 0)::int AS incomplete_profiles
       FROM customer_accounts a
       ${whereClause}`,
      values
    );

    res.json({
      total_customers: rows[0]?.total_customers || 0,
      incomplete_profiles: rows[0]?.incomplete_profiles || 0,
      scoped_outlet: scopedOutlet || null,
    });
  } catch (error) {
    if (error?.code === '42703' || error?.code === '42P01') {
      return res.status(400).json({ message: 'CRM schema is not fully migrated for customer details.' });
    }
    next(error);
  }
}

async function getTableColumnSet(tableName, client = pool) {
  const { rows } = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = $1`,
    [String(tableName || '').trim().toLowerCase()]
  );
  return new Set(rows.map((row) => String(row.column_name || '').toLowerCase()));
}

async function listCustomers(req, res, next) {
  try {
    const { search = '', status = '', outlet = '' } = req.query;
    const scopedOutlet = getCrmOutletScope(req);
    const values = [];
    const filters = [];

    if (search) {
      values.push(`%${search}%`);
      filters.push(`(a.customer_name ILIKE $${values.length} OR a.customer_number ILIKE $${values.length})`);
    }
    if (status) {
      values.push(status);
      filters.push(`a.customer_status = $${values.length}`);
    }
    if (scopedOutlet) {
      values.push(scopedOutlet);
      filters.push(
        `EXISTS (
          SELECT 1
          FROM orders ox
          WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
            AND LOWER(ox.ordered_from) = LOWER($${values.length})
        )`
      );
    } else if (outlet) {
      values.push(outlet);
      filters.push(
        `EXISTS (
          SELECT 1
          FROM orders ox
          WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
            AND LOWER(ox.ordered_from) = LOWER($${values.length})
        )`
      );
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT
         a.id,
         a.customer_name,
         a.customer_number,
         a.email,
         a.customer_status,
         a.account_tier,
         a.relationship_type,
         a.customer_segment,
         a.parent_account_id,
         a.preferred_contact,
         a.outlet_name,
         a.lead_score,
         a.risk_flag_reason,
         a.updated_at,
         COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)::numeric(12,2) AS total_debit,
         COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0)::numeric(12,2) AS total_credit,
         (COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0))::numeric(12,2) AS balance,
         MAX(ci.created_at) AS last_interaction_at,
         COUNT(DISTINCT o.id)::int AS order_count
       FROM customer_accounts a
       LEFT JOIN customer_ledger_entries le ON le.account_id = a.id
       LEFT JOIN customer_interactions ci ON ci.account_id = a.id
       LEFT JOIN orders o
         ON LOWER(o.customer_number) = LOWER(a.customer_number)
       ${whereClause}
       GROUP BY a.id
       ORDER BY a.updated_at DESC, a.id DESC`,
      values
    );

    res.json({ customers: rows, scoped_outlet: scopedOutlet || null });
  } catch (error) {
    if (error?.code === '42703' || error?.code === '42P01') {
      return res.status(400).json({ message: 'CRM task schema is not fully migrated.' });
    }
    next(error);
  }
}

async function globalCrmSearch(req, res, next) {
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit || 8), 1), 25);
    if (!q) {
      res.json({
        query: '',
        accounts: [],
        opportunities: [],
        tasks: [],
      });
      return;
    }

    const likeValue = `%${q}%`;

    const accountValues = [likeValue, limit];
    let accountOutletFilter = '';
    if (scopedOutlet) {
      accountValues.push(scopedOutlet);
      accountOutletFilter = `AND EXISTS (
        SELECT 1
        FROM orders ox
        WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
          AND LOWER(ox.ordered_from) = LOWER($${accountValues.length})
      )`;
    }

    const oppValues = [likeValue, limit];
    let oppOutletFilter = '';
    if (scopedOutlet) {
      oppValues.push(scopedOutlet);
      oppOutletFilter = `AND EXISTS (
        SELECT 1
        FROM orders ox
        WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
          AND LOWER(ox.ordered_from) = LOWER($${oppValues.length})
      )`;
    }

    const taskValues = [likeValue, limit];
    let taskOutletFilter = '';
    if (scopedOutlet) {
      taskValues.push(scopedOutlet);
      taskOutletFilter = `AND EXISTS (
        SELECT 1
        FROM orders ox
        WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
          AND LOWER(ox.ordered_from) = LOWER($${taskValues.length})
      )`;
    }

    const [accountsRes, oppRes, taskRes] = await Promise.all([
      pool.query(
        `SELECT
           a.id,
           a.customer_name,
           a.customer_number,
           a.customer_status,
           a.outlet_name,
           a.lead_score,
           a.updated_at
         FROM customer_accounts a
         WHERE (a.customer_name ILIKE $1 OR a.customer_number ILIKE $1 OR COALESCE(a.email, '') ILIKE $1)
         ${accountOutletFilter}
         ORDER BY a.updated_at DESC, a.id DESC
         LIMIT $2`,
        accountValues
      ),
      pool.query(
        `SELECT
           op.id,
           op.title,
           op.stage,
           op.status,
           op.expected_value,
           op.probability,
           op.expected_close_date,
           op.updated_at,
           op.account_id,
           a.customer_name,
           a.customer_number
         FROM crm_opportunities op
         JOIN customer_accounts a ON a.id = op.account_id
         WHERE (
           op.title ILIKE $1
           OR COALESCE(op.notes, '') ILIKE $1
           OR a.customer_name ILIKE $1
           OR a.customer_number ILIKE $1
         )
         ${oppOutletFilter}
         ORDER BY op.updated_at DESC, op.id DESC
         LIMIT $2`,
        oppValues
      ),
      pool.query(
        `SELECT
           t.id,
           t.title,
           t.status,
           t.priority,
           t.due_date,
           t.updated_at,
           t.account_id,
           a.customer_name,
           a.customer_number
         FROM crm_tasks t
         LEFT JOIN customer_accounts a ON a.id = t.account_id
         WHERE (
           t.title ILIKE $1
           OR COALESCE(t.description, '') ILIKE $1
           OR COALESCE(a.customer_name, '') ILIKE $1
           OR COALESCE(a.customer_number, '') ILIKE $1
         )
         ${taskOutletFilter}
         ORDER BY t.updated_at DESC, t.id DESC
         LIMIT $2`,
        taskValues
      ),
    ]);

    res.json({
      query: q,
      accounts: accountsRes.rows || [],
      opportunities: oppRes.rows || [],
      tasks: taskRes.rows || [],
    });
  } catch (error) {
    if (error?.code === '42703' || error?.code === '42P01') {
      return res.status(400).json({ message: 'CRM schema is not fully migrated for customer details.' });
    }
    next(error);
  }
}

async function listLeadQueue(req, res, next) {
  try {
    const columnSet = await getTableColumnSet('customer_accounts', pool);
    const hasLeadEngine = ['lead_stage', 'lead_owner_id', 'lead_temperature'].every((column) => columnSet.has(column));
    if (!hasLeadEngine) {
      return res.json({
        summary: {
          total_leads: 0,
          active_count: 0,
          inactive_count: 0,
          blocked_count: 0,
          hot_count: 0,
          qualified_count: 0,
          working_count: 0,
          sla_breach_count: 0,
        },
        leads: [],
        scoped_outlet: getCrmOutletScope(req) || null,
        warning: 'Lead engine columns are not initialized. Run latest migrations.',
      });
    }

    const scopedOutlet = getCrmOutletScope(req);
    const { search = '', status = '', stage = '', temperature = '', ownerId = '', mine = 'false' } = req.query;
    const values = [];
    const filters = [];

    if (search) {
      values.push(`%${String(search).trim()}%`);
      filters.push(`(a.customer_name ILIKE $${values.length} OR a.customer_number ILIKE $${values.length} OR COALESCE(a.email, '') ILIKE $${values.length})`);
    }
    if (status) {
      values.push(String(status).toUpperCase());
      filters.push(`a.customer_status = $${values.length}`);
    }
    if (stage) {
      values.push(String(stage).toUpperCase());
      filters.push(`COALESCE(a.lead_stage, 'NEW') = $${values.length}`);
    }
    if (temperature) {
      values.push(String(temperature).toUpperCase());
      filters.push(`COALESCE(a.lead_temperature, 'COLD') = $${values.length}`);
    }
    const effectiveOwnerId = mine === 'true' ? req.user.id : (ownerId ? Number(ownerId) : null);
    if (effectiveOwnerId !== null && effectiveOwnerId !== undefined && String(effectiveOwnerId).trim() !== '') {
      if (!Number.isInteger(Number(effectiveOwnerId)) || Number(effectiveOwnerId) <= 0) {
        throw new ApiError(400, 'Invalid owner id');
      }
      values.push(Number(effectiveOwnerId));
      filters.push(`a.lead_owner_id = $${values.length}`);
    }
    if (scopedOutlet) {
      values.push(scopedOutlet);
      filters.push(
        `EXISTS (
          SELECT 1
          FROM orders ox
          WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
            AND LOWER(ox.ordered_from) = LOWER($${values.length})
        )`
      );
    }

    filters.push(
      `(
        a.customer_status IN ('INACTIVE', 'BLOCKED')
        OR COALESCE(a.lead_score, 0) >= 60
      )`
    );

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    const [queueRes, summaryRes] = await Promise.all([
      pool.query(
        `SELECT
           a.id,
           a.customer_name,
           a.customer_number,
           a.customer_status,
           a.outlet_name,
           a.lead_score,
           a.lead_stage,
           a.lead_owner_id,
           a.lead_temperature,
           a.lead_source_detail,
           a.lead_sla_due_at,
           a.lead_routed_at,
           a.lead_qualified_at,
           a.lead_next_action,
           a.lead_next_action_due_at,
           a.lead_last_worked_at,
           a.lead_disqualification_reason,
           a.lead_qualification_notes,
           a.source,
           a.updated_at,
           u.full_name AS lead_owner_name,
           COALESCE((
             SELECT COUNT(*)
             FROM crm_opportunities op
             WHERE op.account_id = a.id
               AND op.status = 'OPEN'
           ), 0)::int AS open_opportunity_count,
           COALESCE((
             SELECT COUNT(*)
             FROM crm_tasks t
             WHERE t.account_id = a.id
               AND t.status = 'OPEN'
           ), 0)::int AS open_task_count,
           COALESCE((
             SELECT MAX(ci.created_at)
             FROM customer_interactions ci
             WHERE ci.account_id = a.id
           ), NULL) AS last_interaction_at
         FROM customer_accounts a
         LEFT JOIN users u ON u.id = a.lead_owner_id
         ${whereClause}
         ORDER BY
           COALESCE(a.lead_score, 0) DESC,
           a.updated_at DESC,
           a.id DESC
         LIMIT 400`,
        values
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_leads,
           COALESCE(SUM(CASE WHEN a.customer_status = 'ACTIVE' THEN 1 ELSE 0 END),0)::int AS active_count,
           COALESCE(SUM(CASE WHEN a.customer_status = 'INACTIVE' THEN 1 ELSE 0 END),0)::int AS inactive_count,
           COALESCE(SUM(CASE WHEN a.customer_status = 'BLOCKED' THEN 1 ELSE 0 END),0)::int AS blocked_count,
           COALESCE(SUM(CASE WHEN COALESCE(a.lead_score, 0) >= 80 THEN 1 ELSE 0 END),0)::int AS hot_count,
           COALESCE(SUM(CASE WHEN COALESCE(a.lead_stage, 'NEW') = 'QUALIFIED' THEN 1 ELSE 0 END),0)::int AS qualified_count,
           COALESCE(SUM(CASE WHEN COALESCE(a.lead_stage, 'NEW') = 'WORKING' THEN 1 ELSE 0 END),0)::int AS working_count,
           COALESCE(SUM(CASE WHEN a.lead_sla_due_at IS NOT NULL AND a.lead_sla_due_at < NOW() AND COALESCE(a.lead_stage, 'NEW') NOT IN ('QUALIFIED', 'DISQUALIFIED', 'CONVERTED') THEN 1 ELSE 0 END),0)::int AS sla_breach_count,
           COALESCE(SUM(CASE WHEN a.lead_owner_id IS NULL THEN 1 ELSE 0 END),0)::int AS unassigned_count,
           COALESCE(SUM(CASE WHEN COALESCE(a.lead_stage, 'NEW') IN ('WORKING', 'QUALIFIED') AND COALESCE(a.lead_score, 0) >= 75 THEN 1 ELSE 0 END),0)::int AS conversion_ready_count,
           COALESCE(SUM(CASE WHEN a.lead_next_action_due_at IS NOT NULL AND a.lead_next_action_due_at < NOW() AND COALESCE(a.lead_stage, 'NEW') NOT IN ('DISQUALIFIED', 'CONVERTED') THEN 1 ELSE 0 END),0)::int AS overdue_next_action_count
         FROM customer_accounts a
         ${whereClause}`,
        values
      ),
    ]);

    res.json({
      summary: summaryRes.rows[0] || {},
      leads: queueRes.rows || [],
      scoped_outlet: scopedOutlet || null,
    });
  } catch (error) {
    if (error?.code === '42703' || error?.code === '42P01') {
      return res.status(400).json({ message: 'CRM task schema is not fully migrated.' });
    }
    next(error);
  }
}

async function updateLeadRecord(req, res, next) {
  const client = await pool.connect();
  try {
    const accountId = Number(req.params.id);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new ApiError(400, 'Invalid lead account id');
    const scopedOutlet = getCrmOutletScope(req);
    const {
      leadStage,
      leadOwnerId,
      leadTemperature,
      leadSourceDetail,
      leadQualificationNotes,
      leadDisqualificationReason,
      leadSlaDueAt,
      leadScore,
      leadNextAction,
      leadNextActionDueAt,
    } = req.body || {};

    await client.query('BEGIN');
    const columnSet = await getTableColumnSet('customer_accounts', client);
    const hasLeadEngine = ['lead_stage', 'lead_owner_id', 'lead_temperature'].every((column) => columnSet.has(column));
    if (!hasLeadEngine) {
      throw new ApiError(400, 'Lead engine columns are not initialized. Run latest migrations.');
    }
    await ensureAccountAccess(client, accountId, scopedOutlet, req.user.id, true);

    const found = await client.query(
      `SELECT id, customer_name, customer_number, lead_stage, lead_owner_id, lead_temperature, lead_sla_due_at, lead_score,
              lead_next_action, lead_next_action_due_at
       FROM customer_accounts
       WHERE id = $1
       FOR UPDATE`,
      [accountId]
    );
    const current = found.rows[0];
    if (!current) throw new ApiError(404, 'Lead account not found');

    const normalizedStage = leadStage !== undefined ? String(leadStage || '').toUpperCase() : current.lead_stage;
    if (leadStage !== undefined && !['NEW', 'ROUTED', 'WORKING', 'QUALIFIED', 'DISQUALIFIED', 'CONVERTED'].includes(normalizedStage)) {
      throw new ApiError(400, 'Invalid lead stage');
    }
    const normalizedTemperature = leadTemperature !== undefined ? String(leadTemperature || '').toUpperCase() : current.lead_temperature;
    if (leadTemperature !== undefined && !['COLD', 'WARM', 'HOT'].includes(normalizedTemperature)) {
      throw new ApiError(400, 'Invalid lead temperature');
    }
    const resolvedOwnerId = leadOwnerId !== undefined ? (leadOwnerId ? Number(leadOwnerId) : null) : current.lead_owner_id;
    if (resolvedOwnerId !== null && (!Number.isInteger(resolvedOwnerId) || resolvedOwnerId <= 0)) {
      throw new ApiError(400, 'Invalid lead owner');
    }
    let normalizedLeadScore = current.lead_score;
    if (leadScore !== undefined && leadScore !== null && String(leadScore).trim() !== '') {
      const parsedLeadScore = Number(leadScore);
      if (!Number.isInteger(parsedLeadScore) || parsedLeadScore < 0 || parsedLeadScore > 100) {
        throw new ApiError(400, 'Lead score must be an integer between 0 and 100');
      }
      normalizedLeadScore = parsedLeadScore;
    }
    const resolvedLeadSlaDueAt = leadSlaDueAt !== undefined
      ? (leadSlaDueAt || null)
      : (
        current.lead_sla_due_at
        || (['ROUTED', 'WORKING'].includes(normalizedStage) ? new Date(Date.now() + (48 * 60 * 60 * 1000)).toISOString() : null)
      );

    await client.query(
      `UPDATE customer_accounts
       SET lead_stage = $1,
           lead_owner_id = $2,
           lead_temperature = $3,
           lead_source_detail = $4,
           lead_qualification_notes = $5,
           lead_disqualification_reason = $6,
           lead_sla_due_at = $7,
           lead_score = $8,
           lead_next_action = $9,
           lead_next_action_due_at = $10,
           lead_last_worked_at = NOW(),
           lead_routed_at = CASE WHEN $2::integer IS NOT NULL OR $1 = 'ROUTED' THEN NOW() ELSE lead_routed_at END,
           lead_qualified_at = CASE WHEN $1 = 'QUALIFIED' THEN NOW() ELSE lead_qualified_at END,
           updated_at = NOW()
       WHERE id = $11`,
      [
        normalizedStage || current.lead_stage || 'NEW',
        resolvedOwnerId,
        normalizedTemperature || current.lead_temperature || 'COLD',
        leadSourceDetail !== undefined ? (leadSourceDetail || null) : null,
        leadQualificationNotes !== undefined ? (leadQualificationNotes || null) : null,
        leadDisqualificationReason !== undefined ? (leadDisqualificationReason || null) : null,
        resolvedLeadSlaDueAt,
        normalizedLeadScore,
        leadNextAction !== undefined ? (leadNextAction || null) : current.lead_next_action,
        leadNextActionDueAt !== undefined ? (leadNextActionDueAt || null) : current.lead_next_action_due_at,
        accountId,
      ]
    );

    if (resolvedOwnerId && resolvedOwnerId !== current.lead_owner_id) {
      await createNotification(client, {
        userId: resolvedOwnerId,
        title: 'Lead Assigned',
        message: `${current.customer_name || current.customer_number} has been assigned to you as a CRM lead.`,
        severity: 'INFO',
        linkedType: 'LEAD',
        linkedId: accountId,
        payload: { accountId, leadStage: normalizedStage || current.lead_stage || 'NEW' },
      });
    }

    await ensureLeadFollowupTask(client, {
      accountId,
      customerNumber: current.customer_number,
      stageName: normalizedStage || current.lead_stage || 'NEW',
      ownerId: resolvedOwnerId,
      actorUserId: req.user.id,
    });

    const detail = await client.query(
      `SELECT
         a.id,
         a.customer_name,
         a.customer_number,
         a.customer_status,
         a.outlet_name,
         a.lead_score,
         a.lead_stage,
         a.lead_temperature,
         a.lead_source_detail,
         a.lead_sla_due_at,
         a.lead_routed_at,
         a.lead_qualified_at,
         a.lead_next_action,
         a.lead_next_action_due_at,
         a.lead_last_worked_at,
         a.lead_disqualification_reason,
         a.lead_qualification_notes,
         a.source,
         a.updated_at,
         u.full_name AS lead_owner_name
       FROM customer_accounts a
       LEFT JOIN users u ON u.id = a.lead_owner_id
       WHERE a.id = $1`,
      [accountId]
    );

    await client.query('COMMIT');
    res.json({ lead: detail.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '42703' || error?.code === '42P01') {
      return res.status(400).json({ message: 'CRM task schema is not fully migrated.' });
    }
    next(error);
  } finally {
    client.release();
  }
}

async function getCustomerDetails(req, res, next) {
  try {
    const accountId = Number(req.params.id);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new ApiError(400, 'Invalid customer account id');
    const scopedOutlet = getCrmOutletScope(req);

    const accountResult = await pool.query(
      `SELECT *
       FROM customer_accounts
       WHERE id = $1`,
      [accountId]
    );
    const account = accountResult.rows[0];
    if (!account) return res.status(404).json({ message: 'Customer not found' });
    await ensureAccountAccess(pool, accountId, scopedOutlet, req.user.id, false);
    const interactionColumns = await getTableColumnSet('customer_interactions', pool);
    const hasConversationOwnerId = interactionColumns.has('conversation_owner_id');
    const interactionOwnerSelect = hasConversationOwnerId
      ? 'owner_user.full_name AS conversation_owner_name,'
      : 'NULL::text AS conversation_owner_name,';
    const interactionOwnerJoin = hasConversationOwnerId
      ? 'LEFT JOIN users owner_user ON owner_user.id = ci.conversation_owner_id'
      : '';

    const [ordersRes, interactionsRes, ledgerRes, opportunitiesRes, tasksRes, timelineRes, contactsRes, parentRes, childrenRes, duplicatesRes] = await Promise.all([
      pool.query(
        `SELECT o.id,
                o.production_order_no,
                o.order_date,
                o.due_date,
                o.status,
                o.order_type,
                o.production_flow,
                o.current_stage_id,
                ps.name AS current_stage,
                o.product_price,
                o.advance_paid,
                o.comments,
                r.item_condition,
                r.refurbishment_type,
                r.issue_description,
                r.work_requested,
                r.accessories_received,
                ret.return_condition,
                ret.return_reason,
                ret.return_request,
                ret.accessories_received AS return_accessories_received,
                COALESCE(rc.replacement_count, 0)::int AS replacement_count
         FROM orders o
         LEFT JOIN production_stages ps ON ps.id = o.current_stage_id
         LEFT JOIN order_refurbishments r ON r.order_id = o.id
         LEFT JOIN order_returns ret ON ret.order_id = o.id
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS replacement_count
           FROM retail_recovery_cases rc
           WHERE rc.original_order_id = o.id
         ) rc ON TRUE
         WHERE LOWER(customer_number) = LOWER($1)
         ORDER BY o.order_date DESC, o.created_at DESC
         LIMIT 50`,
        [account.customer_number]
      ),
      pool.query(
        `SELECT
                ci.id,
                ci.interaction_type,
                ci.subject,
                ci.notes,
                ci.next_followup_at,
                ci.created_at,
                ci.direction,
                ci.thread_key,
                ci.response_sla_minutes,
                ci.response_due_at,
                ci.responded_at,
                ci.channel_status,
                ci.is_unread,
                ${interactionOwnerSelect}
                u.full_name AS created_by_name
         FROM customer_interactions ci
         LEFT JOIN users u ON u.id = ci.created_by
         ${interactionOwnerJoin}
         WHERE ci.account_id = $1
         ORDER BY ci.created_at DESC
         LIMIT 100`,
        [account.id]
      ),
      pool.query(
        `SELECT id, entry_date, entry_type, category, amount, reference_order_id, notes, created_at
         FROM customer_ledger_entries
         WHERE account_id = $1
         ORDER BY entry_date DESC, id DESC
         LIMIT 200`,
        [account.id]
      ),
      pool.query(
        `SELECT op.id,
                op.title,
                op.stage,
                op.status,
                op.probability,
                op.expected_value,
                op.expected_close_date,
                op.source,
                op.notes,
                op.owner_id,
                op.created_at,
                op.updated_at,
                u.full_name AS owner_name,
                (op.expected_value * op.probability / 100.0)::numeric(12,2) AS weighted_value
         FROM crm_opportunities op
         LEFT JOIN users u ON u.id = op.owner_id
         WHERE op.account_id = $1
         ORDER BY op.updated_at DESC, op.id DESC
         LIMIT 100`,
        [account.id]
      ),
      pool.query(
        `SELECT
                t.id,
                t.title,
                t.description,
                t.due_date,
                t.priority,
                t.status,
                t.assigned_to,
                t.created_at,
                t.updated_at,
                t.recurrence_type,
                t.recurrence_interval_days,
                template.name AS template_name,
                COALESCE(dep.depends_on_ids, ARRAY[]::int[]) AS dependency_ids,
                COALESCE(dep.open_dependency_count, 0)::int AS open_dependency_count
         FROM crm_tasks t
         LEFT JOIN crm_task_templates template ON template.id = t.template_id
         LEFT JOIN LATERAL (
           SELECT
             ARRAY_REMOVE(ARRAY_AGG(td.depends_on_task_id ORDER BY td.depends_on_task_id), NULL) AS depends_on_ids,
             COUNT(*) FILTER (WHERE blocker.status <> 'COMPLETED') AS open_dependency_count
           FROM crm_task_dependencies td
           LEFT JOIN crm_tasks blocker ON blocker.id = td.depends_on_task_id
           WHERE td.task_id = t.id
         ) dep ON TRUE
         WHERE t.account_id = $1
         ORDER BY t.due_date ASC, t.updated_at DESC
         LIMIT 150`,
        [account.id]
      ),
      pool.query(
        `SELECT *
         FROM (
           SELECT
             COALESCE(o.created_at, o.order_date::timestamp) AS event_at,
             'ORDER'::text AS event_type,
             'Order Created'::text AS title,
             o.production_order_no::text AS subtitle,
             o.status::text AS status,
             o.id::int AS reference_id,
             COALESCE(o.product_price, 0)::numeric(12,2) AS amount,
             jsonb_build_object(
               'orderNo', o.production_order_no,
               'orderDate', o.order_date,
               'dueDate', o.due_date,
               'advancePaid', COALESCE(o.advance_paid, 0),
               'status', o.status,
               'orderType', o.order_type,
               'currentStage', ps.name
             ) AS payload
           FROM orders o
           LEFT JOIN production_stages ps ON ps.id = o.current_stage_id
           WHERE LOWER(o.customer_number) = LOWER($1)

           UNION ALL

           SELECT
             ci.created_at AS event_at,
             'INTERACTION'::text AS event_type,
             ('Interaction - ' || ci.interaction_type)::text AS title,
             COALESCE(ci.subject, '')::text AS subtitle,
             ci.interaction_type::text AS status,
             ci.id::int AS reference_id,
             NULL::numeric(12,2) AS amount,
             jsonb_build_object(
               'notes', ci.notes,
               'nextFollowupAt', ci.next_followup_at,
               'createdBy', u.full_name
             ) AS payload
           FROM customer_interactions ci
           LEFT JOIN users u ON u.id = ci.created_by
           WHERE ci.account_id = $2

           UNION ALL

           SELECT
             COALESCE(le.created_at, le.entry_date::timestamp) AS event_at,
             'LEDGER'::text AS event_type,
             ('Ledger ' || le.entry_type)::text AS title,
             COALESCE(le.category, '')::text AS subtitle,
             le.entry_type::text AS status,
             le.id::int AS reference_id,
             COALESCE(le.amount, 0)::numeric(12,2) AS amount,
             jsonb_build_object(
               'category', le.category,
               'notes', le.notes,
               'referenceOrderId', le.reference_order_id
             ) AS payload
           FROM customer_ledger_entries le
           WHERE le.account_id = $2

           UNION ALL

           SELECT
             op.updated_at AS event_at,
             'OPPORTUNITY'::text AS event_type,
             ('Opportunity - ' || op.stage)::text AS title,
             op.title::text AS subtitle,
             op.status::text AS status,
             op.id::int AS reference_id,
             COALESCE(op.expected_value, 0)::numeric(12,2) AS amount,
             jsonb_build_object(
               'stage', op.stage,
               'probability', op.probability,
               'expectedCloseDate', op.expected_close_date
             ) AS payload
           FROM crm_opportunities op
           WHERE op.account_id = $2

           UNION ALL

           SELECT
             COALESCE(t.updated_at, t.created_at) AS event_at,
             'TASK'::text AS event_type,
             ('Task - ' || t.priority)::text AS title,
             t.title::text AS subtitle,
             t.status::text AS status,
             t.id::int AS reference_id,
             NULL::numeric(12,2) AS amount,
             jsonb_build_object(
               'dueDate', t.due_date,
               'description', t.description
             ) AS payload
           FROM crm_tasks t
           WHERE t.account_id = $2
         ) timeline
         ORDER BY event_at DESC NULLS LAST
         LIMIT 300`,
        [account.customer_number, account.id]
      ),
      pool.query(
        `SELECT
           c.id, c.account_id, c.first_name, c.last_name, c.email, c.phone, c.title, c.department, c.is_primary, c.status, c.notes, c.updated_at,
           u.full_name AS owner_name
         FROM crm_contacts c
         LEFT JOIN users u ON u.id = c.owner_id
         WHERE c.account_id = $1
         ORDER BY c.is_primary DESC, c.updated_at DESC, c.id DESC`,
        [account.id]
      ),
      account.parent_account_id
        ? pool.query(
          `SELECT id, customer_name, customer_number, outlet_name, customer_status, account_tier, customer_segment
           FROM customer_accounts
           WHERE id = $1`,
          [account.parent_account_id]
        )
        : Promise.resolve({ rows: [] }),
      pool.query(
        `SELECT id, customer_name, customer_number, outlet_name, customer_status, account_tier, customer_segment
         FROM customer_accounts
         WHERE parent_account_id = $1
         ORDER BY updated_at DESC, id DESC
         LIMIT 50`,
        [account.id]
      ),
      pool.query(
        `SELECT id, customer_name, customer_number, email, outlet_name, customer_status
         FROM customer_accounts
         WHERE id <> $1
           AND (
             (TRIM(COALESCE(email, '')) <> '' AND LOWER(email) = LOWER($2))
             OR LOWER(customer_number) = LOWER($3)
           )
         ORDER BY updated_at DESC, id DESC
         LIMIT 20`,
        [account.id, account.email || '', account.customer_number || '']
      ),
    ]);

    const ledgerSummary = ledgerRes.rows.reduce((acc, e) => {
      const amount = Number(e.amount || 0);
      if (e.entry_type === 'DEBIT') acc.total_debit += amount;
      if (e.entry_type === 'CREDIT') acc.total_credit += amount;
      return acc;
    }, { total_debit: 0, total_credit: 0, balance: 0 });
    ledgerSummary.balance = ledgerSummary.total_debit - ledgerSummary.total_credit;

    res.json({
      account,
      orders: ordersRes.rows,
      contacts: contactsRes.rows,
      interactions: interactionsRes.rows,
      opportunities: opportunitiesRes.rows,
      tasks: tasksRes.rows,
      timeline: timelineRes.rows,
      parent_account: parentRes.rows[0] || null,
      child_accounts: childrenRes.rows,
      duplicate_accounts: duplicatesRes.rows,
      service_summary: {
        refurbishment_count: ordersRes.rows.filter((row) => String(row.order_type || '').toUpperCase() === 'REFURBISHMENT').length,
        return_count: ordersRes.rows.filter((row) => String(row.order_type || '').toUpperCase() === 'RETURN').length,
        replacement_touched_count: ordersRes.rows.filter((row) => Number(row.replacement_count || 0) > 0).length,
      },
      ledger: {
        summary: ledgerSummary,
        entries: ledgerRes.rows,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function updateCustomer(req, res, next) {
  const client = await pool.connect();
  try {
    const accountId = Number(req.params.id);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new ApiError(400, 'Invalid customer account id');
    const scopedOutlet = getCrmOutletScope(req);
    const {
      customerName,
      customerAddress,
      email,
      preferredContact,
      customerStatus,
      leadScore,
      source,
      tags,
      notes,
      birthDate,
      anniversaryDate,
      parentAccountId,
      accountTier,
      relationshipType,
      customerSegment,
      successOwnerId,
      riskFlagReason,
    } = req.body || {};

    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, customer_number FROM customer_accounts WHERE id = $1`,
      [accountId]
    );
    const account = found.rows[0];
    if (!account) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Customer not found' });
    }
    await ensureAccountAccess(client, accountId, scopedOutlet, req.user.id, true);

    const editableMap = await getEditableFieldMap(client, req.user.role);
    const requestedFields = [
      ['customerName', customerName],
      ['customerAddress', customerAddress],
      ['email', email],
      ['preferredContact', preferredContact],
      ['customerStatus', customerStatus],
      ['leadScore', leadScore],
      ['source', source],
      ['tags', tags],
      ['notes', notes],
      ['birthDate', birthDate],
      ['anniversaryDate', anniversaryDate],
      ['parentAccountId', parentAccountId],
      ['accountTier', accountTier],
      ['relationshipType', relationshipType],
      ['customerSegment', customerSegment],
      ['successOwnerId', successOwnerId],
      ['riskFlagReason', riskFlagReason],
    ];
    const blocked = requestedFields.find(([key, value]) => value !== undefined && editableMap.has(key) && !editableMap.get(key));
    if (blocked) {
      await client.query('ROLLBACK');
      return res.status(403).json({ message: `Field "${blocked[0]}" is read-only for role ${req.user.role}` });
    }

    const normalizedStatus = String(customerStatus || '').trim().toUpperCase();
    if (normalizedStatus && !['ACTIVE', 'INACTIVE', 'BLOCKED'].includes(normalizedStatus)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Invalid customer status' });
    }
    let normalizedLeadScore = null;
    if (leadScore !== undefined && leadScore !== null && String(leadScore).trim() !== '') {
      const parsedLeadScore = Number(leadScore);
      if (!Number.isInteger(parsedLeadScore) || parsedLeadScore < 0 || parsedLeadScore > 100) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Lead score must be an integer between 0 and 100' });
      }
      normalizedLeadScore = parsedLeadScore;
    }

    await client.query(
      `UPDATE customer_accounts
       SET customer_name = COALESCE($1, customer_name),
           customer_address = COALESCE($2, customer_address),
           email = COALESCE($3, email),
           preferred_contact = COALESCE($4, preferred_contact),
           customer_status = COALESCE($5, customer_status),
           source = COALESCE($6, source),
           tags = COALESCE($7, tags),
           notes = COALESCE($8, notes),
           birth_date = COALESCE($9, birth_date),
           anniversary_date = COALESCE($10, anniversary_date),
           lead_score = COALESCE($11, lead_score),
           parent_account_id = $12,
           account_tier = COALESCE($13, account_tier),
           relationship_type = $14,
           customer_segment = $15,
           success_owner_id = $16,
           risk_flag_reason = $17,
           updated_at = NOW()
       WHERE id = $18`,
      [
        customerName || null,
        customerAddress || null,
        email || null,
        preferredContact || null,
        normalizedStatus || null,
        source || null,
        tags || null,
        notes || null,
        birthDate || null,
        anniversaryDate || null,
        normalizedLeadScore,
        parentAccountId ? Number(parentAccountId) : null,
        accountTier || null,
        relationshipType || null,
        customerSegment || null,
        successOwnerId ? Number(successOwnerId) : null,
        riskFlagReason || null,
        accountId,
      ]
    );

    const refreshedCustomer = await client.query(
      `SELECT id, customer_name, customer_number, lead_score
       FROM customer_accounts
       WHERE id = $1`,
      [accountId]
    );

    await runCustomerAutomation(client, refreshedCustomer.rows[0], req.user.id);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '42703' || error?.code === '42P01') {
      return res.status(400).json({ message: 'CRM task schema is not fully migrated.' });
    }
    next(error);
  } finally {
    client.release();
  }
}

async function getCustomerMergePreview(req, res, next) {
  try {
    const sourceId = Number(req.params.id);
    const targetId = Number(req.query.targetId || 0);
    if (!Number.isInteger(sourceId) || sourceId <= 0) throw new ApiError(400, 'Invalid source account id');
    if (!Number.isInteger(targetId) || targetId <= 0) throw new ApiError(400, 'Invalid target account id');
    if (sourceId === targetId) throw new ApiError(400, 'Source and target accounts must be different');

    const scopedOutlet = getCrmOutletScope(req);
    await ensureAccountAccess(pool, sourceId, scopedOutlet, req.user.id, true);
    await ensureAccountAccess(pool, targetId, scopedOutlet, req.user.id, true);

    const [sourceRes, targetRes, previewRes] = await Promise.all([
      pool.query(`SELECT id, customer_name, customer_number, email, outlet_name, customer_status FROM customer_accounts WHERE id = $1`, [sourceId]),
      pool.query(`SELECT id, customer_name, customer_number, email, outlet_name, customer_status FROM customer_accounts WHERE id = $1`, [targetId]),
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM crm_contacts WHERE account_id = $1) AS contacts_to_move,
           (SELECT COUNT(*)::int FROM customer_interactions WHERE account_id = $1) AS interactions_to_move,
           (SELECT COUNT(*)::int FROM customer_ledger_entries WHERE account_id = $1) AS ledger_entries_to_move,
           (SELECT COUNT(*)::int FROM crm_opportunities WHERE account_id = $1) AS opportunities_to_move,
           (SELECT COUNT(*)::int FROM crm_tasks WHERE account_id = $1) AS tasks_to_move,
           (SELECT COUNT(*)::int FROM crm_cases WHERE account_id = $1) AS cases_to_move,
           (SELECT COUNT(*)::int FROM orders WHERE LOWER(customer_number) = LOWER((SELECT customer_number FROM customer_accounts WHERE id = $1))) AS orders_to_rekey`,
        [sourceId]
      ),
    ]);

    res.json({
      source_account: sourceRes.rows[0] || null,
      target_account: targetRes.rows[0] || null,
      preview: previewRes.rows[0] || {},
    });
  } catch (error) {
    next(error);
  }
}

async function mergeCustomers(req, res, next) {
  const client = await pool.connect();
  try {
    const sourceId = Number(req.params.id);
    const targetId = Number(req.body?.targetId || 0);
    if (!Number.isInteger(sourceId) || sourceId <= 0) throw new ApiError(400, 'Invalid source account id');
    if (!Number.isInteger(targetId) || targetId <= 0) throw new ApiError(400, 'Invalid target account id');
    if (sourceId === targetId) throw new ApiError(400, 'Source and target accounts must be different');

    const scopedOutlet = getCrmOutletScope(req);
    await client.query('BEGIN');

    await ensureAccountAccess(client, sourceId, scopedOutlet, req.user.id, true);
    await ensureAccountAccess(client, targetId, scopedOutlet, req.user.id, true);

    const sourceRes = await client.query(`SELECT id, customer_name, customer_number, notes FROM customer_accounts WHERE id = $1 FOR UPDATE`, [sourceId]);
    const targetRes = await client.query(`SELECT id, customer_name, customer_number FROM customer_accounts WHERE id = $1 FOR UPDATE`, [targetId]);
    const source = sourceRes.rows[0];
    const target = targetRes.rows[0];
    if (!source || !target) throw new ApiError(404, 'Source or target customer not found');

    await client.query(`UPDATE crm_contacts SET account_id = $1, updated_at = NOW() WHERE account_id = $2`, [targetId, sourceId]);
    await client.query(`UPDATE customer_interactions SET account_id = $1 WHERE account_id = $2`, [targetId, sourceId]);
    await client.query(`UPDATE customer_ledger_entries SET account_id = $1 WHERE account_id = $2`, [targetId, sourceId]);
    await client.query(`UPDATE crm_opportunities SET account_id = $1, updated_at = NOW() WHERE account_id = $2`, [targetId, sourceId]);
    await client.query(`UPDATE crm_tasks SET account_id = $1, updated_at = NOW() WHERE account_id = $2`, [targetId, sourceId]);
    await client.query(`UPDATE crm_cases SET account_id = $1, updated_at = NOW() WHERE account_id = $2`, [targetId, sourceId]);
    await client.query(`UPDATE crm_campaign_members SET account_id = $1, updated_at = NOW() WHERE account_id = $2`, [targetId, sourceId]);
    await client.query(`UPDATE orders SET customer_number = $1 WHERE LOWER(customer_number) = LOWER($2)`, [target.customer_number, source.customer_number]);
    await client.query(`UPDATE customer_accounts SET parent_account_id = $1 WHERE parent_account_id = $2`, [targetId, sourceId]);

    const mergedNote = `Merged into ${target.customer_number} on ${new Date().toISOString()}`;
    await client.query(
      `UPDATE customer_accounts
       SET customer_status = 'INACTIVE',
           notes = CONCAT(COALESCE(notes, ''), CASE WHEN COALESCE(notes, '') = '' THEN '' ELSE E'\n' END, $1),
           updated_at = NOW()
       WHERE id = $2`,
      [mergedNote, sourceId]
    );

    await client.query('COMMIT');
    res.json({
      ok: true,
      merged_from: sourceId,
      merged_into: targetId,
      message: `${source.customer_name || source.customer_number} merged into ${target.customer_name || target.customer_number}`,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '42703' || error?.code === '42P01') {
      return res.status(400).json({ message: 'CRM notification schema is not fully migrated.' });
    }
    next(error);
  } finally {
    client.release();
  }
}

async function addInteraction(req, res, next) {
  const client = await pool.connect();
  try {
    const accountId = Number(req.params.id);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new ApiError(400, 'Invalid customer account id');
    const scopedOutlet = getCrmOutletScope(req);
    const {
      interactionType,
      subject,
      notes,
      nextFollowupAt,
      direction,
      threadKey,
      conversationOwnerId,
      responseSlaMinutes,
      responseDueAt,
      channelStatus,
      isUnread,
    } = req.body || {};
    const type = normalizeInteractionType(interactionType);
    if (!String(notes || '').trim()) throw new ApiError(400, 'Notes are required');
    const normalizedDirection = normalizeInteractionDirection(direction) || 'OUTBOUND';
    const normalizedStatus = normalizeCommunicationStatus(channelStatus) || 'OPEN';
    const normalizedOwnerId = conversationOwnerId ? Number(conversationOwnerId) : req.user.id;
    if (!Number.isInteger(normalizedOwnerId) || normalizedOwnerId <= 0) {
      throw new ApiError(400, 'Invalid conversation owner');
    }
    const normalizedThreadKey = buildInteractionThreadKey(accountId, type, threadKey);
    const parsedSlaMinutes = responseSlaMinutes === undefined || responseSlaMinutes === null || String(responseSlaMinutes).trim() === ''
      ? (normalizedDirection === 'INBOUND' ? 60 : null)
      : Number(responseSlaMinutes);
    if (parsedSlaMinutes !== null && (!Number.isFinite(parsedSlaMinutes) || parsedSlaMinutes < 0)) {
      throw new ApiError(400, 'responseSlaMinutes must be a positive number');
    }
    const derivedResponseDueAt = responseDueAt
      || (normalizedDirection === 'INBOUND' && parsedSlaMinutes !== null
        ? new Date(Date.now() + (parsedSlaMinutes * 60 * 1000)).toISOString()
        : null);

    await client.query('BEGIN');
    const account = await ensureAccountAccess(client, accountId, scopedOutlet, req.user.id, true);

    if (normalizedDirection === 'OUTBOUND') {
      await client.query(
        `UPDATE customer_interactions
         SET responded_at = COALESCE(responded_at, NOW()),
             channel_status = 'CLOSED',
             is_unread = FALSE
         WHERE account_id = $1
           AND interaction_type = $2
           AND direction = 'INBOUND'
           AND responded_at IS NULL
           AND channel_status IN ('OPEN', 'PENDING')
           AND COALESCE(thread_key, '') = COALESCE($3, '')`,
        [accountId, type, normalizedThreadKey]
      );
    }

    const inserted = await client.query(
      `INSERT INTO customer_interactions
       (account_id, interaction_type, subject, notes, next_followup_at, created_by, created_at,
        direction, thread_key, conversation_owner_id, response_sla_minutes, response_due_at,
        responded_at, channel_status, is_unread)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, interaction_type, subject, notes, next_followup_at, created_at,
                 direction, thread_key, response_sla_minutes, response_due_at, responded_at,
                 channel_status, is_unread`,
      [
        accountId,
        type,
        subject || null,
        notes,
        nextFollowupAt || null,
        req.user.id,
        normalizedDirection,
        normalizedThreadKey,
        normalizedOwnerId,
        parsedSlaMinutes,
        derivedResponseDueAt,
        normalizedDirection === 'OUTBOUND' ? new Date().toISOString() : null,
        normalizedStatus,
        isUnread === undefined ? normalizedDirection === 'INBOUND' : Boolean(isUnread),
      ]
    );
    await client.query(
      `UPDATE customer_accounts
       SET last_contact_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [account.id]
    );
    if (normalizedDirection === 'INBOUND') {
      await createNotification(client, {
        userId: normalizedOwnerId,
        title: `Inbound ${type}`,
        message: `${account.customer_name || account.customer_number} sent a new ${type} message.`,
        severity: 'INFO',
        linkedType: 'COMMUNICATION',
        linkedId: inserted.rows[0].id,
        payload: {
          accountId: account.id,
          interactionId: inserted.rows[0].id,
          threadKey: normalizedThreadKey,
        },
      });
    }
    await ensureCommunicationAlerts(client);
    await client.query('COMMIT');
    res.status(201).json({ interaction: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function getOpportunitySummary(req, res, next) {
  try {
    const { search = '', stage = '', status = '', outlet = '', accountId = '' } = req.query;
    const scopedOutlet = getCrmOutletScope(req);
    const values = [];
    const whereClause = buildOpportunityWhereClause({ search, stage, status, outlet, scopedOutlet, accountId }, values);

    const totalsRes = await pool.query(
      `SELECT
         COUNT(*)::int AS total_count,
         COALESCE(SUM(CASE WHEN op.status = 'OPEN' THEN 1 ELSE 0 END), 0)::int AS open_count,
         COALESCE(SUM(CASE WHEN op.status = 'WON' THEN 1 ELSE 0 END), 0)::int AS won_count,
         COALESCE(SUM(CASE WHEN op.status = 'LOST' THEN 1 ELSE 0 END), 0)::int AS lost_count,
         COALESCE(SUM(op.expected_value), 0)::numeric(12,2) AS total_pipeline_value,
         COALESCE(SUM(op.expected_value * op.probability / 100.0), 0)::numeric(12,2) AS weighted_pipeline_value,
         COALESCE(SUM(CASE WHEN op.status = 'WON' THEN op.expected_value ELSE 0 END), 0)::numeric(12,2) AS won_value
       FROM crm_opportunities op
       JOIN customer_accounts a ON a.id = op.account_id
       ${whereClause}`,
      values
    );

    const stageRes = await pool.query(
      `SELECT
         op.stage,
         COUNT(*)::int AS count,
         COALESCE(SUM(op.expected_value), 0)::numeric(12,2) AS value,
         COALESCE(SUM(op.expected_value * op.probability / 100.0), 0)::numeric(12,2) AS weighted_value
       FROM crm_opportunities op
       JOIN customer_accounts a ON a.id = op.account_id
       ${whereClause}
       GROUP BY op.stage
       ORDER BY CASE op.stage
         WHEN 'QUALIFICATION' THEN 1
         WHEN 'NEEDS_ANALYSIS' THEN 2
         WHEN 'PROPOSAL' THEN 3
         WHEN 'NEGOTIATION' THEN 4
         WHEN 'CLOSED_WON' THEN 5
         WHEN 'CLOSED_LOST' THEN 6
         ELSE 99
       END`,
      values
    );

    res.json({
      summary: totalsRes.rows[0] || {},
      by_stage: stageRes.rows || [],
      scoped_outlet: scopedOutlet || null,
    });
  } catch (error) {
    next(error);
  }
}

async function listOpportunities(req, res, next) {
  try {
    const { search = '', stage = '', status = '', outlet = '', accountId = '' } = req.query;
    const scopedOutlet = getCrmOutletScope(req);
    const values = [];
    const whereClause = buildOpportunityWhereClause({ search, stage, status, outlet, scopedOutlet, accountId }, values);

    const { rows } = await pool.query(
      `SELECT
         op.id,
         op.account_id,
         op.title,
         op.stage,
         op.status,
         op.probability,
         op.expected_value,
         op.expected_close_date,
         op.source,
         op.notes,
         op.competitor_name,
         op.win_reason,
         op.loss_reason,
         op.next_step,
         op.next_step_due_at,
         op.risk_level,
         op.close_plan,
         op.buying_committee,
         op.owner_id,
         op.won_at,
         op.lost_at,
         op.created_at,
         op.updated_at,
         a.customer_name,
         a.customer_number,
         a.outlet_name,
         u.full_name AS owner_name,
         (op.expected_value * op.probability / 100.0)::numeric(12,2) AS weighted_value,
         COALESCE((
           SELECT COUNT(*)
           FROM crm_opportunity_line_items li
           WHERE li.opportunity_id = op.id
         ), 0)::int AS line_item_count,
         COALESCE((
           SELECT SUM(li.line_total)
           FROM crm_opportunity_line_items li
           WHERE li.opportunity_id = op.id
         ), 0)::numeric(12,2) AS line_item_total
       FROM crm_opportunities op
       JOIN customer_accounts a ON a.id = op.account_id
       LEFT JOIN users u ON u.id = op.owner_id
       ${whereClause}
       ORDER BY CASE op.stage
         WHEN 'QUALIFICATION' THEN 1
         WHEN 'NEEDS_ANALYSIS' THEN 2
         WHEN 'PROPOSAL' THEN 3
         WHEN 'NEGOTIATION' THEN 4
         WHEN 'CLOSED_WON' THEN 5
         WHEN 'CLOSED_LOST' THEN 6
         ELSE 99
       END,
       op.expected_close_date NULLS LAST,
       op.updated_at DESC,
       op.id DESC
       LIMIT 500`,
      values
    );

    res.json({ opportunities: rows, scoped_outlet: scopedOutlet || null });
  } catch (error) {
    next(error);
  }
}

async function createOpportunity(req, res, next) {
  const client = await pool.connect();
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const {
      accountId,
      title,
      stage,
      status,
      probability,
      expectedValue,
      expectedCloseDate,
      source,
      notes,
      ownerId,
      competitorName,
      winReason,
      lossReason,
      nextStep,
      nextStepDueAt,
      riskLevel,
      closePlan,
      buyingCommittee,
    } = req.body || {};

    const parsedAccountId = Number(accountId);
    if (!Number.isInteger(parsedAccountId) || parsedAccountId <= 0) {
      throw new ApiError(400, 'Valid accountId is required');
    }
    if (!String(title || '').trim()) {
      throw new ApiError(400, 'Opportunity title is required');
    }

    const { stage: normalizedStage, status: normalizedStatus } = normalizeOpportunityState(stage, status);
    const parsedProbability = probability === undefined || probability === null || String(probability).trim() === ''
      ? 20
      : Number(probability);
    if (!Number.isInteger(parsedProbability) || parsedProbability < 0 || parsedProbability > 100) {
      throw new ApiError(400, 'Probability must be an integer between 0 and 100');
    }
    const parsedExpectedValue = expectedValue === undefined || expectedValue === null || String(expectedValue).trim() === ''
      ? 0
      : Number(expectedValue);
    if (!Number.isFinite(parsedExpectedValue) || parsedExpectedValue < 0) {
      throw new ApiError(400, 'Expected value must be a number greater than or equal to 0');
    }

    const normalizedRiskLevel = riskLevel ? String(riskLevel).toUpperCase() : 'MEDIUM';
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(normalizedRiskLevel)) {
      throw new ApiError(400, 'Risk level must be LOW, MEDIUM, HIGH, or CRITICAL');
    }

    await client.query('BEGIN');
    await ensureAccountAccess(client, parsedAccountId, scopedOutlet, req.user.id, true);

    const inserted = await client.query(
      `INSERT INTO crm_opportunities (
         account_id,
         title,
         stage,
         status,
         probability,
         expected_value,
         expected_close_date,
         source,
         notes,
         competitor_name,
         win_reason,
         loss_reason,
         next_step,
         next_step_due_at,
         risk_level,
         close_plan,
         buying_committee,
         owner_id,
         created_by,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())
       RETURNING id`,
      [
        parsedAccountId,
        String(title).trim(),
        normalizedStage,
        normalizedStatus,
        parsedProbability,
        parsedExpectedValue,
        expectedCloseDate || null,
        source || null,
        notes || null,
        competitorName || null,
        winReason || null,
        lossReason || null,
        nextStep || null,
        nextStepDueAt || null,
        normalizedRiskLevel,
        closePlan || null,
        buyingCommittee || null,
        ownerId ? Number(ownerId) : req.user.id,
        req.user.id,
      ]
    );

    await client.query(
      `UPDATE customer_accounts
       SET updated_at = NOW()
       WHERE id = $1`,
      [parsedAccountId]
    );

    const detail = await client.query(
      `SELECT
         op.id,
         op.account_id,
         op.title,
         op.stage,
         op.status,
         op.probability,
         op.expected_value,
         op.expected_close_date,
         op.source,
         op.notes,
         op.competitor_name,
         op.win_reason,
         op.loss_reason,
         op.next_step,
         op.next_step_due_at,
         op.risk_level,
         op.close_plan,
         op.buying_committee,
         op.owner_id,
         op.won_at,
         op.lost_at,
         op.created_at,
         op.updated_at,
         a.customer_name,
         a.customer_number,
         a.outlet_name,
         u.full_name AS owner_name,
         (op.expected_value * op.probability / 100.0)::numeric(12,2) AS weighted_value,
         COALESCE((
           SELECT COUNT(*)
           FROM crm_opportunity_line_items li
           WHERE li.opportunity_id = op.id
         ), 0)::int AS line_item_count,
         COALESCE((
           SELECT SUM(li.line_total)
           FROM crm_opportunity_line_items li
           WHERE li.opportunity_id = op.id
         ), 0)::numeric(12,2) AS line_item_total
       FROM crm_opportunities op
       JOIN customer_accounts a ON a.id = op.account_id
       LEFT JOIN users u ON u.id = op.owner_id
       WHERE op.id = $1`,
      [inserted.rows[0].id]
    );

    await runOpportunityAutomation(client, detail.rows[0], req.user.id);
    await client.query('COMMIT');
    res.status(201).json({ opportunity: detail.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateOpportunity(req, res, next) {
  const client = await pool.connect();
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const opportunityId = Number(req.params.id);
    if (!Number.isInteger(opportunityId) || opportunityId <= 0) {
      throw new ApiError(400, 'Invalid opportunity id');
    }

    await client.query('BEGIN');

    const found = await client.query(
      `SELECT id, account_id, title, stage, status, probability, expected_value, expected_close_date, source, notes, competitor_name, win_reason, loss_reason, next_step, next_step_due_at, risk_level, close_plan, buying_committee, owner_id
       FROM crm_opportunities
       WHERE id = $1`,
      [opportunityId]
    );
    const current = found.rows[0];
    if (!current) {
      throw new ApiError(404, 'Opportunity not found');
    }

    await ensureAccountAccess(client, current.account_id, scopedOutlet, req.user.id, true);

    const {
      title,
      stage,
      status,
      probability,
      expectedValue,
      expectedCloseDate,
      source,
      notes,
      ownerId,
      competitorName,
      winReason,
      lossReason,
      nextStep,
      nextStepDueAt,
      riskLevel,
      closePlan,
      buyingCommittee,
    } = req.body || {};

    const state = normalizeOpportunityState(stage || current.stage, status || current.status);

    let parsedProbability = current.probability;
    if (probability !== undefined) {
      parsedProbability = Number(probability);
      if (!Number.isInteger(parsedProbability) || parsedProbability < 0 || parsedProbability > 100) {
        throw new ApiError(400, 'Probability must be an integer between 0 and 100');
      }
    }

    let parsedExpectedValue = Number(current.expected_value || 0);
    if (expectedValue !== undefined) {
      parsedExpectedValue = Number(expectedValue);
      if (!Number.isFinite(parsedExpectedValue) || parsedExpectedValue < 0) {
        throw new ApiError(400, 'Expected value must be a number greater than or equal to 0');
      }
    }

    const normalizedRiskLevel = riskLevel !== undefined ? String(riskLevel || '').toUpperCase() : current.risk_level;
    if (!['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(normalizedRiskLevel)) {
      throw new ApiError(400, 'Risk level must be LOW, MEDIUM, HIGH, or CRITICAL');
    }

    const needsClosedWonApproval = state.stage === 'CLOSED_WON'
      && current.stage !== 'CLOSED_WON'
      && !req.user.permissions?.crm_manage_approvals;
    if (needsClosedWonApproval) {
      const requestedPayload = {
        title: title !== undefined ? (String(title || '').trim() || current.title) : current.title,
        stage: state.stage,
        status: state.status,
        probability: parsedProbability,
        expectedValue: parsedExpectedValue,
        expectedCloseDate: expectedCloseDate !== undefined ? (expectedCloseDate || null) : current.expected_close_date,
        source: source !== undefined ? (source || null) : current.source,
        notes: notes !== undefined ? (notes || null) : current.notes,
        competitorName: competitorName !== undefined ? (competitorName || null) : current.competitor_name,
        winReason: winReason !== undefined ? (winReason || null) : current.win_reason,
        lossReason: lossReason !== undefined ? (lossReason || null) : current.loss_reason,
        nextStep: nextStep !== undefined ? (nextStep || null) : current.next_step,
        nextStepDueAt: nextStepDueAt !== undefined ? (nextStepDueAt || null) : current.next_step_due_at,
        riskLevel: normalizedRiskLevel,
        closePlan: closePlan !== undefined ? (closePlan || null) : current.close_plan,
        buyingCommittee: buyingCommittee !== undefined ? (buyingCommittee || null) : current.buying_committee,
        ownerId: ownerId !== undefined ? (ownerId ? Number(ownerId) : null) : current.owner_id,
      };
      const approval = await ensureOpportunityStageApproval(client, {
        opportunityId,
        stageName: 'CLOSED_WON',
        expectedValue: parsedExpectedValue,
        requestedBy: req.user.id,
        payload: requestedPayload,
      });
      if (approval) {
        const approvers = await client.query(
          `SELECT u.id
           FROM users u
           JOIN roles r ON r.id = u.role_id
           WHERE r.name IN ('SUPER_USER', 'FINANCE')
           ORDER BY u.id ASC`
        );
        for (const approver of approvers.rows) {
          await createNotification(client, {
            userId: approver.id,
            title: 'Approval Required: Opportunity Closed Won',
            message: `Opportunity #${opportunityId} requires approval before moving to CLOSED_WON.`,
            severity: 'WARNING',
            linkedType: 'APPROVAL',
            linkedId: approval.approvalId,
            payload: { approvalId: approval.approvalId, opportunityId, stage: 'CLOSED_WON' },
          });
        }
        await client.query('COMMIT');
        res.status(202).json({
          approvalRequired: true,
          approvalId: approval.approvalId,
          message: 'Approval has been requested before closing this opportunity as won.',
        });
        return;
      }
    }

    await client.query(
      `UPDATE crm_opportunities
       SET title = $1,
           stage = $2,
           status = $3,
           probability = $4,
           expected_value = $5,
           expected_close_date = $6,
           source = $7,
           notes = $8,
           competitor_name = $9,
           win_reason = $10,
           loss_reason = $11,
           next_step = $12,
           next_step_due_at = $13,
           risk_level = $14,
           close_plan = $15,
           buying_committee = $16,
           owner_id = $17,
           updated_at = NOW()
       WHERE id = $18`,
      [
        title !== undefined ? String(title || '').trim() || current.title : current.title,
        state.stage,
        state.status,
        parsedProbability,
        parsedExpectedValue,
        expectedCloseDate !== undefined ? (expectedCloseDate || null) : current.expected_close_date,
        source !== undefined ? (source || null) : current.source,
        notes !== undefined ? (notes || null) : current.notes,
        competitorName !== undefined ? (competitorName || null) : current.competitor_name,
        winReason !== undefined ? (winReason || null) : current.win_reason,
        lossReason !== undefined ? (lossReason || null) : current.loss_reason,
        nextStep !== undefined ? (nextStep || null) : current.next_step,
        nextStepDueAt !== undefined ? (nextStepDueAt || null) : current.next_step_due_at,
        normalizedRiskLevel,
        closePlan !== undefined ? (closePlan || null) : current.close_plan,
        buyingCommittee !== undefined ? (buyingCommittee || null) : current.buying_committee,
        ownerId !== undefined ? (ownerId ? Number(ownerId) : null) : current.owner_id,
        opportunityId,
      ]
    );

    await client.query(
      `UPDATE customer_accounts
       SET updated_at = NOW()
       WHERE id = $1`,
      [current.account_id]
    );

    const detail = await client.query(
      `SELECT
         op.id,
         op.account_id,
         op.title,
         op.stage,
         op.status,
         op.probability,
         op.expected_value,
         op.expected_close_date,
         op.source,
         op.notes,
         op.competitor_name,
         op.win_reason,
         op.loss_reason,
         op.next_step,
         op.next_step_due_at,
         op.risk_level,
         op.close_plan,
         op.buying_committee,
         op.owner_id,
         op.won_at,
         op.lost_at,
         op.created_at,
         op.updated_at,
         a.customer_name,
         a.customer_number,
         a.outlet_name,
         u.full_name AS owner_name,
         (op.expected_value * op.probability / 100.0)::numeric(12,2) AS weighted_value,
         COALESCE((
           SELECT COUNT(*)
           FROM crm_opportunity_line_items li
           WHERE li.opportunity_id = op.id
         ), 0)::int AS line_item_count,
         COALESCE((
           SELECT SUM(li.line_total)
           FROM crm_opportunity_line_items li
           WHERE li.opportunity_id = op.id
         ), 0)::numeric(12,2) AS line_item_total
       FROM crm_opportunities op
       JOIN customer_accounts a ON a.id = op.account_id
       LEFT JOIN users u ON u.id = op.owner_id
       WHERE op.id = $1`,
      [opportunityId]
    );

    await runOpportunityAutomation(client, detail.rows[0], req.user.id);
    await client.query('COMMIT');
    res.json({ opportunity: detail.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listOpportunityLineItems(req, res, next) {
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const opportunityId = Number(req.params.id);
    if (!Number.isInteger(opportunityId) || opportunityId <= 0) {
      throw new ApiError(400, 'Invalid opportunity id');
    }

    await ensureOpportunityAccess(pool, opportunityId, scopedOutlet, req.user.id, false);

    const { rows } = await pool.query(
      `SELECT
         li.id,
         li.opportunity_id,
         li.product_name,
         li.quantity,
         li.unit_price,
         li.line_total,
         li.notes,
         li.created_at,
         u.full_name AS created_by_name
       FROM crm_opportunity_line_items li
       LEFT JOIN users u ON u.id = li.created_by
       WHERE li.opportunity_id = $1
       ORDER BY li.created_at DESC, li.id DESC`,
      [opportunityId]
    );

    res.json({ line_items: rows || [] });
  } catch (error) {
    next(error);
  }
}

async function addOpportunityLineItem(req, res, next) {
  const client = await pool.connect();
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const opportunityId = Number(req.params.id);
    if (!Number.isInteger(opportunityId) || opportunityId <= 0) {
      throw new ApiError(400, 'Invalid opportunity id');
    }
    const { productName, quantity, unitPrice, notes } = req.body || {};
    if (!String(productName || '').trim()) {
      throw new ApiError(400, 'Product name is required');
    }
    const parsedQuantity = Number(quantity || 0);
    const parsedUnitPrice = Number(unitPrice || 0);
    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      throw new ApiError(400, 'Quantity must be greater than 0');
    }
    if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice < 0) {
      throw new ApiError(400, 'Unit price must be 0 or greater');
    }

    await client.query('BEGIN');
    await ensureOpportunityAccess(client, opportunityId, scopedOutlet, req.user.id, true);

    const inserted = await client.query(
      `INSERT INTO crm_opportunity_line_items (
         opportunity_id,
         product_name,
         quantity,
         unit_price,
         notes,
         created_by,
         created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id`,
      [opportunityId, String(productName).trim(), parsedQuantity, parsedUnitPrice, notes || null, req.user.id]
    );

    await client.query(`UPDATE crm_opportunities SET updated_at = NOW() WHERE id = $1`, [opportunityId]);

    const detail = await client.query(
      `SELECT
         li.id,
         li.opportunity_id,
         li.product_name,
         li.quantity,
         li.unit_price,
         li.line_total,
         li.notes,
         li.created_at,
         u.full_name AS created_by_name
       FROM crm_opportunity_line_items li
       LEFT JOIN users u ON u.id = li.created_by
       WHERE li.id = $1`,
      [inserted.rows[0].id]
    );

    await client.query('COMMIT');
    res.status(201).json({ line_item: detail.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function getTaskSummary(req, res, next) {
  try {
    const { search = '', status = '', priority = '', dueBucket = '', outlet = '', accountId = '', assignedTo = '' } = req.query;
    const scopedOutlet = getCrmOutletScope(req);
    const values = [];
    const whereClause = buildTaskWhereClause({
      search, status, priority, dueBucket, outlet, scopedOutlet, accountId, assignedTo,
    }, values);

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_count,
         COALESCE(SUM(CASE WHEN t.status = 'OPEN' THEN 1 ELSE 0 END), 0)::int AS open_count,
         COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END), 0)::int AS completed_count,
         COALESCE(SUM(CASE WHEN t.status = 'CANCELLED' THEN 1 ELSE 0 END), 0)::int AS cancelled_count,
         COALESCE(SUM(CASE WHEN t.status = 'OPEN' AND t.due_date < CURRENT_DATE THEN 1 ELSE 0 END), 0)::int AS overdue_count,
         COALESCE(SUM(CASE WHEN t.status = 'OPEN' AND t.due_date = CURRENT_DATE THEN 1 ELSE 0 END), 0)::int AS due_today_count,
         COALESCE(SUM(CASE WHEN t.status = 'OPEN' AND t.due_date > CURRENT_DATE THEN 1 ELSE 0 END), 0)::int AS upcoming_count
       FROM crm_tasks t
       LEFT JOIN customer_accounts a ON a.id = t.account_id
       ${whereClause}`,
      values
    );

    res.json({
      summary: rows[0] || {},
      scoped_outlet: scopedOutlet || null,
    });
  } catch (error) {
    next(error);
  }
}

async function listTasks(req, res, next) {
  try {
    const { search = '', status = '', priority = '', dueBucket = '', outlet = '', accountId = '', assignedTo = '' } = req.query;
    const scopedOutlet = getCrmOutletScope(req);
    const values = [];
    const whereClause = buildTaskWhereClause({
      search, status, priority, dueBucket, outlet, scopedOutlet, accountId, assignedTo,
    }, values);

    const { rows } = await pool.query(
      `SELECT
         t.id,
         t.account_id,
         t.opportunity_id,
         t.title,
         t.description,
         t.due_date,
         t.priority,
         t.status,
         t.assigned_to,
         t.created_by,
         t.completed_at,
         t.created_at,
         t.updated_at,
         t.template_id,
         t.recurrence_type,
         t.recurrence_interval_days,
         t.parent_task_id,
         a.customer_name,
         a.customer_number,
         a.outlet_name,
         op.title AS opportunity_title,
         template.name AS template_name,
         assign_user.full_name AS assigned_to_name,
         create_user.full_name AS created_by_name,
         COALESCE(dep.dependency_ids, ARRAY[]::int[]) AS dependency_ids,
         COALESCE(dep.dependency_count, 0)::int AS dependency_count,
         COALESCE(dep.open_dependency_count, 0)::int AS open_dependency_count
       FROM crm_tasks t
       LEFT JOIN customer_accounts a ON a.id = t.account_id
       LEFT JOIN crm_opportunities op ON op.id = t.opportunity_id
       LEFT JOIN crm_task_templates template ON template.id = t.template_id
       LEFT JOIN users assign_user ON assign_user.id = t.assigned_to
       LEFT JOIN users create_user ON create_user.id = t.created_by
       LEFT JOIN LATERAL (
         SELECT
           ARRAY_REMOVE(ARRAY_AGG(td.depends_on_task_id ORDER BY td.depends_on_task_id), NULL) AS dependency_ids,
           COUNT(*)::int AS dependency_count,
           COUNT(*) FILTER (WHERE blocker.status <> 'COMPLETED')::int AS open_dependency_count
         FROM crm_task_dependencies td
         LEFT JOIN crm_tasks blocker ON blocker.id = td.depends_on_task_id
         WHERE td.task_id = t.id
       ) dep ON TRUE
       ${whereClause}
       ORDER BY
         CASE WHEN t.status = 'OPEN' AND t.due_date < CURRENT_DATE THEN 1 ELSE 2 END,
         CASE WHEN COALESCE(dep.open_dependency_count, 0) > 0 AND t.status = 'OPEN' THEN 2 ELSE 1 END,
         t.due_date ASC,
         CASE t.priority
           WHEN 'CRITICAL' THEN 1
           WHEN 'HIGH' THEN 2
           WHEN 'MEDIUM' THEN 3
           WHEN 'LOW' THEN 4
           ELSE 9
         END,
         t.updated_at DESC,
         t.id DESC
       LIMIT 500`,
      values
    );

    res.json({ tasks: rows, scoped_outlet: scopedOutlet || null });
  } catch (error) {
    next(error);
  }
}

async function createTask(req, res, next) {
  const client = await pool.connect();
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const {
      accountId,
      opportunityId,
      templateId,
      title,
      description,
      dueDate,
      priority,
      status,
      assignedTo,
      recurrenceType,
      recurrenceIntervalDays,
      dependencyIds = [],
    } = req.body || {};

    await client.query('BEGIN');
    let resolvedAccountId = accountId ? Number(accountId) : null;
    let resolvedOpportunityId = opportunityId ? Number(opportunityId) : null;
    const template = await resolveTaskTemplate(client, templateId);
    if (resolvedAccountId !== null && (!Number.isInteger(resolvedAccountId) || resolvedAccountId <= 0)) {
      throw new ApiError(400, 'Invalid accountId');
    }
    if (resolvedOpportunityId !== null && (!Number.isInteger(resolvedOpportunityId) || resolvedOpportunityId <= 0)) {
      throw new ApiError(400, 'Invalid opportunityId');
    }

    if (resolvedOpportunityId) {
      const oppRes = await client.query(
        `SELECT id, account_id FROM crm_opportunities WHERE id = $1`,
        [resolvedOpportunityId]
      );
      const opp = oppRes.rows[0];
      if (!opp) throw new ApiError(404, 'Opportunity not found');
      resolvedAccountId = resolvedAccountId || opp.account_id;
      if (resolvedAccountId !== opp.account_id) {
        throw new ApiError(400, 'Opportunity account mismatch');
      }
    }
    if (resolvedAccountId) {
      await ensureAccountAccess(client, resolvedAccountId, scopedOutlet, req.user.id, true);
    } else if (scopedOutlet) {
      throw new ApiError(400, 'accountId is required for scoped outlet users');
    }

    const resolvedTitle = String(title || template?.title || '').trim();
    if (!resolvedTitle) throw new ApiError(400, 'Task title is required');
    const resolvedDueDate = String(dueDate || '').trim()
      || (template ? addDays(new Date().toISOString().slice(0, 10), Number(template.default_due_in_days || 0)) : '');
    if (!resolvedDueDate) throw new ApiError(400, 'Task due date is required');
    const normalizedPriority = normalizeTaskPriority(priority || template?.priority) || 'MEDIUM';
    const normalizedStatus = normalizeTaskStatus(status) || 'OPEN';
    const normalizedRecurrenceType = normalizeTaskRecurrenceType(recurrenceType || template?.default_recurrence_type);
    const normalizedRecurrenceIntervalDays = Number(
      recurrenceIntervalDays !== undefined && recurrenceIntervalDays !== null && String(recurrenceIntervalDays).trim() !== ''
        ? recurrenceIntervalDays
        : (template?.default_recurrence_interval_days || defaultIntervalForRecurrence(normalizedRecurrenceType))
    );
    if (!Number.isInteger(normalizedRecurrenceIntervalDays) || normalizedRecurrenceIntervalDays < 0) {
      throw new ApiError(400, 'Invalid recurrence interval');
    }

    const assignedUserId = assignedTo ? Number(assignedTo) : req.user.id;
    if (!Number.isInteger(assignedUserId) || assignedUserId <= 0) {
      throw new ApiError(400, 'Invalid assignedTo user id');
    }

    const inserted = await client.query(
      `INSERT INTO crm_tasks (
         account_id, opportunity_id, title, description, due_date, priority, status, assigned_to, created_by,
         template_id, recurrence_type, recurrence_interval_days, recurrence_anchor_date, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
       RETURNING id`,
      [
        resolvedAccountId,
        resolvedOpportunityId,
        resolvedTitle,
        description || template?.description || null,
        resolvedDueDate,
        normalizedPriority,
        normalizedStatus,
        assignedUserId,
        req.user.id,
        template?.id || null,
        normalizedRecurrenceType,
        normalizedRecurrenceIntervalDays,
        resolvedDueDate,
      ]
    );

    await replaceTaskDependencies(client, inserted.rows[0].id, normalizeDependencyIds(dependencyIds), req.user.id);

    const detail = await client.query(
      `SELECT
         t.id, t.account_id, t.opportunity_id, t.title, t.description, t.due_date, t.priority, t.status, t.assigned_to,
         t.created_by, t.completed_at, t.created_at, t.updated_at,
         t.template_id, t.recurrence_type, t.recurrence_interval_days, t.parent_task_id,
         a.customer_name, a.customer_number, a.outlet_name,
         op.title AS opportunity_title,
         template.name AS template_name,
         assign_user.full_name AS assigned_to_name,
         create_user.full_name AS created_by_name,
         COALESCE(dep.dependency_ids, ARRAY[]::int[]) AS dependency_ids,
         COALESCE(dep.dependency_count, 0)::int AS dependency_count,
         COALESCE(dep.open_dependency_count, 0)::int AS open_dependency_count
       FROM crm_tasks t
       LEFT JOIN customer_accounts a ON a.id = t.account_id
       LEFT JOIN crm_opportunities op ON op.id = t.opportunity_id
       LEFT JOIN crm_task_templates template ON template.id = t.template_id
       LEFT JOIN users assign_user ON assign_user.id = t.assigned_to
       LEFT JOIN users create_user ON create_user.id = t.created_by
       LEFT JOIN LATERAL (
         SELECT
           ARRAY_REMOVE(ARRAY_AGG(td.depends_on_task_id ORDER BY td.depends_on_task_id), NULL) AS dependency_ids,
           COUNT(*)::int AS dependency_count,
           COUNT(*) FILTER (WHERE blocker.status <> 'COMPLETED')::int AS open_dependency_count
         FROM crm_task_dependencies td
         LEFT JOIN crm_tasks blocker ON blocker.id = td.depends_on_task_id
         WHERE td.task_id = t.id
       ) dep ON TRUE
       WHERE t.id = $1`,
      [inserted.rows[0].id]
    );

    await runTaskAutomation(client, detail.rows[0], req.user.id);
    await client.query('COMMIT');
    res.status(201).json({ task: detail.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateTask(req, res, next) {
  const client = await pool.connect();
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const taskId = Number(req.params.id);
    if (!Number.isInteger(taskId) || taskId <= 0) throw new ApiError(400, 'Invalid task id');

    await client.query('BEGIN');
    const taskRes = await client.query(
      `SELECT id, account_id, opportunity_id, template_id, title, description, due_date, priority, status, assigned_to,
              created_by, recurrence_type, recurrence_interval_days, recurrence_anchor_date
       FROM crm_tasks
       WHERE id = $1`,
      [taskId]
    );
    const current = taskRes.rows[0];
    if (!current) throw new ApiError(404, 'Task not found');
    if (current.account_id) {
      await ensureAccountAccess(client, current.account_id, scopedOutlet, req.user.id, true);
    }

    const {
      title,
      description,
      dueDate,
      priority,
      status,
      assignedTo,
      templateId,
      recurrenceType,
      recurrenceIntervalDays,
      dependencyIds,
    } = req.body || {};
    const template = templateId !== undefined ? await resolveTaskTemplate(client, templateId) : null;
    const normalizedPriority = priority !== undefined ? (normalizeTaskPriority(priority) || current.priority) : current.priority;
    const normalizedStatus = status !== undefined ? (normalizeTaskStatus(status) || current.status) : current.status;
    const normalizedAssignedTo = assignedTo !== undefined
      ? (assignedTo ? Number(assignedTo) : null)
      : current.assigned_to;
    const normalizedRecurrenceType = recurrenceType !== undefined
      ? normalizeTaskRecurrenceType(recurrenceType)
      : normalizeTaskRecurrenceType(current.recurrence_type);
    const normalizedRecurrenceIntervalDays = recurrenceIntervalDays !== undefined
      ? Number(recurrenceIntervalDays)
      : Number(current.recurrence_interval_days || defaultIntervalForRecurrence(normalizedRecurrenceType));
    if (normalizedAssignedTo !== null && (!Number.isInteger(normalizedAssignedTo) || normalizedAssignedTo <= 0)) {
      throw new ApiError(400, 'Invalid assignedTo user id');
    }
    if (!Number.isInteger(normalizedRecurrenceIntervalDays) || normalizedRecurrenceIntervalDays < 0) {
      throw new ApiError(400, 'Invalid recurrence interval');
    }
    const openBlockersRes = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM crm_task_dependencies td
       JOIN crm_tasks blocker ON blocker.id = td.depends_on_task_id
       WHERE td.task_id = $1
         AND blocker.status <> 'COMPLETED'`,
      [taskId]
    );
    if (normalizedStatus === 'COMPLETED' && Number(openBlockersRes.rows[0]?.total || 0) > 0) {
      throw new ApiError(400, 'Task is blocked by open dependencies');
    }

    await client.query(
      `UPDATE crm_tasks
       SET title = $1,
           description = $2,
           due_date = $3,
           priority = $4,
           status = $5,
           assigned_to = $6,
           template_id = $7,
           recurrence_type = $8,
           recurrence_interval_days = $9,
           recurrence_anchor_date = COALESCE(recurrence_anchor_date, $10),
           updated_at = NOW()
       WHERE id = $11`,
      [
        title !== undefined ? String(title || '').trim() || current.title : (template?.title || current.title),
        description !== undefined ? (description || null) : (template?.description || current.description),
        dueDate !== undefined ? dueDate : current.due_date,
        normalizedPriority,
        normalizedStatus,
        normalizedAssignedTo,
        templateId !== undefined ? (template?.id || null) : current.template_id,
        normalizedRecurrenceType,
        normalizedRecurrenceIntervalDays,
        dueDate !== undefined ? dueDate : current.recurrence_anchor_date,
        taskId,
      ]
    );

    if (dependencyIds !== undefined) {
      await replaceTaskDependencies(client, taskId, normalizeDependencyIds(dependencyIds), req.user.id);
    }

    if (current.status !== 'COMPLETED' && normalizedStatus === 'COMPLETED') {
      await createNextRecurringTask(client, {
        ...current,
        title: title !== undefined ? String(title || '').trim() || current.title : (template?.title || current.title),
        description: description !== undefined ? (description || null) : (template?.description || current.description),
        due_date: dueDate !== undefined ? dueDate : current.due_date,
        assigned_to: normalizedAssignedTo,
        recurrence_type: normalizedRecurrenceType,
        recurrence_interval_days: normalizedRecurrenceIntervalDays,
        template_id: templateId !== undefined ? (template?.id || null) : current.template_id,
      }, req.user.id);
    }

    const detail = await client.query(
      `SELECT
         t.id, t.account_id, t.opportunity_id, t.title, t.description, t.due_date, t.priority, t.status, t.assigned_to,
         t.created_by, t.completed_at, t.created_at, t.updated_at,
         t.template_id, t.recurrence_type, t.recurrence_interval_days, t.parent_task_id,
         a.customer_name, a.customer_number, a.outlet_name,
         op.title AS opportunity_title,
         template.name AS template_name,
         assign_user.full_name AS assigned_to_name,
         create_user.full_name AS created_by_name,
         COALESCE(dep.dependency_ids, ARRAY[]::int[]) AS dependency_ids,
         COALESCE(dep.dependency_count, 0)::int AS dependency_count,
         COALESCE(dep.open_dependency_count, 0)::int AS open_dependency_count
       FROM crm_tasks t
       LEFT JOIN customer_accounts a ON a.id = t.account_id
       LEFT JOIN crm_opportunities op ON op.id = t.opportunity_id
       LEFT JOIN crm_task_templates template ON template.id = t.template_id
       LEFT JOIN users assign_user ON assign_user.id = t.assigned_to
       LEFT JOIN users create_user ON create_user.id = t.created_by
       LEFT JOIN LATERAL (
         SELECT
           ARRAY_REMOVE(ARRAY_AGG(td.depends_on_task_id ORDER BY td.depends_on_task_id), NULL) AS dependency_ids,
           COUNT(*)::int AS dependency_count,
           COUNT(*) FILTER (WHERE blocker.status <> 'COMPLETED')::int AS open_dependency_count
         FROM crm_task_dependencies td
         LEFT JOIN crm_tasks blocker ON blocker.id = td.depends_on_task_id
         WHERE td.task_id = t.id
       ) dep ON TRUE
       WHERE t.id = $1`,
      [taskId]
    );

    await runTaskAutomation(client, detail.rows[0], req.user.id);
    await client.query('COMMIT');
    res.json({ task: detail.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listTaskTemplates(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         id, name, title, description, priority, default_due_in_days,
         default_recurrence_type, default_recurrence_interval_days, is_active,
         created_at, updated_at
       FROM crm_task_templates
       ORDER BY name ASC`
    );
    res.json({ templates: rows });
  } catch (error) {
    next(error);
  }
}

async function createTaskTemplate(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      name,
      title,
      description = '',
      priority = 'MEDIUM',
      defaultDueInDays = 1,
      defaultRecurrenceType = 'NONE',
      defaultRecurrenceIntervalDays = 0,
      isActive = true,
    } = req.body || {};

    if (!String(name || '').trim()) throw new ApiError(400, 'Template name is required');
    if (!String(title || '').trim()) throw new ApiError(400, 'Template title is required');
    const normalizedPriority = normalizeTaskPriority(priority) || 'MEDIUM';
    const normalizedRecurrenceType = normalizeTaskRecurrenceType(defaultRecurrenceType);
    const parsedDueInDays = Number(defaultDueInDays || 0);
    const parsedIntervalDays = Number(
      defaultRecurrenceIntervalDays === undefined || defaultRecurrenceIntervalDays === null || String(defaultRecurrenceIntervalDays).trim() === ''
        ? defaultIntervalForRecurrence(normalizedRecurrenceType)
        : defaultRecurrenceIntervalDays
    );
    if (!Number.isInteger(parsedDueInDays) || parsedDueInDays < 0) throw new ApiError(400, 'defaultDueInDays must be 0 or higher');
    if (!Number.isInteger(parsedIntervalDays) || parsedIntervalDays < 0) throw new ApiError(400, 'defaultRecurrenceIntervalDays must be 0 or higher');

    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_task_templates
       (name, title, description, priority, default_due_in_days, default_recurrence_type, default_recurrence_interval_days, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING id`,
      [
        String(name).trim(),
        String(title).trim(),
        description || null,
        normalizedPriority,
        parsedDueInDays,
        normalizedRecurrenceType,
        parsedIntervalDays,
        Boolean(isActive),
        req.user.id,
      ]
    );
    const detail = await client.query(
      `SELECT
         id, name, title, description, priority, default_due_in_days,
         default_recurrence_type, default_recurrence_interval_days, is_active,
         created_at, updated_at
       FROM crm_task_templates
       WHERE id = $1`,
      [inserted.rows[0].id]
    );
    await client.query('COMMIT');
    res.status(201).json({ template: detail.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listCommunicationCenter(req, res, next) {
  const client = await pool.connect();
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const {
      ownerId = '',
      status = '',
      channel = '',
      accountId = '',
      mine = 'false',
    } = req.query;

    await client.query('BEGIN');
    await ensureCommunicationAlerts(client);

    const filters = [];
    const values = [];

    if (channel) {
      values.push(normalizeInteractionType(channel));
      filters.push(`ci.interaction_type = $${values.length}`);
    }
    const normalizedStatus = normalizeCommunicationStatus(status);
    if (normalizedStatus) {
      values.push(normalizedStatus);
      filters.push(`ci.channel_status = $${values.length}`);
    }
    const effectiveOwnerId = mine === 'true' ? req.user.id : (ownerId ? Number(ownerId) : null);
    if (effectiveOwnerId !== null && effectiveOwnerId !== undefined && String(effectiveOwnerId).trim() !== '') {
      if (!Number.isInteger(Number(effectiveOwnerId)) || Number(effectiveOwnerId) <= 0) {
        throw new ApiError(400, 'Invalid owner id');
      }
      values.push(Number(effectiveOwnerId));
      filters.push(`ci.conversation_owner_id = $${values.length}`);
    }
    if (accountId) {
      const parsedAccountId = Number(accountId);
      if (!Number.isInteger(parsedAccountId) || parsedAccountId <= 0) throw new ApiError(400, 'Invalid account id');
      values.push(parsedAccountId);
      filters.push(`ci.account_id = $${values.length}`);
    }
    if (scopedOutlet) {
      values.push(scopedOutlet);
      filters.push(
        `EXISTS (
          SELECT 1
          FROM orders ox
          WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
            AND LOWER(ox.ordered_from) = LOWER($${values.length})
        )`
      );
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await client.query(
      `SELECT
         ci.id,
         ci.account_id,
         ci.interaction_type,
         ci.subject,
         ci.notes,
         ci.next_followup_at,
         ci.created_at,
         ci.direction,
         ci.thread_key,
         ci.response_sla_minutes,
         ci.response_due_at,
         ci.responded_at,
         ci.no_response_alerted_at,
         ci.channel_status,
         ci.is_unread,
         a.customer_name,
         a.customer_number,
         owner_user.full_name AS conversation_owner_name,
         creator.full_name AS created_by_name
       FROM customer_interactions ci
       JOIN customer_accounts a ON a.id = ci.account_id
       LEFT JOIN users owner_user ON owner_user.id = ci.conversation_owner_id
       LEFT JOIN users creator ON creator.id = ci.created_by
       ${whereClause}
       ORDER BY ci.created_at DESC, ci.id DESC
       LIMIT 400`,
      values
    );

    const taskRows = await client.query(
      `SELECT id, account_id, title, due_date, status, priority, assigned_to, recurrence_type
       FROM crm_tasks
       ORDER BY due_date ASC, id DESC
       LIMIT 500`
    );

    const inboxMap = new Map();
    const channelMix = new Map();
    const ownerMix = new Map();
    let overdueResponses = 0;
    let unreadCount = 0;

    rows.forEach((row) => {
      const key = row.thread_key || `acct-${row.account_id}-${row.interaction_type}`;
      const current = inboxMap.get(key);
      if (!current) {
        inboxMap.set(key, {
          thread_key: key,
          account_id: row.account_id,
          customer_name: row.customer_name,
          customer_number: row.customer_number,
          channel: row.interaction_type,
          status: row.channel_status,
          owner_name: row.conversation_owner_name || '-',
          latest_subject: row.subject || row.interaction_type,
          latest_notes: row.notes || '',
          last_activity_at: row.created_at,
          response_due_at: row.response_due_at,
          message_count: 1,
          unread_count: row.is_unread ? 1 : 0,
          overdue_response: Boolean(row.response_due_at && !row.responded_at && new Date(String(row.response_due_at)).getTime() < Date.now()),
          next_followup_at: row.next_followup_at,
        });
      } else {
        current.message_count += 1;
        current.unread_count += row.is_unread ? 1 : 0;
        if (!current.response_due_at || (row.response_due_at && String(row.response_due_at) > String(current.response_due_at))) {
          current.response_due_at = row.response_due_at;
        }
        if (!current.next_followup_at || (row.next_followup_at && String(row.next_followup_at) < String(current.next_followup_at))) {
          current.next_followup_at = row.next_followup_at;
        }
        current.overdue_response = current.overdue_response || Boolean(row.response_due_at && !row.responded_at && new Date(String(row.response_due_at)).getTime() < Date.now());
      }

      channelMix.set(row.interaction_type, (channelMix.get(row.interaction_type) || 0) + 1);
      ownerMix.set(row.conversation_owner_name || 'Unassigned', (ownerMix.get(row.conversation_owner_name || 'Unassigned') || 0) + 1);
      if (row.is_unread) unreadCount += 1;
      if (row.response_due_at && !row.responded_at && new Date(String(row.response_due_at)).getTime() < Date.now()) overdueResponses += 1;
    });

    const inbox = Array.from(inboxMap.values())
      .sort((a, b) => String(b.last_activity_at || '').localeCompare(String(a.last_activity_at || '')))
      .slice(0, 120);

    const communicationTasks = taskRows.rows.filter((task) => /follow|reply|response|communication|customer/i.test(String(task.title || '')));
    const overdueFollowups = rows.filter((row) => row.next_followup_at && String(row.next_followup_at).slice(0, 10) < new Date().toISOString().slice(0, 10));
    const followupCompliance = {
      scheduled_followups: rows.filter((row) => row.next_followup_at).length,
      overdue_followups: overdueFollowups.length,
      open_followup_tasks: communicationTasks.filter((task) => task.status === 'OPEN').length,
      overdue_followup_tasks: communicationTasks.filter((task) => task.status === 'OPEN' && String(task.due_date || '').slice(0, 10) < new Date().toISOString().slice(0, 10)).length,
    };

    const respondedRows = rows.filter((row) => row.direction === 'INBOUND' && row.response_due_at && row.responded_at);
    const onTimeCount = respondedRows.filter((row) => new Date(String(row.responded_at)).getTime() <= new Date(String(row.response_due_at)).getTime()).length;

    const analytics = {
      total_messages: rows.length,
      unread_messages: unreadCount,
      open_threads: inbox.filter((item) => ['OPEN', 'PENDING'].includes(item.status)).length,
      overdue_responses: overdueResponses,
      owned_threads: inbox.filter((item) => item.owner_name && item.owner_name !== '-').length,
      unowned_threads: inbox.filter((item) => !item.owner_name || item.owner_name === '-').length,
      channel_mix: Array.from(channelMix.entries()).map(([label, value]) => ({ label, value })),
      owner_mix: Array.from(ownerMix.entries()).map(([label, value]) => ({ label, value })),
      response_sla: {
        responded_count: respondedRows.length,
        on_time_count: onTimeCount,
        breached_count: respondedRows.length - onTimeCount + overdueResponses,
      },
    };

    const noResponseAlerts = rows
      .filter((row) => row.no_response_alerted_at && !row.responded_at)
      .slice(0, 25)
      .map((row) => ({
        id: row.id,
        customer_name: row.customer_name,
        customer_number: row.customer_number,
        channel: row.interaction_type,
        owner_name: row.conversation_owner_name || '-',
        response_due_at: row.response_due_at,
        alerted_at: row.no_response_alerted_at,
      }));

    await client.query('COMMIT');
    res.json({
      inbox,
      analytics,
      followupCompliance,
      noResponseAlerts,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function getCaseSummary(req, res, next) {
  try {
    const { search = '', status = '', priority = '', caseType = '', assignedTo = '', outlet = '', accountId = '' } = req.query;
    const scopedOutlet = getCrmOutletScope(req);
    const values = [];
    const whereClause = buildCaseWhereClause({
      search, status, priority, caseType, assignedTo, outlet, scopedOutlet, accountId,
    }, values);

    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total_count,
         COALESCE(SUM(CASE WHEN c.status IN ('NEW', 'WORKING', 'WAITING_CUSTOMER', 'ESCALATED') THEN 1 ELSE 0 END), 0)::int AS open_count,
         COALESCE(SUM(CASE WHEN c.status = 'ESCALATED' THEN 1 ELSE 0 END), 0)::int AS escalated_count,
         COALESCE(SUM(CASE WHEN c.status = 'RESOLVED' THEN 1 ELSE 0 END), 0)::int AS resolved_count,
         COALESCE(SUM(CASE WHEN c.status = 'CLOSED' THEN 1 ELSE 0 END), 0)::int AS closed_count,
         COALESCE(SUM(CASE WHEN c.priority IN ('HIGH', 'CRITICAL') THEN 1 ELSE 0 END), 0)::int AS high_priority_count,
         COALESCE(SUM(CASE WHEN c.status IN ('NEW', 'WORKING', 'WAITING_CUSTOMER', 'ESCALATED') AND c.due_at IS NOT NULL AND c.due_at < NOW() THEN 1 ELSE 0 END), 0)::int AS overdue_count
       FROM crm_cases c
       JOIN customer_accounts a ON a.id = c.account_id
       ${whereClause}`,
      values
    );

    res.json({ summary: rows[0] || {}, scoped_outlet: scopedOutlet || null });
  } catch (error) {
    next(error);
  }
}

async function listCases(req, res, next) {
  try {
    const { search = '', status = '', priority = '', caseType = '', assignedTo = '', outlet = '', accountId = '' } = req.query;
    const scopedOutlet = getCrmOutletScope(req);
    const values = [];
    const whereClause = buildCaseWhereClause({
      search, status, priority, caseType, assignedTo, outlet, scopedOutlet, accountId,
    }, values);

    const { rows } = await pool.query(
      `SELECT
         c.id, c.account_id, c.opportunity_id, c.subject, c.description, c.case_type, c.priority, c.status, c.origin, c.due_at,
         c.root_cause_code, c.resolution_code, c.business_impact, c.reported_order_id, c.next_action, c.next_action_due_at, c.service_channel,
         c.assigned_to, c.owner_id, c.resolved_at, c.closed_at, c.created_at, c.updated_at,
         a.customer_name, a.customer_number, a.outlet_name,
         o.production_order_no AS reported_order_no,
         au.full_name AS assigned_to_name,
         ou.full_name AS owner_name
       FROM crm_cases c
       JOIN customer_accounts a ON a.id = c.account_id
       LEFT JOIN orders o ON o.id = c.reported_order_id
       LEFT JOIN users au ON au.id = c.assigned_to
       LEFT JOIN users ou ON ou.id = c.owner_id
       ${whereClause}
       ORDER BY
         CASE WHEN c.status IN ('NEW', 'ESCALATED') THEN 1 WHEN c.status = 'WORKING' THEN 2 ELSE 3 END,
         CASE c.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'MEDIUM' THEN 3 ELSE 4 END,
         c.due_at ASC NULLS LAST,
         c.updated_at DESC,
         c.id DESC
       LIMIT 500`,
      values
    );

    res.json({ cases: rows, scoped_outlet: scopedOutlet || null });
  } catch (error) {
    next(error);
  }
}

async function createCase(req, res, next) {
  const client = await pool.connect();
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const {
      accountId,
      opportunityId = null,
      subject,
      description = '',
      caseType = 'GENERAL',
      priority = 'MEDIUM',
      status = 'NEW',
      origin = 'MANUAL',
      dueAt = null,
      assignedTo = null,
      ownerId = null,
      rootCauseCode = null,
      resolutionCode = null,
      businessImpact = null,
      reportedOrderId = null,
      nextAction = null,
      nextActionDueAt = null,
      serviceChannel = 'MANUAL',
    } = req.body || {};

    const parsedAccountId = Number(accountId);
    if (!Number.isInteger(parsedAccountId) || parsedAccountId <= 0) throw new ApiError(400, 'Valid accountId is required');
    if (!String(subject || '').trim()) throw new ApiError(400, 'Case subject is required');

    const normalizedType = normalizeCaseType(caseType) || 'GENERAL';
    const normalizedPriority = normalizeCasePriority(priority) || 'MEDIUM';
    const normalizedStatus = normalizeCaseStatus(status) || 'NEW';
    const normalizedOrigin = normalizeCaseOrigin(origin) || 'MANUAL';
    const resolvedAssignedTo = assignedTo ? Number(assignedTo) : req.user.id;
    const resolvedOwnerId = ownerId ? Number(ownerId) : req.user.id;
    if (!Number.isInteger(resolvedAssignedTo) || resolvedAssignedTo <= 0) throw new ApiError(400, 'Invalid assignedTo user id');
    if (!Number.isInteger(resolvedOwnerId) || resolvedOwnerId <= 0) throw new ApiError(400, 'Invalid ownerId user id');

    await client.query('BEGIN');
    await ensureAccountAccess(client, parsedAccountId, scopedOutlet, req.user.id, true);

    const resolvedOpportunityId = opportunityId ? Number(opportunityId) : null;
    if (resolvedOpportunityId !== null && (!Number.isInteger(resolvedOpportunityId) || resolvedOpportunityId <= 0)) {
      throw new ApiError(400, 'Invalid opportunityId');
    }

    const inserted = await client.query(
      `INSERT INTO crm_cases
       (account_id, opportunity_id, subject, description, case_type, priority, status, origin, due_at, assigned_to, owner_id, created_by, created_at, updated_at,
        root_cause_code, resolution_code, business_impact, reported_order_id, next_action, next_action_due_at, service_channel)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), $13, $14, $15, $16, $17, $18, $19)
       RETURNING id`,
      [
        parsedAccountId,
        resolvedOpportunityId,
        String(subject).trim(),
        description || null,
        normalizedType,
        normalizedPriority,
        normalizedStatus,
        normalizedOrigin,
        dueAt || null,
        resolvedAssignedTo,
        resolvedOwnerId,
        req.user.id,
        rootCauseCode || null,
        resolutionCode || null,
        businessImpact || null,
        reportedOrderId ? Number(reportedOrderId) : null,
        nextAction || null,
        nextActionDueAt || null,
        serviceChannel || 'MANUAL',
      ]
    );

    const detail = await client.query(
      `SELECT
         c.id, c.account_id, c.opportunity_id, c.subject, c.description, c.case_type, c.priority, c.status, c.origin, c.due_at,
         c.root_cause_code, c.resolution_code, c.business_impact, c.reported_order_id, c.next_action, c.next_action_due_at, c.service_channel,
         c.assigned_to, c.owner_id, c.resolved_at, c.closed_at, c.created_at, c.updated_at,
         a.customer_name, a.customer_number, a.outlet_name,
         o.production_order_no AS reported_order_no,
         au.full_name AS assigned_to_name,
         ou.full_name AS owner_name
       FROM crm_cases c
       JOIN customer_accounts a ON a.id = c.account_id
       LEFT JOIN orders o ON o.id = c.reported_order_id
       LEFT JOIN users au ON au.id = c.assigned_to
       LEFT JOIN users ou ON ou.id = c.owner_id
       WHERE c.id = $1`,
      [inserted.rows[0].id]
    );

    await createNotification(client, {
      userId: resolvedAssignedTo,
      title: 'New CRM Case Assigned',
      message: `Case "${String(subject).trim()}" has been assigned to you.`,
      severity: normalizedPriority === 'CRITICAL' ? 'HIGH' : 'INFO',
      linkedType: 'CASE',
      linkedId: inserted.rows[0].id,
      payload: { caseId: inserted.rows[0].id, accountId: parsedAccountId },
    });

    await client.query('COMMIT');
    res.status(201).json({ case: detail.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateCase(req, res, next) {
  const client = await pool.connect();
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const caseId = Number(req.params.id);
    if (!Number.isInteger(caseId) || caseId <= 0) throw new ApiError(400, 'Invalid case id');

    const {
      subject,
      description,
      caseType,
      priority,
      status,
      origin,
      dueAt,
      assignedTo,
      ownerId,
      rootCauseCode,
      resolutionCode,
      businessImpact,
      reportedOrderId,
      nextAction,
      nextActionDueAt,
      serviceChannel,
    } = req.body || {};

    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, account_id, subject, description, case_type, priority, status, origin, due_at, assigned_to, owner_id,
              root_cause_code, resolution_code, business_impact, reported_order_id, next_action, next_action_due_at, service_channel
       FROM crm_cases
       WHERE id = $1
       FOR UPDATE`,
      [caseId]
    );
    const current = found.rows[0];
    if (!current) throw new ApiError(404, 'Case not found');
    await ensureAccountAccess(client, current.account_id, scopedOutlet, req.user.id, true);

    const normalizedType = caseType !== undefined ? (normalizeCaseType(caseType) || current.case_type) : current.case_type;
    const normalizedPriority = priority !== undefined ? (normalizeCasePriority(priority) || current.priority) : current.priority;
    const normalizedStatus = status !== undefined ? (normalizeCaseStatus(status) || current.status) : current.status;
    const normalizedOrigin = origin !== undefined ? (normalizeCaseOrigin(origin) || current.origin) : current.origin;
    const resolvedAssignedTo = assignedTo !== undefined ? (assignedTo ? Number(assignedTo) : null) : current.assigned_to;
    const resolvedOwnerId = ownerId !== undefined ? (ownerId ? Number(ownerId) : null) : current.owner_id;
    if (resolvedAssignedTo !== null && (!Number.isInteger(resolvedAssignedTo) || resolvedAssignedTo <= 0)) throw new ApiError(400, 'Invalid assignedTo user id');
    if (resolvedOwnerId !== null && (!Number.isInteger(resolvedOwnerId) || resolvedOwnerId <= 0)) throw new ApiError(400, 'Invalid ownerId user id');

    await client.query(
      `UPDATE crm_cases
       SET subject = $1,
           description = $2,
           case_type = $3,
           priority = $4,
           status = $5,
           origin = $6,
           due_at = $7,
           assigned_to = $8,
           owner_id = $9,
           root_cause_code = $10,
           resolution_code = $11,
           business_impact = $12,
           reported_order_id = $13,
           next_action = $14,
           next_action_due_at = $15,
           service_channel = $16,
           resolved_at = CASE WHEN $5 = 'RESOLVED' THEN COALESCE(resolved_at, NOW()) WHEN $5 IN ('NEW', 'WORKING', 'WAITING_CUSTOMER', 'ESCALATED') THEN NULL ELSE resolved_at END,
           closed_at = CASE WHEN $5 = 'CLOSED' THEN COALESCE(closed_at, NOW()) WHEN $5 <> 'CLOSED' THEN NULL ELSE closed_at END,
           updated_at = NOW()
       WHERE id = $17`,
      [
        subject !== undefined ? String(subject || '').trim() || current.subject : current.subject,
        description !== undefined ? (description || null) : current.description,
        normalizedType,
        normalizedPriority,
        normalizedStatus,
        normalizedOrigin,
        dueAt !== undefined ? (dueAt || null) : current.due_at,
        resolvedAssignedTo,
        resolvedOwnerId,
        rootCauseCode !== undefined ? (rootCauseCode || null) : current.root_cause_code,
        resolutionCode !== undefined ? (resolutionCode || null) : current.resolution_code,
        businessImpact !== undefined ? (businessImpact || null) : current.business_impact,
        reportedOrderId !== undefined ? (reportedOrderId ? Number(reportedOrderId) : null) : current.reported_order_id,
        nextAction !== undefined ? (nextAction || null) : current.next_action,
        nextActionDueAt !== undefined ? (nextActionDueAt || null) : current.next_action_due_at,
        serviceChannel !== undefined ? (serviceChannel || 'MANUAL') : current.service_channel,
        caseId,
      ]
    );

    const detail = await client.query(
      `SELECT
         c.id, c.account_id, c.opportunity_id, c.subject, c.description, c.case_type, c.priority, c.status, c.origin, c.due_at,
         c.root_cause_code, c.resolution_code, c.business_impact, c.reported_order_id, c.next_action, c.next_action_due_at, c.service_channel,
         c.assigned_to, c.owner_id, c.resolved_at, c.closed_at, c.created_at, c.updated_at,
         a.customer_name, a.customer_number, a.outlet_name,
         o.production_order_no AS reported_order_no,
         au.full_name AS assigned_to_name,
         ou.full_name AS owner_name
       FROM crm_cases c
       JOIN customer_accounts a ON a.id = c.account_id
       LEFT JOIN orders o ON o.id = c.reported_order_id
       LEFT JOIN users au ON au.id = c.assigned_to
       LEFT JOIN users ou ON ou.id = c.owner_id
       WHERE c.id = $1`,
      [caseId]
    );

    await client.query('COMMIT');
    res.json({ case: detail.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function addCaseComment(req, res, next) {
  const client = await pool.connect();
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const caseId = Number(req.params.id);
    if (!Number.isInteger(caseId) || caseId <= 0) throw new ApiError(400, 'Invalid case id');
    const { commentText, isInternal = true } = req.body || {};
    if (!String(commentText || '').trim()) throw new ApiError(400, 'commentText is required');

    await client.query('BEGIN');
    const caseRes = await client.query(
      `SELECT id, account_id
       FROM crm_cases
       WHERE id = $1`,
      [caseId]
    );
    const foundCase = caseRes.rows[0];
    if (!foundCase) throw new ApiError(404, 'Case not found');
    await ensureAccountAccess(client, foundCase.account_id, scopedOutlet, req.user.id, true);

    const inserted = await client.query(
      `INSERT INTO crm_case_comments
       (case_id, comment_text, is_internal, created_by, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id`,
      [caseId, String(commentText).trim(), Boolean(isInternal), req.user.id]
    );

    const detail = await client.query(
      `SELECT
         cc.id, cc.case_id, cc.comment_text, cc.is_internal, cc.created_at,
         u.full_name AS created_by_name
       FROM crm_case_comments cc
       LEFT JOIN users u ON u.id = cc.created_by
       WHERE cc.id = $1`,
      [inserted.rows[0].id]
    );

    await client.query('COMMIT');
    res.status(201).json({ comment: detail.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listCaseComments(req, res, next) {
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const caseId = Number(req.params.id);
    if (!Number.isInteger(caseId) || caseId <= 0) throw new ApiError(400, 'Invalid case id');

    const caseRes = await pool.query(
      `SELECT id, account_id FROM crm_cases WHERE id = $1`,
      [caseId]
    );
    const foundCase = caseRes.rows[0];
    if (!foundCase) throw new ApiError(404, 'Case not found');
    const client = await pool.connect();
    try {
      await ensureAccountAccess(client, foundCase.account_id, scopedOutlet, req.user.id, false);
    } finally {
      client.release();
    }

    const { rows } = await pool.query(
      `SELECT
         cc.id, cc.case_id, cc.comment_text, cc.is_internal, cc.created_at,
         u.full_name AS created_by_name
       FROM crm_case_comments cc
       LEFT JOIN users u ON u.id = cc.created_by
       WHERE cc.case_id = $1
       ORDER BY cc.created_at DESC, cc.id DESC
       LIMIT 300`,
      [caseId]
    );
    res.json({ comments: rows });
  } catch (error) {
    next(error);
  }
}

async function convertLead(req, res, next) {
  const client = await pool.connect();
  try {
    const scopedOutlet = getCrmOutletScope(req);
    const accountId = Number(req.params.id);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new ApiError(400, 'Invalid customer account id');

    const {
      opportunityTitle = '',
      expectedValue = 0,
      expectedCloseDate = null,
      ownerId = null,
      taskTitle = 'Lead conversion follow-up',
      taskDueDate = null,
      assignedTo = null,
      conversionNotes = '',
    } = req.body || {};

    const parsedExpectedValue = Number(expectedValue || 0);
    if (!Number.isFinite(parsedExpectedValue) || parsedExpectedValue < 0) {
      throw new ApiError(400, 'expectedValue must be a non-negative number');
    }

    const defaultTaskDueDate = new Date(Date.now() + (3 * 24 * 60 * 60 * 1000)).toISOString().slice(0, 10);
    const resolvedTaskDueDate = String(taskDueDate || defaultTaskDueDate).slice(0, 10);
    const resolvedOwnerId = ownerId ? Number(ownerId) : req.user.id;
    const resolvedAssignedTo = assignedTo ? Number(assignedTo) : req.user.id;
    if (!Number.isInteger(resolvedOwnerId) || resolvedOwnerId <= 0) throw new ApiError(400, 'Invalid ownerId');
    if (!Number.isInteger(resolvedAssignedTo) || resolvedAssignedTo <= 0) throw new ApiError(400, 'Invalid assignedTo');

    await client.query('BEGIN');
    const account = await ensureAccountAccess(client, accountId, scopedOutlet, req.user.id, true);

    const opportunityInsert = await client.query(
      `INSERT INTO crm_opportunities (
         account_id, title, stage, status, probability, expected_value, expected_close_date,
         source, notes, owner_id, created_by, created_at, updated_at
       )
       VALUES ($1, $2, 'QUALIFICATION', 'OPEN', 20, $3, $4, 'LEAD_CONVERSION', $5, $6, $7, NOW(), NOW())
       RETURNING id`,
      [
        accountId,
        String(opportunityTitle || `Conversion: ${account.customer_number}`).trim(),
        parsedExpectedValue,
        expectedCloseDate || null,
        conversionNotes || null,
        resolvedOwnerId,
        req.user.id,
      ]
    );

    const taskInsert = await client.query(
      `INSERT INTO crm_tasks (
         account_id, opportunity_id, title, description, due_date, priority, status, assigned_to, created_by, created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, 'HIGH', 'OPEN', $6, $7, NOW(), NOW())
       RETURNING id`,
      [
        accountId,
        opportunityInsert.rows[0].id,
        String(taskTitle || 'Lead conversion follow-up').trim(),
        conversionNotes || 'Follow up after lead conversion.',
        resolvedTaskDueDate,
        resolvedAssignedTo,
        req.user.id,
      ]
    );

    await client.query(
      `UPDATE customer_accounts
       SET customer_status = 'ACTIVE',
           updated_at = NOW()
       WHERE id = $1`,
      [accountId]
    );

    const conversionInsert = await client.query(
      `INSERT INTO crm_lead_conversions (account_id, opportunity_id, task_id, converted_by, conversion_notes, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [accountId, opportunityInsert.rows[0].id, taskInsert.rows[0].id, req.user.id, conversionNotes || null]
    );

    await createNotification(client, {
      userId: resolvedOwnerId,
      title: 'Lead Converted',
      message: `Account ${account.customer_number} has been converted to an opportunity.`,
      severity: 'SUCCESS',
      linkedType: 'OPPORTUNITY',
      linkedId: opportunityInsert.rows[0].id,
      payload: { accountId, opportunityId: opportunityInsert.rows[0].id, conversionId: conversionInsert.rows[0].id },
    });

    await client.query('COMMIT');
    res.status(201).json({
      conversion: {
        id: conversionInsert.rows[0].id,
        accountId,
        opportunityId: opportunityInsert.rows[0].id,
        taskId: taskInsert.rows[0].id,
      },
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listLeadConversions(req, res, next) {
  try {
    const accountId = req.query.accountId ? Number(req.query.accountId) : null;
    if (accountId !== null && (!Number.isInteger(accountId) || accountId <= 0)) {
      throw new ApiError(400, 'Invalid accountId');
    }
    const values = [];
    const filters = [];
    if (accountId) {
      values.push(accountId);
      filters.push(`lc.account_id = $${values.length}`);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT
         lc.id, lc.account_id, lc.opportunity_id, lc.task_id, lc.conversion_notes, lc.created_at,
         a.customer_name, a.customer_number, u.full_name AS converted_by_name
       FROM crm_lead_conversions lc
       JOIN customer_accounts a ON a.id = lc.account_id
       LEFT JOIN users u ON u.id = lc.converted_by
       ${whereClause}
       ORDER BY lc.created_at DESC, lc.id DESC
       LIMIT 300`,
      values
    );
    res.json({ conversions: rows });
  } catch (error) {
    next(error);
  }
}

async function listApprovals(req, res, next) {
  try {
    const { status = '', entityType = '' } = req.query;
    const values = [];
    const filters = [];
    if (status) {
      values.push(String(status).toUpperCase());
      filters.push(`ap.status = $${values.length}`);
    }
    if (entityType) {
      values.push(String(entityType).toUpperCase());
      filters.push(`ap.entity_type = $${values.length}`);
    }
    if (req.user.role === 'RETAIL') {
      values.push(req.user.id);
      filters.push(`(ap.requested_by = $${values.length} OR ap.decided_by = $${values.length})`);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT
         ap.id, ap.entity_type, ap.entity_id, ap.stage_name, ap.status, ap.requested_payload, ap.decision_notes,
         ap.requested_at, ap.decided_at,
         rq.full_name AS requested_by_name,
         dc.full_name AS decided_by_name
       FROM crm_approvals ap
       LEFT JOIN users rq ON rq.id = ap.requested_by
       LEFT JOIN users dc ON dc.id = ap.decided_by
       ${whereClause}
       ORDER BY
         CASE ap.status WHEN 'PENDING' THEN 1 WHEN 'APPROVED' THEN 2 WHEN 'REJECTED' THEN 3 ELSE 9 END,
         ap.requested_at DESC,
         ap.id DESC
       LIMIT 300`,
      values
    );
    res.json({ approvals: rows });
  } catch (error) {
    next(error);
  }
}

async function decideApproval(req, res, next) {
  const client = await pool.connect();
  try {
    const approvalId = Number(req.params.id);
    if (!Number.isInteger(approvalId) || approvalId <= 0) throw new ApiError(400, 'Invalid approval id');
    const decision = String(req.body?.status || '').toUpperCase();
    if (!['APPROVED', 'REJECTED'].includes(decision)) throw new ApiError(400, 'status must be APPROVED or REJECTED');
    const decisionNotes = req.body?.notes || null;

    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, entity_type, entity_id, stage_name, status, requested_payload
       FROM crm_approvals
       WHERE id = $1
       FOR UPDATE`,
      [approvalId]
    );
    const approval = found.rows[0];
    if (!approval) throw new ApiError(404, 'Approval not found');
    if (approval.status !== 'PENDING') throw new ApiError(409, 'Approval request is already decided');

    let updatedOpportunity = null;
    if (decision === 'APPROVED' && approval.entity_type === 'OPPORTUNITY_STAGE') {
      const oppRes = await client.query(
        `SELECT id, account_id, title, stage, status, probability, expected_value, expected_close_date, source, notes, owner_id
         FROM crm_opportunities
         WHERE id = $1`,
        [approval.entity_id]
      );
      const current = oppRes.rows[0];
      if (!current) throw new ApiError(404, 'Opportunity not found');
      const payload = approval.requested_payload || {};
      const state = normalizeOpportunityState(payload.stage || current.stage, payload.status || current.status);
      const parsedProbability = payload.probability !== undefined
        ? Number(payload.probability)
        : Number(current.probability);
      const parsedExpectedValue = payload.expectedValue !== undefined
        ? Number(payload.expectedValue)
        : Number(current.expected_value || 0);
      if (!Number.isInteger(parsedProbability) || parsedProbability < 0 || parsedProbability > 100) {
        throw new ApiError(400, 'Approval payload has invalid probability');
      }
      if (!Number.isFinite(parsedExpectedValue) || parsedExpectedValue < 0) {
        throw new ApiError(400, 'Approval payload has invalid expected value');
      }

      await client.query(
        `UPDATE crm_opportunities
         SET title = $1,
             stage = $2,
             status = $3,
             probability = $4,
             expected_value = $5,
             expected_close_date = $6,
             source = $7,
             notes = $8,
             owner_id = $9,
             updated_at = NOW()
         WHERE id = $10`,
        [
          payload.title !== undefined ? String(payload.title || '').trim() || current.title : current.title,
          state.stage,
          state.status,
          parsedProbability,
          parsedExpectedValue,
          payload.expectedCloseDate !== undefined ? (payload.expectedCloseDate || null) : current.expected_close_date,
          payload.source !== undefined ? (payload.source || null) : current.source,
          payload.notes !== undefined ? (payload.notes || null) : current.notes,
          payload.ownerId !== undefined ? (payload.ownerId ? Number(payload.ownerId) : null) : current.owner_id,
          approval.entity_id,
        ]
      );
      const detail = await client.query(
        `SELECT
           op.id, op.account_id, op.title, op.stage, op.status, op.probability, op.expected_value, op.expected_close_date,
           op.source, op.notes, op.owner_id, op.won_at, op.lost_at, op.created_at, op.updated_at,
           a.customer_name, a.customer_number, a.outlet_name, u.full_name AS owner_name,
           (op.expected_value * op.probability / 100.0)::numeric(12,2) AS weighted_value
         FROM crm_opportunities op
         JOIN customer_accounts a ON a.id = op.account_id
         LEFT JOIN users u ON u.id = op.owner_id
         WHERE op.id = $1`,
        [approval.entity_id]
      );
      updatedOpportunity = detail.rows[0] || null;
      if (updatedOpportunity) {
        await runOpportunityAutomation(client, updatedOpportunity, req.user.id);
      }
    }

    const updatedApproval = await client.query(
      `UPDATE crm_approvals
       SET status = $1,
           decision_notes = $2,
           decided_by = $3,
           decided_at = NOW()
       WHERE id = $4
       RETURNING id, entity_type, entity_id, stage_name, status, requested_payload, decision_notes, requested_at, decided_at`,
      [decision, decisionNotes, req.user.id, approvalId]
    );

    await client.query('COMMIT');
    res.json({ approval: updatedApproval.rows[0], opportunity: updatedOpportunity });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listEmailTemplates(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, subject_template, body_template, is_active, created_at, updated_at
       FROM crm_email_templates
       ORDER BY updated_at DESC, id DESC`
    );
    res.json({ templates: rows });
  } catch (error) {
    next(error);
  }
}

async function createEmailTemplate(req, res, next) {
  const client = await pool.connect();
  try {
    const { name, subjectTemplate, bodyTemplate, isActive = true } = req.body || {};
    const trimmedName = String(name || '').trim();
    const trimmedSubject = String(subjectTemplate || '').trim();
    const trimmedBody = String(bodyTemplate || '').trim();
    if (!trimmedName) throw new ApiError(400, 'Template name is required');
    if (!trimmedSubject) throw new ApiError(400, 'subjectTemplate is required');
    if (!trimmedBody) throw new ApiError(400, 'bodyTemplate is required');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_email_templates
       (name, subject_template, body_template, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id, name, subject_template, body_template, is_active, created_at, updated_at`,
      [trimmedName, trimmedSubject, trimmedBody, Boolean(isActive), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ template: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listCadences(req, res, next) {
  try {
    const [cadenceRes, stepRes] = await Promise.all([
      pool.query(
        `SELECT id, name, description, is_active, created_at, updated_at
         FROM crm_cadences
         ORDER BY updated_at DESC, id DESC`
      ),
      pool.query(
        `SELECT
           s.id, s.cadence_id, s.step_number, s.step_type, s.day_offset, s.template_id, s.instructions, s.is_active,
           t.name AS template_name
         FROM crm_cadence_steps s
         LEFT JOIN crm_email_templates t ON t.id = s.template_id
         ORDER BY s.cadence_id ASC, s.step_number ASC`
      ),
    ]);
    const byCadence = new Map();
    stepRes.rows.forEach((row) => {
      const list = byCadence.get(row.cadence_id) || [];
      list.push(row);
      byCadence.set(row.cadence_id, list);
    });
    const cadences = cadenceRes.rows.map((cadence) => ({
      ...cadence,
      steps: byCadence.get(cadence.id) || [],
    }));
    res.json({ cadences });
  } catch (error) {
    next(error);
  }
}

async function createCadence(req, res, next) {
  const client = await pool.connect();
  try {
    const { name, description = '', isActive = true } = req.body || {};
    const trimmedName = String(name || '').trim();
    if (!trimmedName) throw new ApiError(400, 'Cadence name is required');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_cadences
       (name, description, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING id, name, description, is_active, created_at, updated_at`,
      [trimmedName, description || null, Boolean(isActive), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ cadence: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function addCadenceStep(req, res, next) {
  const client = await pool.connect();
  try {
    const cadenceId = Number(req.params.id);
    if (!Number.isInteger(cadenceId) || cadenceId <= 0) throw new ApiError(400, 'Invalid cadence id');
    const {
      stepNumber,
      stepType = 'EMAIL',
      dayOffset = 0,
      templateId = null,
      instructions = '',
      isActive = true,
    } = req.body || {};
    const parsedStepNumber = Number(stepNumber);
    const parsedDayOffset = Number(dayOffset);
    const normalizedStepType = String(stepType || '').toUpperCase();
    if (!Number.isInteger(parsedStepNumber) || parsedStepNumber <= 0) throw new ApiError(400, 'stepNumber must be a positive integer');
    if (!Number.isInteger(parsedDayOffset) || parsedDayOffset < 0) throw new ApiError(400, 'dayOffset must be a non-negative integer');
    if (!['EMAIL', 'CALL', 'TASK'].includes(normalizedStepType)) throw new ApiError(400, 'Invalid stepType');

    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_cadence_steps
       (cadence_id, step_number, step_type, day_offset, template_id, instructions, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id, cadence_id, step_number, step_type, day_offset, template_id, instructions, is_active`,
      [
        cadenceId,
        parsedStepNumber,
        normalizedStepType,
        parsedDayOffset,
        templateId ? Number(templateId) : null,
        instructions || null,
        Boolean(isActive),
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ step: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listSequenceEnrollments(req, res, next) {
  try {
    const { status = '' } = req.query;
    const values = [];
    const filters = [];
    if (status) {
      values.push(String(status).toUpperCase());
      filters.push(`e.status = $${values.length}`);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT
         e.id, e.cadence_id, e.account_id, e.owner_id, e.status, e.started_at, e.next_step_number, e.next_action_at, e.last_activity_at, e.updated_at,
         c.name AS cadence_name,
         a.customer_name, a.customer_number, a.outlet_name,
         u.full_name AS owner_name
       FROM crm_sequence_enrollments e
       JOIN crm_cadences c ON c.id = e.cadence_id
       JOIN customer_accounts a ON a.id = e.account_id
       LEFT JOIN users u ON u.id = e.owner_id
       ${whereClause}
       ORDER BY
         CASE e.status WHEN 'ACTIVE' THEN 1 WHEN 'PAUSED' THEN 2 ELSE 9 END,
         e.next_action_at ASC NULLS LAST,
         e.updated_at DESC
       LIMIT 400`,
      values
    );
    res.json({ enrollments: rows });
  } catch (error) {
    next(error);
  }
}

async function enrollSequence(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      cadenceId,
      accountId,
      ownerId = null,
      status = 'ACTIVE',
      startAt = null,
    } = req.body || {};
    const parsedCadenceId = Number(cadenceId);
    const parsedAccountId = Number(accountId);
    if (!Number.isInteger(parsedCadenceId) || parsedCadenceId <= 0) throw new ApiError(400, 'Invalid cadenceId');
    if (!Number.isInteger(parsedAccountId) || parsedAccountId <= 0) throw new ApiError(400, 'Invalid accountId');
    const normalizedStatus = String(status || '').toUpperCase() || 'ACTIVE';
    if (!['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'].includes(normalizedStatus)) {
      throw new ApiError(400, 'Invalid enrollment status');
    }
    const resolvedOwnerId = ownerId ? Number(ownerId) : req.user.id;
    if (!Number.isInteger(resolvedOwnerId) || resolvedOwnerId <= 0) throw new ApiError(400, 'Invalid ownerId');

    await client.query('BEGIN');
    const firstStep = await client.query(
      `SELECT id, step_number, day_offset
       FROM crm_cadence_steps
       WHERE cadence_id = $1 AND is_active = TRUE
       ORDER BY step_number ASC
       LIMIT 1`,
      [parsedCadenceId]
    );
    if (!firstStep.rows[0]) throw new ApiError(400, 'Cadence has no active steps');

    const explicitStart = startAt ? new Date(startAt) : new Date();
    const safeStart = Number.isNaN(explicitStart.getTime()) ? new Date() : explicitStart;
    const nextActionAt = new Date(safeStart.getTime() + (Number(firstStep.rows[0].day_offset || 0) * 24 * 60 * 60 * 1000));

    const inserted = await client.query(
      `INSERT INTO crm_sequence_enrollments
       (cadence_id, account_id, owner_id, status, started_at, next_step_number, next_action_at, created_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7, NOW())
       RETURNING id, cadence_id, account_id, owner_id, status, started_at, next_step_number, next_action_at, last_activity_at, updated_at`,
      [parsedCadenceId, parsedAccountId, resolvedOwnerId, normalizedStatus, Number(firstStep.rows[0].step_number), nextActionAt.toISOString(), req.user.id]
    );

    await client.query('COMMIT');
    res.status(201).json({ enrollment: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function logSequenceActivity(req, res, next) {
  const client = await pool.connect();
  try {
    const enrollmentId = Number(req.params.id);
    if (!Number.isInteger(enrollmentId) || enrollmentId <= 0) throw new ApiError(400, 'Invalid enrollment id');
    const {
      stepId = null,
      activityType,
      activityStatus = 'DONE',
      summary = '',
      metadata = {},
      nextStepNumber = null,
      nextActionAt = null,
      enrollmentStatus = null,
    } = req.body || {};
    const normalizedActivityType = String(activityType || '').toUpperCase();
    const normalizedActivityStatus = String(activityStatus || '').toUpperCase();
    if (!['EMAIL_SENT', 'CALL_LOGGED', 'TASK_CREATED', 'STEP_SKIPPED'].includes(normalizedActivityType)) {
      throw new ApiError(400, 'Invalid activityType');
    }
    if (!['DONE', 'FAILED'].includes(normalizedActivityStatus)) {
      throw new ApiError(400, 'Invalid activityStatus');
    }

    await client.query('BEGIN');
    const enrollmentRes = await client.query(
      `SELECT id, cadence_id, status, next_step_number
       FROM crm_sequence_enrollments
       WHERE id = $1
       FOR UPDATE`,
      [enrollmentId]
    );
    const enrollment = enrollmentRes.rows[0];
    if (!enrollment) throw new ApiError(404, 'Enrollment not found');

    await client.query(
      `INSERT INTO crm_sequence_activity
       (enrollment_id, step_id, activity_type, activity_status, summary, metadata_json, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, NOW())`,
      [enrollmentId, stepId ? Number(stepId) : null, normalizedActivityType, normalizedActivityStatus, summary || null, JSON.stringify(metadata || {}), req.user.id]
    );

    let computedNextStep = nextStepNumber ? Number(nextStepNumber) : null;
    if (!computedNextStep && stepId) {
      const stepRes = await client.query(
        `SELECT step_number
         FROM crm_cadence_steps
         WHERE id = $1`,
        [Number(stepId)]
      );
      if (stepRes.rows[0]) computedNextStep = Number(stepRes.rows[0].step_number) + 1;
    }
    if (!computedNextStep) {
      computedNextStep = Number(enrollment.next_step_number || 1) + 1;
    }

    let computedNextActionAt = null;
    if (nextActionAt) {
      computedNextActionAt = nextActionAt;
    } else {
      const nextStepRes = await client.query(
        `SELECT day_offset
         FROM crm_cadence_steps
         WHERE cadence_id = $1
           AND step_number = $2
           AND is_active = TRUE
         LIMIT 1`,
        [enrollment.cadence_id, computedNextStep]
      );
      if (nextStepRes.rows[0]) {
        const nextAt = new Date(Date.now() + (Number(nextStepRes.rows[0].day_offset || 0) * 24 * 60 * 60 * 1000));
        computedNextActionAt = nextAt.toISOString();
      }
    }

    let normalizedEnrollmentStatus = enrollmentStatus ? String(enrollmentStatus).toUpperCase() : null;
    if (normalizedEnrollmentStatus && !['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'].includes(normalizedEnrollmentStatus)) {
      throw new ApiError(400, 'Invalid enrollmentStatus');
    }
    if (!normalizedEnrollmentStatus) {
      normalizedEnrollmentStatus = computedNextActionAt ? 'ACTIVE' : 'COMPLETED';
    }

    const updated = await client.query(
      `UPDATE crm_sequence_enrollments
       SET next_step_number = $1,
           next_action_at = $2,
           status = $3,
           last_activity_at = NOW(),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, cadence_id, account_id, owner_id, status, started_at, next_step_number, next_action_at, last_activity_at, updated_at`,
      [computedNextStep, computedNextActionAt, normalizedEnrollmentStatus, enrollmentId]
    );

    await client.query('COMMIT');
    res.json({ enrollment: updated.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listSavedViews(req, res, next) {
  try {
    const moduleName = normalizeSavedViewModule(req.query.module || 'CRM');
    const { rows } = await pool.query(
      `SELECT
         v.id,
         v.module_name,
         v.view_name,
         v.scope,
         v.definition,
         v.owner_id,
         v.created_at,
         v.updated_at,
         u.full_name AS owner_name
       FROM crm_saved_views v
       LEFT JOIN users u ON u.id = v.owner_id
       WHERE v.module_name = $1
         AND (v.scope = 'SHARED' OR v.owner_id = $2)
       ORDER BY
         CASE WHEN v.owner_id = $2 THEN 1 ELSE 2 END,
         v.updated_at DESC,
         v.id DESC`,
      [moduleName, req.user.id]
    );
    res.json({ views: rows });
  } catch (error) {
    next(error);
  }
}

async function createSavedView(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      moduleName = 'CRM',
      viewName,
      scope = 'PRIVATE',
      definition = {},
    } = req.body || {};

    const normalizedModule = normalizeSavedViewModule(moduleName);
    const normalizedScope = normalizeSavedViewScope(scope);
    const trimmedName = String(viewName || '').trim();
    if (!trimmedName) throw new ApiError(400, 'viewName is required');
    if (normalizedScope === 'SHARED' && !req.user.permissions?.crm_manage_approvals) {
      throw new ApiError(403, 'Shared views require CRM approval rights');
    }

    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_saved_views (module_name, view_name, scope, definition, owner_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, NOW(), NOW())
       RETURNING id`,
      [normalizedModule, trimmedName, normalizedScope, JSON.stringify(definition || {}), req.user.id]
    );

    const detail = await client.query(
      `SELECT
         v.id, v.module_name, v.view_name, v.scope, v.definition, v.owner_id, v.created_at, v.updated_at,
         u.full_name AS owner_name
       FROM crm_saved_views v
       LEFT JOIN users u ON u.id = v.owner_id
       WHERE v.id = $1`,
      [inserted.rows[0].id]
    );
    await client.query('COMMIT');
    res.status(201).json({ view: detail.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateSavedView(req, res, next) {
  const client = await pool.connect();
  try {
    const viewId = Number(req.params.id);
    if (!Number.isInteger(viewId) || viewId <= 0) throw new ApiError(400, 'Invalid saved view id');
    const {
      viewName,
      scope,
      definition,
    } = req.body || {};

    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, owner_id, module_name, view_name, scope, definition
       FROM crm_saved_views
       WHERE id = $1`,
      [viewId]
    );
    const current = found.rows[0];
    if (!current) throw new ApiError(404, 'Saved view not found');
    if (current.owner_id !== req.user.id && !req.user.permissions?.crm_manage_approvals) {
      throw new ApiError(403, 'Only the owner or a CRM approver can update this view');
    }

    const nextScope = scope !== undefined ? normalizeSavedViewScope(scope) : current.scope;
    if (nextScope === 'SHARED' && !req.user.permissions?.crm_manage_approvals) {
      throw new ApiError(403, 'Shared views require CRM approval rights');
    }
    const nextName = viewName !== undefined ? (String(viewName || '').trim() || current.view_name) : current.view_name;
    const nextDefinition = definition !== undefined ? definition : current.definition;

    await client.query(
      `UPDATE crm_saved_views
       SET view_name = $1,
           scope = $2,
           definition = $3::jsonb,
           updated_at = NOW()
       WHERE id = $4`,
      [nextName, nextScope, JSON.stringify(nextDefinition || {}), viewId]
    );

    const detail = await client.query(
      `SELECT
         v.id, v.module_name, v.view_name, v.scope, v.definition, v.owner_id, v.created_at, v.updated_at,
         u.full_name AS owner_name
       FROM crm_saved_views v
       LEFT JOIN users u ON u.id = v.owner_id
       WHERE v.id = $1`,
      [viewId]
    );
    await client.query('COMMIT');
    res.json({ view: detail.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function deleteSavedView(req, res, next) {
  const client = await pool.connect();
  try {
    const viewId = Number(req.params.id);
    if (!Number.isInteger(viewId) || viewId <= 0) throw new ApiError(400, 'Invalid saved view id');

    await client.query('BEGIN');
    const found = await client.query(
      `SELECT id, owner_id
       FROM crm_saved_views
       WHERE id = $1`,
      [viewId]
    );
    const current = found.rows[0];
    if (!current) throw new ApiError(404, 'Saved view not found');
    if (current.owner_id !== req.user.id && !req.user.permissions?.crm_manage_approvals) {
      throw new ApiError(403, 'Only the owner or a CRM approver can delete this view');
    }

    await client.query('DELETE FROM crm_saved_views WHERE id = $1', [viewId]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listAccountShares(req, res, next) {
  try {
    const accountId = Number(req.params.id);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new ApiError(400, 'Invalid customer account id');
    const scopedOutlet = getCrmOutletScope(req);
    const client = await pool.connect();
    try {
      await ensureAccountAccess(client, accountId, scopedOutlet, req.user.id, false);
      const { rows } = await client.query(
        `SELECT s.id, s.account_id, s.user_id, s.access_level, s.created_at, u.full_name, u.email
         FROM crm_account_shares s
         LEFT JOIN users u ON u.id = s.user_id
         WHERE s.account_id = $1
         ORDER BY s.created_at DESC`,
        [accountId]
      );
      res.json({ shares: rows });
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
}

async function upsertAccountShare(req, res, next) {
  const client = await pool.connect();
  try {
    const accountId = Number(req.params.id);
    const { userId, accessLevel = 'VIEW' } = req.body || {};
    const targetUserId = Number(userId);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new ApiError(400, 'Invalid customer account id');
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) throw new ApiError(400, 'Invalid userId');
    const normalizedAccess = String(accessLevel || '').trim().toUpperCase();
    if (!['VIEW', 'EDIT'].includes(normalizedAccess)) throw new ApiError(400, 'Invalid access level');
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO crm_account_shares (account_id, user_id, access_level, created_by, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (account_id, user_id)
       DO UPDATE SET access_level = EXCLUDED.access_level`,
      [accountId, targetUserId, normalizedAccess, req.user.id]
    );
    const { rows } = await client.query(
      `SELECT s.id, s.account_id, s.user_id, s.access_level, s.created_at, u.full_name, u.email
       FROM crm_account_shares s
       LEFT JOIN users u ON u.id = s.user_id
       WHERE s.account_id = $1 AND s.user_id = $2`,
      [accountId, targetUserId]
    );
    await client.query('COMMIT');
    res.json({ share: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function deleteAccountShare(req, res, next) {
  const client = await pool.connect();
  try {
    const accountId = Number(req.params.id);
    const shareId = Number(req.params.shareId);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new ApiError(400, 'Invalid customer account id');
    if (!Number.isInteger(shareId) || shareId <= 0) throw new ApiError(400, 'Invalid share id');
    await client.query('BEGIN');
    await client.query('DELETE FROM crm_account_shares WHERE id = $1 AND account_id = $2', [shareId, accountId]);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function getFieldPermissions(req, res, next) {
  try {
    const roleName = String(req.user.role || '').toUpperCase();
    const { rows } = await pool.query(
      `SELECT field_name, can_edit
       FROM crm_field_permissions
       WHERE role_name = $1`,
      [roleName]
    );
    res.json({ role: roleName, fields: rows });
  } catch (error) {
    next(error);
  }
}

async function listCrmUsers(req, res, next) {
  try {
    const { search = '' } = req.query;
    const values = [];
    let whereClause = "WHERE r.name IN ('CUSTOMER_SERVICE', 'SUPER_USER', 'FINANCE')";
    if (search) {
      values.push(`%${String(search).trim()}%`);
      whereClause += ` AND (u.full_name ILIKE $${values.length} OR u.email ILIKE $${values.length})`;
    }
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.email, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       ${whereClause}
       ORDER BY u.full_name ASC, u.id ASC
       LIMIT 200`,
      values
    );
    res.json({ users: rows });
  } catch (error) {
    next(error);
  }
}

async function getCrmReportsOverview(req, res, next) {
  try {
    const { from = '', to = '', outlet = '' } = req.query;
    const scopedOutlet = getCrmOutletScope(req);
    const values = [];
    const orderFilters = [];
    const taskFilters = [];
    const opportunityFilters = [];
    if (from) {
      values.push(from);
      orderFilters.push(`o.order_date >= $${values.length}`);
      taskFilters.push(`t.due_date >= $${values.length}`);
      opportunityFilters.push(`op.expected_close_date >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      orderFilters.push(`o.order_date <= $${values.length}`);
      taskFilters.push(`t.due_date <= $${values.length}`);
      opportunityFilters.push(`op.expected_close_date <= $${values.length}`);
    }
    if (scopedOutlet) {
      values.push(scopedOutlet);
      orderFilters.push(`LOWER(o.ordered_from) = LOWER($${values.length})`);
      taskFilters.push(`EXISTS (SELECT 1 FROM customer_accounts a WHERE a.id = t.account_id AND LOWER(a.outlet_name) = LOWER($${values.length}))`);
      opportunityFilters.push(`EXISTS (SELECT 1 FROM customer_accounts a WHERE a.id = op.account_id AND LOWER(a.outlet_name) = LOWER($${values.length}))`);
    } else if (outlet) {
      values.push(outlet);
      orderFilters.push(`LOWER(o.ordered_from) = LOWER($${values.length})`);
      taskFilters.push(`EXISTS (SELECT 1 FROM customer_accounts a WHERE a.id = t.account_id AND LOWER(a.outlet_name) = LOWER($${values.length}))`);
      opportunityFilters.push(`EXISTS (SELECT 1 FROM customer_accounts a WHERE a.id = op.account_id AND LOWER(a.outlet_name) = LOWER($${values.length}))`);
    }
    const orderWhere = orderFilters.length ? `WHERE ${orderFilters.join(' AND ')}` : '';
    const taskWhere = taskFilters.length ? `WHERE ${taskFilters.join(' AND ')}` : '';
    const opportunityWhere = opportunityFilters.length ? `WHERE ${opportunityFilters.join(' AND ')}` : '';

    const [kpiRes, orderSeriesRes, taskSeriesRes, oppStageRes, forecastRes, ownerPipelineRes, winRateRes] = await Promise.all([
      pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM customer_accounts) AS total_customers,
           (SELECT COUNT(*)::int FROM crm_opportunities) AS total_opportunities,
           (SELECT COALESCE(SUM(expected_value),0)::numeric(12,2) FROM crm_opportunities WHERE status = 'OPEN') AS open_pipeline_value,
           (SELECT COUNT(*)::int FROM crm_tasks WHERE status = 'OPEN') AS open_tasks,
           (SELECT COUNT(*)::int FROM crm_tasks WHERE status = 'OPEN' AND due_date < CURRENT_DATE) AS overdue_tasks,
           (SELECT COALESCE(SUM(expected_value * probability / 100.0),0)::numeric(12,2) FROM crm_opportunities WHERE status = 'OPEN') AS weighted_pipeline_value`,
        []
      ),
      pool.query(
        `SELECT o.order_date::date AS day, COUNT(*)::int AS count, COALESCE(SUM(o.product_price),0)::numeric(12,2) AS value
         FROM orders o
         ${orderWhere}
         GROUP BY o.order_date::date
         ORDER BY o.order_date::date ASC`,
        values
      ),
      pool.query(
        `SELECT t.due_date::date AS day,
                COUNT(*)::int AS total,
                COALESCE(SUM(CASE WHEN t.status = 'COMPLETED' THEN 1 ELSE 0 END),0)::int AS completed
         FROM crm_tasks t
         ${taskWhere}
         GROUP BY t.due_date::date
         ORDER BY t.due_date::date ASC`,
        values
      ),
      pool.query(
        `SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(expected_value),0)::numeric(12,2) AS value
         FROM crm_opportunities
         GROUP BY stage`,
        []
      ),
      pool.query(
        `SELECT
           DATE_TRUNC('month', op.expected_close_date)::date AS month,
           COUNT(*)::int AS opportunity_count,
           COALESCE(SUM(op.expected_value),0)::numeric(12,2) AS pipeline_value,
           COALESCE(SUM(op.expected_value * op.probability / 100.0),0)::numeric(12,2) AS weighted_value
         FROM crm_opportunities op
         ${opportunityWhere ? `${opportunityWhere} AND` : 'WHERE'} op.status = 'OPEN' AND op.expected_close_date IS NOT NULL
         GROUP BY DATE_TRUNC('month', op.expected_close_date)::date
         ORDER BY month ASC`,
        values
      ),
      pool.query(
        `SELECT
           COALESCE(u.full_name, 'Unassigned') AS owner_name,
           COUNT(*)::int AS open_count,
           COALESCE(SUM(op.expected_value),0)::numeric(12,2) AS open_value,
           COALESCE(SUM(op.expected_value * op.probability / 100.0),0)::numeric(12,2) AS weighted_value
         FROM crm_opportunities op
         LEFT JOIN users u ON u.id = op.owner_id
         ${opportunityWhere ? `${opportunityWhere} AND` : 'WHERE'} op.status = 'OPEN'
         GROUP BY owner_name
         ORDER BY open_value DESC, owner_name ASC
         LIMIT 20`,
        values
      ),
      pool.query(
        `SELECT
           DATE_TRUNC('month', COALESCE(op.won_at, op.lost_at, op.updated_at))::date AS month,
           COUNT(*)::int AS total_closed,
           COALESCE(SUM(CASE WHEN op.status = 'WON' THEN 1 ELSE 0 END),0)::int AS won_count
         FROM crm_opportunities op
         ${opportunityWhere ? `${opportunityWhere} AND` : 'WHERE'} op.status IN ('WON', 'LOST')
         GROUP BY DATE_TRUNC('month', COALESCE(op.won_at, op.lost_at, op.updated_at))::date
         ORDER BY month ASC`,
        values
      ),
    ]);

    res.json({
      kpis: kpiRes.rows[0] || {},
      orders_by_day: orderSeriesRes.rows || [],
      tasks_by_day: taskSeriesRes.rows || [],
      opportunities_by_stage: oppStageRes.rows || [],
      forecast_by_month: forecastRes.rows || [],
      owner_pipeline: ownerPipelineRes.rows || [],
      close_rate_by_month: (winRateRes.rows || []).map((row) => ({
        ...row,
        win_rate: Number(row.total_closed || 0) > 0
          ? Number(((Number(row.won_count || 0) * 100) / Number(row.total_closed || 0)).toFixed(2))
          : 0,
      })),
      scoped_outlet: scopedOutlet || null,
    });
  } catch (error) {
    next(error);
  }
}

async function listNotifications(req, res, next) {
  const client = await pool.connect();
  try {
    const { status = '' } = req.query;
    await client.query('BEGIN');
    await ensureCommunicationAlerts(client);
    const values = [req.user.id];
    let whereClause = 'WHERE n.user_id = $1';
    if (status) {
      values.push(String(status).toUpperCase());
      whereClause += ` AND n.status = $${values.length}`;
    }
    const { rows } = await client.query(
      `SELECT n.id, n.title, n.message, n.severity, n.status, n.linked_type, n.linked_id, n.payload_json, n.created_at, n.read_at
       FROM crm_notifications n
       ${whereClause}
       ORDER BY n.created_at DESC
       LIMIT 300`,
      values
    );
    const summary = await client.query(
      `SELECT COUNT(*)::int AS total, COALESCE(SUM(CASE WHEN status = 'UNREAD' THEN 1 ELSE 0 END),0)::int AS unread
       FROM crm_notifications
       WHERE user_id = $1`,
      [req.user.id]
    );
    await client.query('COMMIT');
    res.json({ notifications: rows, summary: summary.rows[0] || { total: 0, unread: 0 } });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function markNotificationRead(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'Invalid notification id');
    await pool.query(
      `UPDATE crm_notifications
       SET status = 'READ', read_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function markAllNotificationsRead(req, res, next) {
  try {
    await pool.query(
      `UPDATE crm_notifications
       SET status = 'READ', read_at = NOW()
       WHERE user_id = $1 AND status = 'UNREAD'`,
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function listAutomationRules(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, event_type, condition_json, action_json, is_active, created_at, updated_at
       FROM crm_automation_rules
       ORDER BY updated_at DESC, id DESC`
    );
    res.json({ rules: rows });
  } catch (error) {
    next(error);
  }
}

async function updateAutomationRule(req, res, next) {
  const client = await pool.connect();
  try {
    const ruleId = Number(req.params.id);
    if (!Number.isInteger(ruleId) || ruleId <= 0) throw new ApiError(400, 'Invalid automation rule id');
    const { isActive } = req.body || {};
    await client.query('BEGIN');
    await client.query(
      `UPDATE crm_automation_rules
       SET is_active = COALESCE($1, is_active),
           updated_at = NOW()
       WHERE id = $2`,
      [isActive === undefined ? null : Boolean(isActive), ruleId]
    );
    const { rows } = await client.query(
      `SELECT id, name, event_type, condition_json, action_json, is_active, created_at, updated_at
       FROM crm_automation_rules
       WHERE id = $1`,
      [ruleId]
    );
    if (!rows[0]) throw new ApiError(404, 'Automation rule not found');
    await client.query('COMMIT');
    res.json({ rule: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listAutomationLogs(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT l.id, l.event_type, l.reference_type, l.reference_id, l.result, l.detail_json, l.created_at, r.name AS rule_name
       FROM crm_automation_logs l
       LEFT JOIN crm_automation_rules r ON r.id = l.rule_id
       ORDER BY l.created_at DESC, l.id DESC
       LIMIT 200`
    );
    res.json({ logs: rows });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getCrmSummary,
  globalCrmSearch,
  listLeadQueue,
  updateLeadRecord,
  listCustomers,
  getCustomerDetails,
  updateCustomer,
  getCustomerMergePreview,
  mergeCustomers,
  addInteraction,
  getOpportunitySummary,
  listOpportunities,
  createOpportunity,
  updateOpportunity,
  listOpportunityLineItems,
  addOpportunityLineItem,
  convertLead,
  listLeadConversions,
  getTaskSummary,
  listTasks,
  createTask,
  updateTask,
  listTaskTemplates,
  createTaskTemplate,
  listCommunicationCenter,
  getCaseSummary,
  listCases,
  createCase,
  updateCase,
  addCaseComment,
  listCaseComments,
  listApprovals,
  decideApproval,
  listEmailTemplates,
  createEmailTemplate,
  listCadences,
  createCadence,
  addCadenceStep,
  listSequenceEnrollments,
  enrollSequence,
  logSequenceActivity,
  listSavedViews,
  createSavedView,
  updateSavedView,
  deleteSavedView,
  listAccountShares,
  upsertAccountShare,
  deleteAccountShare,
  getFieldPermissions,
  listCrmUsers,
  getCrmReportsOverview,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  listAutomationRules,
  updateAutomationRule,
  listAutomationLogs,
};
