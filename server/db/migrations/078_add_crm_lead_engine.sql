ALTER TABLE customer_accounts
  ADD COLUMN IF NOT EXISTS lead_stage TEXT DEFAULT 'NEW',
  ADD COLUMN IF NOT EXISTS lead_owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_temperature TEXT DEFAULT 'COLD',
  ADD COLUMN IF NOT EXISTS lead_source_detail TEXT,
  ADD COLUMN IF NOT EXISTS lead_qualification_notes TEXT,
  ADD COLUMN IF NOT EXISTS lead_disqualification_reason TEXT,
  ADD COLUMN IF NOT EXISTS lead_sla_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_routed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lead_qualified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customer_accounts_lead_stage
  ON customer_accounts(lead_stage);

CREATE INDEX IF NOT EXISTS idx_customer_accounts_lead_owner_id
  ON customer_accounts(lead_owner_id);
