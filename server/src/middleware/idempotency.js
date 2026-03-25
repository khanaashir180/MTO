const crypto = require('crypto');
const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function hashRequestBody(body) {
  return crypto.createHash('sha256').update(stableStringify(body || {})).digest('hex');
}

function routeSignature(req) {
  return `${req.method}:${req.baseUrl}${req.route?.path || req.path || ''}`;
}

function idempotencyRequired() {
  return async (req, res, next) => {
    try {
      const key = String(req.headers['idempotency-key'] || '').trim();
      if (!key) {
        return next(new ApiError(400, 'Idempotency-Key header is required', 'IDEMPOTENCY_KEY_REQUIRED'));
      }
      if (key.length > 160) {
        return next(new ApiError(400, 'Idempotency-Key must be 160 characters or fewer', 'IDEMPOTENCY_KEY_TOO_LONG'));
      }

      const signature = routeSignature(req);
      const requestHash = hashRequestBody(req.body);
      const { rows } = await pool.query(
        `SELECT id, route_signature, request_hash, status, response_status, response_body
         FROM idempotency_keys
         WHERE idempotency_key = $1
         LIMIT 1`,
        [key]
      );
      const existing = rows[0];
      if (existing) {
        if (existing.route_signature !== signature || existing.request_hash !== requestHash) {
          return next(new ApiError(409, 'Idempotency key already used with different payload', 'IDEMPOTENCY_KEY_REUSE_CONFLICT'));
        }
        if (existing.status === 'COMPLETED') {
          return res.status(Number(existing.response_status || 200)).json(existing.response_body || {});
        }
        return next(new ApiError(409, 'Request with this Idempotency-Key is already in progress', 'IDEMPOTENCY_REQUEST_IN_PROGRESS'));
      }

      const inserted = await pool.query(
        `INSERT INTO idempotency_keys
         (idempotency_key, route_signature, request_hash, status, created_by, created_at)
         VALUES ($1, $2, $3, 'IN_PROGRESS', $4, NOW())
         RETURNING id`,
        [key, signature, requestHash, req.user?.id || null]
      );
      req.idempotencyKeyId = inserted.rows[0].id;

      const originalJson = res.json.bind(res);
      res.json = (payload) => {
        if (req.idempotencyKeyId) {
          pool.query(
            `UPDATE idempotency_keys
             SET status = 'COMPLETED',
                 response_status = $2,
                 response_body = $3::jsonb,
                 completed_at = NOW()
             WHERE id = $1`,
            [req.idempotencyKeyId, res.statusCode || 200, JSON.stringify(payload || {})]
          ).catch(() => {});
        }
        return originalJson(payload);
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { idempotencyRequired };
