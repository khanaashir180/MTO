const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const BASELINE_FLAG = '--baseline-existing';

function checksum(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
      execution_ms INT NOT NULL DEFAULT 0,
      is_baseline BOOLEAN NOT NULL DEFAULT false
    )
  `);
}

async function hasExistingBusinessTables(client) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename <> 'schema_migrations'`
  );
  return Number(rows[0]?.total || 0) > 0;
}

async function getAppliedMigrations(client) {
  const { rows } = await client.query(
    `SELECT filename, checksum
     FROM schema_migrations`
  );
  return new Map(rows.map((row) => [row.filename, row.checksum]));
}

async function baselineMigrations(client, files, migrationsDir) {
  for (const file of files) {
    const migrationPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await client.query(
      `INSERT INTO schema_migrations (filename, checksum, execution_ms, is_baseline)
       VALUES ($1, $2, 0, true)
       ON CONFLICT (filename) DO NOTHING`,
      [file, checksum(sql)]
    );
  }
}

async function applyMigration(client, file, sql) {
  const startedAt = Date.now();
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO schema_migrations (filename, checksum, execution_ms, is_baseline)
       VALUES ($1, $2, $3, false)
       ON CONFLICT (filename)
       DO UPDATE SET checksum = EXCLUDED.checksum, execution_ms = EXCLUDED.execution_ms, is_baseline = false, applied_at = NOW()`,
      [file, checksum(sql), Date.now() - startedAt]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    error.message = `Migration ${file} failed: ${error.message}`;
    throw error;
  }
}

async function hardenOutletCredentialHashes(client) {
  const { rows } = await client.query(
    `SELECT outlet_id, password_plain
     FROM outlet_credentials
     WHERE password_hash IS NULL
       AND password_plain IS NOT NULL`
  );
  for (const row of rows) {
    const hash = await bcrypt.hash(String(row.password_plain), 10);
    await client.query(
      `UPDATE outlet_credentials
       SET password_hash = $2,
           password_plain = NULL,
           updated_at = NOW()
       WHERE outlet_id = $1`,
      [row.outlet_id, hash]
    );
  }
  if (rows.length > 0) {
    console.log(`Hardened ${rows.length} outlet credential records to password hashes.`);
  }
}

async function runMigration() {
  const baselineMode = process.argv.includes(BASELINE_FLAG);
  const migrationsDir = path.resolve(__dirname, '..', '..', 'db', 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const appliedBefore = await getAppliedMigrations(client);
    const isEmpty = appliedBefore.size === 0;
    const hasTables = await hasExistingBusinessTables(client);

    if (baselineMode) {
      if (!isEmpty) {
        console.log('Baseline skipped: schema_migrations already has records.');
      } else {
        await baselineMigrations(client, files, migrationsDir);
        console.log(`Baseline completed for ${files.length} migrations.`);
      }
      return;
    }

    if (isEmpty && hasTables) {
      throw new Error(
        'Legacy schema detected with no migration ledger. Run "npm run migrate:baseline" once, then rerun "npm run migrate".'
      );
    }

    const applied = await getAppliedMigrations(client);
    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const migrationPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      const currentChecksum = checksum(sql);
      const savedChecksum = applied.get(file);

      if (savedChecksum) {
        if (savedChecksum !== currentChecksum) {
          throw new Error(
            `Checksum mismatch for ${file}. The file changed after being applied. Create a new migration instead of editing old ones.`
          );
        }
        skippedCount += 1;
        continue;
      }

      await applyMigration(client, file, sql);
      appliedCount += 1;
      console.log(`Applied ${file}`);
    }

    await hardenOutletCredentialHashes(client);

    console.log(`Migrations completed. Applied: ${appliedCount}, Skipped: ${skippedCount}`);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((error) => {
  console.error('Migration failed', error);
  process.exit(1);
});
