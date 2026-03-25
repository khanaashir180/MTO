CREATE TABLE IF NOT EXISTS crm_opportunities (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  stage VARCHAR(40) NOT NULL DEFAULT 'QUALIFICATION'
    CHECK (stage IN ('QUALIFICATION', 'NEEDS_ANALYSIS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'WON', 'LOST')),
  probability INT NOT NULL DEFAULT 20 CHECK (probability BETWEEN 0 AND 100),
  expected_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (expected_value >= 0),
  expected_close_date DATE,
  source VARCHAR(80),
  notes TEXT,
  owner_id INT REFERENCES users(id),
  won_at TIMESTAMP,
  lost_at TIMESTAMP,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_account_stage
ON crm_opportunities (account_id, stage, status);

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_owner
ON crm_opportunities (owner_id);

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_close_date
ON crm_opportunities (expected_close_date);

CREATE OR REPLACE FUNCTION set_crm_opportunity_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.status = 'WON' AND OLD.status IS DISTINCT FROM 'WON' THEN
    NEW.won_at = NOW();
    IF NEW.stage <> 'CLOSED_WON' THEN
      NEW.stage = 'CLOSED_WON';
    END IF;
  ELSIF NEW.status = 'LOST' AND OLD.status IS DISTINCT FROM 'LOST' THEN
    NEW.lost_at = NOW();
    IF NEW.stage <> 'CLOSED_LOST' THEN
      NEW.stage = 'CLOSED_LOST';
    END IF;
  ELSIF NEW.status = 'OPEN' THEN
    NEW.won_at = NULL;
    NEW.lost_at = NULL;
    IF NEW.stage IN ('CLOSED_WON', 'CLOSED_LOST') THEN
      NEW.stage = 'QUALIFICATION';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_opportunity_timestamps ON crm_opportunities;
CREATE TRIGGER trg_crm_opportunity_timestamps
BEFORE UPDATE ON crm_opportunities
FOR EACH ROW
EXECUTE FUNCTION set_crm_opportunity_timestamps();
