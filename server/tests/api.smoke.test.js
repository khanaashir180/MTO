process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-value-1234567890';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
process.env.METRICS_TOKEN = process.env.METRICS_TOKEN || 'metrics-test-token';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const db = require('../src/config/db');
const app = require('../src/app');

describe('API smoke tests', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.connect.mockReset();
  });

  test('GET /health returns ok', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  test('POST /api/auth/login returns 401 for unknown user', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [] }) // security settings
      .mockResolvedValueOnce({ rows: [] }) // lookup by email
      .mockResolvedValueOnce({ rows: [] }); // lookup by outlet username

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'missing@example.com', password: 'wrong' });

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/Invalid credentials/i);
  });

  test('POST /api/auth/login returns token for valid user credentials', async () => {
    const userRow = {
      id: 11,
      full_name: 'Smoke Tester',
      email: 'tester@example.com',
      password_hash: '$2a$10$hash',
      stage_access: null,
      stage_name: null,
      role: 'SUPER_USER',
      invite_accepted_at: new Date().toISOString(),
      is_active: true,
      last_login_at: null,
      failed_login_attempts: 0,
      locked_until: null,
      force_password_reset: false,
      role_permissions: {},
      user_permissions: {},
      outlet_id: null,
      outlet_name: null,
    };

    db.query
      .mockResolvedValueOnce({ rows: [] }) // security settings
      .mockResolvedValueOnce({ rows: [userRow] }) // lookup by email
      .mockResolvedValueOnce({ rows: [] }) // update login counters
      .mockResolvedValueOnce({ rows: [] }); // audit log insert

    jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
    db.connect.mockResolvedValue({
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 901 }] }) // insert session
        .mockResolvedValueOnce({ rows: [] }), // COMMIT
      release: jest.fn(),
    });

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'tester@example.com', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.refreshToken).toBeTruthy();
    expect(response.body.user.email).toBe('tester@example.com');
  });

  test('POST /api/auth/refresh returns 401 for invalid refresh token', async () => {
    const response = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'bad-token' });

    expect(response.status).toBe(401);
  });

  test('POST /api/auth/refresh rotates refresh token for valid session', async () => {
    db.connect.mockResolvedValue({
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 901, user_id: 11 }] }) // find session by refresh hash
        .mockResolvedValueOnce({
          rows: [{
            id: 11,
            full_name: 'Smoke Tester',
            email: 'tester@example.com',
            stage_access: null,
            stage_name: null,
            role: 'SUPER_USER',
            role_permissions: {},
            user_permissions: {},
            outlet_id: null,
            outlet_name: null,
          }],
        }) // user fetch
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }) // rotate hash update
        .mockResolvedValueOnce({ rows: [] }), // COMMIT
      release: jest.fn(),
    });

    const response = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'opaque-refresh-token-value' });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeTruthy();
    expect(response.body.refreshToken).toBeTruthy();
  });

  test('POST /api/auth/logout always returns success', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: '' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  test('POST /api/orders is protected (requires auth)', async () => {
    const response = await request(app).post('/api/orders').send({});
    expect(response.status).toBe(401);
  });

  test('GET /api/auth/users blocks non-admin permissions', async () => {
    const token = jwt.sign(
      { sub: 77, role: 'RETAIL', email: 'retail@example.com' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    db.query.mockResolvedValueOnce({
      rows: [{
        id: 77,
        full_name: 'Retail User',
        email: 'retail@example.com',
        stage_access: null,
        stage_name: null,
        role: 'RETAIL',
        role_permissions: {},
        user_permissions: {},
        outlet_id: null,
        outlet_name: null,
      }],
    });

    const response = await request(app)
      .get('/api/auth/users')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  test('GET /metrics is protected by bearer token', async () => {
    const denied = await request(app).get('/metrics');
    expect(denied.status).toBe(403);

    const allowed = await request(app)
      .get('/metrics')
      .set('Authorization', `Bearer ${process.env.METRICS_TOKEN}`);
    expect(allowed.status).toBe(200);
    expect(String(allowed.text || '')).toMatch(/mto_http_requests_total/);
  });
});
