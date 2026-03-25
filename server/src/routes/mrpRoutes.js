const express = require('express');
const { authRequired, requireRoles } = require('../middleware/auth');
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
const READ_ROLES = ['PRODUCTION_SUPERVISOR', 'PRODUCTION_MANAGER', 'SUPER_USER', 'FINANCE'];
const WRITE_ROLES = ['PRODUCTION_MANAGER', 'SUPER_USER', 'FINANCE'];

router.use(authRequired);

router.get('/dashboard', requireRoles(...READ_ROLES), listMrpDashboard);
router.get('/items', requireRoles(...READ_ROLES), listMrpItems);
router.post('/items', requireRoles(...WRITE_ROLES), createMrpItem);

router.get('/boms', requireRoles(...READ_ROLES), listBoms);
router.post('/boms', requireRoles(...WRITE_ROLES), createBom);
router.post('/boms/:id/lines', requireRoles(...WRITE_ROLES), addBomLine);

router.get('/work-orders', requireRoles(...READ_ROLES), listWorkOrders);
router.post('/work-orders', requireRoles(...WRITE_ROLES), createWorkOrder);
router.post('/work-orders/reprioritize', requireRoles(...WRITE_ROLES), reprioritizeWorkOrders);
router.post('/work-orders/:id/release', requireRoles(...WRITE_ROLES), releaseWorkOrder);
router.post('/work-orders/:id/start', requireRoles(...WRITE_ROLES), startWorkOrder);
router.post('/work-orders/:id/complete', requireRoles(...WRITE_ROLES), completeWorkOrder);
router.get('/work-orders/:id/traceability', requireRoles(...READ_ROLES), listMrpTraceability);

router.post('/stock/receive', requireRoles(...WRITE_ROLES), receiveMrpStock);
router.get('/warehouses', requireRoles(...READ_ROLES), listWarehouses);
router.post('/warehouses', requireRoles(...WRITE_ROLES), createWarehouse);

router.get('/planner/capacity', requireRoles(...READ_ROLES), listCapacityPlanner);
router.post('/work-orders/:id/operations', requireRoles(...WRITE_ROLES), upsertWorkOrderOperations);
router.get('/shop-floor/queue', requireRoles(...READ_ROLES), listShopFloorQueue);
router.post('/shop-floor/operations/:id/transition', requireRoles(...WRITE_ROLES), transitionOperation);

router.get('/planning/forecasts', requireRoles(...READ_ROLES), listDemandForecasts);
router.post('/planning/forecasts', requireRoles(...WRITE_ROLES), upsertDemandForecast);
router.get('/planning/replenishment', requireRoles(...READ_ROLES), listReplenishmentPlan);

router.get('/shortages', requireRoles(...READ_ROLES), listShortages);
router.get('/purchase-suggestions', requireRoles(...READ_ROLES), listPurchaseSuggestions);
router.post('/purchase-suggestions', requireRoles(...WRITE_ROLES), createPurchaseSuggestion);
router.post('/purchase-suggestions/auto-create-po', requireRoles(...WRITE_ROLES), autoCreatePoFromOpenSuggestions);
router.post('/purchase-suggestions/:id/create-po', requireRoles(...WRITE_ROLES), createPoFromSuggestion);

router.get('/integrations', requireRoles(...READ_ROLES), listIntegrations);
router.post('/integrations', requireRoles(...WRITE_ROLES), createIntegration);
router.post('/integrations/:id/sync', requireRoles(...WRITE_ROLES), runIntegrationSync);

module.exports = router;
