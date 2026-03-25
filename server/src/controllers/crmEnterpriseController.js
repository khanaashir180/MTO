const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

function toInt(v, field) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Invalid ${field}`);
  return n;
}

async function listContacts(req, res, next) {
  try {
    const { search = '', accountId = '' } = req.query;
    const values = [];
    const filters = [];
    if (search) {
      values.push(`%${String(search).trim()}%`);
      filters.push(`(c.first_name ILIKE $${values.length} OR COALESCE(c.last_name,'') ILIKE $${values.length} OR COALESCE(c.email,'') ILIKE $${values.length} OR COALESCE(c.phone,'') ILIKE $${values.length})`);
    }
    if (accountId) {
      values.push(toInt(accountId, 'accountId'));
      filters.push(`c.account_id = $${values.length}`);
    }
    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT
         c.id, c.account_id, c.first_name, c.last_name, c.email, c.phone, c.alternate_email, c.alternate_phone,
         c.title, c.department, c.is_primary, c.status, c.notes, c.updated_at,
         c.preferred_channel, c.decision_role, c.influence_level, c.relationship_strength,
         c.reports_to_contact_id, c.verification_status, c.do_not_contact, c.whatsapp_opt_in,
         a.customer_name, a.customer_number, u.full_name AS owner_name,
         CONCAT(manager.first_name, ' ', COALESCE(manager.last_name, '')) AS reports_to_name
       FROM crm_contacts c
       JOIN customer_accounts a ON a.id = c.account_id
       LEFT JOIN users u ON u.id = c.owner_id
       LEFT JOIN crm_contacts manager ON manager.id = c.reports_to_contact_id
       ${whereClause}
       ORDER BY c.updated_at DESC, c.id DESC
       LIMIT 500`,
      values
    );
    res.json({ contacts: rows });
  } catch (error) {
    next(error);
  }
}

async function createContact(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      accountId,
      firstName,
      lastName = '',
      email = '',
      phone = '',
      title = '',
      department = '',
      isPrimary = false,
      ownerId = null,
      status = 'ACTIVE',
      notes = '',
      alternateEmail = '',
      alternatePhone = '',
      preferredChannel = 'PHONE',
      decisionRole = '',
      influenceLevel = 'MEDIUM',
      relationshipStrength = 'WARM',
      reportsToContactId = null,
      verificationStatus = 'UNVERIFIED',
      doNotContact = false,
      whatsappOptIn = false,
    } = req.body || {};
    if (!String(firstName || '').trim()) throw new ApiError(400, 'firstName is required');
    const parsedAccountId = toInt(accountId, 'accountId');
    const resolvedOwnerId = ownerId ? toInt(ownerId, 'ownerId') : req.user.id;

    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_contacts
       (account_id, first_name, last_name, email, phone, title, department, is_primary, owner_id, status, notes,
        alternate_email, alternate_phone, preferred_channel, decision_role, influence_level, relationship_strength,
        reports_to_contact_id, verification_status, do_not_contact, whatsapp_opt_in,
        created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW())
       RETURNING id`,
      [
        parsedAccountId,
        String(firstName).trim(),
        lastName || null,
        email || null,
        phone || null,
        title || null,
        department || null,
        Boolean(isPrimary),
        resolvedOwnerId,
        String(status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
        notes || null,
        alternateEmail || null,
        alternatePhone || null,
        String(preferredChannel || 'PHONE').toUpperCase(),
        decisionRole || null,
        String(influenceLevel || 'MEDIUM').toUpperCase(),
        String(relationshipStrength || 'WARM').toUpperCase(),
        reportsToContactId ? toInt(reportsToContactId, 'reportsToContactId') : null,
        String(verificationStatus || 'UNVERIFIED').toUpperCase(),
        Boolean(doNotContact),
        Boolean(whatsappOptIn),
        req.user.id,
      ]
    );
    const { rows } = await client.query(
      `SELECT c.*, a.customer_name, a.customer_number
       FROM crm_contacts c
       JOIN customer_accounts a ON a.id = c.account_id
       WHERE c.id = $1`,
      [inserted.rows[0].id]
    );
    await client.query('COMMIT');
    res.status(201).json({ contact: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listCampaigns(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.type, c.status, c.start_date, c.end_date, c.budget, c.expected_revenue, c.updated_at, u.full_name AS owner_name
       FROM crm_campaigns c
       LEFT JOIN users u ON u.id = c.owner_id
       ORDER BY c.updated_at DESC, c.id DESC
       LIMIT 300`
    );
    res.json({ campaigns: rows });
  } catch (error) {
    next(error);
  }
}

async function createCampaign(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      name,
      type = 'GENERAL',
      status = 'PLANNED',
      startDate = null,
      endDate = null,
      budget = 0,
      expectedRevenue = 0,
      description = '',
      ownerId = null,
    } = req.body || {};
    if (!String(name || '').trim()) throw new ApiError(400, 'name is required');
    const resolvedOwnerId = ownerId ? toInt(ownerId, 'ownerId') : req.user.id;
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_campaigns
       (name, type, status, start_date, end_date, budget, expected_revenue, description, owner_id, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING id`,
      [
        String(name).trim(),
        String(type || 'GENERAL').toUpperCase(),
        String(status || 'PLANNED').toUpperCase(),
        startDate || null,
        endDate || null,
        Number(budget || 0),
        Number(expectedRevenue || 0),
        description || null,
        resolvedOwnerId,
        req.user.id,
      ]
    );
    const { rows } = await client.query('SELECT * FROM crm_campaigns WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ campaign: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function addCampaignMember(req, res, next) {
  const client = await pool.connect();
  try {
    const campaignId = toInt(req.params.id, 'campaign id');
    const { accountId = null, contactId = null, memberStatus = 'TARGET', source = '' } = req.body || {};
    if (!accountId && !contactId) throw new ApiError(400, 'accountId or contactId is required');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_campaign_members
       (campaign_id, account_id, contact_id, member_status, source, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id`,
      [
        campaignId,
        accountId ? toInt(accountId, 'accountId') : null,
        contactId ? toInt(contactId, 'contactId') : null,
        String(memberStatus || 'TARGET').toUpperCase(),
        source || null,
      ]
    );
    const { rows } = await client.query('SELECT * FROM crm_campaign_members WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ member: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listCampaignMembers(req, res, next) {
  try {
    const campaignId = toInt(req.params.id, 'campaign id');
    const { rows } = await pool.query(
      `SELECT
         m.id, m.campaign_id, m.account_id, m.contact_id, m.member_status, m.source, m.updated_at,
         a.customer_name, a.customer_number,
         c.first_name, c.last_name, c.email
       FROM crm_campaign_members m
       LEFT JOIN customer_accounts a ON a.id = m.account_id
       LEFT JOIN crm_contacts c ON c.id = m.contact_id
       WHERE m.campaign_id = $1
       ORDER BY m.updated_at DESC, m.id DESC`,
      [campaignId]
    );
    res.json({ members: rows });
  } catch (error) {
    next(error);
  }
}

async function listProducts(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, sku, name, family, is_active, unit_price, cost_price, updated_at
       FROM crm_products
       ORDER BY updated_at DESC, id DESC
       LIMIT 500`
    );
    res.json({ products: rows });
  } catch (error) {
    next(error);
  }
}

async function createProduct(req, res, next) {
  const client = await pool.connect();
  try {
    const { sku, name, family = '', unitPrice = 0, costPrice = 0, isActive = true, description = '' } = req.body || {};
    if (!String(sku || '').trim()) throw new ApiError(400, 'sku is required');
    if (!String(name || '').trim()) throw new ApiError(400, 'name is required');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_products
       (sku, name, family, is_active, unit_price, cost_price, description, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING id`,
      [String(sku).trim(), String(name).trim(), family || null, Boolean(isActive), Number(unitPrice || 0), Number(costPrice || 0), description || null, req.user.id]
    );
    const { rows } = await client.query('SELECT * FROM crm_products WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ product: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listPriceBooks(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, currency_code, is_standard, is_active, updated_at
       FROM crm_price_books
       ORDER BY is_standard DESC, updated_at DESC, id DESC`
    );
    res.json({ priceBooks: rows });
  } catch (error) {
    next(error);
  }
}

async function createPriceBook(req, res, next) {
  const client = await pool.connect();
  try {
    const { name, currencyCode = 'USD', isStandard = false, isActive = true } = req.body || {};
    if (!String(name || '').trim()) throw new ApiError(400, 'name is required');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_price_books
       (name, currency_code, is_standard, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING id`,
      [String(name).trim(), String(currencyCode || 'USD').toUpperCase(), Boolean(isStandard), Boolean(isActive), req.user.id]
    );
    const { rows } = await client.query('SELECT * FROM crm_price_books WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ priceBook: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function addPriceBookItem(req, res, next) {
  const client = await pool.connect();
  try {
    const priceBookId = toInt(req.params.id, 'price book id');
    const { productId, listPrice = 0, isActive = true } = req.body || {};
    const parsedProductId = toInt(productId, 'productId');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_price_book_items
       (price_book_id, product_id, list_price, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT (price_book_id, product_id)
       DO UPDATE SET list_price = EXCLUDED.list_price, is_active = EXCLUDED.is_active, updated_at = NOW()
       RETURNING id`,
      [priceBookId, parsedProductId, Number(listPrice || 0), Boolean(isActive)]
    );
    const { rows } = await client.query('SELECT * FROM crm_price_book_items WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ item: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listQuotes(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
         q.id, q.account_id, q.opportunity_id, q.price_book_id, q.quote_number, q.status, q.valid_until, q.subtotal, q.tax_total, q.grand_total, q.updated_at,
         a.customer_name, a.customer_number, pb.name AS price_book_name
       FROM crm_quotes q
       JOIN customer_accounts a ON a.id = q.account_id
       LEFT JOIN crm_price_books pb ON pb.id = q.price_book_id
       ORDER BY q.updated_at DESC, q.id DESC
       LIMIT 500`
    );
    res.json({ quotes: rows });
  } catch (error) {
    next(error);
  }
}

async function createQuote(req, res, next) {
  const client = await pool.connect();
  try {
    const { accountId, opportunityId = null, priceBookId = null, validUntil = null, notes = '', ownerId = null } = req.body || {};
    const parsedAccountId = toInt(accountId, 'accountId');
    const quoteNumber = `Q-${Date.now()}`;
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_quotes
       (account_id, opportunity_id, price_book_id, quote_number, status, valid_until, notes, owner_id, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'DRAFT', $5, $6, $7, $8, NOW(), NOW())
       RETURNING id`,
      [
        parsedAccountId,
        opportunityId ? toInt(opportunityId, 'opportunityId') : null,
        priceBookId ? toInt(priceBookId, 'priceBookId') : null,
        quoteNumber,
        validUntil || null,
        notes || null,
        ownerId ? toInt(ownerId, 'ownerId') : req.user.id,
        req.user.id,
      ]
    );
    const { rows } = await client.query('SELECT * FROM crm_quotes WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ quote: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function addQuoteLine(req, res, next) {
  const client = await pool.connect();
  try {
    const quoteId = toInt(req.params.id, 'quote id');
    const { productId = null, lineName = '', quantity = 1, unitPrice = 0, discountPercent = 0 } = req.body || {};
    if (!String(lineName || '').trim()) throw new ApiError(400, 'lineName is required');
    const qty = Number(quantity || 0);
    const price = Number(unitPrice || 0);
    const discount = Number(discountPercent || 0);
    if (!Number.isFinite(qty) || qty <= 0) throw new ApiError(400, 'quantity must be > 0');
    if (!Number.isFinite(price) || price < 0) throw new ApiError(400, 'unitPrice must be >= 0');
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) throw new ApiError(400, 'discountPercent must be between 0 and 100');
    const lineTotal = Number((qty * price * (1 - (discount / 100))).toFixed(2));

    await client.query('BEGIN');
    await client.query(
      `INSERT INTO crm_quote_lines
       (quote_id, product_id, line_name, quantity, unit_price, discount_percent, line_total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
      [quoteId, productId ? toInt(productId, 'productId') : null, String(lineName).trim(), qty, price, discount, lineTotal]
    );

    await client.query(
      `UPDATE crm_quotes
       SET subtotal = COALESCE((SELECT COALESCE(SUM(line_total),0) FROM crm_quote_lines WHERE quote_id = $1), 0),
           tax_total = 0,
           grand_total = COALESCE((SELECT COALESCE(SUM(line_total),0) FROM crm_quote_lines WHERE quote_id = $1), 0),
           updated_at = NOW()
       WHERE id = $1`,
      [quoteId]
    );
    const { rows } = await client.query(
      `SELECT q.*, COALESCE(json_agg(l.* ORDER BY l.id DESC) FILTER (WHERE l.id IS NOT NULL), '[]'::json) AS lines
       FROM crm_quotes q
       LEFT JOIN crm_quote_lines l ON l.quote_id = q.id
       WHERE q.id = $1
       GROUP BY q.id`,
      [quoteId]
    );
    await client.query('COMMIT');
    res.status(201).json({ quote: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateQuoteStatus(req, res, next) {
  const client = await pool.connect();
  try {
    const quoteId = toInt(req.params.id, 'quote id');
    const status = String(req.body?.status || '').toUpperCase();
    if (!['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED'].includes(status)) throw new ApiError(400, 'Invalid quote status');
    await client.query('BEGIN');
    await client.query(
      `UPDATE crm_quotes
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [status, quoteId]
    );
    const { rows } = await client.query('SELECT * FROM crm_quotes WHERE id = $1', [quoteId]);
    await client.query('COMMIT');
    res.json({ quote: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listAssignmentRules(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, entity_type, criteria_json, action_json, is_active, updated_at
       FROM crm_assignment_rules
       ORDER BY updated_at DESC, id DESC`
    );
    res.json({ rules: rows });
  } catch (error) {
    next(error);
  }
}

async function createAssignmentRule(req, res, next) {
  const client = await pool.connect();
  try {
    const { name, entityType, criteria = {}, action = {}, isActive = true } = req.body || {};
    if (!String(name || '').trim()) throw new ApiError(400, 'name is required');
    const entity = String(entityType || '').toUpperCase();
    if (!['LEAD', 'CASE', 'TASK', 'OPPORTUNITY'].includes(entity)) throw new ApiError(400, 'Invalid entityType');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_assignment_rules
       (name, entity_type, criteria_json, action_json, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, NOW(), NOW())
       RETURNING id`,
      [String(name).trim(), entity, JSON.stringify(criteria || {}), JSON.stringify(action || {}), Boolean(isActive), req.user.id]
    );
    const { rows } = await client.query('SELECT * FROM crm_assignment_rules WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ rule: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listSlaPolicies(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, entity_type, priority, first_response_minutes, resolution_minutes, is_active, updated_at
       FROM crm_sla_policies
       ORDER BY updated_at DESC, id DESC`
    );
    res.json({ policies: rows });
  } catch (error) {
    next(error);
  }
}

async function createSlaPolicy(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      name,
      entityType,
      priority = null,
      firstResponseMinutes = 60,
      resolutionMinutes = 1440,
      isActive = true,
    } = req.body || {};
    if (!String(name || '').trim()) throw new ApiError(400, 'name is required');
    const entity = String(entityType || '').toUpperCase();
    if (!['CASE', 'TASK'].includes(entity)) throw new ApiError(400, 'Invalid entityType');
    await client.query('BEGIN');
    const inserted = await client.query(
      `INSERT INTO crm_sla_policies
       (name, entity_type, priority, first_response_minutes, resolution_minutes, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING id`,
      [
        String(name).trim(),
        entity,
        priority ? String(priority).toUpperCase() : null,
        Number(firstResponseMinutes || 60),
        Number(resolutionMinutes || 1440),
        Boolean(isActive),
        req.user.id,
      ]
    );
    const { rows } = await client.query('SELECT * FROM crm_sla_policies WHERE id = $1', [inserted.rows[0].id]);
    await client.query('COMMIT');
    res.status(201).json({ policy: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  listContacts,
  createContact,
  listCampaigns,
  createCampaign,
  addCampaignMember,
  listCampaignMembers,
  listProducts,
  createProduct,
  listPriceBooks,
  createPriceBook,
  addPriceBookItem,
  listQuotes,
  createQuote,
  addQuoteLine,
  updateQuoteStatus,
  listAssignmentRules,
  createAssignmentRule,
  listSlaPolicies,
  createSlaPolicy,
};
