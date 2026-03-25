ALTER TABLE orders
ADD COLUMN IF NOT EXISTS order_type VARCHAR(30) NOT NULL DEFAULT 'MTO';

ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_order_type_check;

ALTER TABLE orders
ADD CONSTRAINT orders_order_type_check
CHECK (order_type IN ('MTO', 'REFURBISHMENT'));

CREATE TABLE IF NOT EXISTS order_refurbishments (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  item_condition VARCHAR(80),
  refurbishment_type VARCHAR(120),
  issue_description TEXT,
  work_requested TEXT,
  accessories_received TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
