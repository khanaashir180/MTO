#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const pool = require('../src/config/db');

function checksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function run() {
  const migrationsDir = path.resolve(__dirname, '..', 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
        execution_ms INT NOT NULL DEFAULT 0,
        is_baseline BOOLEAN NOT NULL DEFAULT false
      )
    `);
    const { rows } = await client.query('SELECT filename, checksum, applied_at FROM schema_migrations');
    const applied = new Map(rows.map((row) => [row.filename, row]));
    const pending = [];
    const checksumMismatches = [];

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const currentChecksum = checksum(sql);
      const saved = applied.get(file);
      if (!saved) pending.push(file);
      if (saved && saved.checksum !== currentChecksum) checksumMismatches.push(file);
    }

    const unknownApplied = rows
      .map((row) => row.filename)
      .filter((filename) => !files.includes(filename))
      .sort();

    const status = {
      status: checksumMismatches.length ? 'blocked' : pending.length ? 'pending' : 'current',
      totalMigrationFiles: files.length,
      appliedMigrations: rows.length,
      pendingMigrations: pending,
      checksumMismatches,
      unknownApplied,
    };

    console.log(JSON.stringify(status, null, 2));
    if (checksumMismatches.length) process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(async (error) => {
  console.error(`[migration-status] FAIL ${error.message}`);
  await pool.end().catch(() => {});
  process.exit(1);
});
