ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP,
  ADD COLUMN IF NOT EXISTS invite_revoked_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS force_password_reset BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS suspended_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department TEXT;

CREATE TABLE IF NOT EXISTS user_password_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_password_history_user
  ON user_password_history(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_account_audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_account_audit_logs_user
  ON user_account_audit_logs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_email_change_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_email_change_requests_user
  ON user_email_change_requests(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS auth_security_settings (
  id SERIAL PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO auth_security_settings (setting_key, setting_value, updated_at)
VALUES
  ('PASSWORD_POLICY', '{"min_length": 8, "history_count": 5}', NOW()),
  ('LOCKOUT_POLICY', '{"max_failed_attempts": 5, "lockout_minutes": 30}', NOW()),
  ('TWO_FACTOR_POLICY', '{"enabled_roles": ["SUPER_USER", "FINANCE", "PRODUCTION_MANAGER"]}', NOW())
ON CONFLICT (setting_key) DO NOTHING;
