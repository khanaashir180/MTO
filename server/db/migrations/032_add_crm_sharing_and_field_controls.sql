CREATE TABLE IF NOT EXISTS crm_account_shares (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_level VARCHAR(20) NOT NULL DEFAULT 'VIEW'
    CHECK (access_level IN ('VIEW', 'EDIT')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_account_shares_user
ON crm_account_shares (user_id, access_level);

CREATE TABLE IF NOT EXISTS crm_field_permissions (
  id SERIAL PRIMARY KEY,
  role_name VARCHAR(60) NOT NULL,
  field_name VARCHAR(80) NOT NULL,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (role_name, field_name)
);

INSERT INTO crm_field_permissions (role_name, field_name, can_edit)
VALUES
  ('SUPER_USER', 'customerName', true),
  ('SUPER_USER', 'customerAddress', true),
  ('SUPER_USER', 'email', true),
  ('SUPER_USER', 'preferredContact', true),
  ('SUPER_USER', 'customerStatus', true),
  ('SUPER_USER', 'leadScore', true),
  ('SUPER_USER', 'source', true),
  ('SUPER_USER', 'tags', true),
  ('SUPER_USER', 'notes', true),
  ('SUPER_USER', 'birthDate', true),
  ('SUPER_USER', 'anniversaryDate', true),
  ('FINANCE', 'customerName', true),
  ('FINANCE', 'customerAddress', true),
  ('FINANCE', 'email', true),
  ('FINANCE', 'preferredContact', true),
  ('FINANCE', 'customerStatus', true),
  ('FINANCE', 'leadScore', true),
  ('FINANCE', 'source', true),
  ('FINANCE', 'tags', true),
  ('FINANCE', 'notes', true),
  ('FINANCE', 'birthDate', true),
  ('FINANCE', 'anniversaryDate', true),
  ('RETAIL', 'customerName', true),
  ('RETAIL', 'customerAddress', true),
  ('RETAIL', 'email', true),
  ('RETAIL', 'preferredContact', true),
  ('RETAIL', 'customerStatus', false),
  ('RETAIL', 'leadScore', false),
  ('RETAIL', 'source', true),
  ('RETAIL', 'tags', true),
  ('RETAIL', 'notes', true),
  ('RETAIL', 'birthDate', true),
  ('RETAIL', 'anniversaryDate', true)
ON CONFLICT (role_name, field_name) DO UPDATE
SET can_edit = EXCLUDED.can_edit;
