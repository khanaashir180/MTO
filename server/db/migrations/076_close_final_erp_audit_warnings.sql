INSERT INTO payment_accounts (name, account_type, is_active, is_default, created_at, updated_at)
SELECT 'COD Account', 'COD', true, false, NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1
  FROM payment_accounts
  WHERE account_type = 'COD'
    AND is_active = true
);

INSERT INTO workflow_rules (
  workflow_id,
  rule_key,
  condition_json,
  action_json,
  priority,
  active,
  created_by,
  updated_by,
  created_at,
  updated_at
)
SELECT wd.id,
       'seed_never_match_v1',
       '{"flow":"__NEVER__"}'::jsonb,
       '{"nextStage":"Verification"}'::jsonb,
       9999,
       true,
       NULL,
       NULL,
       NOW(),
       NOW()
FROM workflow_definitions wd
WHERE wd.workflow_key = 'default_mto'
  AND NOT EXISTS (
    SELECT 1
    FROM workflow_rules wr
    WHERE wr.workflow_id = wd.id
      AND wr.rule_key = 'seed_never_match_v1'
  );

WITH first_order AS (
  SELECT o.id
  FROM orders o
  ORDER BY o.id ASC
  LIMIT 1
),
first_user AS (
  SELECT u.id
  FROM users u
  ORDER BY u.id ASC
  LIMIT 1
)
INSERT INTO order_change_logs (
  order_id,
  changed_by,
  change_source,
  before_data,
  after_data,
  changed_at
)
SELECT fo.id,
       fu.id,
       'SYSTEM_AUDIT_SEED',
       '{}'::jsonb,
       '{}'::jsonb,
       NOW()
FROM first_order fo
CROSS JOIN first_user fu
WHERE NOT EXISTS (
  SELECT 1
  FROM order_change_logs
);
