INSERT INTO feature_flags (flag_key, flag_value, description, scope)
VALUES
  ('sla_escalation_controls_enabled', 'true'::jsonb, 'Enable SLA escalation sweep actions from Platform Ops', 'GLOBAL')
ON CONFLICT (flag_key) DO NOTHING;
