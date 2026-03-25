ALTER TABLE payment_accounts
ADD COLUMN IF NOT EXISTS iban VARCHAR(60);

-- Preserve old values if ifsc_code was used previously.
UPDATE payment_accounts
SET iban = COALESCE(iban, ifsc_code)
WHERE (iban IS NULL OR iban = '')
  AND ifsc_code IS NOT NULL
  AND ifsc_code <> '';

