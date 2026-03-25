const express = require('express');
const { authRequired, requirePermission, requireRoleOrPermission } = require('../middleware/auth');
const {
  getCrmSummary,
  globalCrmSearch,
  listLeadQueue,
  updateLeadRecord,
  listCustomers,
  getCustomerDetails,
  updateCustomer,
  getCustomerMergePreview,
  mergeCustomers,
  addInteraction,
  getOpportunitySummary,
  listOpportunities,
  createOpportunity,
  updateOpportunity,
  listOpportunityLineItems,
  addOpportunityLineItem,
  convertLead,
  listLeadConversions,
  getTaskSummary,
  listTasks,
  createTask,
  updateTask,
  listTaskTemplates,
  createTaskTemplate,
  listCommunicationCenter,
  getCaseSummary,
  listCases,
  createCase,
  updateCase,
  addCaseComment,
  listCaseComments,
  listApprovals,
  decideApproval,
  listEmailTemplates,
  createEmailTemplate,
  listCadences,
  createCadence,
  addCadenceStep,
  listSequenceEnrollments,
  enrollSequence,
  logSequenceActivity,
  listSavedViews,
  createSavedView,
  updateSavedView,
  deleteSavedView,
  listAccountShares,
  upsertAccountShare,
  deleteAccountShare,
  getFieldPermissions,
  listCrmUsers,
  getCrmReportsOverview,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  listAutomationRules,
  updateAutomationRule,
  listAutomationLogs,
} = require('../controllers/crmController');
const {
  listContacts,
  createContact,
  listCampaigns,
  createCampaign,
  addCampaignMember,
  listCampaignMembers,
  listProducts,
  createProduct,
  listPriceBooks,
  createPriceBook,
  addPriceBookItem,
  listQuotes,
  createQuote,
  addQuoteLine,
  updateQuoteStatus,
  listAssignmentRules,
  createAssignmentRule,
  listSlaPolicies,
  createSlaPolicy,
} = require('../controllers/crmEnterpriseController');
const {
  listKnowledgeArticles,
  createKnowledgeArticle,
  listEntitlements,
  createEntitlement,
  listCaseMilestones,
  createCaseMilestone,
  updateCaseMilestoneStatus,
  listReportSubscriptions,
  createReportSubscription,
  listWebhooks,
  createWebhook,
  listTerritories,
  createTerritory,
  assignAccountTerritory,
} = require('../controllers/crmAdvancedController');
const {
  listObjectManager,
  createCustomObject,
  createCustomField,
  createRecordType,
  createPageLayout,
  listSecurityModel,
  createRoleNode,
  upsertOrgWideDefault,
  createSharingRule,
  listCpqDesigner,
  createBundle,
  addBundleItem,
  createPricingRule,
  createDiscountSchedule,
  requestQuoteApproval,
  decideQuoteApproval,
} = require('../controllers/crmPlatformController');
const {
  listFlows,
  createFlow,
  runFlowSimulation,
  listOmniChannel,
  createQueue,
  upsertAgentSkill,
  upsertQueueMember,
  createWorkItem,
  routeWorkItem,
  listMarketplace,
  installApp,
  updateInstalledApp,
} = require('../controllers/crmParityController');
const {
  getRuntimeOverview,
  createValidationRule,
  createFormulaField,
  listCustomRecords,
  createCustomRecord,
  publishFlowVersion,
  debugFlow,
  listFlowDebugTraces,
  previewPricingEngine,
  routeWorkItemEngine,
  listOpsJobs,
  createOpsJob,
  runOpsJob,
  listAuditLogs,
} = require('../controllers/crmRuntimeController');
const {
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
} = require('../controllers/crmCompletionController');

const router = express.Router();
const canViewCrm = requireRoleOrPermission(['CUSTOMER_SERVICE', 'FINANCE'], ['crm_view_module']);
const canManageCrmRecords = requireRoleOrPermission(['CUSTOMER_SERVICE', 'FINANCE'], ['crm_manage_records']);
const canManageCrmApprovals = requireRoleOrPermission(['FINANCE'], ['crm_manage_approvals']);

router.use(authRequired);
router.get('/summary', canViewCrm, getCrmSummary);
router.get('/search', canViewCrm, globalCrmSearch);
router.get('/leads/queue', canViewCrm, listLeadQueue);
router.put('/leads/:id', canManageCrmRecords, updateLeadRecord);
router.get('/opportunities/summary', canViewCrm, getOpportunitySummary);
router.get('/opportunities', canViewCrm, listOpportunities);
router.post('/opportunities', canManageCrmRecords, createOpportunity);
router.put('/opportunities/:id', canManageCrmRecords, updateOpportunity);
router.get('/opportunities/:id/line-items', canViewCrm, listOpportunityLineItems);
router.post('/opportunities/:id/line-items', canManageCrmRecords, addOpportunityLineItem);
router.post('/leads/:id/convert', canManageCrmRecords, convertLead);
router.get('/leads/conversions', canViewCrm, listLeadConversions);
router.get('/tasks/summary', canViewCrm, getTaskSummary);
router.get('/tasks', canViewCrm, listTasks);
router.post('/tasks', canManageCrmRecords, createTask);
router.put('/tasks/:id', canManageCrmRecords, updateTask);
router.get('/tasks/templates', canViewCrm, listTaskTemplates);
router.post('/tasks/templates', canManageCrmApprovals, createTaskTemplate);
router.get('/communications/center', canViewCrm, listCommunicationCenter);
router.get('/cases/summary', canViewCrm, getCaseSummary);
router.get('/cases', canViewCrm, listCases);
router.post('/cases', canManageCrmRecords, createCase);
router.put('/cases/:id', canManageCrmRecords, updateCase);
router.get('/cases/:id/comments', canViewCrm, listCaseComments);
router.post('/cases/:id/comments', canManageCrmRecords, addCaseComment);
router.get('/approvals', canViewCrm, listApprovals);
router.put('/approvals/:id', canManageCrmApprovals, decideApproval);
router.get('/engagement/templates', canViewCrm, listEmailTemplates);
router.post('/engagement/templates', canManageCrmApprovals, createEmailTemplate);
router.get('/engagement/cadences', canViewCrm, listCadences);
router.post('/engagement/cadences', canManageCrmApprovals, createCadence);
router.post('/engagement/cadences/:id/steps', canManageCrmApprovals, addCadenceStep);
router.get('/engagement/enrollments', canViewCrm, listSequenceEnrollments);
router.post('/engagement/enrollments', canManageCrmRecords, enrollSequence);
router.post('/engagement/enrollments/:id/activity', canManageCrmRecords, logSequenceActivity);
router.get('/views', canViewCrm, listSavedViews);
router.post('/views', canManageCrmRecords, createSavedView);
router.put('/views/:id', canManageCrmRecords, updateSavedView);
router.delete('/views/:id', canManageCrmRecords, deleteSavedView);
router.get('/reports/overview', canViewCrm, getCrmReportsOverview);
router.get('/notifications', canViewCrm, listNotifications);
router.put('/notifications/read-all', canManageCrmRecords, markAllNotificationsRead);
router.put('/notifications/:id/read', canManageCrmRecords, markNotificationRead);
router.get('/automation/rules', canViewCrm, listAutomationRules);
router.put('/automation/rules/:id', canManageCrmApprovals, updateAutomationRule);
router.get('/automation/logs', canViewCrm, listAutomationLogs);
router.get('/field-permissions', canViewCrm, getFieldPermissions);
router.get('/users', canViewCrm, listCrmUsers);
router.get('/customers/:id/shares', canViewCrm, listAccountShares);
router.post('/customers/:id/shares', canManageCrmApprovals, upsertAccountShare);
router.delete('/customers/:id/shares/:shareId', canManageCrmApprovals, deleteAccountShare);
router.get('/customers', canViewCrm, listCustomers);
router.get('/customers/:id', canViewCrm, getCustomerDetails);
router.put('/customers/:id', canManageCrmRecords, updateCustomer);
router.get('/customers/:id/merge-preview', canViewCrm, getCustomerMergePreview);
router.post('/customers/:id/merge', canManageCrmApprovals, mergeCustomers);
router.post('/customers/:id/interactions', canManageCrmRecords, addInteraction);
router.get('/contacts', canViewCrm, listContacts);
router.post('/contacts', canManageCrmRecords, createContact);
router.get('/campaigns', canViewCrm, listCampaigns);
router.post('/campaigns', canManageCrmRecords, createCampaign);
router.get('/campaigns/:id/members', canViewCrm, listCampaignMembers);
router.post('/campaigns/:id/members', canManageCrmRecords, addCampaignMember);
router.get('/catalog/products', canViewCrm, listProducts);
router.post('/catalog/products', canManageCrmRecords, createProduct);
router.get('/catalog/price-books', canViewCrm, listPriceBooks);
router.post('/catalog/price-books', canManageCrmRecords, createPriceBook);
router.post('/catalog/price-books/:id/items', canManageCrmRecords, addPriceBookItem);
router.get('/quotes', canViewCrm, listQuotes);
router.post('/quotes', canManageCrmRecords, createQuote);
router.post('/quotes/:id/lines', canManageCrmRecords, addQuoteLine);
router.put('/quotes/:id/status', canManageCrmRecords, updateQuoteStatus);
router.get('/governance/assignment-rules', canViewCrm, listAssignmentRules);
router.post('/governance/assignment-rules', canManageCrmApprovals, createAssignmentRule);
router.get('/governance/sla-policies', canViewCrm, listSlaPolicies);
router.post('/governance/sla-policies', canManageCrmApprovals, createSlaPolicy);
router.get('/knowledge/articles', canViewCrm, listKnowledgeArticles);
router.post('/knowledge/articles', canManageCrmRecords, createKnowledgeArticle);
router.get('/service/entitlements', canViewCrm, listEntitlements);
router.post('/service/entitlements', canManageCrmRecords, createEntitlement);
router.get('/service/milestones', canViewCrm, listCaseMilestones);
router.post('/service/milestones', canManageCrmRecords, createCaseMilestone);
router.put('/service/milestones/:id/status', canManageCrmRecords, updateCaseMilestoneStatus);
router.get('/analytics/subscriptions', canViewCrm, listReportSubscriptions);
router.post('/analytics/subscriptions', canManageCrmRecords, createReportSubscription);
router.get('/integrations/webhooks', canViewCrm, listWebhooks);
router.post('/integrations/webhooks', canManageCrmApprovals, createWebhook);
router.get('/territories', canViewCrm, listTerritories);
router.post('/territories', canManageCrmApprovals, createTerritory);
router.post('/territories/:id/assignments', canManageCrmApprovals, assignAccountTerritory);
router.get('/platform/object-manager', canViewCrm, listObjectManager);
router.post('/platform/object-manager/objects', canManageCrmApprovals, createCustomObject);
router.post('/platform/object-manager/fields', canManageCrmApprovals, createCustomField);
router.post('/platform/object-manager/record-types', canManageCrmApprovals, createRecordType);
router.post('/platform/object-manager/layouts', canManageCrmApprovals, createPageLayout);
router.get('/platform/security-model', canViewCrm, listSecurityModel);
router.post('/platform/security-model/roles', canManageCrmApprovals, createRoleNode);
router.post('/platform/security-model/owd', canManageCrmApprovals, upsertOrgWideDefault);
router.post('/platform/security-model/sharing-rules', canManageCrmApprovals, createSharingRule);
router.get('/cpq/designer', canViewCrm, listCpqDesigner);
router.post('/cpq/bundles', canManageCrmApprovals, createBundle);
router.post('/cpq/bundles/:id/items', canManageCrmApprovals, addBundleItem);
router.post('/cpq/pricing-rules', canManageCrmApprovals, createPricingRule);
router.post('/cpq/discount-schedules', canManageCrmApprovals, createDiscountSchedule);
router.post('/cpq/quote-approvals', canManageCrmRecords, requestQuoteApproval);
router.put('/cpq/quote-approvals/:id', canManageCrmApprovals, decideQuoteApproval);
router.get('/platform/flows', canViewCrm, listFlows);
router.post('/platform/flows', canManageCrmApprovals, createFlow);
router.post('/platform/flows/:id/simulate', canManageCrmApprovals, runFlowSimulation);
router.get('/service/omnichannel', canViewCrm, listOmniChannel);
router.post('/service/omnichannel/queues', canManageCrmApprovals, createQueue);
router.post('/service/omnichannel/skills', canManageCrmApprovals, upsertAgentSkill);
router.post('/service/omnichannel/queues/:id/members', canManageCrmApprovals, upsertQueueMember);
router.post('/service/omnichannel/work-items', canManageCrmRecords, createWorkItem);
router.put('/service/omnichannel/work-items/:id/route', canManageCrmApprovals, routeWorkItem);
router.get('/platform/marketplace', canViewCrm, listMarketplace);
router.post('/platform/marketplace/apps/:id/install', canManageCrmApprovals, installApp);
router.put('/platform/marketplace/installed/:id', canManageCrmApprovals, updateInstalledApp);
router.get('/platform/runtime', canViewCrm, getRuntimeOverview);
router.post('/platform/runtime/validation-rules', canManageCrmApprovals, createValidationRule);
router.post('/platform/runtime/formula-fields', canManageCrmApprovals, createFormulaField);
router.get('/platform/runtime/records', canViewCrm, listCustomRecords);
router.post('/platform/runtime/records', canManageCrmRecords, createCustomRecord);
router.post('/platform/flows/:id/publish', canManageCrmApprovals, publishFlowVersion);
router.post('/platform/flows/:id/debug', canManageCrmApprovals, debugFlow);
router.get('/platform/flows/:id/debug-traces', canViewCrm, listFlowDebugTraces);
router.post('/cpq/engine/pricing/preview', canManageCrmRecords, previewPricingEngine);
router.post('/service/omnichannel/engine/route', canManageCrmApprovals, routeWorkItemEngine);
router.get('/platform/ops/jobs', canViewCrm, listOpsJobs);
router.post('/platform/ops/jobs', canManageCrmApprovals, createOpsJob);
router.post('/platform/ops/jobs/:id/run', canManageCrmApprovals, runOpsJob);
router.get('/platform/ops/audit-logs', canViewCrm, listAuditLogs);
router.get('/platform/packages', canViewCrm, listPackageLifecycle);
router.post('/platform/packages/:id/security-review', canManageCrmApprovals, submitSecurityReview);
router.post('/platform/packages/dependencies', canManageCrmApprovals, addPackageDependency);
router.put('/platform/packages/installed/:id/upgrade', canManageCrmApprovals, upgradeInstalledApp);
router.put('/platform/packages/installed/:id/uninstall', canManageCrmApprovals, uninstallInstalledApp);
router.get('/platform/deployments', canViewCrm, listDeploymentCenter);
router.post('/platform/deployments', canManageCrmApprovals, createDeployment);
router.post('/platform/deployments/:id/run', canManageCrmApprovals, runDeployment);
router.get('/platform/flows/:id/canvas', canViewCrm, getFlowCanvas);
router.post('/platform/flows/:id/canvas', canManageCrmApprovals, saveFlowCanvas);

module.exports = router;
