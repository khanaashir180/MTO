const multer = require('multer');
const path = require('path');
const fs = require('fs');
const env = require('../config/env');
const { ApiError } = require('../utils/errors');

const uploadRoot = path.resolve(__dirname, '..', '..', env.uploadDir);
fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const baseName = path.basename(file.originalname || 'upload', ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}-${baseName}${ext}`;
    cb(null, safeName);
  },
});

const allowedExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowedExtensions.has(ext)) {
      cb(new ApiError(400, `Unsupported file extension: ${ext || 'unknown'}`));
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = upload;
