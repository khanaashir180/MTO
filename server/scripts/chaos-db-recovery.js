#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const pool = require('../src/config/db');

async function run() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    client.release(true);
    console.log('[chaos-db] intentionally destroyed one pooled database connection');

    const recovered = await pool.query('SELECT 1 AS ok');
    if (Number(recovered.rows[0].ok) !== 1) {
      throw new Error('Recovery query returned unexpected result');
    }
    console.log('[chaos-db] PASS pool recovered after forced client destroy');
  } finally {
    await pool.end();
  }
}

run().catch(async (err) => {
  console.error(`[chaos-db] FAIL ${err.message}`);
  await pool.end().catch(() => {});
  process.exit(1);
});
