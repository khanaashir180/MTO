process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-value-1234567890';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
process.env.CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:3000';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
process.env.UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
process.env.METRICS_TOKEN = process.env.METRICS_TOKEN || 'metrics-test-token';

const jwt = require('jsonwebtoken');

jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  connect: jest.fn(),
}));

const db = require('../src/config/db');
const {
  authRequired,
  requirePermission,
  requireAnyPermission,
  requireRoleOrPermission,
  requireStageAccess,
  signAccessToken,
  signRefreshToken,
} = require('../src/middleware/auth');

function createResponse() {
  const res = {
    statusCode: 200,
    body: undefined,
    status: jest.fn((code) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((payload) => {
      res.body = payload;
      return res;
    }),
  };
  return res;
}

function runMiddleware(middleware, req = {}) {
  const res = createResponse();
  const next = jest.fn();
  middleware(req, res, next);
  return { res, next };
}

async function runAsyncMiddleware(middleware, req = {}) {
  const res = createResponse();
  const next = jest.fn();
  await middleware(req, res, next);
  return { res, next };
}

describe('auth middleware permission gates', () => {
  beforeEach(() => {
    db.query.mockReset();
    db.connect.mockReset();
  });

  test('authRequired rejects requests without bearer token', async () => {
    const { res, next } = await runAsyncMiddleware(authRequired, { headers: {} });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.message).toMatch(/Unauthorized/i);
    expect(next).not.toHaveBeenCalled();
  });

  test('authRequired rejects refresh tokens on access-protected routes', async () => {
    const token = jwt.sign(
      { sub: 10, tokenType: 'refresh', sid: 5 },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const { res, next } = await runAsyncMiddleware(authRequired, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.message).toMatch(/Invalid access token type/i);
    expect(next).not.toHaveBeenCalled();
  });

  test('authRequired validates active session and builds effective permissions', async () => {
    const token = jwt.sign(
      { sub: 11, tokenType: 'access', sid: 901, role: 'CUSTOMER_SERVICE' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    db.query
      .mockResolvedValueOnce({ rows: [{ id: 901 }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 11,
          full_name: 'CRM User',
          email: 'crm@example.com',
          stage_access: null,
          stage_name: null,
          role: 'CUSTOMER_SERVICE',
          role_permissions: { crm_manage_records: false },
          user_permissions: { crm_manage_records: true, crm_manage_approvals: true },
          outlet_id: null,
          outlet_name: null,
        }],
      });

    const req = { headers: { authorization: `Bearer ${token}` } };
    const { res, next } = await runAsyncMiddleware(authRequired, req);

    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.email).toBe('crm@example.com');
    expect(req.user.permissions.crm_view_module).toBe(true);
    expect(req.user.permissions.crm_manage_records).toBe(true);
    expect(req.user.permissions.crm_manage_approvals).toBe(true);
  });

  test('authRequired rejects revoked or expired sessions', async () => {
    const token = jwt.sign(
      { sub: 11, tokenType: 'access', sid: 901 },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    db.query.mockResolvedValueOnce({ rows: [] });

    const { res, next } = await runAsyncMiddleware(authRequired, {
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.message).toMatch(/Session expired/i);
    expect(next).not.toHaveBeenCalled();
  });

  test('requirePermission allows explicit permission and blocks missing permission', () => {
    const allowed = runMiddleware(requirePermission('finance_manage_settings'), {
      user: { role: 'RETAIL_STAFF', permissions: { finance_manage_settings: true } },
    });
    expect(allowed.next).toHaveBeenCalledTimes(1);

    const denied = runMiddleware(requirePermission('finance_manage_settings'), {
      user: { role: 'RETAIL_STAFF', permissions: { finance_view_module: true } },
    });
    expect(denied.res.status).toHaveBeenCalledWith(403);
    expect(denied.next).not.toHaveBeenCalled();
  });

  test('requireAnyPermission allows one matching permission', () => {
    const { next } = runMiddleware(
      requireAnyPermission('retail_view_head_reports', 'production_view_dashboard'),
      { user: { role: 'PRODUCTION_SUPERVISOR', permissions: { production_view_dashboard: true } } }
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('requireRoleOrPermission allows delegated permission without role match', () => {
    const { next } = runMiddleware(
      requireRoleOrPermission(['FINANCE'], ['finance_manage_settings']),
      { user: { role: 'CUSTOMER_SERVICE', permissions: { finance_manage_settings: true } } }
    );

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('SUPER_USER bypasses permission gates', () => {
    const { next } = runMiddleware(requirePermission('nonexistent_permission'), {
      user: { role: 'SUPER_USER', permissions: {} },
    });

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('requireStageAccess protects production stage routes', () => {
    const missingStage = runMiddleware(requireStageAccess(), {
      user: { role: 'PRODUCTION_SUPERVISOR', stage_access: null },
    });
    expect(missingStage.res.status).toHaveBeenCalledWith(400);

    const withStage = runMiddleware(requireStageAccess(), {
      user: { role: 'PRODUCTION_SUPERVISOR', stage_access: 3 },
    });
    expect(withStage.next).toHaveBeenCalledTimes(1);
  });

  test('signAccessToken and signRefreshToken tag token types correctly', () => {
    const user = { id: 55, role: 'FINANCE', email: 'finance@example.com', stage_access: null };
    const access = jwt.decode(signAccessToken(user, 700));
    const refresh = jwt.decode(signRefreshToken(user, 700));

    expect(access.tokenType).toBe('access');
    expect(access.sid).toBe(700);
    expect(refresh.tokenType).toBe('refresh');
    expect(refresh.sid).toBe(700);
  });
});
