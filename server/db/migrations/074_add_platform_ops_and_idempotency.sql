CREATE TABLE IF NOT EXISTS idempotency_keys (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key VARCHAR(160) NOT NULL UNIQUE,
  route_signature VARCHAR(180) NOT NULL,
  request_hash VARCHAR(128) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'IN_PROGRESS',
  response_status INT,
  response_body JSONB,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at
  ON idempotency_keys (created_at DESC);

CREATE TABLE IF NOT EXISTS feature_flags (
  id BIGSERIAL PRIMARY KEY,
  flag_key VARCHAR(120) NOT NULL UNIQUE,
  flag_value JSONB NOT NULL DEFAULT 'false'::jsonb,
  description TEXT,
  scope VARCHAR(40) NOT NULL DEFAULT 'GLOBAL',
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_definitions (
  id BIGSERIAL PRIMARY KEY,
  workflow_key VARCHAR(120) NOT NULL UNIQUE,
  workflow_name VARCHAR(160) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INT REFERENCES users(id),
  updated_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_rules (
  id BIGSERIAL PRIMARY KEY,
  workflow_id BIGINT NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  rule_key VARCHAR(120) NOT NULL,
  condition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by INT REFERENCES users(id),
  updated_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(workflow_id, rule_key)
);

CREATE INDEX IF NOT EXISTS idx_workflow_rules_workflow_priority
  ON workflow_rules (workflow_id, priority ASC);

CREATE TABLE IF NOT EXISTS stage_sla_policies (
  id BIGSERIAL PRIMARY KEY,
  stage_id INT NOT NULL REFERENCES production_stages(id) ON DELETE CASCADE,
  max_hours NUMERIC(10,2) NOT NULL DEFAULT 48,
  escalation_to VARCHAR(120),
  active BOOLEAN NOT NULL DEFAULT true,
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(stage_id)
);

INSERT INTO feature_flags (flag_key, flag_value, description, scope)
VALUES
  ('platform_ops_dashboard', 'true'::jsonb, 'Enable platform operations workspace', 'GLOBAL'),
  ('workflow_engine_enabled', 'true'::jsonb, 'Enable dynamic workflow rule resolution', 'GLOBAL'),
  ('idempotency_protection_enabled', 'true'::jsonb, 'Enable idempotent POST protection for critical routes', 'GLOBAL')
ON CONFLICT (flag_key) DO NOTHING;

INSERT INTO workflow_definitions (workflow_key, workflow_name, active, definition_json)
VALUES
  ('default_mto', 'Default MTO Workflow', true, '{"startStage":"Verification","version":1}'::jsonb),
  ('bespoke_flow', 'Bespoke Workflow', true, '{"startStage":"Verification","route":"Bespoke"}'::jsonb),
  ('laser_flow', 'Laser Workflow', true, '{"startStage":"Verification","route":"Laser"}'::jsonb),
  ('embroidery_flow', 'Embroidery Workflow', true, '{"startStage":"Verification","route":"Embroidery"}'::jsonb)
ON CONFLICT (workflow_key) DO NOTHING;

INSERT INTO stage_sla_policies (stage_id, max_hours, escalation_to, active)
SELECT ps.id, 48, 'PRODUCTION_MANAGER', true
FROM production_stages ps
WHERE NOT EXISTS (
  SELECT 1 FROM stage_sla_policies sp WHERE sp.stage_id = ps.id
);
