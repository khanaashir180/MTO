CREATE TABLE IF NOT EXISTS production_stage_target_approvals (
  id SERIAL PRIMARY KEY,
  stage_id INT NOT NULL REFERENCES production_stages(id) ON DELETE CASCADE,
  target_date DATE NOT NULL,
  shift_name VARCHAR(40) NOT NULL,
  existing_target_pairs INT,
  requested_target_pairs INT NOT NULL,
  requested_by INT REFERENCES users(id),
  approved_by INT REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  decision_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (stage_id, target_date, shift_name)
);

CREATE INDEX IF NOT EXISTS idx_production_stage_target_approvals_stage_date
  ON production_stage_target_approvals (stage_id, target_date, status);
