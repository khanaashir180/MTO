CREATE TABLE IF NOT EXISTS crm_flows (
  id SERIAL PRIMARY KEY,
  flow_name VARCHAR(160) UNIQUE NOT NULL,
  flow_type VARCHAR(30) NOT NULL DEFAULT 'RECORD_TRIGGERED'
    CHECK (flow_type IN ('RECORD_TRIGGERED', 'SCHEDULED', 'SCREEN')),
  trigger_object VARCHAR(80),
  trigger_event VARCHAR(20),
  definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  version_number INT NOT NULL DEFAULT 1,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_flow_runs (
  id SERIAL PRIMARY KEY,
  flow_id INT NOT NULL REFERENCES crm_flows(id) ON DELETE CASCADE,
  context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS'
    CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED')),
  error_message TEXT,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_flow_runs_flow
ON crm_flow_runs (flow_id, started_at DESC);

CREATE TABLE IF NOT EXISTS crm_service_queues (
  id SERIAL PRIMARY KEY,
  queue_name VARCHAR(140) UNIQUE NOT NULL,
  channel_type VARCHAR(30) NOT NULL DEFAULT 'CASE'
    CHECK (channel_type IN ('CASE', 'CHAT', 'VOICE', 'TASK')),
  priority_model VARCHAR(30) NOT NULL DEFAULT 'FIFO'
    CHECK (priority_model IN ('FIFO', 'PRIORITY', 'SLA_FIRST')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_agent_skills (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_name VARCHAR(120) NOT NULL,
  proficiency INT NOT NULL DEFAULT 3 CHECK (proficiency BETWEEN 1 AND 5),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, skill_name)
);

CREATE TABLE IF NOT EXISTS crm_queue_members (
  id SERIAL PRIMARY KEY,
  queue_id INT NOT NULL REFERENCES crm_service_queues(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  capacity INT NOT NULL DEFAULT 5,
  presence_status VARCHAR(20) NOT NULL DEFAULT 'AVAILABLE'
    CHECK (presence_status IN ('AVAILABLE', 'AWAY', 'OFFLINE')),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (queue_id, user_id)
);

CREATE TABLE IF NOT EXISTS crm_work_items (
  id SERIAL PRIMARY KEY,
  channel_type VARCHAR(30) NOT NULL,
  reference_type VARCHAR(30),
  reference_id INT,
  subject VARCHAR(180) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  required_skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status VARCHAR(20) NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'ROUTED', 'IN_PROGRESS', 'COMPLETED', 'ESCALATED')),
  assigned_queue_id INT REFERENCES crm_service_queues(id) ON DELETE SET NULL,
  assigned_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_work_items_status
ON crm_work_items (status, priority, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_apps (
  id SERIAL PRIMARY KEY,
  app_key VARCHAR(120) UNIQUE NOT NULL,
  app_name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'INTEGRATION',
  publisher_name VARCHAR(120) NOT NULL,
  description TEXT,
  version_label VARCHAR(40) NOT NULL DEFAULT '1.0.0',
  pricing_model VARCHAR(30) NOT NULL DEFAULT 'FREE'
    CHECK (pricing_model IN ('FREE', 'PAID', 'TRIAL')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_installed_apps (
  id SERIAL PRIMARY KEY,
  app_id INT NOT NULL REFERENCES crm_apps(id) ON DELETE CASCADE,
  installed_by INT REFERENCES users(id),
  installed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DISABLED', 'UNINSTALLED')),
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (app_id)
);

INSERT INTO crm_flows (flow_name, flow_type, trigger_object, trigger_event, definition_json, active)
VALUES
  ('Auto Escalate Critical Cases', 'RECORD_TRIGGERED', 'CASE', 'UPDATE', '{"if":{"priority":"CRITICAL"},"then":{"action":"escalate"}}'::jsonb, TRUE),
  ('Lead Follow-up Reminder', 'SCHEDULED', 'LEAD', 'DAILY', '{"schedule":"0 9 * * *","action":"create_task"}'::jsonb, TRUE)
ON CONFLICT (flow_name) DO NOTHING;

INSERT INTO crm_service_queues (queue_name, channel_type, priority_model, active)
VALUES
  ('Service Tier 1', 'CASE', 'SLA_FIRST', TRUE),
  ('Sales Inbound', 'TASK', 'PRIORITY', TRUE)
ON CONFLICT (queue_name) DO NOTHING;

INSERT INTO crm_apps (app_key, app_name, category, publisher_name, description, pricing_model, active)
VALUES
  ('docsign_sync', 'DocSign Sync', 'INTEGRATION', 'MTO Labs', 'Sync quote signatures with external provider', 'TRIAL', TRUE),
  ('voice_connector', 'Voice Connector', 'SERVICE', 'MTO Labs', 'Attach voice call logs to cases', 'FREE', TRUE),
  ('advanced_cpq_ai', 'Advanced CPQ AI', 'SALES', 'MTO Labs', 'AI-assisted pricing recommendations', 'PAID', TRUE)
ON CONFLICT (app_key) DO NOTHING;
