CREATE TABLE IF NOT EXISTS finance_bank_feed_connectors (
  id SERIAL PRIMARY KEY,
  connector_name VARCHAR(120) UNIQUE NOT NULL,
  provider VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'ERROR')),
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_sync_at TIMESTAMP,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_bank_feed_import_runs (
  id SERIAL PRIMARY KEY,
  connector_id INT NOT NULL REFERENCES finance_bank_feed_connectors(id) ON DELETE CASCADE,
  run_status VARCHAR(20) NOT NULL DEFAULT 'STARTED'
    CHECK (run_status IN ('STARTED', 'COMPLETED', 'FAILED')),
  imported_count INT NOT NULL DEFAULT 0,
  duplicate_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_by INT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS finance_bank_feed_entries (
  id SERIAL PRIMARY KEY,
  connector_id INT NOT NULL REFERENCES finance_bank_feed_connectors(id) ON DELETE CASCADE,
  ext_tx_id VARCHAR(120) NOT NULL,
  tx_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency_code VARCHAR(12) NOT NULL DEFAULT 'USD',
  description TEXT,
  reference_no VARCHAR(120),
  payee_name VARCHAR(180),
  linked_bank_tx_id INT REFERENCES finance_bank_transactions(id) ON DELETE SET NULL,
  match_confidence NUMERIC(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (connector_id, ext_tx_id)
);

CREATE TABLE IF NOT EXISTS finance_sales_tax_jurisdictions (
  id SERIAL PRIMARY KEY,
  jurisdiction_code VARCHAR(60) UNIQUE NOT NULL,
  country_code VARCHAR(10) NOT NULL DEFAULT 'US',
  region_name VARCHAR(120) NOT NULL,
  tax_rate_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_sales_tax_nexus (
  id SERIAL PRIMARY KEY,
  jurisdiction_id INT NOT NULL REFERENCES finance_sales_tax_jurisdictions(id) ON DELETE CASCADE,
  outlet_name VARCHAR(160) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (jurisdiction_id, outlet_name)
);

CREATE TABLE IF NOT EXISTS finance_payroll_schedules (
  id SERIAL PRIMARY KEY,
  schedule_name VARCHAR(140) UNIQUE NOT NULL,
  frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY'
    CHECK (frequency IN ('WEEKLY', 'BIWEEKLY', 'MONTHLY')),
  next_pay_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_payroll_components (
  id SERIAL PRIMARY KEY,
  component_name VARCHAR(120) UNIQUE NOT NULL,
  component_type VARCHAR(20) NOT NULL
    CHECK (component_type IN ('EARNING', 'DEDUCTION', 'TAX')),
  calc_type VARCHAR(20) NOT NULL DEFAULT 'PERCENT'
    CHECK (calc_type IN ('PERCENT', 'FIXED')),
  default_value NUMERIC(12,4) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_ar_disputes (
  id SERIAL PRIMARY KEY,
  invoice_id INT NOT NULL REFERENCES finance_invoices(id) ON DELETE CASCADE,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  dispute_reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')),
  raised_by INT REFERENCES users(id),
  resolved_by INT REFERENCES users(id),
  raised_at TIMESTAMP NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_credit_memos (
  id SERIAL PRIMARY KEY,
  memo_number VARCHAR(60) UNIQUE NOT NULL,
  invoice_id INT REFERENCES finance_invoices(id) ON DELETE SET NULL,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  reason TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'APPLIED', 'REFUNDED', 'VOID')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_refunds (
  id SERIAL PRIMARY KEY,
  credit_memo_id INT NOT NULL REFERENCES finance_credit_memos(id) ON DELETE CASCADE,
  refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_account_id INT REFERENCES payment_accounts(id) ON DELETE SET NULL,
  reference_no VARCHAR(100),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO finance_sales_tax_jurisdictions (jurisdiction_code, country_code, region_name, tax_rate_percent, active)
VALUES
  ('US-CA', 'US', 'California', 7.2500, TRUE),
  ('US-NY', 'US', 'New York', 4.0000, TRUE),
  ('US-TX', 'US', 'Texas', 6.2500, TRUE)
ON CONFLICT (jurisdiction_code) DO NOTHING;

INSERT INTO finance_payroll_components (component_name, component_type, calc_type, default_value, active)
VALUES
  ('Federal Tax', 'TAX', 'PERCENT', 10.0000, TRUE),
  ('Health Insurance', 'DEDUCTION', 'FIXED', 150.0000, TRUE),
  ('Housing Allowance', 'EARNING', 'FIXED', 0, TRUE)
ON CONFLICT (component_name) DO NOTHING;
