CREATE TABLE IF NOT EXISTS finance_bank_provider_connections (
  id SERIAL PRIMARY KEY,
  provider_name VARCHAR(80) NOT NULL,
  connector_label VARCHAR(140) UNIQUE NOT NULL,
  auth_mode VARCHAR(30) NOT NULL DEFAULT 'OAUTH2',
  token_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'ERROR')),
  last_synced_at TIMESTAMP,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_bank_sync_runs (
  id SERIAL PRIMARY KEY,
  connection_id INT NOT NULL REFERENCES finance_bank_provider_connections(id) ON DELETE CASCADE,
  run_status VARCHAR(20) NOT NULL DEFAULT 'STARTED'
    CHECK (run_status IN ('STARTED', 'COMPLETED', 'FAILED')),
  imported_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  webhook_event_ref VARCHAR(120),
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_by INT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS finance_payment_gateways (
  id SERIAL PRIMARY KEY,
  gateway_name VARCHAR(100) UNIQUE NOT NULL,
  provider VARCHAR(80) NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_payment_links (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL
    CHECK (entity_type IN ('INVOICE', 'BILL')),
  entity_id INT NOT NULL,
  gateway_id INT REFERENCES finance_payment_gateways(id) ON DELETE SET NULL,
  link_code VARCHAR(90) UNIQUE NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency_code VARCHAR(12) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'PAID', 'EXPIRED', 'VOID')),
  expires_at TIMESTAMP,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_payment_transactions (
  id SERIAL PRIMARY KEY,
  payment_link_id INT REFERENCES finance_payment_links(id) ON DELETE SET NULL,
  gateway_id INT REFERENCES finance_payment_gateways(id) ON DELETE SET NULL,
  transaction_ref VARCHAR(120) UNIQUE NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS'
    CHECK (status IN ('SUCCESS', 'FAILED', 'REFUNDED', 'CHARGEBACK')),
  processed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by INT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS finance_chargebacks (
  id SERIAL PRIMARY KEY,
  payment_transaction_id INT NOT NULL REFERENCES finance_payment_transactions(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'WON', 'LOST', 'SETTLED')),
  opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP,
  created_by INT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS finance_document_templates (
  id SERIAL PRIMARY KEY,
  template_name VARCHAR(140) UNIQUE NOT NULL,
  document_type VARCHAR(30) NOT NULL
    CHECK (document_type IN ('INVOICE', 'BILL', 'STATEMENT', 'REMINDER')),
  subject_template VARCHAR(220),
  body_template TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_document_dispatch_logs (
  id SERIAL PRIMARY KEY,
  template_id INT REFERENCES finance_document_templates(id) ON DELETE SET NULL,
  entity_type VARCHAR(30) NOT NULL,
  entity_id INT,
  recipient VARCHAR(220) NOT NULL,
  channel VARCHAR(20) NOT NULL DEFAULT 'EMAIL'
    CHECK (channel IN ('EMAIL', 'SMS', 'IN_APP')),
  status VARCHAR(20) NOT NULL DEFAULT 'SENT'
    CHECK (status IN ('QUEUED', 'SENT', 'FAILED')),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_by INT REFERENCES users(id),
  sent_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_practice_clients (
  id SERIAL PRIMARY KEY,
  client_name VARCHAR(180) UNIQUE NOT NULL,
  legal_entity VARCHAR(180),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_practice_access (
  id SERIAL PRIMARY KEY,
  client_id INT NOT NULL REFERENCES finance_practice_clients(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_label VARCHAR(80) NOT NULL DEFAULT 'ACCOUNTANT',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, user_id)
);

CREATE TABLE IF NOT EXISTS finance_period_exception_approvals (
  id SERIAL PRIMARY KEY,
  period_month DATE NOT NULL,
  exception_type VARCHAR(40) NOT NULL
    CHECK (exception_type IN ('POST_CLOSE_JOURNAL', 'BACKDATED_PAYMENT', 'OTHER')),
  reason TEXT NOT NULL,
  requested_by INT REFERENCES users(id),
  approved_by INT REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_tax_rule_sets (
  id SERIAL PRIMARY KEY,
  rule_name VARCHAR(160) UNIQUE NOT NULL,
  jurisdiction_code VARCHAR(60),
  rule_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_payroll_rule_sets (
  id SERIAL PRIMARY KEY,
  rule_name VARCHAR(160) UNIQUE NOT NULL,
  country_code VARCHAR(10) NOT NULL DEFAULT 'US',
  rule_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
