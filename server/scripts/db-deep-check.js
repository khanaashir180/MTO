#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const pool = require('../src/config/db');
const { checkDatabaseHealth } = require('../src/services/databaseHealthService');

async function run() {
  const health = await checkDatabaseHealth({ includeTables: true });
  console.log(JSON.stringify({
    status: health.status,
    database: health.database,
    postgres_version: health.postgres_version,
    latency_ms: health.latency_ms,
    migration: health.migration,
    pool: health.pool,
    tables: health.tables,
    columns: health.columns,
    indexes: health.indexes,
    constraints: health.constraints,
    integrity: health.integrity,
  }, null, 2));

  await pool.end();

  if (health.status !== 'UP') {
    console.error(`[db-deep-check] FAIL database status is ${health.status}`);
    process.exit(1);
  }

  if (health.indexes?.missing?.length) {
    console.error(`[db-deep-check] WARN missing non-blocking indexes: ${health.indexes.missing.join(', ')}`);
  }

  console.log('[db-deep-check] PASS PostgreSQL schema and integrity checks passed');
}

run().catch(async (error) => {
  console.error(`[db-deep-check] FAIL ${error.message}`);
  await pool.end().catch(() => {});
  process.exit(1);
});
