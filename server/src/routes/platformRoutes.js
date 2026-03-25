const express = require('express');
const {
  getDependencyHealth,
  getErrorCatalog,
  listFeatureFlags,
  upsertFeatureFlag,
  listWorkflows,
  upsertWorkflow,
  listWorkflowRules,
  upsertWorkflowRule,
  listSlaPolicies,
  upsertSlaPolicy,
  getSlaBreaches,
  runSlaEscalationSweep,
  getErpAuditReadiness,
  exportErpAuditReadiness,
  runWorkflowValidation,
  listWorkflowValidationReports,
  downloadWorkflowValidationReport,
  exportAuditLogs,
} = require('../controllers/platformController');
const { authRequired, requireRoles } = require('../middleware/auth');
const { requireFeatureFlag } = require('../middleware/featureFlags');

const router = express.Router();

router.use(authRequired);
router.use(requireFeatureFlag('platform_ops_dashboard', true));
router.get('/health/dependencies', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), getDependencyHealth);
router.get('/errors/catalog', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), getErrorCatalog);
router.get('/feature-flags', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), listFeatureFlags);
router.post('/feature-flags', requireRoles('SUPER_USER'), upsertFeatureFlag);
router.get('/workflows', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), listWorkflows);
router.post('/workflows', requireRoles('SUPER_USER'), upsertWorkflow);
router.get('/workflows/:id/rules', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), listWorkflowRules);
router.post('/workflows/:id/rules', requireRoles('SUPER_USER'), upsertWorkflowRule);
router.get('/sla-policies', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), listSlaPolicies);
router.post('/sla-policies', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), upsertSlaPolicy);
router.get('/sla-breaches', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), getSlaBreaches);
router.post('/sla-escalate', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), runSlaEscalationSweep);
router.get('/audit/erp-readiness', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), getErpAuditReadiness);
router.get('/audit/erp-readiness/export', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), exportErpAuditReadiness);
router.post('/workflow-validation/run', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), runWorkflowValidation);
router.get('/workflow-validation/reports', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), listWorkflowValidationReports);
router.get('/workflow-validation/reports/:fileName', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), downloadWorkflowValidationReport);
router.get('/audit/export', requireRoles('SUPER_USER', 'PRODUCTION_MANAGER'), exportAuditLogs);

module.exports = router;
