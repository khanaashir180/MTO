ALTER TABLE payment_accounts
DROP CONSTRAINT IF EXISTS payment_accounts_account_type_check;

ALTER TABLE payment_accounts
ADD CONSTRAINT payment_accounts_account_type_check
CHECK (account_type IN ('CASH', 'BANK', 'COD'));

