ALTER TABLE crm_opportunities
  ADD COLUMN IF NOT EXISTS competitor_name TEXT,
  ADD COLUMN IF NOT EXISTS win_reason TEXT,
  ADD COLUMN IF NOT EXISTS loss_reason TEXT,
  ADD COLUMN IF NOT EXISTS next_step TEXT,
  ADD COLUMN IF NOT EXISTS next_step_due_at DATE,
  ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'MEDIUM'
    CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  ADD COLUMN IF NOT EXISTS close_plan TEXT,
  ADD COLUMN IF NOT EXISTS buying_committee TEXT;

CREATE TABLE IF NOT EXISTS crm_opportunity_line_items (
  id SERIAL PRIMARY KEY,
  opportunity_id INT NOT NULL REFERENCES crm_opportunities(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_opp_line_items_opp
  ON crm_opportunity_line_items(opportunity_id);
