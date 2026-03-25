CREATE TABLE IF NOT EXISTS rms_putaway_rules (
  id SERIAL PRIMARY KEY,
  warehouse_id INT NOT NULL REFERENCES mrp_warehouses(id) ON DELETE CASCADE,
  item_id INT REFERENCES mrp_items(id) ON DELETE CASCADE,
  item_type VARCHAR(40),
  preferred_bin_id INT NOT NULL REFERENCES rms_bins(id) ON DELETE CASCADE,
  priority_rank INT NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rms_cycle_count_policies (
  id SERIAL PRIMARY KEY,
  warehouse_id INT NOT NULL REFERENCES mrp_warehouses(id) ON DELETE CASCADE,
  item_id INT REFERENCES mrp_items(id) ON DELETE CASCADE,
  abc_class VARCHAR(10),
  frequency_days INT NOT NULL DEFAULT 30,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rms_cycle_counts (
  id SERIAL PRIMARY KEY,
  count_no VARCHAR(80) NOT NULL UNIQUE,
  warehouse_id INT NOT NULL REFERENCES mrp_warehouses(id) ON DELETE CASCADE,
  count_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'POSTED', 'CANCELLED')),
  created_by INT REFERENCES users(id),
  posted_by INT REFERENCES users(id),
  posted_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rms_cycle_count_lines (
  id SERIAL PRIMARY KEY,
  cycle_count_id INT NOT NULL REFERENCES rms_cycle_counts(id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE CASCADE,
  bin_id INT REFERENCES rms_bins(id) ON DELETE SET NULL,
  system_qty NUMERIC(14,2) NOT NULL DEFAULT 0,
  counted_qty NUMERIC(14,2),
  variance_qty NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rms_replenishment_rules (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE CASCADE,
  warehouse_id INT NOT NULL REFERENCES mrp_warehouses(id) ON DELETE CASCADE,
  min_qty NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_qty NUMERIC(14,2) NOT NULL DEFAULT 0,
  multiple_qty NUMERIC(14,2) NOT NULL DEFAULT 1,
  lead_time_days INT NOT NULL DEFAULT 0,
  preferred_vendor_id INT REFERENCES finance_vendors(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, warehouse_id)
);

CREATE TABLE IF NOT EXISTS rms_pick_waves (
  id SERIAL PRIMARY KEY,
  wave_no VARCHAR(80) NOT NULL UNIQUE,
  warehouse_id INT NOT NULL REFERENCES mrp_warehouses(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'PICKING', 'DONE', 'CANCELLED')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rms_pick_wave_lines (
  id SERIAL PRIMARY KEY,
  wave_id INT NOT NULL REFERENCES rms_pick_waves(id) ON DELETE CASCADE,
  requisition_line_id INT REFERENCES rms_requisition_lines(id) ON DELETE SET NULL,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE CASCADE,
  bin_id INT REFERENCES rms_bins(id) ON DELETE SET NULL,
  qty_to_pick NUMERIC(14,2) NOT NULL DEFAULT 0,
  qty_picked NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (line_status IN ('OPEN', 'PARTIAL', 'PICKED'))
);

CREATE INDEX IF NOT EXISTS idx_rms_putaway_wh ON rms_putaway_rules (warehouse_id, priority_rank);
CREATE INDEX IF NOT EXISTS idx_rms_count_status ON rms_cycle_counts (status, count_date DESC);
CREATE INDEX IF NOT EXISTS idx_rms_repl_wh_item ON rms_replenishment_rules (warehouse_id, item_id);
CREATE INDEX IF NOT EXISTS idx_rms_wave_status ON rms_pick_waves (status, created_at DESC);
