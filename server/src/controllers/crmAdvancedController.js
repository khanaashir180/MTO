const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

function toInt(v, field) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Invalid ${field}`);
  return n;
}

function safeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function listKnowledgeArticles(req, res, next) {
  try {
    const { status = '', search = '' } = req.query;
    const values = [];
    const filters = [];
    if (status) {
      values.push(String(status).toUpperCase());
      filters.push(`status = $${values.length}`);
    }
    if (search) {
      values.push(`%${String(search).trim()}%`);
      filters.push(`(title ILIKE $${values.length} OR COALESCE(summary,'') ILIKE $${values.length})`);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT id, title, slug, summary, category, status, published_at, updated_at
       FROM crm_knowledge_articles
       ${whereClause}
       ORDER BY updated_at DESC, id DESC
       LIMIT 400`,
      values
    );
    res.json({ articles: rows });
  } catch (error) {
    next(error);
  }
}

async function createKnowledgeArticle(req, res, next) {
  const client = await pool.connect();
  try {
    const { title, summary = '', bodyMarkdown = '', category = 'GENERAL', status = 'DRAFT' } = req.body || {};
    if (!String(title || '').trim()) throw new ApiError(400, 'title is required');
    if (!String(bodyMarkdown || '').trim()) throw new ApiError(400, 'bodyMarkdown is required');
    const normalizedStatus = String(status || 'DRAFT').toUpperCase();
    if (!['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(normalizedStatus)) throw new ApiError(400, 'Invalid article status');
    const slug = safeSlug(title);
    if (!slug) throw new ApiError(400, 'Invalid title for slug generation');

    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_knowledge_articles
       (title, slug, summary, body_markdown, category, status, published_at, owner_id, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING id`,
      [
        String(title).trim(),
        slug,
        summary || null,
        bodyMarkdown,
        String(category || 'GENERAL').toUpperCase(),
        normalizedStatus,
        normalizedStatus === 'PUBLISHED' ? new Date() : null,
        req.user.id,
        req.user.id,
      ]
    );
    const { rows } = await client.query('SELECT * FROM crm_knowledge_articles WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ article: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listEntitlements(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT e.id, e.account_id, e.plan_name, e.tier, e.start_date, e.end_date, e.active,
              e.first_response_target_minutes, e.resolution_target_minutes, e.updated_at,
              a.customer_name, a.customer_number
       FROM crm_entitlements e
       JOIN customer_accounts a ON a.id = e.account_id
       ORDER BY e.updated_at DESC, e.id DESC
       LIMIT 400`
    );
    res.json({ entitlements: rows });
  } catch (error) {
    next(error);
  }
}

async function createEntitlement(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      accountId,
      planName,
      tier = 'STANDARD',
      startDate,
      endDate = null,
      active = true,
      firstResponseTargetMinutes = 120,
      resolutionTargetMinutes = 2880,
      businessHoursName = '',
    } = req.body || {};
    if (!accountId) throw new ApiError(400, 'accountId is required');
    if (!String(planName || '').trim()) throw new ApiError(400, 'planName is required');
    if (!startDate) throw new ApiError(400, 'startDate is required');

    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_entitlements
       (account_id, plan_name, tier, start_date, end_date, active, business_hours_name, first_response_target_minutes, resolution_target_minutes, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING id`,
      [
        toInt(accountId, 'accountId'),
        String(planName).trim(),
        String(tier || 'STANDARD').toUpperCase(),
        startDate,
        endDate || null,
        Boolean(active),
        businessHoursName || null,
        Number(firstResponseTargetMinutes || 120),
        Number(resolutionTargetMinutes || 2880),
        req.user.id,
      ]
    );
    const { rows } = await client.query('SELECT * FROM crm_entitlements WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ entitlement: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listCaseMilestones(req, res, next) {
  try {
    const caseId = req.query.caseId ? toInt(req.query.caseId, 'caseId') : null;
    const values = [];
    const filters = [];
    if (caseId) {
      values.push(caseId);
      filters.push(`m.case_id = $${values.length}`);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT m.id, m.case_id, m.entitlement_id, m.milestone_name, m.target_at, m.completed_at, m.status, m.updated_at,
              c.subject AS case_subject, e.plan_name
       FROM crm_case_milestones m
       JOIN crm_cases c ON c.id = m.case_id
       LEFT JOIN crm_entitlements e ON e.id = m.entitlement_id
       ${whereClause}
       ORDER BY m.target_at ASC, m.id DESC
       LIMIT 500`,
      values
    );
    res.json({ milestones: rows });
  } catch (error) {
    next(error);
  }
}

async function createCaseMilestone(req, res, next) {
  const client = await pool.connect();
  try {
    const { caseId, entitlementId = null, milestoneName, targetAt, ownerId = null } = req.body || {};
    if (!caseId) throw new ApiError(400, 'caseId is required');
    if (!String(milestoneName || '').trim()) throw new ApiError(400, 'milestoneName is required');
    if (!targetAt) throw new ApiError(400, 'targetAt is required');

    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_case_milestones
       (case_id, entitlement_id, milestone_name, target_at, status, owner_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'OPEN', $5, NOW(), NOW())
       RETURNING id`,
      [
        toInt(caseId, 'caseId'),
        entitlementId ? toInt(entitlementId, 'entitlementId') : null,
        String(milestoneName).trim(),
        targetAt,
        ownerId ? toInt(ownerId, 'ownerId') : req.user.id,
      ]
    );
    const { rows } = await client.query('SELECT * FROM crm_case_milestones WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ milestone: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateCaseMilestoneStatus(req, res, next) {
  const client = await pool.connect();
  try {
    const id = toInt(req.params.id, 'milestone id');
    const status = String(req.body?.status || '').toUpperCase();
    if (!['OPEN', 'COMPLETED', 'BREACHED'].includes(status)) throw new ApiError(400, 'Invalid milestone status');
    await client.query('BEGIN');
    await client.query(
      `UPDATE crm_case_milestones
       SET status = $1,
           completed_at = CASE WHEN $1 = 'COMPLETED' THEN NOW() ELSE completed_at END,
           updated_at = NOW()
       WHERE id = $2`,
      [status, id]
    );
    const { rows } = await client.query('SELECT * FROM crm_case_milestones WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ milestone: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listReportSubscriptions(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT s.id, s.report_name, s.subscriber_user_id, s.schedule_type, s.schedule_config, s.delivery_channel, s.active, s.updated_at,
              u.full_name AS subscriber_name
       FROM crm_report_subscriptions s
       JOIN users u ON u.id = s.subscriber_user_id
       ORDER BY s.updated_at DESC, s.id DESC`
    );
    res.json({ subscriptions: rows });
  } catch (error) {
    next(error);
  }
}

async function createReportSubscription(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      reportName,
      subscriberUserId = null,
      scheduleType = 'WEEKLY',
      scheduleConfig = {},
      deliveryChannel = 'IN_APP',
      active = true,
    } = req.body || {};
    if (!String(reportName || '').trim()) throw new ApiError(400, 'reportName is required');

    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_report_subscriptions
       (report_name, subscriber_user_id, schedule_type, schedule_config, delivery_channel, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, NOW(), NOW())
       RETURNING id`,
      [
        String(reportName).trim(),
        subscriberUserId ? toInt(subscriberUserId, 'subscriberUserId') : req.user.id,
        String(scheduleType || 'WEEKLY').toUpperCase(),
        JSON.stringify(scheduleConfig || {}),
        String(deliveryChannel || 'IN_APP').toUpperCase(),
        Boolean(active),
        req.user.id,
      ]
    );
    const { rows } = await client.query('SELECT * FROM crm_report_subscriptions WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ subscription: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listWebhooks(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, target_url, event_types, is_active, retry_limit, last_delivery_at, last_status, updated_at
       FROM crm_webhooks
       ORDER BY updated_at DESC, id DESC`
    );
    res.json({ webhooks: rows });
  } catch (error) {
    next(error);
  }
}

async function createWebhook(req, res, next) {
  const client = await pool.connect();
  try {
    const { name, targetUrl, secretToken = '', eventTypes = [], isActive = true, retryLimit = 3 } = req.body || {};
    if (!String(name || '').trim()) throw new ApiError(400, 'name is required');
    if (!String(targetUrl || '').trim()) throw new ApiError(400, 'targetUrl is required');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_webhooks
       (name, target_url, secret_token, event_types, is_active, retry_limit, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id`,
      [
        String(name).trim(),
        String(targetUrl).trim(),
        secretToken || null,
        Array.isArray(eventTypes) ? eventTypes.map((event) => String(event).trim()).filter(Boolean) : [],
        Boolean(isActive),
        Number(retryLimit || 3),
        req.user.id,
      ]
    );
    const { rows } = await client.query('SELECT * FROM crm_webhooks WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ webhook: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listTerritories(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.name, t.region_code, t.description, t.manager_user_id, t.is_active, t.updated_at,
              u.full_name AS manager_name,
              COALESCE(COUNT(at.id), 0) AS account_count
       FROM crm_territories t
       LEFT JOIN users u ON u.id = t.manager_user_id
       LEFT JOIN crm_account_territories at ON at.territory_id = t.id
       GROUP BY t.id, u.full_name
       ORDER BY t.updated_at DESC, t.id DESC`
    );
    res.json({ territories: rows });
  } catch (error) {
    next(error);
  }
}

async function createTerritory(req, res, next) {
  const client = await pool.connect();
  try {
    const { name, regionCode = '', description = '', managerUserId = null, isActive = true } = req.body || {};
    if (!String(name || '').trim()) throw new ApiError(400, 'name is required');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_territories
       (name, region_code, description, manager_user_id, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING id`,
      [
        String(name).trim(),
        regionCode || null,
        description || null,
        managerUserId ? toInt(managerUserId, 'managerUserId') : null,
        Boolean(isActive),
        req.user.id,
      ]
    );
    const { rows } = await client.query('SELECT * FROM crm_territories WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ territory: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function assignAccountTerritory(req, res, next) {
  const client = await pool.connect();
  try {
    const territoryId = toInt(req.params.id, 'territory id');
    const accountId = toInt(req.body?.accountId, 'accountId');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_account_territories (account_id, territory_id, assigned_by, assigned_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (account_id, territory_id)
       DO UPDATE SET assigned_by = EXCLUDED.assigned_by, assigned_at = NOW()
       RETURNING *`,
      [accountId, territoryId, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ assignment: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  listKnowledgeArticles,
  createKnowledgeArticle,
  listEntitlements,
  createEntitlement,
  listCaseMilestones,
  createCaseMilestone,
  updateCaseMilestoneStatus,
  listReportSubscriptions,
  createReportSubscription,
  listWebhooks,
  createWebhook,
  listTerritories,
  createTerritory,
  assignAccountTerritory,
};
