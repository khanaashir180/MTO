const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');
const pool = require('../config/db');
const env = require('../config/env');
const { ApiError } = require('./errors');
const logger = require('./logger');
const { uploadRejectedCounter } = require('./metrics');

const uploadRoot = path.resolve(__dirname, '..', '..', env.uploadDir);
const quarantineRoot = path.resolve(uploadRoot, 'quarantine');
fs.mkdirSync(quarantineRoot, { recursive: true });

const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);

async function writeScanLog({ fileName, filePath, engine, status, details }) {
  try {
    await pool.query(
      `INSERT INTO file_scan_logs (file_name, file_path, scan_engine, scan_status, details, scanned_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [fileName, filePath, engine, status, details || null]
    );
  } catch (error) {
    logger.warn('file_scan_log_failed', { message: error.message, fileName });
  }
}

function quarantineFile(filePath, reason) {
  try {
    const fileName = path.basename(filePath);
    const target = path.resolve(quarantineRoot, `${Date.now()}-${fileName}`);
    fs.renameSync(filePath, target);
    return target;
  } catch (_error) {
    return filePath;
  } finally {
    uploadRejectedCounter.inc({ reason });
  }
}

async function runClamScan(filePath) {
  if (!env.clamscanPath) {
    return { engine: 'none', status: 'SKIPPED', details: 'ClamAV path not configured' };
  }

  return new Promise((resolve) => {
    const proc = spawn(env.clamscanPath, ['--no-summary', filePath], { windowsHide: true });
    let output = '';
    let errOutput = '';
    const timeout = setTimeout(() => {
      proc.kill('SIGKILL');
      resolve({ engine: 'clamav', status: 'ERROR', details: 'Scan timeout exceeded' });
    }, env.clamscanTimeoutMs);

    proc.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    proc.stderr.on('data', (chunk) => {
      errOutput += String(chunk);
    });
    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ engine: 'clamav', status: 'CLEAN', details: output.trim() || 'Clean' });
        return;
      }
      if (code === 1) {
        resolve({ engine: 'clamav', status: 'INFECTED', details: output.trim() || errOutput.trim() || 'Infected file detected' });
        return;
      }
      resolve({ engine: 'clamav', status: 'ERROR', details: errOutput.trim() || output.trim() || `Unknown scanner exit code ${code}` });
    });
  });
}

async function assertValidImage(filePath) {
  try {
    const metadata = await sharp(filePath).metadata();
    if (!metadata || !metadata.width || !metadata.height) {
      throw new Error('Missing dimensions');
    }
  } catch (_error) {
    quarantineFile(filePath, 'invalid_image');
    throw new ApiError(400, 'Invalid image content detected');
  }
}

function assertMimeAllowed(file, allowedSet) {
  if (!allowedSet.has(String(file.mimetype || '').toLowerCase())) {
    throw new ApiError(400, `Unsupported file type: ${file.mimetype}`);
  }
}

async function secureUploadedFile(file, { mode = 'image' } = {}) {
  if (!file || !file.path) {
    throw new ApiError(400, 'File payload missing');
  }
  const allowedSet = mode === 'attachment' ? ALLOWED_ATTACHMENT_TYPES : ALLOWED_IMAGE_TYPES;
  assertMimeAllowed(file, allowedSet);

  if (mode === 'image') {
    await assertValidImage(file.path);
  }

  const scanResult = await runClamScan(file.path);
  await writeScanLog({
    fileName: file.originalname,
    filePath: file.path,
    engine: scanResult.engine,
    status: scanResult.status,
    details: scanResult.details,
  });

  if (scanResult.status === 'INFECTED') {
    quarantineFile(file.path, 'malware_detected');
    throw new ApiError(400, 'Uploaded file failed malware scan');
  }
}

module.exports = {
  secureUploadedFile,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_ATTACHMENT_TYPES,
};
