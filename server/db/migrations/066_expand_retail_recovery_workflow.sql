ALTER TABLE retail_recovery_cases
  ADD COLUMN IF NOT EXISTS workflow_status TEXT NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS priority_level TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS reopened_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_time_fix BOOLEAN,
  ADD COLUMN IF NOT EXISTS closed_cleanly BOOLEAN,
  ADD COLUMN IF NOT EXISTS customer_value_band TEXT NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS complaint_received_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS approval_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN IF NOT EXISTS case_sla_days INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS last_escalated_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS retail_recovery_case_audit (
  id SERIAL PRIMARY KEY,
  recovery_case_id INTEGER NOT NULL REFERENCES retail_recovery_cases(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL,
  changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retail_recovery_case_audit_case_id
  ON retail_recovery_case_audit(recovery_case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS retail_recovery_case_attachments (
  id SERIAL PRIMARY KEY,
  recovery_case_id INTEGER NOT NULL REFERENCES retail_recovery_cases(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  note TEXT,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retail_recovery_case_attachments_case_id
  ON retail_recovery_case_attachments(recovery_case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS retail_recovery_reason_master (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sla_days INTEGER NOT NULL DEFAULT 7,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retail_recovery_financial_resolution_master (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retail_recovery_settings (
  id SERIAL PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retail_recovery_notifications (
  id SERIAL PRIMARY KEY,
  recovery_case_id INTEGER REFERENCES retail_recovery_cases(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  assigned_role TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retail_recovery_notifications_read
  ON retail_recovery_notifications(is_read, created_at DESC);

INSERT INTO retail_recovery_reason_master (code, label, sla_days)
VALUES
  ('SIZE_ISSUE', 'Size Issue', 7),
  ('WORKMANSHIP', 'Workmanship', 10),
  ('FINISH_ISSUE', 'Finish Issue', 7),
  ('WRONG_SPEC', 'Wrong Specification', 10),
  ('CUSTOMER_DISSATISFACTION', 'Customer Dissatisfaction', 5),
  ('DELIVERY_DAMAGE', 'Delivery Damage', 5)
ON CONFLICT (code) DO NOTHING;

INSERT INTO retail_recovery_financial_resolution_master (code, label)
VALUES
  ('REPLACEMENT_ONLY', 'Replacement Only'),
  ('REMAKE_ONLY', 'Remake Only'),
  ('REPAIR_ONLY', 'Repair Only'),
  ('PARTIAL_CREDIT', 'Partial Credit'),
  ('FULL_REFUND', 'Full Refund'),
  ('REFUND_AND_REPLACEMENT', 'Refund And Replacement')
ON CONFLICT (code) DO NOTHING;

INSERT INTO retail_recovery_settings (setting_key, setting_value, updated_at)
VALUES
  ('HIGH_COST_APPROVAL_THRESHOLD', '{"amount": 25000}', NOW()),
  ('KPI_TARGETS', '{"promise_adherence": 90, "first_time_fix": 85, "max_open_case_days": 7}', NOW())
ON CONFLICT (setting_key) DO NOTHING;
