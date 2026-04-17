#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const pool = require('../src/config/db');

const checks = [
  {
    name: 'orders_missing_customer_number',
    sql: `SELECT COUNT(*)::int AS count FROM orders WHERE customer_number IS NULL OR TRIM(customer_number) = ''`,
  },
  {
    name: 'orders_without_ledger_debit',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM orders o
      WHERE COALESCE(o.product_price, 0) > 0
        AND NOT EXISTS (
          SELECT 1 FROM customer_ledger_entries e
          WHERE e.reference_order_id = o.id AND e.entry_type = 'DEBIT' AND e.category = 'ORDER'
        )
    `,
  },
  {
    name: 'receipt_ledger_entries_without_payment_account',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM customer_ledger_entries
      WHERE entry_type = 'CREDIT' AND category = 'RECEIPT' AND payment_account_id IS NULL
    `,
  },
  {
    name: 'orders_without_production_stage',
    sql: `SELECT COUNT(*)::int AS count FROM orders WHERE current_stage_id IS NULL`,
  },
  {
    name: 'duplicate_customer_accounts',
    sql: `
      SELECT COUNT(*)::int AS count
      FROM (
        SELECT customer_number
        FROM customer_accounts
        WHERE customer_number IS NOT NULL
        GROUP BY customer_number
        HAVING COUNT(*) > 1
      ) duplicates
    `,
  },
];

async function run() {
  const strict = process.env.DATA_AUDIT_STRICT === 'true';
  const failures = [];
  for (const check of checks) {
    const { rows } = await pool.query(check.sql);
    const count = Number(rows[0].count || 0);
    console.log(`[data-audit] ${check.name}: ${count}`);
    if (count > 0) failures.push(`${check.name}=${count}`);
  }

  await pool.end();
  if (failures.length) {
    const message = `[data-audit] ${strict ? 'FAIL' : 'WARN'} ${failures.join(', ')}`;
    console.error(message);
    if (strict) process.exit(1);
    console.error('[data-audit] Non-strict mode allows deploy to continue. Set DATA_AUDIT_STRICT=true to block on these findings.');
    return;
  }
  console.log('[data-audit] PASS data invariants look healthy');
}

run().catch(async (err) => {
  console.error(`[data-audit] FAIL ${err.message}`);
  await pool.end().catch(() => {});
  process.exit(1);
});
