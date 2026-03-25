-- Merge duplicate customer accounts by customer number (case-insensitive),
-- then enforce one account per customer number globally.

WITH duplicates AS (
  SELECT
    LOWER(customer_number) AS key_number,
    MIN(id) AS keep_id,
    ARRAY_REMOVE(ARRAY_AGG(id), MIN(id)) AS merge_ids
  FROM customer_accounts
  GROUP BY LOWER(customer_number)
  HAVING COUNT(*) > 1
),
to_move AS (
  SELECT d.keep_id, UNNEST(d.merge_ids) AS old_id
  FROM duplicates d
)
UPDATE customer_ledger_entries le
SET account_id = tm.keep_id
FROM to_move tm
WHERE le.account_id = tm.old_id;

WITH duplicates AS (
  SELECT
    LOWER(customer_number) AS key_number,
    MIN(id) AS keep_id,
    ARRAY_REMOVE(ARRAY_AGG(id), MIN(id)) AS merge_ids
  FROM customer_accounts
  GROUP BY LOWER(customer_number)
  HAVING COUNT(*) > 1
),
to_move AS (
  SELECT d.keep_id, UNNEST(d.merge_ids) AS old_id
  FROM duplicates d
)
UPDATE customer_interactions ci
SET account_id = tm.keep_id
FROM to_move tm
WHERE ci.account_id = tm.old_id;

WITH duplicates AS (
  SELECT
    LOWER(customer_number) AS key_number,
    MIN(id) AS keep_id,
    ARRAY_REMOVE(ARRAY_AGG(id), MIN(id)) AS merge_ids
  FROM customer_accounts
  GROUP BY LOWER(customer_number)
  HAVING COUNT(*) > 1
),
to_delete AS (
  SELECT UNNEST(merge_ids) AS id
  FROM duplicates
)
DELETE FROM customer_accounts a
USING to_delete d
WHERE a.id = d.id;

DROP INDEX IF EXISTS uq_customer_accounts_number_outlet_ci;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_accounts_number_ci
ON customer_accounts (LOWER(customer_number));

