CREATE TABLE IF NOT EXISTS retail_order_capacity (
  id SERIAL PRIMARY KEY,
  capacity_date DATE NOT NULL,
  order_type VARCHAR(40) NOT NULL DEFAULT 'MTO',
  capacity_limit INTEGER NOT NULL CHECK (capacity_limit >= 0),
  notes TEXT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (capacity_date, order_type)
);
