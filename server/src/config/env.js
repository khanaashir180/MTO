const dotenv = require('dotenv');
dotenv.config();

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value || !String(value).trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const jwtSecret = getRequiredEnv('JWT_SECRET');
if (jwtSecret.length < 24) {
  throw new Error('JWT_SECRET must be at least 24 characters for production-safe signing');
}

const env = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  databaseUrl: process.env.DATABASE_URL,
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  logLevel: process.env.LOG_LEVEL || 'info',
  authRateLimitWindowMs: parseInteger(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  authRateLimitMax: parseInteger(process.env.AUTH_RATE_LIMIT_MAX, 40),
  apiRateLimitWindowMs: parseInteger(process.env.API_RATE_LIMIT_WINDOW_MS, 60 * 1000),
  apiRateLimitMax: parseInteger(process.env.API_RATE_LIMIT_MAX, 800),
  clamscanPath: process.env.CLAMSCAN_PATH || '',
  clamscanTimeoutMs: parseInteger(process.env.CLAMSCAN_TIMEOUT_MS, 12000),
  metricsEnabled: String(process.env.METRICS_ENABLED || 'true').toLowerCase() !== 'false',
  metricsToken: process.env.METRICS_TOKEN || '',
};

module.exports = env;
