const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const logger = require('./utils/logger');
const { registry, httpRequestCounter, httpRequestDuration } = require('./utils/metrics');
const authRoutes = require('./routes/authRoutes');
const orderRoutes = require('./routes/orderRoutes');
const productionRoutes = require('./routes/productionRoutes');
const outletRoutes = require('./routes/outletRoutes');
const financeRoutes = require('./routes/financeRoutes');
const crmRoutes = require('./routes/crmRoutes');
const mrpRoutes = require('./routes/mrpRoutes');
const rawMaterialStoreRoutes = require('./routes/rawMaterialStoreRoutes');
const platformRoutes = require('./routes/platformRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.resolve(__dirname, '..', env.uploadDir)));

app.use((req, res, next) => {
  req.requestId = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
});

const apiLimiter = rateLimit({
  windowMs: env.apiRateLimitWindowMs,
  max: env.apiRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.requestId,
});

const authLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMs,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || req.requestId,
  message: { message: 'Too many login attempts. Please retry later.' },
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/refresh', authLimiter);

app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const routePath = req.route?.path || req.path || 'unknown';
    const durationMs = Date.now() - startedAt;
    const statusCode = String(res.statusCode);
    httpRequestCounter.inc({ method: req.method, route: routePath, status_code: statusCode });
    httpRequestDuration.observe({ method: req.method, route: routePath, status_code: statusCode }, durationMs);
    logger.info('http_request', {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      route: routePath,
      statusCode: res.statusCode,
      durationMs,
      userId: req.user?.id || null,
    });
  });
  next();
});

app.get('/health', (_req, res) => res.json({ ok: true }));
if (env.metricsEnabled) {
  app.get('/metrics', async (req, res, next) => {
    try {
      const authHeader = String(req.headers.authorization || '');
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!env.metricsToken || token !== env.metricsToken) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      res.set('Content-Type', registry.contentType);
      res.end(await registry.metrics());
    } catch (error) {
      next(error);
    }
  });
}

// Middleware to inject Socket.io
const attachSocket = (req, _res, next) => {
  req.io = app.get('io');
  next();
};

app.use('/api/auth', authRoutes);
app.use('/api/outlets', outletRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/mrp', mrpRoutes);
app.use('/api/raw-store', rawMaterialStoreRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/orders', attachSocket, orderRoutes);
app.use('/api/production', attachSocket, productionRoutes);

// Basic v1 aliases for forward API versioning support.
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/outlets', outletRoutes);
app.use('/api/v1/finance', financeRoutes);
app.use('/api/v1/crm', crmRoutes);
app.use('/api/v1/mrp', mrpRoutes);
app.use('/api/v1/raw-store', rawMaterialStoreRoutes);
app.use('/api/v1/platform', platformRoutes);
app.use('/api/v1/orders', attachSocket, orderRoutes);
app.use('/api/v1/production', attachSocket, productionRoutes);

app.use(errorHandler);

module.exports = app;
