CREATE TABLE IF NOT EXISTS bank_statement_entries (
  id SERIAL PRIMARY KEY,
  transaction_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  reference_no VARCHAR(120),
  narration TEXT,
  outlet_name VARCHAR(80),
  customer_number VARCHAR(40),
  status VARCHAR(12) NOT NULL DEFAULT 'UNMATCHED' CHECK (status IN ('UNMATCHED', 'MATCHED', 'IGNORED')),
  matched_ledger_entry_id INT REFERENCES customer_ledger_entries(id) ON DELETE SET NULL,
  imported_by INT REFERENCES users(id),
  matched_by INT REFERENCES users(id),
  matched_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE customer_ledger_entries
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(12) NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (verification_status IN ('NOT_REQUIRED', 'PENDING', 'VERIFIED')),
ADD COLUMN IF NOT EXISTS verified_by INT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS verification_notes TEXT,
ADD COLUMN IF NOT EXISTS bank_statement_entry_id INT REFERENCES bank_statement_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_statement_status_date
ON bank_statement_entries (status, transaction_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_verification_status
ON customer_ledger_entries (verification_status, category, entry_type, entry_date DESC);

UPDATE customer_ledger_entries
SET verification_status = CASE
  WHEN category = 'RECEIPT' AND entry_type = 'CREDIT' THEN 'PENDING'
  ELSE 'NOT_REQUIRED'
END
WHERE verification_status = 'NOT_REQUIRED';

