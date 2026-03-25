CREATE TABLE IF NOT EXISTS crm_cases (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  opportunity_id INT REFERENCES crm_opportunities(id) ON DELETE SET NULL,
  subject VARCHAR(220) NOT NULL,
  description TEXT,
  case_type VARCHAR(40) NOT NULL DEFAULT 'GENERAL'
    CHECK (case_type IN ('GENERAL', 'ORDER', 'PAYMENT', 'QUALITY', 'DELIVERY', 'RETURNS')),
  priority VARCHAR(20) NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  status VARCHAR(20) NOT NULL DEFAULT 'NEW'
    CHECK (status IN ('NEW', 'WORKING', 'WAITING_CUSTOMER', 'ESCALATED', 'RESOLVED', 'CLOSED')),
  origin VARCHAR(30) NOT NULL DEFAULT 'MANUAL'
    CHECK (origin IN ('MANUAL', 'EMAIL', 'PHONE', 'WEB', 'WHATSAPP')),
  due_at TIMESTAMP,
  assigned_to INT REFERENCES users(id),
  owner_id INT REFERENCES users(id),
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_cases_status_priority
ON crm_cases (status, priority, due_at);

CREATE INDEX IF NOT EXISTS idx_crm_cases_account
ON crm_cases (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_cases_assigned
ON crm_cases (assigned_to, status, due_at);

CREATE TABLE IF NOT EXISTS crm_case_comments (
  id SERIAL PRIMARY KEY,
  case_id INT NOT NULL REFERENCES crm_cases(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_case_comments_case
ON crm_case_comments (case_id, created_at DESC);
