CREATE TABLE IF NOT EXISTS rms_routing_rules (
  id SERIAL PRIMARY KEY,
  rule_name VARCHAR(160) NOT NULL,
  item_id INT REFERENCES mrp_items(id) ON DELETE CASCADE,
  item_type VARCHAR(40),
  source_warehouse_id INT REFERENCES mrp_warehouses(id) ON DELETE CASCADE,
  source_bin_id INT REFERENCES rms_bins(id) ON DELETE SET NULL,
  destination_warehouse_id INT REFERENCES mrp_warehouses(id) ON DELETE CASCADE,
  destination_bin_id INT REFERENCES rms_bins(id) ON DELETE SET NULL,
  route_action VARCHAR(30) NOT NULL DEFAULT 'TRANSFER'
    CHECK (route_action IN ('PUTAWAY', 'TRANSFER', 'CROSS_DOCK', 'PICK')),
  priority_rank INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rms_procurement_runs (
  id SERIAL PRIMARY KEY,
  run_no VARCHAR(80) NOT NULL UNIQUE,
  warehouse_id INT REFERENCES mrp_warehouses(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS'
    CHECK (status IN ('SUCCESS', 'FAILED', 'PARTIAL')),
  created_suggestions INT NOT NULL DEFAULT 0,
  notes TEXT,
  triggered_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rms_valuation_layers (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE CASCADE,
  warehouse_id INT REFERENCES mrp_warehouses(id) ON DELETE SET NULL,
  transaction_id INT REFERENCES rms_transactions(id) ON DELETE SET NULL,
  layer_type VARCHAR(20) NOT NULL CHECK (layer_type IN ('IN', 'OUT', 'ADJUSTMENT')),
  qty NUMERIC(14,2) NOT NULL,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  layer_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  running_qty NUMERIC(14,2) NOT NULL DEFAULT 0,
  running_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rms_routing_priority ON rms_routing_rules (active, priority_rank);
CREATE INDEX IF NOT EXISTS idx_rms_proc_runs_time ON rms_procurement_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rms_valuation_item_time ON rms_valuation_layers (item_id, created_at DESC);
