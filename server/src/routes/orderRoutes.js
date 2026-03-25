const express = require('express');
const {
  createOrder,
  getRetailDashboard,
  getOrderDetails,
  updateOrderDetails,
  updateOrderImages,
  getChangeLogs,
  downloadOrderPdf,
  downloadCustomerReferencePdf,
  getLateOrders,
  getOrderCounts,
  getSalesReport,
  getStoreDeliveryDashboard,
  markOrderReceivedInStore,
  upsertDailyCustomerDeliveryUpdate,
  markOrderDeliveredToCustomer,
  getRetailReplacementDashboard,
  createRetailReplacementCase,
  updateRetailReplacementCase,
  uploadRetailReplacementAttachment,
  upsertRetailReplacementSetting,
  upsertRetailReplacementReason,
  upsertRetailReplacementFinancialResolution,
  getRetailOrderCapacity,
  upsertRetailOrderCapacity,
  lookupCustomerByNumber,
} = require('../controllers/orderController');
const { authRequired, requireAnyPermission, requirePermission, requireRoles } = require('../middleware/auth');
const { idempotencyRequired } = require('../middleware/idempotency');
const upload = require('../middleware/upload');

const router = express.Router();

router.use(authRequired);

router.post(
  '/',
  requirePermission('retail_create_order'),
  idempotencyRequired(),
  upload.fields([
    { name: 'designReference', maxCount: 1 },
    { name: 'colourReference', maxCount: 1 },
    { name: 'soleReference', maxCount: 1 },
    { name: 'additionalReference', maxCount: 1 },
  ]),
  createOrder
);

router.get('/retail-dashboard', requirePermission('retail_view_dashboard'), getRetailDashboard);
router.get('/customer-lookup', requirePermission('retail_create_order'), lookupCustomerByNumber);
router.get('/capacity', requireAnyPermission('retail_create_order', 'admin_manage_order_capacity'), getRetailOrderCapacity);
router.post('/capacity', requirePermission('admin_manage_order_capacity'), upsertRetailOrderCapacity);
router.get('/retail-head/replacement-dashboard', requireAnyPermission('retail_manage_replacements', 'retail_view_head_reports'), getRetailReplacementDashboard);
router.post('/retail-replacement-cases', requireAnyPermission('retail_manage_replacements', 'retail_view_head_reports'), createRetailReplacementCase);
router.put('/retail-replacement-cases/:id', requireAnyPermission('retail_manage_replacements', 'retail_view_head_reports'), updateRetailReplacementCase);
router.post('/retail-replacement-cases/:id/attachments', requireAnyPermission('retail_manage_replacements', 'retail_view_head_reports'), upload.single('attachment'), uploadRetailReplacementAttachment);
router.post('/retail-replacement-settings', requirePermission('retail_view_head_reports'), upsertRetailReplacementSetting);
router.post('/retail-replacement-reasons', requirePermission('retail_view_head_reports'), upsertRetailReplacementReason);
router.post('/retail-replacement-financial-resolutions', requirePermission('retail_view_head_reports'), upsertRetailReplacementFinancialResolution);
router.get('/retail-head/recovery-dashboard', requireAnyPermission('retail_manage_replacements', 'retail_view_head_reports'), getRetailReplacementDashboard);
router.post('/retail-recovery-cases', requireAnyPermission('retail_manage_replacements', 'retail_view_head_reports'), createRetailReplacementCase);
router.put('/retail-recovery-cases/:id', requireAnyPermission('retail_manage_replacements', 'retail_view_head_reports'), updateRetailReplacementCase);
router.post('/retail-recovery-cases/:id/attachments', requireAnyPermission('retail_manage_replacements', 'retail_view_head_reports'), upload.single('attachment'), uploadRetailReplacementAttachment);
router.post('/retail-recovery-settings', requirePermission('retail_view_head_reports'), upsertRetailReplacementSetting);
router.post('/retail-recovery-reasons', requirePermission('retail_view_head_reports'), upsertRetailReplacementReason);
router.post('/retail-recovery-financial-resolutions', requirePermission('retail_view_head_reports'), upsertRetailReplacementFinancialResolution);
router.get('/sales-report', requirePermission('retail_view_sales_report'), getSalesReport);
router.get('/store-delivery-dashboard', requirePermission('retail_manage_delivery'), getStoreDeliveryDashboard);
router.post('/:id/mark-received-store', requirePermission('retail_manage_delivery'), markOrderReceivedInStore);
router.post('/:id/customer-delivery-update', requirePermission('retail_manage_delivery'), upsertDailyCustomerDeliveryUpdate);
router.post('/:id/mark-delivered-customer', requirePermission('retail_manage_delivery'), markOrderDeliveredToCustomer);
router.get('/reports/late', requireAnyPermission('retail_view_head_reports', 'production_view_dashboard'), getLateOrders);
router.get('/counts', requireAnyPermission('retail_view_head_reports', 'production_view_dashboard'), getOrderCounts);
router.get('/change-logs', requireAnyPermission('admin_view_audit', 'retail_view_head_reports'), getChangeLogs);
router.put('/:id', requireAnyPermission('retail_edit_order', 'production_manage_stage_actions'), updateOrderDetails);
router.put(
  '/:id/images',
  requireAnyPermission('retail_edit_order', 'production_manage_stage_actions'),
  upload.fields([
    { name: 'designReference', maxCount: 1 },
    { name: 'colourReference', maxCount: 1 },
    { name: 'soleReference', maxCount: 1 },
    { name: 'additionalReference', maxCount: 1 },
  ]),
  updateOrderImages
);
router.get('/:id/pdf', requireAnyPermission('retail_view_customer_docs', 'production_view_stage_detail'), downloadOrderPdf);
router.get('/:id/customer-reference', requirePermission('retail_view_customer_docs'), downloadCustomerReferencePdf);
router.get('/:id', requireAnyPermission('retail_view_customer_docs', 'production_view_stage_detail'), getOrderDetails);

module.exports = router;
