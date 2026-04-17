#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');

const BASE_URL = (process.env.BACKEND_SMOKE_BASE_URL || process.env.SMOKE_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const EMAIL = process.env.BACKEND_SMOKE_EMAIL || 'super@example.com';
const PASSWORD = process.env.BACKEND_SMOKE_PASSWORD || 'password123';
const METRICS_TOKEN = process.env.METRICS_TOKEN || '';

function requestJson(method, pathname, { token, body, expected = [200] } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE_URL);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        method,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers: {
          Accept: 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: Number(process.env.BACKEND_SMOKE_TIMEOUT_MS || 10000),
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (!expected.includes(res.statusCode)) {
            return reject(new Error(`${method} ${pathname} returned ${res.statusCode}: ${text.slice(0, 300)}`));
          }
          try {
            resolve(text ? JSON.parse(text) : {});
          } catch {
            resolve({ raw: text });
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error(`${method} ${pathname} timed out`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function requestText(pathname, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE_URL);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        method: 'GET',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: Number(process.env.BACKEND_SMOKE_TIMEOUT_MS || 10000),
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode !== 200) return reject(new Error(`${pathname} returned ${res.statusCode}: ${text.slice(0, 200)}`));
          resolve(text);
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error(`${pathname} timed out`)));
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log(`[backend-smoke] Target: ${BASE_URL}`);
  const ready = await requestJson('GET', '/ready');
  if (!ready.ok || ready.database?.status !== 'UP') throw new Error('/ready failed backend dependency readiness');

  const login = await requestJson('POST', '/api/auth/login', {
    body: { email: EMAIL, password: PASSWORD },
  });
  if (!login.token) throw new Error('Login did not return a token');

  const checks = [
    ['/api/v1/orders/retail-dashboard', (body) => body && typeof body === 'object'],
    ['/api/v1/finance/accounts', (body) => Array.isArray(body.accounts)],
    ['/api/v1/crm/summary', (body) => body && typeof body === 'object'],
    ['/api/v1/platform/health/dependencies', (body) => body.status === 'HEALTHY' && body.dependencies?.database?.status === 'UP'],
  ];

  for (const [pathname, assertBody] of checks) {
    const body = await requestJson('GET', pathname, { token: login.token });
    if (!assertBody(body)) throw new Error(`${pathname} returned unexpected shape`);
    console.log(`[backend-smoke] PASS ${pathname}`);
  }

  if (METRICS_TOKEN) {
    const metrics = await requestText('/metrics', METRICS_TOKEN);
    for (const metric of ['mto_http_requests_total', 'mto_db_pool_total', 'mto_db_pool_idle', 'mto_db_pool_waiting']) {
      if (!metrics.includes(metric)) throw new Error(`/metrics missing ${metric}`);
    }
    console.log('[backend-smoke] PASS /metrics exposes HTTP and DB pool metrics');
  }

  console.log('[backend-smoke] PASS backend routes, auth, PostgreSQL, and metrics are connected');
}

run().catch((error) => {
  console.error(`[backend-smoke] FAIL ${error.message}`);
  process.exit(1);
});
