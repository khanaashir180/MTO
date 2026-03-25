ALTER TABLE crm_contacts
  ADD COLUMN IF NOT EXISTS alternate_email TEXT,
  ADD COLUMN IF NOT EXISTS alternate_phone TEXT,
  ADD COLUMN IF NOT EXISTS preferred_channel TEXT DEFAULT 'PHONE',
  ADD COLUMN IF NOT EXISTS decision_role TEXT,
  ADD COLUMN IF NOT EXISTS influence_level TEXT DEFAULT 'MEDIUM',
  ADD COLUMN IF NOT EXISTS relationship_strength TEXT DEFAULT 'WARM',
  ADD COLUMN IF NOT EXISTS reports_to_contact_id INTEGER REFERENCES crm_contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS do_not_contact BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_reports_to_contact_id
  ON crm_contacts(reports_to_contact_id);
