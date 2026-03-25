CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(60) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS production_stages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) UNIQUE NOT NULL,
  sequence INT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INT NOT NULL REFERENCES roles(id),
  stage_access INT REFERENCES production_stages(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  production_order_no VARCHAR(80) UNIQUE NOT NULL,
  customer_name VARCHAR(120) NOT NULL,
  customer_number VARCHAR(40) NOT NULL,
  customer_address TEXT NOT NULL,
  ordered_from VARCHAR(80) NOT NULL,
  order_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  current_stage_id INT REFERENCES production_stages(id),
  completed_at TIMESTAMP,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_products (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_name VARCHAR(120) NOT NULL,
  size VARCHAR(60),
  colour VARCHAR(80),
  last_number VARCHAR(80),
  sole VARCHAR(120),
  upper_material VARCHAR(120),
  lining_material VARCHAR(120),
  edge_colour VARCHAR(80),
  socks VARCHAR(120),
  welt VARCHAR(120),
  stamp VARCHAR(120),
  barcode VARCHAR(120) UNIQUE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES order_products(id) ON DELETE CASCADE,
  image_type VARCHAR(60) NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  original_name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_stage_history (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stage_id INT NOT NULL REFERENCES production_stages(id),
  status VARCHAR(40) NOT NULL,
  scanned_by INT REFERENCES users(id),
  scanned_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_orders_due_date ON orders (due_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON order_products (barcode);
CREATE INDEX IF NOT EXISTS idx_history_order ON order_stage_history (order_id);

INSERT INTO roles (name)
VALUES ('RETAIL'), ('PRODUCTION_SUPERVISOR'), ('PRODUCTION_MANAGER'), ('SUPER_USER')
ON CONFLICT (name) DO NOTHING;

INSERT INTO production_stages (name, sequence)
VALUES
  ('Verification', 1),
  ('Model Room', 2),
  ('Cutting', 3),
  ('Closing', 4),
  ('Sole', 5),
  ('Lasting', 6),
  ('Finishing', 7),
  ('QC', 8)
ON CONFLICT (sequence) DO NOTHING;
