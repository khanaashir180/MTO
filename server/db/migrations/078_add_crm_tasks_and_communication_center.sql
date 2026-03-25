CREATE TABLE IF NOT EXISTS crm_task_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(140) UNIQUE NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  default_due_in_days INT NOT NULL DEFAULT 1 CHECK (default_due_in_days >= 0),
  default_recurrence_type VARCHAR(20) NOT NULL DEFAULT 'NONE'
    CHECK (default_recurrence_type IN ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM')),
  default_recurrence_interval_days INT NOT NULL DEFAULT 0 CHECK (default_recurrence_interval_days >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS template_id INT REFERENCES crm_task_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(20) NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS recurrence_interval_days INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurrence_anchor_date DATE,
  ADD COLUMN IF NOT EXISTS last_generated_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS parent_task_id INT REFERENCES crm_tasks(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crm_tasks_recurrence_type_check'
  ) THEN
    ALTER TABLE crm_tasks
      ADD CONSTRAINT crm_tasks_recurrence_type_check
      CHECK (recurrence_type IN ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crm_tasks_template_id
  ON crm_tasks(template_id);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_parent_task_id
  ON crm_tasks(parent_task_id);

CREATE TABLE IF NOT EXISTS crm_task_dependencies (
  id SERIAL PRIMARY KEY,
  task_id INT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
  depends_on_task_id INT NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_task_dependencies_task_id
  ON crm_task_dependencies(task_id);

CREATE INDEX IF NOT EXISTS idx_crm_task_dependencies_depends_on_task_id
  ON crm_task_dependencies(depends_on_task_id);

ALTER TABLE customer_interactions
  ADD COLUMN IF NOT EXISTS direction VARCHAR(20) NOT NULL DEFAULT 'OUTBOUND',
  ADD COLUMN IF NOT EXISTS thread_key VARCHAR(120),
  ADD COLUMN IF NOT EXISTS conversation_owner_id INT REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS response_sla_minutes INT,
  ADD COLUMN IF NOT EXISTS response_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS no_response_alerted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS channel_status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
  ADD COLUMN IF NOT EXISTS is_unread BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_interactions_interaction_type_check'
  ) THEN
    ALTER TABLE customer_interactions DROP CONSTRAINT customer_interactions_interaction_type_check;
  END IF;
END $$;

ALTER TABLE customer_interactions
  ADD CONSTRAINT customer_interactions_interaction_type_check
  CHECK (interaction_type IN ('CALL', 'VISIT', 'WHATSAPP', 'EMAIL', 'SMS', 'NOTE'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_interactions_direction_check'
  ) THEN
    ALTER TABLE customer_interactions
      ADD CONSTRAINT customer_interactions_direction_check
      CHECK (direction IN ('INBOUND', 'OUTBOUND', 'INTERNAL'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'customer_interactions_channel_status_check'
  ) THEN
    ALTER TABLE customer_interactions
      ADD CONSTRAINT customer_interactions_channel_status_check
      CHECK (channel_status IN ('OPEN', 'PENDING', 'CLOSED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_interactions_owner_status
  ON customer_interactions(conversation_owner_id, channel_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_interactions_response_due_at
  ON customer_interactions(response_due_at)
  WHERE responded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_customer_interactions_thread_key
  ON customer_interactions(thread_key);

INSERT INTO crm_task_templates (
  name,
  title,
  description,
  priority,
  default_due_in_days,
  default_recurrence_type,
  default_recurrence_interval_days,
  is_active
)
VALUES
  ('daily_customer_followup', 'Customer follow-up', 'Daily follow-up touchpoint for active communication queues', 'MEDIUM', 1, 'DAILY', 1, TRUE),
  ('weekly_pending_reply_review', 'Pending reply review', 'Review conversations waiting on customer response', 'HIGH', 7, 'WEEKLY', 7, TRUE),
  ('sla_breach_watch', 'SLA breach watch', 'Escalation check for overdue communication threads', 'CRITICAL', 1, 'DAILY', 1, TRUE)
ON CONFLICT (name) DO NOTHING;
