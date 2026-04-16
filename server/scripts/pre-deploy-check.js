#!/usr/bin/env node
/**
 * Pre-deployment safety check for MTO production.
 *
 * Runs before every deployment to verify:
 *   1. A valid S3 backup exists and is < 24 hours old
 *   2. Backup file size is within acceptable bounds (1 MB – 10 GB)
 *   3. Backup checksum matches the stored metadata value
 *
 * Exits with code 0 on success, code 1 on any failure.
 * All results are logged for audit trail purposes.
 *
 * When S3 credentials are absent (e.g. local dev / CI without secrets),
 * the check is skipped with a warning rather than blocking the deploy.
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const { verifyLatestS3Backup, listRecentS3Backups } = require('./verify-backup');

const AUDIT_LABEL = '[pre-deploy-check]';

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(`${AUDIT_LABEL} ${new Date().toISOString()} ${msg}`);
}

function logError(msg) {
  // eslint-disable-next-line no-console
  console.error(`${AUDIT_LABEL} ${new Date().toISOString()} FAIL: ${msg}`);
}

function logAudit(label, value) {
  // eslint-disable-next-line no-console
  console.log(`${AUDIT_LABEL} AUDIT  ${label}: ${value}`);
}

async function runChecks() {
  log('Starting pre-deployment checks…');

  // ── Guard: skip gracefully when S3 credentials are not configured ──────────
  const s3Vars = ['BUCKET', 'ENDPOINT', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY'];
  const missingVars = s3Vars.filter((k) => !process.env[k]);
  if (missingVars.length) {
    log(`WARNING: S3 credentials not configured (${missingVars.join(', ')}). Skipping backup verification.`);
    log('Pre-deploy check SKIPPED (no S3 credentials). Deploy may proceed.');
    process.exit(0);
  }

  // ── Check 1: Verify latest backup ─────────────────────────────────────────
  log('CHECK 1/2 – Verifying latest S3 backup integrity…');
  let verifyResult;
  try {
    verifyResult = await verifyLatestS3Backup();
  } catch (err) {
    logError(`Backup verification threw an unexpected error: ${err.message}`);
    logAudit('backup_check', 'ERROR');
    process.exit(1);
  }

  logAudit('backup_key', verifyResult.key || 'N/A');
  logAudit('backup_size_bytes', verifyResult.sizeBytes != null ? verifyResult.sizeBytes : 'N/A');
  logAudit('backup_age_hours', verifyResult.ageHours != null ? verifyResult.ageHours : 'N/A');
  logAudit('backup_checksum', verifyResult.checksum || 'N/A');
  logAudit('backup_message', verifyResult.message);

  if (!verifyResult.ok) {
    logError(`Backup verification FAILED: ${verifyResult.message}`);
    logError('Deployment blocked. Fix the backup issue before deploying.');
    process.exit(1);
  }

  log(`CHECK 1/2 PASSED – ${verifyResult.message}`);

  // ── Check 2: List recent backups for audit trail ───────────────────────────
  log('CHECK 2/2 – Listing recent backups for audit trail…');
  let recentBackups;
  try {
    recentBackups = await listRecentS3Backups(5);
  } catch (err) {
    // Non-fatal: listing is informational only
    log(`WARNING: Could not list recent backups: ${err.message}`);
    recentBackups = [];
  }

  if (recentBackups.length) {
    log(`Recent backups (newest first):`);
    recentBackups.forEach((b, i) => {
      const age = b.lastModified
        ? `${Math.round((Date.now() - b.lastModified.getTime()) / 3600000)}h ago`
        : 'unknown age';
      const sizeMb = b.sizeBytes ? `${(b.sizeBytes / 1024 / 1024).toFixed(1)} MB` : 'unknown size';
      log(`  ${i + 1}. ${b.key} (${sizeMb}, ${age})`);
    });
  } else {
    log('No recent backups found to list.');
  }

  log('CHECK 2/2 PASSED');

  // ── All checks passed ──────────────────────────────────────────────────────
  log('All pre-deployment checks PASSED. Deployment may proceed.');
  logAudit('pre_deploy_result', 'PASS');
  logAudit('pre_deploy_timestamp', new Date().toISOString());
  process.exit(0);
}

runChecks().catch((err) => {
  logError(`Unhandled error in pre-deploy checks: ${err.message || String(err)}`);
  process.exit(1);
});
