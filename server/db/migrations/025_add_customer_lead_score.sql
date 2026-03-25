ALTER TABLE customer_accounts
ADD COLUMN IF NOT EXISTS lead_score INT NOT NULL DEFAULT 0;

ALTER TABLE customer_accounts
DROP CONSTRAINT IF EXISTS customer_accounts_lead_score_check;

ALTER TABLE customer_accounts
ADD CONSTRAINT customer_accounts_lead_score_check
CHECK (lead_score BETWEEN 0 AND 100);
