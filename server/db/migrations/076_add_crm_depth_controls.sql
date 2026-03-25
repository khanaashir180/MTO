ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS parent_account_id INTEGER REFERENCES customer_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS account_tier TEXT DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS relationship_type TEXT,
  ADD COLUMN IF NOT EXISTS customer_segment TEXT,
  ADD COLUMN IF NOT EXISTS success_owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS risk_flag_reason TEXT;

ALTER TABLE crm_cases
  ADD COLUMN IF NOT EXISTS root_cause_code TEXT,
  ADD COLUMN IF NOT EXISTS resolution_code TEXT,
  ADD COLUMN IF NOT EXISTS business_impact TEXT,
  ADD COLUMN IF NOT EXISTS reported_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_action TEXT,
  ADD COLUMN IF NOT EXISTS next_action_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS service_channel TEXT DEFAULT 'MANUAL';

CREATE INDEX IF NOT EXISTS idx_customer_accounts_parent_account_id
  ON customer_accounts(parent_account_id);

CREATE INDEX IF NOT EXISTS idx_crm_cases_reported_order_id
  ON crm_cases(reported_order_id);
