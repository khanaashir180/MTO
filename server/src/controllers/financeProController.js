const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

function toInt(v, field) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Invalid ${field}`);
  return n;
}

function monthKey(dateValue) {
  return String(dateValue || '').slice(0, 7);
}

async function getFinancialReports(req, res, next) {
  try {
    const from = req.query?.from || null;
    const to = req.query?.to || null;
    const values = [];
    const invFilters = [];
    const billFilters = [];
    const ledFilters = [];

    if (from) {
      values.push(from);
      invFilters.push(`i.issue_date >= $${values.length}`);
      billFilters.push(`b.bill_date >= $${values.length}`);
      ledFilters.push(`le.entry_date >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      invFilters.push(`i.issue_date <= $${values.length}`);
      billFilters.push(`b.bill_date <= $${values.length}`);
      ledFilters.push(`le.entry_date <= $${values.length}`);
    }
    const invWhere = invFilters.length ? `WHERE ${invFilters.join(' AND ')}` : '';
    const billWhere = billFilters.length ? `WHERE ${billFilters.join(' AND ')}` : '';
    const ledWhere = ledFilters.length ? `WHERE ${ledFilters.join(' AND ')}` : '';

    const [invoiceRes, billRes, ledgerRes] = await Promise.all([
      pool.query(
        `SELECT id, issue_date, status, total
         FROM finance_invoices i
         ${invWhere}
         ORDER BY i.issue_date ASC, i.id ASC`,
        values
      ),
      pool.query(
        `SELECT id, bill_date, status, total
         FROM finance_bills b
         ${billWhere}
         ORDER BY b.bill_date ASC, b.id ASC`,
        values
      ),
      pool.query(
        `SELECT entry_date, entry_type, category, amount
         FROM customer_ledger_entries le
         ${ledWhere}
         ORDER BY le.entry_date ASC, le.id ASC`,
        values
      ),
    ]);

    const invoices = invoiceRes.rows || [];
    const bills = billRes.rows || [];
    const ledgerEntries = ledgerRes.rows || [];

    const revenue = invoices.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const expenses = bills.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const grossProfit = revenue - expenses;

    const monthlyMap = new Map();
    invoices.forEach((row) => {
      const key = monthKey(row.issue_date);
      const cur = monthlyMap.get(key) || { month: key, revenue: 0, expenses: 0, net: 0 };
      cur.revenue += Number(row.total || 0);
      monthlyMap.set(key, cur);
    });
    bills.forEach((row) => {
      const key = monthKey(row.bill_date);
      const cur = monthlyMap.get(key) || { month: key, revenue: 0, expenses: 0, net: 0 };
      cur.expenses += Number(row.total || 0);
      monthlyMap.set(key, cur);
    });
    const monthlyPnl = [...monthlyMap.values()].map((row) => ({
      ...row,
      net: Number((row.revenue - row.expenses).toFixed(2)),
    }));

    const arOpen = invoices
      .filter((row) => ['SENT', 'PARTIAL'].includes(String(row.status || '')))
      .reduce((sum, row) => sum + Number(row.total || 0), 0);
    const apOpen = bills
      .filter((row) => ['OPEN', 'PARTIAL'].includes(String(row.status || '')))
      .reduce((sum, row) => sum + Number(row.total || 0), 0);
    const cashBalance = ledgerEntries.reduce((sum, row) => {
      const amount = Number(row.amount || 0);
      if (row.entry_type === 'CREDIT') return sum + amount;
      return sum - amount;
    }, 0);

    const operatingCashIn = ledgerEntries
      .filter((row) => row.entry_type === 'CREDIT')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const operatingCashOut = ledgerEntries
      .filter((row) => row.entry_type === 'DEBIT')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const today = new Date();
    const arAging = {
      current: 0,
      days30: 0,
      days60: 0,
      days90plus: 0,
    };
    invoices
      .filter((row) => ['SENT', 'PARTIAL'].includes(String(row.status || '')))
      .forEach((row) => {
        const due = new Date(String(row.issue_date || today.toISOString()).slice(0, 10));
        const days = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        const amount = Number(row.total || 0);
        if (days <= 0) arAging.current += amount;
        else if (days <= 30) arAging.days30 += amount;
        else if (days <= 60) arAging.days60 += amount;
        else arAging.days90plus += amount;
      });

    const apAging = {
      current: 0,
      days30: 0,
      days60: 0,
      days90plus: 0,
    };
    bills
      .filter((row) => ['OPEN', 'PARTIAL'].includes(String(row.status || '')))
      .forEach((row) => {
        const due = new Date(String(row.bill_date || today.toISOString()).slice(0, 10));
        const days = Math.floor((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
        const amount = Number(row.total || 0);
        if (days <= 0) apAging.current += amount;
        else if (days <= 30) apAging.days30 += amount;
        else if (days <= 60) apAging.days60 += amount;
        else apAging.days90plus += amount;
      });

    res.json({
      pnl: {
        revenue: Number(revenue.toFixed(2)),
        expenses: Number(expenses.toFixed(2)),
        grossProfit: Number(grossProfit.toFixed(2)),
        monthly: monthlyPnl,
      },
      balance_sheet: {
        assets: Number((cashBalance + arOpen).toFixed(2)),
        liabilities: Number(apOpen.toFixed(2)),
        equity: Number((cashBalance + arOpen - apOpen).toFixed(2)),
        cash: Number(cashBalance.toFixed(2)),
        accountsReceivable: Number(arOpen.toFixed(2)),
        accountsPayable: Number(apOpen.toFixed(2)),
      },
      cash_flow: {
        operatingIn: Number(operatingCashIn.toFixed(2)),
        operatingOut: Number(operatingCashOut.toFixed(2)),
        netCashFlow: Number((operatingCashIn - operatingCashOut).toFixed(2)),
      },
      aging: {
        ar: Object.fromEntries(Object.entries(arAging).map(([k, v]) => [k, Number(v.toFixed(2))])),
        ap: Object.fromEntries(Object.entries(apAging).map(([k, v]) => [k, Number(v.toFixed(2))])),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function listPurchaseOrders(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT po.*, v.vendor_name
       FROM finance_purchase_orders po
       JOIN finance_vendors v ON v.id = po.vendor_id
       ORDER BY po.updated_at DESC, po.id DESC`
    );
    res.json({ purchaseOrders: rows });
  } catch (error) {
    next(error);
  }
}

async function createPurchaseOrder(req, res, next) {
  const client = await pool.connect();
  try {
    const { vendorId, poDate = null, expectedDate = null, notes = '' } = req.body || {};
    const poNumber = `PO-${Date.now()}`;
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_purchase_orders
       (po_number, vendor_id, po_date, expected_date, status, subtotal, tax_total, total, notes, created_by, created_at, updated_at)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, 'DRAFT', 0, 0, 0, $5, $6, NOW(), NOW())
       RETURNING *`,
      [poNumber, toInt(vendorId, 'vendorId'), poDate, expectedDate, notes || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ purchaseOrder: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function addPurchaseOrderLine(req, res, next) {
  const client = await pool.connect();
  try {
    const poId = toInt(req.params.id, 'purchase order id');
    const { description, qty = 1, unitCost = 0, taxRateId = null } = req.body || {};
    if (!String(description || '').trim()) throw new ApiError(400, 'description is required');
    const q = Number(qty || 0);
    const c = Number(unitCost || 0);
    if (!(q > 0)) throw new ApiError(400, 'qty must be > 0');
    if (c < 0) throw new ApiError(400, 'unitCost must be >= 0');
    await client.query('BEGIN');
    let taxRate = 0;
    if (taxRateId) {
      const tax = await client.query(`SELECT rate_percent FROM finance_tax_rates WHERE id = $1`, [toInt(taxRateId, 'taxRateId')]);
      taxRate = Number(tax.rows[0]?.rate_percent || 0);
    }
    const base = Number((q * c).toFixed(2));
    const lineTotal = Number((base + (base * taxRate / 100)).toFixed(2));
    await client.query(
      `INSERT INTO finance_purchase_order_lines
       (purchase_order_id, description, qty, unit_cost, tax_rate_id, line_total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [poId, String(description).trim(), q, c, taxRateId ? toInt(taxRateId, 'taxRateId') : null, lineTotal]
    );
    await client.query(
      `UPDATE finance_purchase_orders po
       SET subtotal = s.subtotal, tax_total = s.tax_total, total = s.total, updated_at = NOW()
       FROM (
         SELECT
           COALESCE(SUM(l.qty * l.unit_cost), 0)::numeric(12,2) AS subtotal,
           COALESCE(SUM(l.line_total - (l.qty * l.unit_cost)), 0)::numeric(12,2) AS tax_total,
           COALESCE(SUM(l.line_total), 0)::numeric(12,2) AS total
         FROM finance_purchase_order_lines l
         WHERE l.purchase_order_id = $1
       ) s
       WHERE po.id = $1`,
      [poId]
    );
    const { rows } = await client.query(`SELECT * FROM finance_purchase_orders WHERE id = $1`, [poId]);
    await client.query('COMMIT');
    res.status(201).json({ purchaseOrder: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updatePurchaseOrderStatus(req, res, next) {
  const client = await pool.connect();
  try {
    const poId = toInt(req.params.id, 'purchase order id');
    const status = String(req.body?.status || '').toUpperCase();
    if (!['DRAFT', 'APPROVED', 'ISSUED', 'RECEIVED', 'CLOSED', 'CANCELLED'].includes(status)) {
      throw new ApiError(400, 'Invalid purchase order status');
    }
    await client.query('BEGIN');
    await client.query(`UPDATE finance_purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2`, [status, poId]);
    const { rows } = await client.query(`SELECT * FROM finance_purchase_orders WHERE id = $1`, [poId]);
    await client.query('COMMIT');
    res.json({ purchaseOrder: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listRecurringTemplates(_req, res, next) {
  try {
    const [tplRes, runRes] = await Promise.all([
      pool.query(`SELECT * FROM finance_recurring_templates ORDER BY updated_at DESC, id DESC`),
      pool.query(`SELECT rr.*, rt.template_name FROM finance_recurring_runs rr JOIN finance_recurring_templates rt ON rt.id = rr.template_id ORDER BY rr.created_at DESC, rr.id DESC LIMIT 500`),
    ]);
    res.json({ templates: tplRes.rows, runs: runRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createRecurringTemplate(req, res, next) {
  const client = await pool.connect();
  try {
    const { templateName, entityType, frequency = 'MONTHLY', nextRunDate, payload = {} } = req.body || {};
    if (!String(templateName || '').trim()) throw new ApiError(400, 'templateName is required');
    if (!nextRunDate) throw new ApiError(400, 'nextRunDate is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_recurring_templates
       (template_name, entity_type, frequency, next_run_date, active, payload_json, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, TRUE, $5::jsonb, $6, NOW(), NOW())
       RETURNING *`,
      [
        String(templateName).trim(),
        String(entityType || '').toUpperCase(),
        String(frequency || 'MONTHLY').toUpperCase(),
        nextRunDate,
        JSON.stringify(payload || {}),
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ template: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

function nextRunDateByFrequency(current, frequency) {
  const d = new Date(current);
  if (frequency === 'WEEKLY') d.setDate(d.getDate() + 7);
  else if (frequency === 'QUARTERLY') d.setMonth(d.getMonth() + 3);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

async function runRecurringTemplate(req, res, next) {
  const client = await pool.connect();
  try {
    const templateId = toInt(req.params.id, 'template id');
    await client.query('BEGIN');
    const tplRes = await client.query(`SELECT * FROM finance_recurring_templates WHERE id = $1 FOR UPDATE`, [templateId]);
    const tpl = tplRes.rows[0];
    if (!tpl) throw new ApiError(404, 'Recurring template not found');
    const payload = tpl.payload_json || {};
    let generatedEntityId = null;
    if (tpl.entity_type === 'INVOICE') {
      const accountId = Number(payload.accountId || 0);
      if (!(accountId > 0)) throw new ApiError(400, 'Recurring invoice template needs payload.accountId');
      const invoiceNumber = `INV-${Date.now()}`;
      const inv = await client.query(
        `INSERT INTO finance_invoices (invoice_number, account_id, issue_date, due_date, status, subtotal, tax_total, total, notes, created_by, created_at, updated_at)
         VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'DRAFT', 0, 0, 0, $3, $4, NOW(), NOW())
         RETURNING id`,
        [invoiceNumber, accountId, payload.notes || 'Recurring invoice', req.user.id]
      );
      generatedEntityId = inv.rows[0].id;
    } else if (tpl.entity_type === 'BILL') {
      const vendorId = Number(payload.vendorId || 0);
      if (!(vendorId > 0)) throw new ApiError(400, 'Recurring bill template needs payload.vendorId');
      const billNumber = `BILL-${Date.now()}`;
      const bill = await client.query(
        `INSERT INTO finance_bills (bill_number, vendor_id, bill_date, due_date, status, subtotal, tax_total, total, notes, created_by, created_at, updated_at)
         VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'OPEN', 0, 0, 0, $3, $4, NOW(), NOW())
         RETURNING id`,
        [billNumber, vendorId, payload.notes || 'Recurring bill', req.user.id]
      );
      generatedEntityId = bill.rows[0].id;
    } else {
      generatedEntityId = null;
    }
    const nextRunDate = nextRunDateByFrequency(tpl.next_run_date, tpl.frequency);
    await client.query(
      `INSERT INTO finance_recurring_runs (template_id, entity_type, generated_entity_id, status, run_message, created_at)
       VALUES ($1, $2, $3, 'SUCCESS', $4, NOW())`,
      [templateId, tpl.entity_type, generatedEntityId, 'Recurring template executed']
    );
    await client.query(
      `UPDATE finance_recurring_templates
       SET next_run_date = $1, last_run_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [nextRunDate, templateId]
    );
    await client.query('COMMIT');
    res.status(201).json({ ok: true, generatedEntityId, entityType: tpl.entity_type });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function runBatchFinanceActions(req, res, next) {
  const client = await pool.connect();
  try {
    const { actionType, ids = [], status = null } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) throw new ApiError(400, 'ids are required');
    await client.query('BEGIN');
    let updated = 0;
    if (actionType === 'INVOICE_STATUS') {
      const allowed = ['DRAFT', 'SENT', 'PARTIAL', 'PAID', 'VOID'];
      if (!allowed.includes(String(status || '').toUpperCase())) throw new ApiError(400, 'Invalid invoice status');
      const { rowCount } = await client.query(
        `UPDATE finance_invoices
         SET status = $1, updated_at = NOW()
         WHERE id = ANY($2::int[])`,
        [String(status).toUpperCase(), ids.map((id) => toInt(id, 'invoice id'))]
      );
      updated = rowCount;
    } else if (actionType === 'BILL_STATUS') {
      const allowed = ['OPEN', 'PARTIAL', 'PAID', 'VOID'];
      if (!allowed.includes(String(status || '').toUpperCase())) throw new ApiError(400, 'Invalid bill status');
      const { rowCount } = await client.query(
        `UPDATE finance_bills
         SET status = $1, updated_at = NOW()
         WHERE id = ANY($2::int[])`,
        [String(status).toUpperCase(), ids.map((id) => toInt(id, 'bill id'))]
      );
      updated = rowCount;
    } else if (actionType === 'PO_STATUS') {
      const allowed = ['DRAFT', 'APPROVED', 'ISSUED', 'RECEIVED', 'CLOSED', 'CANCELLED'];
      if (!allowed.includes(String(status || '').toUpperCase())) throw new ApiError(400, 'Invalid purchase order status');
      const { rowCount } = await client.query(
        `UPDATE finance_purchase_orders
         SET status = $1, updated_at = NOW()
         WHERE id = ANY($2::int[])`,
        [String(status).toUpperCase(), ids.map((id) => toInt(id, 'purchase order id'))]
      );
      updated = rowCount;
    } else {
      throw new ApiError(400, 'Invalid actionType');
    }
    await client.query('COMMIT');
    res.json({ ok: true, updated });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  getFinancialReports,
  listPurchaseOrders,
  createPurchaseOrder,
  addPurchaseOrderLine,
  updatePurchaseOrderStatus,
  listRecurringTemplates,
  createRecurringTemplate,
  runRecurringTemplate,
  runBatchFinanceActions,
};
