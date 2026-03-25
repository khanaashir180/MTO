ALTER TABLE users
  ADD COLUMN IF NOT EXISTS invite_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS invite_sent_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS invite_accepted_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS password_set_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS user_invite_emails (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_to TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'PENDING_NO_TRANSPORT',
  transport_response JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_invite_emails_user_id
  ON user_invite_emails(user_id, created_at DESC);

UPDATE users
SET invite_accepted_at = COALESCE(invite_accepted_at, NOW()),
    password_set_at = COALESCE(password_set_at, NOW()),
    is_active = true
WHERE password_hash IS NOT NULL;
