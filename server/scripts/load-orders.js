#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');

const BASE_URL = (process.env.LOAD_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const TOTAL = Number(process.env.LOAD_TOTAL_ORDERS || 1000);
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY || 100);
const EMAIL = process.env.LOAD_LOGIN_EMAIL || 'shopmanager@example.com';
const PASSWORD = process.env.LOAD_LOGIN_PASSWORD || 'password123';

function request(method, pathname, { token, body, idempotencyKey, expected = [200, 201] } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE_URL);
    const isMultipart = body && body.__multipart;
    const payload = isMultipart ? Buffer.from(body.payload) : body ? Buffer.from(JSON.stringify(body)) : null;
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        method,
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers: {
          Accept: 'application/json',
          ...(payload && isMultipart ? { 'Content-Type': `multipart/form-data; boundary=${body.boundary}`, 'Content-Length': payload.length } : {}),
          ...(payload && !isMultipart ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        timeout: Number(process.env.LOAD_TIMEOUT_MS || 30000),
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (!expected.includes(res.statusCode)) {
            return reject(new Error(`${method} ${pathname} returned ${res.statusCode}: ${text.slice(0, 200)}`));
          }
          resolve(text);
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error(`${method} ${pathname} timed out`)));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function multipart(fields) {
  const boundary = `mto-load-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const payload = Object.entries(fields)
    .map(([key, value]) => `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`)
    .join('') + `--${boundary}--\r\n`;
  return { __multipart: true, boundary, payload };
}

function futureDate(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function worker(token, queue, results) {
  while (queue.length) {
    const index = queue.shift();
    const suffix = String(index).padStart(6, '0');
    const started = Date.now();
    try {
      await request('POST', '/api/orders', {
        token,
        idempotencyKey: `load-order-${Date.now()}-${index}`,
        body: multipart({
          customerName: `Load Test Customer ${suffix}`,
          customerCountryCode: '+92',
          customerNumber: `349${suffix}`,
          customerAddress: 'Load test billing address',
          deliveryAddress: 'Load test delivery address',
          orderDate: futureDate(0),
          dueDate: futureDate(30),
          orderedFrom: 'Outlet 1',
          productPrice: '50000',
          advancePaid: '0',
          orderType: 'MTO',
          productionFlow: 'MTO',
          productName: 'Load test shoe',
          size: '42',
          colour: 'Black',
          sole: 'Rubber',
        }),
      });
      results.ok += 1;
      results.latencies.push(Date.now() - started);
    } catch (err) {
      results.failed += 1;
      results.errors.push(err.message);
    }
  }
}

async function run() {
  console.log(`[load] Target=${BASE_URL} total=${TOTAL} concurrency=${CONCURRENCY}`);
  const loginText = await request('POST', '/api/auth/login', { body: { email: EMAIL, password: PASSWORD } });
  const token = JSON.parse(loginText).token;
  if (!token) throw new Error('Login did not return token');

  const queue = Array.from({ length: TOTAL }, (_, i) => i + 1);
  const results = { ok: 0, failed: 0, latencies: [], errors: [] };
  const started = Date.now();
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, TOTAL) }, () => worker(token, queue, results)));
  const elapsedMs = Date.now() - started;
  const sorted = results.latencies.slice().sort((a, b) => a - b);
  const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
  const rate = elapsedMs ? (results.ok / (elapsedMs / 1000)).toFixed(1) : results.ok;

  console.log(`[load] ok=${results.ok} failed=${results.failed} elapsedMs=${elapsedMs} ratePerSec=${rate} p95Ms=${p95}`);
  if (results.errors.length) {
    console.error(`[load] first errors: ${results.errors.slice(0, 5).join(' | ')}`);
  }
  if (results.failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error(`[load] FAIL ${err.message}`);
  process.exit(1);
});
