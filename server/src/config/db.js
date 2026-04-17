const { Pool } = require('pg');
const env = require('./env');
const {
  dbPoolTotalGauge,
  dbPoolIdleGauge,
  dbPoolWaitingGauge,
} = require('../utils/metrics');

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: Number(process.env.PG_POOL_MAX || 20),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 10000),
});

function updatePoolMetrics() {
  dbPoolTotalGauge.set(pool.totalCount);
  dbPoolIdleGauge.set(pool.idleCount);
  dbPoolWaitingGauge.set(pool.waitingCount);
}

pool.on('connect', updatePoolMetrics);
pool.on('acquire', updatePoolMetrics);
pool.on('remove', updatePoolMetrics);
pool.on('error', updatePoolMetrics);

setInterval(updatePoolMetrics, Number(process.env.PG_POOL_METRICS_INTERVAL_MS || 10000)).unref();
updatePoolMetrics();

module.exports = pool;
