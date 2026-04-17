#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');

const BASE_URL = (process.env.SMOKE_BASE_URL || process.env.PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, '');
const LOGIN_EMAIL = process.env.SMOKE_LOGIN_EMAIL || 'super@example.com';
const LOGIN_PASSWORD = process.env.SMOKE_LOGIN_PASSWORD || 'password123';
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
        timeout: Number(process.env.SMOKE_TIMEOUT_MS || 10000),
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

async function run() {
  console.log(`[smoke] Target: ${BASE_URL}`);
  const health = await requestJson('GET', '/health');
  if (!health.ok) throw new Error('/health did not return ok=true');

  const login = await requestJson('POST', '/api/auth/login', {
    body: { email: LOGIN_EMAIL, password: LOGIN_PASSWORD },
  });
  if (!login.token) throw new Error('Login did not return a token');

  await requestJson('GET', '/api/v1/orders', { token: login.token });
  await requestJson('GET', '/api/v1/finance/dashboard', { token: login.token, expected: [200, 404] });
  await requestJson('GET', '/api/v1/crm', { token: login.token, expected: [200, 404] });

  if (METRICS_TOKEN) {
    await new Promise((resolve, reject) => {
      const url = new URL('/metrics', BASE_URL);
      const transport = url.protocol === 'https:' ? https : http;
      const req = transport.request(
        {
          method: 'GET',
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          headers: { Authorization: `Bearer ${METRICS_TOKEN}` },
          timeout: Number(process.env.SMOKE_TIMEOUT_MS || 10000),
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode !== 200) return reject(new Error(`/metrics returned ${res.statusCode}`));
            if (!body.includes('mto_db_pool_total')) return reject(new Error('/metrics is missing DB pool gauges'));
            resolve();
          });
        }
      );
      req.on('timeout', () => req.destroy(new Error('/metrics timed out')));
      req.on('error', reject);
      req.end();
    });
  }

  console.log('[smoke] PASS critical endpoints are healthy');
}

run().catch((err) => {
  console.error(`[smoke] FAIL ${err.message}`);
  process.exit(1);
});
