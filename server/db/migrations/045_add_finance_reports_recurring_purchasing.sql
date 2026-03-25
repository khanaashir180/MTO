CREATE TABLE IF NOT EXISTS finance_purchase_orders (
  id SERIAL PRIMARY KEY,
  po_number VARCHAR(50) UNIQUE NOT NULL,
  vendor_id INT NOT NULL REFERENCES finance_vendors(id) ON DELETE CASCADE,
  po_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'APPROVED', 'ISSUED', 'RECEIVED', 'CLOSED', 'CANCELLED')),
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_purchase_order_lines (
  id SERIAL PRIMARY KEY,
  purchase_order_id INT NOT NULL REFERENCES finance_purchase_orders(id) ON DELETE CASCADE,
  description VARCHAR(220) NOT NULL,
  qty NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate_id INT REFERENCES finance_tax_rates(id) ON DELETE SET NULL,
  line_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_recurring_templates (
  id SERIAL PRIMARY KEY,
  template_name VARCHAR(160) UNIQUE NOT NULL,
  entity_type VARCHAR(20) NOT NULL
    CHECK (entity_type IN ('INVOICE', 'BILL', 'JOURNAL')),
  frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY'
    CHECK (frequency IN ('WEEKLY', 'MONTHLY', 'QUARTERLY')),
  next_run_date DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_run_at TIMESTAMP,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_recurring_runs (
  id SERIAL PRIMARY KEY,
  template_id INT NOT NULL REFERENCES finance_recurring_templates(id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL,
  generated_entity_id INT,
  status VARCHAR(20) NOT NULL DEFAULT 'SUCCESS'
    CHECK (status IN ('SUCCESS', 'FAILED')),
  run_message TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO finance_recurring_templates (template_name, entity_type, frequency, next_run_date, payload_json, active)
VALUES
  ('Monthly Service Invoice', 'INVOICE', 'MONTHLY', CURRENT_DATE + INTERVAL '15 days', '{"notes":"Auto-generated monthly service invoice"}'::jsonb, TRUE),
  ('Monthly Vendor Bill', 'BILL', 'MONTHLY', CURRENT_DATE + INTERVAL '10 days', '{"notes":"Auto-generated vendor bill"}'::jsonb, TRUE)
ON CONFLICT (template_name) DO NOTHING;
