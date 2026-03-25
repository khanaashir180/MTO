CREATE TABLE IF NOT EXISTS production_stage_targets (
  id SERIAL PRIMARY KEY,
  stage_id INT NOT NULL REFERENCES production_stages(id) ON DELETE CASCADE,
  target_date DATE NOT NULL,
  shift_name VARCHAR(40) NOT NULL,
  target_pairs INT NOT NULL CHECK (target_pairs >= 0),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (stage_id, target_date, shift_name)
);

CREATE INDEX IF NOT EXISTS idx_production_stage_targets_stage_date
  ON production_stage_targets (stage_id, target_date);
