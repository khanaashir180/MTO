ALTER TABLE orders
ADD COLUMN IF NOT EXISTS received_in_store_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS received_in_store_by INT REFERENCES users(id),
ADD COLUMN IF NOT EXISTS delivered_to_customer_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS delivered_to_customer_by INT REFERENCES users(id);

CREATE TABLE IF NOT EXISTS retail_delivery_updates (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  update_date DATE NOT NULL DEFAULT CURRENT_DATE,
  customer_status VARCHAR(80) NOT NULL,
  notes TEXT,
  updated_by INT REFERENCES users(id),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_retail_delivery_updates_order_date
ON retail_delivery_updates (order_id, update_date);

CREATE INDEX IF NOT EXISTS idx_retail_delivery_updates_order
ON retail_delivery_updates (order_id, update_date DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_store_delivery_pending
ON orders (ordered_from, received_in_store_at, delivered_to_customer_at, status);
