CREATE TABLE IF NOT EXISTS order_change_logs (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  changed_by INT REFERENCES users(id),
  change_source VARCHAR(80) NOT NULL,
  before_data JSONB,
  after_data JSONB,
  changed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_change_logs_order_id ON order_change_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_order_change_logs_changed_at ON order_change_logs(changed_at DESC);
