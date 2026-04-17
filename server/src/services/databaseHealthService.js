const pool = require('../config/db');

const REQUIRED_TABLES = [
  'schema_migrations',
  'users',
  'roles',
  'orders',
  'production_stages',
  'customer_accounts',
  'customer_ledger_entries',
  'payment_accounts',
  'feature_flags',
];

async function checkDatabaseHealth({ includeTables = false } = {}) {
  const startedAt = Date.now();
  const result = {
    status: 'DOWN',
    latency_ms: null,
    database: null,
    server_time: null,
    migration: null,
    pool: {
      total: pool.totalCount || 0,
      idle: pool.idleCount || 0,
      waiting: pool.waitingCount || 0,
    },
    tables: undefined,
    error: null,
  };

  try {
    const dbStart = Date.now();
    const { rows } = await pool.query(`
      SELECT
        current_database() AS database,
        NOW() AS server_time,
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'schema_migrations'
        ) AS has_migration_table
    `);
    result.latency_ms = Date.now() - dbStart;
    result.database = rows[0].database;
    result.server_time = rows[0].server_time;

    if (rows[0].has_migration_table) {
      const migrationRes = await pool.query(`
        SELECT COUNT(*)::int AS applied_count, MAX(applied_at) AS latest_applied_at
        FROM schema_migrations
      `);
      result.migration = migrationRes.rows[0];
    } else {
      result.migration = { applied_count: 0, latest_applied_at: null, missing_table: true };
    }

    if (includeTables) {
      const tableRes = await pool.query(
        `
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
        `,
        [REQUIRED_TABLES]
      );
      const existing = new Set(tableRes.rows.map((row) => row.table_name));
      const missing = REQUIRED_TABLES.filter((tableName) => !existing.has(tableName));
      result.tables = {
        required: REQUIRED_TABLES,
        missing,
      };
      result.status = missing.length ? 'DEGRADED' : 'UP';
    } else {
      result.status = rows[0].has_migration_table ? 'UP' : 'DEGRADED';
    }
  } catch (error) {
    result.error = error.message;
    result.status = 'DOWN';
  }

  result.total_latency_ms = Date.now() - startedAt;
  return result;
}

module.exports = {
  REQUIRED_TABLES,
  checkDatabaseHealth,
};
