CREATE TABLE IF NOT EXISTS mrp_items (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(80) NOT NULL UNIQUE,
  item_name VARCHAR(180) NOT NULL,
  uom VARCHAR(30) NOT NULL DEFAULT 'EA',
  item_type VARCHAR(30) NOT NULL DEFAULT 'RAW_MATERIAL',
  lead_time_days INT NOT NULL DEFAULT 0,
  reorder_point NUMERIC(14, 2) NOT NULL DEFAULT 0,
  safety_stock NUMERIC(14, 2) NOT NULL DEFAULT 0,
  preferred_vendor VARCHAR(180),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT mrp_items_type_check CHECK (item_type IN ('RAW_MATERIAL', 'SUBASSEMBLY', 'FINISHED_GOOD', 'CONSUMABLE'))
);

CREATE TABLE IF NOT EXISTS mrp_boms (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE CASCADE,
  bom_name VARCHAR(160) NOT NULL,
  version_no INT NOT NULL DEFAULT 1,
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mrp_bom_lines (
  id SERIAL PRIMARY KEY,
  bom_id INT NOT NULL REFERENCES mrp_boms(id) ON DELETE CASCADE,
  component_item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE RESTRICT,
  qty_per NUMERIC(14, 4) NOT NULL,
  scrap_pct NUMERIC(7, 3) NOT NULL DEFAULT 0,
  operation_sequence INT NOT NULL DEFAULT 10,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mrp_work_centers (
  id SERIAL PRIMARY KEY,
  center_code VARCHAR(80) NOT NULL UNIQUE,
  center_name VARCHAR(160) NOT NULL,
  capacity_hours_per_day NUMERIC(10, 2) NOT NULL DEFAULT 8,
  efficiency_pct NUMERIC(6, 2) NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mrp_work_orders (
  id SERIAL PRIMARY KEY,
  wo_no VARCHAR(80) NOT NULL UNIQUE,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE RESTRICT,
  bom_id INT REFERENCES mrp_boms(id) ON DELETE SET NULL,
  qty_planned NUMERIC(14, 2) NOT NULL,
  qty_completed NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'PLANNED',
  priority_rank INT NOT NULL DEFAULT 9999,
  due_date DATE,
  planned_start TIMESTAMP,
  planned_end TIMESTAMP,
  actual_start TIMESTAMP,
  actual_end TIMESTAMP,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT mrp_work_order_status_check CHECK (status IN ('PLANNED', 'RELEASED', 'IN_PROGRESS', 'DONE', 'CLOSED', 'ON_HOLD'))
);

CREATE TABLE IF NOT EXISTS mrp_work_order_operations (
  id SERIAL PRIMARY KEY,
  work_order_id INT NOT NULL REFERENCES mrp_work_orders(id) ON DELETE CASCADE,
  operation_name VARCHAR(180) NOT NULL,
  work_center_id INT REFERENCES mrp_work_centers(id) ON DELETE SET NULL,
  sequence_no INT NOT NULL DEFAULT 10,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  planned_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  actual_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  assigned_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT mrp_wo_operation_status_check CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE', 'BLOCKED'))
);

CREATE TABLE IF NOT EXISTS mrp_stock_lots (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE CASCADE,
  lot_no VARCHAR(80) NOT NULL,
  source_type VARCHAR(30) NOT NULL DEFAULT 'RECEIPT',
  source_ref VARCHAR(120),
  qty_received NUMERIC(14, 2) NOT NULL DEFAULT 0,
  qty_available NUMERIC(14, 2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(14, 4) NOT NULL DEFAULT 0,
  expiry_date DATE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, lot_no)
);

CREATE TABLE IF NOT EXISTS mrp_stock_reservations (
  id SERIAL PRIMARY KEY,
  work_order_id INT NOT NULL REFERENCES mrp_work_orders(id) ON DELETE CASCADE,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE RESTRICT,
  lot_id INT REFERENCES mrp_stock_lots(id) ON DELETE SET NULL,
  qty_reserved NUMERIC(14, 2) NOT NULL DEFAULT 0,
  qty_consumed NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'RESERVED',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT mrp_reservation_status_check CHECK (status IN ('RESERVED', 'PARTIAL', 'CONSUMED', 'RELEASED'))
);

CREATE TABLE IF NOT EXISTS mrp_purchase_suggestions (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES mrp_items(id) ON DELETE CASCADE,
  suggested_qty NUMERIC(14, 2) NOT NULL,
  required_date DATE,
  reason VARCHAR(260) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT mrp_purchase_suggestion_status_check CHECK (status IN ('OPEN', 'PO_CREATED', 'IGNORED'))
);

CREATE INDEX IF NOT EXISTS idx_mrp_boms_item_id ON mrp_boms (item_id);
CREATE INDEX IF NOT EXISTS idx_mrp_bom_lines_bom_id ON mrp_bom_lines (bom_id);
CREATE INDEX IF NOT EXISTS idx_mrp_work_orders_status_due ON mrp_work_orders (status, due_date);
CREATE INDEX IF NOT EXISTS idx_mrp_work_order_operations_wo ON mrp_work_order_operations (work_order_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_mrp_stock_lots_item ON mrp_stock_lots (item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mrp_stock_reservations_wo ON mrp_stock_reservations (work_order_id);
CREATE INDEX IF NOT EXISTS idx_mrp_purchase_suggestions_status ON mrp_purchase_suggestions (status, required_date);

INSERT INTO mrp_work_centers (center_code, center_name, capacity_hours_per_day, efficiency_pct)
VALUES
  ('CUTTING', 'Cutting Center', 16, 90),
  ('ASSEMBLY', 'Assembly Center', 20, 88),
  ('FINISHING', 'Finishing Center', 12, 92),
  ('QC', 'Quality Center', 10, 95)
ON CONFLICT (center_code) DO NOTHING;
