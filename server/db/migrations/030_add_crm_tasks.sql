CREATE TABLE IF NOT EXISTS crm_tasks (
  id SERIAL PRIMARY KEY,
  account_id INT REFERENCES customer_accounts(id) ON DELETE CASCADE,
  opportunity_id INT REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT,
  due_date DATE NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'COMPLETED', 'CANCELLED')),
  assigned_to INT REFERENCES users(id),
  created_by INT REFERENCES users(id),
  completed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_due_status
ON crm_tasks (due_date, status);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned
ON crm_tasks (assigned_to, status);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_account
ON crm_tasks (account_id);

CREATE OR REPLACE FUNCTION set_crm_task_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  IF NEW.status = 'COMPLETED' AND OLD.status IS DISTINCT FROM 'COMPLETED' THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status <> 'COMPLETED' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_task_timestamps ON crm_tasks;
CREATE TRIGGER trg_crm_task_timestamps
BEFORE UPDATE ON crm_tasks
FOR EACH ROW
EXECUTE FUNCTION set_crm_task_timestamps();
