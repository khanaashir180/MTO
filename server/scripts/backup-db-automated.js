#!/usr/bin/env node
/**
 * Automated daily backup script for MTO production database.
 * Uploads a pg_dump to S3-compatible storage using Railway environment variables.
 * Stores backup metadata (timestamp, size, checksum) alongside the dump.
 * Enforces a 30-day retention policy by deleting older objects.
 *
 * Required env vars:
 *   DATABASE_URL        – PostgreSQL connection string
 *   BUCKET              – S3 bucket name
 *   ENDPOINT            – S3-compatible endpoint URL (e.g. https://s3.amazonaws.com)
 *   ACCESS_KEY_ID       – S3 access key
 *   SECRET_ACCESS_KEY   – S3 secret key
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { spawnSync } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

// ── Environment validation ────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL;
const BUCKET = process.env.BUCKET;
const ENDPOINT = process.env.ENDPOINT;
const ACCESS_KEY_ID = process.env.ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.SECRET_ACCESS_KEY;

const missing = ['DATABASE_URL', 'BUCKET', 'ENDPOINT', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY']
  .filter((k) => !process.env[k]);

if (missing.length) {
  console.error(`[backup-automated] FATAL: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg) {
  // eslint-disable-next-line no-console
  console.log(`[backup-automated] ${new Date().toISOString()} ${msg}`);
}

function logError(msg) {
  // eslint-disable-next-line no-console
  console.error(`[backup-automated] ${new Date().toISOString()} ERROR: ${msg}`);
}

/**
 * Compute SHA-256 checksum of a file, returned as a hex string.
 */
function checksumFile(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

/**
 * Build an AWS Signature Version 4 authorisation header set for a PUT request.
 * This is a minimal implementation covering the subset needed for S3 PutObject.
 */
function buildAwsV4Headers({ method, endpointUrl, objectKey, contentType, payloadHash, contentLength, region = 'us-east-1', service = 's3' }) {
  const url = new URL(`${endpointUrl}/${BUCKET}/${objectKey}`);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalHeaders = [
    `content-length:${contentLength}`,
    `content-type:${contentType}`,
    `host:${url.host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';

  const signedHeaders = 'content-length;content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    method,
    url.pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');

  function hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${SECRET_ACCESS_KEY}`, dateStamp), region), service),
    'aws4_request'
  );
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorization = `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    Authorization: authorization,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    'Content-Type': contentType,
    'Content-Length': String(contentLength),
    host: url.host,
  };
}

/**
 * Upload a local file to S3 via a signed PUT request.
 * Returns a Promise that resolves with the HTTP status code.
 */
function uploadToS3(localFilePath, objectKey, contentType = 'application/octet-stream') {
  return new Promise((resolve, reject) => {
    const fileBuffer = fs.readFileSync(localFilePath);
    const payloadHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const endpointUrl = ENDPOINT.replace(/\/$/, '');
    const url = new URL(`${endpointUrl}/${BUCKET}/${objectKey}`);

    const headers = buildAwsV4Headers({
      method: 'PUT',
      endpointUrl,
      objectKey,
      contentType,
      payloadHash,
      contentLength: fileBuffer.length,
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'PUT',
      headers,
    };

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.statusCode);
        } else {
          reject(new Error(`S3 upload failed: HTTP ${res.statusCode} – ${body.slice(0, 300)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

/**
 * List objects in the S3 bucket under a given prefix.
 * Returns an array of { key, lastModified } objects.
 */
function listS3Objects(prefix) {
  return new Promise((resolve, reject) => {
    const endpointUrl = ENDPOINT.replace(/\/$/, '');
    const url = new URL(`${endpointUrl}/${BUCKET}?list-type=2&prefix=${encodeURIComponent(prefix)}`);
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
      'GET',
      `/${BUCKET}/`,
      `list-type=2&prefix=${encodeURIComponent(prefix)}`,
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

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}?${url.search.slice(1)}`,
      method: 'GET',
      headers: {
        host: url.host,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        Authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
    };

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`S3 list failed: HTTP ${res.statusCode}`));
        }
        // Parse XML minimally – extract <Key> and <LastModified> pairs
        const keys = [];
        const keyMatches = body.matchAll(/<Key>([^<]+)<\/Key>/g);
        const dateMatches = body.matchAll(/<LastModified>([^<]+)<\/LastModified>/g);
        const keyArr = Array.from(keyMatches).map((m) => m[1]);
        const dateArr = Array.from(dateMatches).map((m) => m[1]);
        for (let i = 0; i < keyArr.length; i++) {
          keys.push({ key: keyArr[i], lastModified: dateArr[i] ? new Date(dateArr[i]) : null });
        }
        resolve(keys);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Delete a single S3 object by key.
 */
function deleteS3Object(objectKey) {
  return new Promise((resolve, reject) => {
    const endpointUrl = ENDPOINT.replace(/\/$/, '');
    const url = new URL(`${endpointUrl}/${BUCKET}/${objectKey}`);
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
      'DELETE',
      url.pathname,
      '',
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

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'DELETE',
      headers: {
        host: url.host,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        Authorization: `AWS4-HMAC-SHA256 Credential=${ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
    };

    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300 || res.statusCode === 204) {
          resolve(res.statusCode);
        } else {
          reject(new Error(`S3 delete failed: HTTP ${res.statusCode} – ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ── Main backup routine ───────────────────────────────────────────────────────

async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve(__dirname, '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const dumpFile = path.join(backupDir, `mto-backup-${timestamp}.dump`);
  const metaFile = path.join(backupDir, `mto-backup-${timestamp}.meta.json`);

  // 1. Create pg_dump
  log(`Starting pg_dump → ${dumpFile}`);
  const dump = spawnSync('pg_dump', ['--format=custom', '--file', dumpFile, DATABASE_URL], {
    stdio: 'inherit',
    shell: true,
  });
  if (dump.status !== 0) {
    logError(`pg_dump exited with code ${dump.status}`);
    process.exit(dump.status || 1);
  }

  const stat = fs.statSync(dumpFile);
  const sizeBytes = stat.size;
  log(`Dump created: ${sizeBytes} bytes`);

  if (sizeBytes < 1024) {
    logError('Dump file is suspiciously small (< 1 KB). Aborting upload.');
    process.exit(1);
  }

  // 2. Compute checksum
  const checksum = checksumFile(dumpFile);
  log(`SHA-256 checksum: ${checksum}`);

  // 3. Write metadata
  const meta = {
    timestamp,
    dumpFile: path.basename(dumpFile),
    sizeBytes,
    checksum,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));

  // 4. Upload dump to S3
  const s3DumpKey = `backups/${path.basename(dumpFile)}`;
  const s3MetaKey = `backups/${path.basename(metaFile)}`;

  log(`Uploading dump to s3://${BUCKET}/${s3DumpKey}`);
  await uploadToS3(dumpFile, s3DumpKey, 'application/octet-stream');
  log('Dump uploaded successfully');

  log(`Uploading metadata to s3://${BUCKET}/${s3MetaKey}`);
  await uploadToS3(metaFile, s3MetaKey, 'application/json');
  log('Metadata uploaded successfully');

  // 5. Clean up local temp files
  fs.unlinkSync(dumpFile);
  fs.unlinkSync(metaFile);
  log('Local temp files removed');

  // 6. Enforce 30-day retention – delete backups older than 30 days
  log('Checking retention policy (30 days)…');
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  let objects;
  try {
    objects = await listS3Objects('backups/');
  } catch (err) {
    logError(`Could not list S3 objects for retention check: ${err.message}`);
    objects = [];
  }

  const toDelete = objects.filter((obj) => obj.lastModified && obj.lastModified < cutoff);
  if (toDelete.length === 0) {
    log('No old backups to delete');
  } else {
    for (const obj of toDelete) {
      try {
        await deleteS3Object(obj.key);
        log(`Deleted old backup: ${obj.key}`);
      } catch (err) {
        logError(`Failed to delete ${obj.key}: ${err.message}`);
      }
    }
  }

  log(`Backup complete. Timestamp: ${timestamp}`);
}

runBackup().catch((err) => {
  logError(err.message || String(err));
  process.exit(1);
});
