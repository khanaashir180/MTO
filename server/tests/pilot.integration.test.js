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
});
