CREATE TABLE IF NOT EXISTS crm_knowledge_articles (
  id SERIAL PRIMARY KEY,
  title VARCHAR(220) NOT NULL,
  slug VARCHAR(220) UNIQUE NOT NULL,
  summary TEXT,
  body_markdown TEXT NOT NULL,
  category VARCHAR(80) DEFAULT 'GENERAL',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  published_at TIMESTAMP,
  owner_id INT REFERENCES users(id),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_knowledge_status
ON crm_knowledge_articles (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_entitlements (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  plan_name VARCHAR(120) NOT NULL,
  tier VARCHAR(40) NOT NULL DEFAULT 'STANDARD',
  start_date DATE NOT NULL,
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  business_hours_name VARCHAR(120),
  first_response_target_minutes INT NOT NULL DEFAULT 120,
  resolution_target_minutes INT NOT NULL DEFAULT 2880,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_entitlements_account
ON crm_entitlements (account_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_case_milestones (
  id SERIAL PRIMARY KEY,
  case_id INT NOT NULL REFERENCES crm_cases(id) ON DELETE CASCADE,
  entitlement_id INT REFERENCES crm_entitlements(id) ON DELETE SET NULL,
  milestone_name VARCHAR(120) NOT NULL,
  target_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'COMPLETED', 'BREACHED')),
  owner_id INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_case_milestones_case
ON crm_case_milestones (case_id, status, target_at);

CREATE TABLE IF NOT EXISTS crm_report_subscriptions (
  id SERIAL PRIMARY KEY,
  report_name VARCHAR(120) NOT NULL,
  subscriber_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schedule_type VARCHAR(20) NOT NULL DEFAULT 'WEEKLY'
    CHECK (schedule_type IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  schedule_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivery_channel VARCHAR(20) NOT NULL DEFAULT 'IN_APP'
    CHECK (delivery_channel IN ('IN_APP', 'EMAIL', 'WEBHOOK')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_report_subscriptions_user
ON crm_report_subscriptions (subscriber_user_id, active, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_webhooks (
  id SERIAL PRIMARY KEY,
  name VARCHAR(140) UNIQUE NOT NULL,
  target_url TEXT NOT NULL,
  secret_token VARCHAR(180),
  event_types TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  retry_limit INT NOT NULL DEFAULT 3,
  last_delivery_at TIMESTAMP,
  last_status VARCHAR(40),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_webhooks_active
ON crm_webhooks (is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_territories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(140) UNIQUE NOT NULL,
  region_code VARCHAR(40),
  description TEXT,
  manager_user_id INT REFERENCES users(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_account_territories (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  territory_id INT NOT NULL REFERENCES crm_territories(id) ON DELETE CASCADE,
  assigned_by INT REFERENCES users(id),
  assigned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (account_id, territory_id)
);

INSERT INTO crm_knowledge_articles (title, slug, summary, body_markdown, category, status, published_at)
VALUES
  ('CRM Getting Started', 'crm-getting-started', 'Initial runbook for CRM users', '# CRM Getting Started', 'GENERAL', 'PUBLISHED', NOW()),
  ('Case Escalation Policy', 'case-escalation-policy', 'How and when to escalate cases', '# Case Escalation Policy', 'SERVICE', 'PUBLISHED', NOW())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO crm_territories (name, region_code, description, is_active)
VALUES
  ('North Territory', 'NORTH', 'Primary coverage for north region', TRUE),
  ('South Territory', 'SOUTH', 'Primary coverage for south region', TRUE)
ON CONFLICT (name) DO NOTHING;
