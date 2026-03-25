INSERT INTO roles (name)
VALUES ('SHOP_MANAGER'), ('RETAIL_HEAD')
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permissions, updated_at)
SELECT
  r.id,
  CASE r.name
    WHEN 'SHOP_MANAGER' THEN '{
      "dashboard_retail": true,
      "new_order": true,
      "dashboard_production": false,
      "finance_module": false,
      "crm_module": false,
      "settings_access": false,
      "manage_outlets": false,
      "manage_users": false,
      "view_change_logs": false,
      "manage_role_rights": false,
      "verification_console": false,
      "stage_detail": false
    }'::jsonb
    WHEN 'RETAIL_HEAD' THEN '{
      "dashboard_retail": true,
      "new_order": false,
      "dashboard_production": false,
      "finance_module": false,
      "crm_module": false,
      "settings_access": false,
      "manage_outlets": false,
      "manage_users": false,
      "view_change_logs": false,
      "manage_role_rights": false,
      "verification_console": false,
      "stage_detail": false
    }'::jsonb
  END,
  NOW()
FROM roles r
WHERE r.name IN ('SHOP_MANAGER', 'RETAIL_HEAD')
ON CONFLICT (role_id) DO NOTHING;
