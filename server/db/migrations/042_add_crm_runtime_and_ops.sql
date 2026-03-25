CREATE TABLE IF NOT EXISTS crm_validation_rules (
  id SERIAL PRIMARY KEY,
  object_name VARCHAR(120) NOT NULL,
  rule_name VARCHAR(160) UNIQUE NOT NULL,
  condition_expr TEXT NOT NULL,
  error_message VARCHAR(220) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_formula_fields (
  id SERIAL PRIMARY KEY,
  object_name VARCHAR(120) NOT NULL,
  field_name VARCHAR(120) NOT NULL,
  formula_expr TEXT NOT NULL,
  data_type VARCHAR(30) NOT NULL DEFAULT 'TEXT',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (object_name, field_name)
);

CREATE TABLE IF NOT EXISTS crm_custom_records (
  id SERIAL PRIMARY KEY,
  object_api_name VARCHAR(120) NOT NULL,
  record_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  owner_id INT REFERENCES users(id),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_custom_records_object
ON crm_custom_records (object_api_name, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_flow_versions (
  id SERIAL PRIMARY KEY,
  flow_id INT NOT NULL REFERENCES crm_flows(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, version_number)
);

CREATE TABLE IF NOT EXISTS crm_flow_debug_traces (
  id SERIAL PRIMARY KEY,
  flow_run_id INT REFERENCES crm_flow_runs(id) ON DELETE CASCADE,
  flow_id INT REFERENCES crm_flows(id) ON DELETE CASCADE,
  trace_step VARCHAR(120) NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'INFO',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_job_definitions (
  id SERIAL PRIMARY KEY,
  job_name VARCHAR(160) UNIQUE NOT NULL,
  job_type VARCHAR(40) NOT NULL
    CHECK (job_type IN ('SHARING_RECALC', 'FLOW_SCHEDULE', 'REPORT_DELIVERY', 'DATA_SYNC')),
  schedule_cron VARCHAR(80),
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_job_runs (
  id SERIAL PRIMARY KEY,
  job_id INT NOT NULL REFERENCES crm_job_definitions(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS'
    CHECK (status IN ('SUCCESS', 'FAILED', 'RUNNING')),
  output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS crm_setup_audit_logs (
  id SERIAL PRIMARY KEY,
  area VARCHAR(80) NOT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id INT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by INT REFERENCES users(id),
  performed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_setup_audit_logs_time
ON crm_setup_audit_logs (performed_at DESC);

CREATE TABLE IF NOT EXISTS crm_package_versions (
  id SERIAL PRIMARY KEY,
  app_id INT NOT NULL REFERENCES crm_apps(id) ON DELETE CASCADE,
  version_label VARCHAR(40) NOT NULL,
  dependency_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  release_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (app_id, version_label)
);

INSERT INTO crm_validation_rules (object_name, rule_name, condition_expr, error_message, active)
VALUES
  ('OPPORTUNITY', 'opp_value_positive', '{"field":"expectedValue","op":"<=","value":0}', 'Expected value must be greater than 0', TRUE),
  ('CASE', 'case_subject_required', '{"field":"subject","op":"EMPTY"}', 'Case subject is required', TRUE)
ON CONFLICT (rule_name) DO NOTHING;

INSERT INTO crm_formula_fields (object_name, field_name, formula_expr, data_type, active)
VALUES
  ('OPPORTUNITY', 'weighted_value', '{"type":"multiply","fields":["expectedValue","probability"],"scale":0.01}', 'NUMBER', TRUE),
  ('ACCOUNT', 'display_name', '{"type":"concat","fields":["customerName","customerNumber"],"separator":" - "}', 'TEXT', TRUE)
ON CONFLICT (object_name, field_name) DO NOTHING;

INSERT INTO crm_job_definitions (job_name, job_type, schedule_cron, config_json, active)
VALUES
  ('nightly_sharing_recalc', 'SHARING_RECALC', '0 1 * * *', '{"scope":"all"}'::jsonb, TRUE),
  ('morning_report_delivery', 'REPORT_DELIVERY', '0 8 * * 1-5', '{"report":"executive"}'::jsonb, TRUE)
ON CONFLICT (job_name) DO NOTHING;
