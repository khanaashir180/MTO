ALTER TABLE outlet_credentials
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- Transitional: keep column to allow controlled migration fallback at runtime.
ALTER TABLE outlet_credentials
  ALTER COLUMN password_plain DROP NOT NULL;

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  user_agent VARCHAR(240),
  ip_address VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  revoked_reason VARCHAR(120)
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user
  ON user_sessions(user_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS file_scan_logs (
  id BIGSERIAL PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  scan_engine VARCHAR(80) NOT NULL,
  scan_status VARCHAR(32) NOT NULL,
  details TEXT,
  scanned_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_scan_logs_scanned_at
  ON file_scan_logs(scanned_at DESC);
