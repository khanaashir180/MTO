CREATE TABLE IF NOT EXISTS finance_inventory_items (
  id SERIAL PRIMARY KEY,
  sku VARCHAR(80) UNIQUE NOT NULL,
  item_name VARCHAR(180) NOT NULL,
  item_type VARCHAR(20) NOT NULL DEFAULT 'PRODUCT'
    CHECK (item_type IN ('PRODUCT', 'SERVICE', 'MATERIAL')),
  valuation_method VARCHAR(20) NOT NULL DEFAULT 'FIFO'
    CHECK (valuation_method IN ('FIFO', 'AVERAGE')),
  qty_on_hand NUMERIC(12,2) NOT NULL DEFAULT 0,
  avg_unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  sales_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_inventory_movements (
  id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES finance_inventory_items(id) ON DELETE CASCADE,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  movement_type VARCHAR(20) NOT NULL
    CHECK (movement_type IN ('PURCHASE', 'SALE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT')),
  qty NUMERIC(12,2) NOT NULL,
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0,
  reference_type VARCHAR(20),
  reference_id INT,
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_class_tags (
  id SERIAL PRIMARY KEY,
  class_name VARCHAR(120) UNIQUE NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_location_tags (
  id SERIAL PRIMARY KEY,
  location_name VARCHAR(120) UNIQUE NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_budgets (
  id SERIAL PRIMARY KEY,
  budget_name VARCHAR(160) NOT NULL,
  fiscal_year INT NOT NULL,
  class_id INT REFERENCES finance_class_tags(id) ON DELETE SET NULL,
  location_id INT REFERENCES finance_location_tags(id) ON DELETE SET NULL,
  revenue_target NUMERIC(12,2) NOT NULL DEFAULT 0,
  expense_target NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'APPROVED', 'LOCKED')),
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_projects (
  id SERIAL PRIMARY KEY,
  project_code VARCHAR(60) UNIQUE NOT NULL,
  project_name VARCHAR(180) NOT NULL,
  customer_account_id INT REFERENCES customer_accounts(id) ON DELETE SET NULL,
  class_id INT REFERENCES finance_class_tags(id) ON DELETE SET NULL,
  location_id INT REFERENCES finance_location_tags(id) ON DELETE SET NULL,
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED')),
  budget_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  actual_revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_project_entries (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES finance_projects(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type VARCHAR(20) NOT NULL
    CHECK (entry_type IN ('COST', 'REVENUE', 'TIME')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_payroll_profiles (
  id SERIAL PRIMARY KEY,
  employee_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  employee_code VARCHAR(40) UNIQUE NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  salary_type VARCHAR(20) NOT NULL DEFAULT 'MONTHLY'
    CHECK (salary_type IN ('MONTHLY', 'HOURLY')),
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_payroll_runs (
  id SERIAL PRIMARY KEY,
  run_label VARCHAR(120) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'POSTED', 'PAID', 'CANCELLED')),
  total_gross NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_tax NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_net NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finance_payroll_run_lines (
  id SERIAL PRIMARY KEY,
  payroll_run_id INT NOT NULL REFERENCES finance_payroll_runs(id) ON DELETE CASCADE,
  payroll_profile_id INT NOT NULL REFERENCES finance_payroll_profiles(id) ON DELETE CASCADE,
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (payroll_run_id, payroll_profile_id)
);

INSERT INTO finance_class_tags (class_name, description)
VALUES
  ('Retail', 'Retail sales and operations'),
  ('Corporate', 'Corporate accounts')
ON CONFLICT (class_name) DO NOTHING;

INSERT INTO finance_location_tags (location_name, description)
VALUES
  ('Main Branch', 'Primary operating location'),
  ('Warehouse', 'Inventory and dispatch location')
ON CONFLICT (location_name) DO NOTHING;
