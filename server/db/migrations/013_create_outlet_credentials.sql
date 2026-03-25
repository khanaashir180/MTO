CREATE TABLE IF NOT EXISTS outlet_credentials (
  id SERIAL PRIMARY KEY,
  outlet_id INT NOT NULL UNIQUE REFERENCES outlets(id) ON DELETE CASCADE,
  username VARCHAR(80) NOT NULL,
  password_plain VARCHAR(80) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_outlet_credentials_username_ci
ON outlet_credentials (LOWER(username));

INSERT INTO outlet_credentials (outlet_id, username, password_plain)
SELECT o.id, CONCAT('outlet_', o.id), 'password123'
FROM outlets o
LEFT JOIN outlet_credentials c ON c.outlet_id = o.id
WHERE o.is_active = true
  AND c.id IS NULL;

