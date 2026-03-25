const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

function toInt(v, field) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Invalid ${field}`);
  return n;
}

async function listObjectManager(req, res, next) {
  try {
    const [objectsRes, fieldsRes, recordTypesRes, layoutsRes] = await Promise.all([
      pool.query('SELECT * FROM crm_custom_objects ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT * FROM crm_custom_fields ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT * FROM crm_record_types ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT * FROM crm_page_layouts ORDER BY updated_at DESC, id DESC'),
    ]);
    res.json({
      objects: objectsRes.rows,
      fields: fieldsRes.rows,
      recordTypes: recordTypesRes.rows,
      layouts: layoutsRes.rows,
    });
  } catch (error) {
    next(error);
  }
}

async function createCustomObject(req, res, next) {
  const client = await pool.connect();
  try {
    const { apiName, label, pluralLabel, description = '', deploymentStatus = 'DEPLOYED', sharingModel = 'PRIVATE' } = req.body || {};
    if (!String(apiName || '').trim()) throw new ApiError(400, 'apiName is required');
    if (!String(label || '').trim()) throw new ApiError(400, 'label is required');
    if (!String(pluralLabel || '').trim()) throw new ApiError(400, 'pluralLabel is required');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_custom_objects
       (api_name, label, plural_label, description, deployment_status, sharing_model, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [
        String(apiName).trim(),
        String(label).trim(),
        String(pluralLabel).trim(),
        description || null,
        String(deploymentStatus || 'DEPLOYED').toUpperCase(),
        String(sharingModel || 'PRIVATE').toUpperCase(),
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ object: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createCustomField(req, res, next) {
  const client = await pool.connect();
  try {
    const { objectId, apiName, label, dataType = 'TEXT', required = false, uniqueField = false, defaultValue = null, picklistValues = [] } = req.body || {};
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_custom_fields
       (object_id, api_name, label, data_type, required, unique_field, default_value, picklist_values, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, NOW(), NOW())
       RETURNING *`,
      [
        toInt(objectId, 'objectId'),
        String(apiName || '').trim(),
        String(label || '').trim(),
        String(dataType || 'TEXT').toUpperCase(),
        Boolean(required),
        Boolean(uniqueField),
        defaultValue,
        JSON.stringify(Array.isArray(picklistValues) ? picklistValues : []),
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ field: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createRecordType(req, res, next) {
  const client = await pool.connect();
  try {
    const { objectId, developerName, label, active = true } = req.body || {};
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_record_types
       (object_id, developer_name, label, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [toInt(objectId, 'objectId'), String(developerName || '').trim(), String(label || '').trim(), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ recordType: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createPageLayout(req, res, next) {
  const client = await pool.connect();
  try {
    const { objectId, layoutName, sections = [], assignedRecordTypeId = null, active = true } = req.body || {};
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_page_layouts
       (object_id, layout_name, sections_json, assigned_record_type_id, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [toInt(objectId, 'objectId'), String(layoutName || '').trim(), JSON.stringify(sections), assignedRecordTypeId ? toInt(assignedRecordTypeId, 'assignedRecordTypeId') : null, Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ layout: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listSecurityModel(req, res, next) {
  try {
    const [rolesRes, owdRes, rulesRes] = await Promise.all([
      pool.query('SELECT r.*, u.full_name AS owner_name FROM crm_role_hierarchy_nodes r LEFT JOIN users u ON u.id = r.owner_user_id ORDER BY r.updated_at DESC, r.id DESC'),
      pool.query('SELECT * FROM crm_org_wide_defaults ORDER BY object_name ASC'),
      pool.query('SELECT * FROM crm_sharing_rules ORDER BY updated_at DESC, id DESC'),
    ]);
    res.json({ roles: rolesRes.rows, owd: owdRes.rows, sharingRules: rulesRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createRoleNode(req, res, next) {
  const client = await pool.connect();
  try {
    const { roleName, parentRoleId = null, ownerUserId = null, active = true } = req.body || {};
    if (!String(roleName || '').trim()) throw new ApiError(400, 'roleName is required');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_role_hierarchy_nodes
       (role_name, parent_role_id, owner_user_id, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [String(roleName || '').trim(), parentRoleId ? toInt(parentRoleId, 'parentRoleId') : null, ownerUserId ? toInt(ownerUserId, 'ownerUserId') : null, Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ roleNode: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function upsertOrgWideDefault(req, res, next) {
  const client = await pool.connect();
  try {
    const { objectName, internalAccess, externalAccess } = req.body || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_org_wide_defaults (object_name, internal_access, external_access, updated_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (object_name)
       DO UPDATE SET internal_access = EXCLUDED.internal_access, external_access = EXCLUDED.external_access, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [String(objectName || '').toUpperCase(), String(internalAccess || 'PRIVATE').toUpperCase(), String(externalAccess || 'PRIVATE').toUpperCase(), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ owd: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createSharingRule(req, res, next) {
  const client = await pool.connect();
  try {
    const { objectName, ruleName, criteria = {}, grantAccess = 'READ', targetScope = 'ROLE', targetIdentifier } = req.body || {};
    if (!String(objectName || '').trim()) throw new ApiError(400, 'objectName is required');
    if (!String(ruleName || '').trim()) throw new ApiError(400, 'ruleName is required');
    if (!String(targetIdentifier || '').trim()) throw new ApiError(400, 'targetIdentifier is required');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_sharing_rules
       (object_name, rule_name, criteria_json, grant_access, target_scope, target_identifier, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, TRUE, $7, NOW(), NOW())
       RETURNING *`,
      [
        String(objectName || '').toUpperCase(),
        String(ruleName || '').trim(),
        JSON.stringify(criteria || {}),
        String(grantAccess || 'READ').toUpperCase(),
        String(targetScope || 'ROLE').toUpperCase(),
        String(targetIdentifier || '').trim(),
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ sharingRule: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listCpqDesigner(req, res, next) {
  try {
    const [bundlesRes, itemsRes, pricingRulesRes, schedulesRes, approvalsRes] = await Promise.all([
      pool.query('SELECT * FROM crm_product_bundles ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT bi.*, p.name AS product_name FROM crm_bundle_items bi JOIN crm_products p ON p.id = bi.product_id ORDER BY bi.updated_at DESC, bi.id DESC'),
      pool.query('SELECT * FROM crm_pricing_rules ORDER BY priority ASC, updated_at DESC'),
      pool.query('SELECT * FROM crm_discount_schedules ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT qa.*, q.quote_number FROM crm_quote_approvals qa JOIN crm_quotes q ON q.id = qa.quote_id ORDER BY qa.requested_at DESC, qa.id DESC'),
    ]);
    res.json({
      bundles: bundlesRes.rows,
      bundleItems: itemsRes.rows,
      pricingRules: pricingRulesRes.rows,
      discountSchedules: schedulesRes.rows,
      quoteApprovals: approvalsRes.rows,
    });
  } catch (error) {
    next(error);
  }
}

async function createBundle(req, res, next) {
  const client = await pool.connect();
  try {
    const { bundleName, bundleCode, basePrice = 0, active = true } = req.body || {};
    if (!String(bundleName || '').trim()) throw new ApiError(400, 'bundleName is required');
    if (!String(bundleCode || '').trim()) throw new ApiError(400, 'bundleCode is required');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_product_bundles
       (bundle_name, bundle_code, base_price, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [String(bundleName || '').trim(), String(bundleCode || '').trim(), Number(basePrice || 0), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ bundle: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function addBundleItem(req, res, next) {
  const client = await pool.connect();
  try {
    const bundleId = toInt(req.params.id, 'bundle id');
    const { productId, quantity = 1, required = true, minQty = 1, maxQty = null } = req.body || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_bundle_items
       (bundle_id, product_id, quantity, required, min_qty, max_qty, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (bundle_id, product_id)
       DO UPDATE SET quantity = EXCLUDED.quantity, required = EXCLUDED.required, min_qty = EXCLUDED.min_qty, max_qty = EXCLUDED.max_qty, updated_at = NOW()
       RETURNING *`,
      [bundleId, toInt(productId, 'productId'), Number(quantity || 1), Boolean(required), Number(minQty || 1), maxQty ? Number(maxQty) : null]
    );
    await client.query('COMMIT');
    res.status(201).json({ bundleItem: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createPricingRule(req, res, next) {
  const client = await pool.connect();
  try {
    const { ruleName, scope = 'QUOTE_LINE', condition = {}, action = {}, priority = 100, active = true } = req.body || {};
    if (!String(ruleName || '').trim()) throw new ApiError(400, 'ruleName is required');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_pricing_rules
       (rule_name, scope, condition_json, action_json, priority, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [String(ruleName || '').trim(), String(scope || 'QUOTE_LINE').toUpperCase(), JSON.stringify(condition || {}), JSON.stringify(action || {}), Number(priority || 100), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ pricingRule: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function createDiscountSchedule(req, res, next) {
  const client = await pool.connect();
  try {
    const { scheduleName, appliesTo = 'PRODUCT', targetId, tiers = [], active = true } = req.body || {};
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_discount_schedules
       (schedule_name, applies_to, target_id, tiers_json, active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW(), NOW())
       RETURNING *`,
      [String(scheduleName || '').trim(), String(appliesTo || 'PRODUCT').toUpperCase(), toInt(targetId, 'targetId'), JSON.stringify(tiers || []), Boolean(active), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ discountSchedule: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function requestQuoteApproval(req, res, next) {
  const client = await pool.connect();
  try {
    const { quoteId, thresholdPercent = 0, approverId = null, decisionNote = '' } = req.body || {};
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_quote_approvals
       (quote_id, threshold_percent, requested_by, approver_id, status, decision_note, requested_at, updated_at)
       VALUES ($1, $2, $3, $4, 'PENDING', $5, NOW(), NOW())
       RETURNING *`,
      [toInt(quoteId, 'quoteId'), Number(thresholdPercent || 0), req.user.id, approverId ? toInt(approverId, 'approverId') : null, decisionNote || null]
    );
    await client.query('COMMIT');
    res.status(201).json({ quoteApproval: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function decideQuoteApproval(req, res, next) {
  const client = await pool.connect();
  try {
    const id = toInt(req.params.id, 'approval id');
    const { status, decisionNote = '' } = req.body || {};
    const normalized = String(status || '').toUpperCase();
    if (!['APPROVED', 'REJECTED', 'CANCELLED'].includes(normalized)) throw new ApiError(400, 'Invalid status');
    await client.query('BEGIN');
    await client.query(
      `UPDATE crm_quote_approvals
       SET status = $1, decision_note = $2, decided_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [normalized, decisionNote || null, id]
    );
    const { rows } = await client.query('SELECT * FROM crm_quote_approvals WHERE id = $1', [id]);
    await client.query('COMMIT');
    res.json({ quoteApproval: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  listObjectManager,
  createCustomObject,
  createCustomField,
  createRecordType,
  createPageLayout,
  listSecurityModel,
  createRoleNode,
  upsertOrgWideDefault,
  createSharingRule,
  listCpqDesigner,
  createBundle,
  addBundleItem,
  createPricingRule,
  createDiscountSchedule,
  requestQuoteApproval,
  decideQuoteApproval,
};
