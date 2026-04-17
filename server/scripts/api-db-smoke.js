#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');

const BASE_URL = (process.env.API_DB_SMOKE_BASE_URL || process.env.SMOKE_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');

function getJson(pathname, expected = [200]) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE_URL);
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        method: 'GET',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        headers: { Accept: 'application/json' },
        timeout: Number(process.env.API_DB_SMOKE_TIMEOUT_MS || 10000),
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (!expected.includes(res.statusCode)) {
            return reject(new Error(`${pathname} returned ${res.statusCode}: ${text.slice(0, 300)}`));
          }
          try {
            resolve(JSON.parse(text));
          } catch (error) {
            reject(new Error(`${pathname} returned invalid JSON: ${error.message}`));
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error(`${pathname} timed out`)));
    req.on('error', reject);
    req.end();
  });
}

async function run() {
  console.log(`[api-db-smoke] Target: ${BASE_URL}`);
  const health = await getJson('/health');
  if (health.ok !== true) throw new Error('/health did not return ok=true');

  const ready = await getJson('/ready');
  if (ready.ok !== true || ready.status !== 'READY') {
    throw new Error(`/ready is not ready: ${JSON.stringify(ready).slice(0, 500)}`);
  }
  if (ready.database?.status !== 'UP') {
    throw new Error(`Database status is not UP: ${ready.database?.status}`);
  }
  if (ready.database?.tables?.missing?.length) {
    throw new Error(`Missing required DB tables: ${ready.database.tables.missing.join(', ')}`);
  }
  if (!Number.isFinite(Number(ready.database?.migration?.applied_count))) {
    throw new Error('Migration applied_count is missing from /ready');
  }

  console.log(`[api-db-smoke] PASS api connected to PostgreSQL (${ready.database.database}) with ${ready.database.migration.applied_count} migrations`);
}

run().catch((error) => {
  console.error(`[api-db-smoke] FAIL ${error.message}`);
  process.exit(1);
});
