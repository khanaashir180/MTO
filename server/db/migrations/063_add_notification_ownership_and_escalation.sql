ALTER TABLE production_stage_notifications
  ADD COLUMN IF NOT EXISTS assigned_owner VARCHAR(120),
  ADD COLUMN IF NOT EXISTS escalation_level INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(30) NOT NULL DEFAULT 'OPEN';

CREATE INDEX IF NOT EXISTS idx_production_stage_notifications_workflow
  ON production_stage_notifications (stage_id, workflow_status, escalation_level);
