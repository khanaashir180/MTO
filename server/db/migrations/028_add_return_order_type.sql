ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_order_type_check;

ALTER TABLE orders
ADD CONSTRAINT orders_order_type_check
CHECK (order_type IN ('MTO', 'REFURBISHMENT', 'RETURN'));

CREATE TABLE IF NOT EXISTS order_returns (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  return_condition VARCHAR(120),
  return_reason TEXT,
  return_request TEXT,
  accessories_received TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
