CREATE TABLE IF NOT EXISTS rms_bins (
  id SERIAL PRIMARY KEY,
  warehouse_id INT NOT NULL REFERENCES mrp_warehouses(id) ON DELETE CASCADE,
  bin_code VARCHAR(80) NOT NULL,
  bin_name VARCHAR(160) NOT NULL,
  zone_name VARCHAR(80),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (warehouse_id, bin_code)
);

CREATE TABLE IF NOT EXISTS rms_item_balances (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE CASCADE,
  warehouse_id INT NOT NULL REFERENCES mrp_warehouses(id) ON DELETE CASCADE,
  bin_id INT REFERENCES rms_bins(id) ON DELETE SET NULL,
  qty_on_hand NUMERIC(14,2) NOT NULL DEFAULT 0,
  qty_reserved NUMERIC(14,2) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(14,2) NOT NULL DEFAULT 0,
  min_level NUMERIC(14,2) NOT NULL DEFAULT 0,
  max_level NUMERIC(14,2) NOT NULL DEFAULT 0,
  last_counted_at TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, warehouse_id, bin_id)
);

CREATE TABLE IF NOT EXISTS rms_transactions (
  id SERIAL PRIMARY KEY,
  txn_no VARCHAR(80) NOT NULL UNIQUE,
  txn_type VARCHAR(40) NOT NULL,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE RESTRICT,
  warehouse_id INT NOT NULL REFERENCES mrp_warehouses(id) ON DELETE RESTRICT,
  bin_id INT REFERENCES rms_bins(id) ON DELETE SET NULL,
  qty NUMERIC(14,2) NOT NULL,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('IN', 'OUT')),
  reference_type VARCHAR(40),
  reference_id INT,
  reference_no VARCHAR(100),
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT rms_txn_type_check CHECK (
    txn_type IN ('GRN', 'ISSUE', 'TRANSFER_OUT', 'TRANSFER_IN', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'COUNT')
  )
);

CREATE TABLE IF NOT EXISTS rms_stock_transfers (
  id SERIAL PRIMARY KEY,
  transfer_no VARCHAR(80) NOT NULL UNIQUE,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE RESTRICT,
  from_warehouse_id INT NOT NULL REFERENCES mrp_warehouses(id) ON DELETE RESTRICT,
  from_bin_id INT REFERENCES rms_bins(id) ON DELETE SET NULL,
  to_warehouse_id INT NOT NULL REFERENCES mrp_warehouses(id) ON DELETE RESTRICT,
  to_bin_id INT REFERENCES rms_bins(id) ON DELETE SET NULL,
  qty NUMERIC(14,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED'
    CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rms_grns (
  id SERIAL PRIMARY KEY,
  grn_no VARCHAR(80) NOT NULL UNIQUE,
  vendor_id INT REFERENCES finance_vendors(id) ON DELETE SET NULL,
  warehouse_id INT NOT NULL REFERENCES mrp_warehouses(id) ON DELETE RESTRICT,
  grn_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'POSTED'
    CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rms_grn_lines (
  id SERIAL PRIMARY KEY,
  grn_id INT NOT NULL REFERENCES rms_grns(id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE RESTRICT,
  bin_id INT REFERENCES rms_bins(id) ON DELETE SET NULL,
  lot_no VARCHAR(80),
  expiry_date DATE,
  qty_received NUMERIC(14,2) NOT NULL,
  unit_cost NUMERIC(14,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rms_requisitions (
  id SERIAL PRIMARY KEY,
  req_no VARCHAR(80) NOT NULL UNIQUE,
  requester_id INT REFERENCES users(id),
  warehouse_id INT NOT NULL REFERENCES mrp_warehouses(id) ON DELETE RESTRICT,
  needed_by DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'APPROVED', 'PARTIAL', 'FULFILLED', 'REJECTED')),
  approved_by INT REFERENCES users(id),
  approved_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rms_requisition_lines (
  id SERIAL PRIMARY KEY,
  requisition_id INT NOT NULL REFERENCES rms_requisitions(id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE RESTRICT,
  bin_id INT REFERENCES rms_bins(id) ON DELETE SET NULL,
  qty_requested NUMERIC(14,2) NOT NULL,
  qty_issued NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
    CHECK (line_status IN ('OPEN', 'PARTIAL', 'FULFILLED', 'REJECTED')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rms_balances_item_wh ON rms_item_balances (item_id, warehouse_id);
CREATE INDEX IF NOT EXISTS idx_rms_txn_item_time ON rms_transactions (item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rms_txn_wh_time ON rms_transactions (warehouse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rms_grn_date ON rms_grns (grn_date DESC);
CREATE INDEX IF NOT EXISTS idx_rms_req_status ON rms_requisitions (status, needed_by);
