CREATE TABLE IF NOT EXISTS retail_recovery_cases (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  case_type VARCHAR(30) NOT NULL,
  reason_code VARCHAR(60) NOT NULL,
  root_cause_bucket VARCHAR(80),
  complaint_channel VARCHAR(40),
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  owner_name VARCHAR(120),
  escalation_level INT NOT NULL DEFAULT 0,
  promised_resolution_date DATE,
  approved_at TIMESTAMP,
  resolved_at TIMESTAMP,
  estimated_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  financial_resolution_type VARCHAR(40) NOT NULL DEFAULT 'REPLACEMENT_ONLY',
  customer_satisfaction_status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  reopened_count INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retail_recovery_cases_order ON retail_recovery_cases(order_id);
CREATE INDEX IF NOT EXISTS idx_retail_recovery_cases_status ON retail_recovery_cases(status, case_type);
CREATE INDEX IF NOT EXISTS idx_retail_recovery_cases_promised_date ON retail_recovery_cases(promised_resolution_date);

CREATE TABLE IF NOT EXISTS retail_recovery_case_notes (
  id SERIAL PRIMARY KEY,
  recovery_case_id INT NOT NULL REFERENCES retail_recovery_cases(id) ON DELETE CASCADE,
  note_type VARCHAR(40) NOT NULL DEFAULT 'COMMENT',
  note_text TEXT NOT NULL,
  actor_id INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retail_recovery_case_notes_case ON retail_recovery_case_notes(recovery_case_id, created_at DESC);
