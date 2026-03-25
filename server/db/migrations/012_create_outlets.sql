CREATE TABLE IF NOT EXISTS outlets (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_outlets_active_name_ci
ON outlets (LOWER(name))
WHERE is_active = true;

INSERT INTO outlets (name, is_active)
VALUES
  ('Outlet 1', true),
  ('Outlet 2', true),
  ('Outlet 3', true),
  ('Outlet 4', true),
  ('Outlet 5', true),
  ('Outlet 6', true),
  ('Outlet 7', true),
  ('Outlet 8', true),
  ('Outlet 9', true),
  ('Outlet 10', true),
  ('Outlet 11', true),
  ('Outlet 12', true),
  ('Outlet 13', true),
  ('Outlet 14', true),
  ('Outlet 15', true),
  ('Outlet 16', true),
  ('Online', true)
ON CONFLICT DO NOTHING;

