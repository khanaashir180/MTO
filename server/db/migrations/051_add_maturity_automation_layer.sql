CREATE TABLE IF NOT EXISTS finance_ops_jobs (
  id SERIAL PRIMARY KEY,
  job_type VARCHAR(40) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_bank_feed_retry_queue (
  id SERIAL PRIMARY KEY,
  import_run_id INT NOT NULL REFERENCES finance_bank_feed_import_runs(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RUNNING', 'DONE', 'FAILED')),
  reason TEXT,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_tax_returns (
  id SERIAL PRIMARY KEY,
  filing_type VARCHAR(40) NOT NULL
    CHECK (filing_type IN ('SALES_TAX', 'PAYROLL_TAX', 'INCOME_TAX', 'OTHER')),
  authority VARCHAR(140) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  taxable_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PREPARED', 'FILED', 'PAID', 'VOID')),
  prepared_by INT REFERENCES users(id),
  filed_by INT REFERENCES users(id),
  paid_by INT REFERENCES users(id),
  prepared_at TIMESTAMP,
  filed_at TIMESTAMP,
  paid_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_payroll_filing_batches (
  id SERIAL PRIMARY KEY,
  period_label VARCHAR(80) NOT NULL,
  filing_authority VARCHAR(140) NOT NULL,
  run_count INT NOT NULL DEFAULT 0,
  gross_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PREPARED', 'FILED', 'PAID')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_payment_intents (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(20) NOT NULL
    CHECK (entity_type IN ('INVOICE', 'BILL')),
  entity_id INT NOT NULL,
  account_id INT,
  vendor_id INT,
  intended_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency_code VARCHAR(12) NOT NULL DEFAULT 'USD',
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PARTIAL', 'APPLIED', 'FAILED')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_payment_allocations (
  id SERIAL PRIMARY KEY,
  payment_intent_id INT NOT NULL REFERENCES finance_payment_intents(id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL
    CHECK (entity_type IN ('INVOICE', 'BILL')),
  entity_id INT NOT NULL,
  applied_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_dunning_campaigns (
  id SERIAL PRIMARY KEY,
  campaign_name VARCHAR(160) UNIQUE NOT NULL,
  min_overdue_days INT NOT NULL DEFAULT 7,
  reminder_channel VARCHAR(20) NOT NULL DEFAULT 'EMAIL'
    CHECK (reminder_channel IN ('EMAIL', 'SMS', 'IN_APP')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_dunning_runs (
  id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES finance_dunning_campaigns(id) ON DELETE CASCADE,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  targeted_count INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED'
    CHECK (status IN ('COMPLETED', 'FAILED')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_dunning_run_items (
  id SERIAL PRIMARY KEY,
  run_id INT NOT NULL REFERENCES finance_dunning_runs(id) ON DELETE CASCADE,
  invoice_id INT NOT NULL REFERENCES finance_invoices(id) ON DELETE CASCADE,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  days_overdue INT NOT NULL DEFAULT 0,
  balance_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  reminder_level VARCHAR(20) NOT NULL DEFAULT 'SOFT'
    CHECK (reminder_level IN ('SOFT', 'FIRM', 'FINAL')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO finance_dunning_campaigns (campaign_name, min_overdue_days, reminder_channel, active)
VALUES ('Default AR Dunning', 7, 'EMAIL', TRUE)
ON CONFLICT (campaign_name) DO NOTHING;
