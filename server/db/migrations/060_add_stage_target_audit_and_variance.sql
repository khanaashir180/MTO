CREATE TABLE IF NOT EXISTS production_stage_target_audit (
  id SERIAL PRIMARY KEY,
  stage_id INT NOT NULL REFERENCES production_stages(id) ON DELETE CASCADE,
  target_date DATE NOT NULL,
  shift_name VARCHAR(40) NOT NULL,
  previous_target_pairs INT,
  new_target_pairs INT NOT NULL,
  changed_by INT REFERENCES users(id),
  changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_stage_target_audit_stage_date
  ON production_stage_target_audit (stage_id, target_date, changed_at DESC);

CREATE TABLE IF NOT EXISTS production_stage_target_variances (
  id SERIAL PRIMARY KEY,
  stage_id INT NOT NULL REFERENCES production_stages(id) ON DELETE CASCADE,
  target_date DATE NOT NULL,
  shift_name VARCHAR(40) NOT NULL,
  reason_code VARCHAR(80) NOT NULL,
  notes TEXT,
  recorded_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (stage_id, target_date, shift_name)
);

CREATE INDEX IF NOT EXISTS idx_production_stage_target_variances_stage_date
  ON production_stage_target_variances (stage_id, target_date);
