const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const env = require('../config/env');
const { buildEffectivePermissions } = require('../config/permissions');

function signAccessToken(user, sessionId = null) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      stageAccess: user.stage_access || null,
      email: user.email,
      tokenType: 'access',
      sid: sessionId || null,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

function signRefreshToken(user, sessionId) {
  return jwt.sign(
    {
      sub: user.id,
      tokenType: 'refresh',
      sid: sessionId,
    },
    env.jwtSecret,
    { expiresIn: env.jwtRefreshExpiresIn }
  );
}

async function authRequired(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (payload.tokenType && payload.tokenType !== 'access') {
      return res.status(401).json({ message: 'Invalid access token type' });
    }

    if (payload.sid) {
      const sessionCheck = await pool.query(
        `SELECT id
         FROM user_sessions
         WHERE id = $1
           AND user_id = $2
           AND revoked_at IS NULL
           AND expires_at > NOW()
         LIMIT 1`,
        [payload.sid, payload.sub]
      );
      if (!sessionCheck.rows[0]) {
        return res.status(401).json({ message: 'Session expired. Please login again.' });
      }
    }

    const { rows } = await pool.query(
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
      [payload.sub]
    );

    if (!rows[0]) {
      return res.status(401).json({ message: 'Invalid token subject' });
    }

    req.user = {
      ...rows[0],
      permissions: buildEffectivePermissions(rows[0].role, rows[0].role_permissions, rows[0].user_permissions),
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (req.user.role === 'SUPER_USER') {
      return next();
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

function requirePermission(permissionKey) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (req.user.role === 'SUPER_USER') {
      return next();
    }
    if (!req.user.permissions?.[permissionKey]) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

function requireAnyPermission(...permissionKeys) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (req.user.role === 'SUPER_USER') {
      return next();
    }
    if (!permissionKeys.some((key) => Boolean(req.user.permissions?.[key]))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

function requireStageAccess() {
  return (req, res, next) => {
    if (['PRODUCTION_MANAGER', 'SUPER_USER'].includes(req.user.role)) {
      return next();
    }
    if (req.user.role !== 'PRODUCTION_SUPERVISOR') {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (!req.user.stage_access) {
      return res.status(400).json({ message: 'No stage assigned to this supervisor' });
    }
    next();
  };
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  authRequired,
  requireRoles,
  requirePermission,
  requireAnyPermission,
  requireStageAccess,
};
