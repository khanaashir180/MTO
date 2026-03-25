const express = require('express');
const {
  getStageBoards,
  getFlowSummary,
  getDateWiseReport,
  getPerformanceReport,
  getAgingReport,
  getStageReport,
  getAssignedItems,
  getStageSummary,
  getCompletedTodayItems,
  getCustomPatternItems,
  scanStage,
  rejectByBarcode,
  advanceByOrderId,
  moveBackByOrderId,
  markMtoSoleDone,
  holdVerificationOrder,
  releaseVerificationHold,
  markCustomPattern,
  upsertStageTargets,
  upsertWeeklyStageTargets,
  upsertStageVarianceReason,
  decideStageTargetApproval,
  upsertStageTargetSettings,
  markStageNotificationsRead,
  updateStageNotificationWorkflow,
  getControlTowerReport,
} = require('../controllers/productionController');
const { authRequired, requirePermission, requireRoles, requireStageAccess } = require('../middleware/auth');
const { idempotencyRequired } = require('../middleware/idempotency');

const router = express.Router();

router.use(authRequired);
router.get('/board', requirePermission('production_view_dashboard'), getStageBoards);
router.get('/flow-summary', requirePermission('production_view_dashboard'), getFlowSummary);
router.get('/reports/date-wise', requirePermission('production_view_dashboard'), getDateWiseReport);
router.get('/reports/performance', requirePermission('production_view_dashboard'), getPerformanceReport);
router.get('/reports/aging', requirePermission('production_view_dashboard'), getAgingReport);
router.get('/reports/control-tower', requirePermission('production_view_dashboard'), getControlTowerReport);
router.get('/reports/stage-detail', requirePermission('production_view_stage_detail'), requireStageAccess(), getStageReport);
router.post('/targets', requirePermission('production_manage_targets'), requireStageAccess(), upsertStageTargets);
router.post('/targets/weekly', requirePermission('production_manage_targets'), requireStageAccess(), upsertWeeklyStageTargets);
router.post('/targets/variance', requirePermission('production_manage_targets'), requireStageAccess(), upsertStageVarianceReason);
router.post('/targets/approval', requirePermission('production_approve_targets'), requireStageAccess(), decideStageTargetApproval);
router.post('/targets/settings', requirePermission('production_approve_targets'), requireStageAccess(), upsertStageTargetSettings);
router.post('/notifications/read', requirePermission('production_manage_notifications'), requireStageAccess(), markStageNotificationsRead);
router.post('/notifications/workflow', requirePermission('production_manage_notifications'), requireStageAccess(), updateStageNotificationWorkflow);
router.get('/assigned', requirePermission('production_view_stage_detail'), requireStageAccess(), getAssignedItems);
router.get('/summary', requirePermission('production_view_stage_detail'), requireStageAccess(), getStageSummary);
router.get('/completed-today', requirePermission('production_view_stage_detail'), requireStageAccess(), getCompletedTodayItems);
router.get('/custom-pattern', requirePermission('production_view_stage_detail'), requireStageAccess(), getCustomPatternItems);
router.post('/scan', requirePermission('production_manage_stage_actions'), requireStageAccess(), idempotencyRequired(), scanStage);
router.post('/reject', requireRoles('PRODUCTION_MANAGER'), rejectByBarcode);
router.post('/advance', requirePermission('production_manage_stage_actions'), requireStageAccess(), idempotencyRequired(), advanceByOrderId);
router.post('/move-back', requirePermission('production_manage_stage_actions'), requireStageAccess(), idempotencyRequired(), moveBackByOrderId);
router.post('/mto/sole-complete', requirePermission('production_manage_stage_actions'), requireStageAccess(), idempotencyRequired(), markMtoSoleDone);
router.post('/verification/hold', requirePermission('production_manage_stage_actions'), requireStageAccess(), idempotencyRequired(), holdVerificationOrder);
router.post('/verification/release-hold', requirePermission('production_manage_stage_actions'), requireStageAccess(), idempotencyRequired(), releaseVerificationHold);
router.post('/model-room/custom-pattern', requirePermission('production_manage_stage_actions'), requireStageAccess(), idempotencyRequired(), markCustomPattern);

module.exports = router;
