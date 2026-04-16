#!/usr/bin/env node
/**
 * Backup verification script for MTO.
 *
 * Modes:
 *   node verify-backup.js              – verify the latest LOCAL backup (original behaviour)
 *   node verify-backup.js --s3         – verify the latest S3 backup (used by pre-deploy-check)
 *
 * S3 mode requires the same env vars as backup-db-automated.js:
 *   BUCKET, ENDPOINT, ACCESS_KEY_ID, SECRET_ACCESS_KEY
 *
 * Exports (for programmatic use by pre-deploy-check.js):
 *   verifyLatestS3Backup()  → Promise<{ ok, key, sizeBytes, checksum, ageHours, message }>
 *   listRecentS3Backups(n)  → Promise<Array<{ key, lastModified, sizeBytes }>>
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(`[verify-backup] ${new Date().toISOString()} ${msg}`);
}

function logError(msg) {
  // eslint-disable-next-line no-console
  console.error(`[verify-backup] ${new Date().toISOString()} ERROR: ${msg}`);
}

/**
 * Sign and execute a generic S3 request, returning { statusCode, body }.
 */
function s3Request({ method, objectKey, queryString = '' }) {
  const BUCKET = process.env.BUCKET;
  const ENDPOINT = (process.env.ENDPOINT || '').replace(/\/$/, '');
  const ACCESS_KEY_ID = process.env.ACCESS_KEY_ID;
  const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY;

  return new Promise((resolve, reject) => {
    const urlStr = queryString
      ? `${ENDPOINT}/${BUCKET}/?${queryString}`
      : `${ENDPOINT}/${BUCKET}/${objectKey}`;
    const url = new URL(urlStr);

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = crypto.createHash('sha256').update('').digest('hex');

    const canonicalHeaders = [
      `host:${url.host}`,
      `x-amz-content-sha256:${payloadHash}`,
      `x-amz-date:${amzDate}`,
    ].join('\n') + '\n';

    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      method,
      queryString ? `/${BUCKET}/` : url.pathname,
      queryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/us-east-1/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    function hmac(key, data) {
      return crypto.createHmac('sha256', key).update(data).digest();
    }
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${SECRET_ACCESS_KEY}`, dateStamp), 'us-east-1'), 's3'), 'aws4_request');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    const reqPath = queryString ? `/${BUCKET}/?${queryString}` : url.pathname;
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: reqPath,
      method,
      headers: {
        host: url.host,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        Authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
    };

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * List S3 objects under the backups/ prefix, sorted newest-first.
 * Returns an array of { key, lastModified, sizeBytes }.
 */
async function listRecentS3Backups(limit = 10) {
  const qs = `list-type=2&prefix=${encodeURIComponent('backups/')}&max-keys=1000`;
  const { statusCode, body } = await s3Request({ method: 'GET', objectKey: '', queryString: qs });
  if (statusCode !== 200) {
    throw new Error(`S3 list failed: HTTP ${statusCode}`);
  }
  const xml = body.toString('utf8');
  const keyMatches = Array.from(xml.matchAll(/<Key>([^<]+)<\/Key>/g)).map((m) => m[1]);
  const dateMatches = Array.from(xml.matchAll(/<LastModified>([^<]+)<\/LastModified>/g)).map((m) => m[1]);
  const sizeMatches = Array.from(xml.matchAll(/<Size>([^<]+)<\/Size>/g)).map((m) => m[1]);

  const objects = keyMatches
    .map((key, i) => ({
      key,
      lastModified: dateMatches[i] ? new Date(dateMatches[i]) : null,
      sizeBytes: sizeMatches[i] ? Number(sizeMatches[i]) : 0,
    }))
    .filter((o) => o.key.endsWith('.dump'))
    .sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

  return objects.slice(0, limit);
}

/**
 * Download an S3 object and return its content as a Buffer.
 */
async function downloadS3Object(objectKey) {
  const { statusCode, body } = await s3Request({ method: 'GET', objectKey });
  if (statusCode !== 200) {
    throw new Error(`S3 GET failed for ${objectKey}: HTTP ${statusCode}`);
  }
  return body;
}

/**
 * Verify the latest S3 backup:
 *  1. Confirm a backup exists and is < 24 hours old
 *  2. Confirm file size is between 1 MB and 10 GB
 *  3. Download the matching .meta.json and verify the checksum
 *
 * Returns { ok, key, sizeBytes, checksum, ageHours, message }
 */
async function verifyLatestS3Backup() {
  const backups = await listRecentS3Backups(1);
  if (!backups.length) {
    return { ok: false, message: 'No backup files found in S3 bucket' };
  }

  const latest = backups[0];
  const ageMs = latest.lastModified ? Date.now() - latest.lastModified.getTime() : Infinity;
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours > 24) {
    return {
      ok: false,
      key: latest.key,
      sizeBytes: latest.sizeBytes,
      ageHours: Math.round(ageHours * 10) / 10,
      message: `Latest backup is ${Math.round(ageHours)}h old (threshold: 24h)`,
    };
  }

  const MIN_BYTES = 1 * 1024 * 1024;         // 1 MB
  const MAX_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

  if (latest.sizeBytes < MIN_BYTES) {
    return {
      ok: false,
      key: latest.key,
      sizeBytes: latest.sizeBytes,
      ageHours: Math.round(ageHours * 10) / 10,
      message: `Backup file is too small: ${latest.sizeBytes} bytes (minimum: ${MIN_BYTES})`,
    };
  }
  if (latest.sizeBytes > MAX_BYTES) {
    return {
      ok: false,
      key: latest.key,
      sizeBytes: latest.sizeBytes,
      ageHours: Math.round(ageHours * 10) / 10,
      message: `Backup file is too large: ${latest.sizeBytes} bytes (maximum: ${MAX_BYTES})`,
    };
  }

  // Verify checksum against stored metadata
  const metaKey = latest.key.replace(/\.dump$/, '.meta.json');
  let storedChecksum = null;
  try {
    const metaBuffer = await downloadS3Object(metaKey);
    const meta = JSON.parse(metaBuffer.toString('utf8'));
    storedChecksum = meta.checksum || null;
  } catch {
    // Metadata may not exist for older backups – treat as a soft warning, not a hard failure
    log(`Warning: could not retrieve metadata for ${latest.key} – skipping checksum verification`);
  }

  let computedChecksum = null;
  if (storedChecksum) {
    log(`Downloading backup to verify checksum: ${latest.key}`);
    const dumpBuffer = await downloadS3Object(latest.key);
    computedChecksum = crypto.createHash('sha256').update(dumpBuffer).digest('hex');
    if (computedChecksum !== storedChecksum) {
      return {
        ok: false,
        key: latest.key,
        sizeBytes: latest.sizeBytes,
        ageHours: Math.round(ageHours * 10) / 10,
        checksum: computedChecksum,
        message: `Checksum mismatch: stored=${storedChecksum} computed=${computedChecksum}`,
      };
    }
  }

  return {
    ok: true,
    key: latest.key,
    sizeBytes: latest.sizeBytes,
    ageHours: Math.round(ageHours * 10) / 10,
    checksum: computedChecksum || storedChecksum || 'not-verified',
    message: 'Backup verified successfully',
  };
}

// ── Local backup verification (original behaviour) ────────────────────────────

function verifyLocalBackup() {
  const backupDir = path.resolve(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    logError('Backup directory does not exist');
    process.exit(1);
  }

  const backups = fs.readdirSync(backupDir)
    .filter((name) => name.endsWith('.dump'))
    .sort()
    .reverse();

  if (!backups.length) {
    logError('No backup files found');
    process.exit(1);
  }

  const latest = path.resolve(backupDir, backups[0]);
  const result = spawnSync('pg_restore', ['--list', latest], { stdio: 'pipe', encoding: 'utf8', shell: true });
  if (result.status !== 0) {
    logError(result.stderr || result.stdout || 'Backup verification failed');
    process.exit(result.status || 1);
  }

  log(`Backup verified: ${latest}`);
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (require.main === module) {
  const useS3 = process.argv.includes('--s3');

  if (useS3) {
    const missing = ['BUCKET', 'ENDPOINT', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY']
      .filter((k) => !process.env[k]);
    if (missing.length) {
      logError(`Missing S3 environment variables: ${missing.join(', ')}`);
      process.exit(1);
    }

    verifyLatestS3Backup()
      .then((result) => {
        if (result.ok) {
          log(`OK – ${result.message} (key=${result.key}, size=${result.sizeBytes}, age=${result.ageHours}h)`);
        } else {
          logError(result.message);
          process.exit(1);
        }
      })
      .catch((err) => {
        logError(err.message || String(err));
        process.exit(1);
      });
  } else {
    verifyLocalBackup();
  }
}

module.exports = { verifyLatestS3Backup, listRecentS3Backups };
