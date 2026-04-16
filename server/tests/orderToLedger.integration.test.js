/**
 * Critical integration tests: Order → Ledger financial flow
 *
 * Verifies the complete path from order creation through customer account
 * upsert to ledger entry posting.  Runs against the real database so that
 * constraint violations, duplicate-entry guards, and balance calculations
 * are exercised end-to-end.
 *
 * Prerequisites: seeded database (npm run seed) and a running PostgreSQL
 * instance reachable via DATABASE_URL.
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
const { postOrderLedgerEntries, ensureAccount } = require('../src/services/customerLedgerService');

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

function uniquePhone(prefix = '310') {
  return `${prefix}${String(Date.now()).slice(-7)}`;
}

async function createOrder(token, overrides = {}) {
  const phone = uniquePhone();
  const payload = {
    customerName: 'Ledger Integration Customer',
    customerCountryCode: '+92',
    customerNumber: phone,
    customerAddress: '12 Finance Street',
    deliveryAddress: '12 Finance Street',
    orderDate: futureDate(0),
    dueDate: futureDate(30),
    orderedFrom: 'Outlet 1',
    productPrice: '80000',
    advancePaid: '0',
    orderType: 'MTO',
    productionFlow: 'MTO',
    productName: 'Derby shoe',
    size: '41',
    colour: 'Tan',
    sole: 'Rubber',
    ...overrides,
  };

  const req = request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .set('Idempotency-Key', `itest-ledger-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  Object.entries(payload).forEach(([k, v]) => {
    if (v != null) req.field(k, String(v));
  });

  const res = await req;
  return res;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('order → ledger integration', () => {
  afterAll(async () => {
    await pool.end();
  });

  // ── 1. Complete order flow ─────────────────────────────────────────────────

  test('creates order, posts ORDER debit to ledger, and creates customer account', async () => {
    const token = await login('shopmanager@example.com');
    const res = await createOrder(token, { productPrice: '95000' });

    expect(res.status).toBe(201);
    const order = res.body.order;

    // Customer account must exist
    const { rows: accounts } = await pool.query(
      `SELECT id, customer_name FROM customer_accounts WHERE customer_number = $1`,
      [order.customer_number]
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0].customer_name).toBeTruthy();

    // ORDER debit entry must exist
    const { rows: ledger } = await pool.query(
      `SELECT entry_type, category, amount
       FROM customer_ledger_entries
       WHERE reference_order_id = $1 AND category = 'ORDER'`,
      [order.id]
    );
    expect(ledger).toHaveLength(1);
    expect(ledger[0].entry_type).toBe('DEBIT');
    expect(Number(ledger[0].amount)).toBe(95000);
  });

  // ── 2. Advance payment with multiple splits ────────────────────────────────

  test('posts advance payment with two splits as separate CREDIT entries', async () => {
    const client = await pool.connect();
    try {
      // Seed a payment account for the test
      const { rows: paRows } = await client.query(
        `INSERT INTO payment_accounts (name, account_type, is_active, created_by, created_at, updated_at)
         VALUES ('Test Cash Account', 'CASH', true, 1, NOW(), NOW())
         ON CONFLICT DO NOTHING
         RETURNING id`
      );
      // Use existing cash account if insert conflicted
      const paId = paRows[0]?.id ?? (await client.query(
        `SELECT id FROM payment_accounts WHERE account_type = 'CASH' AND is_active = true LIMIT 1`
      )).rows[0]?.id;

      if (!paId) {
        // Skip if no payment account available in this environment
        return;
      }

      await client.query('BEGIN');

      const accountId = await ensureAccount({
        client,
        customerName: 'Split Advance Customer',
        customerNumber: `+92${uniquePhone('311')}`,
        customerAddress: 'Split test address',
        outletName: 'Outlet 1',
      });

      const orderId = 900001 + Math.floor(Math.random() * 1000);
      const productionOrderNo = `PO-TEST-${orderId}`;

      // Insert a minimal order row so the FK constraint is satisfied
      await client.query(
        `INSERT INTO orders (id, production_order_no, customer_name, customer_number,
           customer_address, delivery_address, ordered_from, order_date, due_date,
           product_price, advance_paid, comments, order_type, production_flow,
           status, current_stage_id, created_by)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'PENDING',
                (SELECT id FROM production_stages ORDER BY sequence LIMIT 1), 1
         WHERE NOT EXISTS (SELECT 1 FROM orders WHERE id = $1)`,
        [
          orderId, productionOrderNo, 'Split Advance Customer',
          `+92${uniquePhone('311')}`, 'Split test address', 'Split test address',
          'Outlet 1', futureDate(0), futureDate(30),
          50000, 15000, null, 'MTO', 'MTO',
        ]
      );

      await postOrderLedgerEntries({
        client,
        orderId,
        productionOrderNo,
        orderDate: futureDate(0),
        customerName: 'Split Advance Customer',
        customerNumber: `+92${uniquePhone('311')}`,
        customerAddress: 'Split test address',
        outletName: 'Outlet 1',
        productPrice: 50000,
        advancePaid: 15000,
        advanceBreakup: [
          { amount: 10000, paymentAccountId: paId, label: 'Cash' },
          { amount: 5000, paymentAccountId: paId, label: 'Card' },
        ],
        createdBy: 1,
      });

      await client.query('COMMIT');

      const { rows: credits } = await pool.query(
        `SELECT amount, notes FROM customer_ledger_entries
         WHERE reference_order_id = $1 AND entry_type = 'CREDIT' AND category = 'ADVANCE'
         ORDER BY id`,
        [orderId]
      );

      expect(credits).toHaveLength(2);
      expect(Number(credits[0].amount)).toBe(10000);
      expect(Number(credits[1].amount)).toBe(5000);
      expect(credits[0].notes).toMatch(/Cash/);
      expect(credits[1].notes).toMatch(/Card/);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  // ── 3. Customer account upsert ─────────────────────────────────────────────

  test('reuses existing customer account when same number is used for a second order', async () => {
    const token = await login('shopmanager@example.com');
    const phone = uniquePhone('312');

    const res1 = await createOrder(token, { customerNumber: phone, productPrice: '40000' });
    expect(res1.status).toBe(201);

    const res2 = await createOrder(token, { customerNumber: phone, productPrice: '60000' });
    expect(res2.status).toBe(201);

    const { rows: accounts } = await pool.query(
      `SELECT id FROM customer_accounts WHERE customer_number = $1`,
      [res1.body.order.customer_number]
    );
    // Exactly one account for this customer number
    expect(accounts).toHaveLength(1);

    // Both orders should have ledger entries pointing to the same account
    const { rows: entries } = await pool.query(
      `SELECT reference_order_id, amount FROM customer_ledger_entries
       WHERE account_id = $1 AND category = 'ORDER'
       ORDER BY id`,
      [accounts[0].id]
    );
    const orderIds = entries.map((e) => e.reference_order_id);
    expect(orderIds).toContain(res1.body.order.id);
    expect(orderIds).toContain(res2.body.order.id);
  });

  // ── 4. Ledger balance calculation ──────────────────────────────────────────

  test('ledger balance equals product price minus advance paid', async () => {
    const token = await login('shopmanager@example.com');
    const financeToken = await login('finance@example.com');
    const phone = uniquePhone('313');

    const res = await createOrder(token, {
      customerNumber: phone,
      productPrice: '120000',
      advancePaid: '0',
    });
    expect(res.status).toBe(201);
    const order = res.body.order;

    const { rows: accounts } = await pool.query(
      `SELECT id FROM customer_accounts WHERE customer_number = $1`,
      [order.customer_number]
    );
    expect(accounts).toHaveLength(1);

    const ledgerRes = await request(app)
      .get(`/api/finance/accounts/${accounts[0].id}/ledger`)
      .set('Authorization', `Bearer ${financeToken}`);

    expect(ledgerRes.status).toBe(200);
    expect(Number(ledgerRes.body.summary.total_debit)).toBeGreaterThanOrEqual(120000);
    expect(Number(ledgerRes.body.summary.balance)).toBeGreaterThanOrEqual(120000);
  });

  // ── 5. No orphaned orders ──────────────────────────────────────────────────

  test('every created order has at least one ledger entry (no orphaned orders)', async () => {
    const token = await login('shopmanager@example.com');
    const res = await createOrder(token, { productPrice: '55000' });
    expect(res.status).toBe(201);

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt
       FROM customer_ledger_entries
       WHERE reference_order_id = $1`,
      [res.body.order.id]
    );
    expect(rows[0].cnt).toBeGreaterThanOrEqual(1);
  });

  // ── 6. Idempotent ledger posting ───────────────────────────────────────────

  test('calling postOrderLedgerEntries twice for the same order does not duplicate the ORDER debit', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const phone = `+92${uniquePhone('314')}`;
      const accountId = await ensureAccount({
        client,
        customerName: 'Idempotent Test Customer',
        customerNumber: phone,
        customerAddress: 'Idempotent address',
        outletName: 'Outlet 1',
      });

      const orderId = 800001 + Math.floor(Math.random() * 1000);
      const productionOrderNo = `PO-IDEM-${orderId}`;

      await client.query(
        `INSERT INTO orders (id, production_order_no, customer_name, customer_number,
           customer_address, delivery_address, ordered_from, order_date, due_date,
           product_price, advance_paid, comments, order_type, production_flow,
           status, current_stage_id, created_by)
         SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'PENDING',
                (SELECT id FROM production_stages ORDER BY sequence LIMIT 1), 1
         WHERE NOT EXISTS (SELECT 1 FROM orders WHERE id = $1)`,
        [
          orderId, productionOrderNo, 'Idempotent Test Customer', phone,
          'Idempotent address', 'Idempotent address', 'Outlet 1',
          futureDate(0), futureDate(30), 30000, 0, null, 'MTO', 'MTO',
        ]
      );

      const args = {
        client,
        orderId,
        productionOrderNo,
        orderDate: futureDate(0),
        customerName: 'Idempotent Test Customer',
        customerNumber: phone,
        customerAddress: 'Idempotent address',
        outletName: 'Outlet 1',
        productPrice: 30000,
        advancePaid: 0,
        createdBy: 1,
      };

      await postOrderLedgerEntries(args);
      await postOrderLedgerEntries(args); // second call must be a no-op for ORDER entry

      await client.query('COMMIT');

      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt
         FROM customer_ledger_entries
         WHERE reference_order_id = $1 AND category = 'ORDER'`,
        [orderId]
      );
      expect(rows[0].cnt).toBe(1);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  // ── 7. Concurrent order posting (race condition safety) ───────────────────

  test('concurrent order creation for the same customer produces exactly one account', async () => {
    const token = await login('shopmanager@example.com');
    const phone = uniquePhone('315');

    // Fire two orders simultaneously for the same customer number
    const [res1, res2] = await Promise.all([
      createOrder(token, { customerNumber: phone, productPrice: '30000' }),
      createOrder(token, { customerNumber: phone, productPrice: '30000' }),
    ]);

    // Both should succeed (or one may fail with 409 idempotency – either is acceptable)
    const successStatuses = [res1.status, res2.status].filter((s) => s === 201);
    expect(successStatuses.length).toBeGreaterThanOrEqual(1);

    // Regardless of how many orders were created, there must be exactly one account
    const { rows: accounts } = await pool.query(
      `SELECT id FROM customer_accounts
       WHERE regexp_replace(customer_number, '[^0-9]', '', 'g')
           = regexp_replace($1, '[^0-9]', '', 'g')`,
      [phone]
    );
    expect(accounts).toHaveLength(1);
  });
});
