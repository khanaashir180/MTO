#!/usr/bin/env node
'use strict';

const { spawnSync, spawn } = require('child_process');
const path = require('path');

const serverDir = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const useShell = process.platform === 'win32';

function run(label, args) {
  console.log(`[railway-start] ${label}`);
  const result = spawnSync(npmCommand, args, {
    cwd: serverDir,
    stdio: 'inherit',
    shell: useShell,
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`[railway-start] FAIL ${label} exited with ${result.status}`);
    process.exit(result.status || 1);
  }
}

run('migrations', ['run', 'migrate']);

if (process.env.RAILWAY_RUN_DATA_AUDIT === 'true') {
  run('data audit', ['run', 'audit:data']);
}

console.log('[railway-start] starting application');
const child = spawn(npmCommand, ['run', 'start'], {
  cwd: serverDir,
  stdio: 'inherit',
  shell: useShell,
  env: process.env,
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[railway-start] app exited via signal ${signal}`);
    process.exit(1);
  }
  process.exit(code || 0);
});
