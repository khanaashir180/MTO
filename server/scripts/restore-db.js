#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;
const backupFile = process.argv[2];

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}
if (!backupFile) {
  throw new Error('Usage: node scripts/restore-db.js <backup-file>');
}

const resolvedBackup = path.resolve(process.cwd(), backupFile);
const proc = spawn(
  'pg_restore',
  ['--clean', '--if-exists', '--no-owner', '--no-privileges', '--dbname', databaseUrl, resolvedBackup],
  {
    stdio: 'inherit',
    shell: true,
  }
);

proc.on('close', (code) => {
  process.exit(code || 0);
});
