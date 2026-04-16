/**
 * Critical integration tests: Payment reconciliation financial flow
 *
 * Verifies that payment entries posted through the finance API are correctly
 * recorded in the customer ledger, linked to the right payment accounts, and
 * reflected accurately in account balance summaries.
 *
 * Runs against the real database.
 */

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-secret-value-1234567890';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
process.env.METRICS_TOKEN = process.env.METRICS_TOKEN || 'integration-metrics-token';

const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/config/db');

// ── Helpers ───────────────────────────────────────────────────────────────────

async function login(email, password = 'password123') {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  expect(res.status).toBe(200);
  return res.body.token;
}

function futureDate(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function uniquePhone(prefix = '320') {
  return `${prefix}${String(Date.now()).slice(-7)}`;
}

/**
 * Create a minimal order via the API and return { order, accountId }.
 */
async function createOrderAndGetAccount(shopToken, phone, price = '70000') {
  const req = request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${shopToken}`)
    .set('Idempotency-Key', `itest-pay-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  [
    ['customerName', 'Payment Test Customer'],
    ['customerCountryCode', '+92'],
    ['customerNumber', phone],
    ['customerAddress', '5 Payment Lane'],
    ['deliveryAddress', '5 Payment Lane'],
    ['orderDate', futureDate(0)],
    ['dueDate', futureDate(30)],
    ['orderedFrom', 'Outlet 1'],
    ['productPrice', price],
    ['advancePaid', '0'],
    ['orderType', 'MTO'],
    ['productionFlow', 'MTO'],
    ['productName', 'Loafer'],
    ['size', '42'],
    ['colour', 'Black'],
    ['sole', 'Leather'],
  ].forEach(([k, v]) => req.field(k, v));

  const res = await req;
  expect(res.status).toBe(201);
  const order = res.body.order;

  const { rows } = await pool.query(
    `SELECT id FROM customer_accounts WHERE customer_number = $1`,
    [order.customer_number]
  );
  expect(rows).toHaveLength(1);
  return { order, accountId: rows[0].id };
}

/**
 * Resolve or create an active payment account for tests.
 */
async function resolvePaymentAccount() {
  const { rows } = await pool.query(
    `SELECT id FROM payment_accounts WHERE is_active = true LIMIT 1`
  );
  if (rows[0]) return rows[0].id;

  const { rows: created } = await pool.query(
    `INSERT INTO payment_accounts (name, account_type, is_active, created_by, created_at, updated_at)
     VALUES ('Test Bank Account', 'BANK', true, 1, NOW(), NOW())
     RETURNING id`
  );
  return created[0].id;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('payment reconciliation integration', () => {
  afterAll(async () => {
    await pool.end();
  });

  // ── 1. Payment posting to ledger ───────────────────────────────────────────

  test('posting a RECEIPT credit entry reduces the outstanding balance', async () => {
    const shopToken = await login('shopmanager@example.com');
    const financeToken = await login('finance@example.com');
    const phone = uniquePhone('321');
    const paymentAccountId = await resolvePaymentAccount();

    const { order, accountId } = await createOrderAndGetAccount(shopToken, phone, '100000');

    // Post a receipt payment via the finance API
    const postRes = await request(app)
      .post(`/api/finance/accounts/${accountId}/ledger`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `itest-receipt-${Date.now()}`)
      .send({
        entryDate: futureDate(1),
        entryType: 'CREDIT',
        category: 'RECEIPT',
        amount: 40000,
        referenceOrderId: order.id,
        paymentAccountId,
        notes: 'Partial payment received',
      });

    expect(postRes.status).toBe(201);
    expect(postRes.body.entry.entry_type).toBe('CREDIT');
    expect(postRes.body.entry.category).toBe('RECEIPT');
    expect(Number(postRes.body.entry.amount)).toBe(40000);

    // Verify balance via ledger endpoint
    const ledgerRes = await request(app)
      .get(`/api/finance/accounts/${accountId}/ledger`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(ledgerRes.status).toBe(200);
    const { summary } = ledgerRes.body;
    expect(Number(summary.total_debit)).toBeGreaterThanOrEqual(100000);
    expect(Number(summary.total_credit)).toBeGreaterThanOrEqual(40000);
    expect(Number(summary.balance)).toBeLessThan(Number(summary.total_debit));
  });

  // ── 2. Payment account linking ─────────────────────────────────────────────

  test('receipt entry is linked to the correct payment account', async () => {
    const shopToken = await login('shopmanager@example.com');
    const financeToken = await login('finance@example.com');
    const phone = uniquePhone('322');
    const paymentAccountId = await resolvePaymentAccount();

    const { order, accountId } = await createOrderAndGetAccount(shopToken, phone, '60000');

    const postRes = await request(app)
      .post(`/api/finance/accounts/${accountId}/ledger`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `itest-link-${Date.now()}`)
      .send({
        entryDate: futureDate(1),
        entryType: 'CREDIT',
        category: 'RECEIPT',
        amount: 20000,
        referenceOrderId: order.id,
        paymentAccountId,
        notes: 'Linked payment test',
      });

    expect(postRes.status).toBe(201);
    expect(postRes.body.entry.payment_account_id).toBe(paymentAccountId);

    // Confirm via direct DB query
    const { rows } = await pool.query(
      `SELECT payment_account_id FROM customer_ledger_entries WHERE id = $1`,
      [postRes.body.entry.id]
    );
    expect(rows[0].payment_account_id).toBe(paymentAccountId);
  });

  // ── 3. Payment adjustment (credit adjustment) ──────────────────────────────

  test('posting a CREDIT ADJUSTMENT entry is reflected in the account balance', async () => {
    const shopToken = await login('shopmanager@example.com');
    const financeToken = await login('finance@example.com');
    const phone = uniquePhone('323');

    const { accountId } = await createOrderAndGetAccount(shopToken, phone, '50000');

    const adjRes = await request(app)
      .post(`/api/finance/accounts/${accountId}/ledger`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `itest-adj-${Date.now()}`)
      .send({
        entryDate: futureDate(1),
        entryType: 'CREDIT',
        category: 'ADJUSTMENT',
        amount: 5000,
        notes: 'Goodwill discount adjustment',
      });

    expect(adjRes.status).toBe(201);
    expect(adjRes.body.entry.category).toBe('ADJUSTMENT');

    const ledgerRes = await request(app)
      .get(`/api/finance/accounts/${accountId}/ledger`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(ledgerRes.status).toBe(200);
    expect(Number(ledgerRes.body.summary.total_credit)).toBeGreaterThanOrEqual(5000);
  });

  // ── 4. Ledger balance after payment ───────────────────────────────────────

  test('balance after full payment equals zero', async () => {
    const shopToken = await login('shopmanager@example.com');
    const financeToken = await login('finance@example.com');
    const phone = uniquePhone('324');
    const paymentAccountId = await resolvePaymentAccount();
    const price = 45000;

    const { order, accountId } = await createOrderAndGetAccount(shopToken, phone, String(price));

    // Pay the full amount
    const postRes = await request(app)
      .post(`/api/finance/accounts/${accountId}/ledger`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `itest-full-pay-${Date.now()}`)
      .send({
        entryDate: futureDate(1),
        entryType: 'CREDIT',
        category: 'RECEIPT',
        amount: price,
        referenceOrderId: order.id,
        paymentAccountId,
        notes: 'Full payment',
      });

    expect(postRes.status).toBe(201);

    const ledgerRes = await request(app)
      .get(`/api/finance/accounts/${accountId}/ledger`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(ledgerRes.status).toBe(200);
    // Balance for this specific order should be 0 (debit = credit)
    const orderSummary = ledgerRes.body.order_summaries.find((s) => s.order_id === order.id);
    expect(orderSummary).toBeDefined();
    expect(Number(orderSummary.balance)).toBe(0);
  });

  // ── 5. Payment entries match order amounts ─────────────────────────────────

  test('order summary totals match the individual ledger entries', async () => {
    const shopToken = await login('shopmanager@example.com');
    const financeToken = await login('finance@example.com');
    const phone = uniquePhone('325');
    const paymentAccountId = await resolvePaymentAccount();

    const { order, accountId } = await createOrderAndGetAccount(shopToken, phone, '80000');

    // Post two partial payments
    for (const amount of [30000, 20000]) {
      const r = await request(app)
        .post(`/api/finance/accounts/${accountId}/ledger`)
        .set('Authorization', `Bearer ${financeToken}`)
        .set('Idempotency-Key', `itest-partial-${amount}-${Date.now()}`)
        .send({
          entryDate: futureDate(1),
          entryType: 'CREDIT',
          category: 'RECEIPT',
          amount,
          referenceOrderId: order.id,
          paymentAccountId,
          notes: `Partial payment ${amount}`,
        });
      expect(r.status).toBe(201);
    }

    const ledgerRes = await request(app)
      .get(`/api/finance/accounts/${accountId}/ledger`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(ledgerRes.status).toBe(200);

    const orderSummary = ledgerRes.body.order_summaries.find((s) => s.order_id === order.id);
    expect(orderSummary).toBeDefined();
    expect(Number(orderSummary.total_debit)).toBe(80000);
    expect(Number(orderSummary.receipts_paid)).toBe(50000);
    expect(Number(orderSummary.balance)).toBe(30000);
  });

  // ── 6. Reject payment without required payment account ────────────────────

  test('posting a RECEIPT credit without a payment account is rejected', async () => {
    const shopToken = await login('shopmanager@example.com');
    const financeToken = await login('finance@example.com');
    const phone = uniquePhone('326');

    const { order, accountId } = await createOrderAndGetAccount(shopToken, phone, '30000');

    const res = await request(app)
      .post(`/api/finance/accounts/${accountId}/ledger`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `itest-no-pa-${Date.now()}`)
      .send({
        entryDate: futureDate(1),
        entryType: 'CREDIT',
        category: 'RECEIPT',
        amount: 10000,
        referenceOrderId: order.id,
        // paymentAccountId intentionally omitted
        notes: 'Should be rejected',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/payment account/i);
  });

  // ── 7. Reject payment linked to wrong customer's order ────────────────────

  test('posting a payment linked to another customer order is rejected', async () => {
    const shopToken = await login('shopmanager@example.com');
    const financeToken = await login('finance@example.com');
    const paymentAccountId = await resolvePaymentAccount();

    const { accountId: account1 } = await createOrderAndGetAccount(shopToken, uniquePhone('327'), '40000');
    const { order: order2 } = await createOrderAndGetAccount(shopToken, uniquePhone('328'), '40000');

    const res = await request(app)
      .post(`/api/finance/accounts/${account1}/ledger`)
      .set('Authorization', `Bearer ${financeToken}`)
      .set('Idempotency-Key', `itest-wrong-order-${Date.now()}`)
      .send({
        entryDate: futureDate(1),
        entryType: 'CREDIT',
        category: 'RECEIPT',
        amount: 10000,
        referenceOrderId: order2.id, // belongs to a different customer
        paymentAccountId,
        notes: 'Cross-customer payment attempt',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/does not belong/i);
  });
});
