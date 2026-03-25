#!/usr/bin/env node
/* eslint-disable no-console */
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/config/db');
const env = require('../src/config/env');

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email || `${user.role.toLowerCase()}@qa.local`,
      tokenType: 'access',
      stageAccess: user.stage_access || null,
    },
    env.jwtSecret,
    { expiresIn: '2h' }
  );
}

async function pickUser(role) {
  const { rows } = await pool.query(
    `SELECT u.id, u.email, u.stage_access, r.name AS role
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.name = $1
       AND COALESCE(u.is_active, true) = true
     ORDER BY u.id ASC
     LIMIT 1`,
    [role]
  );
  return rows[0] || null;
}

async function createScanOrder(stageId, actorId) {
  const runKey = `QA${Date.now()}`;
  const prodNo = `QA-SCAN-${runKey}`;
  const barcode = `QA-BC-${runKey}`;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const insertOrder = await pool.query(
    `INSERT INTO orders (
       production_order_no, customer_name, customer_number, customer_address,
       ordered_from, order_date, due_date, status, current_stage_id, created_by, production_flow
     )
     VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6::date,'PENDING',$7,$8,'BESPOKE')
     RETURNING id`,
    [prodNo, 'QA Scan User', '03001234567', 'QA Address', 'Online', dueDate.toISOString().slice(0, 10), stageId, actorId]
  );
  const orderId = Number(insertOrder.rows[0].id);
  await pool.query(
    `INSERT INTO order_products (
       order_id, product_name, size, colour, last_number, sole, upper_material, lining_material, edge_colour, socks, welt, stamp, barcode
     )
     VALUES ($1,'QA Shoe','42','Black','LN','SOLE','UPPER','LINING','EDGE','SOCKS','WELT','STAMP',$2)`,
    [orderId, barcode]
  );
  return { orderId, barcode };
}

async function run() {
  const startedAt = new Date().toISOString();
  const results = [];
  const created = {};

  const users = {
    super: await pickUser('SUPER_USER'),
    finance: await pickUser('FINANCE'),
    retail: await pickUser('RETAIL'),
    productionManager: await pickUser('PRODUCTION_MANAGER'),
    productionSupervisor: await pickUser('PRODUCTION_SUPERVISOR'),
    customerService: await pickUser('CUSTOMER_SERVICE'),
    shopManager: await pickUser('SHOP_MANAGER'),
  };

  const tokens = Object.fromEntries(
    Object.entries(users)
      .filter(([, user]) => Boolean(user))
      .map(([key, user]) => [key, signToken(user)])
  );

  if (!users.super || !users.finance || !users.retail || !users.productionManager || !users.productionSupervisor) {
    throw new Error('Required QA users are missing. Need SUPER_USER, FINANCE, RETAIL, PRODUCTION_MANAGER, PRODUCTION_SUPERVISOR.');
  }

  const stageId = Number(users.productionSupervisor.stage_access || 0);
  if (!stageId) {
    throw new Error('PRODUCTION_SUPERVISOR user has no stage_access assigned.');
  }

  const scanSeed = await createScanOrder(stageId, users.super.id);
  created.scanOrderId = scanSeed.orderId;
  created.scanBarcode = scanSeed.barcode;

  const checks = [
    { id: 'HEALTH-1', actor: null, method: 'get', path: '/health', ok: [200] },
    { id: 'AUTH-1', actor: 'super', method: 'get', path: '/api/auth/users', ok: [200] },
    { id: 'PLATFORM-1', actor: 'super', method: 'get', path: '/api/platform/health/dependencies', ok: [200] },
    { id: 'PLATFORM-2', actor: 'productionManager', method: 'get', path: '/api/platform/workflow-validation/reports?limit=5', ok: [200] },
    { id: 'PLATFORM-3', actor: 'super', method: 'post', path: '/api/platform/workflow-validation/run', ok: [200] },
    { id: 'ORDER-1', actor: 'retail', method: 'get', path: '/api/orders/retail-dashboard', ok: [200] },
    { id: 'ORDER-2', actor: 'retail', method: 'get', path: '/api/orders/sales-report', ok: [200] },
    { id: 'ORDER-3', actor: 'retail', method: 'get', path: '/api/orders/store-delivery-dashboard', ok: [200] },
    { id: 'ORDER-4', actor: 'shopManager', method: 'get', path: '/api/orders/retail-dashboard', ok: [200], optionalActor: true },
    { id: 'PROD-1', actor: 'productionManager', method: 'get', path: '/api/production/flow-summary', ok: [200] },
    { id: 'PROD-2', actor: 'productionManager', method: 'get', path: '/api/production/board', ok: [200] },
    { id: 'PROD-3', actor: 'productionManager', method: 'get', path: '/api/production/reports/performance', ok: [200] },
    { id: 'PROD-4', actor: 'productionSupervisor', method: 'get', path: '/api/production/summary', ok: [200] },
    { id: 'PROD-5', actor: 'productionSupervisor', method: 'get', path: '/api/production/assigned', ok: [200] },
    { id: 'PROD-6', actor: 'productionSupervisor', method: 'post', path: '/api/production/scan', ok: [200], body: () => ({ barcode: created.scanBarcode }), idem: true },
    { id: 'FIN-1', actor: 'finance', method: 'get', path: '/api/finance/accounts', ok: [200] },
    { id: 'FIN-2', actor: 'finance', method: 'get', path: '/api/finance/trial-balance', ok: [200] },
    { id: 'FIN-3', actor: 'finance', method: 'get', path: '/api/finance/payment-accounts', ok: [200] },
    { id: 'FIN-4', actor: 'finance', method: 'get', path: '/api/finance/dashboard/overview', ok: [200] },
    { id: 'CRM-1', actor: 'customerService', method: 'get', path: '/api/crm/summary', ok: [200], optionalActor: true },
    { id: 'CRM-2', actor: 'customerService', method: 'get', path: '/api/crm/tasks', ok: [200], optionalActor: true },
    { id: 'CRM-3', actor: 'customerService', method: 'get', path: '/api/crm/cases', ok: [200], optionalActor: true },
    { id: 'CRM-4', actor: 'customerService', method: 'get', path: '/api/crm/platform/runtime', ok: [200], optionalActor: true },
    { id: 'MRP-1', actor: 'super', method: 'get', path: '/api/mrp/dashboard', ok: [200] },
    { id: 'RAW-1', actor: 'super', method: 'get', path: '/api/raw-store/overview', ok: [200] },
  ];

  for (const check of checks) {
    const actorToken = check.actor ? tokens[check.actor] : null;
    if (check.actor && !actorToken) {
      if (check.optionalActor) {
        results.push({ id: check.id, status: 'SKIPPED', httpStatus: null, details: `Missing actor ${check.actor}` });
        continue;
      }
      results.push({ id: check.id, status: 'FAIL', httpStatus: null, details: `Missing actor ${check.actor}` });
      continue;
    }

    let req = request(app)[check.method](check.path);
    if (actorToken) {
      req = req.set('Authorization', `Bearer ${actorToken}`);
    }
    if (check.idem) {
      req = req.set('Idempotency-Key', `qa-${check.id}-${Date.now()}`);
    }
    if (typeof check.body === 'function') {
      req = req.send(check.body());
    } else if (check.body) {
      req = req.send(check.body);
    }

    const res = await req;
    const status = Number(res.status);
    const isServerError = status >= 500;
    const statusAccepted = check.ok.includes(status);
    const pass = !isServerError && statusAccepted;
    results.push({
      id: check.id,
      status: pass ? 'PASS' : 'FAIL',
      httpStatus: status,
      details: pass ? 'ok' : (res.body?.message || 'unexpected status'),
    });
  }

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIPPED').length;
  const summary = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    total: results.length,
    passed,
    failed,
    skipped,
    success_rate_pct: results.length ? Math.round((passed / results.length) * 100) : 0,
  };

  console.log(JSON.stringify({ summary, results, created }, null, 2));
  if (failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
});
