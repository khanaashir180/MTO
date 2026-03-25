#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.API_RATE_LIMIT_MAX = process.env.API_RATE_LIMIT_MAX || '10000';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX || '10000';
process.env.API_RATE_LIMIT_WINDOW_MS = process.env.API_RATE_LIMIT_WINDOW_MS || '60000';
process.env.AUTH_RATE_LIMIT_WINDOW_MS = process.env.AUTH_RATE_LIMIT_WINDOW_MS || '60000';

const pool = require('../src/config/db');
const env = require('../src/config/env');

const app = require('../src/app');

const routeFileToBase = {
  'authRoutes.js': '/api/auth',
  'orderRoutes.js': '/api/orders',
  'productionRoutes.js': '/api/production',
  'outletRoutes.js': '/api/outlets',
  'financeRoutes.js': '/api/finance',
  'crmRoutes.js': '/api/crm',
  'mrpRoutes.js': '/api/mrp',
  'rawMaterialStoreRoutes.js': '/api/raw-store',
  'platformRoutes.js': '/api/platform',
};

const publicAuthRoutes = new Set([
  'POST /api/auth/login',
  'POST /api/auth/refresh',
  'POST /api/auth/logout',
  'POST /api/auth/accept-invite',
  'POST /api/auth/confirm-email-change',
]);

function parseRouteDefinitions(fileName, content) {
  const regex = /router\.(get|post|put|delete)\(\s*'([^']+)'/g;
  const rows = [];
  let match = regex.exec(content);
  while (match) {
    rows.push({
      method: match[1].toUpperCase(),
      routePath: match[2],
      fileName,
    });
    match = regex.exec(content);
  }
  return rows;
}

function normalizePath(pathname) {
  return pathname
    .replace(/:fileName\b/g, 'missing-report.json')
    .replace(/:role\b/g, 'SUPER_USER')
    .replace(/:id\b/g, '1')
    .replace(/:shareId\b/g, '1');
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

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email || `${String(user.role || 'user').toLowerCase()}@qa.local`,
      tokenType: 'access',
      stageAccess: user.stage_access || null,
    },
    env.jwtSecret,
    { expiresIn: '2h' }
  );
}

function shouldTreatAsProtected(routeKey) {
  return !publicAuthRoutes.has(routeKey);
}

function isPassStatus(status, allowedList) {
  return allowedList.includes(status);
}

function authPassStatus(status) {
  return [200, 201, 202, 204, 400, 401, 403, 404, 405, 409, 422].includes(status);
}

async function runRequest({ method, url, token, idempotent = false, body = {} }) {
  let req = request(app)[method.toLowerCase()](url);
  req = req
    .set('X-Request-Id', `qa-route-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
    .set('X-Forwarded-For', `10.200.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`);
  if (token) {
    req = req.set('Authorization', `Bearer ${token}`);
  }
  if (idempotent && ['POST', 'PUT', 'DELETE'].includes(method)) {
    req = req.set('Idempotency-Key', `qa-matrix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }
  if (['POST', 'PUT', 'DELETE'].includes(method)) {
    req = req.send(body);
  }
  return req;
}

async function run() {
  const startedAt = new Date().toISOString();
  const routesDir = path.resolve(__dirname, '..', 'src', 'routes');
  const files = fs.readdirSync(routesDir).filter((name) => routeFileToBase[name]);

  const discovered = [];
  files.forEach((fileName) => {
    const base = routeFileToBase[fileName];
    const content = fs.readFileSync(path.join(routesDir, fileName), 'utf8');
    const defs = parseRouteDefinitions(fileName, content).map((item) => ({
      ...item,
      base,
      fullPath: `${base}${item.routePath}`.replace(/\/+/g, '/'),
    }));
    discovered.push(...defs);
  });

  const users = {
    super: await pickUser('SUPER_USER'),
    retail: await pickUser('RETAIL'),
    finance: await pickUser('FINANCE'),
    productionManager: await pickUser('PRODUCTION_MANAGER'),
    productionSupervisor: await pickUser('PRODUCTION_SUPERVISOR'),
  };
  if (!users.super) {
    throw new Error('SUPER_USER user is required for QA matrix audit.');
  }
  const tokens = Object.fromEntries(
    Object.entries(users)
      .filter(([, user]) => Boolean(user))
      .map(([k, user]) => [k, signToken(user)])
  );

  const results = [];
  for (const route of discovered) {
    const normalized = normalizePath(route.fullPath);
    const routeKey = `${route.method} ${route.base}${route.routePath}`;
    const protectedRoute = shouldTreatAsProtected(routeKey);

    // A) Unauthorized check
    const unauthRes = await runRequest({
      method: route.method,
      url: normalized,
      token: null,
      idempotent: true,
    });
    const unauthStatus = Number(unauthRes.status);
    const unauthPass = protectedRoute
      ? isPassStatus(unauthStatus, [401, 403, 429])
      : ![500].includes(unauthStatus);
    results.push({
      phase: 'unauthorized',
      route: routeKey,
      file: route.fileName,
      status: unauthPass ? 'PASS' : 'FAIL',
      httpStatus: unauthStatus,
      details: unauthPass ? 'ok' : (unauthRes.body?.message || 'unexpected unauthorized status'),
    });

    // B) Super-user functional check
    const authRes = await runRequest({
      method: route.method,
      url: normalized,
      token: tokens.super,
      idempotent: true,
    });
    const authStatusCode = Number(authRes.status);
    const authPass = authPassStatus(authStatusCode);
    results.push({
      phase: 'superuser',
      route: routeKey,
      file: route.fileName,
      status: authPass ? 'PASS' : 'FAIL',
      httpStatus: authStatusCode,
      details: authPass ? 'ok' : (authRes.body?.message || 'unexpected authenticated status'),
    });
  }

  const failed = results.filter((row) => row.status === 'FAIL');
  const summary = {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    discovered_routes: discovered.length,
    total_checks: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    success_rate_pct: results.length ? Math.round(((results.length - failed.length) / results.length) * 100) : 0,
  };

  console.log(JSON.stringify({ summary, failed, results }, null, 2));
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error(JSON.stringify({ error: error.message }, null, 2));
  process.exitCode = 1;
});
