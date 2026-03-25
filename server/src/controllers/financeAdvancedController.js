const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

function toInt(v, field) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Invalid ${field}`);
  return n;
}

async function assertOpenPeriod(client, dateValue, fieldName) {
  if (!dateValue) return;
  const { rows } = await client.query(
    `SELECT id
     FROM finance_close_books_periods
     WHERE period_month = date_trunc('month', $1::date)::date
       AND status = 'CLOSED'
     LIMIT 1`,
    [dateValue]
  );
  if (rows[0]) throw new ApiError(409, `${fieldName} falls in a closed accounting period`);
}

async function listChartAccounts(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, code, name, account_type, detail_type, parent_account_id, is_active, updated_at
       FROM finance_chart_of_accounts
       ORDER BY code ASC, id ASC`
    );
    res.json({ accounts: rows });
  } catch (error) {
    next(error);
  }
}

async function createChartAccount(req, res, next) {
  const client = await pool.connect();
  try {
    const { code, name, accountType, detailType = 'OTHER', parentAccountId = null, isActive = true } = req.body || {};
    if (!String(code || '').trim()) throw new ApiError(400, 'code is required');
    if (!String(name || '').trim()) throw new ApiError(400, 'name is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_chart_of_accounts
       (code, name, account_type, detail_type, parent_account_id, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       RETURNING *`,
      [
        String(code).trim(),
        String(name).trim(),
        String(accountType || '').toUpperCase(),
        String(detailType || 'OTHER').toUpperCase(),
        parentAccountId ? toInt(parentAccountId, 'parentAccountId') : null,
        Boolean(isActive),
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ account: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listVendors(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, vendor_name, email, phone, tax_number, payment_terms, address, is_active, updated_at
       FROM finance_vendors
       ORDER BY updated_at DESC, id DESC`
    );
    res.json({ vendors: rows });
  } catch (error) {
    next(error);
  }
}

async function createVendor(req, res, next) {
  const client = await pool.connect();
  try {
    const { vendorName, email = '', phone = '', taxNumber = '', paymentTerms = '', address = '', isActive = true } = req.body || {};
    if (!String(vendorName || '').trim()) throw new ApiError(400, 'vendorName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_vendors
       (vendor_name, email, phone, tax_number, payment_terms, address, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING *`,
      [String(vendorName).trim(), email || null, phone || null, taxNumber || null, paymentTerms || null, address || null, Boolean(isActive), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ vendor: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listTaxRates(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, tax_name, rate_percent, tax_scope, is_active, updated_at
       FROM finance_tax_rates
       ORDER BY rate_percent ASC, id ASC`
    );
    res.json({ taxRates: rows });
  } catch (error) {
    next(error);
  }
}

async function createTaxRate(req, res, next) {
  const client = await pool.connect();
  try {
    const { taxName, ratePercent = 0, taxScope = 'BOTH', isActive = true } = req.body || {};
    if (!String(taxName || '').trim()) throw new ApiError(400, 'taxName is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO finance_tax_rates (tax_name, rate_percent, tax_scope, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [String(taxName).trim(), Number(ratePercent || 0), String(taxScope || 'BOTH').toUpperCase(), Boolean(isActive), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ taxRate: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listInvoices(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, a.customer_name, a.customer_number
       FROM finance_invoices i
       JOIN customer_accounts a ON a.id = i.account_id
       ORDER BY i.updated_at DESC, i.id DESC`
    );
    res.json({ invoices: rows });
  } catch (error) {
    next(error);
  }
}

async function createInvoice(req, res, next) {
  const client = await pool.connect();
  try {
    const { accountId, issueDate = null, dueDate = null, notes = '' } = req.body || {};
    const invoiceNumber = `INV-${Date.now()}`;
    await client.query('BEGIN');
    await assertOpenPeriod(client, issueDate || new Date().toISOString().slice(0, 10), 'issueDate');
    const { rows } = await client.query(
      `INSERT INTO finance_invoices
       (invoice_number, account_id, issue_date, due_date, status, subtotal, tax_total, total, notes, created_by, created_at, updated_at)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, 'DRAFT', 0, 0, 0, $5, $6, NOW(), NOW())
       RETURNING *`,
      [invoiceNumber, toInt(accountId, 'accountId'), issueDate, dueDate, notes || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ invoice: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function addInvoiceLine(req, res, next) {
  const client = await pool.connect();
  try {
    const invoiceId = toInt(req.params.id, 'invoice id');
    const { description, qty = 1, unitPrice = 0, taxRateId = null } = req.body || {};
    if (!String(description || '').trim()) throw new ApiError(400, 'description is required');
    const q = Number(qty || 0);
    const p = Number(unitPrice || 0);
    if (!(q > 0)) throw new ApiError(400, 'qty must be > 0');
    if (p < 0) throw new ApiError(400, 'unitPrice must be >= 0');
    await client.query('BEGIN');
    let taxRate = 0;
    if (taxRateId) {
      const tr = await client.query(`SELECT rate_percent FROM finance_tax_rates WHERE id = $1`, [toInt(taxRateId, 'taxRateId')]);
      taxRate = Number(tr.rows[0]?.rate_percent || 0);
    }
    const base = Number((q * p).toFixed(2));
    const lineTotal = Number((base + (base * taxRate / 100)).toFixed(2));
    await client.query(
      `INSERT INTO finance_invoice_lines
       (invoice_id, description, qty, unit_price, tax_rate_id, line_total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [invoiceId, String(description).trim(), q, p, taxRateId ? toInt(taxRateId, 'taxRateId') : null, lineTotal]
    );
    await client.query(
      `UPDATE finance_invoices i
       SET subtotal = s.subtotal, tax_total = s.tax_total, total = s.total, updated_at = NOW()
       FROM (
         SELECT
           COALESCE(SUM(l.qty * l.unit_price), 0)::numeric(12,2) AS subtotal,
           COALESCE(SUM(l.line_total - (l.qty * l.unit_price)), 0)::numeric(12,2) AS tax_total,
           COALESCE(SUM(l.line_total), 0)::numeric(12,2) AS total
         FROM finance_invoice_lines l
         WHERE l.invoice_id = $1
       ) s
       WHERE i.id = $1`,
      [invoiceId]
    );
    const { rows } = await client.query(`SELECT * FROM finance_invoices WHERE id = $1`, [invoiceId]);
    await client.query('COMMIT');
    res.status(201).json({ invoice: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateInvoiceStatus(req, res, next) {
  const client = await pool.connect();
  try {
    const invoiceId = toInt(req.params.id, 'invoice id');
    const status = String(req.body?.status || '').toUpperCase();
    if (!['DRAFT', 'SENT', 'PARTIAL', 'PAID', 'VOID'].includes(status)) throw new ApiError(400, 'Invalid invoice status');
    await client.query('BEGIN');
    await client.query(`UPDATE finance_invoices SET status = $1, updated_at = NOW() WHERE id = $2`, [status, invoiceId]);
    const { rows } = await client.query(`SELECT * FROM finance_invoices WHERE id = $1`, [invoiceId]);
    await client.query('COMMIT');
    res.json({ invoice: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listBills(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, v.vendor_name
       FROM finance_bills b
       JOIN finance_vendors v ON v.id = b.vendor_id
       ORDER BY b.updated_at DESC, b.id DESC`
    );
    res.json({ bills: rows });
  } catch (error) {
    next(error);
  }
}

async function createBill(req, res, next) {
  const client = await pool.connect();
  try {
    const { vendorId, billDate = null, dueDate = null, notes = '' } = req.body || {};
    const billNumber = `BILL-${Date.now()}`;
    await client.query('BEGIN');
    await assertOpenPeriod(client, billDate || new Date().toISOString().slice(0, 10), 'billDate');
    const { rows } = await client.query(
      `INSERT INTO finance_bills
       (bill_number, vendor_id, bill_date, due_date, status, subtotal, tax_total, total, notes, created_by, created_at, updated_at)
       VALUES ($1, $2, COALESCE($3, CURRENT_DATE), $4, 'OPEN', 0, 0, 0, $5, $6, NOW(), NOW())
       RETURNING *`,
      [billNumber, toInt(vendorId, 'vendorId'), billDate, dueDate, notes || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ bill: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function addBillLine(req, res, next) {
  const client = await pool.connect();
  try {
    const billId = toInt(req.params.id, 'bill id');
    const { description, qty = 1, unitCost = 0, taxRateId = null } = req.body || {};
    if (!String(description || '').trim()) throw new ApiError(400, 'description is required');
    const q = Number(qty || 0);
    const c = Number(unitCost || 0);
    if (!(q > 0)) throw new ApiError(400, 'qty must be > 0');
    if (c < 0) throw new ApiError(400, 'unitCost must be >= 0');
    await client.query('BEGIN');
    let taxRate = 0;
    if (taxRateId) {
      const tr = await client.query(`SELECT rate_percent FROM finance_tax_rates WHERE id = $1`, [toInt(taxRateId, 'taxRateId')]);
      taxRate = Number(tr.rows[0]?.rate_percent || 0);
    }
    const base = Number((q * c).toFixed(2));
    const lineTotal = Number((base + (base * taxRate / 100)).toFixed(2));
    await client.query(
      `INSERT INTO finance_bill_lines
       (bill_id, description, qty, unit_cost, tax_rate_id, line_total, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      [billId, String(description).trim(), q, c, taxRateId ? toInt(taxRateId, 'taxRateId') : null, lineTotal]
    );
    await client.query(
      `UPDATE finance_bills b
       SET subtotal = s.subtotal, tax_total = s.tax_total, total = s.total, updated_at = NOW()
       FROM (
         SELECT
           COALESCE(SUM(l.qty * l.unit_cost), 0)::numeric(12,2) AS subtotal,
           COALESCE(SUM(l.line_total - (l.qty * l.unit_cost)), 0)::numeric(12,2) AS tax_total,
           COALESCE(SUM(l.line_total), 0)::numeric(12,2) AS total
         FROM finance_bill_lines l
         WHERE l.bill_id = $1
       ) s
       WHERE b.id = $1`,
      [billId]
    );
    const { rows } = await client.query(`SELECT * FROM finance_bills WHERE id = $1`, [billId]);
    await client.query('COMMIT');
    res.status(201).json({ bill: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function updateBillStatus(req, res, next) {
  const client = await pool.connect();
  try {
    const billId = toInt(req.params.id, 'bill id');
    const status = String(req.body?.status || '').toUpperCase();
    if (!['OPEN', 'PARTIAL', 'PAID', 'VOID'].includes(status)) throw new ApiError(400, 'Invalid bill status');
    await client.query('BEGIN');
    await client.query(`UPDATE finance_bills SET status = $1, updated_at = NOW() WHERE id = $2`, [status, billId]);
    const { rows } = await client.query(`SELECT * FROM finance_bills WHERE id = $1`, [billId]);
    await client.query('COMMIT');
    res.json({ bill: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listBankTransactions(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, p.name AS payment_account_name
       FROM finance_bank_transactions t
       JOIN payment_accounts p ON p.id = t.payment_account_id
       ORDER BY t.tx_date DESC, t.id DESC`
    );
    res.json({ transactions: rows });
  } catch (error) {
    next(error);
  }
}

async function createBankTransaction(req, res, next) {
  const client = await pool.connect();
  try {
    const { paymentAccountId, txDate = null, txType = 'MONEY_IN', amount = 0, referenceNo = '', payeeName = '', memo = '' } = req.body || {};
    await client.query('BEGIN');
    await assertOpenPeriod(client, txDate || new Date().toISOString().slice(0, 10), 'txDate');
    const { rows } = await client.query(
      `INSERT INTO finance_bank_transactions
       (payment_account_id, tx_date, tx_type, amount, reference_no, payee_name, memo, match_type, created_by, created_at, updated_at)
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6, $7, 'UNMATCHED', $8, NOW(), NOW())
       RETURNING *`,
      [
        toInt(paymentAccountId, 'paymentAccountId'),
        txDate,
        String(txType || 'MONEY_IN').toUpperCase(),
        Number(amount || 0),
        referenceNo || null,
        payeeName || null,
        memo || null,
        req.user.id,
      ]
    );
    await client.query('COMMIT');
    res.status(201).json({ transaction: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listReconciliations(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.*, p.name AS payment_account_name
       FROM finance_reconciliations r
       JOIN payment_accounts p ON p.id = r.payment_account_id
       ORDER BY r.statement_ending_date DESC, r.id DESC`
    );
    res.json({ reconciliations: rows });
  } catch (error) {
    next(error);
  }
}

async function createReconciliation(req, res, next) {
  const client = await pool.connect();
  try {
    const { paymentAccountId, statementEndingDate, statementEndingBalance } = req.body || {};
    if (!statementEndingDate) throw new ApiError(400, 'statementEndingDate is required');
    const accountId = toInt(paymentAccountId, 'paymentAccountId');
    const statementBalance = Number(statementEndingBalance || 0);
    await client.query('BEGIN');
    const balRes = await client.query(
      `SELECT
         COALESCE(SUM(CASE WHEN tx_type = 'MONEY_IN' THEN amount WHEN tx_type = 'TRANSFER' THEN amount ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN tx_type = 'MONEY_OUT' THEN amount ELSE 0 END), 0) AS system_balance
       FROM finance_bank_transactions
       WHERE payment_account_id = $1
         AND tx_date <= $2`,
      [accountId, statementEndingDate]
    );
    const systemBalance = Number(balRes.rows[0]?.system_balance || 0);
    const difference = Number((statementBalance - systemBalance).toFixed(2));
    const { rows } = await client.query(
      `INSERT INTO finance_reconciliations
       (payment_account_id, statement_ending_date, statement_ending_balance, system_balance, difference, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'OPEN', $6, NOW(), NOW())
       RETURNING *`,
      [accountId, statementEndingDate, statementBalance, systemBalance, difference, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ reconciliation: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function closeReconciliation(req, res, next) {
  const client = await pool.connect();
  try {
    const id = toInt(req.params.id, 'reconciliation id');
    await client.query('BEGIN');
    await client.query(
      `UPDATE finance_reconciliations
       SET status = 'CLOSED', closed_by = $1, closed_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [req.user.id, id]
    );
    const { rows } = await client.query(`SELECT * FROM finance_reconciliations WHERE id = $1`, [id]);
    await client.query('COMMIT');
    res.json({ reconciliation: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function getAccountingOverview(_req, res, next) {
  try {
    const [invoiceRes, billRes, arRes, apRes, recRes] = await Promise.all([
      pool.query(`SELECT COALESCE(SUM(total),0)::numeric(12,2) AS total_invoiced, COALESCE(SUM(CASE WHEN status IN ('SENT','PARTIAL') THEN total ELSE 0 END),0)::numeric(12,2) AS open_invoices FROM finance_invoices`),
      pool.query(`SELECT COALESCE(SUM(total),0)::numeric(12,2) AS total_billed, COALESCE(SUM(CASE WHEN status IN ('OPEN','PARTIAL') THEN total ELSE 0 END),0)::numeric(12,2) AS open_bills FROM finance_bills`),
      pool.query(`SELECT COALESCE(SUM(CASE WHEN entry_type='DEBIT' THEN amount ELSE 0 END),0)-COALESCE(SUM(CASE WHEN entry_type='CREDIT' THEN amount ELSE 0 END),0) AS ar_balance FROM customer_ledger_entries`),
      pool.query(`SELECT COALESCE(SUM(total),0) AS ap_balance FROM finance_bills WHERE status IN ('OPEN','PARTIAL')`),
      pool.query(`SELECT COUNT(*) FILTER (WHERE status='OPEN') AS open_reconciliations, COUNT(*) FILTER (WHERE status='CLOSED') AS closed_reconciliations FROM finance_reconciliations`),
    ]);
    res.json({
      kpis: {
        totalInvoiced: Number(invoiceRes.rows[0]?.total_invoiced || 0),
        openInvoices: Number(invoiceRes.rows[0]?.open_invoices || 0),
        totalBilled: Number(billRes.rows[0]?.total_billed || 0),
        openBills: Number(billRes.rows[0]?.open_bills || 0),
        arBalance: Number(arRes.rows[0]?.ar_balance || 0),
        apBalance: Number(apRes.rows[0]?.ap_balance || 0),
        openReconciliations: Number(recRes.rows[0]?.open_reconciliations || 0),
        closedReconciliations: Number(recRes.rows[0]?.closed_reconciliations || 0),
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listChartAccounts,
  createChartAccount,
  listVendors,
  createVendor,
  listTaxRates,
  createTaxRate,
  listInvoices,
  createInvoice,
  addInvoiceLine,
  updateInvoiceStatus,
  listBills,
  createBill,
  addBillLine,
  updateBillStatus,
  listBankTransactions,
  createBankTransaction,
  listReconciliations,
  createReconciliation,
  closeReconciliation,
  getAccountingOverview,
};
