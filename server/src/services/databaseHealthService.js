const fs = require('fs');
const path = require('path');
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

const REQUIRED_COLUMNS = {
  users: ['id', 'email', 'password_hash', 'role_id', 'is_active'],
  roles: ['id', 'name'],
  orders: ['id', 'production_order_no', 'customer_number', 'customer_name', 'order_type', 'production_flow', 'status', 'current_stage_id'],
  production_stages: ['id', 'name', 'sequence'],
  customer_accounts: ['id', 'customer_number', 'customer_name'],
  customer_ledger_entries: ['id', 'account_id', 'entry_type', 'category', 'amount', 'reference_order_id'],
  payment_accounts: ['id', 'name', 'account_type', 'is_active'],
  feature_flags: ['id', 'flag_key', 'flag_value'],
  schema_migrations: ['id', 'filename', 'checksum', 'applied_at'],
};

const CRITICAL_INDEXES = [
  'idx_orders_due_date',
  'idx_orders_status',
  'idx_ledger_account_date',
  'idx_ledger_order_ref',
];

function countMigrationFiles() {
  const migrationsDir = path.resolve(__dirname, '..', '..', 'db', 'migrations');
  return fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).length;
}

function computeStatus(checks) {
  if (checks.some((check) => check.status === 'DOWN' || check.status === 'FAIL')) return 'DOWN';
  if (checks.some((check) => check.status === 'WARN' || check.status === 'DEGRADED')) return 'DEGRADED';
  return 'UP';
}

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
    columns: undefined,
    indexes: undefined,
    constraints: undefined,
    integrity: undefined,
    error: null,
  };

  try {
    const dbStart = Date.now();
    const { rows } = await pool.query(`
      SELECT
        current_database() AS database,
        current_setting('server_version') AS postgres_version,
        NOW() AS server_time,
        EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'schema_migrations'
        ) AS has_migration_table
    `);
    result.latency_ms = Date.now() - dbStart;
    result.database = rows[0].database;
    result.postgres_version = rows[0].postgres_version;
    result.server_time = rows[0].server_time;

    if (rows[0].has_migration_table) {
      const migrationRes = await pool.query(`
        SELECT COUNT(*)::int AS applied_count, MAX(applied_at) AS latest_applied_at
        FROM schema_migrations
      `);
      result.migration = migrationRes.rows[0];
      result.migration.expected_file_count = countMigrationFiles();
      result.migration.pending_count = Math.max(0, result.migration.expected_file_count - Number(result.migration.applied_count || 0));
    } else {
      result.migration = { applied_count: 0, latest_applied_at: null, missing_table: true, expected_file_count: countMigrationFiles(), pending_count: countMigrationFiles() };
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

      const requiredColumnPairs = Object.entries(REQUIRED_COLUMNS).flatMap(([tableName, columns]) => (
        columns.map((columnName) => ({ tableName, columnName }))
      ));
      const columnRes = await pool.query(
        `
          SELECT table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = ANY($1::text[])
        `,
        [Object.keys(REQUIRED_COLUMNS)]
      );
      const existingColumns = new Set(columnRes.rows.map((row) => `${row.table_name}.${row.column_name}`));
      const missingColumns = requiredColumnPairs
        .filter(({ tableName, columnName }) => !existingColumns.has(`${tableName}.${columnName}`))
        .map(({ tableName, columnName }) => `${tableName}.${columnName}`);
      result.columns = {
        missing: missingColumns,
      };

      const indexRes = await pool.query(
        `
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = ANY($1::text[])
        `,
        [CRITICAL_INDEXES]
      );
      const existingIndexes = new Set(indexRes.rows.map((row) => row.indexname));
      result.indexes = {
        required: CRITICAL_INDEXES,
        missing: CRITICAL_INDEXES.filter((indexName) => !existingIndexes.has(indexName)),
      };

      const constraintRes = await pool.query(`
        SELECT conname, contype
        FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
          AND convalidated = false
      `);
      result.constraints = {
        invalid: constraintRes.rows,
      };

      result.integrity = {
        migrationLedgerCurrent: !result.migration.missing_table && Number(result.migration.pending_count || 0) === 0,
        noMissingTables: missing.length === 0,
        noMissingColumns: missingColumns.length === 0,
        noInvalidConstraints: constraintRes.rows.length === 0,
        poolHasNoWaiters: Number(result.pool.waiting || 0) === 0,
      };

      result.status = computeStatus([
        { status: missing.length ? 'FAIL' : 'UP' },
        { status: missingColumns.length ? 'FAIL' : 'UP' },
        { status: result.migration.missing_table || Number(result.migration.pending_count || 0) > 0 ? 'FAIL' : 'UP' },
        { status: constraintRes.rows.length ? 'FAIL' : 'UP' },
        { status: result.indexes.missing.length ? 'WARN' : 'UP' },
        { status: Number(result.pool.waiting || 0) > 0 ? 'WARN' : 'UP' },
      ]);
    } else {
      result.status = rows[0].has_migration_table && Number(result.migration.pending_count || 0) === 0 ? 'UP' : 'DEGRADED';
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
  REQUIRED_COLUMNS,
  CRITICAL_INDEXES,
  checkDatabaseHealth,
};
