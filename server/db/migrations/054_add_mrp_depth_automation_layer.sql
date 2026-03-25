CREATE TABLE IF NOT EXISTS mrp_warehouses (
  id SERIAL PRIMARY KEY,
  warehouse_code VARCHAR(60) NOT NULL UNIQUE,
  warehouse_name VARCHAR(160) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO mrp_warehouses (warehouse_code, warehouse_name, is_default)
VALUES ('MAIN', 'Main Warehouse', TRUE)
ON CONFLICT (warehouse_code) DO NOTHING;

ALTER TABLE mrp_stock_lots
ADD COLUMN IF NOT EXISTS warehouse_id INT REFERENCES mrp_warehouses(id) ON DELETE SET NULL;

UPDATE mrp_stock_lots
SET warehouse_id = (SELECT id FROM mrp_warehouses WHERE is_default = TRUE ORDER BY id LIMIT 1)
WHERE warehouse_id IS NULL;

CREATE TABLE IF NOT EXISTS mrp_demand_forecasts (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE CASCADE,
  forecast_month DATE NOT NULL,
  demand_qty NUMERIC(14,2) NOT NULL DEFAULT 0,
  confidence_pct NUMERIC(6,2) NOT NULL DEFAULT 70,
  source VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, forecast_month)
);

CREATE TABLE IF NOT EXISTS mrp_integration_connectors (
  id SERIAL PRIMARY KEY,
  provider_name VARCHAR(80) NOT NULL,
  connector_type VARCHAR(40) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DISCONNECTED',
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT mrp_connector_status_check CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'ERROR'))
);

CREATE TABLE IF NOT EXISTS mrp_integration_runs (
  id SERIAL PRIMARY KEY,
  connector_id INT NOT NULL REFERENCES mrp_integration_connectors(id) ON DELETE CASCADE,
  run_type VARCHAR(40) NOT NULL DEFAULT 'SYNC',
  status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
  records_pulled INT NOT NULL DEFAULT 0,
  records_pushed INT NOT NULL DEFAULT 0,
  run_notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT mrp_integration_run_status_check CHECK (status IN ('SUCCESS', 'FAILED', 'PARTIAL'))
);

CREATE TABLE IF NOT EXISTS mrp_shop_floor_events (
  id SERIAL PRIMARY KEY,
  operation_id INT NOT NULL REFERENCES mrp_work_order_operations(id) ON DELETE CASCADE,
  event_type VARCHAR(30) NOT NULL,
  event_time TIMESTAMP NOT NULL DEFAULT NOW(),
  duration_minutes NUMERIC(10,2) NOT NULL DEFAULT 0,
  actor_user_id INT REFERENCES users(id),
  notes TEXT,
  CONSTRAINT mrp_shop_floor_event_type_check CHECK (event_type IN ('START', 'PAUSE', 'RESUME', 'COMPLETE'))
);

ALTER TABLE mrp_purchase_suggestions
ADD COLUMN IF NOT EXISTS finance_po_id INT REFERENCES finance_purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mrp_stock_lots_warehouse ON mrp_stock_lots (warehouse_id, item_id);
CREATE INDEX IF NOT EXISTS idx_mrp_forecasts_month ON mrp_demand_forecasts (forecast_month, item_id);
CREATE INDEX IF NOT EXISTS idx_mrp_connectors_status ON mrp_integration_connectors (status, provider_name);
CREATE INDEX IF NOT EXISTS idx_mrp_shop_floor_op ON mrp_shop_floor_events (operation_id, event_time DESC);
