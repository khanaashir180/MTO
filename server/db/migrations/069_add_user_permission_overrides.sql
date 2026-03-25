CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
