const bcrypt = require('bcryptjs');
const pool = require('../config/db');

async function upsertUser({ fullName, email, password, role, stageName = null, outletName = null }) {
  const normalizedEmail = email.toLowerCase();
  const passwordHash = await bcrypt.hash(password, 10);
  let outletId = null;
  if (outletName) {
    const outletResult = await pool.query(
      `SELECT id FROM outlets WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [outletName]
    );
    outletId = outletResult.rows[0]?.id || null;
  }

  if (outletId) {
    const existingOutletUser = await pool.query(
      `SELECT id FROM users WHERE outlet_id = $1 LIMIT 1`,
      [outletId]
    );
    if (existingOutletUser.rows[0]) {
      await pool.query(
        `UPDATE users
         SET full_name = $1,
             email = $2,
             password_hash = $3,
             role_id = (SELECT id FROM roles WHERE name = $4),
             stage_access = CASE WHEN $5::text IS NULL THEN NULL ELSE (SELECT id FROM production_stages WHERE name = $5) END,
             outlet_id = $6,
             is_active = true,
             invite_accepted_at = NOW(),
             password_set_at = NOW(),
             failed_login_attempts = 0,
             locked_until = NULL,
             force_password_reset = false
         WHERE id = $7`,
        [fullName, normalizedEmail, passwordHash, role, stageName, outletId, existingOutletUser.rows[0].id]
      );
    } else {
      await pool.query(
        `INSERT INTO users (full_name, email, password_hash, role_id, stage_access, outlet_id, is_active, invite_accepted_at, password_set_at, force_password_reset)
         VALUES (
           $1,
           $2,
           $3,
           (SELECT id FROM roles WHERE name = $4),
           CASE WHEN $5::text IS NULL THEN NULL ELSE (SELECT id FROM production_stages WHERE name = $5) END,
           $6,
           true,
           NOW(),
           NOW(),
           false
         )
         ON CONFLICT (email)
         DO UPDATE SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash,
           role_id = EXCLUDED.role_id, stage_access = EXCLUDED.stage_access, outlet_id = EXCLUDED.outlet_id,
           is_active = true, invite_accepted_at = NOW(), password_set_at = NOW(),
           failed_login_attempts = 0, locked_until = NULL, force_password_reset = false`,
        [fullName, normalizedEmail, passwordHash, role, stageName, outletId]
      );
    }
  } else {
    await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role_id, stage_access, outlet_id, is_active, invite_accepted_at, password_set_at, force_password_reset)
       VALUES (
         $1,
         $2,
         $3,
         (SELECT id FROM roles WHERE name = $4),
         CASE WHEN $5::text IS NULL THEN NULL ELSE (SELECT id FROM production_stages WHERE name = $5) END,
         $6,
         true,
         NOW(),
         NOW(),
         false
       )
       ON CONFLICT (email)
       DO UPDATE SET full_name = EXCLUDED.full_name, password_hash = EXCLUDED.password_hash,
         role_id = EXCLUDED.role_id, stage_access = EXCLUDED.stage_access, outlet_id = EXCLUDED.outlet_id,
         is_active = true, invite_accepted_at = NOW(), password_set_at = NOW(),
         failed_login_attempts = 0, locked_until = NULL, force_password_reset = false`,
      [fullName, normalizedEmail, passwordHash, role, stageName, outletId]
    );
  }

  await pool.query(
    `UPDATE users
     SET is_active = true,
         invite_accepted_at = COALESCE(invite_accepted_at, NOW()),
         password_set_at = COALESCE(password_set_at, NOW()),
         failed_login_attempts = 0,
         locked_until = NULL,
         force_password_reset = false
     WHERE email = $1`,
    [normalizedEmail]
  );
}

async function runSeed() {
  await upsertUser({
    fullName: 'Shop Manager',
    email: 'shopmanager@example.com',
    password: 'password123',
    role: 'SHOP_MANAGER',
    outletName: 'Outlet 1',
  });

  await upsertUser({
    fullName: 'Retail Head',
    email: 'retailhead@example.com',
    password: 'password123',
    role: 'RETAIL_HEAD',
  });

  await upsertUser({
    fullName: 'Verification Supervisor',
    email: 'verification@example.com',
    password: 'password123',
    role: 'PRODUCTION_SUPERVISOR',
    stageName: 'Verification',
  });

  await upsertUser({
    fullName: 'Bespoke Supervisor',
    email: 'lastmod@example.com',
    password: 'password123',
    role: 'PRODUCTION_SUPERVISOR',
    stageName: 'Bespoke',
  });

  await upsertUser({
    fullName: 'Model Room Supervisor',
    email: 'modelroom@example.com',
    password: 'password123',
    role: 'PRODUCTION_SUPERVISOR',
    stageName: 'Model Room',
  });

  await upsertUser({
    fullName: 'Embroidery Supervisor',
    email: 'embroidery@example.com',
    password: 'password123',
    role: 'PRODUCTION_SUPERVISOR',
    stageName: 'Embroidery',
  });

  await upsertUser({
    fullName: 'Laser Supervisor',
    email: 'laser@example.com',
    password: 'password123',
    role: 'PRODUCTION_SUPERVISOR',
    stageName: 'Laser',
  });

  await upsertUser({
    fullName: 'Cutting Supervisor',
    email: 'cutting@example.com',
    password: 'password123',
    role: 'PRODUCTION_SUPERVISOR',
    stageName: 'Cutting',
  });

  await upsertUser({
    fullName: 'Closing Supervisor',
    email: 'closing@example.com',
    password: 'password123',
    role: 'PRODUCTION_SUPERVISOR',
    stageName: 'Closing',
  });

  await upsertUser({
    fullName: 'Sole Supervisor',
    email: 'sole@example.com',
    password: 'password123',
    role: 'PRODUCTION_SUPERVISOR',
    stageName: 'Sole',
  });

  await upsertUser({
    fullName: 'Lasting Supervisor',
    email: 'lasting@example.com',
    password: 'password123',
    role: 'PRODUCTION_SUPERVISOR',
    stageName: 'Lasting',
  });

  await upsertUser({
    fullName: 'Finishing Supervisor',
    email: 'finishing@example.com',
    password: 'password123',
    role: 'PRODUCTION_SUPERVISOR',
    stageName: 'Finishing',
  });

  await upsertUser({
    fullName: 'QC Supervisor',
    email: 'qc@example.com',
    password: 'password123',
    role: 'PRODUCTION_SUPERVISOR',
    stageName: 'QC',
  });

  await upsertUser({
    fullName: 'Packing Supervisor',
    email: 'packing@example.com',
    password: 'password123',
    role: 'PRODUCTION_SUPERVISOR',
    stageName: 'Packing',
  });

  await upsertUser({
    fullName: 'Production Manager',
    email: 'manager@example.com',
    password: 'password123',
    role: 'PRODUCTION_MANAGER',
  });

  await upsertUser({
    fullName: 'Super User',
    email: 'super@example.com',
    password: 'password123',
    role: 'SUPER_USER',
  });

  await upsertUser({
    fullName: 'Finance User',
    email: 'finance@example.com',
    password: 'password123',
    role: 'FINANCE',
  });

  await upsertUser({
    fullName: 'Customer Service User',
    email: 'service@example.com',
    password: 'password123',
    role: 'CUSTOMER_SERVICE',
  });

  console.log(
    'Seeded users: shopmanager@example.com, retailhead@example.com, verification@example.com, lastmod@example.com, modelroom@example.com, embroidery@example.com, laser@example.com, cutting@example.com, closing@example.com, sole@example.com, lasting@example.com, finishing@example.com, qc@example.com, packing@example.com, manager@example.com, super@example.com, finance@example.com, service@example.com'
  );
  await pool.end();
}

runSeed().catch((error) => {
  console.error('Seed failed', error);
  process.exit(1);
});
