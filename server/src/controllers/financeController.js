const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

const OUTLET_SCOPED_FINANCE_ROLES = new Set(['RETAIL', 'RETAIL_STAFF', 'SHOP_MANAGER']);

function getFinanceOutletScope(req) {
  if (OUTLET_SCOPED_FINANCE_ROLES.has(req.user?.role) && req.user?.outlet_name) {
    return String(req.user.outlet_name);
  }
  return null;
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

async function ensureAccount({
  client,
  customerName,
  customerNumber,
  customerAddress,
  outletName,
}) {
  const existing = await client.query(
    `SELECT id
     FROM customer_accounts
     WHERE LOWER(customer_number) = LOWER($1)
     LIMIT 1`,
    [customerNumber]
  );
  if (existing.rows[0]) {
    const id = existing.rows[0].id;
    await client.query(
      `UPDATE customer_accounts
       SET customer_name = $1,
           customer_address = $2,
           outlet_name = COALESCE($3, outlet_name),
           updated_at = NOW()
       WHERE id = $4`,
      [customerName, customerAddress || null, outletName || null, id]
    );
    return id;
  }

  const created = await client.query(
    `INSERT INTO customer_accounts (customer_name, customer_number, customer_address, outlet_name, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     RETURNING id`,
    [customerName, customerNumber, customerAddress || null, outletName]
  );
  return created.rows[0].id;
}

async function postOrderLedgerEntries({
  client,
  orderId,
  productionOrderNo,
  orderDate,
  customerName,
  customerNumber,
  customerAddress,
  outletName,
  productPrice,
  advancePaid,
  advancePaymentAccountId,
  advanceBreakup = null,
  createdBy,
}) {
  const accountId = await ensureAccount({
    client,
    customerName,
    customerNumber,
    customerAddress,
    outletName,
  });

  const existingOrderEntry = await client.query(
    `SELECT id
     FROM customer_ledger_entries
     WHERE reference_order_id = $1 AND category = 'ORDER'
     LIMIT 1`,
    [orderId]
  );
  if (!existingOrderEntry.rows[0]) {
    await client.query(
      `INSERT INTO customer_ledger_entries
       (account_id, entry_date, entry_type, category, amount, reference_order_id, notes, created_by, created_at)
       VALUES ($1, $2, 'DEBIT', 'ORDER', $3, $4, $5, $6, NOW())`,
      [accountId, orderDate, Number(productPrice || 0), orderId, `Order posted: ${productionOrderNo}`, createdBy]
    );
  }

  if (Number(advancePaid || 0) > 0) {
    const splits = Array.isArray(advanceBreakup) && advanceBreakup.length
      ? advanceBreakup
      : [{ amount: Number(advancePaid || 0), paymentAccountId: advancePaymentAccountId || null, label: 'Primary' }];
    for (let i = 0; i < splits.length; i += 1) {
      const split = splits[i];
      const amount = Number(split?.amount || 0);
      if (!(amount > 0)) continue;
      await client.query(
        `INSERT INTO customer_ledger_entries
         (account_id, entry_date, entry_type, category, amount, reference_order_id, payment_account_id, notes, created_by, created_at)
         VALUES ($1, $2, 'CREDIT', 'ADVANCE', $3, $4, $5, $6, $7, NOW())`,
        [
          accountId,
          orderDate,
          amount,
          orderId,
          split?.paymentAccountId || null,
          `Advance received (${split?.label || `Split ${i + 1}`}): ${productionOrderNo}`,
          createdBy,
        ]
      );
    }
  }
}

async function listAccounts(req, res, next) {
  try {
    const { search = '', outlet = '' } = req.query;
    const scopedOutlet = getFinanceOutletScope(req);
    const values = [];
    const filters = [];

    if (search) {
      values.push(`%${search}%`);
      filters.push(`(a.customer_name ILIKE $${values.length} OR a.customer_number ILIKE $${values.length})`);
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
         a.customer_address,
         a.outlet_name,
         COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)::numeric(12,2) AS total_debit,
         COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0)::numeric(12,2) AS total_credit,
         (COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0))::numeric(12,2) AS balance,
         MAX(le.entry_date) AS last_entry_date
       FROM customer_accounts a
       LEFT JOIN customer_ledger_entries le ON le.account_id = a.id
       ${whereClause}
       GROUP BY a.id
       ORDER BY a.updated_at DESC, a.id DESC`
      ,
      values
    );

    res.json({ accounts: rows, scoped_outlet: scopedOutlet || null });
  } catch (error) {
    next(error);
  }
}

async function getAccountLedger(req, res, next) {
  try {
    const accountId = Number(req.params.id);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new ApiError(400, 'Invalid account id');
    const scopedOutlet = getFinanceOutletScope(req);

    const accountResult = await pool.query(
      `SELECT id, customer_name, customer_number, customer_address, outlet_name
       FROM customer_accounts
       WHERE id = $1`,
      [accountId]
    );
    const account = accountResult.rows[0];
    if (!account) return res.status(404).json({ message: 'Account not found' });
    if (scopedOutlet) {
      const access = await pool.query(
        `SELECT 1
         FROM orders
         WHERE LOWER(customer_number) = LOWER($1)
           AND LOWER(ordered_from) = LOWER($2)
         LIMIT 1`,
        [account.customer_number, scopedOutlet]
      );
      if (!access.rows[0]) return res.status(403).json({ message: 'Forbidden for this outlet' });
    }

    const { rows: entries } = await pool.query(
      `SELECT id, entry_date, entry_type, category, amount, reference_order_id, notes, created_at,
              verification_status, verified_by, verified_at, verification_notes, bank_statement_entry_id,
              payment_account_id
       FROM customer_ledger_entries
       WHERE account_id = $1
       ORDER BY entry_date DESC, id DESC`,
      [accountId]
    );

    const { rows: orderSummaries } = await pool.query(
      `SELECT
         o.id AS order_id,
         o.production_order_no,
         o.order_date,
         o.due_date,
         o.status,
         COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)::numeric(12,2) AS total_debit,
         COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0)::numeric(12,2) AS total_credit,
         COALESCE(SUM(CASE WHEN le.category = 'ADVANCE' AND le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0)::numeric(12,2) AS advance_paid,
         COALESCE(SUM(CASE WHEN le.category = 'RECEIPT' AND le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0)::numeric(12,2) AS receipts_paid,
         COALESCE(SUM(CASE WHEN le.category = 'ADJUSTMENT' AND le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0)::numeric(12,2) AS credit_adjustments,
         COALESCE(SUM(CASE WHEN le.category = 'ADJUSTMENT' AND le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)::numeric(12,2) AS debit_adjustments,
         (COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0))::numeric(12,2) AS balance
       FROM orders o
       LEFT JOIN customer_ledger_entries le
         ON le.account_id = $1
        AND le.reference_order_id = o.id
       WHERE LOWER(o.customer_number) = LOWER($2)
       GROUP BY o.id
       ORDER BY o.order_date DESC, o.id DESC`,
      [accountId, account.customer_number]
    );

    const unallocated = entries.reduce((acc, e) => {
      if (e.reference_order_id) return acc;
      const amount = Number(e.amount || 0);
      if (e.entry_type === 'DEBIT') acc.debit += amount;
      if (e.entry_type === 'CREDIT') acc.credit += amount;
      return acc;
    }, { debit: 0, credit: 0, balance: 0 });
    unallocated.balance = unallocated.debit - unallocated.credit;

    const summary = entries.reduce((acc, e) => {
      const amount = Number(e.amount || 0);
      if (e.entry_type === 'DEBIT') acc.total_debit += amount;
      if (e.entry_type === 'CREDIT') acc.total_credit += amount;
      return acc;
    }, { total_debit: 0, total_credit: 0, balance: 0 });
    summary.balance = summary.total_debit - summary.total_credit;

    res.json({ account, summary, entries, order_summaries: orderSummaries, unallocated });
  } catch (error) {
    next(error);
  }
}

async function postLedgerEntry(req, res, next) {
  const client = await pool.connect();
  try {
    const accountId = Number(req.params.id);
    const {
      entryDate,
      entryType,
      category,
      amount,
      notes = '',
      referenceOrderId = null,
      paymentAccountId = null,
    } = req.body || {};
    if (!Number.isInteger(accountId) || accountId <= 0) throw new ApiError(400, 'Invalid account id');
    const normalizedType = String(entryType || '').toUpperCase();
    const normalizedCategory = String(category || '').toUpperCase();
    const normalizedAmount = Number(amount || 0);
    if (!['DEBIT', 'CREDIT'].includes(normalizedType)) throw new ApiError(400, 'Invalid entry type');
    if (!['RECEIPT', 'ADJUSTMENT'].includes(normalizedCategory)) throw new ApiError(400, 'Invalid category');
    if (!(normalizedAmount > 0)) throw new ApiError(400, 'Amount must be greater than zero');
    const parsedReferenceOrderId = referenceOrderId ? Number(referenceOrderId) : null;
    if (parsedReferenceOrderId && (!Number.isInteger(parsedReferenceOrderId) || parsedReferenceOrderId <= 0)) {
      throw new ApiError(400, 'Invalid referenceOrderId');
    }
    const parsedPaymentAccountId = paymentAccountId ? Number(paymentAccountId) : null;
    if (parsedPaymentAccountId && (!Number.isInteger(parsedPaymentAccountId) || parsedPaymentAccountId <= 0)) {
      throw new ApiError(400, 'Invalid paymentAccountId');
    }

    const scopedOutlet = getFinanceOutletScope(req);
    await client.query('BEGIN');
    await assertOpenPeriod(client, entryDate, 'entryDate');
    const accountResult = await client.query(
      `SELECT id, customer_number FROM customer_accounts WHERE id = $1`,
      [accountId]
    );
    const account = accountResult.rows[0];
    if (!account) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Account not found' });
    }
    if (scopedOutlet) {
      const access = await client.query(
        `SELECT 1
         FROM orders
         WHERE LOWER(customer_number) = LOWER($1)
           AND LOWER(ordered_from) = LOWER($2)
         LIMIT 1`,
        [account.customer_number, scopedOutlet]
      );
      if (!access.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(403).json({ message: 'Forbidden for this outlet' });
      }
    }
    if (['RECEIPT', 'ADVANCE'].includes(normalizedCategory) && !parsedReferenceOrderId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Linked order is required for receipt/advance entries' });
    }
    if (parsedReferenceOrderId) {
      const orderOwnership = await client.query(
        `SELECT id
         FROM orders
         WHERE id = $1
           AND LOWER(customer_number) = LOWER($2)
         LIMIT 1`,
        [parsedReferenceOrderId, account.customer_number]
      );
      if (!orderOwnership.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Selected order does not belong to this customer' });
      }
    }
    if (normalizedType === 'CREDIT' && ['RECEIPT', 'ADVANCE'].includes(normalizedCategory) && !parsedPaymentAccountId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Payment account is required for credit receipts/advances' });
    }
    if (parsedPaymentAccountId) {
      const accountExists = await client.query(
        `SELECT id FROM payment_accounts WHERE id = $1 AND is_active = true`,
        [parsedPaymentAccountId]
      );
      if (!accountExists.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: 'Selected payment account is not active' });
      }
    }

    const inserted = await client.query(
      `INSERT INTO customer_ledger_entries
       (account_id, entry_date, entry_type, category, amount, reference_order_id, payment_account_id, notes, created_by, verification_status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
               CASE WHEN $3 = 'CREDIT' AND $4 = 'RECEIPT' THEN 'PENDING' ELSE 'NOT_REQUIRED' END,
               NOW())
       RETURNING id, entry_date, entry_type, category, amount, reference_order_id, payment_account_id, notes, verification_status, created_at`,
      [
        accountId,
        entryDate || new Date().toISOString().slice(0, 10),
        normalizedType,
        normalizedCategory,
        normalizedAmount,
        parsedReferenceOrderId,
        parsedPaymentAccountId,
        notes || null,
        req.user.id,
      ]
    );

    await client.query('COMMIT');
    res.status(201).json({ entry: inserted.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listPaymentAccounts(_req, res, next) {
  try {
    const { active = '' } = _req.query;
    const values = [];
    let where = '';
    if (active === '1' || String(active).toLowerCase() === 'true') {
      where = 'WHERE is_active = true';
    }
    const { rows } = await pool.query(
      `SELECT id, name, account_type, bank_name, account_number, iban, is_active, is_default
       FROM payment_accounts
       ${where}
       ORDER BY account_type ASC, id ASC`,
      values
    );
    res.json({ accounts: rows });
  } catch (error) {
    next(error);
  }
}

async function createPaymentAccount(req, res, next) {
  try {
    const {
      name,
      accountType,
      bankName = '',
      accountNumber = '',
      iban = '',
      isDefault = false,
    } = req.body || {};
    const normalizedType = String(accountType || '').toUpperCase();
    if (!name || !String(name).trim()) throw new ApiError(400, 'Account name is required');
    if (!['CASH', 'BANK', 'COD'].includes(normalizedType)) throw new ApiError(400, 'Invalid account type');

    if (normalizedType === 'CASH') {
      const existingCash = await pool.query(
        `SELECT id FROM payment_accounts WHERE account_type = 'CASH' AND is_active = true LIMIT 1`
      );
      if (existingCash.rows[0]) {
        throw new ApiError(409, 'Cash account already exists. Deactivate existing cash account first.');
      }
    }
    if (normalizedType === 'BANK' && !String(bankName || '').trim()) {
      throw new ApiError(400, 'Bank name is required for bank accounts');
    }

    if (Boolean(isDefault)) {
      await pool.query(`UPDATE payment_accounts SET is_default = false WHERE is_default = true`);
    }

    const { rows } = await pool.query(
      `INSERT INTO payment_accounts
       (name, account_type, bank_name, account_number, ifsc_code, iban, is_active, is_default, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NULL, $5, true, $6, $7, NOW(), NOW())
       RETURNING id, name, account_type, bank_name, account_number, iban, is_active, is_default`,
      [
        String(name).trim(),
        normalizedType,
        bankName || null,
        accountNumber || null,
        iban || null,
        Boolean(isDefault),
        req.user.id,
      ]
    );
    res.status(201).json({ account: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return next(new ApiError(409, 'Payment account name already exists'));
    }
    next(error);
  }
}

async function updatePaymentAccount(req, res, next) {
  try {
    const accountId = Number(req.params.id);
    if (!Number.isInteger(accountId) || accountId <= 0) throw new ApiError(400, 'Invalid account id');
    const {
      name,
      bankName,
      accountNumber,
      iban,
      isActive,
      isDefault,
    } = req.body || {};

    const existing = await pool.query(
      `SELECT id, account_type FROM payment_accounts WHERE id = $1`,
      [accountId]
    );
    if (!existing.rows[0]) return res.status(404).json({ message: 'Payment account not found' });

    if (existing.rows[0].account_type === 'CASH' && isActive === false) {
      return res.status(400).json({ message: 'Cash account cannot be deactivated without creating another cash account' });
    }

    if (Boolean(isDefault)) {
      await pool.query(`UPDATE payment_accounts SET is_default = false WHERE is_default = true`);
    }

    const { rows } = await pool.query(
      `UPDATE payment_accounts
       SET name = COALESCE($1, name),
           bank_name = COALESCE($2, bank_name),
           account_number = COALESCE($3, account_number),
           iban = COALESCE($4, iban),
           is_active = COALESCE($5, is_active),
           is_default = COALESCE($6, is_default),
           updated_at = NOW()
       WHERE id = $7
       RETURNING id, name, account_type, bank_name, account_number, iban, is_active, is_default`,
      [
        name ?? null,
        bankName ?? null,
        accountNumber ?? null,
        iban ?? null,
        typeof isActive === 'boolean' ? isActive : null,
        typeof isDefault === 'boolean' ? isDefault : null,
        accountId,
      ]
    );
    res.json({ account: rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return next(new ApiError(409, 'Payment account name already exists'));
    }
    next(error);
  }
}

async function listBankStatementEntries(req, res, next) {
  try {
    const { status = 'UNMATCHED', search = '', from = '', to = '' } = req.query;
    const values = [];
    const filters = [];

    if (status) {
      values.push(String(status).toUpperCase());
      filters.push(`b.status = $${values.length}`);
    }
    if (from) {
      values.push(from);
      filters.push(`b.transaction_date >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      filters.push(`b.transaction_date <= $${values.length}`);
    }
    if (search) {
      values.push(`%${search}%`);
      filters.push(`(b.reference_no ILIKE $${values.length} OR b.narration ILIKE $${values.length} OR b.customer_number ILIKE $${values.length})`);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT b.id, b.transaction_date, b.amount, b.reference_no, b.narration,
              b.outlet_name, b.customer_number, b.status, b.matched_ledger_entry_id
       FROM bank_statement_entries b
       ${whereClause}
       ORDER BY b.transaction_date DESC, b.id DESC
       LIMIT 500`,
      values
    );

    res.json({ entries: rows });
  } catch (error) {
    next(error);
  }
}

async function addBankStatementEntry(req, res, next) {
  try {
    const {
      transactionDate,
      amount,
      referenceNo = '',
      narration = '',
      outletName = '',
      customerNumber = '',
      paymentAccountId = null,
    } = req.body || {};
    const parsedAmount = Number(amount || 0);
    if (!(parsedAmount > 0)) throw new ApiError(400, 'Amount must be greater than zero');
    if (!transactionDate) throw new ApiError(400, 'Transaction date is required');
    const parsedPaymentAccountId = paymentAccountId ? Number(paymentAccountId) : null;
    if (parsedPaymentAccountId && (!Number.isInteger(parsedPaymentAccountId) || parsedPaymentAccountId <= 0)) {
      throw new ApiError(400, 'Invalid payment account');
    }
    if (parsedPaymentAccountId) {
      const acc = await pool.query(
        `SELECT id FROM payment_accounts WHERE id = $1 AND account_type = 'BANK' AND is_active = true`,
        [parsedPaymentAccountId]
      );
      if (!acc.rows[0]) throw new ApiError(400, 'Selected bank account is not active');
    }

    const { rows } = await pool.query(
      `INSERT INTO bank_statement_entries
       (transaction_date, amount, reference_no, narration, outlet_name, customer_number, payment_account_id, status, imported_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'UNMATCHED', $8, NOW())
       RETURNING id, transaction_date, amount, reference_no, narration, outlet_name, customer_number, payment_account_id, status`,
      [
        transactionDate,
        parsedAmount,
        referenceNo || null,
        narration || null,
        outletName || null,
        customerNumber || null,
        parsedPaymentAccountId,
        req.user.id,
      ]
    );
    res.status(201).json({ entry: rows[0] });
  } catch (error) {
    next(error);
  }
}

async function listPendingVerifications(req, res, next) {
  try {
    const { accountId = '' } = req.query;
    const values = [];
    const filters = [
      `le.entry_type = 'CREDIT'`,
      `le.category = 'RECEIPT'`,
      `le.verification_status = 'PENDING'`,
    ];

    if (accountId) {
      values.push(Number(accountId));
      filters.push(`le.account_id = $${values.length}`);
    }

    const whereClause = `WHERE ${filters.join(' AND ')}`;
    const { rows } = await pool.query(
      `SELECT
         le.id,
         le.account_id,
         le.entry_date,
         le.amount,
         le.notes,
         le.reference_order_id,
         o.production_order_no,
         a.customer_name,
         a.customer_number,
         a.outlet_name
       FROM customer_ledger_entries le
       JOIN customer_accounts a ON a.id = le.account_id
       LEFT JOIN orders o ON o.id = le.reference_order_id
       ${whereClause}
       ORDER BY le.entry_date DESC, le.id DESC
       LIMIT 500`,
      values
    );
    res.json({ entries: rows });
  } catch (error) {
    next(error);
  }
}

async function verifyPaymentEntry(req, res, next) {
  const client = await pool.connect();
  try {
    const ledgerEntryId = Number(req.body?.ledgerEntryId);
    const bankStatementEntryId = Number(req.body?.bankStatementEntryId);
    const verificationNotes = String(req.body?.verificationNotes || '').trim();
    if (!Number.isInteger(ledgerEntryId) || ledgerEntryId <= 0) throw new ApiError(400, 'Invalid ledgerEntryId');
    if (!Number.isInteger(bankStatementEntryId) || bankStatementEntryId <= 0) throw new ApiError(400, 'Invalid bankStatementEntryId');

    await client.query('BEGIN');
    await assertOpenPeriod(client, transactionDate, 'transactionDate');
    const ledgerResult = await client.query(
      `SELECT id, amount, entry_type, category, verification_status
       FROM customer_ledger_entries
       WHERE id = $1
       FOR UPDATE`,
      [ledgerEntryId]
    );
    const ledger = ledgerResult.rows[0];
    if (!ledger) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Ledger entry not found' });
    }
    if (!(ledger.entry_type === 'CREDIT' && ledger.category === 'RECEIPT')) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Only receipt credit entries can be verified' });
    }
    if (ledger.verification_status === 'VERIFIED') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Ledger entry already verified' });
    }

    const bankResult = await client.query(
      `SELECT id, amount, status
       FROM bank_statement_entries
       WHERE id = $1
       FOR UPDATE`,
      [bankStatementEntryId]
    );
    const bank = bankResult.rows[0];
    if (!bank) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Bank statement entry not found' });
    }
    if (bank.status !== 'UNMATCHED') {
      await client.query('ROLLBACK');
      return res.status(409).json({ message: 'Bank statement entry already matched/closed' });
    }
    if (Number(bank.amount) !== Number(ledger.amount)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: 'Amount mismatch between receipt and bank statement' });
    }

    await client.query(
      `UPDATE customer_ledger_entries
       SET verification_status = 'VERIFIED',
           verified_by = $1,
           verified_at = NOW(),
           verification_notes = COALESCE($2, verification_notes),
           bank_statement_entry_id = $3
       WHERE id = $4`,
      [req.user.id, verificationNotes || null, bankStatementEntryId, ledgerEntryId]
    );

    await client.query(
      `UPDATE bank_statement_entries
       SET status = 'MATCHED',
           matched_ledger_entry_id = $1,
           matched_by = $2,
           matched_at = NOW()
       WHERE id = $3`,
      [ledgerEntryId, req.user.id, bankStatementEntryId]
    );

    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function getTrialBalance(req, res, next) {
  try {
    const { from = '', to = '', search = '', outlet = '' } = req.query;
    const scopedOutlet = getFinanceOutletScope(req);
    const values = [];
    const accountFilters = [];
    const entryFilters = [];

    if (search) {
      values.push(`%${search}%`);
      accountFilters.push(`(a.customer_name ILIKE $${values.length} OR a.customer_number ILIKE $${values.length})`);
    }
    if (scopedOutlet) {
      values.push(scopedOutlet);
      accountFilters.push(
        `EXISTS (
          SELECT 1
          FROM orders ox
          WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
            AND LOWER(ox.ordered_from) = LOWER($${values.length})
        )`
      );
    } else if (outlet) {
      values.push(outlet);
      accountFilters.push(
        `EXISTS (
          SELECT 1
          FROM orders ox
          WHERE LOWER(ox.customer_number) = LOWER(a.customer_number)
            AND LOWER(ox.ordered_from) = LOWER($${values.length})
        )`
      );
    }
    if (from) {
      values.push(from);
      entryFilters.push(`le.entry_date >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      entryFilters.push(`le.entry_date <= $${values.length}`);
    }

    const whereAccount = accountFilters.length ? `WHERE ${accountFilters.join(' AND ')}` : '';
    const joinEntryFilter = entryFilters.length ? `AND ${entryFilters.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT
         a.id AS account_id,
         a.customer_name,
         a.customer_number,
         a.outlet_name,
         COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0)::numeric(12,2) AS total_debit,
         COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0)::numeric(12,2) AS total_credit
       FROM customer_accounts a
       LEFT JOIN customer_ledger_entries le
         ON le.account_id = a.id
        ${joinEntryFilter}
       ${whereAccount}
       GROUP BY a.id
       ORDER BY a.customer_name ASC`,
      values
    );

    const accounts = rows.map((r) => {
      const debit = Number(r.total_debit || 0);
      const credit = Number(r.total_credit || 0);
      const net = debit - credit;
      return {
        ...r,
        balance: net.toFixed(2),
        balance_debit: (net > 0 ? net : 0).toFixed(2),
        balance_credit: (net < 0 ? Math.abs(net) : 0).toFixed(2),
      };
    });

    const totals = accounts.reduce((acc, a) => {
      acc.total_debit += Number(a.total_debit || 0);
      acc.total_credit += Number(a.total_credit || 0);
      acc.balance_debit += Number(a.balance_debit || 0);
      acc.balance_credit += Number(a.balance_credit || 0);
      return acc;
    }, {
      total_debit: 0,
      total_credit: 0,
      balance_debit: 0,
      balance_credit: 0,
    });

    res.json({
      from: from || null,
      to: to || null,
      scoped_outlet: scopedOutlet || null,
      accounts,
      totals: {
        total_debit: totals.total_debit.toFixed(2),
        total_credit: totals.total_credit.toFixed(2),
        balance_debit: totals.balance_debit.toFixed(2),
        balance_credit: totals.balance_credit.toFixed(2),
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  ensureAccount,
  postOrderLedgerEntries,
  listAccounts,
  getAccountLedger,
  postLedgerEntry,
  listBankStatementEntries,
  addBankStatementEntry,
  listPendingVerifications,
  verifyPaymentEntry,
  getTrialBalance,
  listPaymentAccounts,
  createPaymentAccount,
  updatePaymentAccount,
};
