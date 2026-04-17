const client = require('prom-client');

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

const httpRequestCounter = new client.Counter({
  name: 'mto_http_requests_total',
  help: 'Total HTTP requests served',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestDuration = new client.Histogram({
  name: 'mto_http_request_duration_ms',
  help: 'HTTP request latency in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [25, 50, 100, 250, 500, 1000, 2000, 5000],
});

const authFailedCounter = new client.Counter({
  name: 'mto_auth_failed_total',
  help: 'Failed authentication attempts',
});

const uploadRejectedCounter = new client.Counter({
  name: 'mto_upload_rejected_total',
  help: 'Rejected file uploads',
  labelNames: ['reason'],
});

const dbPoolTotalGauge = new client.Gauge({
  name: 'mto_db_pool_total',
  help: 'Total PostgreSQL clients currently managed by the pool',
});

const dbPoolIdleGauge = new client.Gauge({
  name: 'mto_db_pool_idle',
  help: 'Idle PostgreSQL clients currently available in the pool',
});

const dbPoolWaitingGauge = new client.Gauge({
  name: 'mto_db_pool_waiting',
  help: 'Requests waiting for a PostgreSQL client from the pool',
});

registry.registerMetric(httpRequestCounter);
registry.registerMetric(httpRequestDuration);
registry.registerMetric(authFailedCounter);
registry.registerMetric(uploadRejectedCounter);
registry.registerMetric(dbPoolTotalGauge);
registry.registerMetric(dbPoolIdleGauge);
registry.registerMetric(dbPoolWaitingGauge);

module.exports = {
  registry,
  httpRequestCounter,
  httpRequestDuration,
  authFailedCounter,
  uploadRejectedCounter,
  dbPoolTotalGauge,
  dbPoolIdleGauge,
  dbPoolWaitingGauge,
};
