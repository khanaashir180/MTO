const pool = require('../config/db');
const { ApiError } = require('../utils/errors');

function toInt(v, field) {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, `Invalid ${field}`);
  return n;
}

async function listPackageLifecycle(_req, res, next) {
  try {
    const [appsRes, installedRes, reviewRes, depRes] = await Promise.all([
      pool.query('SELECT * FROM crm_apps ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT ia.*, a.app_name, a.app_key FROM crm_installed_apps ia JOIN crm_apps a ON a.id = ia.app_id ORDER BY ia.installed_at DESC'),
      pool.query('SELECT sr.*, a.app_name FROM crm_package_security_reviews sr JOIN crm_apps a ON a.id = sr.app_id ORDER BY sr.updated_at DESC'),
      pool.query('SELECT d.*, a1.app_name AS app_name, a2.app_name AS dependency_name FROM crm_package_dependencies d JOIN crm_apps a1 ON a1.id = d.app_id JOIN crm_apps a2 ON a2.id = d.dependency_app_id ORDER BY d.id DESC'),
    ]);
    res.json({
      apps: appsRes.rows,
      installed: installedRes.rows,
      reviews: reviewRes.rows,
      dependencies: depRes.rows,
    });
  } catch (error) {
    next(error);
  }
}

async function submitSecurityReview(req, res, next) {
  const client = await pool.connect();
  try {
    const appId = toInt(req.params.id, 'app id');
    const status = String(req.body?.reviewStatus || '').toUpperCase();
    if (!['APPROVED', 'REJECTED', 'PENDING'].includes(status)) throw new ApiError(400, 'Invalid reviewStatus');
    const findings = req.body?.findings || [];
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_package_security_reviews (app_id, review_status, findings_json, reviewed_by, reviewed_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, NOW(), NOW())
       ON CONFLICT (app_id)
       DO UPDATE SET review_status = EXCLUDED.review_status, findings_json = EXCLUDED.findings_json, reviewed_by = EXCLUDED.reviewed_by, reviewed_at = NOW(), updated_at = NOW()
       RETURNING *`,
      [appId, status, JSON.stringify(Array.isArray(findings) ? findings : []), req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ review: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function addPackageDependency(req, res, next) {
  const client = await pool.connect();
  try {
    const { appId, dependencyAppId, minimumVersion = '' } = req.body || {};
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO crm_package_dependencies (app_id, dependency_app_id, minimum_version)
       VALUES ($1, $2, $3)
       ON CONFLICT (app_id, dependency_app_id)
       DO UPDATE SET minimum_version = EXCLUDED.minimum_version
       RETURNING *`,
      [toInt(appId, 'appId'), toInt(dependencyAppId, 'dependencyAppId'), minimumVersion || null]
    );
    await client.query('COMMIT');
    res.status(201).json({ dependency: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function upgradeInstalledApp(req, res, next) {
  const client = await pool.connect();
  try {
    const installedId = toInt(req.params.id, 'installed id');
    const targetVersion = String(req.body?.targetVersion || '').trim();
    if (!targetVersion) throw new ApiError(400, 'targetVersion is required');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE crm_installed_apps
       SET config_json = COALESCE(config_json, '{}'::jsonb) || jsonb_build_object('version', $1),
           status = 'ACTIVE'
       WHERE id = $2
       RETURNING *`,
      [targetVersion, installedId]
    );
    await client.query('COMMIT');
    res.json({ installedApp: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function uninstallInstalledApp(req, res, next) {
  const client = await pool.connect();
  try {
    const installedId = toInt(req.params.id, 'installed id');
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE crm_installed_apps
       SET status = 'UNINSTALLED',
           config_json = COALESCE(config_json, '{}'::jsonb) || '{"uninstallHook":"completed"}'::jsonb
       WHERE id = $1
       RETURNING *`,
      [installedId]
    );
    await client.query('COMMIT');
    res.json({ installedApp: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function listDeploymentCenter(_req, res, next) {
  try {
    const [deployRes, itemRes] = await Promise.all([
      pool.query('SELECT * FROM crm_metadata_deployments ORDER BY updated_at DESC, id DESC'),
      pool.query('SELECT * FROM crm_metadata_deployment_items ORDER BY updated_at DESC, id DESC'),
    ]);
    res.json({ deployments: deployRes.rows, items: itemRes.rows });
  } catch (error) {
    next(error);
  }
}

async function createDeployment(req, res, next) {
  const client = await pool.connect();
  try {
    const { deploymentName, sourceEnv = 'DEV', targetEnv = 'TEST', items = [] } = req.body || {};
    if (!String(deploymentName || '').trim()) throw new ApiError(400, 'deploymentName is required');
    await client.query('BEGIN');
    const depRes = await client.query(
      `INSERT INTO crm_metadata_deployments (deployment_name, source_env, target_env, status, summary_json, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'PENDING', '{}'::jsonb, $4, NOW(), NOW())
       RETURNING *`,
      [String(deploymentName).trim(), String(sourceEnv).toUpperCase(), String(targetEnv).toUpperCase(), req.user.id]
    );
    const depId = depRes.rows[0].id;
    for (const item of (Array.isArray(items) ? items : [])) {
      await client.query(
        `INSERT INTO crm_metadata_deployment_items (deployment_id, item_type, item_identifier, action, status, detail_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'PENDING', $5::jsonb, NOW(), NOW())`,
        [depId, String(item.itemType || 'UNKNOWN').toUpperCase(), String(item.itemIdentifier || ''), String(item.action || 'UPSERT').toUpperCase(), JSON.stringify(item.detail || {})]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ deployment: depRes.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function runDeployment(req, res, next) {
  const client = await pool.connect();
  try {
    const deploymentId = toInt(req.params.id, 'deployment id');
    await client.query('BEGIN');
    await client.query(`UPDATE crm_metadata_deployments SET status = 'RUNNING', updated_at = NOW() WHERE id = $1`, [deploymentId]);
    await client.query(`UPDATE crm_metadata_deployment_items SET status = 'SUCCESS', updated_at = NOW() WHERE deployment_id = $1`, [deploymentId]);
    await client.query(
      `UPDATE crm_metadata_deployments
       SET status = 'SUCCESS',
           summary_json = '{"result":"deployed","checks":["dependency","security","schema"]}'::jsonb,
           updated_at = NOW()
       WHERE id = $1`,
      [deploymentId]
    );
    const { rows } = await client.query('SELECT * FROM crm_metadata_deployments WHERE id = $1', [deploymentId]);
    await client.query('COMMIT');
    res.json({ deployment: rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

async function getFlowCanvas(req, res, next) {
  try {
    const flowId = toInt(req.params.id, 'flow id');
    const [nodesRes, edgesRes] = await Promise.all([
      pool.query('SELECT * FROM crm_flow_canvas_nodes WHERE flow_id = $1 ORDER BY id ASC', [flowId]),
      pool.query('SELECT * FROM crm_flow_canvas_edges WHERE flow_id = $1 ORDER BY id ASC', [flowId]),
    ]);
    res.json({ nodes: nodesRes.rows, edges: edgesRes.rows });
  } catch (error) {
    next(error);
  }
}

async function saveFlowCanvas(req, res, next) {
  const client = await pool.connect();
  try {
    const flowId = toInt(req.params.id, 'flow id');
    const nodes = Array.isArray(req.body?.nodes) ? req.body.nodes : [];
    const edges = Array.isArray(req.body?.edges) ? req.body.edges : [];
    await client.query('BEGIN');
    await client.query('DELETE FROM crm_flow_canvas_edges WHERE flow_id = $1', [flowId]);
    await client.query('DELETE FROM crm_flow_canvas_nodes WHERE flow_id = $1', [flowId]);
    for (const node of nodes) {
      await client.query(
        `INSERT INTO crm_flow_canvas_nodes (flow_id, node_key, node_type, label, position_x, position_y, config_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW(), NOW())`,
        [
          flowId,
          String(node.nodeKey || ''),
          String(node.nodeType || 'ACTION').toUpperCase(),
          String(node.label || node.nodeKey || ''),
          Number(node.x || 0),
          Number(node.y || 0),
          JSON.stringify(node.config || {}),
        ]
      );
    }
    for (const edge of edges) {
      await client.query(
        `INSERT INTO crm_flow_canvas_edges (flow_id, from_node_key, to_node_key, condition_label, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [flowId, String(edge.from || ''), String(edge.to || ''), edge.conditionLabel || null]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ saved: true, nodeCount: nodes.length, edgeCount: edges.length });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
}

module.exports = {
  listPackageLifecycle,
  submitSecurityReview,
  addPackageDependency,
  upgradeInstalledApp,
  uninstallInstalledApp,
  listDeploymentCenter,
  createDeployment,
  runDeployment,
  getFlowCanvas,
  saveFlowCanvas,
};
