const express = require('express');
const { authRequired, requireRoles } = require('../middleware/auth');
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
const CRM_ROLES = ['CUSTOMER_SERVICE', 'SUPER_USER', 'FINANCE'];

router.use(authRequired);
router.get('/summary', requireRoles(...CRM_ROLES), getCrmSummary);
router.get('/search', requireRoles(...CRM_ROLES), globalCrmSearch);
router.get('/leads/queue', requireRoles(...CRM_ROLES), listLeadQueue);
router.put('/leads/:id', requireRoles(...CRM_ROLES), updateLeadRecord);
router.get('/opportunities/summary', requireRoles(...CRM_ROLES), getOpportunitySummary);
router.get('/opportunities', requireRoles(...CRM_ROLES), listOpportunities);
router.post('/opportunities', requireRoles(...CRM_ROLES), createOpportunity);
router.put('/opportunities/:id', requireRoles(...CRM_ROLES), updateOpportunity);
router.get('/opportunities/:id/line-items', requireRoles(...CRM_ROLES), listOpportunityLineItems);
router.post('/opportunities/:id/line-items', requireRoles(...CRM_ROLES), addOpportunityLineItem);
router.post('/leads/:id/convert', requireRoles(...CRM_ROLES), convertLead);
router.get('/leads/conversions', requireRoles(...CRM_ROLES), listLeadConversions);
router.get('/tasks/summary', requireRoles(...CRM_ROLES), getTaskSummary);
router.get('/tasks', requireRoles(...CRM_ROLES), listTasks);
router.post('/tasks', requireRoles(...CRM_ROLES), createTask);
router.put('/tasks/:id', requireRoles(...CRM_ROLES), updateTask);
router.get('/tasks/templates', requireRoles(...CRM_ROLES), listTaskTemplates);
router.post('/tasks/templates', requireRoles('SUPER_USER', 'FINANCE'), createTaskTemplate);
router.get('/communications/center', requireRoles(...CRM_ROLES), listCommunicationCenter);
router.get('/cases/summary', requireRoles(...CRM_ROLES), getCaseSummary);
router.get('/cases', requireRoles(...CRM_ROLES), listCases);
router.post('/cases', requireRoles(...CRM_ROLES), createCase);
router.put('/cases/:id', requireRoles(...CRM_ROLES), updateCase);
router.get('/cases/:id/comments', requireRoles(...CRM_ROLES), listCaseComments);
router.post('/cases/:id/comments', requireRoles(...CRM_ROLES), addCaseComment);
router.get('/approvals', requireRoles(...CRM_ROLES), listApprovals);
router.put('/approvals/:id', requireRoles('SUPER_USER', 'FINANCE'), decideApproval);
router.get('/engagement/templates', requireRoles(...CRM_ROLES), listEmailTemplates);
router.post('/engagement/templates', requireRoles('SUPER_USER', 'FINANCE'), createEmailTemplate);
router.get('/engagement/cadences', requireRoles(...CRM_ROLES), listCadences);
router.post('/engagement/cadences', requireRoles('SUPER_USER', 'FINANCE'), createCadence);
router.post('/engagement/cadences/:id/steps', requireRoles('SUPER_USER', 'FINANCE'), addCadenceStep);
router.get('/engagement/enrollments', requireRoles(...CRM_ROLES), listSequenceEnrollments);
router.post('/engagement/enrollments', requireRoles(...CRM_ROLES), enrollSequence);
router.post('/engagement/enrollments/:id/activity', requireRoles(...CRM_ROLES), logSequenceActivity);
router.get('/views', requireRoles(...CRM_ROLES), listSavedViews);
router.post('/views', requireRoles(...CRM_ROLES), createSavedView);
router.put('/views/:id', requireRoles(...CRM_ROLES), updateSavedView);
router.delete('/views/:id', requireRoles(...CRM_ROLES), deleteSavedView);
router.get('/reports/overview', requireRoles(...CRM_ROLES), getCrmReportsOverview);
router.get('/notifications', requireRoles(...CRM_ROLES), listNotifications);
router.put('/notifications/read-all', requireRoles(...CRM_ROLES), markAllNotificationsRead);
router.put('/notifications/:id/read', requireRoles(...CRM_ROLES), markNotificationRead);
router.get('/automation/rules', requireRoles(...CRM_ROLES), listAutomationRules);
router.put('/automation/rules/:id', requireRoles(...CRM_ROLES), updateAutomationRule);
router.get('/automation/logs', requireRoles(...CRM_ROLES), listAutomationLogs);
router.get('/field-permissions', requireRoles(...CRM_ROLES), getFieldPermissions);
router.get('/users', requireRoles(...CRM_ROLES), listCrmUsers);
router.get('/customers/:id/shares', requireRoles(...CRM_ROLES), listAccountShares);
router.post('/customers/:id/shares', requireRoles(...CRM_ROLES), upsertAccountShare);
router.delete('/customers/:id/shares/:shareId', requireRoles(...CRM_ROLES), deleteAccountShare);
router.get('/customers', requireRoles(...CRM_ROLES), listCustomers);
router.get('/customers/:id', requireRoles(...CRM_ROLES), getCustomerDetails);
router.put('/customers/:id', requireRoles(...CRM_ROLES), updateCustomer);
router.get('/customers/:id/merge-preview', requireRoles(...CRM_ROLES), getCustomerMergePreview);
router.post('/customers/:id/merge', requireRoles(...CRM_ROLES), mergeCustomers);
router.post('/customers/:id/interactions', requireRoles(...CRM_ROLES), addInteraction);
router.get('/contacts', requireRoles(...CRM_ROLES), listContacts);
router.post('/contacts', requireRoles(...CRM_ROLES), createContact);
router.get('/campaigns', requireRoles(...CRM_ROLES), listCampaigns);
router.post('/campaigns', requireRoles(...CRM_ROLES), createCampaign);
router.get('/campaigns/:id/members', requireRoles(...CRM_ROLES), listCampaignMembers);
router.post('/campaigns/:id/members', requireRoles(...CRM_ROLES), addCampaignMember);
router.get('/catalog/products', requireRoles(...CRM_ROLES), listProducts);
router.post('/catalog/products', requireRoles(...CRM_ROLES), createProduct);
router.get('/catalog/price-books', requireRoles(...CRM_ROLES), listPriceBooks);
router.post('/catalog/price-books', requireRoles(...CRM_ROLES), createPriceBook);
router.post('/catalog/price-books/:id/items', requireRoles(...CRM_ROLES), addPriceBookItem);
router.get('/quotes', requireRoles(...CRM_ROLES), listQuotes);
router.post('/quotes', requireRoles(...CRM_ROLES), createQuote);
router.post('/quotes/:id/lines', requireRoles(...CRM_ROLES), addQuoteLine);
router.put('/quotes/:id/status', requireRoles(...CRM_ROLES), updateQuoteStatus);
router.get('/governance/assignment-rules', requireRoles(...CRM_ROLES), listAssignmentRules);
router.post('/governance/assignment-rules', requireRoles(...CRM_ROLES), createAssignmentRule);
router.get('/governance/sla-policies', requireRoles(...CRM_ROLES), listSlaPolicies);
router.post('/governance/sla-policies', requireRoles(...CRM_ROLES), createSlaPolicy);
router.get('/knowledge/articles', requireRoles(...CRM_ROLES), listKnowledgeArticles);
router.post('/knowledge/articles', requireRoles(...CRM_ROLES), createKnowledgeArticle);
router.get('/service/entitlements', requireRoles(...CRM_ROLES), listEntitlements);
router.post('/service/entitlements', requireRoles(...CRM_ROLES), createEntitlement);
router.get('/service/milestones', requireRoles(...CRM_ROLES), listCaseMilestones);
router.post('/service/milestones', requireRoles(...CRM_ROLES), createCaseMilestone);
router.put('/service/milestones/:id/status', requireRoles(...CRM_ROLES), updateCaseMilestoneStatus);
router.get('/analytics/subscriptions', requireRoles(...CRM_ROLES), listReportSubscriptions);
router.post('/analytics/subscriptions', requireRoles(...CRM_ROLES), createReportSubscription);
router.get('/integrations/webhooks', requireRoles(...CRM_ROLES), listWebhooks);
router.post('/integrations/webhooks', requireRoles(...CRM_ROLES), createWebhook);
router.get('/territories', requireRoles(...CRM_ROLES), listTerritories);
router.post('/territories', requireRoles(...CRM_ROLES), createTerritory);
router.post('/territories/:id/assignments', requireRoles(...CRM_ROLES), assignAccountTerritory);
router.get('/platform/object-manager', requireRoles(...CRM_ROLES), listObjectManager);
router.post('/platform/object-manager/objects', requireRoles(...CRM_ROLES), createCustomObject);
router.post('/platform/object-manager/fields', requireRoles(...CRM_ROLES), createCustomField);
router.post('/platform/object-manager/record-types', requireRoles(...CRM_ROLES), createRecordType);
router.post('/platform/object-manager/layouts', requireRoles(...CRM_ROLES), createPageLayout);
router.get('/platform/security-model', requireRoles(...CRM_ROLES), listSecurityModel);
router.post('/platform/security-model/roles', requireRoles(...CRM_ROLES), createRoleNode);
router.post('/platform/security-model/owd', requireRoles(...CRM_ROLES), upsertOrgWideDefault);
router.post('/platform/security-model/sharing-rules', requireRoles(...CRM_ROLES), createSharingRule);
router.get('/cpq/designer', requireRoles(...CRM_ROLES), listCpqDesigner);
router.post('/cpq/bundles', requireRoles(...CRM_ROLES), createBundle);
router.post('/cpq/bundles/:id/items', requireRoles(...CRM_ROLES), addBundleItem);
router.post('/cpq/pricing-rules', requireRoles(...CRM_ROLES), createPricingRule);
router.post('/cpq/discount-schedules', requireRoles(...CRM_ROLES), createDiscountSchedule);
router.post('/cpq/quote-approvals', requireRoles(...CRM_ROLES), requestQuoteApproval);
router.put('/cpq/quote-approvals/:id', requireRoles(...CRM_ROLES), decideQuoteApproval);
router.get('/platform/flows', requireRoles(...CRM_ROLES), listFlows);
router.post('/platform/flows', requireRoles(...CRM_ROLES), createFlow);
router.post('/platform/flows/:id/simulate', requireRoles(...CRM_ROLES), runFlowSimulation);
router.get('/service/omnichannel', requireRoles(...CRM_ROLES), listOmniChannel);
router.post('/service/omnichannel/queues', requireRoles(...CRM_ROLES), createQueue);
router.post('/service/omnichannel/skills', requireRoles(...CRM_ROLES), upsertAgentSkill);
router.post('/service/omnichannel/queues/:id/members', requireRoles(...CRM_ROLES), upsertQueueMember);
router.post('/service/omnichannel/work-items', requireRoles(...CRM_ROLES), createWorkItem);
router.put('/service/omnichannel/work-items/:id/route', requireRoles(...CRM_ROLES), routeWorkItem);
router.get('/platform/marketplace', requireRoles(...CRM_ROLES), listMarketplace);
router.post('/platform/marketplace/apps/:id/install', requireRoles(...CRM_ROLES), installApp);
router.put('/platform/marketplace/installed/:id', requireRoles(...CRM_ROLES), updateInstalledApp);
router.get('/platform/runtime', requireRoles(...CRM_ROLES), getRuntimeOverview);
router.post('/platform/runtime/validation-rules', requireRoles(...CRM_ROLES), createValidationRule);
router.post('/platform/runtime/formula-fields', requireRoles(...CRM_ROLES), createFormulaField);
router.get('/platform/runtime/records', requireRoles(...CRM_ROLES), listCustomRecords);
router.post('/platform/runtime/records', requireRoles(...CRM_ROLES), createCustomRecord);
router.post('/platform/flows/:id/publish', requireRoles(...CRM_ROLES), publishFlowVersion);
router.post('/platform/flows/:id/debug', requireRoles(...CRM_ROLES), debugFlow);
router.get('/platform/flows/:id/debug-traces', requireRoles(...CRM_ROLES), listFlowDebugTraces);
router.post('/cpq/engine/pricing/preview', requireRoles(...CRM_ROLES), previewPricingEngine);
router.post('/service/omnichannel/engine/route', requireRoles(...CRM_ROLES), routeWorkItemEngine);
router.get('/platform/ops/jobs', requireRoles(...CRM_ROLES), listOpsJobs);
router.post('/platform/ops/jobs', requireRoles(...CRM_ROLES), createOpsJob);
router.post('/platform/ops/jobs/:id/run', requireRoles(...CRM_ROLES), runOpsJob);
router.get('/platform/ops/audit-logs', requireRoles(...CRM_ROLES), listAuditLogs);
router.get('/platform/packages', requireRoles(...CRM_ROLES), listPackageLifecycle);
router.post('/platform/packages/:id/security-review', requireRoles(...CRM_ROLES), submitSecurityReview);
router.post('/platform/packages/dependencies', requireRoles(...CRM_ROLES), addPackageDependency);
router.put('/platform/packages/installed/:id/upgrade', requireRoles(...CRM_ROLES), upgradeInstalledApp);
router.put('/platform/packages/installed/:id/uninstall', requireRoles(...CRM_ROLES), uninstallInstalledApp);
router.get('/platform/deployments', requireRoles(...CRM_ROLES), listDeploymentCenter);
router.post('/platform/deployments', requireRoles(...CRM_ROLES), createDeployment);
router.post('/platform/deployments/:id/run', requireRoles(...CRM_ROLES), runDeployment);
router.get('/platform/flows/:id/canvas', requireRoles(...CRM_ROLES), getFlowCanvas);
router.post('/platform/flows/:id/canvas', requireRoles(...CRM_ROLES), saveFlowCanvas);

module.exports = router;
