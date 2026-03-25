ALTER TABLE orders
ADD COLUMN IF NOT EXISTS mto_sole_done BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_production_flow_check;

ALTER TABLE orders
ADD CONSTRAINT orders_production_flow_check
CHECK (production_flow IN ('BESPOKE', 'EMBROIDERY', 'LASER', 'MTO'));
