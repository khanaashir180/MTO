UPDATE role_permissions rp
SET permissions = jsonb_set(
  rp.permissions,
  '{finance_module}',
  CASE
    WHEN r.name IN ('RETAIL', 'SUPER_USER') THEN 'true'::jsonb
    ELSE 'false'::jsonb
  END,
  true
)
FROM roles r
WHERE r.id = rp.role_id
  AND NOT (rp.permissions ? 'finance_module');

