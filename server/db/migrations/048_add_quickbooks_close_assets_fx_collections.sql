CREATE TABLE IF NOT EXISTS finance_close_books_periods (
  id SERIAL PRIMARY KEY,
  period_month DATE UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSED')),
  checklist_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  closed_by INT REFERENCES users(id),
  closed_at TIMESTAMP,
  reopened_by INT REFERENCES users(id),
  reopened_at TIMESTAMP,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_fixed_assets (
  id SERIAL PRIMARY KEY,
  asset_code VARCHAR(80) UNIQUE NOT NULL,
  asset_name VARCHAR(180) NOT NULL,
  category VARCHAR(120),
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  salvage_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  useful_life_months INT NOT NULL DEFAULT 36,
  depreciation_method VARCHAR(30) NOT NULL DEFAULT 'STRAIGHT_LINE'
    CHECK (depreciation_method IN ('STRAIGHT_LINE')),
  currency_code VARCHAR(12) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'DISPOSED')),
  accumulated_depreciation NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_book_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_fixed_asset_depreciation_runs (
  id SERIAL PRIMARY KEY,
  asset_id INT NOT NULL REFERENCES finance_fixed_assets(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  depreciation_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  posted_by INT REFERENCES users(id),
  posted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (asset_id, period_month)
);

CREATE TABLE IF NOT EXISTS finance_fx_rates (
  id SERIAL PRIMARY KEY,
  currency_code VARCHAR(12) NOT NULL,
  rate_date DATE NOT NULL,
  rate_to_usd NUMERIC(18,8) NOT NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (currency_code, rate_date)
);

CREATE TABLE IF NOT EXISTS finance_fx_revaluation_runs (
  id SERIAL PRIMARY KEY,
  period_end_date DATE NOT NULL,
  currency_code VARCHAR(12) NOT NULL,
  open_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  booked_rate NUMERIC(18,8) NOT NULL DEFAULT 0,
  revalued_rate NUMERIC(18,8) NOT NULL DEFAULT 0,
  unrealized_gain_loss NUMERIC(14,2) NOT NULL DEFAULT 0,
  posted_by INT REFERENCES users(id),
  posted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_ar_collection_runs (
  id SERIAL PRIMARY KEY,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  min_overdue_days INT NOT NULL DEFAULT 1,
  generated_count INT NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_ar_collection_items (
  id SERIAL PRIMARY KEY,
  run_id INT NOT NULL REFERENCES finance_ar_collection_runs(id) ON DELETE CASCADE,
  invoice_id INT NOT NULL REFERENCES finance_invoices(id) ON DELETE CASCADE,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  days_overdue INT NOT NULL DEFAULT 0,
  balance_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  reminder_level VARCHAR(20) NOT NULL DEFAULT 'SOFT'
    CHECK (reminder_level IN ('SOFT', 'FIRM', 'FINAL')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
