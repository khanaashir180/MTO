const express = require('express');
const { authRequired, requirePermission } = require('../middleware/auth');
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
const canViewRawStore = requirePermission('raw_store_view_module');
const canManageRawStoreTransactions = requirePermission('raw_store_manage_transactions');
const canManageRawStoreRules = requirePermission('raw_store_manage_rules');

router.use(authRequired);

router.get('/overview', canViewRawStore, listRawStoreOverview);
router.get('/items', canViewRawStore, listRawStoreItems);
router.get('/warehouses', canViewRawStore, listRawStoreWarehouses);
router.get('/balances', canViewRawStore, listRawStoreBalances);
router.get('/transactions', canViewRawStore, listRawStoreTransactions);
router.get('/bins', canViewRawStore, listRawStoreBins);
router.post('/bins', canManageRawStoreRules, createRawStoreBin);

router.get('/grns', canViewRawStore, listRawStoreGrns);
router.post('/grns', canManageRawStoreTransactions, createRawStoreGrn);

router.post('/issues', canManageRawStoreTransactions, issueRawMaterial);
router.post('/transfers', canManageRawStoreTransactions, transferRawMaterial);
router.post('/adjustments', canManageRawStoreTransactions, adjustRawMaterial);

router.get('/requisitions', canViewRawStore, listRawStoreRequisitions);
router.post('/requisitions', canManageRawStoreTransactions, createRawStoreRequisition);
router.post('/requisitions/:id/approve', canManageRawStoreTransactions, approveRawStoreRequisition);
router.post('/requisitions/:id/issue', canManageRawStoreTransactions, issueRawStoreRequisition);

router.get('/reorder-suggestions', canViewRawStore, listRawStoreReorderSuggestions);
router.get('/putaway-rules', canViewRawStore, listPutawayRules);
router.post('/putaway-rules', canManageRawStoreRules, createPutawayRule);
router.get('/cycle-counts', canViewRawStore, listCycleCounts);
router.post('/cycle-counts', canManageRawStoreRules, createCycleCount);
router.get('/cycle-count-policies', canViewRawStore, listCycleCountPolicies);
router.post('/cycle-count-policies', canManageRawStoreRules, upsertCycleCountPolicy);
router.post('/cycle-counts/:id/post', canManageRawStoreTransactions, postCycleCount);
router.get('/replenishment-rules', canViewRawStore, listReplenishmentRules);
router.post('/replenishment-rules', canManageRawStoreRules, upsertReplenishmentRule);
router.post('/replenishment-rules/generate', canManageRawStoreRules, generateReplenishmentSuggestions);
router.get('/pick-waves', canViewRawStore, listPickWaves);
router.post('/pick-waves', canManageRawStoreTransactions, createPickWave);
router.post('/barcode/actions', canManageRawStoreTransactions, runBarcodeAction);
router.get('/reports/aging', canViewRawStore, getRawStoreAgingReport);
router.get('/reports/min-max', canViewRawStore, getRawStoreMinMaxReport);
router.get('/reports/movement', canViewRawStore, getRawStoreMovementReport);
router.get('/reports/valuation', canViewRawStore, getValuationReport);
router.get('/routing-rules', canViewRawStore, listRoutingRules);
router.post('/routing-rules', canManageRawStoreRules, createRoutingRule);
router.get('/routing-rules/resolve', canViewRawStore, resolveRoutingRule);
router.get('/procurement-runs', canViewRawStore, listProcurementRuns);
router.post('/procurement-runs/scheduler', canManageRawStoreRules, runProcurementScheduler);
router.get('/scanner/queue', canViewRawStore, getScannerQueue);
router.post('/scanner/pick-scan', canManageRawStoreTransactions, scanPickLine);

module.exports = router;
