#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const pool = require('../src/config/db');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const useShell = process.platform === 'win32';

const REQUIRED_ENV = [
  'DATABASE_URL',
  'JWT_SECRET',
];

function runStep(label, command, args, options = {}) {
  console.log(`[railway-preflight] ${label}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: useShell,
    cwd: require('path').resolve(__dirname, '..'),
    env: process.env,
    ...options,
  });
  if (result.error) {
    throw new Error(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
}

async function checkEnvironment() {
  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (String(process.env.JWT_SECRET || '').length < 32) {
    missing.push('JWT_SECRET(minimum 32 chars)');
  }
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  if (!process.env.CLIENT_ORIGIN) {
    console.log('[railway-preflight] WARNING CLIENT_ORIGIN not set; default CORS origin will be used.');
  }
  if (!process.env.METRICS_TOKEN) {
    console.log('[railway-preflight] WARNING METRICS_TOKEN not set; /metrics will remain inaccessible until configured.');
  }
}

async function checkDatabase() {
  const timeoutMs = Number(process.env.RAILWAY_PREFLIGHT_DB_TIMEOUT_MS || 30000);
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const { rows } = await pool.query('SELECT NOW() AS now, current_database() AS database');
      console.log(`[railway-preflight] DB connected to ${rows[0].database} at ${rows[0].now.toISOString()}`);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error(`Database connection failed before startup: ${lastError?.message || 'unknown error'}`);
}

async function run() {
  console.log('[railway-preflight] Starting Railway preflight checks');
  await checkEnvironment();
  await checkDatabase();
  await pool.end();

  runStep('migration audit', npmCommand, ['run', 'audit:migrations']);
  runStep('migration status', npmCommand, ['run', 'migration:status']);
  runStep('backup verification gate', npmCommand, ['run', 'pre-deploy-check']);
  console.log('[railway-preflight] PASS release can continue');
}

run().catch(async (error) => {
  console.error(`[railway-preflight] FAIL ${error.message}`);
  await pool.end().catch(() => {});
  process.exit(1);
});
