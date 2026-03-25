CREATE TABLE IF NOT EXISTS finance_multi_currency_ledger (
  id SERIAL PRIMARY KEY,
  source_type VARCHAR(30) NOT NULL
    CHECK (source_type IN ('INVOICE', 'BILL', 'PAYMENT', 'JOURNAL')),
  source_id INT,
  entry_side VARCHAR(10) NOT NULL
    CHECK (entry_side IN ('DEBIT', 'CREDIT')),
  currency_code VARCHAR(12) NOT NULL,
  amount_foreign NUMERIC(14,2) NOT NULL DEFAULT 0,
  fx_rate_to_usd NUMERIC(18,8) NOT NULL DEFAULT 1,
  amount_base NUMERIC(14,2) NOT NULL DEFAULT 0,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  realized BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_fx_settlement_runs (
  id SERIAL PRIMARY KEY,
  currency_code VARCHAR(12) NOT NULL,
  settlement_date DATE NOT NULL,
  amount_foreign NUMERIC(14,2) NOT NULL DEFAULT 0,
  booked_rate NUMERIC(18,8) NOT NULL DEFAULT 0,
  settlement_rate NUMERIC(18,8) NOT NULL DEFAULT 0,
  realized_gain_loss NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_fixed_asset_events (
  id SERIAL PRIMARY KEY,
  asset_id INT NOT NULL REFERENCES finance_fixed_assets(id) ON DELETE CASCADE,
  event_type VARCHAR(20) NOT NULL
    CHECK (event_type IN ('DISPOSAL', 'IMPAIRMENT', 'TRANSFER')),
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_month_end_workspaces (
  id SERIAL PRIMARY KEY,
  period_month DATE UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_REVIEW', 'CLOSED')),
  owner_id INT REFERENCES users(id),
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_month_end_tasks (
  id SERIAL PRIMARY KEY,
  workspace_id INT NOT NULL REFERENCES finance_month_end_workspaces(id) ON DELETE CASCADE,
  task_name VARCHAR(180) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'IN_PROGRESS', 'DONE')),
  assigned_to INT REFERENCES users(id),
  due_date DATE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_adjusting_entries (
  id SERIAL PRIMARY KEY,
  workspace_id INT NOT NULL REFERENCES finance_month_end_workspaces(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT NOT NULL,
  debit_account_id INT REFERENCES finance_chart_of_accounts(id) ON DELETE SET NULL,
  credit_account_id INT REFERENCES finance_chart_of_accounts(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'POSTED')),
  requested_by INT REFERENCES users(id),
  approved_by INT REFERENCES users(id),
  approved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_filing_calendar (
  id SERIAL PRIMARY KEY,
  filing_type VARCHAR(40) NOT NULL
    CHECK (filing_type IN ('SALES_TAX', 'PAYROLL_TAX', 'INCOME_TAX', 'OTHER')),
  authority VARCHAR(140) NOT NULL,
  period_label VARCHAR(80) NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PREPARED', 'FILED', 'PAID', 'LATE')),
  amount_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
