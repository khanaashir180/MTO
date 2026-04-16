const express = require('express');
const { authRequired, requirePermission } = require('../middleware/auth');
const {
  listMrpDashboard,
  listMrpItems,
  createMrpItem,
  listBoms,
  createBom,
  addBomLine,
  listWorkOrders,
  createWorkOrder,
  reprioritizeWorkOrders,
  releaseWorkOrder,
  startWorkOrder,
  completeWorkOrder,
  receiveMrpStock,
  listShortages,
  listPurchaseSuggestions,
  createPurchaseSuggestion,
  listMrpTraceability,
  listWarehouses,
  createWarehouse,
  listCapacityPlanner,
  upsertWorkOrderOperations,
  listShopFloorQueue,
  transitionOperation,
  listDemandForecasts,
  upsertDemandForecast,
  listReplenishmentPlan,
  createPoFromSuggestion,
  autoCreatePoFromOpenSuggestions,
  listIntegrations,
  createIntegration,
  runIntegrationSync,
} = require('../controllers/mrpController');

const router = express.Router();
const canViewMrp = requirePermission('mrp_view_module');
const canManageMrpPlanning = requirePermission('mrp_manage_planning');
const canManageMrpIntegrations = requirePermission('mrp_manage_integrations');

router.use(authRequired);

router.get('/dashboard', canViewMrp, listMrpDashboard);
router.get('/items', canViewMrp, listMrpItems);
router.post('/items', canManageMrpPlanning, createMrpItem);

router.get('/boms', canViewMrp, listBoms);
router.post('/boms', canManageMrpPlanning, createBom);
router.post('/boms/:id/lines', canManageMrpPlanning, addBomLine);

router.get('/work-orders', canViewMrp, listWorkOrders);
router.post('/work-orders', canManageMrpPlanning, createWorkOrder);
router.post('/work-orders/reprioritize', canManageMrpPlanning, reprioritizeWorkOrders);
router.post('/work-orders/:id/release', canManageMrpPlanning, releaseWorkOrder);
router.post('/work-orders/:id/start', canManageMrpPlanning, startWorkOrder);
router.post('/work-orders/:id/complete', canManageMrpPlanning, completeWorkOrder);
router.get('/work-orders/:id/traceability', canViewMrp, listMrpTraceability);

router.post('/stock/receive', canManageMrpPlanning, receiveMrpStock);
router.get('/warehouses', canViewMrp, listWarehouses);
router.post('/warehouses', canManageMrpPlanning, createWarehouse);

router.get('/planner/capacity', canViewMrp, listCapacityPlanner);
router.post('/work-orders/:id/operations', canManageMrpPlanning, upsertWorkOrderOperations);
router.get('/shop-floor/queue', canViewMrp, listShopFloorQueue);
router.post('/shop-floor/operations/:id/transition', canManageMrpPlanning, transitionOperation);

router.get('/planning/forecasts', canViewMrp, listDemandForecasts);
router.post('/planning/forecasts', canManageMrpPlanning, upsertDemandForecast);
router.get('/planning/replenishment', canViewMrp, listReplenishmentPlan);

router.get('/shortages', canViewMrp, listShortages);
router.get('/purchase-suggestions', canViewMrp, listPurchaseSuggestions);
router.post('/purchase-suggestions', canManageMrpPlanning, createPurchaseSuggestion);
router.post('/purchase-suggestions/auto-create-po', canManageMrpIntegrations, autoCreatePoFromOpenSuggestions);
router.post('/purchase-suggestions/:id/create-po', canManageMrpIntegrations, createPoFromSuggestion);

router.get('/integrations', canViewMrp, listIntegrations);
router.post('/integrations', canManageMrpIntegrations, createIntegration);
router.post('/integrations/:id/sync', canManageMrpIntegrations, runIntegrationSync);

module.exports = router;
