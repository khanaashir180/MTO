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

async function login(email, password = 'password123') {
  const response = await request(app)
    .post('/api/auth/login')
    .send({ email, password });
  expect(response.status).toBe(200);
  expect(response.body.token).toBeTruthy();
  expect(response.body.user.email).toBe(email);
  return response.body.token;
}

function futureDate(daysFromToday) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

function orderPayload(overrides = {}) {
  const unique = Date.now();
  return {
    customerName: 'Pilot Workflow Customer',
    customerCountryCode: '+92',
    customerNumber: `300${String(unique).slice(-7)}`,
    customerAddress: 'Pilot billing address',
    deliveryAddress: 'Pilot delivery address',
    orderDate: futureDate(0),
    dueDate: futureDate(21),
    orderedFrom: 'Outlet 1',
    productPrice: '120000',
    advancePaid: '0',
    comments: 'Integration workflow order',
    orderType: 'MTO',
    productName: 'Oxford shoe',
    size: '42',
    colour: 'Black',
    lastNumber: 'L-100',
    sole: 'Leather',
    upperMaterial: 'Calf',
    liningMaterial: 'Leather',
    edgeColour: 'Black',
    socks: 'Standard',
    welt: 'Flat',
    stamp: 'MTO',
    ...overrides,
  };
}

describe('pilot integration workflow against real database', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('seeded core users can authenticate with accepted active accounts', async () => {
    const users = [
      ['super@example.com', 'SUPER_USER'],
      ['shopmanager@example.com', 'SHOP_MANAGER'],
      ['finance@example.com', 'FINANCE'],
      ['service@example.com', 'CUSTOMER_SERVICE'],
      ['manager@example.com', 'PRODUCTION_MANAGER'],
    ];

    for (const [email, role] of users) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email, password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body.token).toBeTruthy();
      expect(response.body.user.email).toBe(email);
      expect(response.body.user.role).toBe(role);
    }
  });

  test('permission model allows and blocks core pilot routes by seeded role', async () => {
    const superToken = await login('super@example.com');
    const shopToken = await login('shopmanager@example.com');
    const financeToken = await login('finance@example.com');
    const serviceToken = await login('service@example.com');

    const adminUsers = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${superToken}`);
    expect(adminUsers.status).toBe(200);
    expect(Array.isArray(adminUsers.body.users)).toBe(true);

    const shopBlockedFromAdmin = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${shopToken}`);
    expect(shopBlockedFromAdmin.status).toBe(403);

    const retailDashboard = await request(app)
      .get('/api/orders/retail-dashboard')
      .set('Authorization', `Bearer ${shopToken}`);
    expect(retailDashboard.status).toBe(200);
    expect(retailDashboard.body).toHaveProperty('orders');

    const financeAccounts = await request(app)
      .get('/api/finance/accounts')
      .set('Authorization', `Bearer ${financeToken}`);
    expect(financeAccounts.status).toBe(200);
    expect(Array.isArray(financeAccounts.body.accounts)).toBe(true);

    const crmSummary = await request(app)
      .get('/api/crm/summary')
      .set('Authorization', `Bearer ${serviceToken}`);
    expect(crmSummary.status).toBe(200);
    expect(crmSummary.body).toHaveProperty('total_customers');

    const crmBlockedForShop = await request(app)
      .get('/api/crm/summary')
      .set('Authorization', `Bearer ${shopToken}`);
    expect(crmBlockedForShop.status).toBe(403);
  });

  test('customer lookup validates missing numbers and identifies new customers', async () => {
    const shopToken = await login('shopmanager@example.com');

    const missingNumber = await request(app)
      .get('/api/orders/customer-lookup')
      .set('Authorization', `Bearer ${shopToken}`);
    expect(missingNumber.status).toBe(400);
    expect(missingNumber.body.message).toMatch(/customerNumber is required/i);

    const newCustomer = await request(app)
      .get('/api/orders/customer-lookup')
      .query({ customerCountryCode: '+92', customerNumber: '3009998887' })
      .set('Authorization', `Bearer ${shopToken}`);
    expect(newCustomer.status).toBe(200);
    expect(newCustomer.body.exists).toBe(false);
    expect(newCustomer.body.message).toMatch(/New customer number/i);
  });

  test('finance permission delegation works without granting finance role', async () => {
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role_id, is_active, invite_accepted_at, password_set_at, force_password_reset)
       VALUES (
         'Delegated Finance Tester',
         'delegated-finance@example.com',
         (SELECT password_hash FROM users WHERE email = 'finance@example.com'),
         (SELECT id FROM roles WHERE name = 'CUSTOMER_SERVICE'),
         true,
         NOW(),
         NOW(),
         false
       )
       ON CONFLICT (email)
       DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role_id = EXCLUDED.role_id,
         is_active = true,
         invite_accepted_at = NOW(),
         password_set_at = NOW(),
         force_password_reset = false
       RETURNING id`
    );

    await pool.query(
      `INSERT INTO user_permission_overrides (user_id, permissions, updated_at)
       VALUES ($1, '{"finance_manage_settings": true}'::jsonb, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = NOW()`,
      [rows[0].id]
    );

    const token = await login('delegated-finance@example.com');
    const response = await request(app)
      .get('/api/finance/vendors')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.vendors)).toBe(true);
  });

  test('creates real MTO order with PO prefix, product, customer account, and ledger entry', async () => {
    const shopToken = await login('shopmanager@example.com');
    const payload = orderPayload();

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${shopToken}`)
      .set('Idempotency-Key', `itest-mto-${Date.now()}`)
      .field('customerName', payload.customerName)
      .field('customerCountryCode', payload.customerCountryCode)
      .field('customerNumber', payload.customerNumber)
      .field('customerAddress', payload.customerAddress)
      .field('deliveryAddress', payload.deliveryAddress)
      .field('orderDate', payload.orderDate)
      .field('dueDate', payload.dueDate)
      .field('orderedFrom', payload.orderedFrom)
      .field('productPrice', payload.productPrice)
      .field('advancePaid', payload.advancePaid)
      .field('comments', payload.comments)
      .field('orderType', payload.orderType)
      .field('productName', payload.productName)
      .field('size', payload.size)
      .field('colour', payload.colour)
      .field('lastNumber', payload.lastNumber)
      .field('sole', payload.sole)
      .field('upperMaterial', payload.upperMaterial)
      .field('liningMaterial', payload.liningMaterial)
      .field('edgeColour', payload.edgeColour)
      .field('socks', payload.socks)
      .field('welt', payload.welt)
      .field('stamp', payload.stamp);

    expect(response.status).toBe(201);
    expect(response.body.order.production_order_no).toMatch(/^PO-\d{8}-\d{6}$/);
    expect(response.body.order.customer_number).toMatch(/^\+92/);
    expect(response.body.product.product_name).toBe(payload.productName);

    const { rows: accountRows } = await pool.query(
      `SELECT id, customer_name, customer_number FROM customer_accounts WHERE customer_number = $1`,
      [response.body.order.customer_number]
    );
    expect(accountRows).toHaveLength(1);

    const { rows: ledgerRows } = await pool.query(
      `SELECT entry_type, category, amount FROM customer_ledger_entries WHERE reference_order_id = $1 ORDER BY id`,
      [response.body.order.id]
    );
    expect(ledgerRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entry_type: 'DEBIT', category: 'ORDER' }),
      ])
    );
  });

  test('creates real refurbishment order with RF prefix and service intake details', async () => {
    const shopToken = await login('shopmanager@example.com');
    const payload = orderPayload({
      customerNumber: `301${String(Date.now()).slice(-7)}`,
      orderType: 'REFURBISHMENT',
      productName: 'Existing loafer',
      productPrice: '18000',
      itemCondition: 'WORN',
      refurbishmentType: 'FULL_REFINISH',
      issueDescription: 'Colour faded and sole worn',
      workRequested: 'Refinish upper and replace sole',
      accessoriesReceived: 'Shoe bag',
    });

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${shopToken}`)
      .set('Idempotency-Key', `itest-rf-${Date.now()}`)
      .field('customerName', payload.customerName)
      .field('customerCountryCode', payload.customerCountryCode)
      .field('customerNumber', payload.customerNumber)
      .field('customerAddress', payload.customerAddress)
      .field('deliveryAddress', payload.deliveryAddress)
      .field('orderDate', payload.orderDate)
      .field('dueDate', payload.dueDate)
      .field('orderedFrom', payload.orderedFrom)
      .field('productPrice', payload.productPrice)
      .field('advancePaid', payload.advancePaid)
      .field('orderType', payload.orderType)
      .field('productName', payload.productName)
      .field('size', payload.size)
      .field('colour', payload.colour)
      .field('sole', payload.sole)
      .field('itemCondition', payload.itemCondition)
      .field('refurbishmentType', payload.refurbishmentType)
      .field('issueDescription', payload.issueDescription)
      .field('workRequested', payload.workRequested)
      .field('accessoriesReceived', payload.accessoriesReceived);

    expect(response.status).toBe(201);
    expect(response.body.order.production_order_no).toMatch(/^RF-\d{8}-\d{6}$/);

    const { rows } = await pool.query(
      `SELECT item_condition, refurbishment_type, issue_description, work_requested, accessories_received
       FROM order_refurbishments
       WHERE order_id = $1`,
      [response.body.order.id]
    );
    expect(rows[0]).toEqual(
      expect.objectContaining({
        item_condition: payload.itemCondition,
        refurbishment_type: payload.refurbishmentType,
        issue_description: payload.issueDescription,
        work_requested: payload.workRequested,
        accessories_received: payload.accessoriesReceived,
      })
    );
  });

  test('creates replacement recovery case with linked reference suffix', async () => {
    const shopToken = await login('shopmanager@example.com');
    const createOrderResponse = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${shopToken}`)
      .set('Idempotency-Key', `itest-recovery-order-${Date.now()}`)
      .field('customerName', 'Pilot Recovery Customer')
      .field('customerCountryCode', '+92')
      .field('customerNumber', `302${String(Date.now()).slice(-7)}`)
      .field('customerAddress', 'Recovery billing address')
      .field('deliveryAddress', 'Recovery delivery address')
      .field('orderDate', futureDate(0))
      .field('dueDate', futureDate(21))
      .field('orderedFrom', 'Outlet 1')
      .field('productPrice', '90000')
      .field('advancePaid', '0')
      .field('orderType', 'MTO')
      .field('productName', 'Recovery oxford')
      .field('size', '43')
      .field('colour', 'Brown')
      .field('sole', 'Leather');

    expect(createOrderResponse.status).toBe(201);
    const order = createOrderResponse.body.order;

    const recoveryResponse = await request(app)
      .post('/api/orders/retail-recovery-cases')
      .set('Authorization', `Bearer ${shopToken}`)
      .send({
        orderId: order.id,
        caseType: 'REPLACEMENT',
        reasonCode: 'SIZE_ISSUE',
        rootCauseBucket: 'FITTING',
        complaintChannel: 'STORE',
        ownerName: 'Pilot Manager',
        promisedResolutionDate: futureDate(10),
        estimatedCost: 1000,
        notes: 'Integration replacement case',
      });

    expect(recoveryResponse.status).toBe(201);
    expect(recoveryResponse.body.recoveryCase.production_order_no).toBe(order.production_order_no);
    expect(recoveryResponse.body.recoveryCase.recovery_reference_no).toBe(`${order.production_order_no}-R1`);
    expect(recoveryResponse.body.recoveryCase.replacement_sequence).toBe(1);
  });

  test('rejects invalid MTO customer names before creating workflow data', async () => {
    const shopToken = await login('shopmanager@example.com');

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${shopToken}`)
      .set('Idempotency-Key', `itest-invalid-name-${Date.now()}`)
      .field('customerName', '123456789012')
      .field('customerCountryCode', '+92')
      .field('customerNumber', `303${String(Date.now()).slice(-7)}`)
      .field('customerAddress', 'Invalid name address')
      .field('deliveryAddress', 'Invalid name delivery')
      .field('orderDate', futureDate(0))
      .field('dueDate', futureDate(21))
      .field('orderedFrom', 'Outlet 1')
      .field('productPrice', '1000')
      .field('advancePaid', '0')
      .field('orderType', 'MTO')
      .field('productName', 'Invalid name shoe');

    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/Customer name must contain letters/i);
  });
});
