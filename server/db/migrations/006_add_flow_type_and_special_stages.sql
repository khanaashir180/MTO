ALTER TABLE orders
ADD COLUMN IF NOT EXISTS production_flow VARCHAR(20) NOT NULL DEFAULT 'BESPOKE';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_production_flow_check'
  ) THEN
    ALTER TABLE orders
    ADD CONSTRAINT orders_production_flow_check
    CHECK (production_flow IN ('BESPOKE', 'EMBROIDERY', 'LASER'));
  END IF;
END $$;

INSERT INTO production_stages (name, sequence)
VALUES ('Embroidery', 10)
ON CONFLICT (name) DO NOTHING;

INSERT INTO production_stages (name, sequence)
VALUES ('Laser', 11)
ON CONFLICT (name) DO NOTHING;
