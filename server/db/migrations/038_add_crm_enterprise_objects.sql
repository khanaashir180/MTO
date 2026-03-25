CREATE TABLE IF NOT EXISTS crm_contacts (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120),
  email VARCHAR(180),
  phone VARCHAR(60),
  title VARCHAR(120),
  department VARCHAR(120),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  owner_id INT REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'INACTIVE')),
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_account
ON crm_contacts (account_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(180) NOT NULL,
  type VARCHAR(60) NOT NULL DEFAULT 'GENERAL',
  status VARCHAR(20) NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED', 'ACTIVE', 'PAUSED', 'COMPLETED')),
  start_date DATE,
  end_date DATE,
  budget NUMERIC(12,2) NOT NULL DEFAULT 0,
  expected_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT,
  owner_id INT REFERENCES users(id),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_campaigns_status
ON crm_campaigns (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_campaign_members (
  id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES crm_campaigns(id) ON DELETE CASCADE,
  account_id INT REFERENCES customer_accounts(id) ON DELETE CASCADE,
  contact_id INT REFERENCES crm_contacts(id) ON DELETE CASCADE,
  member_status VARCHAR(40) NOT NULL DEFAULT 'TARGET'
    CHECK (member_status IN ('TARGET', 'SENT', 'RESPONDED', 'QUALIFIED', 'DISQUALIFIED')),
  source VARCHAR(80),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CHECK (account_id IS NOT NULL OR contact_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_crm_campaign_members_campaign
ON crm_campaign_members (campaign_id, member_status);

CREATE TABLE IF NOT EXISTS crm_products (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(80) UNIQUE NOT NULL,
  name VARCHAR(180) NOT NULL,
  family VARCHAR(100),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  description TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_price_books (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) UNIQUE NOT NULL,
  currency_code VARCHAR(12) NOT NULL DEFAULT 'USD',
  is_standard BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_price_book_items (
  id SERIAL PRIMARY KEY,
  price_book_id INT NOT NULL REFERENCES crm_price_books(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES crm_products(id) ON DELETE CASCADE,
  list_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (price_book_id, product_id)
);

CREATE TABLE IF NOT EXISTS crm_quotes (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  opportunity_id INT REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  price_book_id INT REFERENCES crm_price_books(id) ON DELETE SET NULL,
  quote_number VARCHAR(60) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED')),
  valid_until DATE,
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  owner_id INT REFERENCES users(id),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_quotes_account
ON crm_quotes (account_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS crm_quote_lines (
  id SERIAL PRIMARY KEY,
  quote_id INT NOT NULL REFERENCES crm_quotes(id) ON DELETE CASCADE,
  product_id INT REFERENCES crm_products(id) ON DELETE SET NULL,
  line_name VARCHAR(180) NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_assignment_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(140) UNIQUE NOT NULL,
  entity_type VARCHAR(30) NOT NULL
    CHECK (entity_type IN ('LEAD', 'CASE', 'TASK', 'OPPORTUNITY')),
  criteria_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_sla_policies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(140) UNIQUE NOT NULL,
  entity_type VARCHAR(30) NOT NULL
    CHECK (entity_type IN ('CASE', 'TASK')),
  priority VARCHAR(20),
  first_response_minutes INT NOT NULL DEFAULT 60,
  resolution_minutes INT NOT NULL DEFAULT 1440,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO crm_price_books (name, currency_code, is_standard, is_active)
VALUES ('Standard Price Book', 'USD', TRUE, TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO crm_assignment_rules (name, entity_type, criteria_json, action_json, is_active)
VALUES
  ('case_high_priority_escalation', 'CASE', '{"priority":["HIGH","CRITICAL"]}'::jsonb, '{"assign":"queue_service_tier2"}'::jsonb, TRUE),
  ('lead_hot_score_assignment', 'LEAD', '{"lead_score_gte":80}'::jsonb, '{"assign":"senior_sales_rep"}'::jsonb, TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO crm_sla_policies (name, entity_type, priority, first_response_minutes, resolution_minutes, is_active)
VALUES
  ('case_standard_sla', 'CASE', 'MEDIUM', 120, 2880, TRUE),
  ('case_critical_sla', 'CASE', 'CRITICAL', 30, 480, TRUE)
ON CONFLICT (name) DO NOTHING;
