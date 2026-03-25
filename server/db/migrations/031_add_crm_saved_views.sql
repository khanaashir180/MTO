CREATE TABLE IF NOT EXISTS crm_saved_views (
  id SERIAL PRIMARY KEY,
  module_name VARCHAR(40) NOT NULL DEFAULT 'CRM',
  view_name VARCHAR(120) NOT NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'PRIVATE'
    CHECK (scope IN ('PRIVATE', 'SHARED')),
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner_id INT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_saved_views_module_scope
ON crm_saved_views (module_name, scope);

CREATE INDEX IF NOT EXISTS idx_crm_saved_views_owner
ON crm_saved_views (owner_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_saved_views_owner_name
ON crm_saved_views (owner_id, module_name, LOWER(view_name));
