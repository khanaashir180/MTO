CREATE TABLE IF NOT EXISTS permission_change_requests (
  id SERIAL PRIMARY KEY,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('ROLE', 'USER')),
  target_key VARCHAR(120) NOT NULL,
  request_type VARCHAR(40) NOT NULL,
  requested_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP NULL,
  review_notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permission_change_requests_status
  ON permission_change_requests(status, created_at DESC);

CREATE TABLE IF NOT EXISTS permission_scope_rules (
  id SERIAL PRIMARY KEY,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('ROLE', 'USER')),
  target_key VARCHAR(120) NOT NULL,
  scope_type VARCHAR(30) NOT NULL CHECK (scope_type IN ('OUTLET', 'STAGE', 'DEPARTMENT')),
  scope_value VARCHAR(255) NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_permission_scope_rules_target
  ON permission_scope_rules(target_type, target_key);
