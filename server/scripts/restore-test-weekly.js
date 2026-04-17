#!/usr/bin/env node
'use strict';

const { spawnSync } = require('child_process');

const dumpPath = process.env.RESTORE_TEST_DUMP;
const restoreUrl = process.env.RESTORE_TEST_DATABASE_URL;

if (!dumpPath || !restoreUrl) {
  console.error('[restore-test] RESTORE_TEST_DUMP and RESTORE_TEST_DATABASE_URL are required');
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log('[restore-test] verifying dump catalog');
run('pg_restore', ['--list', dumpPath]);

console.log('[restore-test] restoring into isolated restore-test database');
run('pg_restore', ['--clean', '--if-exists', '--no-owner', '--dbname', restoreUrl, dumpPath]);

console.log('[restore-test] running migration audit after restore');
const env = { ...process.env, DATABASE_URL: restoreUrl };
const result = spawnSync('node', ['scripts/audit-migrations.js'], {
  stdio: 'inherit',
  shell: true,
  env,
  cwd: require('path').resolve(__dirname, '..'),
});
if (result.status !== 0) process.exit(result.status || 1);

console.log('[restore-test] PASS backup can be restored and audited');
