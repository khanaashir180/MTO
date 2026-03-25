CREATE TABLE IF NOT EXISTS crm_stage_gates (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(40) NOT NULL,
  stage_name VARCHAR(60) NOT NULL,
  min_expected_value NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (min_expected_value >= 0),
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (entity_type, stage_name)
);

CREATE TABLE IF NOT EXISTS crm_approvals (
  id SERIAL PRIMARY KEY,
  entity_type VARCHAR(40) NOT NULL,
  entity_id INT NOT NULL,
  stage_name VARCHAR(60),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  requested_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision_notes TEXT,
  requested_by INT REFERENCES users(id),
  decided_by INT REFERENCES users(id),
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_approvals_entity
ON crm_approvals (entity_type, entity_id, status, requested_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_approvals_pending_stage
ON crm_approvals (entity_type, entity_id, stage_name)
WHERE status = 'PENDING';

CREATE TABLE IF NOT EXISTS crm_lead_conversions (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  opportunity_id INT REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  task_id INT REFERENCES crm_tasks(id) ON DELETE SET NULL,
  converted_by INT REFERENCES users(id),
  conversion_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_conversions_account
ON crm_lead_conversions (account_id, created_at DESC);

INSERT INTO crm_stage_gates (entity_type, stage_name, min_expected_value, requires_approval, is_active)
VALUES
  ('OPPORTUNITY', 'CLOSED_WON', 50000, TRUE, TRUE)
ON CONFLICT (entity_type, stage_name) DO NOTHING;
