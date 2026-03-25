ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS lead_next_action TEXT,
  ADD COLUMN IF NOT EXISTS lead_next_action_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_last_worked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customer_accounts_lead_next_action_due_at
  ON customer_accounts(lead_next_action_due_at);

CREATE INDEX IF NOT EXISTS idx_customer_accounts_lead_owner_stage
  ON customer_accounts(lead_owner_id, lead_stage);
