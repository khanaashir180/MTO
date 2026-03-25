const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { ApiError } = require('../utils/errors');

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 12);
}

function randomPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

async function syncOutletRetailUser(client, { outletId, outletName, username, passwordHash }) {
  const outletEmail = `${String(username).toLowerCase()}@outlet.mto`;
  const fullName = `${outletName} Outlet`;
  const existing = await client.query(
    `SELECT id FROM users WHERE outlet_id = $1 LIMIT 1`,
    [outletId]
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE users
       SET full_name = $1,
           email = $2,
           password_hash = $3,
           role_id = (SELECT id FROM roles WHERE name = 'SHOP_MANAGER'),
           stage_access = NULL
       WHERE id = $4`,
      [fullName, outletEmail, passwordHash, existing.rows[0].id]
    );
    return;
  }

  await client.query(
    `INSERT INTO users (full_name, email, password_hash, role_id, stage_access, outlet_id)
     VALUES ($1, $2, $3, (SELECT id FROM roles WHERE name = 'SHOP_MANAGER'), NULL, $4)`,
    [fullName, outletEmail, passwordHash, outletId]
  );
}

async function listOutlets(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name
       FROM outlets
       WHERE is_active = true
       ORDER BY CASE WHEN LOWER(name) = 'online' THEN 0 ELSE 1 END, name ASC`
    );
    res.json({ outlets: rows });
  } catch (error) {
    next(error);
  }
}

async function createOutlet(req, res, next) {
  const client = await pool.connect();
  try {
    const name = String(req.body.name || '').trim();
    if (!name) throw new ApiError(400, 'Outlet name is required');
    if (name.length > 80) throw new ApiError(400, 'Outlet name must be 80 characters or less');

    const { rows: countRows } = await client.query(
      `SELECT COUNT(*)::int AS total FROM outlets WHERE is_active = true`
    );
    if ((countRows[0]?.total || 0) >= 50) {
      throw new ApiError(400, 'Maximum 50 active outlets allowed');
    }

    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO outlets (name, is_active, created_at, updated_at)
       VALUES ($1, true, NOW(), NOW())
       RETURNING id, name`,
      [name]
    );
    const outlet = rows[0];

    const baseUsername = `outlet_${slugify(name) || outlet.id}`;
    let username = baseUsername;
    let suffix = 1;
    // Ensure username uniqueness.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const exists = await client.query(
        `SELECT 1 FROM outlet_credentials WHERE LOWER(username) = LOWER($1) LIMIT 1`,
        [username]
      );
      if (!exists.rows[0]) break;
      suffix += 1;
      username = `${baseUsername}${suffix}`;
    }

    const password = randomPassword(10);
    const passwordHash = await bcrypt.hash(password, 10);
    await client.query(
      `INSERT INTO outlet_credentials (outlet_id, username, password_hash, password_plain, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, NOW(), NOW())`,
      [outlet.id, username, passwordHash]
    );
    await syncOutletRetailUser(client, {
      outletId: outlet.id,
      outletName: outlet.name,
      username,
      passwordHash,
    });

    await client.query('COMMIT');
    res.status(201).json({ outlet });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return next(new ApiError(409, 'Outlet already exists'));
    }
    next(error);
  } finally {
    client.release();
  }
}

async function deleteOutlet(req, res, next) {
  const client = await pool.connect();
  try {
    const outletId = Number(req.params.id);
    if (!Number.isInteger(outletId) || outletId <= 0) {
      throw new ApiError(400, 'Invalid outlet id');
    }

    await client.query('BEGIN');
    const outletResult = await client.query(
      `SELECT id, name FROM outlets WHERE id = $1 AND is_active = true`,
      [outletId]
    );
    const outlet = outletResult.rows[0];
    if (!outlet) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Outlet not found' });
    }

    const pendingCountResult = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM orders
       WHERE LOWER(ordered_from) = LOWER($1)
         AND status NOT IN ('COMPLETED', 'SHIPPED')`,
      [outlet.name]
    );
    if ((pendingCountResult.rows[0]?.total || 0) > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        message: 'Cannot delete outlet with pending orders',
      });
    }

    await client.query(
      `UPDATE outlets
       SET is_active = false, updated_at = NOW()
       WHERE id = $1`,
      [outletId]
    );
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  listOutlets,
  createOutlet,
  deleteOutlet,
  async getOutletCredentials(req, res, next) {
    try {
      const outletId = Number(req.params.id);
      if (!Number.isInteger(outletId) || outletId <= 0) {
        throw new ApiError(400, 'Invalid outlet id');
      }

      const { rows } = await pool.query(
        `SELECT o.id, o.name, c.username
         FROM outlets o
         LEFT JOIN outlet_credentials c ON c.outlet_id = o.id
         WHERE o.id = $1 AND o.is_active = true`,
        [outletId]
      );
      if (!rows[0]) return res.status(404).json({ message: 'Outlet not found' });

      const row = rows[0];
      res.json({
        outlet: { id: row.id, name: row.name },
        credentials: row.username
          ? { username: row.username, password: '' }
          : null,
      });
    } catch (error) {
      next(error);
    }
  },
  async updateOutletCredentials(req, res, next) {
    const client = await pool.connect();
    try {
      const outletId = Number(req.params.id);
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '').trim();

      if (!Number.isInteger(outletId) || outletId <= 0) {
        throw new ApiError(400, 'Invalid outlet id');
      }
      if (!username) throw new ApiError(400, 'Username is required');
      if (username.length > 80) throw new ApiError(400, 'Username must be 80 characters or less');
      if (password && password.length > 80) throw new ApiError(400, 'Password must be 80 characters or less');

      await client.query('BEGIN');
      const outletResult = await client.query(
        `SELECT id FROM outlets WHERE id = $1 AND is_active = true`,
        [outletId]
      );
      if (!outletResult.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(404).json({ message: 'Outlet not found' });
      }

      const existingUser = await client.query(
        `SELECT outlet_id
         FROM outlet_credentials
         WHERE LOWER(username) = LOWER($1)
           AND outlet_id <> $2
         LIMIT 1`,
        [username, outletId]
      );
      if (existingUser.rows[0]) {
        await client.query('ROLLBACK');
        return res.status(409).json({ message: 'Username already in use by another outlet' });
      }

      const existingCredentials = await client.query(
        `SELECT password_hash
         FROM outlet_credentials
         WHERE outlet_id = $1
         LIMIT 1`,
        [outletId]
      );
      const currentPasswordHash = existingCredentials.rows[0]?.password_hash || null;
      const passwordHash = password ? await bcrypt.hash(password, 10) : currentPasswordHash;
      if (!passwordHash) {
        throw new ApiError(400, 'Password is required for first-time credential setup');
      }
      await client.query(
        `INSERT INTO outlet_credentials (outlet_id, username, password_hash, password_plain, created_at, updated_at)
         VALUES ($1, $2, $3, NULL, NOW(), NOW())
         ON CONFLICT (outlet_id)
         DO UPDATE SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, password_plain = NULL, updated_at = NOW()`,
        [outletId, username, passwordHash]
      );
      const outletNameResult = await client.query(
        `SELECT name FROM outlets WHERE id = $1`,
        [outletId]
      );
      const outletName = outletNameResult.rows[0]?.name || `Outlet ${outletId}`;
      await syncOutletRetailUser(client, {
        outletId,
        outletName,
        username,
        passwordHash,
      });
      await client.query('COMMIT');

      res.json({ credentials: { username, password: '' }, message: 'Credentials updated successfully' });
    } catch (error) {
      await client.query('ROLLBACK');
      next(error);
    } finally {
      client.release();
    }
  },
};
