CREATE TABLE IF NOT EXISTS payment_accounts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  account_type VARCHAR(10) NOT NULL CHECK (account_type IN ('CASH', 'BANK', 'COD')),
  bank_name VARCHAR(120),
  account_number VARCHAR(60),
  ifsc_code VARCHAR(30),
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_account_name_ci
ON payment_accounts (LOWER(name));

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS advance_payment_account_id INT REFERENCES payment_accounts(id),
ADD COLUMN IF NOT EXISTS balance_payment_account_id INT REFERENCES payment_accounts(id);

ALTER TABLE customer_ledger_entries
ADD COLUMN IF NOT EXISTS payment_account_id INT REFERENCES payment_accounts(id);

ALTER TABLE bank_statement_entries
ADD COLUMN IF NOT EXISTS payment_account_id INT REFERENCES payment_accounts(id);

INSERT INTO payment_accounts (name, account_type, is_active, is_default, created_at, updated_at)
SELECT 'Cash Account', 'CASH', true, true, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM payment_accounts WHERE account_type = 'CASH' AND is_active = true
);
