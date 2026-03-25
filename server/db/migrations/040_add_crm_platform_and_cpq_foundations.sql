CREATE TABLE IF NOT EXISTS crm_custom_objects (
  id SERIAL PRIMARY KEY,
  api_name VARCHAR(120) UNIQUE NOT NULL,
  label VARCHAR(120) NOT NULL,
  plural_label VARCHAR(120) NOT NULL,
  description TEXT,
  deployment_status VARCHAR(20) NOT NULL DEFAULT 'DEPLOYED'
    CHECK (deployment_status IN ('IN_DEVELOPMENT', 'DEPLOYED')),
  sharing_model VARCHAR(20) NOT NULL DEFAULT 'PRIVATE'
    CHECK (sharing_model IN ('PRIVATE', 'PUBLIC_READ_ONLY', 'PUBLIC_READ_WRITE')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_custom_fields (
  id SERIAL PRIMARY KEY,
  object_id INT NOT NULL REFERENCES crm_custom_objects(id) ON DELETE CASCADE,
  api_name VARCHAR(120) NOT NULL,
  label VARCHAR(120) NOT NULL,
  data_type VARCHAR(30) NOT NULL
    CHECK (data_type IN ('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'PICKLIST', 'LONG_TEXT')),
  required BOOLEAN NOT NULL DEFAULT FALSE,
  unique_field BOOLEAN NOT NULL DEFAULT FALSE,
  default_value TEXT,
  picklist_values JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (object_id, api_name)
);

CREATE TABLE IF NOT EXISTS crm_record_types (
  id SERIAL PRIMARY KEY,
  object_id INT NOT NULL REFERENCES crm_custom_objects(id) ON DELETE CASCADE,
  developer_name VARCHAR(120) NOT NULL,
  label VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (object_id, developer_name)
);

CREATE TABLE IF NOT EXISTS crm_page_layouts (
  id SERIAL PRIMARY KEY,
  object_id INT NOT NULL REFERENCES crm_custom_objects(id) ON DELETE CASCADE,
  layout_name VARCHAR(120) NOT NULL,
  sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  assigned_record_type_id INT REFERENCES crm_record_types(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_role_hierarchy_nodes (
  id SERIAL PRIMARY KEY,
  role_name VARCHAR(120) UNIQUE NOT NULL,
  parent_role_id INT REFERENCES crm_role_hierarchy_nodes(id) ON DELETE SET NULL,
  owner_user_id INT REFERENCES users(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_org_wide_defaults (
  id SERIAL PRIMARY KEY,
  object_name VARCHAR(80) UNIQUE NOT NULL,
  internal_access VARCHAR(20) NOT NULL
    CHECK (internal_access IN ('PRIVATE', 'PUBLIC_READ_ONLY', 'PUBLIC_READ_WRITE')),
  external_access VARCHAR(20) NOT NULL
    CHECK (external_access IN ('PRIVATE', 'PUBLIC_READ_ONLY', 'PUBLIC_READ_WRITE')),
  updated_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_sharing_rules (
  id SERIAL PRIMARY KEY,
  object_name VARCHAR(80) NOT NULL,
  rule_name VARCHAR(120) UNIQUE NOT NULL,
  criteria_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  grant_access VARCHAR(20) NOT NULL
    CHECK (grant_access IN ('READ', 'EDIT')),
  target_scope VARCHAR(20) NOT NULL
    CHECK (target_scope IN ('ROLE', 'PUBLIC_GROUP', 'USER')),
  target_identifier VARCHAR(120) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_product_bundles (
  id SERIAL PRIMARY KEY,
  bundle_name VARCHAR(160) UNIQUE NOT NULL,
  bundle_code VARCHAR(80) UNIQUE NOT NULL,
  base_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_bundle_items (
  id SERIAL PRIMARY KEY,
  bundle_id INT NOT NULL REFERENCES crm_product_bundles(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES crm_products(id) ON DELETE CASCADE,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  min_qty NUMERIC(12,2) NOT NULL DEFAULT 1,
  max_qty NUMERIC(12,2),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (bundle_id, product_id)
);

CREATE TABLE IF NOT EXISTS crm_pricing_rules (
  id SERIAL PRIMARY KEY,
  rule_name VARCHAR(140) UNIQUE NOT NULL,
  scope VARCHAR(30) NOT NULL DEFAULT 'QUOTE_LINE'
    CHECK (scope IN ('QUOTE', 'QUOTE_LINE', 'BUNDLE')),
  condition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_discount_schedules (
  id SERIAL PRIMARY KEY,
  schedule_name VARCHAR(140) UNIQUE NOT NULL,
  applies_to VARCHAR(30) NOT NULL DEFAULT 'PRODUCT'
    CHECK (applies_to IN ('PRODUCT', 'BUNDLE')),
  target_id INT NOT NULL,
  tiers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_quote_approvals (
  id SERIAL PRIMARY KEY,
  quote_id INT NOT NULL REFERENCES crm_quotes(id) ON DELETE CASCADE,
  threshold_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  requested_by INT REFERENCES users(id),
  approver_id INT REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  decision_note TEXT,
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO crm_org_wide_defaults (object_name, internal_access, external_access)
VALUES
  ('ACCOUNT', 'PRIVATE', 'PRIVATE'),
  ('OPPORTUNITY', 'PRIVATE', 'PRIVATE'),
  ('CASE', 'PUBLIC_READ_ONLY', 'PRIVATE')
ON CONFLICT (object_name) DO NOTHING;
