CREATE TABLE IF NOT EXISTS production_stage_target_settings (
  id SERIAL PRIMARY KEY,
  stage_id INT NOT NULL UNIQUE REFERENCES production_stages(id) ON DELETE CASCADE,
  approval_absolute_delta INT NOT NULL DEFAULT 40 CHECK (approval_absolute_delta >= 0),
  approval_percent_delta NUMERIC(6,4) NOT NULL DEFAULT 0.3000 CHECK (approval_percent_delta >= 0),
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS production_stage_notifications (
  id SERIAL PRIMARY KEY,
  stage_id INT NOT NULL REFERENCES production_stages(id) ON DELETE CASCADE,
  notification_type VARCHAR(60) NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_stage_notifications_stage_date
  ON production_stage_notifications (stage_id, created_at DESC);
