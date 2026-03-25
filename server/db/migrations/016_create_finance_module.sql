CREATE TABLE IF NOT EXISTS customer_accounts (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(120) NOT NULL,
  customer_number VARCHAR(40) NOT NULL,
  customer_address TEXT,
  outlet_name VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_accounts_number_ci
ON customer_accounts (LOWER(customer_number));

CREATE TABLE IF NOT EXISTS customer_ledger_entries (
  id SERIAL PRIMARY KEY,
  account_id INT NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type VARCHAR(10) NOT NULL CHECK (entry_type IN ('DEBIT', 'CREDIT')),
  category VARCHAR(20) NOT NULL CHECK (category IN ('ORDER', 'ADVANCE', 'RECEIPT', 'ADJUSTMENT')),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  reference_order_id INT REFERENCES orders(id) ON DELETE SET NULL,
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_account_date
ON customer_ledger_entries (account_id, entry_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_order_ref
ON customer_ledger_entries (reference_order_id);

-- Backfill accounts from existing orders.
INSERT INTO customer_accounts (customer_name, customer_number, customer_address, outlet_name, created_at, updated_at)
SELECT
  x.customer_name,
  x.customer_number,
  x.customer_address,
  x.ordered_from,
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT ON (LOWER(customer_number))
    customer_name,
    customer_number,
    customer_address,
    ordered_from
  FROM orders
  ORDER BY LOWER(customer_number), created_at DESC
) x
LEFT JOIN customer_accounts a
  ON LOWER(a.customer_number) = LOWER(x.customer_number)
WHERE a.id IS NULL;

-- Backfill order debit entries.
INSERT INTO customer_ledger_entries (account_id, entry_date, entry_type, category, amount, reference_order_id, notes, created_by, created_at)
SELECT
  a.id,
  o.order_date,
  'DEBIT',
  'ORDER',
  COALESCE(o.product_price, 0),
  o.id,
  CONCAT('Order posted: ', o.production_order_no),
  o.created_by,
  COALESCE(o.created_at, NOW())
FROM orders o
JOIN customer_accounts a
  ON LOWER(a.customer_number) = LOWER(o.customer_number)
 AND LOWER(a.outlet_name) = LOWER(o.ordered_from)
LEFT JOIN customer_ledger_entries le
  ON le.reference_order_id = o.id
 AND le.category = 'ORDER'
WHERE le.id IS NULL;

-- Backfill advance credit entries.
INSERT INTO customer_ledger_entries (account_id, entry_date, entry_type, category, amount, reference_order_id, notes, created_by, created_at)
SELECT
  a.id,
  o.order_date,
  'CREDIT',
  'ADVANCE',
  COALESCE(o.advance_paid, 0),
  o.id,
  CONCAT('Advance received: ', o.production_order_no),
  o.created_by,
  COALESCE(o.created_at, NOW())
FROM orders o
JOIN customer_accounts a
  ON LOWER(a.customer_number) = LOWER(o.customer_number)
 AND LOWER(a.outlet_name) = LOWER(o.ordered_from)
LEFT JOIN customer_ledger_entries le
  ON le.reference_order_id = o.id
 AND le.category = 'ADVANCE'
WHERE COALESCE(o.advance_paid, 0) > 0
  AND le.id IS NULL;
