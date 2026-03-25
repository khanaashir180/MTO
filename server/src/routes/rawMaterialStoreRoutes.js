const express = require('express');
const { authRequired, requireRoles } = require('../middleware/auth');
const {
  listRawStoreOverview,
  listRawStoreItems,
  listRawStoreWarehouses,
  listRawStoreBalances,
  listRawStoreTransactions,
  listRawStoreBins,
  createRawStoreBin,
  listRawStoreGrns,
  createRawStoreGrn,
  issueRawMaterial,
  transferRawMaterial,
  adjustRawMaterial,
  listRawStoreRequisitions,
  createRawStoreRequisition,
  approveRawStoreRequisition,
  issueRawStoreRequisition,
  listRawStoreReorderSuggestions,
  listPutawayRules,
  createPutawayRule,
  createCycleCount,
  listCycleCounts,
  listCycleCountPolicies,
  upsertCycleCountPolicy,
  postCycleCount,
  listReplenishmentRules,
  upsertReplenishmentRule,
  generateReplenishmentSuggestions,
  createPickWave,
  listPickWaves,
  runBarcodeAction,
  getRawStoreAgingReport,
  getRawStoreMinMaxReport,
  getRawStoreMovementReport,
  listRoutingRules,
  createRoutingRule,
  resolveRoutingRule,
  runProcurementScheduler,
  listProcurementRuns,
  getValuationReport,
  getScannerQueue,
  scanPickLine,
} = require('../controllers/rawMaterialStoreController');

const router = express.Router();
const READ_ROLES = ['PRODUCTION_SUPERVISOR', 'PRODUCTION_MANAGER', 'SUPER_USER', 'FINANCE', 'RETAIL'];
const WRITE_ROLES = ['PRODUCTION_MANAGER', 'SUPER_USER', 'FINANCE'];

router.use(authRequired);

router.get('/overview', requireRoles(...READ_ROLES), listRawStoreOverview);
router.get('/items', requireRoles(...READ_ROLES), listRawStoreItems);
router.get('/warehouses', requireRoles(...READ_ROLES), listRawStoreWarehouses);
router.get('/balances', requireRoles(...READ_ROLES), listRawStoreBalances);
router.get('/transactions', requireRoles(...READ_ROLES), listRawStoreTransactions);
router.get('/bins', requireRoles(...READ_ROLES), listRawStoreBins);
router.post('/bins', requireRoles(...WRITE_ROLES), createRawStoreBin);

router.get('/grns', requireRoles(...READ_ROLES), listRawStoreGrns);
router.post('/grns', requireRoles(...WRITE_ROLES), createRawStoreGrn);

router.post('/issues', requireRoles(...WRITE_ROLES), issueRawMaterial);
router.post('/transfers', requireRoles(...WRITE_ROLES), transferRawMaterial);
router.post('/adjustments', requireRoles(...WRITE_ROLES), adjustRawMaterial);

router.get('/requisitions', requireRoles(...READ_ROLES), listRawStoreRequisitions);
router.post('/requisitions', requireRoles(...READ_ROLES), createRawStoreRequisition);
router.post('/requisitions/:id/approve', requireRoles(...WRITE_ROLES), approveRawStoreRequisition);
router.post('/requisitions/:id/issue', requireRoles(...WRITE_ROLES), issueRawStoreRequisition);

router.get('/reorder-suggestions', requireRoles(...READ_ROLES), listRawStoreReorderSuggestions);
router.get('/putaway-rules', requireRoles(...READ_ROLES), listPutawayRules);
router.post('/putaway-rules', requireRoles(...WRITE_ROLES), createPutawayRule);
router.get('/cycle-counts', requireRoles(...READ_ROLES), listCycleCounts);
router.post('/cycle-counts', requireRoles(...WRITE_ROLES), createCycleCount);
router.get('/cycle-count-policies', requireRoles(...READ_ROLES), listCycleCountPolicies);
router.post('/cycle-count-policies', requireRoles(...WRITE_ROLES), upsertCycleCountPolicy);
router.post('/cycle-counts/:id/post', requireRoles(...WRITE_ROLES), postCycleCount);
router.get('/replenishment-rules', requireRoles(...READ_ROLES), listReplenishmentRules);
router.post('/replenishment-rules', requireRoles(...WRITE_ROLES), upsertReplenishmentRule);
router.post('/replenishment-rules/generate', requireRoles(...WRITE_ROLES), generateReplenishmentSuggestions);
router.get('/pick-waves', requireRoles(...READ_ROLES), listPickWaves);
router.post('/pick-waves', requireRoles(...WRITE_ROLES), createPickWave);
router.post('/barcode/actions', requireRoles(...READ_ROLES), runBarcodeAction);
router.get('/reports/aging', requireRoles(...READ_ROLES), getRawStoreAgingReport);
router.get('/reports/min-max', requireRoles(...READ_ROLES), getRawStoreMinMaxReport);
router.get('/reports/movement', requireRoles(...READ_ROLES), getRawStoreMovementReport);
router.get('/reports/valuation', requireRoles(...READ_ROLES), getValuationReport);
router.get('/routing-rules', requireRoles(...READ_ROLES), listRoutingRules);
router.post('/routing-rules', requireRoles(...WRITE_ROLES), createRoutingRule);
router.get('/routing-rules/resolve', requireRoles(...READ_ROLES), resolveRoutingRule);
router.get('/procurement-runs', requireRoles(...READ_ROLES), listProcurementRuns);
router.post('/procurement-runs/scheduler', requireRoles(...WRITE_ROLES), runProcurementScheduler);
router.get('/scanner/queue', requireRoles(...READ_ROLES), getScannerQueue);
router.post('/scanner/pick-scan', requireRoles(...READ_ROLES), scanPickLine);

module.exports = router;
