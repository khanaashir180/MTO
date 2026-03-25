ALTER TABLE retail_recovery_cases
  ADD COLUMN IF NOT EXISTS original_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prior_recovery_case_id INTEGER REFERENCES retail_recovery_cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS replacement_sequence INTEGER NOT NULL DEFAULT 1;

UPDATE retail_recovery_cases
SET original_order_id = COALESCE(original_order_id, order_id)
WHERE original_order_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_retail_recovery_cases_original_order
  ON retail_recovery_cases(original_order_id, replacement_sequence DESC);
