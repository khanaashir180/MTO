const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const env = require('../config/env');
const { signAccessToken } = require('../middleware/auth');
const { sendInviteEmail } = require('../utils/inviteMailer');
const { getRoleMeta, listAssignableRoles, normalizeRoleName } = require('../config/roles');
const { buildEffectivePermissions, getPermissionCatalog } = require('../config/permissions');
const { authFailedCounter } = require('../utils/metrics');

function hashInviteToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function writeUserAudit({ userId = null, actorId = null, actionType, beforeData = null, afterData = null }) {
  await pool.query(
    `INSERT INTO user_account_audit_logs
     (user_id, actor_id, action_type, before_data, after_data, created_at)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, NOW())`,
    [userId, actorId, actionType, JSON.stringify(beforeData), JSON.stringify(afterData)]
  );
}

async function getSecuritySettingsMap() {
  const { rows } = await pool.query(`SELECT setting_key, setting_value FROM auth_security_settings`);
  return Object.fromEntries(rows.map((row) => [row.setting_key, row.setting_value]));
}

async function storePasswordHistory(userId, passwordHash) {
  await pool.query(
    `INSERT INTO user_password_history (user_id, password_hash, created_at)
     VALUES ($1, $2, NOW())`,
    [userId, passwordHash]
  );
}

function buildInviteLink(req, token) {
  const frontendBase = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`.replace(':4000', ':3000');
  return `${frontendBase}/?page=accept-invite&token=${encodeURIComponent(token)}`;
}

function normalizePermissionsInput(permissions) {
  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    return {};
  }
  const normalized = {};
  Object.keys(permissions).forEach((key) => {
    normalized[key] = Boolean(permissions[key]);
  });
  return normalized;
}

function normalizeScopesInput(scopes) {
  if (!Array.isArray(scopes)) return [];
  return scopes
    .map((entry) => ({
      scopeType: String(entry?.scopeType || '').trim().toUpperCase(),
      scopeValue: String(entry?.scopeValue || '').trim(),
    }))
    .filter((entry) => ['OUTLET', 'STAGE', 'DEPARTMENT'].includes(entry.scopeType) && entry.scopeValue);
}

function extractClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || null;
}

async function createSession(client, userId, req) {
  const refreshLifetime = String(env.jwtRefreshExpiresIn || '30d').trim().toLowerCase();
  const ttlMap = { h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  const unit = refreshLifetime.slice(-1);
  const quantity = Number(refreshLifetime.slice(0, -1));
  const ttlMs = Number.isFinite(quantity) && ttlMap[unit]
    ? quantity * ttlMap[unit]
    : 30 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  const sessionToken = crypto.randomBytes(32).toString('hex');
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 240);
  const ipAddress = String(extractClientIp(req) || '').slice(0, 120);
  const { rows } = await client.query(
    `INSERT INTO user_sessions
     (user_id, refresh_token_hash, user_agent, ip_address, created_at, last_seen_at, expires_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW(), $5)
     RETURNING id`,
    [userId, hashInviteToken(sessionToken), userAgent || null, ipAddress || null, expiresAt.toISOString()]
  );
  return { sessionId: rows[0].id, refreshTokenRaw: sessionToken };
}

async function findSessionByRefreshToken(client, refreshTokenRaw) {
  const hashed = hashInviteToken(refreshTokenRaw);
  const { rows } = await client.query(
    `SELECT id, user_id
     FROM user_sessions
     WHERE refresh_token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > NOW()
     LIMIT 1`,
    [hashed]
  );
  return rows[0] || null;
}

async function getScopeRules(targetType, targetKey) {
  const { rows } = await pool.query(
    `SELECT id, target_type, target_key, scope_type, scope_value, created_by, created_at
     FROM permission_scope_rules
     WHERE target_type = $1 AND target_key = $2
     ORDER BY scope_type ASC, scope_value ASC, id ASC`,
    [targetType, targetKey]
  );
  return rows;
}

async function replaceScopeRules(targetType, targetKey, scopes, actorId) {
  await pool.query(
    `DELETE FROM permission_scope_rules
     WHERE target_type = $1 AND target_key = $2`,
    [targetType, targetKey]
  );

  for (const scope of scopes) {
    await pool.query(
      `INSERT INTO permission_scope_rules (target_type, target_key, scope_type, scope_value, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [targetType, targetKey, scope.scopeType, scope.scopeValue, actorId]
    );
  }
}

function buildScopeSummary(scopeRules) {
  return {
    outlets: scopeRules.filter((entry) => entry.scope_type === 'OUTLET').map((entry) => entry.scope_value),
    stages: scopeRules.filter((entry) => entry.scope_type === 'STAGE').map((entry) => entry.scope_value),
    departments: scopeRules.filter((entry) => entry.scope_type === 'DEPARTMENT').map((entry) => entry.scope_value),
  };
}

async function register(req, res, next) {
  try {
    const { fullName, email, role = 'SHOP_MANAGER', stageAccess = null, outletId = null, department = null } = req.body;
    const normalizedRole = normalizeRoleName(role);
    const roleMeta = getRoleMeta(normalizedRole);
    if (!fullName || !email) {
      return res.status(400).json({ message: 'fullName and email are required' });
    }
    if (!roleMeta) {
      return res.status(400).json({ message: 'Unsupported role' });
    }
    if (roleMeta.requiresOutlet && !outletId) {
      return res.status(400).json({ message: 'Outlet is required for retail outlet roles' });
    }
    if (roleMeta.requiresStage && !stageAccess) {
      return res.status(400).json({ message: 'Stage access is required for production supervisor' });
    }
    if (roleMeta.requiresDepartment && !String(department || '').trim()) {
      return res.status(400).json({ message: 'Department is required for this role' });
    }
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteTokenHash = hashInviteToken(inviteToken);
    const inviteExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    const pendingPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const { rows } = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role_id, stage_access, outlet_id, invite_token_hash, invite_expires_at, invite_sent_at, is_active, department)
       VALUES ($1, $2, $3, (SELECT id FROM roles WHERE name = $4), $5, $6, $7, $8, NOW(), false, $9)
       ON CONFLICT (email)
       DO UPDATE SET
         full_name = EXCLUDED.full_name,
         role_id = EXCLUDED.role_id,
         stage_access = EXCLUDED.stage_access,
         outlet_id = EXCLUDED.outlet_id,
         invite_token_hash = EXCLUDED.invite_token_hash,
         invite_expires_at = EXCLUDED.invite_expires_at,
         invite_sent_at = NOW(),
         is_active = false,
         invite_accepted_at = NULL,
         password_set_at = NULL,
         department = EXCLUDED.department
       RETURNING id, full_name, email, stage_access,
       (SELECT name FROM production_stages WHERE id = stage_access) AS stage_name,
       (SELECT name FROM roles WHERE id = role_id) AS role, outlet_id,
       (SELECT name FROM outlets WHERE id = outlet_id) AS outlet_name, department`,
      [fullName, email.toLowerCase(), pendingPasswordHash, normalizedRole, stageAccess, outletId, inviteTokenHash, inviteExpiresAt, department]
    );

    const user = rows[0];
    const inviteLink = buildInviteLink(req, inviteToken);
    const subject = 'Confirm your MTO account';
    const body = `Hello ${user.full_name},\n\nUse this link to confirm your account and set your password:\n${inviteLink}\n\nThis invite expires on ${inviteExpiresAt.toISOString()}.\n`;
    const emailResult = await sendInviteEmail({
      userId: user.id,
      emailTo: user.email,
      subject,
      body,
    });
    await writeUserAudit({
      userId: user.id,
      actorId: req.user?.id || null,
      actionType: 'USER_INVITED',
      afterData: { email: user.email, role: user.role, outletId, stageAccess, department },
    });
    res.status(201).json({ user, inviteLink, emailStatus: emailResult.deliveryStatus });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ message: 'Email already exists' });
    }
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const securitySettings = await getSecuritySettingsMap();
    const maxFailedAttempts = Number(securitySettings.LOCKOUT_POLICY?.max_failed_attempts || 5);
    const lockoutMinutes = Number(securitySettings.LOCKOUT_POLICY?.lockout_minutes || 30);
    const identifier = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!identifier || !password) return res.status(401).json({ message: 'Invalid credentials' });

    let user = null;
    let outletHashPassword = null;

    const byEmail = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.password_hash, u.stage_access, ps.name AS stage_name, r.name AS role,
              u.invite_accepted_at, u.is_active, u.last_login_at, u.failed_login_attempts, u.locked_until, u.force_password_reset,
              COALESCE(rp.permissions, '{}'::jsonb) AS role_permissions,
              COALESCE(upo.permissions, '{}'::jsonb) AS user_permissions,
              u.outlet_id, o.name AS outlet_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN user_permission_overrides upo ON upo.user_id = u.id
       LEFT JOIN production_stages ps ON ps.id = u.stage_access
       LEFT JOIN outlets o ON o.id = u.outlet_id
       WHERE u.email = $1`,
      [identifier]
    );
    if (byEmail.rows[0]) {
      user = byEmail.rows[0];
    } else {
      const byOutletUsername = await pool.query(
        `SELECT u.id, u.full_name, u.email, u.password_hash, u.stage_access, ps.name AS stage_name, r.name AS role,
                u.invite_accepted_at, u.is_active, u.last_login_at, u.failed_login_attempts, u.locked_until, u.force_password_reset,
                COALESCE(rp.permissions, '{}'::jsonb) AS role_permissions,
                COALESCE(upo.permissions, '{}'::jsonb) AS user_permissions,
                u.outlet_id, o.name AS outlet_name,
                c.password_hash AS outlet_password_hash
         FROM outlet_credentials c
         JOIN outlets o ON o.id = c.outlet_id AND o.is_active = true
         JOIN users u ON u.outlet_id = c.outlet_id
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN user_permission_overrides upo ON upo.user_id = u.id
         LEFT JOIN production_stages ps ON ps.id = u.stage_access
         WHERE LOWER(c.username) = $1
         LIMIT 1`,
        [identifier]
      );
      if (byOutletUsername.rows[0]) {
        user = byOutletUsername.rows[0];
        outletHashPassword = byOutletUsername.rows[0].outlet_password_hash || null;
      }
    }

    if (!user) return res.status(401).json({ message: 'Invalid credentials' });
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(423).json({ message: 'Account is temporarily locked' });
    }
    if (!user.is_active || !user.invite_accepted_at) {
      return res.status(403).json({ message: 'Account invite has not been accepted yet' });
    }

    const validHash = await bcrypt.compare(password, user.password_hash || '');
    const validOutletHash = outletHashPassword ? await bcrypt.compare(password, outletHashPassword) : false;
    if (!validHash && !validOutletHash) {
      authFailedCounter.inc();
      const nextAttempts = Number(user.failed_login_attempts || 0) + 1;
      const lockUntil = nextAttempts >= maxFailedAttempts
        ? new Date(Date.now() + lockoutMinutes * 60000)
        : null;
      await pool.query(
        `UPDATE users
         SET failed_login_attempts = $2,
             locked_until = COALESCE($3::timestamp, locked_until)
         WHERE id = $1`,
        [user.id, nextAttempts, lockUntil ? lockUntil.toISOString() : null]
      );
      await writeUserAudit({
        userId: user.id,
        actionType: 'LOGIN_FAILED',
        afterData: { failed_login_attempts: nextAttempts, locked_until: lockUntil },
      });
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    await pool.query(
      `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           last_login_at = NOW()
       WHERE id = $1`,
      [user.id]
    );
    await writeUserAudit({
      userId: user.id,
      actionType: 'LOGIN_SUCCESS',
      afterData: { last_login_at: new Date().toISOString() },
    });
    const client = await pool.connect();
    let session;
    try {
      await client.query('BEGIN');
      session = await createSession(client, user.id, req);
      await client.query('COMMIT');
    } catch (sessionError) {
      await client.query('ROLLBACK');
      throw sessionError;
    } finally {
      client.release();
    }

    user.permissions = buildEffectivePermissions(user.role, user.role_permissions, user.user_permissions);
    const accessToken = signAccessToken(user, session.sessionId);
    const refreshToken = session.refreshTokenRaw;
    delete user.password_hash;
    delete user.outlet_password_hash;
    delete user.role_permissions;
    delete user.user_permissions;
    res.json({
      token: accessToken,
      accessToken,
      refreshToken,
      user,
    });
  } catch (error) {
    next(error);
  }
}

async function refreshSessionToken(req, res, next) {
  try {
    const refreshTokenRaw = String(req.body?.refreshToken || '').trim();
    if (!refreshTokenRaw) {
      return res.status(401).json({ message: 'Refresh token is required' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const session = await findSessionByRefreshToken(client, refreshTokenRaw);
      if (!session) {
        await client.query('ROLLBACK');
        return res.status(401).json({ message: 'Refresh token is invalid or expired' });
      }

      const userRes = await client.query(
        `SELECT u.id, u.full_name, u.email, u.stage_access, ps.name AS stage_name, r.name AS role,
                COALESCE(rp.permissions, '{}'::jsonb) AS role_permissions,
                COALESCE(upo.permissions, '{}'::jsonb) AS user_permissions,
                u.outlet_id, o.name AS outlet_name
         FROM users u
         JOIN roles r ON r.id = u.role_id
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         LEFT JOIN user_permission_overrides upo ON upo.user_id = u.id
         LEFT JOIN outlets o ON o.id = u.outlet_id
         LEFT JOIN production_stages ps ON ps.id = u.stage_access
         WHERE u.id = $1`,
        [session.user_id]
      );
      const user = userRes.rows[0];
      if (!user) {
        await client.query(
          `UPDATE user_sessions
           SET revoked_at = NOW(), revoked_reason = 'USER_NOT_FOUND'
           WHERE id = $1`,
          [session.id]
        );
        await client.query('COMMIT');
        return res.status(401).json({ message: 'User no longer available' });
      }

      user.permissions = buildEffectivePermissions(user.role, user.role_permissions, user.user_permissions);
      const nextRefreshToken = crypto.randomBytes(32).toString('hex');
      const rotateResult = await client.query(
        `UPDATE user_sessions
         SET refresh_token_hash = $2,
             last_seen_at = NOW()
         WHERE id = $1
           AND revoked_at IS NULL
           AND expires_at > NOW()`,
        [session.id, hashInviteToken(nextRefreshToken)]
      );
      if (!rotateResult.rowCount) {
        await client.query('ROLLBACK');
        return res.status(401).json({ message: 'Session expired. Please login again.' });
      }
      await client.query('COMMIT');

      const accessToken = signAccessToken(user, session.id);
      delete user.role_permissions;
      delete user.user_permissions;

      res.json({ token: accessToken, accessToken, refreshToken: nextRefreshToken, user });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
}

async function logoutSession(req, res, next) {
  try {
    const refreshTokenRaw = String(req.body?.refreshToken || '').trim();
    const authorization = String(req.headers.authorization || '');
    const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    let sessionId = null;

    if (refreshTokenRaw) {
      const session = await findSessionByRefreshToken(pool, refreshTokenRaw);
      if (session?.id) {
        sessionId = session.id;
      }
    }
    if (!sessionId && accessToken) {
      try {
        const payload = jwt.verify(accessToken, env.jwtSecret);
        sessionId = payload?.sid || null;
      } catch (_error) {
        // Ignore invalid access token at logout.
      }
    }

    if (sessionId) {
      await pool.query(
        `UPDATE user_sessions
         SET revoked_at = NOW(), revoked_reason = 'USER_LOGOUT'
         WHERE id = $1`,
        [sessionId]
      );
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function listUsers(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.email, r.name AS role, ps.name AS stage_name, o.name AS outlet_name,
              COALESCE(upo.permissions, '{}'::jsonb) AS user_permissions,
              u.is_active, u.invite_sent_at, u.invite_accepted_at, u.invite_expires_at, u.invite_revoked_at,
              u.last_login_at, u.failed_login_attempts, u.locked_until, u.force_password_reset, u.department
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN user_permission_overrides upo ON upo.user_id = u.id
       LEFT JOIN production_stages ps ON ps.id = u.stage_access
       LEFT JOIN outlets o ON o.id = u.outlet_id
       ORDER BY u.created_at DESC`
    );
    res.json({ users: rows });
  } catch (error) {
    next(error);
  }
}

async function acceptInvite(req, res, next) {
  try {
    const token = String(req.body?.token || '').trim();
    const password = String(req.body?.password || '');
    if (!token || !password) {
      return res.status(400).json({ message: 'token and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const tokenHash = hashInviteToken(token);
    const userRes = await pool.query(
      `SELECT u.id, u.full_name, u.email, u.stage_access, ps.name AS stage_name, r.name AS role,
              COALESCE(rp.permissions, '{}'::jsonb) AS role_permissions,
              COALESCE(upo.permissions, '{}'::jsonb) AS user_permissions,
              u.outlet_id, o.name AS outlet_name,
              u.invite_expires_at
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN user_permission_overrides upo ON upo.user_id = u.id
       LEFT JOIN production_stages ps ON ps.id = u.stage_access
       LEFT JOIN outlets o ON o.id = u.outlet_id
       WHERE u.invite_token_hash = $1`,
      [tokenHash]
    );
    const user = userRes.rows[0];
    if (!user) return res.status(400).json({ message: 'Invalid invite token' });
    if (user.invite_expires_at && new Date(user.invite_expires_at) < new Date()) {
      return res.status(400).json({ message: 'Invite token has expired' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      `UPDATE users
       SET password_hash = $2,
           invite_token_hash = NULL,
           invite_expires_at = NULL,
           invite_accepted_at = NOW(),
           password_set_at = NOW(),
           is_active = true
       WHERE id = $1`,
      [user.id, passwordHash]
    );
    await storePasswordHistory(user.id, passwordHash);
    await writeUserAudit({
      userId: user.id,
      actionType: 'INVITE_ACCEPTED',
      afterData: { invite_accepted_at: new Date().toISOString() },
    });

    const authUser = { ...user };
    authUser.permissions = buildEffectivePermissions(user.role, user.role_permissions, user.user_permissions);
    delete authUser.invite_expires_at;
    delete authUser.role_permissions;
    delete authUser.user_permissions;

    const client = await pool.connect();
    let session;
    try {
      await client.query('BEGIN');
      session = await createSession(client, authUser.id, req);
      await client.query('COMMIT');
    } catch (sessionError) {
      await client.query('ROLLBACK');
      throw sessionError;
    } finally {
      client.release();
    }

    const accessToken = signAccessToken(authUser, session.sessionId);
    const refreshToken = session.refreshTokenRaw;
    res.json({
      token: accessToken,
      accessToken,
      refreshToken,
      user: authUser,
    });
  } catch (error) {
    next(error);
  }
}

async function resendInvite(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const userRes = await pool.query(
      `SELECT u.id, u.full_name, u.email, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1`,
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ message: 'User not found' });

    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteTokenHash = hashInviteToken(inviteToken);
    const inviteExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
    await pool.query(
      `UPDATE users
       SET invite_token_hash = $2,
           invite_expires_at = $3,
           invite_sent_at = NOW(),
           invite_revoked_at = NULL,
           invite_accepted_at = NULL,
           is_active = false
       WHERE id = $1`,
      [userId, inviteTokenHash, inviteExpiresAt]
    );
    const inviteLink = buildInviteLink(req, inviteToken);
    const body = `Hello ${user.full_name},\n\nUse this link to confirm your account and set your password:\n${inviteLink}\n\nThis invite expires on ${inviteExpiresAt.toISOString()}.\n`;
    const emailResult = await sendInviteEmail({ userId, emailTo: user.email, subject: 'Confirm your MTO account', body });
    await writeUserAudit({ userId, actorId: req.user.id, actionType: 'INVITE_RESENT', afterData: { invite_expires_at: inviteExpiresAt } });
    res.json({ inviteLink, emailStatus: emailResult.deliveryStatus });
  } catch (error) {
    next(error);
  }
}

async function revokeInvite(req, res, next) {
  try {
    const userId = Number(req.params.id);
    await pool.query(
      `UPDATE users
       SET invite_token_hash = NULL,
           invite_expires_at = NULL,
           invite_revoked_at = NOW(),
           is_active = false
       WHERE id = $1`,
      [userId]
    );
    await writeUserAudit({ userId, actorId: req.user.id, actionType: 'INVITE_REVOKED' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function updateUserStatus(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const { action } = req.body || {};
    const beforeRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
    const before = beforeRes.rows[0];
    if (!before) return res.status(404).json({ message: 'User not found' });

    if (action === 'suspend') {
      await pool.query(`UPDATE users SET is_active = false, suspended_at = NOW(), suspended_by = $2 WHERE id = $1`, [userId, req.user.id]);
    } else if (action === 'reactivate') {
      await pool.query(`UPDATE users SET is_active = true, suspended_at = NULL, suspended_by = NULL, locked_until = NULL WHERE id = $1`, [userId]);
    } else if (action === 'force_password_reset') {
      await pool.query(`UPDATE users SET force_password_reset = true WHERE id = $1`, [userId]);
    } else {
      return res.status(400).json({ message: 'Unsupported action' });
    }

    const afterRes = await pool.query(`SELECT * FROM users WHERE id = $1`, [userId]);
    await writeUserAudit({ userId, actorId: req.user.id, actionType: `USER_${String(action).toUpperCase()}`, beforeData: before, afterData: afterRes.rows[0] });
    res.json({ user: afterRes.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function getUserSecurityDashboard(_req, res, next) {
  try {
    const [auditRes, settingsRes, emailLogRes, summaryRes] = await Promise.all([
      pool.query(
        `SELECT a.id, a.user_id, a.actor_id, a.action_type, a.before_data, a.after_data, a.created_at,
                u1.full_name AS user_name, u2.full_name AS actor_name
         FROM user_account_audit_logs a
         LEFT JOIN users u1 ON u1.id = a.user_id
         LEFT JOIN users u2 ON u2.id = a.actor_id
         ORDER BY a.created_at DESC, a.id DESC
         LIMIT 500`
      ),
      pool.query(`SELECT setting_key, setting_value FROM auth_security_settings`),
      pool.query(
        `SELECT e.id, e.user_id, e.email_to, e.subject, e.body, e.delivery_status, e.transport_response, e.created_at,
                u.full_name AS user_name
         FROM user_invite_emails e
         LEFT JOIN users u ON u.id = e.user_id
         ORDER BY e.created_at DESC, e.id DESC
         LIMIT 200`
      ),
      pool.query(
        `SELECT
           COUNT(*)::int AS total_users,
           COUNT(*) FILTER (WHERE invite_accepted_at IS NOT NULL AND is_active = true)::int AS active_users,
           COUNT(*) FILTER (WHERE invite_accepted_at IS NULL AND invite_revoked_at IS NULL AND (invite_expires_at IS NULL OR invite_expires_at >= NOW()))::int AS pending_invites,
           COUNT(*) FILTER (WHERE invite_expires_at IS NOT NULL AND invite_expires_at < NOW() AND invite_accepted_at IS NULL)::int AS expired_invites,
           COUNT(*) FILTER (WHERE invite_revoked_at IS NOT NULL)::int AS revoked_invites,
           COUNT(*) FILTER (WHERE locked_until IS NOT NULL AND locked_until > NOW())::int AS locked_users,
           COUNT(*) FILTER (WHERE suspended_at IS NOT NULL AND is_active = false)::int AS suspended_users,
           COUNT(*) FILTER (WHERE force_password_reset = true)::int AS force_reset_users
         FROM users`
      ),
    ]);
    res.json({
      audits: auditRes.rows,
      settings: settingsRes.rows,
      emailLogs: emailLogRes.rows,
      summary: summaryRes.rows[0] || {},
    });
  } catch (error) {
    next(error);
  }
}

async function bulkUserAction(req, res, next) {
  try {
    const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds.map((value) => Number(value)).filter(Boolean) : [];
    const action = String(req.body?.action || '').trim().toLowerCase();
    if (!userIds.length) return res.status(400).json({ message: 'userIds are required' });
    if (!['suspend', 'reactivate', 'force_password_reset'].includes(action)) {
      return res.status(400).json({ message: 'Unsupported bulk action' });
    }

    for (const userId of userIds) {
      if (action === 'suspend') {
        await pool.query(`UPDATE users SET is_active = false, suspended_at = NOW(), suspended_by = $2 WHERE id = $1`, [userId, req.user.id]);
      } else if (action === 'reactivate') {
        await pool.query(`UPDATE users SET is_active = true, suspended_at = NULL, suspended_by = NULL, locked_until = NULL WHERE id = $1`, [userId]);
      } else if (action === 'force_password_reset') {
        await pool.query(`UPDATE users SET force_password_reset = true WHERE id = $1`, [userId]);
      }
      await writeUserAudit({ userId, actorId: req.user.id, actionType: `USER_BULK_${action.toUpperCase()}` });
    }

    res.json({ success: true, count: userIds.length });
  } catch (error) {
    next(error);
  }
}

async function updateSecuritySetting(req, res, next) {
  try {
    const { settingKey, settingValue } = req.body || {};
    const saved = await pool.query(
      `INSERT INTO auth_security_settings (setting_key, setting_value, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (setting_key)
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [String(settingKey || '').trim().toUpperCase(), JSON.stringify(settingValue || {}), req.user.id]
    );
    await writeUserAudit({ actorId: req.user.id, actionType: 'SECURITY_SETTING_UPDATED', afterData: saved.rows[0] });
    res.json({ setting: saved.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function updateOwnProfile(req, res, next) {
  try {
    const { fullName } = req.body || {};
    const beforeRes = await pool.query(`SELECT id, full_name, email FROM users WHERE id = $1`, [req.user.id]);
    const before = beforeRes.rows[0];
    await pool.query(`UPDATE users SET full_name = COALESCE($2, full_name) WHERE id = $1`, [req.user.id, fullName || null]);
    const afterRes = await pool.query(`SELECT id, full_name, email FROM users WHERE id = $1`, [req.user.id]);
    await writeUserAudit({ userId: req.user.id, actorId: req.user.id, actionType: 'PROFILE_UPDATED', beforeData: before, afterData: afterRes.rows[0] });
    res.json({ user: afterRes.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function changeOwnPassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return res.status(400).json({ message: 'Current and new password are required' });
    const settings = await getSecuritySettingsMap();
    const minLength = Number(settings.PASSWORD_POLICY?.min_length || 8);
    const historyCount = Number(settings.PASSWORD_POLICY?.history_count || 5);
    if (String(newPassword).length < minLength) return res.status(400).json({ message: `Password must be at least ${minLength} characters` });

    const userRes = await pool.query(`SELECT id, password_hash FROM users WHERE id = $1`, [req.user.id]);
    const user = userRes.rows[0];
    const valid = await bcrypt.compare(String(currentPassword), user.password_hash || '');
    if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });

    const historyRes = await pool.query(
      `SELECT password_hash
       FROM user_password_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.user.id, historyCount]
    );
    for (const row of historyRes.rows) {
      const reused = await bcrypt.compare(String(newPassword), row.password_hash);
      if (reused) return res.status(400).json({ message: 'New password must not match recent passwords' });
    }

    const newHash = await bcrypt.hash(String(newPassword), 10);
    await pool.query(
      `UPDATE users
       SET password_hash = $2,
           password_set_at = NOW(),
           force_password_reset = false
       WHERE id = $1`,
      [req.user.id, newHash]
    );
    await storePasswordHistory(req.user.id, newHash);
    await writeUserAudit({ userId: req.user.id, actorId: req.user.id, actionType: 'PASSWORD_CHANGED' });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function requestEmailChange(req, res, next) {
  try {
    const newEmail = String(req.body?.newEmail || '').trim().toLowerCase();
    if (!newEmail) return res.status(400).json({ message: 'newEmail is required' });
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashInviteToken(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);
    await pool.query(
      `INSERT INTO user_email_change_requests (user_id, new_email, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [req.user.id, newEmail, tokenHash, expiresAt]
    );
    const frontendBase = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`.replace(':4000', ':3000');
    const confirmLink = `${frontendBase}/?page=confirm-email-change&token=${encodeURIComponent(token)}`;
    await sendInviteEmail({
      userId: req.user.id,
      emailTo: newEmail,
      subject: 'Confirm your email change',
      body: `Confirm your new email for MTO:\n${confirmLink}\nThis link expires on ${expiresAt.toISOString()}.`,
    });
    await writeUserAudit({ userId: req.user.id, actorId: req.user.id, actionType: 'EMAIL_CHANGE_REQUESTED', afterData: { newEmail } });
    res.json({ success: true, confirmLink });
  } catch (error) {
    next(error);
  }
}

async function confirmEmailChange(req, res, next) {
  try {
    const token = String(req.body?.token || '').trim();
    const tokenHash = hashInviteToken(token);
    const requestRes = await pool.query(
      `SELECT * FROM user_email_change_requests
       WHERE token_hash = $1 AND used_at IS NULL`,
      [tokenHash]
    );
    const requestRow = requestRes.rows[0];
    if (!requestRow) return res.status(400).json({ message: 'Invalid email change token' });
    if (new Date(requestRow.expires_at) < new Date()) return res.status(400).json({ message: 'Email change token expired' });
    const beforeRes = await pool.query(`SELECT id, email FROM users WHERE id = $1`, [requestRow.user_id]);
    const before = beforeRes.rows[0];
    await pool.query(`UPDATE users SET email = $2 WHERE id = $1`, [requestRow.user_id, requestRow.new_email]);
    await pool.query(`UPDATE user_email_change_requests SET used_at = NOW() WHERE id = $1`, [requestRow.id]);
    const afterRes = await pool.query(`SELECT id, email FROM users WHERE id = $1`, [requestRow.user_id]);
    await writeUserAudit({ userId: requestRow.user_id, actionType: 'EMAIL_CHANGED', beforeData: before, afterData: afterRes.rows[0] });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function listStages(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, sequence
       FROM production_stages
       ORDER BY sequence ASC`
    );
    res.json({ stages: rows });
  } catch (error) {
    next(error);
  }
}

async function listAssignableRolesController(_req, res, next) {
  try {
    res.json({ roles: listAssignableRoles() });
  } catch (error) {
    next(error);
  }
}

async function listRoleRights(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.id, r.name AS role, COALESCE(rp.permissions, '{}'::jsonb) AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       ORDER BY r.name ASC`
    );
    const rolesWithScopes = await Promise.all(rows.map(async (row) => {
      const scopeRules = await getScopeRules('ROLE', row.role);
      return {
        ...row,
        scope_rules: scopeRules,
        effective_permissions: buildEffectivePermissions(row.role, row.permissions, {}),
      };
    }));
    res.json({ roles: rolesWithScopes, permissionCatalog: getPermissionCatalog() });
  } catch (error) {
    next(error);
  }
}

async function listUserPermissionOverrides(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.email, r.name AS role,
              COALESCE(upo.permissions, '{}'::jsonb) AS permissions
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN user_permission_overrides upo ON upo.user_id = u.id
       ORDER BY u.full_name ASC`
    );
    const usersWithScopes = await Promise.all(rows.map(async (row) => {
      const scopeRules = await getScopeRules('USER', String(row.id));
      return {
        ...row,
        scope_rules: scopeRules,
        effective_permissions: buildEffectivePermissions(row.role, {}, row.permissions),
      };
    }));
    res.json({ users: usersWithScopes, permissionCatalog: getPermissionCatalog() });
  } catch (error) {
    next(error);
  }
}

async function updateUserPermissionOverrides(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const permissions = req.body?.permissions;
    if (!userId) return res.status(400).json({ message: 'User is required' });
    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
      return res.status(400).json({ message: 'Permissions object is required' });
    }

    const normalized = normalizePermissionsInput(permissions);

    const saved = await pool.query(
      `INSERT INTO user_permission_overrides (user_id, permissions, updated_by, updated_at)
       VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET permissions = EXCLUDED.permissions, updated_by = EXCLUDED.updated_by, updated_at = NOW()
       RETURNING *`,
      [userId, JSON.stringify(normalized), req.user.id]
    );

    await writeUserAudit({
      userId,
      actorId: req.user.id,
      actionType: 'USER_PERMISSION_OVERRIDES_UPDATED',
      afterData: saved.rows[0],
    });

    res.json({ userId, permissions: normalized });
  } catch (error) {
    next(error);
  }
}

async function updateRoleRights(req, res, next) {
  try {
    const roleName = String(req.params.role || '').trim().toUpperCase();
    const permissions = req.body?.permissions;
    if (!roleName) return res.status(400).json({ message: 'Role is required' });
    if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
      return res.status(400).json({ message: 'Permissions object is required' });
    }

    const normalized = normalizePermissionsInput(permissions);

    const roleResult = await pool.query(`SELECT id, name FROM roles WHERE name = $1`, [roleName]);
    const role = roleResult.rows[0];
    if (!role) return res.status(404).json({ message: 'Role not found' });

    await pool.query(
      `INSERT INTO role_permissions (role_id, permissions, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (role_id)
       DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = NOW()`,
      [role.id, JSON.stringify(normalized)]
    );

    res.json({ role: role.name, permissions: normalized });
  } catch (error) {
    next(error);
  }
}

async function getRoleComparison(req, res, next) {
  try {
    const leftRole = String(req.query.leftRole || '').trim().toUpperCase();
    const rightRole = String(req.query.rightRole || '').trim().toUpperCase();
    if (!leftRole || !rightRole) {
      return res.status(400).json({ message: 'leftRole and rightRole are required' });
    }

    const { rows } = await pool.query(
      `SELECT r.name AS role, COALESCE(rp.permissions, '{}'::jsonb) AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE r.name IN ($1, $2)`,
      [leftRole, rightRole]
    );
    const left = rows.find((row) => row.role === leftRole);
    const right = rows.find((row) => row.role === rightRole);
    if (!left || !right) return res.status(404).json({ message: 'One or more roles were not found' });

    const leftEffective = buildEffectivePermissions(leftRole, left.permissions, {});
    const rightEffective = buildEffectivePermissions(rightRole, right.permissions, {});
    const permissionKeys = Array.from(new Set([...Object.keys(leftEffective), ...Object.keys(rightEffective)])).sort();
    const differences = permissionKeys
      .filter((key) => Boolean(leftEffective[key]) !== Boolean(rightEffective[key]))
      .map((key) => ({
        permission: key,
        left: Boolean(leftEffective[key]),
        right: Boolean(rightEffective[key]),
      }));

    const [leftScopes, rightScopes] = await Promise.all([
      getScopeRules('ROLE', leftRole),
      getScopeRules('ROLE', rightRole),
    ]);

    res.json({
      leftRole,
      rightRole,
      differences,
      left: { permissions: left.permissions, effective_permissions: leftEffective, scope_rules: leftScopes, scope_summary: buildScopeSummary(leftScopes) },
      right: { permissions: right.permissions, effective_permissions: rightEffective, scope_rules: rightScopes, scope_summary: buildScopeSummary(rightScopes) },
    });
  } catch (error) {
    next(error);
  }
}

async function cloneRoleRights(req, res, next) {
  try {
    const sourceRole = String(req.body?.sourceRole || '').trim().toUpperCase();
    const targetRole = String(req.body?.targetRole || '').trim().toUpperCase();
    const copyScopes = req.body?.copyScopes !== false;
    if (!sourceRole || !targetRole) {
      return res.status(400).json({ message: 'sourceRole and targetRole are required' });
    }

    const roleRes = await pool.query(`SELECT id, name FROM roles WHERE name IN ($1, $2) ORDER BY name ASC`, [sourceRole, targetRole]);
    const source = roleRes.rows.find((row) => row.name === sourceRole);
    const target = roleRes.rows.find((row) => row.name === targetRole);
    if (!source || !target) return res.status(404).json({ message: 'Role not found' });

    const sourcePermRes = await pool.query(
      `SELECT COALESCE(permissions, '{}'::jsonb) AS permissions
       FROM role_permissions
       WHERE role_id = $1`,
      [source.id]
    );
    const permissions = sourcePermRes.rows[0]?.permissions || {};
    await pool.query(
      `INSERT INTO role_permissions (role_id, permissions, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (role_id)
       DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = NOW()`,
      [target.id, JSON.stringify(permissions)]
    );

    if (copyScopes) {
      const sourceScopes = await getScopeRules('ROLE', sourceRole);
      await replaceScopeRules('ROLE', targetRole, sourceScopes.map((entry) => ({ scopeType: entry.scope_type, scopeValue: entry.scope_value })), req.user.id);
    }

    await writeUserAudit({
      actorId: req.user.id,
      actionType: 'ROLE_RIGHTS_CLONED',
      afterData: { sourceRole, targetRole, copyScopes },
    });

    res.json({ success: true, sourceRole, targetRole });
  } catch (error) {
    next(error);
  }
}

async function resetRoleRights(req, res, next) {
  try {
    const roleName = String(req.params.role || '').trim().toUpperCase();
    if (!roleName) return res.status(400).json({ message: 'Role is required' });

    await pool.query(`DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE name = $1)`, [roleName]);
    await replaceScopeRules('ROLE', roleName, [], req.user.id);
    await writeUserAudit({
      actorId: req.user.id,
      actionType: 'ROLE_RIGHTS_RESET_TO_TEMPLATE',
      afterData: { role: roleName },
    });

    res.json({ success: true, role: roleName, permissions: buildEffectivePermissions(roleName, {}, {}) });
  } catch (error) {
    next(error);
  }
}

async function resetUserPermissionOverrides(req, res, next) {
  try {
    const userId = Number(req.params.id);
    if (!userId) return res.status(400).json({ message: 'User is required' });

    await pool.query(`DELETE FROM user_permission_overrides WHERE user_id = $1`, [userId]);
    await replaceScopeRules('USER', String(userId), [], req.user.id);
    await writeUserAudit({
      userId,
      actorId: req.user.id,
      actionType: 'USER_PERMISSION_OVERRIDES_RESET',
    });
    res.json({ success: true, userId });
  } catch (error) {
    next(error);
  }
}

async function getEffectiveRolePermissions(req, res, next) {
  try {
    const roleName = String(req.params.role || '').trim().toUpperCase();
    const roleRes = await pool.query(
      `SELECT r.name AS role, COALESCE(rp.permissions, '{}'::jsonb) AS permissions
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE r.name = $1`,
      [roleName]
    );
    const row = roleRes.rows[0];
    if (!row) return res.status(404).json({ message: 'Role not found' });
    const scopeRules = await getScopeRules('ROLE', roleName);
    res.json({
      role: roleName,
      effective_permissions: buildEffectivePermissions(roleName, row.permissions, {}),
      role_permissions: row.permissions,
      scope_rules: scopeRules,
      scope_summary: buildScopeSummary(scopeRules),
    });
  } catch (error) {
    next(error);
  }
}

async function getEffectiveUserPermissions(req, res, next) {
  try {
    const userId = Number(req.params.id);
    const userRes = await pool.query(
      `SELECT u.id, u.full_name, u.email, r.name AS role,
              COALESCE(upo.permissions, '{}'::jsonb) AS user_permissions,
              COALESCE(rp.permissions, '{}'::jsonb) AS role_permissions,
              o.name AS outlet_name,
              ps.name AS stage_name,
              u.department
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       LEFT JOIN user_permission_overrides upo ON upo.user_id = u.id
       LEFT JOIN outlets o ON o.id = u.outlet_id
       LEFT JOIN production_stages ps ON ps.id = u.stage_access
       WHERE u.id = $1`,
      [userId]
    );
    const row = userRes.rows[0];
    if (!row) return res.status(404).json({ message: 'User not found' });
    const scopeRules = await getScopeRules('USER', String(userId));
    res.json({
      user: row,
      effective_permissions: buildEffectivePermissions(row.role, row.role_permissions, row.user_permissions),
      scope_rules: scopeRules,
      scope_summary: buildScopeSummary(scopeRules),
    });
  } catch (error) {
    next(error);
  }
}

async function listPermissionChangeRequests(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              req_user.full_name AS requested_by_name,
              rev_user.full_name AS reviewed_by_name
       FROM permission_change_requests r
       LEFT JOIN users req_user ON req_user.id = r.requested_by
       LEFT JOIN users rev_user ON rev_user.id = r.reviewed_by
       ORDER BY CASE WHEN r.status = 'PENDING' THEN 0 ELSE 1 END, r.created_at DESC, r.id DESC`
    );
    res.json({ requests: rows });
  } catch (error) {
    next(error);
  }
}

async function createPermissionChangeRequest(req, res, next) {
  try {
    const targetType = String(req.body?.targetType || '').trim().toUpperCase();
    const targetKey = String(req.body?.targetKey || '').trim();
    const requestType = String(req.body?.requestType || 'UPDATE').trim().toUpperCase();
    const requestedPermissions = normalizePermissionsInput(req.body?.requestedPermissions);
    const requestedScopes = normalizeScopesInput(req.body?.requestedScopes);
    const reason = String(req.body?.reason || '').trim();
    if (!['ROLE', 'USER'].includes(targetType) || !targetKey) {
      return res.status(400).json({ message: 'targetType and targetKey are required' });
    }

    let currentPermissions = {};
    let currentScopes = [];
    if (targetType === 'ROLE') {
      const roleRes = await pool.query(
        `SELECT COALESCE(rp.permissions, '{}'::jsonb) AS permissions
         FROM roles r
         LEFT JOIN role_permissions rp ON rp.role_id = r.id
         WHERE r.name = $1`,
        [String(targetKey).toUpperCase()]
      );
      if (!roleRes.rows[0]) return res.status(404).json({ message: 'Role not found' });
      currentPermissions = roleRes.rows[0].permissions || {};
      currentScopes = await getScopeRules('ROLE', String(targetKey).toUpperCase());
    } else {
      const userRes = await pool.query(
        `SELECT COALESCE(upo.permissions, '{}'::jsonb) AS permissions
         FROM users u
         LEFT JOIN user_permission_overrides upo ON upo.user_id = u.id
         WHERE u.id = $1`,
        [Number(targetKey)]
      );
      if (!userRes.rows[0]) return res.status(404).json({ message: 'User not found' });
      currentPermissions = userRes.rows[0].permissions || {};
      currentScopes = await getScopeRules('USER', String(Number(targetKey)));
    }

    const saved = await pool.query(
      `INSERT INTO permission_change_requests
       (target_type, target_key, request_type, requested_permissions, requested_scopes, current_permissions, current_scopes, reason, status, requested_by, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, 'PENDING', $9, NOW())
       RETURNING *`,
      [
        targetType,
        targetType === 'ROLE' ? String(targetKey).toUpperCase() : String(Number(targetKey)),
        requestType,
        JSON.stringify(requestedPermissions),
        JSON.stringify(requestedScopes),
        JSON.stringify(currentPermissions),
        JSON.stringify(currentScopes.map((entry) => ({ scopeType: entry.scope_type, scopeValue: entry.scope_value }))),
        reason || null,
        req.user.id,
      ]
    );

    await writeUserAudit({
      actorId: req.user.id,
      actionType: 'PERMISSION_CHANGE_REQUEST_CREATED',
      afterData: saved.rows[0],
    });

    res.status(201).json({ request: saved.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function reviewPermissionChangeRequest(req, res, next) {
  try {
    const requestId = Number(req.params.id);
    const action = String(req.body?.action || '').trim().toUpperCase();
    const reviewNotes = String(req.body?.reviewNotes || '').trim();
    if (!requestId || !['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ message: 'Valid request id and action are required' });
    }

    const requestRes = await pool.query(`SELECT * FROM permission_change_requests WHERE id = $1`, [requestId]);
    const requestRow = requestRes.rows[0];
    if (!requestRow) return res.status(404).json({ message: 'Permission change request not found' });
    if (requestRow.status !== 'PENDING') return res.status(400).json({ message: 'Request has already been reviewed' });

    if (action === 'APPROVE') {
      if (requestRow.target_type === 'ROLE') {
        const roleRes = await pool.query(`SELECT id FROM roles WHERE name = $1`, [requestRow.target_key]);
        if (!roleRes.rows[0]) return res.status(404).json({ message: 'Role not found' });
        await pool.query(
          `INSERT INTO role_permissions (role_id, permissions, updated_at)
           VALUES ($1, $2::jsonb, NOW())
           ON CONFLICT (role_id)
           DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = NOW()`,
          [roleRes.rows[0].id, JSON.stringify(requestRow.requested_permissions || {})]
        );
        await replaceScopeRules('ROLE', requestRow.target_key, normalizeScopesInput(requestRow.requested_scopes), req.user.id);
      } else {
        await pool.query(
          `INSERT INTO user_permission_overrides (user_id, permissions, updated_by, updated_at)
           VALUES ($1, $2::jsonb, $3, NOW())
           ON CONFLICT (user_id)
           DO UPDATE SET permissions = EXCLUDED.permissions, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
          [Number(requestRow.target_key), JSON.stringify(requestRow.requested_permissions || {}), req.user.id]
        );
        await replaceScopeRules('USER', requestRow.target_key, normalizeScopesInput(requestRow.requested_scopes), req.user.id);
      }
    }

    const saved = await pool.query(
      `UPDATE permission_change_requests
       SET status = $2,
           reviewed_by = $3,
           reviewed_at = NOW(),
           review_notes = $4
       WHERE id = $1
       RETURNING *`,
      [requestId, action === 'APPROVE' ? 'APPROVED' : 'REJECTED', req.user.id, reviewNotes || null]
    );

    await writeUserAudit({
      actorId: req.user.id,
      actionType: action === 'APPROVE' ? 'PERMISSION_CHANGE_REQUEST_APPROVED' : 'PERMISSION_CHANGE_REQUEST_REJECTED',
      afterData: saved.rows[0],
    });

    res.json({ request: saved.rows[0] });
  } catch (error) {
    next(error);
  }
}

async function listScopeRules(_req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT r.*,
              creator.full_name AS created_by_name
       FROM permission_scope_rules r
       LEFT JOIN users creator ON creator.id = r.created_by
       ORDER BY r.target_type ASC, r.target_key ASC, r.scope_type ASC, r.scope_value ASC`
    );
    res.json({ scopeRules: rows });
  } catch (error) {
    next(error);
  }
}

async function upsertScopeRules(req, res, next) {
  try {
    const targetType = String(req.body?.targetType || '').trim().toUpperCase();
    const targetKey = String(req.body?.targetKey || '').trim();
    const scopes = normalizeScopesInput(req.body?.scopes);
    if (!['ROLE', 'USER'].includes(targetType) || !targetKey) {
      return res.status(400).json({ message: 'targetType and targetKey are required' });
    }
    const normalizedTargetKey = targetType === 'ROLE' ? targetKey.toUpperCase() : String(Number(targetKey));
    await replaceScopeRules(targetType, normalizedTargetKey, scopes, req.user.id);
    await writeUserAudit({
      actorId: req.user.id,
      actionType: 'PERMISSION_SCOPE_RULES_UPDATED',
      afterData: { targetType, targetKey: normalizedTargetKey, scopes },
    });
    res.json({ targetType, targetKey: normalizedTargetKey, scopes });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  register,
  login,
  refreshSessionToken,
  logoutSession,
  acceptInvite,
  resendInvite,
  revokeInvite,
  updateUserStatus,
  bulkUserAction,
  getUserSecurityDashboard,
  updateSecuritySetting,
  updateOwnProfile,
  changeOwnPassword,
  requestEmailChange,
  confirmEmailChange,
  listUsers,
  listStages,
  listAssignableRoles: listAssignableRolesController,
  listRoleRights,
  updateRoleRights,
  getRoleComparison,
  cloneRoleRights,
  resetRoleRights,
  getEffectiveRolePermissions,
  listUserPermissionOverrides,
  updateUserPermissionOverrides,
  resetUserPermissionOverrides,
  getEffectiveUserPermissions,
  listPermissionChangeRequests,
  createPermissionChangeRequest,
  reviewPermissionChangeRequest,
  listScopeRules,
  upsertScopeRules,
};
