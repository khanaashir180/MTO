#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const backupDir = path.resolve(__dirname, '..', 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.resolve(backupDir, `mto-backup-${timestamp}.dump`);

const proc = spawn('pg_dump', ['--format=custom', '--file', backupFile, databaseUrl], {
  stdio: 'inherit',
  shell: true,
});

proc.on('close', (code) => {
  if (code !== 0) {
    process.exit(code || 1);
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`Backup created: ${backupFile}`);
});
