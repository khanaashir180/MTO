INSERT INTO roles (name)
VALUES ('CUSTOMER_SERVICE')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permissions)
SELECT
  r.id,
  '{
    "dashboard_retail": false,
    "new_order": false,
    "dashboard_production": false,
    "finance_module": false,
    "crm_module": true,
    "settings_access": false,
    "manage_outlets": false,
    "manage_users": false,
    "view_change_logs": false,
    "manage_role_rights": false,
    "verification_console": false,
    "stage_detail": false
  }'::jsonb
FROM roles r
WHERE r.name = 'CUSTOMER_SERVICE'
ON CONFLICT (role_id) DO NOTHING;
