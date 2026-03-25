CREATE TABLE IF NOT EXISTS crm_email_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) UNIQUE NOT NULL,
  subject_template VARCHAR(220) NOT NULL,
  body_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_cadences (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) UNIQUE NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_cadence_steps (
  id SERIAL PRIMARY KEY,
  cadence_id INT NOT NULL REFERENCES crm_cadences(id) ON DELETE CASCADE,
  step_number INT NOT NULL CHECK (step_number >= 1),
  step_type VARCHAR(30) NOT NULL DEFAULT 'EMAIL'
    CHECK (step_type IN ('EMAIL', 'CALL', 'TASK')),
  day_offset INT NOT NULL DEFAULT 0 CHECK (day_offset >= 0),
  template_id INT REFERENCES crm_email_templates(id) ON DELETE SET NULL,
  instructions TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (cadence_id, step_number)
);

CREATE TABLE IF NOT EXISTS crm_sequence_enrollments (
  id SERIAL PRIMARY KEY,
  cadence_id INT NOT NULL REFERENCES crm_cadences(id) ON DELETE CASCADE,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  owner_id INT REFERENCES users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED')),
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  next_step_number INT NOT NULL DEFAULT 1,
  next_action_at TIMESTAMP,
  last_activity_at TIMESTAMP,
  created_by INT REFERENCES users(id),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_sequence_enrollments_status
ON crm_sequence_enrollments (status, next_action_at);

CREATE TABLE IF NOT EXISTS crm_sequence_activity (
  id SERIAL PRIMARY KEY,
  enrollment_id INT NOT NULL REFERENCES crm_sequence_enrollments(id) ON DELETE CASCADE,
  step_id INT REFERENCES crm_cadence_steps(id) ON DELETE SET NULL,
  activity_type VARCHAR(30) NOT NULL
    CHECK (activity_type IN ('EMAIL_SENT', 'CALL_LOGGED', 'TASK_CREATED', 'STEP_SKIPPED')),
  activity_status VARCHAR(30) NOT NULL DEFAULT 'DONE'
    CHECK (activity_status IN ('DONE', 'FAILED')),
  summary TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO crm_email_templates (name, subject_template, body_template, is_active)
VALUES
  ('welcome_followup', 'Welcome {{customer_name}}', 'Hi {{customer_name}}, thanks for your recent order. We would like to schedule a quick follow-up.', TRUE),
  ('proposal_nudge', 'Proposal follow-up for {{customer_name}}', 'Hello {{customer_name}}, checking in on the proposal and happy to answer any questions.', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO crm_cadences (name, description, is_active)
VALUES
  ('new_account_14_day', 'Two-week onboarding touchpoint cadence for new accounts', TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO crm_cadence_steps (cadence_id, step_number, step_type, day_offset, template_id, instructions, is_active)
SELECT c.id, x.step_number, x.step_type, x.day_offset, t.id, x.instructions, TRUE
FROM crm_cadences c
JOIN (
  VALUES
    (1, 'EMAIL', 0, 'welcome_followup', 'Send welcome follow-up within the same day'),
    (2, 'CALL', 3, NULL, 'Call account and capture concerns'),
    (3, 'EMAIL', 7, 'proposal_nudge', 'Send proposal nudge email'),
    (4, 'TASK', 14, NULL, 'Create handoff task for account manager')
) AS x(step_number, step_type, day_offset, template_name, instructions)
ON TRUE
LEFT JOIN crm_email_templates t ON t.name = x.template_name
WHERE c.name = 'new_account_14_day'
ON CONFLICT (cadence_id, step_number) DO NOTHING;
