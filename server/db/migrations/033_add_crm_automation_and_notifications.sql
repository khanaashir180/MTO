CREATE TABLE IF NOT EXISTS crm_automation_rules (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) UNIQUE NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  condition_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  action_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_automation_logs (
  id SERIAL PRIMARY KEY,
  rule_id INT REFERENCES crm_automation_rules(id) ON DELETE SET NULL,
  event_type VARCHAR(60) NOT NULL,
  reference_type VARCHAR(60),
  reference_id INT,
  result VARCHAR(30) NOT NULL DEFAULT 'EXECUTED',
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'INFO'
    CHECK (severity IN ('INFO', 'SUCCESS', 'WARNING', 'HIGH')),
  status VARCHAR(20) NOT NULL DEFAULT 'UNREAD'
    CHECK (status IN ('UNREAD', 'READ', 'ARCHIVED')),
  linked_type VARCHAR(40),
  linked_id INT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_crm_notifications_user_status
ON crm_notifications (user_id, status, created_at DESC);

INSERT INTO crm_automation_rules (name, event_type, condition_json, action_json, is_active)
VALUES
  ('task_overdue_alert', 'TASK_SAVED', '{"when":"due_date_past_and_open"}'::jsonb, '{"notify":"assigned_user","severity":"HIGH"}'::jsonb, true),
  ('opportunity_won_alert', 'OPPORTUNITY_UPDATED', '{"when":"status_won"}'::jsonb, '{"notify":"owner_user","severity":"SUCCESS"}'::jsonb, true),
  ('hot_lead_alert', 'CUSTOMER_UPDATED', '{"when":"lead_score_gte_80"}'::jsonb, '{"notify":"actor","severity":"WARNING"}'::jsonb, true)
ON CONFLICT (name) DO NOTHING;
