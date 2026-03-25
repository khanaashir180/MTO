CREATE TABLE IF NOT EXISTS finance_bank_rules (
  id SERIAL PRIMARY KEY,
  rule_name VARCHAR(160) UNIQUE NOT NULL,
  condition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  priority INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_bank_match_logs (
  id SERIAL PRIMARY KEY,
  bank_tx_id INT REFERENCES finance_bank_transactions(id) ON DELETE SET NULL,
  rule_id INT REFERENCES finance_bank_rules(id) ON DELETE SET NULL,
  match_result VARCHAR(20) NOT NULL DEFAULT 'NO_MATCH'
    CHECK (match_result IN ('MATCHED', 'NO_MATCH', 'EXCLUDED')),
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_report_presets (
  id SERIAL PRIMARY KEY,
  preset_name VARCHAR(160) UNIQUE NOT NULL,
  report_type VARCHAR(30) NOT NULL DEFAULT 'FINANCIAL'
    CHECK (report_type IN ('FINANCIAL', 'AGING', 'CUSTOM')),
  definition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_shared BOOLEAN NOT NULL DEFAULT FALSE,
  owner_id INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_report_schedules (
  id SERIAL PRIMARY KEY,
  preset_id INT NOT NULL REFERENCES finance_report_presets(id) ON DELETE CASCADE,
  schedule_type VARCHAR(20) NOT NULL DEFAULT 'MONTHLY'
    CHECK (schedule_type IN ('DAILY', 'WEEKLY', 'MONTHLY')),
  next_run_date DATE NOT NULL,
  delivery_channel VARCHAR(20) NOT NULL DEFAULT 'IN_APP'
    CHECK (delivery_channel IN ('IN_APP', 'EMAIL', 'WEBHOOK')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMP,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_report_exports (
  id SERIAL PRIMARY KEY,
  preset_id INT REFERENCES finance_report_presets(id) ON DELETE SET NULL,
  export_format VARCHAR(20) NOT NULL DEFAULT 'CSV'
    CHECK (export_format IN ('CSV', 'PDF', 'XLSX')),
  export_scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  exported_by INT REFERENCES users(id),
  exported_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_inventory_lots (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES finance_inventory_items(id) ON DELETE CASCADE,
  lot_number VARCHAR(80) NOT NULL,
  received_date DATE NOT NULL DEFAULT CURRENT_DATE,
  qty_received NUMERIC(12,2) NOT NULL DEFAULT 0,
  qty_available NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  expiry_date DATE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, lot_number)
);

CREATE TABLE IF NOT EXISTS finance_inventory_issue_allocations (
  id SERIAL PRIMARY KEY,
  movement_id INT NOT NULL REFERENCES finance_inventory_movements(id) ON DELETE CASCADE,
  lot_id INT NOT NULL REFERENCES finance_inventory_lots(id) ON DELETE CASCADE,
  qty NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  cogs_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_cogs_journal (
  id SERIAL PRIMARY KEY,
  movement_id INT NOT NULL REFERENCES finance_inventory_movements(id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES finance_inventory_items(id) ON DELETE CASCADE,
  cogs_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_payroll_tax_settings (
  id SERIAL PRIMARY KEY,
  country_code VARCHAR(10) NOT NULL DEFAULT 'US',
  tax_authority VARCHAR(120) NOT NULL,
  filing_frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY'
    CHECK (filing_frequency IN ('MONTHLY', 'QUARTERLY', 'ANNUAL')),
  payment_account_id INT REFERENCES payment_accounts(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_payroll_filings (
  id SERIAL PRIMARY KEY,
  payroll_run_id INT REFERENCES finance_payroll_runs(id) ON DELETE SET NULL,
  period_label VARCHAR(80) NOT NULL,
  tax_authority VARCHAR(120) NOT NULL,
  filing_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (filing_status IN ('DRAFT', 'FILED', 'ACCEPTED', 'REJECTED')),
  tax_due NUMERIC(12,2) NOT NULL DEFAULT 0,
  reference_no VARCHAR(80),
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  filed_by INT REFERENCES users(id),
  filed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_accounting_approval_policies (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(30) NOT NULL
    CHECK (entity_type IN ('INVOICE', 'BILL', 'PURCHASE_ORDER', 'PAYROLL_RUN')),
  threshold_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  approver_role VARCHAR(30) NOT NULL DEFAULT 'FINANCE',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_accounting_approvals (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(30) NOT NULL,
  entity_id INT NOT NULL,
  requested_by INT REFERENCES users(id),
  threshold_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  approver_id INT REFERENCES users(id),
  decision_note TEXT,
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS finance_audit_logs (
  id SERIAL PRIMARY KEY,
  area VARCHAR(80) NOT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id INT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by INT REFERENCES users(id),
  performed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO finance_bank_rules (rule_name, condition_json, action_json, priority, active)
VALUES
  ('match_by_reference_contains_inv', '{"referenceContains":"INV-"}'::jsonb, '{"action":"MATCH_INVOICE"}'::jsonb, 10, TRUE),
  ('exclude_small_bank_fee', '{"memoContains":"FEE","amountLte":10}'::jsonb, '{"action":"EXCLUDE"}'::jsonb, 20, TRUE)
ON CONFLICT (rule_name) DO NOTHING;

INSERT INTO finance_accounting_approval_policies (entity_type, threshold_amount, approver_role, active)
VALUES
  ('INVOICE', 50000, 'FINANCE', TRUE),
  ('PURCHASE_ORDER', 25000, 'FINANCE', TRUE),
  ('PAYROLL_RUN', 100000, 'SUPER_USER', TRUE)
ON CONFLICT DO NOTHING;
