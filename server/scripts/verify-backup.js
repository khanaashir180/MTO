#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const backupDir = path.resolve(__dirname, '..', 'backups');
if (!fs.existsSync(backupDir)) {
  throw new Error('Backup directory does not exist');
}

const backups = fs.readdirSync(backupDir)
  .filter((name) => name.endsWith('.dump'))
  .sort()
  .reverse();

if (!backups.length) {
  throw new Error('No backup files found');
}

const latest = path.resolve(backupDir, backups[0]);
const result = spawnSync('pg_restore', ['--list', latest], { stdio: 'pipe', encoding: 'utf8', shell: true });
if (result.status !== 0) {
  // eslint-disable-next-line no-console
  console.error(result.stderr || result.stdout || 'Backup verification failed');
  process.exit(result.status || 1);
}

// eslint-disable-next-line no-console
console.log(`Backup verified: ${latest}`);
