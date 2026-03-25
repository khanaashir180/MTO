CREATE TABLE IF NOT EXISTS role_permissions (
  id SERIAL PRIMARY KEY,
  role_id INT NOT NULL UNIQUE REFERENCES roles(id) ON DELETE CASCADE,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

INSERT INTO role_permissions (role_id, permissions)
SELECT
  r.id,
  CASE r.name
    WHEN 'SUPER_USER' THEN '{
      "dashboard_retail": true,
      "new_order": true,
      "dashboard_production": true,
      "finance_module": true,
      "crm_module": true,
      "settings_access": true,
      "manage_outlets": true,
      "manage_users": true,
      "view_change_logs": true,
      "manage_role_rights": true,
      "verification_console": true,
      "stage_detail": true
    }'::jsonb
    WHEN 'PRODUCTION_MANAGER' THEN '{
      "dashboard_retail": false,
      "new_order": false,
      "dashboard_production": true,
      "finance_module": false,
      "crm_module": false,
      "settings_access": false,
      "manage_outlets": false,
      "manage_users": false,
      "view_change_logs": false,
      "manage_role_rights": false,
      "verification_console": true,
      "stage_detail": true
    }'::jsonb
    WHEN 'PRODUCTION_SUPERVISOR' THEN '{
      "dashboard_retail": false,
      "new_order": false,
      "dashboard_production": true,
      "finance_module": false,
      "crm_module": false,
      "settings_access": false,
      "manage_outlets": false,
      "manage_users": false,
      "view_change_logs": false,
      "manage_role_rights": false,
      "verification_console": true,
      "stage_detail": true
    }'::jsonb
    ELSE '{
      "dashboard_retail": true,
      "new_order": true,
      "dashboard_production": false,
      "finance_module": true,
      "crm_module": true,
      "settings_access": false,
      "manage_outlets": false,
      "manage_users": false,
      "view_change_logs": false,
      "manage_role_rights": false,
      "verification_console": false,
      "stage_detail": false
    }'::jsonb
  END
FROM roles r
ON CONFLICT (role_id) DO NOTHING;
