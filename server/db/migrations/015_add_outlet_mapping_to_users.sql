ALTER TABLE users
ADD COLUMN IF NOT EXISTS outlet_id INT REFERENCES outlets(id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_outlet_id
ON users (outlet_id)
WHERE outlet_id IS NOT NULL;

