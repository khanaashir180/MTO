CREATE TABLE IF NOT EXISTS crm_package_dependencies (
  id SERIAL PRIMARY KEY,
  app_id INT NOT NULL REFERENCES crm_apps(id) ON DELETE CASCADE,
  dependency_app_id INT NOT NULL REFERENCES crm_apps(id) ON DELETE CASCADE,
  minimum_version VARCHAR(40),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (app_id, dependency_app_id)
);

CREATE TABLE IF NOT EXISTS crm_package_security_reviews (
  id SERIAL PRIMARY KEY,
  app_id INT NOT NULL REFERENCES crm_apps(id) ON DELETE CASCADE,
  review_status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (review_status IN ('PENDING', 'APPROVED', 'REJECTED')),
  findings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by INT REFERENCES users(id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (app_id)
);

CREATE TABLE IF NOT EXISTS crm_metadata_deployments (
  id SERIAL PRIMARY KEY,
  deployment_name VARCHAR(180) NOT NULL,
  source_env VARCHAR(20) NOT NULL DEFAULT 'DEV'
    CHECK (source_env IN ('DEV', 'TEST', 'PROD')),
  target_env VARCHAR(20) NOT NULL DEFAULT 'TEST'
    CHECK (target_env IN ('DEV', 'TEST', 'PROD')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED')),
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by INT REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_metadata_deployment_items (
  id SERIAL PRIMARY KEY,
  deployment_id INT NOT NULL REFERENCES crm_metadata_deployments(id) ON DELETE CASCADE,
  item_type VARCHAR(60) NOT NULL,
  item_identifier VARCHAR(160) NOT NULL,
  action VARCHAR(20) NOT NULL DEFAULT 'UPSERT'
    CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'UPSERT')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED')),
  detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_flow_canvas_nodes (
  id SERIAL PRIMARY KEY,
  flow_id INT NOT NULL REFERENCES crm_flows(id) ON DELETE CASCADE,
  node_key VARCHAR(120) NOT NULL,
  node_type VARCHAR(40) NOT NULL,
  label VARCHAR(140) NOT NULL,
  position_x NUMERIC(10,2) NOT NULL DEFAULT 0,
  position_y NUMERIC(10,2) NOT NULL DEFAULT 0,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (flow_id, node_key)
);

CREATE TABLE IF NOT EXISTS crm_flow_canvas_edges (
  id SERIAL PRIMARY KEY,
  flow_id INT NOT NULL REFERENCES crm_flows(id) ON DELETE CASCADE,
  from_node_key VARCHAR(120) NOT NULL,
  to_node_key VARCHAR(120) NOT NULL,
  condition_label VARCHAR(120),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_crm_flow_canvas_edges_dedup
ON crm_flow_canvas_edges (flow_id, from_node_key, to_node_key, COALESCE(condition_label, ''));

INSERT INTO crm_package_security_reviews (app_id, review_status, findings_json)
SELECT id, 'PENDING', '[]'::jsonb
FROM crm_apps
ON CONFLICT (app_id) DO NOTHING;
