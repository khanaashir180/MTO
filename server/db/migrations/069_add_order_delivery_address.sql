ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_address TEXT;

UPDATE orders
SET delivery_address = customer_address
WHERE delivery_address IS NULL;
