ALTER TABLE customer_accounts
ADD COLUMN IF NOT EXISTS email VARCHAR(160),
ADD COLUMN IF NOT EXISTS preferred_contact VARCHAR(40),
ADD COLUMN IF NOT EXISTS customer_status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS source VARCHAR(80),
ADD COLUMN IF NOT EXISTS tags TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS anniversary_date DATE,
ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMP;

CREATE TABLE IF NOT EXISTS customer_interactions (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  interaction_type VARCHAR(20) NOT NULL CHECK (interaction_type IN ('CALL', 'VISIT', 'WHATSAPP', 'EMAIL', 'NOTE')),
  subject VARCHAR(160),
  notes TEXT NOT NULL,
  next_followup_at DATE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_interactions_account
ON customer_interactions (account_id, created_at DESC);

UPDATE role_permissions rp
SET permissions = jsonb_set(
  rp.permissions,
  '{crm_module}',
  CASE
    WHEN r.name IN ('RETAIL', 'SUPER_USER', 'FINANCE') THEN 'true'::jsonb
    ELSE 'false'::jsonb
  END,
  true
)
FROM roles r
WHERE r.id = rp.role_id
  AND NOT (rp.permissions ? 'crm_module');

