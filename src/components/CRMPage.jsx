import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { BarChartCard, DonutChartCard } from './ReportingCharts';

const PIPELINE_STAGES = [
  { key: 'QUALIFICATION', label: 'Qualification' },
  { key: 'NEEDS_ANALYSIS', label: 'Needs Analysis' },
  { key: 'PROPOSAL', label: 'Proposal' },
  { key: 'NEGOTIATION', label: 'Negotiation' },
  { key: 'CLOSED_WON', label: 'Closed Won' },
  { key: 'CLOSED_LOST', label: 'Closed Lost' },
];

const APP_PROFILES = [
  {
    key: 'sales_console',
    label: 'Sales Console',
    tabs: ['home', 'accounts', 'contacts', 'leads', 'campaigns', 'opportunities', 'quotes', 'forecast', 'tasks', 'communications', 'cases', 'timeline', 'reports', 'approvals', 'engagement', 'notifications', 'automation', 'knowledge', 'territories', 'subscriptions', 'integrations', 'object_manager', 'security_model', 'cpq_designer', 'flow_builder', 'omnichannel', 'app_marketplace', 'metadata_runtime', 'engine_lab', 'ops_center', 'package_lifecycle', 'deployment_center', 'flow_canvas'],
  },
  {
    key: 'service_console',
    label: 'Service Console',
    tabs: ['home', 'accounts', 'contacts', 'tasks', 'communications', 'cases', 'timeline', 'notifications', 'reports', 'governance', 'knowledge', 'entitlements', 'security_model', 'omnichannel', 'engine_lab', 'ops_center', 'deployment_center'],
  },
  {
    key: 'finance_console',
    label: 'Finance Console',
    tabs: ['home', 'accounts', 'quotes', 'catalog', 'forecast', 'reports', 'approvals', 'notifications', 'governance', 'subscriptions', 'integrations', 'cpq_designer', 'app_marketplace', 'engine_lab', 'ops_center', 'package_lifecycle', 'deployment_center'],
  },
];

const NAV_GROUPS = [
  { key: 'workspace', label: 'Workspace', tabs: ['home', 'accounts', 'timeline', 'communications'] },
  { key: 'sales', label: 'Sales', tabs: ['contacts', 'leads', 'campaigns', 'opportunities', 'quotes', 'forecast'] },
  { key: 'service', label: 'Service', tabs: ['tasks', 'communications', 'cases', 'notifications', 'knowledge', 'entitlements'] },
  { key: 'operations', label: 'Operations', tabs: ['reports', 'approvals', 'engagement', 'automation', 'catalog', 'governance', 'subscriptions', 'integrations', 'territories', 'object_manager', 'security_model', 'cpq_designer', 'flow_builder', 'omnichannel', 'app_marketplace', 'metadata_runtime', 'engine_lab', 'ops_center', 'package_lifecycle', 'deployment_center', 'flow_canvas'] },
];

const TAB_LABELS = {
  home: 'Home',
  accounts: 'Accounts',
  contacts: 'Contacts',
  leads: 'Leads',
  campaigns: 'Campaigns',
  opportunities: 'Opportunities',
  quotes: 'Quotes',
  forecast: 'Forecast',
  tasks: 'Tasks',
  communications: 'Comms Center',
  cases: 'Cases',
  timeline: 'Timeline',
  reports: 'Reports',
  catalog: 'Catalog',
  governance: 'Governance',
  knowledge: 'Knowledge',
  entitlements: 'Entitlements',
  territories: 'Territories',
  subscriptions: 'Subscriptions',
  integrations: 'Integrations',
  object_manager: 'Object Manager',
  security_model: 'Security Model',
  cpq_designer: 'CPQ Designer',
  flow_builder: 'Flow Builder',
  omnichannel: 'Omni-Channel',
  app_marketplace: 'App Marketplace',
  metadata_runtime: 'Metadata Runtime',
  engine_lab: 'Engine Lab',
  ops_center: 'Ops Center',
  package_lifecycle: 'Package Lifecycle',
  deployment_center: 'Deployment Center',
  flow_canvas: 'Flow Canvas',
  approvals: 'Approvals',
  engagement: 'Engagement',
  notifications: 'Notifications',
  automation: 'Automation',
};

const TAB_DESCRIPTIONS = {
  home: 'Executive overview and daily priorities',
  accounts: 'Customer 360 profiles and history',
  contacts: 'Person-level contact management',
  leads: 'Lead queue and conversion actions',
  campaigns: 'Marketing campaigns and members',
  opportunities: 'Pipeline management and progression',
  quotes: 'Quote lifecycle and pricing',
  forecast: 'Revenue forecast and win trends',
  tasks: 'Rep and service task execution',
  communications: 'Unified inbox, SLAs, ownership, and compliance',
  cases: 'Service case queue and collaboration',
  timeline: 'Cross-object activity timeline',
  reports: 'KPI and analytics workspace',
  catalog: 'Products, price books, and pricing',
  governance: 'Assignment rules and SLA policies',
  knowledge: 'Knowledge base and article publishing',
  entitlements: 'Service plans, milestones, and SLA targets',
  territories: 'Territory definitions and account mapping',
  subscriptions: 'Scheduled report subscriptions and delivery',
  integrations: 'Webhook integration endpoints',
  object_manager: 'Custom objects, fields, record types, and layouts',
  security_model: 'Role hierarchy, OWD, and sharing rules',
  cpq_designer: 'Bundles, pricing rules, discount schedules, quote approvals',
  flow_builder: 'Visual-style flow lifecycle and simulation runs',
  omnichannel: 'Queues, skills, routing, and workload management',
  app_marketplace: 'Install and manage platform apps and extensions',
  metadata_runtime: 'Validation rules, formulas, and dynamic records',
  engine_lab: 'Pricing and routing engine simulation lab',
  ops_center: 'Jobs, run history, and setup audit center',
  package_lifecycle: 'Security reviews, dependencies, upgrades, uninstall hooks',
  deployment_center: 'Metadata promotion from dev to test to prod',
  flow_canvas: 'Canvas graph nodes and edge wiring for flows',
  approvals: 'Pending approvals and decisions',
  engagement: 'Cadences, sequences, and templates',
  notifications: 'Alerts and user notifications',
  automation: 'Rule management and execution logs',
};

function money(v) {
  return Number(v || 0).toFixed(2);
}

function dateOnly(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function interactionAgeDays(timestamp) {
  if (!timestamp) return null;
  const start = new Date(String(timestamp));
  if (Number.isNaN(start.getTime())) return null;
  const diff = Date.now() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function leadTemperature(score) {
  const value = Number(score || 0);
  if (value >= 80) return { label: 'Hot', tone: 'hot' };
  if (value >= 50) return { label: 'Warm', tone: 'warm' };
  return { label: 'Cold', tone: 'cold' };
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value || 0))));
}

function daysUntil(value) {
  if (!value) return null;
  const end = new Date(String(value));
  if (Number.isNaN(end.getTime())) return null;
  const diff = end.getTime() - Date.now();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function addDays(value, days) {
  const base = new Date(String(value || ''));
  if (Number.isNaN(base.getTime())) return '';
  base.setDate(base.getDate() + Number(days || 0));
  return base.toISOString().slice(0, 10);
}

function scoreBand(value) {
  const score = clampScore(value);
  if (score >= 80) return { label: 'Strong', tone: 'good', score };
  if (score >= 55) return { label: 'Watch', tone: 'watch', score };
  return { label: 'Critical', tone: 'critical', score };
}

export default function CRMPage({ refreshSignal = 0, lockedWorkspace = '' }) {
  const { user } = useAuth();
  const isOutletUser = Boolean(user?.outlet_name);

  const [filters, setFilters] = useState({ search: '', status: '', outlet: '' });
  const [summary, setSummary] = useState({ totalCustomers: 0, incompleteProfiles: 0 });
  const [workspaceTab, setWorkspaceTab] = useState(lockedWorkspace || 'home');
  const [navGroupKey, setNavGroupKey] = useState('workspace');
  const [appProfileKey, setAppProfileKey] = useState('sales_console');
  const [workspaceOpenTabs, setWorkspaceOpenTabs] = useState([lockedWorkspace || 'home']);
  const [favoriteTabs, setFavoriteTabs] = useState(() => {
    try {
      const raw = localStorage.getItem('crm_favorite_tabs');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });
  const [recentTabs, setRecentTabs] = useState([]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [searchResults, setSearchResults] = useState({ accounts: [], opportunities: [], tasks: [] });
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [sortBy, setSortBy] = useState('recent');
  const [customers, setCustomers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState({ account: null, orders: [], contacts: [], interactions: [], opportunities: [], tasks: [], timeline: [], parent_account: null, child_accounts: [], duplicate_accounts: [], service_summary: {}, ledger: { summary: {}, entries: [] } });
  const [profile, setProfile] = useState({});
  const [interaction, setInteraction] = useState({
    interactionType: 'NOTE',
    direction: 'OUTBOUND',
    subject: '',
    notes: '',
    nextFollowupAt: '',
    conversationOwnerId: '',
    threadKey: '',
    responseSlaMinutes: 60,
    channelStatus: 'OPEN',
  });

  const [opportunityFilters, setOpportunityFilters] = useState({ search: '', stage: '', status: '' });
  const [opportunitySummary, setOpportunitySummary] = useState({ summary: {}, by_stage: [] });
  const [opportunities, setOpportunities] = useState([]);
  const [selectedOpportunityId, setSelectedOpportunityId] = useState(null);
  const [opportunityLineItems, setOpportunityLineItems] = useState([]);
  const [opportunityForm, setOpportunityForm] = useState({
    accountId: '',
    title: '',
    stage: 'QUALIFICATION',
    status: 'OPEN',
    probability: 20,
    expectedValue: '',
    expectedCloseDate: '',
    ownerId: '',
    source: '',
    competitorName: '',
    winReason: '',
    lossReason: '',
    nextStep: '',
    nextStepDueAt: '',
    riskLevel: 'MEDIUM',
    closePlan: '',
    buyingCommittee: '',
    notes: '',
  });
  const [lineItemForm, setLineItemForm] = useState({ productName: '', quantity: 1, unitPrice: '', notes: '' });
  const [taskFilters, setTaskFilters] = useState({ search: '', status: '', priority: '', dueBucket: '', assignedToMe: 'false' });
  const [taskSummary, setTaskSummary] = useState({ summary: {} });
  const [tasks, setTasks] = useState([]);
  const [taskForm, setTaskForm] = useState({
    accountId: '',
    opportunityId: '',
    templateId: '',
    title: '',
    description: '',
    dueDate: '',
    priority: 'MEDIUM',
    status: 'OPEN',
    assignedTo: '',
    recurrenceType: 'NONE',
    recurrenceIntervalDays: '',
    dependencyIds: [],
  });
  const [caseFilters, setCaseFilters] = useState({ search: '', status: '', priority: '', caseType: '', assignedToMe: 'false' });
  const [caseSummary, setCaseSummary] = useState({ summary: {} });
  const [cases, setCases] = useState([]);
  const [caseForm, setCaseForm] = useState({
    accountId: '',
    opportunityId: '',
    subject: '',
    description: '',
    caseType: 'GENERAL',
    priority: 'MEDIUM',
    status: 'NEW',
    origin: 'MANUAL',
    dueAt: '',
    assignedTo: '',
    rootCauseCode: '',
    resolutionCode: '',
    businessImpact: '',
    reportedOrderId: '',
    nextAction: '',
    nextActionDueAt: '',
    serviceChannel: 'MANUAL',
  });
  const [selectedCaseId, setSelectedCaseId] = useState(null);
  const [caseComments, setCaseComments] = useState([]);
  const [caseCommentInput, setCaseCommentInput] = useState('');
  const [contacts, setContacts] = useState([]);
  const [contactForm, setContactForm] = useState({
    accountId: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    alternateEmail: '',
    alternatePhone: '',
    title: '',
    department: '',
    isPrimary: false,
    status: 'ACTIVE',
    notes: '',
    ownerId: '',
    preferredChannel: 'PHONE',
    decisionRole: '',
    influenceLevel: 'MEDIUM',
    relationshipStrength: 'WARM',
    reportsToContactId: '',
    verificationStatus: 'UNVERIFIED',
    doNotContact: false,
    whatsappOptIn: false,
  });
  const [campaigns, setCampaigns] = useState([]);
  const [campaignForm, setCampaignForm] = useState({ name: '', type: 'GENERAL', status: 'PLANNED', budget: '', expectedRevenue: '' });
  const [products, setProducts] = useState([]);
  const [productForm, setProductForm] = useState({ sku: '', name: '', family: '', unitPrice: '', costPrice: '' });
  const [priceBooks, setPriceBooks] = useState([]);
  const [priceBookForm, setPriceBookForm] = useState({ name: '', currencyCode: 'USD' });
  const [quotes, setQuotes] = useState([]);
  const [quoteForm, setQuoteForm] = useState({ accountId: '', opportunityId: '', priceBookId: '', validUntil: '', notes: '', ownerId: '' });
  const [quoteLineForm, setQuoteLineForm] = useState({ quoteId: '', productId: '', lineName: '', quantity: 1, unitPrice: 0, discountPercent: 0 });
  const [assignmentRules, setAssignmentRules] = useState([]);
  const [slaPolicies, setSlaPolicies] = useState([]);
  const [assignmentRuleForm, setAssignmentRuleForm] = useState({ name: '', entityType: 'CASE', criteria: '{}', action: '{}' });
  const [slaForm, setSlaForm] = useState({ name: '', entityType: 'CASE', priority: 'MEDIUM', firstResponseMinutes: 60, resolutionMinutes: 1440 });
  const [knowledgeArticles, setKnowledgeArticles] = useState([]);
  const [articleForm, setArticleForm] = useState({ title: '', summary: '', bodyMarkdown: '', category: 'GENERAL', status: 'DRAFT' });
  const [entitlements, setEntitlements] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [entitlementForm, setEntitlementForm] = useState({
    accountId: '',
    planName: '',
    tier: 'STANDARD',
    startDate: '',
    endDate: '',
    firstResponseTargetMinutes: 120,
    resolutionTargetMinutes: 2880,
  });
  const [milestoneForm, setMilestoneForm] = useState({ caseId: '', entitlementId: '', milestoneName: '', targetAt: '' });
  const [territories, setTerritories] = useState([]);
  const [territoryForm, setTerritoryForm] = useState({ name: '', regionCode: '', description: '', managerUserId: '' });
  const [territoryAssignmentForm, setTerritoryAssignmentForm] = useState({ territoryId: '', accountId: '' });
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscriptionForm, setSubscriptionForm] = useState({ reportName: '', subscriberUserId: '', scheduleType: 'WEEKLY', deliveryChannel: 'IN_APP' });
  const [webhooks, setWebhooks] = useState([]);
  const [webhookForm, setWebhookForm] = useState({ name: '', targetUrl: '', eventTypes: 'opportunity.created,case.updated', retryLimit: 3 });
  const [customObjects, setCustomObjects] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [recordTypes, setRecordTypes] = useState([]);
  const [pageLayouts, setPageLayouts] = useState([]);
  const [objectForm, setObjectForm] = useState({ apiName: '', label: '', pluralLabel: '', sharingModel: 'PRIVATE', deploymentStatus: 'DEPLOYED' });
  const [fieldForm, setFieldForm] = useState({ objectId: '', apiName: '', label: '', dataType: 'TEXT' });
  const [recordTypeForm, setRecordTypeForm] = useState({ objectId: '', developerName: '', label: '' });
  const [layoutForm, setLayoutForm] = useState({ objectId: '', layoutName: '', sections: '[{"name":"Main","fields":[]}]' });
  const [roleNodes, setRoleNodes] = useState([]);
  const [owdRows, setOwdRows] = useState([]);
  const [sharingRules, setSharingRules] = useState([]);
  const [roleNodeForm, setRoleNodeForm] = useState({ roleName: '', parentRoleId: '', ownerUserId: '' });
  const [owdForm, setOwdForm] = useState({ objectName: 'ACCOUNT', internalAccess: 'PRIVATE', externalAccess: 'PRIVATE' });
  const [sharingRuleForm, setSharingRuleForm] = useState({ objectName: 'ACCOUNT', ruleName: '', criteria: '{}', grantAccess: 'READ', targetScope: 'ROLE', targetIdentifier: '' });
  const [cpqBundles, setCpqBundles] = useState([]);
  const [cpqBundleItems, setCpqBundleItems] = useState([]);
  const [cpqPricingRules, setCpqPricingRules] = useState([]);
  const [cpqDiscountSchedules, setCpqDiscountSchedules] = useState([]);
  const [cpqQuoteApprovals, setCpqQuoteApprovals] = useState([]);
  const [bundleForm, setBundleForm] = useState({ bundleName: '', bundleCode: '', basePrice: 0 });
  const [bundleItemForm, setBundleItemForm] = useState({ bundleId: '', productId: '', quantity: 1 });
  const [pricingRuleForm, setPricingRuleForm] = useState({ ruleName: '', scope: 'QUOTE_LINE', priority: 100, condition: '{}', action: '{}' });
  const [discountScheduleForm, setDiscountScheduleForm] = useState({ scheduleName: '', appliesTo: 'PRODUCT', targetId: '', tiers: '[{"min":1,"max":10,"discountPercent":5}]' });
  const [quoteApprovalForm, setQuoteApprovalForm] = useState({ quoteId: '', thresholdPercent: 0, approverId: '' });
  const [flows, setFlows] = useState([]);
  const [flowRuns, setFlowRuns] = useState([]);
  const [flowForm, setFlowForm] = useState({ flowName: '', flowType: 'RECORD_TRIGGERED', triggerObject: 'CASE', triggerEvent: 'UPDATE', definition: '{"if":{"priority":"HIGH"},"then":{"action":"notify"}}' });
  const [flowRunForm, setFlowRunForm] = useState({ flowId: '', context: '{"recordId":1}' });
  const [omniQueues, setOmniQueues] = useState([]);
  const [omniSkills, setOmniSkills] = useState([]);
  const [omniMembers, setOmniMembers] = useState([]);
  const [omniWorkItems, setOmniWorkItems] = useState([]);
  const [queueForm, setQueueForm] = useState({ queueName: '', channelType: 'CASE', priorityModel: 'SLA_FIRST' });
  const [skillForm, setSkillForm] = useState({ userId: '', skillName: '', proficiency: 3 });
  const [queueMemberForm, setQueueMemberForm] = useState({ queueId: '', userId: '', capacity: 5, presenceStatus: 'AVAILABLE' });
  const [workItemForm, setWorkItemForm] = useState({ channelType: 'CASE', subject: '', priority: 'MEDIUM', requiredSkills: '', assignedQueueId: '' });
  const [routeForm, setRouteForm] = useState({ workItemId: '', assignedQueueId: '', assignedUserId: '' });
  const [marketApps, setMarketApps] = useState([]);
  const [installedApps, setInstalledApps] = useState([]);
  const [installedUpdateForm, setInstalledUpdateForm] = useState({ installedId: '', status: 'ACTIVE', config: '{}' });
  const [runtimeValidationRules, setRuntimeValidationRules] = useState([]);
  const [runtimeFormulaFields, setRuntimeFormulaFields] = useState([]);
  const [runtimeAuditLogs, setRuntimeAuditLogs] = useState([]);
  const [runtimeRecords, setRuntimeRecords] = useState([]);
  const [runtimeObjectFilter, setRuntimeObjectFilter] = useState('OPPORTUNITY');
  const [validationRuleForm, setValidationRuleForm] = useState({ objectName: 'OPPORTUNITY', ruleName: '', conditionExpr: '{"field":"expectedValue","op":"<=","value":0}', errorMessage: '' });
  const [formulaFieldForm, setFormulaFieldForm] = useState({ objectName: 'OPPORTUNITY', fieldName: '', formulaExpr: '{"type":"multiply","fields":["expectedValue","probability"],"scale":0.01}', dataType: 'NUMBER' });
  const [runtimeRecordForm, setRuntimeRecordForm] = useState({ objectApiName: 'OPPORTUNITY', recordData: '{"expectedValue":12000,"probability":35}' });
  const [pricingPreviewForm, setPricingPreviewForm] = useState({ productId: '', quantity: 1, unitPrice: 0, manualDiscountPercent: 0 });
  const [pricingPreview, setPricingPreview] = useState(null);
  const [routingEngineForm, setRoutingEngineForm] = useState({ workItemId: '' });
  const [routingEngineResult, setRoutingEngineResult] = useState(null);
  const [opsJobs, setOpsJobs] = useState([]);
  const [opsRuns, setOpsRuns] = useState([]);
  const [opsJobForm, setOpsJobForm] = useState({ jobName: '', jobType: 'SHARING_RECALC', scheduleCron: '0 1 * * *', config: '{"scope":"all"}' });
  const [flowDebugTraces, setFlowDebugTraces] = useState([]);
  const [packageReviews, setPackageReviews] = useState([]);
  const [packageDependencies, setPackageDependencies] = useState([]);
  const [packageReviewForm, setPackageReviewForm] = useState({ appId: '', reviewStatus: 'APPROVED', findings: '[]' });
  const [packageDependencyForm, setPackageDependencyForm] = useState({ appId: '', dependencyAppId: '', minimumVersion: '1.0.0' });
  const [packageVersionForm, setPackageVersionForm] = useState({ installedId: '', targetVersion: '1.0.1' });
  const [deploymentRows, setDeploymentRows] = useState([]);
  const [deploymentItems, setDeploymentItems] = useState([]);
  const [deploymentForm, setDeploymentForm] = useState({
    deploymentName: '',
    sourceEnv: 'DEV',
    targetEnv: 'TEST',
    items: '[{"itemType":"FLOW","itemIdentifier":"Auto Escalate Critical Cases","action":"UPSERT"}]',
  });
  const [canvasFlowId, setCanvasFlowId] = useState('');
  const [canvasNodesJson, setCanvasNodesJson] = useState('[{"nodeKey":"start","nodeType":"START","label":"Start","x":40,"y":30},{"nodeKey":"notify","nodeType":"ACTION","label":"Notify","x":260,"y":30}]');
  const [canvasEdgesJson, setCanvasEdgesJson] = useState('[{"from":"start","to":"notify","conditionLabel":"default"}]');
  const [canvasNodes, setCanvasNodes] = useState([]);
  const [canvasEdges, setCanvasEdges] = useState([]);
  const [savedViews, setSavedViews] = useState([]);
  const [selectedViewId, setSelectedViewId] = useState('');
  const [viewNameInput, setViewNameInput] = useState('');
  const [viewScope, setViewScope] = useState('PRIVATE');
  const [timelineFilters, setTimelineFilters] = useState({ type: '', search: '' });
  const [reports, setReports] = useState({
    kpis: {},
    orders_by_day: [],
    tasks_by_day: [],
    opportunities_by_stage: [],
    forecast_by_month: [],
    owner_pipeline: [],
    close_rate_by_month: [],
  });
  const [reportFilters, setReportFilters] = useState({ from: '', to: '' });
  const [notifications, setNotifications] = useState({ summary: { total: 0, unread: 0 }, notifications: [] });
  const [communications, setCommunications] = useState({ inbox: [], analytics: { channel_mix: [], owner_mix: [], response_sla: {} }, followupCompliance: {}, noResponseAlerts: [] });
  const [communicationFilters, setCommunicationFilters] = useState({ channel: '', status: '', ownerMine: 'false' });
  const [notificationFilter, setNotificationFilter] = useState('');
  const [fieldPermissions, setFieldPermissions] = useState(new Map());
  const [shares, setShares] = useState([]);
  const [shareForm, setShareForm] = useState({ userId: '', accessLevel: 'VIEW' });
  const [automation, setAutomation] = useState({ rules: [], logs: [] });
  const [crmUsers, setCrmUsers] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [approvalFilter, setApprovalFilter] = useState('PENDING');
  const [templates, setTemplates] = useState([]);
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [cadences, setCadences] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [templateForm, setTemplateForm] = useState({ name: '', subjectTemplate: '', bodyTemplate: '' });
  const [taskTemplateForm, setTaskTemplateForm] = useState({
    name: '',
    title: '',
    description: '',
    priority: 'MEDIUM',
    defaultDueInDays: 1,
    defaultRecurrenceType: 'NONE',
    defaultRecurrenceIntervalDays: 0,
  });
  const [cadenceForm, setCadenceForm] = useState({ name: '', description: '' });
  const [stepForm, setStepForm] = useState({ cadenceId: '', stepNumber: 1, stepType: 'EMAIL', dayOffset: 0, templateId: '', instructions: '' });
  const [enrollmentForm, setEnrollmentForm] = useState({ cadenceId: '', accountId: '', ownerId: '', startAt: '' });
  const [leadConversionForm, setLeadConversionForm] = useState({
    opportunityTitle: '',
    expectedValue: '',
    expectedCloseDate: '',
    ownerId: '',
    taskTitle: 'Lead conversion follow-up',
    taskDueDate: '',
    assignedTo: '',
    conversionNotes: '',
  });
  const [leadQueue, setLeadQueue] = useState([]);
  const [leadSummary, setLeadSummary] = useState({});
  const [leadFilters, setLeadFilters] = useState({ search: '', status: '', stage: '', temperature: '', ownerMine: 'false' });
  const [selectedLeadId, setSelectedLeadId] = useState(null);
  const [leadWorkbench, setLeadWorkbench] = useState({
    leadStage: 'NEW',
    leadOwnerId: '',
    leadTemperature: 'COLD',
    leadSourceDetail: '',
    leadQualificationNotes: '',
    leadDisqualificationReason: '',
    leadSlaDueAt: '',
    leadNextAction: '',
    leadNextActionDueAt: '',
    leadScore: 0,
  });
  const [draggedOpportunityId, setDraggedOpportunityId] = useState(null);
  const [dragTargetStage, setDragTargetStage] = useState('');
  const [message, setMessage] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [mergePreview, setMergePreview] = useState(null);

  const customerQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.search) p.set('search', filters.search);
    if (filters.status) p.set('status', filters.status);
    if (!isOutletUser && filters.outlet) p.set('outlet', filters.outlet);
    return p.toString();
  }, [filters, isOutletUser]);

  const opportunityQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (opportunityFilters.search) p.set('search', opportunityFilters.search);
    if (opportunityFilters.stage) p.set('stage', opportunityFilters.stage);
    if (opportunityFilters.status) p.set('status', opportunityFilters.status);
    if (!isOutletUser && filters.outlet) p.set('outlet', filters.outlet);
    return p.toString();
  }, [opportunityFilters, isOutletUser, filters.outlet]);

  const taskQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (taskFilters.search) p.set('search', taskFilters.search);
    if (taskFilters.status) p.set('status', taskFilters.status);
    if (taskFilters.priority) p.set('priority', taskFilters.priority);
    if (taskFilters.dueBucket) p.set('dueBucket', taskFilters.dueBucket);
    if (taskFilters.assignedToMe === 'true' && user?.id) p.set('assignedTo', String(user.id));
    if (!isOutletUser && filters.outlet) p.set('outlet', filters.outlet);
    return p.toString();
  }, [taskFilters, user?.id, isOutletUser, filters.outlet]);

  const communicationQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (communicationFilters.channel) p.set('channel', communicationFilters.channel);
    if (communicationFilters.status) p.set('status', communicationFilters.status);
    if (communicationFilters.ownerMine === 'true') p.set('mine', 'true');
    return p.toString();
  }, [communicationFilters]);

  const caseQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (caseFilters.search) p.set('search', caseFilters.search);
    if (caseFilters.status) p.set('status', caseFilters.status);
    if (caseFilters.priority) p.set('priority', caseFilters.priority);
    if (caseFilters.caseType) p.set('caseType', caseFilters.caseType);
    if (caseFilters.assignedToMe === 'true' && user?.id) p.set('assignedTo', String(user.id));
    if (!isOutletUser && filters.outlet) p.set('outlet', filters.outlet);
    return p.toString();
  }, [caseFilters, user?.id, isOutletUser, filters.outlet]);

  const currentViewDefinition = useMemo(() => ({
    workspaceTab,
    activeTab,
    sortBy,
    filters,
    leadFilters,
    opportunityFilters,
    taskFilters,
    communicationFilters,
    caseFilters,
    timelineFilters,
  }), [workspaceTab, activeTab, sortBy, filters, leadFilters, opportunityFilters, taskFilters, communicationFilters, caseFilters, timelineFilters]);

  function applySavedViewDefinition(definition) {
    if (!definition || typeof definition !== 'object') return;
    if (definition.workspaceTab) setWorkspaceTab(definition.workspaceTab);
    if (definition.activeTab) setActiveTab(definition.activeTab);
    if (definition.sortBy) setSortBy(definition.sortBy);
    if (definition.filters) setFilters((prev) => ({ ...prev, ...definition.filters }));
    if (definition.leadFilters) setLeadFilters((prev) => ({ ...prev, ...definition.leadFilters }));
    if (definition.opportunityFilters) setOpportunityFilters((prev) => ({ ...prev, ...definition.opportunityFilters }));
    if (definition.taskFilters) setTaskFilters((prev) => ({ ...prev, ...definition.taskFilters }));
    if (definition.communicationFilters) setCommunicationFilters((prev) => ({ ...prev, ...definition.communicationFilters }));
    if (definition.caseFilters) setCaseFilters((prev) => ({ ...prev, ...definition.caseFilters }));
    if (definition.timelineFilters) setTimelineFilters((prev) => ({ ...prev, ...definition.timelineFilters }));
  }

  function canEditField(field) {
    if (!fieldPermissions.size) return true;
    if (!fieldPermissions.has(field)) return true;
    return Boolean(fieldPermissions.get(field));
  }

  const reportQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (reportFilters.from) p.set('from', reportFilters.from);
    if (reportFilters.to) p.set('to', reportFilters.to);
    if (!isOutletUser && filters.outlet) p.set('outlet', filters.outlet);
    return p.toString();
  }, [reportFilters, isOutletUser, filters.outlet]);

  const leadQueueQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (leadFilters.search) p.set('search', leadFilters.search);
    if (leadFilters.status) p.set('status', leadFilters.status);
    if (leadFilters.stage) p.set('stage', leadFilters.stage);
    if (leadFilters.temperature) p.set('temperature', leadFilters.temperature);
    if (leadFilters.ownerMine === 'true') p.set('mine', 'true');
    return p.toString();
  }, [leadFilters]);

  const roleDefaultAppProfile = useMemo(() => {
    if (user?.role === 'FINANCE') return 'finance_console';
    if (user?.role === 'CUSTOMER_SERVICE') return 'service_console';
    return 'sales_console';
  }, [user?.role]);

  const availableAppProfiles = useMemo(() => {
    if (user?.role === 'FINANCE') {
      return APP_PROFILES.filter((profile) => ['finance_console'].includes(profile.key));
    }
    if (user?.role === 'CUSTOMER_SERVICE') {
      return APP_PROFILES.filter((profile) => ['service_console', 'sales_console'].includes(profile.key));
    }
    if (user?.role === 'SUPER_USER') return APP_PROFILES;
    return APP_PROFILES.filter((profile) => profile.key === 'sales_console');
  }, [user?.role]);

  const activeAppProfile = useMemo(
    () => availableAppProfiles.find((profile) => profile.key === appProfileKey) || availableAppProfiles[0] || APP_PROFILES[0],
    [appProfileKey, availableAppProfiles]
  );

  const visibleWorkspaceTabs = useMemo(
    () => activeAppProfile.tabs || [],
    [activeAppProfile]
  );
  const groupedNavTabs = useMemo(() => (
    NAV_GROUPS
      .map((group) => ({
        ...group,
        tabs: group.tabs.filter((tab) => visibleWorkspaceTabs.includes(tab)),
      }))
      .filter((group) => group.tabs.length)
  ), [visibleWorkspaceTabs]);
  const currentNavGroup = useMemo(
    () => groupedNavTabs.find((group) => group.key === navGroupKey) || groupedNavTabs[0] || null,
    [groupedNavTabs, navGroupKey]
  );
  const isWindowLocked = Boolean(lockedWorkspace);

  const openWorkspaceWindow = useCallback((tab) => {
    const url = `${window.location.origin}?page=crm&module=${encodeURIComponent(tab)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const goWorkspace = useCallback((tab, nextActiveTab = null) => {
    if (!tab) return;
    if (isWindowLocked && tab !== workspaceTab) {
      openWorkspaceWindow(tab);
      return;
    }
    setWorkspaceOpenTabs((prev) => (prev.includes(tab) ? prev : [...prev, tab]));
    setRecentTabs((prev) => [tab, ...prev.filter((t) => t !== tab)].slice(0, 8));
    setWorkspaceTab(tab);
    if (nextActiveTab) setActiveTab(nextActiveTab);
  }, [isWindowLocked, workspaceTab, openWorkspaceWindow]);

  const closeWorkspaceTab = useCallback((tab) => {
    setWorkspaceOpenTabs((prev) => {
      const next = prev.filter((item) => item !== tab);
      return next.length ? next : ['home'];
    });
    if (workspaceTab === tab) {
      const fallback = workspaceOpenTabs.find((item) => item !== tab) || 'home';
      setWorkspaceTab(fallback);
    }
  }, [workspaceOpenTabs, workspaceTab]);

  const toggleFavoriteTab = useCallback((tab) => {
    setFavoriteTabs((prev) => {
      const next = prev.includes(tab) ? prev.filter((item) => item !== tab) : [...prev, tab];
      try {
        localStorage.setItem('crm_favorite_tabs', JSON.stringify(next));
      } catch (_) {
        // ignore storage failures
      }
      return next;
    });
  }, []);

  const tabLabel = useCallback((tab) => {
    if (tab === 'notifications') {
      return `Notifications (${notifications.summary?.unread || 0})`;
    }
    if (tab === 'communications') {
      return `Comms Center (${communications.analytics?.overdue_responses || 0})`;
    }
    return TAB_LABELS[tab] || tab;
  }, [communications.analytics?.overdue_responses, notifications.summary?.unread]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedId) || null,
    [customers, selectedId]
  );

  const sortedCustomers = useMemo(() => {
    const list = [...customers];
    if (sortBy === 'name') {
      return list.sort((a, b) => String(a.customer_name || '').localeCompare(String(b.customer_name || '')));
    }
    if (sortBy === 'balance') {
      return list.sort((a, b) => Number(b.balance || 0) - Number(a.balance || 0));
    }
    if (sortBy === 'lead') {
      return list.sort((a, b) => Number(b.lead_score || 0) - Number(a.lead_score || 0));
    }
    return list.sort((a, b) => {
      const ad = new Date(String(a.last_interaction_at || a.updated_at || 0)).getTime();
      const bd = new Date(String(b.last_interaction_at || b.updated_at || 0)).getTime();
      return bd - ad;
    });
  }, [customers, sortBy]);

  const crmAnalytics = useMemo(() => {
    const activeCustomers = customers.filter((customer) => (customer.customer_status || 'ACTIVE') === 'ACTIVE').length;
    const atRiskCustomers = customers.filter((customer) => {
      const ageDays = interactionAgeDays(customer.last_interaction_at);
      return ageDays === null || ageDays > 30;
    }).length;
    const totalBalanceExposure = customers.reduce((sum, customer) => sum + Number(customer.balance || 0), 0);

    const statusMap = new Map();
    const leadBandMap = new Map([['Hot', 0], ['Warm', 0], ['Cold', 0]]);
    customers.forEach((customer) => {
      const status = customer.customer_status || 'ACTIVE';
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
      const band = leadTemperature(customer.lead_score).label;
      leadBandMap.set(band, (leadBandMap.get(band) || 0) + 1);
    });

    const statusBreakdown = Array.from(statusMap.entries()).map(([label, value]) => ({ label, value }));
    const leadBreakdown = Array.from(leadBandMap.entries()).map(([label, value]) => ({ label, value }));
    const topBalances = [...customers]
      .map((customer) => ({ label: customer.customer_name || customer.customer_number || 'Unknown', value: Number(customer.balance || 0) }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    return {
      activeCustomers,
      atRiskCustomers,
      totalBalanceExposure,
      statusBreakdown,
      leadBreakdown,
      topBalances,
    };
  }, [customers]);

  const selectedInsights = useMemo(() => {
    const orders = detail.orders || [];
    const interactions = detail.interactions || [];
    const orderStatusMap = new Map();
    orders.forEach((order) => {
      const status = order.status || 'UNKNOWN';
      orderStatusMap.set(status, (orderStatusMap.get(status) || 0) + 1);
    });
    const orderStatusBreakdown = Array.from(orderStatusMap.entries()).map(([label, value]) => ({ label, value }));
    const nextFollowups = [...interactions]
      .filter((item) => item.next_followup_at)
      .sort((a, b) => (String(a.next_followup_at) > String(b.next_followup_at) ? 1 : -1))
      .slice(0, 6);
    return { orderStatusBreakdown, nextFollowups };
  }, [detail.orders, detail.interactions]);

  const relatedLists = useMemo(() => {
    const openTasks = (detail.tasks || []).filter((task) => task.status === 'OPEN');
    const openOpportunities = (detail.opportunities || []).filter((opportunity) => opportunity.status === 'OPEN');
    const recentTimeline = (detail.timeline || []).slice(0, 1)[0] || null;
    return [
      {
        key: 'orders',
        label: 'Orders',
        count: (detail.orders || []).length,
        actionLabel: 'Open Orders',
        onClick: () => goWorkspace('accounts', 'orders'),
      },
      {
        key: 'interactions',
        label: 'Interactions',
        count: (detail.interactions || []).length,
        actionLabel: 'Open Activities',
        onClick: () => goWorkspace('accounts', 'activities'),
      },
      {
        key: 'opportunities',
        label: 'Open Opportunities',
        count: openOpportunities.length,
        actionLabel: 'Open Pipeline',
        onClick: () => goWorkspace('opportunities'),
      },
      {
        key: 'tasks',
        label: 'Open Tasks',
        count: openTasks.length,
        actionLabel: 'Open Tasks',
        onClick: () => goWorkspace('tasks'),
      },
      {
        key: 'timeline',
        label: 'Timeline Events',
        count: (detail.timeline || []).length,
        actionLabel: 'Open Timeline',
        onClick: () => goWorkspace('timeline'),
        subtitle: recentTimeline ? `${recentTimeline.title || recentTimeline.event_type} on ${dateOnly(recentTimeline.event_at)}` : 'No recent activity',
      },
    ];
  }, [detail, goWorkspace]);

  const pipelineInsights = useMemo(() => {
    const stageMap = new Map((opportunitySummary.by_stage || []).map((stageRow) => [stageRow.stage, Number(stageRow.count || 0)]));
    const stageBreakdown = PIPELINE_STAGES.map((stage) => ({ label: stage.label, value: stageMap.get(stage.key) || 0 }));

    const openPipelineByStage = PIPELINE_STAGES.slice(0, 4).map((stage) => {
      const value = opportunities
        .filter((opportunity) => opportunity.stage === stage.key && opportunity.status === 'OPEN')
        .reduce((sum, opportunity) => sum + Number(opportunity.expected_value || 0), 0);
      return { label: stage.label, value };
    });

    const byStage = PIPELINE_STAGES.reduce((acc, stage) => {
      acc[stage.key] = opportunities.filter((opportunity) => opportunity.stage === stage.key);
      return acc;
    }, {});

    return { stageBreakdown, openPipelineByStage, byStage };
  }, [opportunitySummary.by_stage, opportunities]);

  const selectedOpportunityRecord = useMemo(
    () => opportunities.find((opportunity) => opportunity.id === selectedOpportunityId) || null,
    [opportunities, selectedOpportunityId]
  );

  const pipelineInspection = useMemo(() => {
    const competitorMap = new Map();
    const lossReasonMap = new Map();
    const staleDeals = [];
    const highRiskDeals = [];

    opportunities.forEach((opportunity) => {
      if (opportunity.competitor_name) {
        competitorMap.set(opportunity.competitor_name, (competitorMap.get(opportunity.competitor_name) || 0) + 1);
      }
      if (opportunity.loss_reason) {
        lossReasonMap.set(opportunity.loss_reason, (lossReasonMap.get(opportunity.loss_reason) || 0) + 1);
      }
      const daysSinceUpdate = daysUntil(opportunity.updated_at) !== null
        ? Math.abs(Number(daysUntil(opportunity.updated_at) || 0))
        : null;
      if (opportunity.status === 'OPEN' && daysSinceUpdate !== null && daysSinceUpdate >= 14) {
        staleDeals.push({ ...opportunity, daysSinceUpdate });
      }
      if (opportunity.status === 'OPEN' && ['HIGH', 'CRITICAL'].includes(String(opportunity.risk_level || '').toUpperCase())) {
        highRiskDeals.push(opportunity);
      }
    });

    return {
      competitorMix: Array.from(competitorMap.entries()).map(([label, value]) => ({ label, value })).slice(0, 8),
      lossReasonMix: Array.from(lossReasonMap.entries()).map(([label, value]) => ({ label, value })).slice(0, 8),
      staleDeals: staleDeals.sort((a, b) => Number(b.daysSinceUpdate || 0) - Number(a.daysSinceUpdate || 0)).slice(0, 8),
      highRiskDeals: highRiskDeals.slice(0, 8),
    };
  }, [opportunities]);

  const filteredTimeline = useMemo(() => {
    return (detail.timeline || []).filter((event) => {
      if (timelineFilters.type && String(event.event_type || '').toUpperCase() !== timelineFilters.type) {
        return false;
      }
      if (timelineFilters.search) {
        const q = timelineFilters.search.toLowerCase();
        const haystack = `${event.title || ''} ${event.subtitle || ''} ${event.status || ''} ${JSON.stringify(event.payload || {})}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [detail.timeline, timelineFilters]);

  const reportInsights = useMemo(() => {
    const orderTrend = (reports.orders_by_day || []).map((row) => ({ label: dateOnly(row.day).slice(5), value: Number(row.value || 0) }));
    const taskTrend = (reports.tasks_by_day || []).map((row) => ({ label: dateOnly(row.day).slice(5), value: Number(row.total || 0) }));
    const stageMix = (reports.opportunities_by_stage || []).map((row) => ({ label: row.stage, value: Number(row.count || 0) }));
    const forecastTrend = (reports.forecast_by_month || []).map((row) => ({ label: dateOnly(row.month).slice(0, 7), value: Number(row.weighted_value || 0) }));
    const ownerMix = (reports.owner_pipeline || []).map((row) => ({ label: row.owner_name || 'Unassigned', value: Number(row.open_value || 0) }));
    const winRateTrend = (reports.close_rate_by_month || []).map((row) => ({ label: dateOnly(row.month).slice(0, 7), value: Number(row.win_rate || 0) }));
    return { orderTrend, taskTrend, stageMix, forecastTrend, ownerMix, winRateTrend };
  }, [reports]);

  const homeInsights = useMemo(() => {
    const staleAccounts = [...customers]
      .map((customer) => ({ customer, age: interactionAgeDays(customer.last_interaction_at) }))
      .filter((row) => row.age === null || row.age > 30)
      .sort((a, b) => Number(b.age || 9999) - Number(a.age || 9999))
      .slice(0, 8);
    const closingSoon = [...opportunities]
      .filter((opportunity) => opportunity.status === 'OPEN' && opportunity.expected_close_date)
      .sort((a, b) => String(a.expected_close_date).localeCompare(String(b.expected_close_date)))
      .slice(0, 8);
    const todaysTasks = [...tasks]
      .filter((task) => task.status === 'OPEN' && dateOnly(task.due_date) === dateOnly(new Date().toISOString()))
      .slice(0, 8);
    return { staleAccounts, closingSoon, todaysTasks };
  }, [customers, opportunities, tasks]);

  const customerOrderInsights = useMemo(() => {
    const orders = detail.orders || [];
    const totalSpend = orders.reduce((sum, order) => sum + Number(order.product_price || 0), 0);
    const avgOrderValue = orders.length ? totalSpend / orders.length : 0;
    const mtoOrders = orders.filter((order) => String(order.order_type || 'MTO').toUpperCase() === 'MTO');
    const refurbishmentOrders = orders.filter((order) => String(order.order_type || '').toUpperCase() === 'REFURBISHMENT');
    const returnOrders = orders.filter((order) => String(order.order_type || '').toUpperCase() === 'RETURN');
    const openOrders = orders.filter((order) => !['COMPLETED', 'SHIPPED'].includes(String(order.status || '').toUpperCase()));
    const completedOrders = orders.filter((order) => ['COMPLETED', 'SHIPPED'].includes(String(order.status || '').toUpperCase()));
    const replacementTouchedOrders = orders.filter((order) => Number(order.replacement_count || 0) > 0);

    const orderTypeMix = ['MTO', 'REFURBISHMENT', 'RETURN']
      .map((type) => ({ label: type, value: orders.filter((order) => String(order.order_type || 'MTO').toUpperCase() === type).length }))
      .filter((row) => row.value > 0);

    const stageMixMap = orders.reduce((acc, order) => {
      const key = order.current_stage || 'Completed';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const stageMix = Object.entries(stageMixMap).map(([label, value]) => ({ label, value })).slice(0, 8);

    const refurbishmentTypeMap = refurbishmentOrders.reduce((acc, order) => {
      const key = order.refurbishment_type || 'GENERAL';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const refurbishmentTypeMix = Object.entries(refurbishmentTypeMap).map(([label, value]) => ({ label, value }));

    const issueMap = refurbishmentOrders.reduce((acc, order) => {
      const key = order.issue_description || order.work_requested || 'Issue not logged';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const issueMix = Object.entries(issueMap)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    return {
      totalSpend,
      avgOrderValue,
      mtoOrders,
      refurbishmentOrders,
      returnOrders,
      openOrders,
      completedOrders,
      replacementTouchedOrders,
      orderTypeMix,
      stageMix,
      refurbishmentTypeMix,
      issueMix,
    };
  }, [detail.orders]);

  const crmCommandCenter = useMemo(() => {
    const accountOrderMap = new Map();
    const taskOwnerMap = new Map();
    const caseOwnerMap = new Map();
    const outletExposureMap = new Map();
    const segmentMap = new Map([
      ['VIP', 0],
      ['Growth', 0],
      ['Service Heavy', 0],
      ['At Risk', 0],
      ['Dormant', 0],
    ]);
    const duplicateEmailMap = new Map();
    const duplicatePhoneMap = new Map();
    const accountActions = [];
    const customerHealthRows = [];

    (detail.orders || []).forEach((order) => {
      const list = accountOrderMap.get(selectedId) || [];
      list.push(order);
      accountOrderMap.set(selectedId, list);
    });

    customers.forEach((customer) => {
      const customerName = customer.customer_name || customer.customer_number || 'Unknown account';
      const staleDays = interactionAgeDays(customer.last_interaction_at);
      const balance = Number(customer.balance || 0);
      const lead = Number(customer.lead_score || 0);
      const orderCount = Number(customer.order_count || 0);
      const serviceCount = cases.filter((caseRow) => caseRow.account_id === customer.id).length;
      const openCasesForCustomer = cases.filter((caseRow) => caseRow.account_id === customer.id && ['NEW', 'WORKING', 'WAITING_CUSTOMER', 'ESCALATED'].includes(caseRow.status)).length;
      const escalatedCasesForCustomer = cases.filter((caseRow) => caseRow.account_id === customer.id && caseRow.status === 'ESCALATED').length;
      const overdueTasksForCustomer = tasks.filter((task) => task.account_id === customer.id && task.status === 'OPEN' && dateOnly(task.due_date) < dateOnly(new Date().toISOString())).length;
      const openOppValue = opportunities
        .filter((opportunity) => opportunity.account_id === customer.id && opportunity.status === 'OPEN')
        .reduce((sum, opportunity) => sum + Number(opportunity.expected_value || 0), 0);

      const healthScore = clampScore(
        90
        - Math.min(balance / 250, 25)
        - (staleDays === null ? 16 : Math.min(staleDays / 2, 25))
        - (escalatedCasesForCustomer * 8)
        - (overdueTasksForCustomer * 5)
        + Math.min(lead / 10, 10)
      );
      const churnRisk = clampScore(
        (staleDays === null ? 45 : Math.min(staleDays * 2, 55))
        + (openCasesForCustomer * 8)
        + (balance > 0 ? Math.min(balance / 300, 20) : 0)
        - Math.min(orderCount * 2, 18)
      );
      const serviceBurden = clampScore((serviceCount * 12) + (escalatedCasesForCustomer * 14) + (overdueTasksForCustomer * 8));
      const promiseReliability = clampScore(100 - (openCasesForCustomer * 8) - (escalatedCasesForCustomer * 12) - (staleDays && staleDays > 21 ? 12 : 0));
      const valueBand = balance > 3000 || openOppValue > 10000 || lead >= 85 ? 'VIP'
        : serviceBurden >= 60 ? 'Service Heavy'
        : churnRisk >= 65 ? 'At Risk'
        : staleDays !== null && staleDays > 60 ? 'Dormant'
        : 'Growth';
      segmentMap.set(valueBand, (segmentMap.get(valueBand) || 0) + 1);

      const nextBestAction = escalatedCasesForCustomer > 0
        ? 'Resolve escalated service case'
        : overdueTasksForCustomer > 0
          ? 'Clear overdue follow-up tasks'
          : staleDays === null || staleDays > 30
            ? 'Re-engage customer this week'
            : balance > 0
              ? 'Review outstanding balance before next promise'
              : openOppValue > 0
                ? 'Advance open opportunity'
                : 'Schedule relationship follow-up';

      customerHealthRows.push({
        id: customer.id,
        label: customerName,
        outlet: customer.outlet_name || '-',
        healthScore,
        churnRisk,
        serviceBurden,
        promiseReliability,
        nextBestAction,
        lead,
        balance,
        valueBand,
        staleDays,
        serviceCount,
        openCasesForCustomer,
        overdueTasksForCustomer,
        openOppValue,
      });

      outletExposureMap.set(customer.outlet_name || 'Unassigned Outlet', (outletExposureMap.get(customer.outlet_name || 'Unassigned Outlet') || 0) + churnRisk + serviceBurden + Math.max(0, 100 - promiseReliability));

      if (customer.email) {
        const key = String(customer.email).trim().toLowerCase();
        const list = duplicateEmailMap.get(key) || [];
        list.push(customer);
        duplicateEmailMap.set(key, list);
      }
      if (customer.customer_number) {
        const key = String(customer.customer_number).trim().toLowerCase();
        const list = duplicatePhoneMap.get(key) || [];
        list.push(customer);
        duplicatePhoneMap.set(key, list);
      }

      accountActions.push({
        id: customer.id,
        customer: customerName,
        outlet: customer.outlet_name || '-',
        valueBand,
        priority: escalatedCasesForCustomer > 0 ? 'Immediate' : churnRisk >= 65 ? 'High' : healthScore < 60 ? 'Watch' : 'Routine',
        note: nextBestAction,
        score: (escalatedCasesForCustomer * 20) + churnRisk + serviceBurden + Math.max(0, staleDays || 0),
      });
    });

    tasks.forEach((task) => {
      const key = task.assigned_to_name || 'Unassigned';
      const current = taskOwnerMap.get(key) || { label: key, value: 0, overdue: 0, critical: 0 };
      current.value += 1;
      if (task.status === 'OPEN' && dateOnly(task.due_date) < dateOnly(new Date().toISOString())) current.overdue += 1;
      if (task.priority === 'CRITICAL') current.critical += 1;
      taskOwnerMap.set(key, current);
    });

    cases.forEach((caseRow) => {
      const key = caseRow.assigned_to_name || caseRow.owner_name || 'Unassigned';
      const current = caseOwnerMap.get(key) || { label: key, value: 0, escalated: 0, overdue: 0 };
      current.value += 1;
      if (caseRow.status === 'ESCALATED') current.escalated += 1;
      if (caseRow.due_at && new Date(String(caseRow.due_at)).getTime() < Date.now() && ['NEW', 'WORKING', 'WAITING_CUSTOMER', 'ESCALATED'].includes(caseRow.status)) current.overdue += 1;
      caseOwnerMap.set(key, current);
    });

    const healthDistribution = [
      { label: 'Strong', value: customerHealthRows.filter((row) => row.healthScore >= 80).length },
      { label: 'Watch', value: customerHealthRows.filter((row) => row.healthScore >= 55 && row.healthScore < 80).length },
      { label: 'Critical', value: customerHealthRows.filter((row) => row.healthScore < 55).length },
    ];

    const duplicateAccounts = [
      ...Array.from(duplicateEmailMap.entries())
        .filter(([, list]) => list.length > 1)
        .map(([key, list]) => ({ type: 'Email', key, accounts: list })),
      ...Array.from(duplicatePhoneMap.entries())
        .filter(([, list]) => list.length > 1)
        .map(([key, list]) => ({ type: 'Phone', key, accounts: list })),
    ].slice(0, 10);

    const vipAccounts = [...customerHealthRows]
      .filter((row) => row.valueBand === 'VIP')
      .sort((a, b) => (b.openOppValue + b.balance) - (a.openOppValue + a.balance))
      .slice(0, 8);

    const serviceHeavyAccounts = [...customerHealthRows]
      .filter((row) => row.serviceBurden > 0 || row.serviceCount > 0)
      .sort((a, b) => b.serviceBurden - a.serviceBurden)
      .slice(0, 8);

    const churnRiskAccounts = [...customerHealthRows]
      .sort((a, b) => b.churnRisk - a.churnRisk)
      .slice(0, 8);

    const promiseRiskAccounts = [...customerHealthRows]
      .sort((a, b) => a.promiseReliability - b.promiseReliability)
      .slice(0, 8);

    const nextBestActions = [...accountActions]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    const communicationGaps = [...customerHealthRows]
      .filter((row) => row.staleDays === null || row.staleDays > 21)
      .sort((a, b) => Number(b.staleDays || 9999) - Number(a.staleDays || 9999))
      .slice(0, 8);

    const criticalTaskQueue = tasks
      .filter((task) => task.status === 'OPEN' && ['CRITICAL', 'HIGH'].includes(task.priority))
      .sort((a, b) => String(a.due_date || '').localeCompare(String(b.due_date || '')))
      .slice(0, 8);

    const escalatedCases = cases
      .filter((caseRow) => caseRow.status === 'ESCALATED')
      .sort((a, b) => String(a.due_at || '').localeCompare(String(b.due_at || '')))
      .slice(0, 8);

    const slaRiskCases = cases
      .filter((caseRow) => ['NEW', 'WORKING', 'WAITING_CUSTOMER', 'ESCALATED'].includes(caseRow.status) && caseRow.due_at)
      .map((caseRow) => ({ ...caseRow, daysLeft: daysUntil(caseRow.due_at) }))
      .filter((caseRow) => caseRow.daysLeft !== null && caseRow.daysLeft <= 2)
      .sort((a, b) => Number(a.daysLeft || 0) - Number(b.daysLeft || 0))
      .slice(0, 8);

    const caseTypeMixMap = new Map();
    const casePriorityMixMap = new Map();
    cases.forEach((caseRow) => {
      caseTypeMixMap.set(caseRow.case_type || 'GENERAL', (caseTypeMixMap.get(caseRow.case_type || 'GENERAL') || 0) + 1);
      casePriorityMixMap.set(caseRow.priority || 'MEDIUM', (casePriorityMixMap.get(caseRow.priority || 'MEDIUM') || 0) + 1);
    });

    const outletExposure = Array.from(outletExposureMap.entries())
      .map(([label, value]) => ({ label, value: clampScore(value / 3) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const segmentMix = Array.from(segmentMap.entries()).map(([label, value]) => ({ label, value }));
    const taskOwnerLoad = Array.from(taskOwnerMap.values()).sort((a, b) => b.value - a.value).slice(0, 8);
    const caseOwnerLoad = Array.from(caseOwnerMap.values()).sort((a, b) => b.value - a.value).slice(0, 8);

    const pipelineRiskQueue = opportunities
      .filter((opportunity) => opportunity.status === 'OPEN')
      .map((opportunity) => ({
        ...opportunity,
        riskScore: clampScore((100 - Number(opportunity.probability || 0)) + (daysUntil(opportunity.expected_close_date) !== null && daysUntil(opportunity.expected_close_date) <= 7 ? 25 : 0)),
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 8);

    const quoteStatusMap = new Map();
    const quoteExpiryQueue = [];
    quotes.forEach((quote) => {
      quoteStatusMap.set(quote.status || 'DRAFT', (quoteStatusMap.get(quote.status || 'DRAFT') || 0) + 1);
      const validDays = daysUntil(quote.valid_until);
      if (validDays !== null && validDays <= 5) {
        quoteExpiryQueue.push({ ...quote, validDays });
      }
    });

    const alertCenter = [
      Number(notifications.summary?.unread || 0) > 0 ? { title: 'Unread CRM alerts', value: Number(notifications.summary?.unread || 0), tone: 'warning' } : null,
      escalatedCases.length > 0 ? { title: 'Escalated cases', value: escalatedCases.length, tone: 'critical' } : null,
      criticalTaskQueue.length > 0 ? { title: 'Critical follow-ups', value: criticalTaskQueue.length, tone: 'warning' } : null,
      duplicateAccounts.length > 0 ? { title: 'Possible duplicate accounts', value: duplicateAccounts.length, tone: 'watch' } : null,
      promiseRiskAccounts.length > 0 ? { title: 'Accounts with low promise reliability', value: promiseRiskAccounts.filter((row) => row.promiseReliability < 60).length, tone: 'critical' } : null,
    ].filter(Boolean);

    return {
      healthDistribution,
      duplicateAccounts,
      vipAccounts,
      serviceHeavyAccounts,
      churnRiskAccounts,
      promiseRiskAccounts,
      nextBestActions,
      communicationGaps,
      criticalTaskQueue,
      escalatedCases,
      slaRiskCases,
      caseTypeMix: Array.from(caseTypeMixMap.entries()).map(([label, value]) => ({ label, value })),
      casePriorityMix: Array.from(casePriorityMixMap.entries()).map(([label, value]) => ({ label, value })),
      outletExposure,
      segmentMix,
      taskOwnerLoad,
      caseOwnerLoad,
      pipelineRiskQueue,
      quoteStatusMix: Array.from(quoteStatusMap.entries()).map(([label, value]) => ({ label, value })),
      quoteExpiryQueue: quoteExpiryQueue.sort((a, b) => Number(a.validDays || 0) - Number(b.validDays || 0)).slice(0, 8),
      alertCenter,
      customerHealthRows,
    };
  }, [customers, cases, detail.orders, notifications.summary?.unread, opportunities, quotes, selectedId, tasks]);

  const selectedAccountSignals = useMemo(() => {
    const account = detail.account;
    if (!account) {
      return {
        health: scoreBand(0),
        churn: scoreBand(0),
        service: scoreBand(0),
        promise: scoreBand(0),
        nextBestAction: 'Select an account to open customer guidance.',
        serviceTimeline: [],
        replacementOrders: [],
        duplicateFlags: [],
      };
    }

    const staleDays = interactionAgeDays(account.last_interaction_at);
    const balance = Number(detail.ledger?.summary?.balance || 0);
    const openTasks = (detail.tasks || []).filter((task) => task.status === 'OPEN').length;
    const followups = (detail.interactions || []).filter((item) => item.next_followup_at).length;
    const replacementOrders = (detail.orders || []).filter((order) => Number(order.replacement_count || 0) > 0);
    const refurbishmentOrders = (detail.orders || []).filter((order) => String(order.order_type || '').toUpperCase() === 'REFURBISHMENT');
    const returnOrders = (detail.orders || []).filter((order) => String(order.order_type || '').toUpperCase() === 'RETURN');

    const health = scoreBand(
      92
      - Math.min(balance / 250, 25)
      - (staleDays === null ? 16 : Math.min(staleDays / 2, 25))
      - (replacementOrders.length * 8)
      - (returnOrders.length * 6)
      + Math.min(Number(account.lead_score || 0) / 10, 8)
    );
    const churn = scoreBand(
      clampScore((staleDays === null ? 50 : staleDays * 2) + (openTasks * 7) + (returnOrders.length * 10) + (balance > 0 ? balance / 300 : 0))
    );
    const service = scoreBand(clampScore((refurbishmentOrders.length * 12) + (replacementOrders.length * 14) + (returnOrders.length * 10)));
    const promise = scoreBand(clampScore(100 - (replacementOrders.length * 12) - (returnOrders.length * 10) - (staleDays && staleDays > 21 ? 10 : 0)));

    const nextBestAction = replacementOrders.length > 0
      ? 'Review replacement chain before making any new promise.'
      : refurbishmentOrders.length > 0
        ? 'Confirm refurb work requested and expected return condition.'
        : returnOrders.length > 0
          ? 'Close open return context and align customer expectation.'
          : openTasks > 0
            ? 'Complete the open follow-up tasks for this account.'
            : staleDays === null || staleDays > 30
              ? 'Re-engage this account with a service or sales touchpoint.'
              : followups > 0
                ? 'Work the scheduled follow-up sequence.'
                : 'Opportunity to deepen relationship with proactive outreach.';

    const serviceTimeline = [...refurbishmentOrders, ...returnOrders, ...replacementOrders]
      .sort((a, b) => String(b.order_date || '').localeCompare(String(a.order_date || '')))
      .slice(0, 8);

    const duplicateFlags = crmCommandCenter.duplicateAccounts
      .filter((entry) => entry.accounts.some((row) => row.id === account.id))
      .map((entry) => `${entry.type}: ${entry.key}`);

    return {
      health,
      churn,
      service,
      promise,
      nextBestAction,
      serviceTimeline,
      replacementOrders,
      duplicateFlags,
    };
  }, [crmCommandCenter.duplicateAccounts, detail.account, detail.interactions, detail.ledger?.summary?.balance, detail.orders, detail.tasks]);

  const crmDepthInsights = useMemo(() => {
    const segmentMap = new Map();
    const tierMap = new Map();
    const rootCauseMap = new Map();
    const resolutionMap = new Map();
    const channelMap = new Map();

    customers.forEach((customer) => {
      segmentMap.set(customer.customer_segment || 'Unsegmented', (segmentMap.get(customer.customer_segment || 'Unsegmented') || 0) + 1);
      tierMap.set(customer.account_tier || 'STANDARD', (tierMap.get(customer.account_tier || 'STANDARD') || 0) + 1);
    });

    cases.forEach((caseRow) => {
      rootCauseMap.set(caseRow.root_cause_code || 'Not tagged', (rootCauseMap.get(caseRow.root_cause_code || 'Not tagged') || 0) + 1);
      resolutionMap.set(caseRow.resolution_code || 'Not resolved', (resolutionMap.get(caseRow.resolution_code || 'Not resolved') || 0) + 1);
      channelMap.set(caseRow.service_channel || 'MANUAL', (channelMap.get(caseRow.service_channel || 'MANUAL') || 0) + 1);
    });

    return {
      segmentMix: Array.from(segmentMap.entries()).map(([label, value]) => ({ label, value })),
      tierMix: Array.from(tierMap.entries()).map(([label, value]) => ({ label, value })),
      rootCauseMix: Array.from(rootCauseMap.entries()).map(([label, value]) => ({ label, value })),
      resolutionMix: Array.from(resolutionMap.entries()).map(([label, value]) => ({ label, value })),
      serviceChannelMix: Array.from(channelMap.entries()).map(([label, value]) => ({ label, value })),
    };
  }, [cases, customers]);

  const quoteInsights = useMemo(() => {
    const statusMap = new Map();
    const accountMap = new Map();
    const expiringQuotes = [];
    const highValueQuotes = [];
    quotes.forEach((quote) => {
      statusMap.set(quote.status || 'DRAFT', (statusMap.get(quote.status || 'DRAFT') || 0) + 1);
      accountMap.set(quote.customer_name || quote.customer_number || 'Unknown', (accountMap.get(quote.customer_name || quote.customer_number || 'Unknown') || 0) + Number(quote.grand_total || 0));
      const validDays = daysUntil(quote.valid_until);
      if (validDays !== null && validDays <= 7) expiringQuotes.push({ ...quote, validDays });
      if (Number(quote.grand_total || 0) > 0) highValueQuotes.push(quote);
    });
    return {
      statusMix: Array.from(statusMap.entries()).map(([label, value]) => ({ label, value })),
      accountValueMix: Array.from(accountMap.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8),
      expiringQuotes: expiringQuotes.sort((a, b) => Number(a.validDays || 0) - Number(b.validDays || 0)).slice(0, 8),
      highValueQuotes: highValueQuotes.sort((a, b) => Number(b.grand_total || 0) - Number(a.grand_total || 0)).slice(0, 8),
    };
  }, [quotes]);

  const selectedCaseRecord = useMemo(
    () => cases.find((caseRow) => caseRow.id === selectedCaseId) || null,
    [cases, selectedCaseId]
  );

  const contactInsights = useMemo(() => {
    const roleMap = new Map();
    const channelMap = new Map();
    const influenceMap = new Map();
    const verificationMap = new Map();
    const relationshipMap = new Map();
    const emailMap = new Map();
    const phoneMap = new Map();

    contacts.forEach((contact) => {
      roleMap.set(contact.decision_role || contact.title || 'Unclassified', (roleMap.get(contact.decision_role || contact.title || 'Unclassified') || 0) + 1);
      channelMap.set(contact.preferred_channel || 'PHONE', (channelMap.get(contact.preferred_channel || 'PHONE') || 0) + 1);
      influenceMap.set(contact.influence_level || 'MEDIUM', (influenceMap.get(contact.influence_level || 'MEDIUM') || 0) + 1);
      verificationMap.set(contact.verification_status || 'UNVERIFIED', (verificationMap.get(contact.verification_status || 'UNVERIFIED') || 0) + 1);
      relationshipMap.set(contact.relationship_strength || 'WARM', (relationshipMap.get(contact.relationship_strength || 'WARM') || 0) + 1);
      if (contact.email) {
        const key = String(contact.email).trim().toLowerCase();
        const list = emailMap.get(key) || [];
        list.push(contact);
        emailMap.set(key, list);
      }
      if (contact.phone) {
        const key = String(contact.phone).trim().toLowerCase();
        const list = phoneMap.get(key) || [];
        list.push(contact);
        phoneMap.set(key, list);
      }
    });

    const duplicateContacts = [
      ...Array.from(emailMap.entries()).filter(([, list]) => list.length > 1).map(([key, list]) => ({ type: 'Email', key, contacts: list })),
      ...Array.from(phoneMap.entries()).filter(([, list]) => list.length > 1).map(([key, list]) => ({ type: 'Phone', key, contacts: list })),
    ].slice(0, 10);

    const keyStakeholders = [...contacts]
      .filter((contact) => ['HIGH', 'CRITICAL'].includes(String(contact.influence_level || '').toUpperCase()) || contact.is_primary)
      .slice(0, 10);

    const orgContacts = [...contacts]
      .filter((contact) => contact.reports_to_contact_id || contact.reports_to_name)
      .slice(0, 10);

    const doNotContactList = contacts.filter((contact) => contact.do_not_contact).slice(0, 10);

    return {
      roleMix: Array.from(roleMap.entries()).map(([label, value]) => ({ label, value })),
      channelMix: Array.from(channelMap.entries()).map(([label, value]) => ({ label, value })),
      influenceMix: Array.from(influenceMap.entries()).map(([label, value]) => ({ label, value })),
      verificationMix: Array.from(verificationMap.entries()).map(([label, value]) => ({ label, value })),
      relationshipMix: Array.from(relationshipMap.entries()).map(([label, value]) => ({ label, value })),
      duplicateContacts,
      keyStakeholders,
      orgContacts,
      doNotContactList,
    };
  }, [contacts]);

  const leadInsights = useMemo(() => {
    const stageMap = new Map();
    const tempMap = new Map();
    const ownerMap = new Map();
    const sourceMap = new Map();
    const agingMap = new Map([['0-2d', 0], ['3-7d', 0], ['8-14d', 0], ['15d+', 0]]);
    const slaRisk = [];
    const hotLeads = [];
    const disqualified = [];
    const conversionReady = [];
    const unassigned = [];

    leadQueue.forEach((lead) => {
      stageMap.set(lead.lead_stage || 'NEW', (stageMap.get(lead.lead_stage || 'NEW') || 0) + 1);
      tempMap.set(lead.lead_temperature || 'COLD', (tempMap.get(lead.lead_temperature || 'COLD') || 0) + 1);
      ownerMap.set(lead.lead_owner_name || 'Unassigned', (ownerMap.get(lead.lead_owner_name || 'Unassigned') || 0) + 1);
      sourceMap.set(lead.lead_source_detail || lead.source || 'Unknown', (sourceMap.get(lead.lead_source_detail || lead.source || 'Unknown') || 0) + 1);
      const daysLeft = daysUntil(lead.lead_sla_due_at);
      const staleDays = interactionAgeDays(lead.lead_last_worked_at || lead.last_interaction_at || lead.updated_at);
      if (staleDays === null || staleDays <= 2) agingMap.set('0-2d', (agingMap.get('0-2d') || 0) + 1);
      else if (staleDays <= 7) agingMap.set('3-7d', (agingMap.get('3-7d') || 0) + 1);
      else if (staleDays <= 14) agingMap.set('8-14d', (agingMap.get('8-14d') || 0) + 1);
      else agingMap.set('15d+', (agingMap.get('15d+') || 0) + 1);
      if (daysLeft !== null && daysLeft <= 2 && !['QUALIFIED', 'DISQUALIFIED', 'CONVERTED'].includes(String(lead.lead_stage || '').toUpperCase())) slaRisk.push({ ...lead, daysLeft });
      if (Number(lead.lead_score || 0) >= 80) hotLeads.push(lead);
      if (String(lead.lead_stage || '').toUpperCase() === 'DISQUALIFIED') disqualified.push(lead);
      if (['WORKING', 'QUALIFIED'].includes(String(lead.lead_stage || '').toUpperCase()) && Number(lead.lead_score || 0) >= 75) conversionReady.push(lead);
      if (!lead.lead_owner_id) unassigned.push(lead);
    });

    return {
      stageMix: Array.from(stageMap.entries()).map(([label, value]) => ({ label, value })),
      tempMix: Array.from(tempMap.entries()).map(([label, value]) => ({ label, value })),
      ownerLoad: Array.from(ownerMap.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8),
      sourceMix: Array.from(sourceMap.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8),
      agingMix: Array.from(agingMap.entries()).map(([label, value]) => ({ label, value })),
      slaRisk: slaRisk.sort((a, b) => Number(a.daysLeft || 0) - Number(b.daysLeft || 0)).slice(0, 8),
      hotLeads: hotLeads.slice(0, 8),
      disqualified: disqualified.slice(0, 8),
      conversionReady: conversionReady.slice(0, 8),
      unassigned: unassigned.slice(0, 8),
    };
  }, [leadQueue]);

  const selectedLeadRecord = useMemo(
    () => leadQueue.find((lead) => lead.id === selectedLeadId) || null,
    [leadQueue, selectedLeadId]
  );

  const communicationCenter = useMemo(() => {
    const interactions = (detail.interactions || []).map((item) => ({
      kind: 'Interaction',
      title: item.subject || item.interaction_type,
      channel: item.interaction_type,
      when: item.created_at,
      owner: item.created_by_name || '-',
      detail: item.notes || '',
    }));
    const timelineEvents = (detail.timeline || []).slice(0, 12).map((event) => ({
      kind: event.event_type,
      title: event.title || event.event_type,
      channel: event.status || '-',
      when: event.event_at,
      owner: '-',
      detail: event.subtitle || '',
    }));
    const alerts = (notifications.notifications || [])
      .filter((item) => {
        const linkedAccountId = item.payload_json?.accountId || item.payload_json?.account_id;
        return !selectedId || Number(linkedAccountId || 0) === Number(selectedId);
      })
      .slice(0, 8)
      .map((item) => ({
        kind: 'Alert',
        title: item.title,
        channel: item.severity,
        when: item.created_at,
        owner: 'System',
        detail: item.message,
      }));
    const feed = [...interactions, ...timelineEvents, ...alerts]
      .sort((a, b) => String(b.when || '').localeCompare(String(a.when || '')))
      .slice(0, 18);

    return {
      feed,
      upcomingFollowups: (detail.interactions || []).filter((item) => item.next_followup_at).slice(0, 8),
      unreadAlerts: (notifications.notifications || []).filter((item) => item.status === 'UNREAD').slice(0, 8),
    };
  }, [detail.interactions, detail.timeline, notifications.notifications, selectedId]);

  const commandMetrics = useMemo(() => ([
    {
      label: 'Customers',
      value: summary.totalCustomers,
      note: `${crmAnalytics.activeCustomers} active`,
      actionLabel: 'Accounts',
      onClick: () => goWorkspace('accounts'),
    },
    {
      label: 'Pipeline',
      value: money(opportunitySummary.summary?.total_pipeline_value),
      note: `${Number(opportunitySummary.summary?.open_count || 0)} open opportunities`,
      actionLabel: 'Pipeline',
      onClick: () => goWorkspace('opportunities'),
    },
    {
      label: 'Cases',
      value: Number(caseSummary.summary?.open_count || 0),
      note: `${Number(caseSummary.summary?.overdue_count || 0)} overdue`,
      actionLabel: 'Cases',
      onClick: () => goWorkspace('cases'),
    },
    {
      label: 'Tasks Today',
      value: homeInsights.todaysTasks.length,
      note: `${Number(notifications.summary?.unread || 0)} unread alerts`,
      actionLabel: 'Tasks',
      onClick: () => goWorkspace('tasks'),
    },
  ]), [
    summary.totalCustomers,
    crmAnalytics.activeCustomers,
    opportunitySummary.summary?.total_pipeline_value,
    opportunitySummary.summary?.open_count,
    caseSummary.summary?.open_count,
    caseSummary.summary?.overdue_count,
    homeInsights.todaysTasks.length,
    notifications.summary?.unread,
    goWorkspace,
  ]);

  const loadCustomers = useCallback(async () => {
    const { data } = await api.get(`/crm/customers?${customerQuery}`);
    const list = data.customers || [];
    setCustomers(list);
    if (!selectedId && list.length) setSelectedId(list[0].id);
    if (selectedId && !list.some((item) => item.id === selectedId)) {
      setSelectedId(list[0]?.id || null);
    }
  }, [customerQuery, selectedId]);

  const loadSummary = useCallback(async () => {
    const { data } = await api.get('/crm/summary');
    setSummary({
      totalCustomers: Number(data?.total_customers || 0),
      incompleteProfiles: Number(data?.incomplete_profiles || 0),
    });
  }, []);

  const loadOpportunities = useCallback(async () => {
    const [listRes, summaryRes] = await Promise.all([
      api.get(`/crm/opportunities?${opportunityQuery}`),
      api.get(`/crm/opportunities/summary?${opportunityQuery}`),
    ]);
    const list = listRes.data?.opportunities || [];
    setOpportunities(list);
    setSelectedOpportunityId((prev) => (prev && list.some((item) => item.id === prev) ? prev : list[0]?.id || null));
    setOpportunitySummary(summaryRes.data || { summary: {}, by_stage: [] });
  }, [opportunityQuery]);

  const loadTasks = useCallback(async () => {
    const [listRes, summaryRes] = await Promise.all([
      api.get(`/crm/tasks?${taskQuery}`),
      api.get(`/crm/tasks/summary?${taskQuery}`),
    ]);
    setTasks(listRes.data?.tasks || []);
    setTaskSummary(summaryRes.data || { summary: {} });
  }, [taskQuery]);

  const loadOpportunityLineItems = useCallback(async (opportunityId) => {
    if (!opportunityId) {
      setOpportunityLineItems([]);
      return;
    }
    const { data } = await api.get(`/crm/opportunities/${opportunityId}/line-items`);
    setOpportunityLineItems(data.line_items || []);
  }, []);

  const loadCommunicationCenter = useCallback(async () => {
    const suffix = communicationQuery ? `?${communicationQuery}` : '';
    const { data } = await api.get(`/crm/communications/center${suffix}`);
    setCommunications(data || { inbox: [], analytics: { channel_mix: [], owner_mix: [], response_sla: {} }, followupCompliance: {}, noResponseAlerts: [] });
  }, [communicationQuery]);

  const loadCases = useCallback(async () => {
    const [listRes, summaryRes] = await Promise.all([
      api.get(`/crm/cases?${caseQuery}`),
      api.get(`/crm/cases/summary?${caseQuery}`),
    ]);
    const caseList = listRes.data?.cases || [];
    setCases(caseList);
    setCaseSummary(summaryRes.data || { summary: {} });
    if (!selectedCaseId && caseList.length) setSelectedCaseId(caseList[0].id);
    if (selectedCaseId && !caseList.some((item) => item.id === selectedCaseId)) {
      setSelectedCaseId(caseList[0]?.id || null);
    }
  }, [caseQuery, selectedCaseId]);

  const loadCaseComments = useCallback(async (caseId) => {
    if (!caseId) {
      setCaseComments([]);
      return;
    }
    const { data } = await api.get(`/crm/cases/${caseId}/comments`);
    setCaseComments(data.comments || []);
  }, []);

  const loadContacts = useCallback(async () => {
    const { data } = await api.get('/crm/contacts');
    setContacts(data.contacts || []);
  }, []);

  const loadCampaigns = useCallback(async () => {
    const { data } = await api.get('/crm/campaigns');
    setCampaigns(data.campaigns || []);
  }, []);

  const loadCatalog = useCallback(async () => {
    const [productsRes, priceBooksRes] = await Promise.all([
      api.get('/crm/catalog/products'),
      api.get('/crm/catalog/price-books'),
    ]);
    setProducts(productsRes.data?.products || []);
    setPriceBooks(priceBooksRes.data?.priceBooks || []);
  }, []);

  const loadQuotes = useCallback(async () => {
    const { data } = await api.get('/crm/quotes');
    setQuotes(data.quotes || []);
  }, []);

  const loadGovernance = useCallback(async () => {
    const [rulesRes, slaRes] = await Promise.all([
      api.get('/crm/governance/assignment-rules'),
      api.get('/crm/governance/sla-policies'),
    ]);
    setAssignmentRules(rulesRes.data?.rules || []);
    setSlaPolicies(slaRes.data?.policies || []);
  }, []);

  const loadKnowledge = useCallback(async () => {
    const { data } = await api.get('/crm/knowledge/articles');
    setKnowledgeArticles(data.articles || []);
  }, []);

  const loadEntitlements = useCallback(async () => {
    const [entitlementRes, milestoneRes] = await Promise.all([
      api.get('/crm/service/entitlements'),
      api.get('/crm/service/milestones'),
    ]);
    setEntitlements(entitlementRes.data?.entitlements || []);
    setMilestones(milestoneRes.data?.milestones || []);
  }, []);

  const loadTerritories = useCallback(async () => {
    const { data } = await api.get('/crm/territories');
    setTerritories(data.territories || []);
  }, []);

  const loadSubscriptions = useCallback(async () => {
    const { data } = await api.get('/crm/analytics/subscriptions');
    setSubscriptions(data.subscriptions || []);
  }, []);

  const loadWebhooks = useCallback(async () => {
    const { data } = await api.get('/crm/integrations/webhooks');
    setWebhooks(data.webhooks || []);
  }, []);

  const loadObjectManager = useCallback(async () => {
    const { data } = await api.get('/crm/platform/object-manager');
    setCustomObjects(data.objects || []);
    setCustomFields(data.fields || []);
    setRecordTypes(data.recordTypes || []);
    setPageLayouts(data.layouts || []);
  }, []);

  const loadSecurityModel = useCallback(async () => {
    const { data } = await api.get('/crm/platform/security-model');
    setRoleNodes(data.roles || []);
    setOwdRows(data.owd || []);
    setSharingRules(data.sharingRules || []);
  }, []);

  const loadCpqDesigner = useCallback(async () => {
    const { data } = await api.get('/crm/cpq/designer');
    setCpqBundles(data.bundles || []);
    setCpqBundleItems(data.bundleItems || []);
    setCpqPricingRules(data.pricingRules || []);
    setCpqDiscountSchedules(data.discountSchedules || []);
    setCpqQuoteApprovals(data.quoteApprovals || []);
  }, []);

  const loadFlows = useCallback(async () => {
    const { data } = await api.get('/crm/platform/flows');
    setFlows(data.flows || []);
    setFlowRuns(data.runs || []);
  }, []);

  const loadOmnichannel = useCallback(async () => {
    const { data } = await api.get('/crm/service/omnichannel');
    setOmniQueues(data.queues || []);
    setOmniSkills(data.skills || []);
    setOmniMembers(data.members || []);
    setOmniWorkItems(data.workItems || []);
  }, []);

  const loadMarketplace = useCallback(async () => {
    const { data } = await api.get('/crm/platform/marketplace');
    setMarketApps(data.apps || []);
    setInstalledApps(data.installed || []);
  }, []);

  const loadRuntime = useCallback(async () => {
    const [overviewRes, recordsRes] = await Promise.all([
      api.get('/crm/platform/runtime'),
      api.get(`/crm/platform/runtime/records?object=${encodeURIComponent(runtimeObjectFilter)}`),
    ]);
    setRuntimeValidationRules(overviewRes.data?.validationRules || []);
    setRuntimeFormulaFields(overviewRes.data?.formulaFields || []);
    setRuntimeAuditLogs(overviewRes.data?.auditLogs || []);
    setRuntimeRecords(recordsRes.data?.records || []);
  }, [runtimeObjectFilter]);

  const loadOpsCenter = useCallback(async () => {
    const [jobsRes, logsRes] = await Promise.all([
      api.get('/crm/platform/ops/jobs'),
      api.get('/crm/platform/ops/audit-logs'),
    ]);
    setOpsJobs(jobsRes.data?.jobs || []);
    setOpsRuns(jobsRes.data?.runs || []);
    setRuntimeAuditLogs(logsRes.data?.logs || []);
  }, []);

  const loadPackageLifecycle = useCallback(async () => {
    const { data } = await api.get('/crm/platform/packages');
    setMarketApps(data.apps || []);
    setInstalledApps(data.installed || []);
    setPackageReviews(data.reviews || []);
    setPackageDependencies(data.dependencies || []);
  }, []);

  const loadDeploymentCenter = useCallback(async () => {
    const { data } = await api.get('/crm/platform/deployments');
    setDeploymentRows(data.deployments || []);
    setDeploymentItems(data.items || []);
  }, []);

  const loadFlowCanvas = useCallback(async (flowId) => {
    if (!flowId) {
      setCanvasNodes([]);
      setCanvasEdges([]);
      return;
    }
    const { data } = await api.get(`/crm/platform/flows/${flowId}/canvas`);
    setCanvasNodes(data.nodes || []);
    setCanvasEdges(data.edges || []);
  }, []);

  const loadSavedViews = useCallback(async () => {
    const { data } = await api.get('/crm/views?module=CRM');
    setSavedViews(data.views || []);
  }, []);

  const loadReports = useCallback(async () => {
    const { data } = await api.get(`/crm/reports/overview?${reportQuery}`);
    setReports(data || {
      kpis: {},
      orders_by_day: [],
      tasks_by_day: [],
      opportunities_by_stage: [],
      forecast_by_month: [],
      owner_pipeline: [],
      close_rate_by_month: [],
    });
  }, [reportQuery]);

  const loadNotifications = useCallback(async () => {
    const suffix = notificationFilter ? `?status=${notificationFilter}` : '';
    const { data } = await api.get(`/crm/notifications${suffix}`);
    setNotifications(data || { summary: { total: 0, unread: 0 }, notifications: [] });
  }, [notificationFilter]);

  const loadFieldPermissions = useCallback(async () => {
    const { data } = await api.get('/crm/field-permissions');
    const map = new Map((data.fields || []).map((row) => [row.field_name, Boolean(row.can_edit)]));
    setFieldPermissions(map);
  }, []);

  const loadShares = useCallback(async (accountId) => {
    if (!accountId) {
      setShares([]);
      return;
    }
    const { data } = await api.get(`/crm/customers/${accountId}/shares`);
    setShares(data.shares || []);
  }, []);

  const loadAutomation = useCallback(async () => {
    const [rulesRes, logsRes] = await Promise.all([
      api.get('/crm/automation/rules'),
      api.get('/crm/automation/logs'),
    ]);
    setAutomation({
      rules: rulesRes.data?.rules || [],
      logs: logsRes.data?.logs || [],
    });
  }, []);

  const loadCrmUsers = useCallback(async () => {
    const { data } = await api.get('/crm/users');
    setCrmUsers(data.users || []);
  }, []);

  const runGlobalSearch = useCallback(async () => {
    const q = globalSearch.trim();
    if (!q) {
      setSearchResults({ accounts: [], opportunities: [], tasks: [] });
      setSearchOpen(false);
      return;
    }
    const { data } = await api.get(`/crm/search?q=${encodeURIComponent(q)}&limit=8`);
    setSearchResults({
      accounts: data.accounts || [],
      opportunities: data.opportunities || [],
      tasks: data.tasks || [],
    });
    setSearchOpen(true);
  }, [globalSearch]);

  const loadLeadQueue = useCallback(async () => {
    const suffix = leadQueueQuery ? `?${leadQueueQuery}` : '';
    const { data } = await api.get(`/crm/leads/queue${suffix}`);
    setLeadQueue(data.leads || []);
    setLeadSummary(data.summary || {});
    const nextLead = (data.leads || [])[0] || null;
    setSelectedLeadId((prev) => prev && (data.leads || []).some((lead) => lead.id === prev) ? prev : nextLead?.id || null);
  }, [leadQueueQuery]);

  const loadApprovals = useCallback(async () => {
    const suffix = approvalFilter ? `?status=${approvalFilter}` : '';
    const { data } = await api.get(`/crm/approvals${suffix}`);
    setApprovals(data.approvals || []);
  }, [approvalFilter]);

  const loadEngagement = useCallback(async () => {
    const [templateRes, taskTemplateRes, cadenceRes, enrollmentRes] = await Promise.all([
      api.get('/crm/engagement/templates'),
      api.get('/crm/tasks/templates'),
      api.get('/crm/engagement/cadences'),
      api.get('/crm/engagement/enrollments'),
    ]);
    setTemplates(templateRes.data?.templates || []);
    setTaskTemplates(taskTemplateRes.data?.templates || []);
    setCadences(cadenceRes.data?.cadences || []);
    setEnrollments(enrollmentRes.data?.enrollments || []);
  }, []);

  async function loadDetails(id) {
    if (!id) return;
    const { data } = await api.get(`/crm/customers/${id}`);
    setDetail(data);
    setProfile({
      customerName: data.account?.customer_name || '',
      customerAddress: data.account?.customer_address || '',
      email: data.account?.email || '',
      preferredContact: data.account?.preferred_contact || '',
      customerStatus: data.account?.customer_status || 'ACTIVE',
      leadScore: Number.isFinite(Number(data.account?.lead_score)) ? Number(data.account?.lead_score) : 0,
      source: data.account?.source || '',
      tags: data.account?.tags || '',
      notes: data.account?.notes || '',
      birthDate: data.account?.birth_date ? String(data.account.birth_date).slice(0, 10) : '',
      anniversaryDate: data.account?.anniversary_date ? String(data.account.anniversary_date).slice(0, 10) : '',
      parentAccountId: data.account?.parent_account_id ? String(data.account.parent_account_id) : '',
      accountTier: data.account?.account_tier || 'STANDARD',
      relationshipType: data.account?.relationship_type || '',
      customerSegment: data.account?.customer_segment || '',
      successOwnerId: data.account?.success_owner_id ? String(data.account.success_owner_id) : '',
      riskFlagReason: data.account?.risk_flag_reason || '',
    });
  }

  useEffect(() => {
    Promise.all([
      loadCustomers(),
      loadSummary(),
      loadOpportunities(),
      loadTasks(),
      loadCommunicationCenter(),
      loadCases(),
      loadSavedViews(),
      loadReports(),
      loadNotifications(),
      loadFieldPermissions(),
      loadAutomation(),
      loadCrmUsers(),
      loadApprovals(),
      loadEngagement(),
      loadLeadQueue(),
      loadContacts(),
      loadCampaigns(),
      loadCatalog(),
      loadQuotes(),
      loadGovernance(),
      loadKnowledge(),
      loadEntitlements(),
      loadTerritories(),
      loadSubscriptions(),
      loadWebhooks(),
      loadObjectManager(),
      loadSecurityModel(),
      loadCpqDesigner(),
      loadFlows(),
      loadOmnichannel(),
      loadMarketplace(),
      loadRuntime(),
      loadOpsCenter(),
      loadPackageLifecycle(),
      loadDeploymentCenter(),
    ]).catch(() => {});
  }, [loadCustomers, loadSummary, loadOpportunities, loadTasks, loadCommunicationCenter, loadCases, loadSavedViews, loadReports, loadNotifications, loadFieldPermissions, loadAutomation, loadCrmUsers, loadApprovals, loadEngagement, loadLeadQueue, loadContacts, loadCampaigns, loadCatalog, loadQuotes, loadGovernance, loadKnowledge, loadEntitlements, loadTerritories, loadSubscriptions, loadWebhooks, loadObjectManager, loadSecurityModel, loadCpqDesigner, loadFlows, loadOmnichannel, loadMarketplace, loadRuntime, loadOpsCenter, loadPackageLifecycle, loadDeploymentCenter, refreshSignal]);

  useEffect(() => {
    if (selectedId) {
      loadDetails(selectedId).catch(() => {});
      setOpportunityForm((prev) => ({ ...prev, accountId: prev.accountId || String(selectedId) }));
      setTaskForm((prev) => ({ ...prev, accountId: prev.accountId || String(selectedId) }));
      setCaseForm((prev) => ({ ...prev, accountId: prev.accountId || String(selectedId) }));
      loadShares(selectedId).catch(() => {});
    } else {
      setDetail({ account: null, orders: [], contacts: [], interactions: [], opportunities: [], tasks: [], timeline: [], parent_account: null, child_accounts: [], duplicate_accounts: [], service_summary: {}, ledger: { summary: {}, entries: [] } });
      setShares([]);
      setMergeTargetId('');
      setMergePreview(null);
    }
  }, [selectedId, refreshSignal, loadShares]);

  useEffect(() => {
    if (mergeTargetId) {
      (async () => {
        try {
          const { data } = await api.get(`/crm/customers/${selectedId}/merge-preview?targetId=${mergeTargetId}`);
          setMergePreview(data);
        } catch (_) {
          setMergePreview(null);
        }
      })();
    } else {
      setMergePreview(null);
    }
  }, [mergeTargetId, selectedId]);

  useEffect(() => {
    setMessage('');
  }, [selectedId, activeTab]);

  useEffect(() => {
    if (!availableAppProfiles.some((profile) => profile.key === appProfileKey)) {
      setAppProfileKey(roleDefaultAppProfile);
    }
  }, [availableAppProfiles, appProfileKey, roleDefaultAppProfile]);

  useEffect(() => {
    if (!visibleWorkspaceTabs.includes(workspaceTab)) {
      setWorkspaceTab(visibleWorkspaceTabs[0] || 'home');
    }
  }, [visibleWorkspaceTabs, workspaceTab]);

  useEffect(() => {
    setWorkspaceOpenTabs((prev) => {
      const allowed = prev.filter((tab) => visibleWorkspaceTabs.includes(tab));
      if (!allowed.length) return [visibleWorkspaceTabs[0] || 'home'];
      return allowed;
    });
  }, [visibleWorkspaceTabs]);

  useEffect(() => {
    if (!groupedNavTabs.some((group) => group.key === navGroupKey)) {
      setNavGroupKey(groupedNavTabs[0]?.key || 'workspace');
    }
  }, [groupedNavTabs, navGroupKey]);

  useEffect(() => {
    if (lockedWorkspace) {
      setWorkspaceTab(lockedWorkspace);
    }
  }, [lockedWorkspace]);

  useEffect(() => {
    loadNotifications().catch(() => {});
  }, [notificationFilter, loadNotifications]);

  useEffect(() => {
    loadCommunicationCenter().catch(() => {});
  }, [communicationQuery, loadCommunicationCenter]);

  useEffect(() => {
    loadApprovals().catch(() => {});
  }, [approvalFilter, loadApprovals]);

  useEffect(() => {
    loadLeadQueue().catch(() => {});
  }, [leadQueueQuery, loadLeadQueue]);

  useEffect(() => {
    loadOpportunityLineItems(selectedOpportunityId).catch(() => {});
  }, [selectedOpportunityId, loadOpportunityLineItems]);

  useEffect(() => {
    if (!selectedLeadRecord) {
      setLeadWorkbench({
        leadStage: 'NEW',
        leadOwnerId: '',
        leadTemperature: 'COLD',
        leadSourceDetail: '',
        leadQualificationNotes: '',
        leadDisqualificationReason: '',
        leadSlaDueAt: '',
        leadNextAction: '',
        leadNextActionDueAt: '',
        leadScore: 0,
      });
      return;
    }
    setLeadWorkbench({
      leadStage: selectedLeadRecord.lead_stage || 'NEW',
      leadOwnerId: selectedLeadRecord.lead_owner_id ? String(selectedLeadRecord.lead_owner_id) : '',
      leadTemperature: selectedLeadRecord.lead_temperature || 'COLD',
      leadSourceDetail: selectedLeadRecord.lead_source_detail || selectedLeadRecord.source || '',
      leadQualificationNotes: selectedLeadRecord.lead_qualification_notes || '',
      leadDisqualificationReason: selectedLeadRecord.lead_disqualification_reason || '',
      leadSlaDueAt: selectedLeadRecord.lead_sla_due_at ? String(selectedLeadRecord.lead_sla_due_at).slice(0, 16) : '',
      leadNextAction: selectedLeadRecord.lead_next_action || '',
      leadNextActionDueAt: selectedLeadRecord.lead_next_action_due_at ? String(selectedLeadRecord.lead_next_action_due_at).slice(0, 16) : '',
      leadScore: Number(selectedLeadRecord.lead_score || 0),
    });
  }, [selectedLeadRecord]);

  useEffect(() => {
    loadCaseComments(selectedCaseId).catch(() => {});
  }, [selectedCaseId, loadCaseComments]);

  useEffect(() => {
    const handle = setTimeout(() => {
      runGlobalSearch().catch(() => {});
    }, 220);
    return () => clearTimeout(handle);
  }, [globalSearch, runGlobalSearch]);

  async function saveProfile() {
    if (!selectedId) return;
    try {
      await api.put(`/crm/customers/${selectedId}`, profile);
      setMessage('Customer profile updated');
      await Promise.all([loadCustomers(), loadDetails(selectedId), loadSummary()]);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update customer profile');
    }
  }

  async function addInteraction() {
    if (!selectedId) return;
    try {
      await api.post(`/crm/customers/${selectedId}/interactions`, interaction);
      setInteraction({
        interactionType: 'NOTE',
        direction: 'OUTBOUND',
        subject: '',
        notes: '',
        nextFollowupAt: '',
        conversationOwnerId: '',
        threadKey: '',
        responseSlaMinutes: 60,
        channelStatus: 'OPEN',
      });
      setMessage('Interaction added');
      await Promise.all([loadCustomers(), loadDetails(selectedId), loadCommunicationCenter(), loadNotifications()]);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to add interaction');
    }
  }

  async function createOpportunity(event) {
    event.preventDefault();
    try {
      if (!opportunityForm.accountId || !opportunityForm.title.trim()) {
        setMessage('Account and opportunity title are required');
        return;
      }
      await api.post('/crm/opportunities', {
        accountId: Number(opportunityForm.accountId),
        title: opportunityForm.title,
        stage: opportunityForm.stage,
        status: opportunityForm.status,
        probability: Number(opportunityForm.probability || 0),
        expectedValue: Number(opportunityForm.expectedValue || 0),
        expectedCloseDate: opportunityForm.expectedCloseDate || null,
        ownerId: opportunityForm.ownerId ? Number(opportunityForm.ownerId) : null,
        source: opportunityForm.source,
        competitorName: opportunityForm.competitorName,
        winReason: opportunityForm.winReason,
        lossReason: opportunityForm.lossReason,
        nextStep: opportunityForm.nextStep,
        nextStepDueAt: opportunityForm.nextStepDueAt || null,
        riskLevel: opportunityForm.riskLevel,
        closePlan: opportunityForm.closePlan,
        buyingCommittee: opportunityForm.buyingCommittee,
        notes: opportunityForm.notes,
      });
      setMessage('Opportunity created');
      setOpportunityForm((prev) => ({
        ...prev,
        title: '',
        expectedValue: '',
        expectedCloseDate: '',
        ownerId: '',
        source: '',
        competitorName: '',
        winReason: '',
        lossReason: '',
        nextStep: '',
        nextStepDueAt: '',
        riskLevel: 'MEDIUM',
        closePlan: '',
        buyingCommittee: '',
        notes: '',
      }));
      await Promise.all([loadCustomers(), loadSummary(), loadOpportunities(), selectedId ? loadDetails(selectedId) : Promise.resolve()]);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create opportunity');
    }
  }

  const loadMergePreview = useCallback(async (targetId) => {
    if (!selectedId || !targetId) {
      setMergePreview(null);
      return;
    }
    try {
      const { data } = await api.get(`/crm/customers/${selectedId}/merge-preview?targetId=${targetId}`);
      setMergePreview(data);
    } catch (error) {
      setMergePreview(null);
      setMessage(error.response?.data?.message || 'Unable to load merge preview');
    }
  }, [selectedId]);

  async function runCustomerMerge() {
    if (!selectedId || !mergeTargetId) {
      setMessage('Select a merge target first');
      return;
    }
    try {
      const { data } = await api.post(`/crm/customers/${selectedId}/merge`, {
        targetId: Number(mergeTargetId),
      });
      setMessage(data?.message || 'Customer merged');
      setMergePreview(null);
      setMergeTargetId('');
      await Promise.all([loadCustomers(), loadSummary(), loadDetails(Number(mergeTargetId))]);
      setSelectedId(Number(mergeTargetId));
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to merge customer');
    }
  }

  async function updateOpportunity(opportunityId, patch) {
    try {
      const { data } = await api.put(`/crm/opportunities/${opportunityId}`, patch);
      if (data?.approvalRequired) {
        setMessage(data.message || 'Approval requested');
        await Promise.all([loadApprovals(), loadNotifications()]);
        return;
      }
      await Promise.all([loadCustomers(), loadSummary(), loadOpportunities(), selectedId ? loadDetails(selectedId) : Promise.resolve()]);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update opportunity');
    }
  }

  async function addOpportunityLineItem(event) {
    event.preventDefault();
    if (!selectedOpportunityId) {
      setMessage('Select an opportunity first');
      return;
    }
    try {
      await api.post(`/crm/opportunities/${selectedOpportunityId}/line-items`, {
        productName: lineItemForm.productName,
        quantity: Number(lineItemForm.quantity || 0),
        unitPrice: Number(lineItemForm.unitPrice || 0),
        notes: lineItemForm.notes,
      });
      setLineItemForm({ productName: '', quantity: 1, unitPrice: '', notes: '' });
      await Promise.all([loadOpportunityLineItems(selectedOpportunityId), loadOpportunities()]);
      setMessage('Opportunity line item added');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to add line item');
    }
  }

  async function createTask(event) {
    event.preventDefault();
    try {
      if (!taskForm.accountId || (!taskForm.title.trim() && !taskForm.templateId) || (!taskForm.dueDate && !taskForm.templateId)) {
        setMessage('Account plus either a task title/due date or a task template is required');
        return;
      }
      await api.post('/crm/tasks', {
        accountId: Number(taskForm.accountId),
        opportunityId: taskForm.opportunityId ? Number(taskForm.opportunityId) : null,
        templateId: taskForm.templateId ? Number(taskForm.templateId) : null,
        title: taskForm.title,
        description: taskForm.description,
        dueDate: taskForm.dueDate || null,
        priority: taskForm.priority,
        status: taskForm.status,
        assignedTo: taskForm.assignedTo ? Number(taskForm.assignedTo) : null,
        recurrenceType: taskForm.recurrenceType,
        recurrenceIntervalDays: taskForm.recurrenceIntervalDays ? Number(taskForm.recurrenceIntervalDays) : null,
        dependencyIds: taskForm.dependencyIds.map((value) => Number(value)),
      });
      setMessage('Task created');
      setTaskForm((prev) => ({
        ...prev,
        templateId: '',
        opportunityId: '',
        title: '',
        description: '',
        dueDate: '',
        assignedTo: '',
        recurrenceType: 'NONE',
        recurrenceIntervalDays: '',
        dependencyIds: [],
      }));
      await Promise.all([loadTasks(), loadSummary(), loadCustomers(), loadCommunicationCenter()]);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create task');
    }
  }

  async function updateTask(taskId, patch) {
    try {
      await api.put(`/crm/tasks/${taskId}`, patch);
      await Promise.all([loadTasks(), loadSummary(), loadCustomers(), loadCommunicationCenter()]);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update task');
    }
  }

  async function createTaskTemplate() {
    try {
      if (!taskTemplateForm.name.trim() || !taskTemplateForm.title.trim()) {
        setMessage('Task template name and title are required');
        return;
      }
      await api.post('/crm/tasks/templates', {
        ...taskTemplateForm,
        defaultDueInDays: Number(taskTemplateForm.defaultDueInDays || 0),
        defaultRecurrenceIntervalDays: Number(taskTemplateForm.defaultRecurrenceIntervalDays || 0),
      });
      setTaskTemplateForm({
        name: '',
        title: '',
        description: '',
        priority: 'MEDIUM',
        defaultDueInDays: 1,
        defaultRecurrenceType: 'NONE',
        defaultRecurrenceIntervalDays: 0,
      });
      await loadEngagement();
      setMessage('Task template created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create task template');
    }
  }

  async function createCase(event) {
    event.preventDefault();
    try {
      if (!caseForm.accountId || !caseForm.subject.trim()) {
        setMessage('Account and case subject are required');
        return;
      }
      await api.post('/crm/cases', {
        accountId: Number(caseForm.accountId),
        opportunityId: caseForm.opportunityId ? Number(caseForm.opportunityId) : null,
        subject: caseForm.subject,
        description: caseForm.description,
        caseType: caseForm.caseType,
        priority: caseForm.priority,
        status: caseForm.status,
        origin: caseForm.origin,
        dueAt: caseForm.dueAt || null,
        assignedTo: caseForm.assignedTo ? Number(caseForm.assignedTo) : null,
        rootCauseCode: caseForm.rootCauseCode || null,
        resolutionCode: caseForm.resolutionCode || null,
        businessImpact: caseForm.businessImpact || null,
        reportedOrderId: caseForm.reportedOrderId ? Number(caseForm.reportedOrderId) : null,
        nextAction: caseForm.nextAction || null,
        nextActionDueAt: caseForm.nextActionDueAt || null,
        serviceChannel: caseForm.serviceChannel || 'MANUAL',
      });
      setCaseForm((prev) => ({
        ...prev,
        opportunityId: '',
        subject: '',
        description: '',
        dueAt: '',
        assignedTo: '',
        rootCauseCode: '',
        resolutionCode: '',
        businessImpact: '',
        reportedOrderId: '',
        nextAction: '',
        nextActionDueAt: '',
        serviceChannel: 'MANUAL',
      }));
      setMessage('Case created');
      await Promise.all([loadCases(), loadSummary(), loadNotifications()]);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create case');
    }
  }

  async function updateCase(caseId, patch) {
    try {
      await api.put(`/crm/cases/${caseId}`, patch);
      await Promise.all([loadCases(), selectedCaseId === caseId ? loadCaseComments(caseId) : Promise.resolve()]);
      setMessage('Case updated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update case');
    }
  }

  async function addCaseComment() {
    try {
      if (!selectedCaseId || !caseCommentInput.trim()) {
        setMessage('Select a case and enter a comment');
        return;
      }
      await api.post(`/crm/cases/${selectedCaseId}/comments`, {
        commentText: caseCommentInput,
        isInternal: true,
      });
      setCaseCommentInput('');
      await loadCaseComments(selectedCaseId);
      setMessage('Case comment added');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to add case comment');
    }
  }

  async function createContact(event) {
    event.preventDefault();
    try {
      if (!contactForm.accountId || !contactForm.firstName.trim()) {
        setMessage('Account and first name are required');
        return;
      }
      await api.post('/crm/contacts', {
        accountId: Number(contactForm.accountId),
        firstName: contactForm.firstName,
        lastName: contactForm.lastName,
        email: contactForm.email,
        phone: contactForm.phone,
        alternateEmail: contactForm.alternateEmail,
        alternatePhone: contactForm.alternatePhone,
        title: contactForm.title,
        department: contactForm.department,
        isPrimary: Boolean(contactForm.isPrimary),
        status: contactForm.status,
        notes: contactForm.notes,
        ownerId: contactForm.ownerId ? Number(contactForm.ownerId) : null,
        preferredChannel: contactForm.preferredChannel,
        decisionRole: contactForm.decisionRole,
        influenceLevel: contactForm.influenceLevel,
        relationshipStrength: contactForm.relationshipStrength,
        reportsToContactId: contactForm.reportsToContactId ? Number(contactForm.reportsToContactId) : null,
        verificationStatus: contactForm.verificationStatus,
        doNotContact: Boolean(contactForm.doNotContact),
        whatsappOptIn: Boolean(contactForm.whatsappOptIn),
      });
      setContactForm((prev) => ({
        ...prev,
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        alternateEmail: '',
        alternatePhone: '',
        title: '',
        department: '',
        isPrimary: false,
        status: 'ACTIVE',
        notes: '',
        ownerId: '',
        preferredChannel: 'PHONE',
        decisionRole: '',
        influenceLevel: 'MEDIUM',
        relationshipStrength: 'WARM',
        reportsToContactId: '',
        verificationStatus: 'UNVERIFIED',
        doNotContact: false,
        whatsappOptIn: false,
      }));
      await loadContacts();
      setMessage('Contact created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create contact');
    }
  }

  async function createCampaign(event) {
    event.preventDefault();
    try {
      if (!campaignForm.name.trim()) {
        setMessage('Campaign name is required');
        return;
      }
      await api.post('/crm/campaigns', {
        name: campaignForm.name,
        type: campaignForm.type,
        status: campaignForm.status,
        budget: Number(campaignForm.budget || 0),
        expectedRevenue: Number(campaignForm.expectedRevenue || 0),
      });
      setCampaignForm({ name: '', type: 'GENERAL', status: 'PLANNED', budget: '', expectedRevenue: '' });
      await loadCampaigns();
      setMessage('Campaign created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create campaign');
    }
  }

  async function createProduct(event) {
    event.preventDefault();
    try {
      if (!productForm.sku.trim() || !productForm.name.trim()) {
        setMessage('SKU and product name are required');
        return;
      }
      await api.post('/crm/catalog/products', {
        sku: productForm.sku,
        name: productForm.name,
        family: productForm.family,
        unitPrice: Number(productForm.unitPrice || 0),
        costPrice: Number(productForm.costPrice || 0),
      });
      setProductForm({ sku: '', name: '', family: '', unitPrice: '', costPrice: '' });
      await loadCatalog();
      setMessage('Product created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create product');
    }
  }

  async function createPriceBook(event) {
    event.preventDefault();
    try {
      if (!priceBookForm.name.trim()) {
        setMessage('Price book name is required');
        return;
      }
      await api.post('/crm/catalog/price-books', {
        name: priceBookForm.name,
        currencyCode: priceBookForm.currencyCode,
      });
      setPriceBookForm({ name: '', currencyCode: 'USD' });
      await loadCatalog();
      setMessage('Price book created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create price book');
    }
  }

  async function createQuote(event) {
    event.preventDefault();
    try {
      if (!quoteForm.accountId) {
        setMessage('Account is required for quote');
        return;
      }
      await api.post('/crm/quotes', {
        accountId: Number(quoteForm.accountId),
        opportunityId: quoteForm.opportunityId ? Number(quoteForm.opportunityId) : null,
        priceBookId: quoteForm.priceBookId ? Number(quoteForm.priceBookId) : null,
        validUntil: quoteForm.validUntil || null,
        notes: quoteForm.notes || '',
        ownerId: quoteForm.ownerId ? Number(quoteForm.ownerId) : null,
      });
      setQuoteForm({ accountId: '', opportunityId: '', priceBookId: '', validUntil: '', notes: '', ownerId: '' });
      await loadQuotes();
      setMessage('Quote created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create quote');
    }
  }

  async function addQuoteLine(event) {
    event.preventDefault();
    try {
      if (!quoteLineForm.quoteId || !quoteLineForm.lineName.trim()) {
        setMessage('Quote and line name are required');
        return;
      }
      await api.post(`/crm/quotes/${quoteLineForm.quoteId}/lines`, {
        productId: quoteLineForm.productId ? Number(quoteLineForm.productId) : null,
        lineName: quoteLineForm.lineName,
        quantity: Number(quoteLineForm.quantity || 1),
        unitPrice: Number(quoteLineForm.unitPrice || 0),
        discountPercent: Number(quoteLineForm.discountPercent || 0),
      });
      setQuoteLineForm((prev) => ({ ...prev, productId: '', lineName: '', quantity: 1, unitPrice: 0, discountPercent: 0 }));
      await loadQuotes();
      setMessage('Quote line added');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to add quote line');
    }
  }

  async function createAssignmentRule(event) {
    event.preventDefault();
    try {
      if (!assignmentRuleForm.name.trim()) {
        setMessage('Assignment rule name is required');
        return;
      }
      await api.post('/crm/governance/assignment-rules', {
        name: assignmentRuleForm.name,
        entityType: assignmentRuleForm.entityType,
        criteria: JSON.parse(assignmentRuleForm.criteria || '{}'),
        action: JSON.parse(assignmentRuleForm.action || '{}'),
      });
      setAssignmentRuleForm({ name: '', entityType: 'CASE', criteria: '{}', action: '{}' });
      await loadGovernance();
      setMessage('Assignment rule created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create assignment rule');
    }
  }

  async function createSlaPolicy(event) {
    event.preventDefault();
    try {
      if (!slaForm.name.trim()) {
        setMessage('SLA policy name is required');
        return;
      }
      await api.post('/crm/governance/sla-policies', {
        name: slaForm.name,
        entityType: slaForm.entityType,
        priority: slaForm.priority,
        firstResponseMinutes: Number(slaForm.firstResponseMinutes || 60),
        resolutionMinutes: Number(slaForm.resolutionMinutes || 1440),
      });
      setSlaForm({ name: '', entityType: 'CASE', priority: 'MEDIUM', firstResponseMinutes: 60, resolutionMinutes: 1440 });
      await loadGovernance();
      setMessage('SLA policy created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create SLA policy');
    }
  }

  async function createKnowledgeArticle(event) {
    event.preventDefault();
    try {
      if (!articleForm.title.trim() || !articleForm.bodyMarkdown.trim()) {
        setMessage('Article title and body are required');
        return;
      }
      await api.post('/crm/knowledge/articles', {
        title: articleForm.title,
        summary: articleForm.summary,
        bodyMarkdown: articleForm.bodyMarkdown,
        category: articleForm.category,
        status: articleForm.status,
      });
      setArticleForm({ title: '', summary: '', bodyMarkdown: '', category: 'GENERAL', status: 'DRAFT' });
      await loadKnowledge();
      setMessage('Knowledge article created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create knowledge article');
    }
  }

  async function createEntitlement(event) {
    event.preventDefault();
    try {
      if (!entitlementForm.accountId || !entitlementForm.planName.trim() || !entitlementForm.startDate) {
        setMessage('Account, plan name, and start date are required');
        return;
      }
      await api.post('/crm/service/entitlements', {
        accountId: Number(entitlementForm.accountId),
        planName: entitlementForm.planName,
        tier: entitlementForm.tier,
        startDate: entitlementForm.startDate,
        endDate: entitlementForm.endDate || null,
        firstResponseTargetMinutes: Number(entitlementForm.firstResponseTargetMinutes || 120),
        resolutionTargetMinutes: Number(entitlementForm.resolutionTargetMinutes || 2880),
      });
      setEntitlementForm((prev) => ({ ...prev, planName: '', startDate: '', endDate: '' }));
      await loadEntitlements();
      setMessage('Entitlement created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create entitlement');
    }
  }

  async function createMilestone(event) {
    event.preventDefault();
    try {
      if (!milestoneForm.caseId || !milestoneForm.milestoneName.trim() || !milestoneForm.targetAt) {
        setMessage('Case, milestone name, and target date are required');
        return;
      }
      await api.post('/crm/service/milestones', {
        caseId: Number(milestoneForm.caseId),
        entitlementId: milestoneForm.entitlementId ? Number(milestoneForm.entitlementId) : null,
        milestoneName: milestoneForm.milestoneName,
        targetAt: milestoneForm.targetAt,
      });
      setMilestoneForm({ caseId: '', entitlementId: '', milestoneName: '', targetAt: '' });
      await loadEntitlements();
      setMessage('Case milestone created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create milestone');
    }
  }

  async function markMilestoneComplete(milestoneId) {
    try {
      await api.put(`/crm/service/milestones/${milestoneId}/status`, { status: 'COMPLETED' });
      await loadEntitlements();
      setMessage('Milestone marked completed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update milestone');
    }
  }

  async function createTerritory(event) {
    event.preventDefault();
    try {
      if (!territoryForm.name.trim()) {
        setMessage('Territory name is required');
        return;
      }
      await api.post('/crm/territories', {
        name: territoryForm.name,
        regionCode: territoryForm.regionCode,
        description: territoryForm.description,
        managerUserId: territoryForm.managerUserId ? Number(territoryForm.managerUserId) : null,
      });
      setTerritoryForm({ name: '', regionCode: '', description: '', managerUserId: '' });
      await loadTerritories();
      setMessage('Territory created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create territory');
    }
  }

  async function assignTerritory(event) {
    event.preventDefault();
    try {
      if (!territoryAssignmentForm.territoryId || !territoryAssignmentForm.accountId) {
        setMessage('Territory and account are required');
        return;
      }
      await api.post(`/crm/territories/${territoryAssignmentForm.territoryId}/assignments`, {
        accountId: Number(territoryAssignmentForm.accountId),
      });
      setTerritoryAssignmentForm({ territoryId: '', accountId: '' });
      await loadTerritories();
      setMessage('Account assigned to territory');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to assign territory');
    }
  }

  async function createSubscription(event) {
    event.preventDefault();
    try {
      if (!subscriptionForm.reportName.trim()) {
        setMessage('Report name is required');
        return;
      }
      await api.post('/crm/analytics/subscriptions', {
        reportName: subscriptionForm.reportName,
        subscriberUserId: subscriptionForm.subscriberUserId ? Number(subscriptionForm.subscriberUserId) : null,
        scheduleType: subscriptionForm.scheduleType,
        deliveryChannel: subscriptionForm.deliveryChannel,
      });
      setSubscriptionForm({ reportName: '', subscriberUserId: '', scheduleType: 'WEEKLY', deliveryChannel: 'IN_APP' });
      await loadSubscriptions();
      setMessage('Report subscription created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create subscription');
    }
  }

  async function createWebhook(event) {
    event.preventDefault();
    try {
      if (!webhookForm.name.trim() || !webhookForm.targetUrl.trim()) {
        setMessage('Webhook name and target URL are required');
        return;
      }
      await api.post('/crm/integrations/webhooks', {
        name: webhookForm.name,
        targetUrl: webhookForm.targetUrl,
        eventTypes: webhookForm.eventTypes.split(',').map((token) => token.trim()).filter(Boolean),
        retryLimit: Number(webhookForm.retryLimit || 3),
      });
      setWebhookForm({ name: '', targetUrl: '', eventTypes: 'opportunity.created,case.updated', retryLimit: 3 });
      await loadWebhooks();
      setMessage('Webhook registered');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create webhook');
    }
  }

  async function createCustomObject(event) {
    event.preventDefault();
    try {
      if (!objectForm.apiName.trim() || !objectForm.label.trim() || !objectForm.pluralLabel.trim()) {
        setMessage('API name, label, and plural label are required');
        return;
      }
      await api.post('/crm/platform/object-manager/objects', objectForm);
      setObjectForm({ apiName: '', label: '', pluralLabel: '', sharingModel: 'PRIVATE', deploymentStatus: 'DEPLOYED' });
      await loadObjectManager();
      setMessage('Custom object created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create custom object');
    }
  }

  async function createCustomField(event) {
    event.preventDefault();
    try {
      if (!fieldForm.objectId || !fieldForm.apiName.trim() || !fieldForm.label.trim()) {
        setMessage('Object, API name, and label are required');
        return;
      }
      await api.post('/crm/platform/object-manager/fields', {
        objectId: Number(fieldForm.objectId),
        apiName: fieldForm.apiName,
        label: fieldForm.label,
        dataType: fieldForm.dataType,
      });
      setFieldForm({ objectId: '', apiName: '', label: '', dataType: 'TEXT' });
      await loadObjectManager();
      setMessage('Custom field created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create custom field');
    }
  }

  async function createRecordType(event) {
    event.preventDefault();
    try {
      if (!recordTypeForm.objectId || !recordTypeForm.developerName.trim() || !recordTypeForm.label.trim()) {
        setMessage('Object, developer name, and label are required');
        return;
      }
      await api.post('/crm/platform/object-manager/record-types', {
        objectId: Number(recordTypeForm.objectId),
        developerName: recordTypeForm.developerName,
        label: recordTypeForm.label,
      });
      setRecordTypeForm({ objectId: '', developerName: '', label: '' });
      await loadObjectManager();
      setMessage('Record type created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create record type');
    }
  }

  async function createPageLayout(event) {
    event.preventDefault();
    try {
      if (!layoutForm.objectId || !layoutForm.layoutName.trim()) {
        setMessage('Object and layout name are required');
        return;
      }
      await api.post('/crm/platform/object-manager/layouts', {
        objectId: Number(layoutForm.objectId),
        layoutName: layoutForm.layoutName,
        sections: JSON.parse(layoutForm.sections || '[]'),
      });
      setLayoutForm({ objectId: '', layoutName: '', sections: '[{"name":"Main","fields":[]}]' });
      await loadObjectManager();
      setMessage('Page layout created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create page layout');
    }
  }

  async function createRoleNode(event) {
    event.preventDefault();
    try {
      if (!roleNodeForm.roleName.trim()) {
        setMessage('Role name is required');
        return;
      }
      await api.post('/crm/platform/security-model/roles', {
        roleName: roleNodeForm.roleName,
        parentRoleId: roleNodeForm.parentRoleId ? Number(roleNodeForm.parentRoleId) : null,
        ownerUserId: roleNodeForm.ownerUserId ? Number(roleNodeForm.ownerUserId) : null,
      });
      setRoleNodeForm({ roleName: '', parentRoleId: '', ownerUserId: '' });
      await loadSecurityModel();
      setMessage('Role hierarchy node created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create role node');
    }
  }

  async function saveOrgWideDefault(event) {
    event.preventDefault();
    try {
      await api.post('/crm/platform/security-model/owd', owdForm);
      await loadSecurityModel();
      setMessage('Org-wide default updated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update OWD');
    }
  }

  async function createSharingRule(event) {
    event.preventDefault();
    try {
      if (!sharingRuleForm.ruleName.trim() || !sharingRuleForm.targetIdentifier.trim()) {
        setMessage('Rule name and target identifier are required');
        return;
      }
      await api.post('/crm/platform/security-model/sharing-rules', {
        objectName: sharingRuleForm.objectName,
        ruleName: sharingRuleForm.ruleName,
        criteria: JSON.parse(sharingRuleForm.criteria || '{}'),
        grantAccess: sharingRuleForm.grantAccess,
        targetScope: sharingRuleForm.targetScope,
        targetIdentifier: sharingRuleForm.targetIdentifier,
      });
      setSharingRuleForm({ objectName: 'ACCOUNT', ruleName: '', criteria: '{}', grantAccess: 'READ', targetScope: 'ROLE', targetIdentifier: '' });
      await loadSecurityModel();
      setMessage('Sharing rule created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create sharing rule');
    }
  }

  async function createBundle(event) {
    event.preventDefault();
    try {
      if (!bundleForm.bundleName.trim() || !bundleForm.bundleCode.trim()) {
        setMessage('Bundle name and code are required');
        return;
      }
      await api.post('/crm/cpq/bundles', {
        bundleName: bundleForm.bundleName,
        bundleCode: bundleForm.bundleCode,
        basePrice: Number(bundleForm.basePrice || 0),
      });
      setBundleForm({ bundleName: '', bundleCode: '', basePrice: 0 });
      await loadCpqDesigner();
      setMessage('Bundle created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create bundle');
    }
  }

  async function addBundleItem(event) {
    event.preventDefault();
    try {
      if (!bundleItemForm.bundleId || !bundleItemForm.productId) {
        setMessage('Bundle and product are required');
        return;
      }
      await api.post(`/crm/cpq/bundles/${bundleItemForm.bundleId}/items`, {
        productId: Number(bundleItemForm.productId),
        quantity: Number(bundleItemForm.quantity || 1),
      });
      setBundleItemForm({ bundleId: '', productId: '', quantity: 1 });
      await loadCpqDesigner();
      setMessage('Bundle item added');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to add bundle item');
    }
  }

  async function createPricingRule(event) {
    event.preventDefault();
    try {
      if (!pricingRuleForm.ruleName.trim()) {
        setMessage('Pricing rule name is required');
        return;
      }
      await api.post('/crm/cpq/pricing-rules', {
        ruleName: pricingRuleForm.ruleName,
        scope: pricingRuleForm.scope,
        priority: Number(pricingRuleForm.priority || 100),
        condition: JSON.parse(pricingRuleForm.condition || '{}'),
        action: JSON.parse(pricingRuleForm.action || '{}'),
      });
      setPricingRuleForm({ ruleName: '', scope: 'QUOTE_LINE', priority: 100, condition: '{}', action: '{}' });
      await loadCpqDesigner();
      setMessage('Pricing rule created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create pricing rule');
    }
  }

  async function createDiscountSchedule(event) {
    event.preventDefault();
    try {
      if (!discountScheduleForm.scheduleName.trim() || !discountScheduleForm.targetId) {
        setMessage('Schedule name and target id are required');
        return;
      }
      await api.post('/crm/cpq/discount-schedules', {
        scheduleName: discountScheduleForm.scheduleName,
        appliesTo: discountScheduleForm.appliesTo,
        targetId: Number(discountScheduleForm.targetId),
        tiers: JSON.parse(discountScheduleForm.tiers || '[]'),
      });
      setDiscountScheduleForm({ scheduleName: '', appliesTo: 'PRODUCT', targetId: '', tiers: '[{"min":1,"max":10,"discountPercent":5}]' });
      await loadCpqDesigner();
      setMessage('Discount schedule created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create discount schedule');
    }
  }

  async function requestQuoteApproval(event) {
    event.preventDefault();
    try {
      if (!quoteApprovalForm.quoteId) {
        setMessage('Quote is required');
        return;
      }
      await api.post('/crm/cpq/quote-approvals', {
        quoteId: Number(quoteApprovalForm.quoteId),
        thresholdPercent: Number(quoteApprovalForm.thresholdPercent || 0),
        approverId: quoteApprovalForm.approverId ? Number(quoteApprovalForm.approverId) : null,
      });
      setQuoteApprovalForm({ quoteId: '', thresholdPercent: 0, approverId: '' });
      await loadCpqDesigner();
      setMessage('Quote approval requested');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to request quote approval');
    }
  }

  async function decideQuoteApproval(approvalId, status) {
    try {
      await api.put(`/crm/cpq/quote-approvals/${approvalId}`, { status });
      await loadCpqDesigner();
      setMessage(`Quote approval marked ${status}`);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update quote approval');
    }
  }

  async function createFlow(event) {
    event.preventDefault();
    try {
      if (!flowForm.flowName.trim()) {
        setMessage('Flow name is required');
        return;
      }
      await api.post('/crm/platform/flows', {
        flowName: flowForm.flowName,
        flowType: flowForm.flowType,
        triggerObject: flowForm.triggerObject,
        triggerEvent: flowForm.triggerEvent,
        definition: JSON.parse(flowForm.definition || '{}'),
      });
      setFlowForm({ flowName: '', flowType: 'RECORD_TRIGGERED', triggerObject: 'CASE', triggerEvent: 'UPDATE', definition: '{"if":{"priority":"HIGH"},"then":{"action":"notify"}}' });
      await loadFlows();
      setMessage('Flow created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create flow');
    }
  }

  async function simulateFlow(event) {
    event.preventDefault();
    try {
      if (!flowRunForm.flowId) {
        setMessage('Flow is required for simulation');
        return;
      }
      await api.post(`/crm/platform/flows/${flowRunForm.flowId}/simulate`, {
        context: JSON.parse(flowRunForm.context || '{}'),
      });
      setFlowRunForm((prev) => ({ ...prev, context: '{"recordId":1}' }));
      await loadFlows();
      setMessage('Flow simulation completed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to simulate flow');
    }
  }

  async function createQueue(event) {
    event.preventDefault();
    try {
      if (!queueForm.queueName.trim()) {
        setMessage('Queue name is required');
        return;
      }
      await api.post('/crm/service/omnichannel/queues', queueForm);
      setQueueForm({ queueName: '', channelType: 'CASE', priorityModel: 'SLA_FIRST' });
      await loadOmnichannel();
      setMessage('Queue created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create queue');
    }
  }

  async function saveSkill(event) {
    event.preventDefault();
    try {
      if (!skillForm.userId || !skillForm.skillName.trim()) {
        setMessage('User and skill name are required');
        return;
      }
      await api.post('/crm/service/omnichannel/skills', {
        userId: Number(skillForm.userId),
        skillName: skillForm.skillName,
        proficiency: Number(skillForm.proficiency || 3),
      });
      setSkillForm({ userId: '', skillName: '', proficiency: 3 });
      await loadOmnichannel();
      setMessage('Agent skill saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save skill');
    }
  }

  async function saveQueueMember(event) {
    event.preventDefault();
    try {
      if (!queueMemberForm.queueId || !queueMemberForm.userId) {
        setMessage('Queue and user are required');
        return;
      }
      await api.post(`/crm/service/omnichannel/queues/${queueMemberForm.queueId}/members`, {
        userId: Number(queueMemberForm.userId),
        capacity: Number(queueMemberForm.capacity || 5),
        presenceStatus: queueMemberForm.presenceStatus,
      });
      setQueueMemberForm({ queueId: '', userId: '', capacity: 5, presenceStatus: 'AVAILABLE' });
      await loadOmnichannel();
      setMessage('Queue member saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save queue member');
    }
  }

  async function createWorkItem(event) {
    event.preventDefault();
    try {
      if (!workItemForm.subject.trim()) {
        setMessage('Work item subject is required');
        return;
      }
      await api.post('/crm/service/omnichannel/work-items', {
        channelType: workItemForm.channelType,
        subject: workItemForm.subject,
        priority: workItemForm.priority,
        requiredSkills: workItemForm.requiredSkills.split(',').map((token) => token.trim()).filter(Boolean),
        assignedQueueId: workItemForm.assignedQueueId ? Number(workItemForm.assignedQueueId) : null,
      });
      setWorkItemForm({ channelType: 'CASE', subject: '', priority: 'MEDIUM', requiredSkills: '', assignedQueueId: '' });
      await loadOmnichannel();
      setMessage('Work item created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create work item');
    }
  }

  async function routeWorkItem(event) {
    event.preventDefault();
    try {
      if (!routeForm.workItemId) {
        setMessage('Work item is required');
        return;
      }
      await api.put(`/crm/service/omnichannel/work-items/${routeForm.workItemId}/route`, {
        assignedQueueId: routeForm.assignedQueueId ? Number(routeForm.assignedQueueId) : null,
        assignedUserId: routeForm.assignedUserId ? Number(routeForm.assignedUserId) : null,
        status: 'ROUTED',
      });
      setRouteForm({ workItemId: '', assignedQueueId: '', assignedUserId: '' });
      await loadOmnichannel();
      setMessage('Work item routed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to route work item');
    }
  }

  async function installApp(appId) {
    try {
      await api.post(`/crm/platform/marketplace/apps/${appId}/install`);
      await loadMarketplace();
      setMessage('App installed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to install app');
    }
  }

  async function updateInstalledApp(event) {
    event.preventDefault();
    try {
      if (!installedUpdateForm.installedId) {
        setMessage('Installed app selection is required');
        return;
      }
      await api.put(`/crm/platform/marketplace/installed/${installedUpdateForm.installedId}`, {
        status: installedUpdateForm.status,
        config: JSON.parse(installedUpdateForm.config || '{}'),
      });
      await loadMarketplace();
      setMessage('Installed app updated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update installed app');
    }
  }

  async function createValidationRule(event) {
    event.preventDefault();
    try {
      if (!validationRuleForm.ruleName.trim() || !validationRuleForm.errorMessage.trim()) {
        setMessage('Rule name and error message are required');
        return;
      }
      await api.post('/crm/platform/runtime/validation-rules', validationRuleForm);
      setValidationRuleForm((prev) => ({ ...prev, ruleName: '', errorMessage: '' }));
      await loadRuntime();
      setMessage('Validation rule created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create validation rule');
    }
  }

  async function createFormulaField(event) {
    event.preventDefault();
    try {
      if (!formulaFieldForm.fieldName.trim()) {
        setMessage('Formula field name is required');
        return;
      }
      await api.post('/crm/platform/runtime/formula-fields', formulaFieldForm);
      setFormulaFieldForm((prev) => ({ ...prev, fieldName: '' }));
      await loadRuntime();
      setMessage('Formula field created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create formula field');
    }
  }

  async function createRuntimeRecord(event) {
    event.preventDefault();
    try {
      await api.post('/crm/platform/runtime/records', {
        objectApiName: runtimeRecordForm.objectApiName,
        recordData: JSON.parse(runtimeRecordForm.recordData || '{}'),
      });
      await loadRuntime();
      setMessage('Runtime record created with validations/formulas');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create runtime record');
    }
  }

  async function publishFlow(flowId) {
    try {
      await api.post(`/crm/platform/flows/${flowId}/publish`);
      await loadFlows();
      setMessage('Flow version published');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to publish flow');
    }
  }

  async function debugSelectedFlow(flowId) {
    try {
      await api.post(`/crm/platform/flows/${flowId}/debug`, { context: { recordId: selectedId || null } });
      const { data } = await api.get(`/crm/platform/flows/${flowId}/debug-traces`);
      setFlowDebugTraces(data.traces || []);
      await loadFlows();
      setMessage('Flow debug trace generated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to debug flow');
    }
  }

  async function previewPricing(event) {
    event.preventDefault();
    try {
      const { data } = await api.post('/crm/cpq/engine/pricing/preview', {
        productId: pricingPreviewForm.productId ? Number(pricingPreviewForm.productId) : null,
        quantity: Number(pricingPreviewForm.quantity || 1),
        unitPrice: Number(pricingPreviewForm.unitPrice || 0),
        manualDiscountPercent: Number(pricingPreviewForm.manualDiscountPercent || 0),
      });
      setPricingPreview(data.preview || null);
      setMessage('Pricing preview generated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to preview pricing');
    }
  }

  async function runRoutingEngine(event) {
    event.preventDefault();
    try {
      if (!routingEngineForm.workItemId) {
        setMessage('Work item is required');
        return;
      }
      const { data } = await api.post('/crm/service/omnichannel/engine/route', {
        workItemId: Number(routingEngineForm.workItemId),
      });
      setRoutingEngineResult(data.result || null);
      await loadOmnichannel();
      setMessage('Routing engine assignment completed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run routing engine');
    }
  }

  async function createOpsJob(event) {
    event.preventDefault();
    try {
      if (!opsJobForm.jobName.trim()) {
        setMessage('Job name is required');
        return;
      }
      await api.post('/crm/platform/ops/jobs', {
        jobName: opsJobForm.jobName,
        jobType: opsJobForm.jobType,
        scheduleCron: opsJobForm.scheduleCron,
        config: JSON.parse(opsJobForm.config || '{}'),
      });
      setOpsJobForm({ jobName: '', jobType: 'SHARING_RECALC', scheduleCron: '0 1 * * *', config: '{"scope":"all"}' });
      await loadOpsCenter();
      setMessage('Ops job created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create ops job');
    }
  }

  async function runOpsJob(jobId) {
    try {
      await api.post(`/crm/platform/ops/jobs/${jobId}/run`);
      await loadOpsCenter();
      setMessage('Ops job run completed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run ops job');
    }
  }

  async function submitPackageReview(event) {
    event.preventDefault();
    try {
      if (!packageReviewForm.appId) {
        setMessage('App is required');
        return;
      }
      await api.post(`/crm/platform/packages/${packageReviewForm.appId}/security-review`, {
        reviewStatus: packageReviewForm.reviewStatus,
        findings: JSON.parse(packageReviewForm.findings || '[]'),
      });
      setPackageReviewForm({ appId: '', reviewStatus: 'APPROVED', findings: '[]' });
      await loadPackageLifecycle();
      setMessage('Package security review saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to submit package review');
    }
  }

  async function addPackageDependency(event) {
    event.preventDefault();
    try {
      if (!packageDependencyForm.appId || !packageDependencyForm.dependencyAppId) {
        setMessage('App and dependency are required');
        return;
      }
      await api.post('/crm/platform/packages/dependencies', {
        appId: Number(packageDependencyForm.appId),
        dependencyAppId: Number(packageDependencyForm.dependencyAppId),
        minimumVersion: packageDependencyForm.minimumVersion,
      });
      setPackageDependencyForm({ appId: '', dependencyAppId: '', minimumVersion: '1.0.0' });
      await loadPackageLifecycle();
      setMessage('Dependency saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to add dependency');
    }
  }

  async function upgradeInstalledPackage(event) {
    event.preventDefault();
    try {
      if (!packageVersionForm.installedId) {
        setMessage('Installed package is required');
        return;
      }
      await api.put(`/crm/platform/packages/installed/${packageVersionForm.installedId}/upgrade`, {
        targetVersion: packageVersionForm.targetVersion,
      });
      await loadPackageLifecycle();
      setMessage('Installed package upgraded');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to upgrade package');
    }
  }

  async function uninstallPackage(installedId) {
    try {
      await api.put(`/crm/platform/packages/installed/${installedId}/uninstall`);
      await loadPackageLifecycle();
      setMessage('Package uninstalled');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to uninstall package');
    }
  }

  async function createDeployment(event) {
    event.preventDefault();
    try {
      if (!deploymentForm.deploymentName.trim()) {
        setMessage('Deployment name is required');
        return;
      }
      await api.post('/crm/platform/deployments', {
        deploymentName: deploymentForm.deploymentName,
        sourceEnv: deploymentForm.sourceEnv,
        targetEnv: deploymentForm.targetEnv,
        items: JSON.parse(deploymentForm.items || '[]'),
      });
      setDeploymentForm((prev) => ({ ...prev, deploymentName: '' }));
      await loadDeploymentCenter();
      setMessage('Deployment package created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create deployment');
    }
  }

  async function runDeployment(deploymentId) {
    try {
      await api.post(`/crm/platform/deployments/${deploymentId}/run`);
      await loadDeploymentCenter();
      setMessage('Deployment executed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run deployment');
    }
  }

  async function saveCanvas(event) {
    event.preventDefault();
    try {
      if (!canvasFlowId) {
        setMessage('Flow is required');
        return;
      }
      await api.post(`/crm/platform/flows/${canvasFlowId}/canvas`, {
        nodes: JSON.parse(canvasNodesJson || '[]'),
        edges: JSON.parse(canvasEdgesJson || '[]'),
      });
      await loadFlowCanvas(canvasFlowId);
      setMessage('Flow canvas saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save canvas');
    }
  }

  async function openCanvas(flowId) {
    try {
      setCanvasFlowId(String(flowId));
      await loadFlowCanvas(flowId);
      setMessage('Flow canvas loaded');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to load flow canvas');
    }
  }

  async function createSavedView() {
    try {
      const name = viewNameInput.trim();
      if (!name) {
        setMessage('View name is required');
        return;
      }
      const { data } = await api.post('/crm/views', {
        moduleName: 'CRM',
        viewName: name,
        scope: viewScope,
        definition: currentViewDefinition,
      });
      setSavedViews((prev) => [data.view, ...prev]);
      setSelectedViewId(String(data.view.id));
      setMessage('Saved view created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save view');
    }
  }

  async function updateSavedView() {
    try {
      if (!selectedViewId) {
        setMessage('Select a saved view to update');
        return;
      }
      const { data } = await api.put(`/crm/views/${selectedViewId}`, {
        viewName: viewNameInput.trim() || undefined,
        scope: viewScope,
        definition: currentViewDefinition,
      });
      setSavedViews((prev) => prev.map((view) => (String(view.id) === String(selectedViewId) ? data.view : view)));
      setMessage('Saved view updated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update view');
    }
  }

  async function deleteSavedView() {
    try {
      if (!selectedViewId) {
        setMessage('Select a saved view to delete');
        return;
      }
      await api.delete(`/crm/views/${selectedViewId}`);
      setSavedViews((prev) => prev.filter((view) => String(view.id) !== String(selectedViewId)));
      setSelectedViewId('');
      setViewNameInput('');
      setViewScope('PRIVATE');
      setMessage('Saved view deleted');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to delete view');
    }
  }

  function selectSavedView(viewId) {
    setSelectedViewId(viewId);
    const selected = savedViews.find((view) => String(view.id) === String(viewId));
    if (!selected) return;
    setViewNameInput(selected.view_name || '');
    setViewScope(selected.scope || 'PRIVATE');
    applySavedViewDefinition(selected.definition);
    setMessage(`Applied view: ${selected.view_name}`);
  }

  function applyQuickPreset(preset) {
    if (preset === 'overdue_tasks') {
      applySavedViewDefinition({
        workspaceTab: 'tasks',
        taskFilters: { search: '', status: 'OPEN', priority: '', dueBucket: 'OVERDUE', assignedToMe: 'false' },
      });
      return;
    }
    if (preset === 'my_today_tasks') {
      applySavedViewDefinition({
        workspaceTab: 'tasks',
        taskFilters: { search: '', status: 'OPEN', priority: '', dueBucket: 'TODAY', assignedToMe: 'true' },
      });
      return;
    }
    if (preset === 'high_value_pipeline') {
      applySavedViewDefinition({
        workspaceTab: 'opportunities',
        opportunityFilters: { search: '', stage: '', status: 'OPEN' },
      });
      return;
    }
    if (preset === 'blocked_accounts') {
      applySavedViewDefinition({
        workspaceTab: 'accounts',
        activeTab: 'overview',
        filters: { search: '', status: 'BLOCKED', outlet: filters.outlet || '' },
      });
    }
  }

  async function markNotificationRead(notificationId) {
    try {
      await api.put(`/crm/notifications/${notificationId}/read`);
      await loadNotifications();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to mark notification read');
    }
  }

  async function markAllNotificationsRead() {
    try {
      await api.put('/crm/notifications/read-all');
      await loadNotifications();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to mark all notifications read');
    }
  }

  async function saveShare() {
    try {
      if (!selectedId || !shareForm.userId) {
        setMessage('Select account and user to add share');
        return;
      }
      await api.post(`/crm/customers/${selectedId}/shares`, {
        userId: Number(shareForm.userId),
        accessLevel: shareForm.accessLevel,
      });
      setShareForm({ userId: '', accessLevel: 'VIEW' });
      await loadShares(selectedId);
      setMessage('Share updated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update share');
    }
  }

  async function removeShare(shareId) {
    try {
      if (!selectedId) return;
      await api.delete(`/crm/customers/${selectedId}/shares/${shareId}`);
      await loadShares(selectedId);
      setMessage('Share removed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to remove share');
    }
  }

  async function toggleAutomationRule(ruleId, isActive) {
    try {
      await api.put(`/crm/automation/rules/${ruleId}`, { isActive });
      await loadAutomation();
      setMessage('Automation rule updated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update automation rule');
    }
  }

  async function convertLead() {
    try {
      if (!selectedId) {
        setMessage('Select an account first');
        return;
      }
      const payload = {
        ...leadConversionForm,
        expectedValue: Number(leadConversionForm.expectedValue || 0),
        ownerId: leadConversionForm.ownerId ? Number(leadConversionForm.ownerId) : null,
        assignedTo: leadConversionForm.assignedTo ? Number(leadConversionForm.assignedTo) : null,
      };
      await api.post(`/crm/leads/${selectedId}/convert`, payload);
      setMessage('Lead converted into opportunity and follow-up task');
      await Promise.all([
        loadCustomers(),
        loadSummary(),
        loadOpportunities(),
        loadTasks(),
        selectedId ? loadDetails(selectedId) : Promise.resolve(),
        loadReports(),
        loadLeadQueue(),
      ]);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to convert lead');
    }
  }

  async function saveLeadWorkbench() {
    if (!selectedLeadId) {
      setMessage('Select a lead first');
      return;
    }
    try {
      await api.put(`/crm/leads/${selectedLeadId}`, {
        leadStage: leadWorkbench.leadStage,
        leadOwnerId: leadWorkbench.leadOwnerId ? Number(leadWorkbench.leadOwnerId) : null,
        leadTemperature: leadWorkbench.leadTemperature,
        leadSourceDetail: leadWorkbench.leadSourceDetail,
        leadQualificationNotes: leadWorkbench.leadQualificationNotes,
        leadDisqualificationReason: leadWorkbench.leadDisqualificationReason,
        leadSlaDueAt: leadWorkbench.leadSlaDueAt || null,
        leadNextAction: leadWorkbench.leadNextAction,
        leadNextActionDueAt: leadWorkbench.leadNextActionDueAt || null,
        leadScore: Number(leadWorkbench.leadScore || 0),
      });
      await Promise.all([loadLeadQueue(), loadCustomers(), selectedId ? loadDetails(selectedId) : Promise.resolve()]);
      setMessage('Lead updated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update lead');
    }
  }

  async function applyLeadStage(stage) {
    if (!selectedLeadId) {
      setMessage('Select a lead first');
      return;
    }
    try {
      await api.put(`/crm/leads/${selectedLeadId}`, {
        leadStage: stage,
        leadOwnerId: leadWorkbench.leadOwnerId ? Number(leadWorkbench.leadOwnerId) : null,
        leadTemperature: leadWorkbench.leadTemperature,
        leadSourceDetail: leadWorkbench.leadSourceDetail,
        leadQualificationNotes: leadWorkbench.leadQualificationNotes,
        leadDisqualificationReason: leadWorkbench.leadDisqualificationReason,
        leadSlaDueAt: leadWorkbench.leadSlaDueAt || null,
        leadNextAction: leadWorkbench.leadNextAction,
        leadNextActionDueAt: leadWorkbench.leadNextActionDueAt || null,
        leadScore: Number(leadWorkbench.leadScore || 0),
      });
      await Promise.all([loadLeadQueue(), loadCustomers(), selectedId ? loadDetails(selectedId) : Promise.resolve()]);
      setMessage(`Lead moved to ${stage}`);
    } catch (error) {
      setMessage(error.response?.data?.message || `Unable to move lead to ${stage}`);
    }
  }

  function openFromSearchAccount(accountId) {
    setSelectedId(accountId);
    goWorkspace('accounts', 'overview');
    setSearchOpen(false);
  }

  function openFromSearchOpportunity(opportunity) {
    if (opportunity?.account_id) setSelectedId(opportunity.account_id);
    goWorkspace('opportunities');
    setSearchOpen(false);
  }

  function openFromSearchTask(task) {
    if (task?.account_id) setSelectedId(task.account_id);
    goWorkspace('tasks');
    setSearchOpen(false);
  }

  function prepareLeadConversion(lead) {
    if (!lead) return;
    setSelectedId(lead.id);
    goWorkspace('accounts', 'overview');
    setLeadConversionForm((prev) => ({
      ...prev,
      opportunityTitle: prev.opportunityTitle || `Conversion: ${lead.customer_number}`,
      expectedValue: prev.expectedValue || '',
    }));
  }

  function getStatusFromStage(stageKey) {
    if (stageKey === 'CLOSED_WON') return 'WON';
    if (stageKey === 'CLOSED_LOST') return 'LOST';
    return 'OPEN';
  }

  function startOpportunityDrag(opportunityId) {
    setDraggedOpportunityId(opportunityId);
  }

  async function dropOpportunityToStage(stageKey) {
    if (!draggedOpportunityId || !stageKey) return;
    const status = getStatusFromStage(stageKey);
    await updateOpportunity(draggedOpportunityId, { stage: stageKey, status });
    setDraggedOpportunityId(null);
    setDragTargetStage('');
  }

  async function decideApproval(approvalId, status) {
    try {
      await api.put(`/crm/approvals/${approvalId}`, { status });
      setMessage(`Approval ${status.toLowerCase()}`);
      await Promise.all([loadApprovals(), loadOpportunities(), loadReports(), loadNotifications()]);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to decide approval');
    }
  }

  async function createTemplate() {
    try {
      if (!templateForm.name.trim() || !templateForm.subjectTemplate.trim() || !templateForm.bodyTemplate.trim()) {
        setMessage('Template name, subject, and body are required');
        return;
      }
      await api.post('/crm/engagement/templates', templateForm);
      setTemplateForm({ name: '', subjectTemplate: '', bodyTemplate: '' });
      await loadEngagement();
      setMessage('Email template created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create template');
    }
  }

  async function createCadence() {
    try {
      if (!cadenceForm.name.trim()) {
        setMessage('Cadence name is required');
        return;
      }
      await api.post('/crm/engagement/cadences', cadenceForm);
      setCadenceForm({ name: '', description: '' });
      await loadEngagement();
      setMessage('Cadence created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create cadence');
    }
  }

  async function addCadenceStep() {
    try {
      if (!stepForm.cadenceId) {
        setMessage('Choose a cadence for the step');
        return;
      }
      await api.post(`/crm/engagement/cadences/${stepForm.cadenceId}/steps`, {
        stepNumber: Number(stepForm.stepNumber || 1),
        stepType: stepForm.stepType,
        dayOffset: Number(stepForm.dayOffset || 0),
        templateId: stepForm.templateId ? Number(stepForm.templateId) : null,
        instructions: stepForm.instructions,
      });
      setStepForm((prev) => ({ ...prev, stepNumber: Number(prev.stepNumber || 1) + 1, templateId: '', instructions: '' }));
      await loadEngagement();
      setMessage('Cadence step added');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to add cadence step');
    }
  }

  async function enrollAccountInCadence() {
    try {
      if (!enrollmentForm.cadenceId || !enrollmentForm.accountId) {
        setMessage('Select cadence and account');
        return;
      }
      await api.post('/crm/engagement/enrollments', {
        cadenceId: Number(enrollmentForm.cadenceId),
        accountId: Number(enrollmentForm.accountId),
        ownerId: enrollmentForm.ownerId ? Number(enrollmentForm.ownerId) : null,
        startAt: enrollmentForm.startAt || null,
      });
      setEnrollmentForm({ cadenceId: '', accountId: '', ownerId: '', startAt: '' });
      await loadEngagement();
      setMessage('Account enrolled in cadence');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to enroll account');
    }
  }

  async function completeEnrollmentStep(enrollmentId) {
    try {
      await api.post(`/crm/engagement/enrollments/${enrollmentId}/activity`, {
        activityType: 'STEP_SKIPPED',
        activityStatus: 'DONE',
        summary: 'Step completed from CRM UI',
      });
      await loadEngagement();
      setMessage('Enrollment advanced to next step');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update enrollment');
    }
  }

  function exportReportCsv() {
    const rows = reports.orders_by_day || [];
    const header = 'Date,OrderCount,OrderValue';
    const lines = rows.map((row) => `${row.day},${row.count},${row.value}`);
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'crm-orders-report.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="crm-page module-page">
      <div className="crm-command-shell">
        <div className="crm-header module-hero crm-hero-panel">
          <div>
            <p className="module-kicker">Customer Operations</p>
            <h2>CRM Workspace</h2>
            <p className="module-subtitle">Pipeline, service, and account execution in one cleaner operating surface.</p>
          </div>
          <div className="crm-hero-meta">
            <span className="crm-hero-chip">Console: {availableAppProfiles.find((profile) => profile.key === appProfileKey)?.label || 'CRM'}</span>
            <span className="crm-hero-chip">Workspace: {tabLabel(workspaceTab)}</span>
            <span className="crm-hero-chip">Role: {user?.role || '-'}</span>
            {detail.account ? <span className="crm-hero-chip">Account: {detail.account.customer_name || detail.account.customer_number}</span> : null}
          </div>
          <div className="crm-hero-actions">
            <button type="button" onClick={() => goWorkspace('opportunities')}>Pipeline</button>
            <button type="button" className="button-secondary" onClick={() => goWorkspace('tasks')}>Tasks</button>
            <button type="button" className="button-secondary" onClick={() => goWorkspace('cases')}>Cases</button>
          </div>
          <div className="crm-command-metrics">
            {commandMetrics.map((item) => (
              <article key={item.label} className="crm-command-card">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <p>{item.note}</p>
                <button type="button" className="button-secondary" onClick={item.onClick}>{item.actionLabel}</button>
              </article>
            ))}
          </div>
        </div>

        <div className="crm-command-grid">
          <div className="card crm-global-search crm-command-search">
            <div className="crm-command-search-row">
              <input
                placeholder="Search accounts, opportunities, tasks, or case subjects..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onFocus={() => setSearchOpen(true)}
              />
              <div className="actions-cell">
                <button type="button" onClick={runGlobalSearch}>Search</button>
                <button type="button" className="button-secondary" onClick={() => { setGlobalSearch(''); setSearchResults({ accounts: [], opportunities: [], tasks: [] }); setSearchOpen(false); }}>Clear</button>
              </div>
            </div>
            {searchOpen && globalSearch.trim() && (
              <div className="crm-search-results">
                <div className="grid three">
                  <section className="card">
                    <h4>Accounts</h4>
                    {(searchResults.accounts || []).length === 0 ? <p className="crm-empty">No account matches.</p> : (
                      <div className="crm-search-list">
                        {(searchResults.accounts || []).map((item) => (
                          <button key={item.id} type="button" className="button-secondary" onClick={() => openFromSearchAccount(item.id)}>
                            {item.customer_name || item.customer_number}
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                  <section className="card">
                    <h4>Opportunities</h4>
                    {(searchResults.opportunities || []).length === 0 ? <p className="crm-empty">No opportunity matches.</p> : (
                      <div className="crm-search-list">
                        {(searchResults.opportunities || []).map((item) => (
                          <button key={item.id} type="button" className="button-secondary" onClick={() => openFromSearchOpportunity(item)}>
                            {item.title} ({item.stage})
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                  <section className="card">
                    <h4>Tasks</h4>
                    {(searchResults.tasks || []).length === 0 ? <p className="crm-empty">No task matches.</p> : (
                      <div className="crm-search-list">
                        {(searchResults.tasks || []).map((item) => (
                          <button key={item.id} type="button" className="button-secondary" onClick={() => openFromSearchTask(item)}>
                            {item.title} ({item.status})
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              </div>
            )}
          </div>

          <div className="card crm-saved-view-bar crm-command-presets">
            <div className="crm-section-head">
              <div>
                <p className="crm-kicker">Views And Presets</p>
                <h4>Save working contexts and jump into common modes</h4>
              </div>
            </div>
            <div className="filter-grid">
              <select value={selectedViewId} onChange={(e) => selectSavedView(e.target.value)}>
                <option value="">Select saved view</option>
                {savedViews.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.view_name} ({view.scope})
                  </option>
                ))}
              </select>
              <input placeholder="View name" value={viewNameInput} onChange={(e) => setViewNameInput(e.target.value)} />
              <select value={viewScope} onChange={(e) => setViewScope(e.target.value)}>
                <option value="PRIVATE">PRIVATE</option>
                <option value="SHARED">SHARED</option>
              </select>
            </div>
            <div className="actions-cell">
              <button type="button" onClick={createSavedView}>Save View</button>
              <button type="button" className="button-secondary" onClick={updateSavedView}>Update Selected</button>
              <button type="button" className="button-secondary" onClick={deleteSavedView}>Delete Selected</button>
            </div>
            <div className="crm-preset-row">
              <button type="button" className="button-secondary" onClick={() => applyQuickPreset('overdue_tasks')}>Overdue Tasks</button>
              <button type="button" className="button-secondary" onClick={() => applyQuickPreset('my_today_tasks')}>My Tasks Today</button>
              <button type="button" className="button-secondary" onClick={() => applyQuickPreset('high_value_pipeline')}>High Value Pipeline</button>
              <button type="button" className="button-secondary" onClick={() => applyQuickPreset('blocked_accounts')}>Blocked Accounts</button>
            </div>
          </div>
        </div>

        <div className="crm-nav-shell">
          <div className="card crm-workspace-tabs">
            <div className="crm-workspace-tabs-scroll">
              {workspaceOpenTabs.map((tab) => (
                <div key={`open-${tab}`} className={`crm-workspace-tab ${workspaceTab === tab ? 'active' : ''}`}>
                  <button type="button" onClick={() => goWorkspace(tab)}>{tabLabel(tab)}</button>
                  {tab !== 'home' && (
                    <button type="button" className="button-secondary" onClick={() => closeWorkspaceTab(tab)}>x</button>
                  )}
                </div>
              ))}
            </div>
            <div className="actions-cell">
              <button type="button" className="button-secondary" onClick={() => goWorkspace('tasks')}>New Task</button>
              <button type="button" className="button-secondary" onClick={() => goWorkspace('opportunities')}>New Opportunity</button>
              <button type="button" className="button-secondary" onClick={() => goWorkspace('cases')}>New Case</button>
            </div>
          </div>

          <div className="card crm-topbar">
            <div className="crm-topbar-scroll">
              {visibleWorkspaceTabs.map((tab) => (
                <div key={tab} className="crm-topbar-item">
                  <button
                    type="button"
                    className={workspaceTab === tab ? '' : 'button-secondary'}
                    onClick={() => goWorkspace(tab)}
                  >
                    {tabLabel(tab)}
                  </button>
                  <button
                    type="button"
                    className={`button-secondary crm-star-btn ${favoriteTabs.includes(tab) ? 'active' : ''}`}
                    onClick={() => toggleFavoriteTab(tab)}
                    title={favoriteTabs.includes(tab) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {favoriteTabs.includes(tab) ? 'Starred' : 'Star'}
                  </button>
                </div>
              ))}
            </div>
            <div className="crm-topbar-meta">
              <div className="crm-topbar-chip-row">
                <strong>Favorites</strong>
                {(favoriteTabs.filter((tab) => visibleWorkspaceTabs.includes(tab))).map((tab) => (
                  <button key={`fav-${tab}`} type="button" className="button-secondary" onClick={() => goWorkspace(tab)}>
                    {tabLabel(tab)}
                  </button>
                ))}
              </div>
              <div className="crm-topbar-chip-row">
                <strong>Recent</strong>
                {(recentTabs.filter((tab) => visibleWorkspaceTabs.includes(tab))).map((tab) => (
                  <button key={`recent-${tab}`} type="button" className="button-secondary" onClick={() => goWorkspace(tab)}>
                    {tabLabel(tab)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="card crm-object-nav">
            <div className="filter-grid">
              <label>
                Console App
                <select value={appProfileKey} onChange={(e) => setAppProfileKey(e.target.value)}>
                  {availableAppProfiles.map((profile) => (
                    <option key={profile.key} value={profile.key}>{profile.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="crm-nav-launcher">
              <aside className="crm-nav-rail">
                {groupedNavTabs.map((group) => (
                  <button
                    key={group.key}
                    type="button"
                    className={navGroupKey === group.key ? '' : 'button-secondary'}
                    onClick={() => setNavGroupKey(group.key)}
                  >
                    {group.label}
                  </button>
                ))}
              </aside>
              <section className="crm-nav-cards">
                <div className="crm-section-head">
                  <div>
                    <p className="crm-kicker">Module Launcher</p>
                    <h4>{currentNavGroup?.label || 'Modules'}</h4>
                  </div>
                </div>
                <div className="crm-module-grid">
                  {(currentNavGroup?.tabs || []).map((tab) => (
                    <article key={tab} className={`crm-module-card ${workspaceTab === tab ? 'active' : ''}`}>
                      <strong>{tabLabel(tab)}</strong>
                      <p>{TAB_DESCRIPTIONS[tab] || 'Open CRM module'}</p>
                      <div className="actions-cell">
                        <button type="button" onClick={() => goWorkspace(tab)}>Open</button>
                        <button type="button" className="button-secondary" onClick={() => openWorkspaceWindow(tab)}>Window</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      <div className="summary-grid">
        <div className="card"><h4>Total Customers</h4><p className="metric">{summary.totalCustomers}</p></div>
        <div className="card"><h4>Incomplete Profiles</h4><p className="metric">{summary.incompleteProfiles}</p></div>
        <div className="card"><h4>Active Customers</h4><p className="metric">{crmAnalytics.activeCustomers}</p></div>
        <div className="card"><h4>At-Risk Accounts</h4><p className="metric">{crmAnalytics.atRiskCustomers}</p></div>
        <div className="card"><h4>Balance Exposure</h4><p className="metric">{money(crmAnalytics.totalBalanceExposure)}</p></div>
      </div>

      <div className="chart-grid two-col">
        <DonutChartCard title="Customer Status Mix" data={crmAnalytics.statusBreakdown} totalLabel="Accounts" />
        <DonutChartCard title="Lead Temperature" data={crmAnalytics.leadBreakdown} totalLabel="Leads" />
      </div>

      <div className="chart-grid one-col">
        <BarChartCard title="Highest Outstanding Balances" data={crmAnalytics.topBalances} yLabel="Top receivables" format="currency" />
      </div>

      <div className="card filter-grid">
        <input placeholder="Search customer / number" value={filters.search} onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))} />
        <select value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
          <option value="">All Statuses</option>
          <option value="ACTIVE">ACTIVE</option>
          <option value="INACTIVE">INACTIVE</option>
          <option value="BLOCKED">BLOCKED</option>
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="recent">Sort: Recently Active</option>
          <option value="name">Sort: Name</option>
          <option value="balance">Sort: Balance</option>
          <option value="lead">Sort: Lead Score</option>
        </select>
        {!isOutletUser && <input placeholder="Outlet" value={filters.outlet} onChange={(e) => setFilters((p) => ({ ...p, outlet: e.target.value }))} />}
      </div>

      <div className="crm-main-grid">
        <aside className="card crm-account-list">
          <h3>Accounts</h3>
          <div className="crm-account-scroll">
            {sortedCustomers.map((customer) => {
              const temp = leadTemperature(customer.lead_score);
              const ageDays = interactionAgeDays(customer.last_interaction_at);
              return (
                <button key={customer.id} type="button" className={`crm-account-item ${selectedId === customer.id ? 'active' : ''}`} onClick={() => setSelectedId(customer.id)}>
                  <div className="crm-account-item-head">
                    <strong>{customer.customer_name || customer.customer_number}</strong>
                    <span className={`crm-temp-badge ${temp.tone}`}>{temp.label}</span>
                  </div>
                  <p>{customer.customer_number} - {customer.outlet_name || '-'}</p>
                  <div className="crm-account-item-meta">
                    <span className={`crm-status-pill ${(customer.customer_status || 'ACTIVE').toLowerCase()}`}>{customer.customer_status || 'ACTIVE'}</span>
                    <span>Balance {money(customer.balance)}</span>
                    <span>{ageDays === null ? 'No contact yet' : `${ageDays}d since contact`}</span>
                  </div>
                </button>
              );
            })}
            {sortedCustomers.length === 0 && <p className="crm-empty">No customers match current filters.</p>}
          </div>
        </aside>

        <div className="crm-content-column">
          <section className="card crm-record-header">
            {!detail.account ? (
              <p>Select an account to open the CRM workspace.</p>
            ) : (
              <>
                <div className="crm-record-title-row">
                  <div>
                    <h3>{detail.account.customer_name || detail.account.customer_number}</h3>
                    <p>{detail.account.customer_number} - {detail.account.outlet_name || '-'}</p>
                  </div>
                  <div className="crm-record-chips">
                    <span className={`crm-status-pill ${(detail.account.customer_status || 'ACTIVE').toLowerCase()}`}>{detail.account.customer_status || 'ACTIVE'}</span>
                    <span className={`crm-temp-badge ${leadTemperature(profile.leadScore).tone}`}>{leadTemperature(profile.leadScore).label} Lead</span>
                    <span>Orders {detail.orders?.length || 0}</span>
                    <span>Interactions {detail.interactions?.length || 0}</span>
                    <span>Opportunities {detail.opportunities?.length || 0}</span>
                  </div>
                </div>
                <div className="crm-record-metrics">
                  <article><strong>Debit</strong><span>{money(detail.ledger?.summary?.total_debit)}</span></article>
                  <article><strong>Credit</strong><span>{money(detail.ledger?.summary?.total_credit)}</span></article>
                  <article><strong>Balance</strong><span>{money(detail.ledger?.summary?.balance)}</span></article>
                  <article><strong>Email</strong><span>{detail.account.email || '-'}</span></article>
                </div>
                <div className="crm-customer-360-grid">
                  <article className="crm-360-card">
                    <span>Total Spend</span>
                    <strong>{money(customerOrderInsights.totalSpend)}</strong>
                    <p>{detail.orders?.length || 0} total orders</p>
                  </article>
                  <article className="crm-360-card">
                    <span>Average Order</span>
                    <strong>{money(customerOrderInsights.avgOrderValue)}</strong>
                    <p>{customerOrderInsights.openOrders.length} open orders</p>
                  </article>
                  <article className="crm-360-card">
                    <span>Refurbishments</span>
                    <strong>{customerOrderInsights.refurbishmentOrders.length}</strong>
                    <p>{customerOrderInsights.issueMix[0]?.label || 'No refurbishment issue logged'}</p>
                  </article>
                  <article className="crm-360-card">
                    <span>Returns</span>
                    <strong>{customerOrderInsights.returnOrders.length}</strong>
                    <p>{customerOrderInsights.replacementTouchedOrders.length} orders with replacements</p>
                  </article>
                </div>
                <div className="crm-related-lists">
                  {relatedLists.map((list) => (
                    <article key={list.key} className="crm-related-card">
                      <strong>{list.label}</strong>
                      <span>{list.count}</span>
                      {list.subtitle && <p>{list.subtitle}</p>}
                      <button type="button" className="button-secondary" onClick={list.onClick}>{list.actionLabel}</button>
                    </article>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="card">
            {workspaceTab === 'home' && (
              <div className="crm-home-layout">
                <div className="summary-grid">
                  <article className="card"><h4>Unread Alerts</h4><p className="metric">{Number(notifications.summary?.unread || 0)}</p></article>
                  <article className="card"><h4>Weighted Pipeline</h4><p className="metric">{money(reports.kpis?.weighted_pipeline_value)}</p></article>
                  <article className="card"><h4>Tasks Due Today</h4><p className="metric">{homeInsights.todaysTasks.length}</p></article>
                  <article className="card"><h4>Stale Accounts (30d+)</h4><p className="metric">{homeInsights.staleAccounts.length}</p></article>
                  <article className="card"><h4>Critical Accounts</h4><p className="metric">{crmCommandCenter.healthDistribution.find((row) => row.label === 'Critical')?.value || 0}</p></article>
                  <article className="card"><h4>VIP Accounts</h4><p className="metric">{crmCommandCenter.vipAccounts.length}</p></article>
                </div>
                <div className="chart-grid three-col">
                  <DonutChartCard title="Customer Health Distribution" data={crmCommandCenter.healthDistribution} totalLabel="Accounts" />
                  <DonutChartCard title="Customer Segment Mix" data={crmCommandCenter.segmentMix} totalLabel="Accounts" />
                  <BarChartCard title="Outlet Exposure" data={crmCommandCenter.outletExposure} yLabel="Risk score" format="number" />
                </div>
                <div className="grid two">
                  <section className="card crm-priority-board">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Next Best Action</p>
                        <h4>Account action board</h4>
                      </div>
                    </div>
                    <div className="crm-priority-list">
                      {crmCommandCenter.nextBestActions.length === 0 ? <p className="crm-empty">No account actions pending.</p> : crmCommandCenter.nextBestActions.map((row) => (
                        <article key={`action-${row.id}`} className="crm-priority-card">
                          <div className="crm-priority-head">
                            <strong>{row.customer}</strong>
                            <span className={`crm-badge crm-badge-${String(row.priority || '').toLowerCase()}`}>{row.priority}</span>
                          </div>
                          <p>{row.note}</p>
                          <div className="crm-order-insight-meta">
                            <span>{row.outlet}</span>
                            <span>{row.valueBand}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="card crm-priority-board">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Alert Center</p>
                        <h4>Issues that need CRM attention</h4>
                      </div>
                    </div>
                    <div className="crm-alert-stack">
                      {crmCommandCenter.alertCenter.length === 0 ? <p className="crm-empty">No major CRM alerts right now.</p> : crmCommandCenter.alertCenter.map((alert) => (
                        <article key={alert.title} className={`crm-alert-card crm-alert-${alert.tone}`}>
                          <strong>{alert.title}</strong>
                          <span>{alert.value}</span>
                        </article>
                      ))}
                    </div>
                    <div className="crm-order-insight-list">
                      {crmCommandCenter.communicationGaps.map((row) => (
                        <article key={`gap-${row.id}`} className="crm-order-insight-card">
                          <strong>{row.label}</strong>
                          <p>{row.nextBestAction}</p>
                          <div className="crm-order-insight-meta">
                            <span>{row.outlet}</span>
                            <span>{row.staleDays === null ? 'No contact yet' : `${row.staleDays} days since contact`}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Closing Soon</h4>
                    <table>
                      <thead><tr><th>Opportunity</th><th>Account</th><th>Close</th><th>Weighted</th></tr></thead>
                      <tbody>
                        {homeInsights.closingSoon.length === 0 ? <tr><td colSpan={4}>No open opportunities with close dates.</td></tr> : homeInsights.closingSoon.map((row) => (
                          <tr key={row.id}>
                            <td>{row.title}</td>
                            <td>{row.customer_name || row.customer_number}</td>
                            <td>{dateOnly(row.expected_close_date) || '-'}</td>
                            <td>{money(row.weighted_value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Accounts Needing Attention</h4>
                    <table>
                      <thead><tr><th>Account</th><th>Outlet</th><th>Since Last Contact</th><th>Lead</th></tr></thead>
                      <tbody>
                        {homeInsights.staleAccounts.length === 0 ? <tr><td colSpan={4}>No stale accounts.</td></tr> : homeInsights.staleAccounts.map((row) => (
                          <tr key={row.customer.id}>
                            <td>{row.customer.customer_name || row.customer.customer_number}</td>
                            <td>{row.customer.outlet_name || '-'}</td>
                            <td>{row.age === null ? 'No contact yet' : `${row.age} days`}</td>
                            <td>{row.customer.lead_score || 0}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
                <div className="grid three">
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">VIP Watchlist</p>
                        <h4>Top relationship accounts</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {crmCommandCenter.vipAccounts.length === 0 ? <p className="crm-empty">No VIP accounts identified.</p> : crmCommandCenter.vipAccounts.map((row) => (
                        <article key={`vip-${row.id}`} className="crm-order-insight-card">
                          <strong>{row.label}</strong>
                          <p>{row.nextBestAction}</p>
                          <div className="crm-order-insight-meta">
                            <span>{row.outlet}</span>
                            <span>Open pipeline {money(row.openOppValue)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Service Pressure</p>
                        <h4>Accounts carrying service burden</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {crmCommandCenter.serviceHeavyAccounts.length === 0 ? <p className="crm-empty">No service-heavy accounts.</p> : crmCommandCenter.serviceHeavyAccounts.map((row) => (
                        <article key={`service-${row.id}`} className="crm-order-insight-card">
                          <strong>{row.label}</strong>
                          <p>{row.nextBestAction}</p>
                          <div className="crm-order-insight-meta">
                            <span>Service burden {row.serviceBurden}</span>
                            <span>{row.serviceCount} service cases</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Data Quality</p>
                        <h4>Duplicate account watchlist</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {crmCommandCenter.duplicateAccounts.length === 0 ? <p className="crm-empty">No duplicate patterns detected.</p> : crmCommandCenter.duplicateAccounts.map((entry) => (
                        <article key={`${entry.type}-${entry.key}`} className="crm-order-insight-card">
                          <strong>{entry.type}: {entry.key}</strong>
                          <p>{entry.accounts.map((row) => row.customer_name || row.customer_number).join(' | ')}</p>
                          <div className="crm-order-insight-meta">
                            <span>{entry.accounts.length} records</span>
                            <span>Needs merge review</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            )}
            {workspaceTab === 'accounts' && (
              <div className="crm-tab-row">
                <button type="button" className={activeTab === 'overview' ? '' : 'button-secondary'} onClick={() => setActiveTab('overview')}>Overview</button>
                <button type="button" className={activeTab === 'profile' ? '' : 'button-secondary'} onClick={() => setActiveTab('profile')}>Profile</button>
                <button type="button" className={activeTab === 'activities' ? '' : 'button-secondary'} onClick={() => setActiveTab('activities')}>Activities</button>
                <button type="button" className={activeTab === 'orders' ? '' : 'button-secondary'} onClick={() => setActiveTab('orders')}>Orders & Ledger</button>
              </div>
            )}
            {workspaceTab === 'accounts' && activeTab === 'overview' && (
              <div className="crm-overview-grid">
                <div className="crm-account-signal-grid">
                  <article className={`crm-signal-card crm-signal-${selectedAccountSignals.health.tone}`}><span>Customer Health</span><strong>{selectedAccountSignals.health.score}</strong><p>{selectedAccountSignals.health.label}</p></article>
                  <article className={`crm-signal-card crm-signal-${selectedAccountSignals.churn.tone}`}><span>Churn Risk</span><strong>{selectedAccountSignals.churn.score}</strong><p>{selectedAccountSignals.churn.label}</p></article>
                  <article className={`crm-signal-card crm-signal-${selectedAccountSignals.service.tone}`}><span>Service Burden</span><strong>{selectedAccountSignals.service.score}</strong><p>{selectedAccountSignals.service.label}</p></article>
                  <article className={`crm-signal-card crm-signal-${selectedAccountSignals.promise.tone}`}><span>Promise Reliability</span><strong>{selectedAccountSignals.promise.score}</strong><p>{selectedAccountSignals.promise.label}</p></article>
                </div>
                <div className="chart-grid one-col">
                  <DonutChartCard title="Selected Account Order Status" data={selectedInsights.orderStatusBreakdown} totalLabel="Orders" />
                </div>
                <div className="card crm-next-step-card">
                  <div className="crm-section-head">
                    <div>
                      <p className="crm-kicker">Next Best Action</p>
                      <h4>What CRM should do next for this account</h4>
                    </div>
                  </div>
                  <p>{selectedAccountSignals.nextBestAction}</p>
                  <div className="crm-order-insight-meta">
                    {selectedAccountSignals.duplicateFlags.map((flag) => <span key={flag}>{flag}</span>)}
                    {selectedAccountSignals.duplicateFlags.length === 0 && <span>No duplicate account flags</span>}
                  </div>
                </div>
                <div className="grid three">
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Account Hierarchy</p>
                        <h4>Parent and child accounts</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {detail.parent_account ? (
                        <article className="crm-order-insight-card">
                          <strong>Parent: {detail.parent_account.customer_name || detail.parent_account.customer_number}</strong>
                          <div className="crm-order-insight-meta">
                            <span>{detail.parent_account.account_tier || 'STANDARD'}</span>
                            <span>{detail.parent_account.customer_segment || 'Unsegmented'}</span>
                          </div>
                        </article>
                      ) : (
                        <p className="crm-empty">No parent account linked.</p>
                      )}
                      {(detail.child_accounts || []).map((child) => (
                        <article key={`child-${child.id}`} className="crm-order-insight-card">
                          <strong>{child.customer_name || child.customer_number}</strong>
                          <div className="crm-order-insight-meta">
                            <span>{child.outlet_name || '-'}</span>
                            <span>{child.account_tier || 'STANDARD'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Contacts</p>
                        <h4>Stakeholders for this account</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {(detail.contacts || []).length === 0 ? <p className="crm-empty">No linked contacts yet.</p> : (detail.contacts || []).slice(0, 8).map((contact) => (
                        <article key={`detail-contact-${contact.id}`} className="crm-order-insight-card">
                          <strong>{[contact.first_name, contact.last_name].filter(Boolean).join(' ') || contact.email || contact.phone}</strong>
                          <p>{contact.title || contact.department || 'No role set'}</p>
                          <div className="crm-order-insight-meta">
                            <span>{contact.email || 'No email'}</span>
                            <span>{contact.phone || 'No phone'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Duplicate Intelligence</p>
                        <h4>Possible matching accounts</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {(detail.duplicate_accounts || []).length === 0 ? <p className="crm-empty">No duplicate matches detected.</p> : (detail.duplicate_accounts || []).map((accountRow) => (
                        <article key={`dup-${accountRow.id}`} className="crm-order-insight-card">
                          <strong>{accountRow.customer_name || accountRow.customer_number}</strong>
                          <div className="crm-order-insight-meta">
                            <span>{accountRow.email || 'No email'}</span>
                            <span>{accountRow.customer_number}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
                <div className="card crm-followup-card">
                  <h4>Upcoming Follow-ups</h4>
                  {selectedInsights.nextFollowups.length === 0 ? <p className="crm-empty">No follow-ups scheduled.</p> : (
                    <div className="crm-followup-list">
                      {selectedInsights.nextFollowups.map((item) => (
                        <article key={item.id}>
                          <strong>{item.subject || item.interaction_type}</strong>
                          <p>{dateOnly(item.next_followup_at)} - {item.interaction_type}</p>
                          <p>{item.notes}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
                <div className="card crm-order-insight-panel">
                  <div className="crm-section-head">
                    <div>
                      <p className="crm-kicker">Service Timeline</p>
                      <h4>Refurbishments, returns, and replacements</h4>
                    </div>
                  </div>
                  <div className="crm-order-insight-list">
                    {selectedAccountSignals.serviceTimeline.length === 0 ? <p className="crm-empty">No service history for this account.</p> : selectedAccountSignals.serviceTimeline.map((order) => (
                      <article key={`service-timeline-${order.id}`} className="crm-order-insight-card">
                        <strong>{order.production_order_no}</strong>
                        <p>{order.order_type || 'MTO'} | {order.current_stage || order.status || '-'}</p>
                        <div className="crm-order-insight-meta">
                          <span>{order.refurbishment_type || order.return_reason || order.comments || 'No issue logged'}</span>
                          <span>{Number(order.replacement_count || 0) > 0 ? `${order.replacement_count} replacements` : 'No replacement chain'}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="card">
                  <h4>Lead Conversion</h4>
                  <p className="crm-empty">Convert this account into an opportunity + follow-up task.</p>
                  <div className="grid two">
                    <label>Opportunity Title<input value={leadConversionForm.opportunityTitle} onChange={(e) => setLeadConversionForm((p) => ({ ...p, opportunityTitle: e.target.value }))} placeholder={`Conversion: ${detail.account?.customer_number || ''}`} /></label>
                    <label>Expected Value<input type="number" min="0" step="0.01" value={leadConversionForm.expectedValue} onChange={(e) => setLeadConversionForm((p) => ({ ...p, expectedValue: e.target.value }))} /></label>
                    <label>Expected Close<input type="date" value={leadConversionForm.expectedCloseDate} onChange={(e) => setLeadConversionForm((p) => ({ ...p, expectedCloseDate: e.target.value }))} /></label>
                    <label>Opportunity Owner<select value={leadConversionForm.ownerId} onChange={(e) => setLeadConversionForm((p) => ({ ...p, ownerId: e.target.value }))}><option value="">Current user</option>{crmUsers.map((userRow) => <option key={userRow.id} value={userRow.id}>{userRow.full_name}</option>)}</select></label>
                    <label>Task Title<input value={leadConversionForm.taskTitle} onChange={(e) => setLeadConversionForm((p) => ({ ...p, taskTitle: e.target.value }))} /></label>
                    <label>Task Due Date<input type="date" value={leadConversionForm.taskDueDate} onChange={(e) => setLeadConversionForm((p) => ({ ...p, taskDueDate: e.target.value }))} /></label>
                    <label>Task Owner<select value={leadConversionForm.assignedTo} onChange={(e) => setLeadConversionForm((p) => ({ ...p, assignedTo: e.target.value }))}><option value="">Current user</option>{crmUsers.map((userRow) => <option key={userRow.id} value={userRow.id}>{userRow.full_name}</option>)}</select></label>
                    <label className="crm-field-span-two">Notes<textarea rows={2} value={leadConversionForm.conversionNotes} onChange={(e) => setLeadConversionForm((p) => ({ ...p, conversionNotes: e.target.value }))} /></label>
                  </div>
                  <div className="actions-cell">
                    <button type="button" onClick={convertLead} disabled={!selectedId}>Convert Lead</button>
                  </div>
                </div>
              </div>
            )}

            {workspaceTab === 'accounts' && activeTab === 'profile' && (
              <>
                <div className="crm-profile-grid">
                  <label className="crm-field"><span>Name</span><input value={profile.customerName || ''} disabled={!canEditField('customerName')} onChange={(e) => setProfile((p) => ({ ...p, customerName: e.target.value }))} /></label>
                  <label className="crm-field"><span>Phone</span><input value={detail.account?.customer_number || selectedCustomer?.customer_number || ''} readOnly /></label>
                  <label className="crm-field"><span>Email</span><input value={profile.email || ''} disabled={!canEditField('email')} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} /></label>
                  <label className="crm-field"><span>Outlet</span><input value={detail.account?.outlet_name || selectedCustomer?.outlet_name || ''} readOnly /></label>
                  <label className="crm-field"><span>Preferred Contact</span><input value={profile.preferredContact || ''} disabled={!canEditField('preferredContact')} onChange={(e) => setProfile((p) => ({ ...p, preferredContact: e.target.value }))} /></label>
                  <label className="crm-field"><span>Status</span><select value={profile.customerStatus || 'ACTIVE'} disabled={!canEditField('customerStatus')} onChange={(e) => setProfile((p) => ({ ...p, customerStatus: e.target.value }))}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option><option value="BLOCKED">BLOCKED</option></select></label>
                  <label className="crm-field"><span>Lead Score</span><input type="number" min="0" max="100" step="1" disabled={!canEditField('leadScore')} value={profile.leadScore ?? 0} onChange={(e) => setProfile((p) => ({ ...p, leadScore: e.target.value }))} /></label>
                  <label className="crm-field"><span>Source</span><input value={profile.source || ''} disabled={!canEditField('source')} onChange={(e) => setProfile((p) => ({ ...p, source: e.target.value }))} /></label>
                  <label className="crm-field"><span>Account Tier</span><select value={profile.accountTier || 'STANDARD'} onChange={(e) => setProfile((p) => ({ ...p, accountTier: e.target.value }))}><option value="STANDARD">STANDARD</option><option value="KEY">KEY</option><option value="VIP">VIP</option><option value="ENTERPRISE">ENTERPRISE</option></select></label>
                  <label className="crm-field"><span>Customer Segment</span><input value={profile.customerSegment || ''} onChange={(e) => setProfile((p) => ({ ...p, customerSegment: e.target.value }))} placeholder="VIP, Growth, Dormant" /></label>
                  <label className="crm-field"><span>Relationship Type</span><input value={profile.relationshipType || ''} onChange={(e) => setProfile((p) => ({ ...p, relationshipType: e.target.value }))} placeholder="Direct, Corporate, Distributor" /></label>
                  <label className="crm-field"><span>Parent Account</span><select value={profile.parentAccountId || ''} onChange={(e) => setProfile((p) => ({ ...p, parentAccountId: e.target.value }))}><option value="">No parent</option>{customers.filter((customer) => customer.id !== selectedId).map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_name || customer.customer_number}</option>)}</select></label>
                  <label className="crm-field"><span>Tags</span><input value={profile.tags || ''} disabled={!canEditField('tags')} onChange={(e) => setProfile((p) => ({ ...p, tags: e.target.value }))} placeholder="vip, premium, frequent" /></label>
                  <label className="crm-field"><span>Birth Date</span><input type="date" value={profile.birthDate || ''} disabled={!canEditField('birthDate')} onChange={(e) => setProfile((p) => ({ ...p, birthDate: e.target.value }))} /></label>
                  <label className="crm-field"><span>Anniversary</span><input type="date" value={profile.anniversaryDate || ''} disabled={!canEditField('anniversaryDate')} onChange={(e) => setProfile((p) => ({ ...p, anniversaryDate: e.target.value }))} /></label>
                  <label className="crm-field"><span>Success Owner</span><select value={profile.successOwnerId || ''} onChange={(e) => setProfile((p) => ({ ...p, successOwnerId: e.target.value }))}><option value="">Unassigned</option>{crmUsers.map((userRow) => <option key={userRow.id} value={userRow.id}>{userRow.full_name}</option>)}</select></label>
                  <label className="crm-field crm-field-span-two"><span>Risk Flag</span><input value={profile.riskFlagReason || ''} onChange={(e) => setProfile((p) => ({ ...p, riskFlagReason: e.target.value }))} placeholder="Document the reason if this account needs attention" /></label>
                  <label className="crm-field crm-field-span-two"><span>Address</span><input value={profile.customerAddress || ''} disabled={!canEditField('customerAddress')} onChange={(e) => setProfile((p) => ({ ...p, customerAddress: e.target.value }))} /></label>
                  <label className="crm-field crm-field-span-two"><span>Notes</span><textarea rows={4} value={profile.notes || ''} disabled={!canEditField('notes')} onChange={(e) => setProfile((p) => ({ ...p, notes: e.target.value }))} /></label>
                </div>
                <div className="actions-cell"><button type="button" onClick={saveProfile} disabled={!selectedId}>Save Profile</button></div>
                <div className="grid two">
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Merge Workbench</p>
                        <h4>Merge this account into another customer</h4>
                      </div>
                    </div>
                    <div className="grid two">
                      <label>Merge Target<select value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)}><option value="">Select target account</option>{customers.filter((customer) => customer.id !== selectedId).map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_name || customer.customer_number}</option>)}</select></label>
                      <div className="actions-cell">
                        <button type="button" className="button-secondary" onClick={() => loadMergePreview(mergeTargetId)} disabled={!mergeTargetId}>Preview Merge</button>
                        <button type="button" onClick={runCustomerMerge} disabled={!mergeTargetId}>Run Merge</button>
                      </div>
                    </div>
                    {mergePreview ? (
                      <div className="crm-order-insight-list">
                        <article className="crm-order-insight-card">
                          <strong>{mergePreview.source_account?.customer_name || mergePreview.source_account?.customer_number} -> {mergePreview.target_account?.customer_name || mergePreview.target_account?.customer_number}</strong>
                          <div className="crm-order-insight-meta">
                            <span>{mergePreview.preview?.contacts_to_move || 0} contacts</span>
                            <span>{mergePreview.preview?.interactions_to_move || 0} interactions</span>
                            <span>{mergePreview.preview?.ledger_entries_to_move || 0} ledger entries</span>
                            <span>{mergePreview.preview?.opportunities_to_move || 0} opportunities</span>
                            <span>{mergePreview.preview?.tasks_to_move || 0} tasks</span>
                            <span>{mergePreview.preview?.cases_to_move || 0} cases</span>
                            <span>{mergePreview.preview?.orders_to_rekey || 0} orders</span>
                          </div>
                        </article>
                      </div>
                    ) : (
                      <p className="crm-empty">Select a target account to preview the merge impact.</p>
                    )}
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Account Strategy</p>
                        <h4>Commercial and service positioning</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      <article className="crm-order-insight-card">
                        <strong>Tier and segment</strong>
                        <div className="crm-order-insight-meta">
                          <span>{profile.accountTier || 'STANDARD'}</span>
                          <span>{profile.customerSegment || 'Unsegmented'}</span>
                          <span>{profile.relationshipType || 'Relationship type not set'}</span>
                        </div>
                      </article>
                      <article className="crm-order-insight-card">
                        <strong>Success ownership</strong>
                        <p>{crmUsers.find((userRow) => String(userRow.id) === String(profile.successOwnerId || ''))?.full_name || 'No success owner assigned'}</p>
                        <div className="crm-order-insight-meta">
                          <span>{profile.riskFlagReason || 'No explicit risk flag'}</span>
                        </div>
                      </article>
                    </div>
                  </section>
                </div>
                {['SUPER_USER', 'FINANCE'].includes(user?.role) && (
                  <div className="card">
                    <h4>Account Sharing</h4>
                    <div className="grid two">
                      <label>User<select value={shareForm.userId} onChange={(e) => setShareForm((p) => ({ ...p, userId: e.target.value }))}><option value="">Select user</option>{crmUsers.map((userRow) => <option key={userRow.id} value={userRow.id}>{userRow.full_name} ({userRow.role_name})</option>)}</select></label>
                      <label>Access<select value={shareForm.accessLevel} onChange={(e) => setShareForm((p) => ({ ...p, accessLevel: e.target.value }))}><option value="VIEW">VIEW</option><option value="EDIT">EDIT</option></select></label>
                    </div>
                    <div className="actions-cell">
                      <button type="button" onClick={saveShare}>Save Share</button>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th>User</th><th>Email</th><th>Access</th><th>Actions</th></tr></thead>
                        <tbody>
                          {shares.length === 0 ? <tr><td colSpan={4}>No shares configured.</td></tr> : shares.map((share) => (
                            <tr key={share.id}>
                              <td>{share.full_name || share.user_id}</td>
                              <td>{share.email || '-'}</td>
                              <td>{share.access_level}</td>
                              <td><button type="button" className="button-secondary" onClick={() => removeShare(share.id)}>Remove</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {workspaceTab === 'accounts' && activeTab === 'activities' && (
              <div className="crm-activities-grid">
                <section className="card">
                  <h4>Log Interaction</h4>
                  <div className="grid two">
                    <label>Type<select value={interaction.interactionType} onChange={(e) => setInteraction((p) => ({ ...p, interactionType: e.target.value }))}><option value="NOTE">NOTE</option><option value="CALL">CALL</option><option value="VISIT">VISIT</option><option value="WHATSAPP">WHATSAPP</option><option value="EMAIL">EMAIL</option><option value="SMS">SMS</option></select></label>
                    <label>Direction<select value={interaction.direction} onChange={(e) => setInteraction((p) => ({ ...p, direction: e.target.value }))}><option value="OUTBOUND">OUTBOUND</option><option value="INBOUND">INBOUND</option><option value="INTERNAL">INTERNAL</option></select></label>
                    <label>Conversation Owner<select value={interaction.conversationOwnerId} onChange={(e) => setInteraction((p) => ({ ...p, conversationOwnerId: e.target.value }))}><option value="">Current user</option>{crmUsers.map((userRow) => <option key={userRow.id} value={userRow.id}>{userRow.full_name}</option>)}</select></label>
                    <label>Status<select value={interaction.channelStatus} onChange={(e) => setInteraction((p) => ({ ...p, channelStatus: e.target.value }))}><option value="OPEN">OPEN</option><option value="PENDING">PENDING</option><option value="CLOSED">CLOSED</option></select></label>
                    <label>Next Follow-up<input type="date" value={interaction.nextFollowupAt} onChange={(e) => setInteraction((p) => ({ ...p, nextFollowupAt: e.target.value }))} /></label>
                    <label>Response SLA (mins)<input type="number" min="0" value={interaction.responseSlaMinutes} onChange={(e) => setInteraction((p) => ({ ...p, responseSlaMinutes: e.target.value }))} /></label>
                  </div>
                  <label>Subject<input value={interaction.subject} onChange={(e) => setInteraction((p) => ({ ...p, subject: e.target.value }))} /></label>
                  <label>Thread Key<input value={interaction.threadKey} onChange={(e) => setInteraction((p) => ({ ...p, threadKey: e.target.value }))} placeholder="Leave blank to auto-group by account + channel" /></label>
                  <label>Notes<textarea rows={4} value={interaction.notes} onChange={(e) => setInteraction((p) => ({ ...p, notes: e.target.value }))} /></label>
                  <div className="actions-cell"><button type="button" disabled={!selectedId || !interaction.notes.trim()} onClick={addInteraction}>Add Interaction</button></div>
                </section>

                <section className="card table-wrap">
                  <h4>Interaction Timeline</h4>
                  <table>
                    <thead><tr><th>When</th><th>Type</th><th>Direction</th><th>Subject</th><th>Owner</th><th>SLA</th><th>Notes</th></tr></thead>
                    <tbody>
                      {(detail.interactions || []).length === 0 ? <tr><td colSpan={7}>No interactions recorded.</td></tr> : (detail.interactions || []).map((i) => <tr key={i.id}><td>{String(i.created_at || '').slice(0, 19).replace('T', ' ')}</td><td>{i.interaction_type}</td><td>{i.direction || '-'}</td><td>{i.subject || '-'}</td><td>{i.conversation_owner_name || i.created_by_name || '-'}</td><td>{i.response_due_at ? `${dateOnly(i.response_due_at)} ${i.responded_at ? 'Answered' : 'Waiting'}` : (dateOnly(i.next_followup_at) || '-')}</td><td>{i.notes}</td></tr>)}
                    </tbody>
                  </table>
                </section>
                <section className="card crm-order-insight-panel">
                  <div className="crm-section-head">
                    <div>
                      <p className="crm-kicker">Communication Center</p>
                      <h4>Cross-channel account feed</h4>
                    </div>
                  </div>
                  <div className="crm-order-insight-list">
                    {communicationCenter.feed.length === 0 ? <p className="crm-empty">No communication activity for this account.</p> : communicationCenter.feed.map((item, index) => (
                      <article key={`${item.kind}-${index}-${item.when || ''}`} className="crm-order-insight-card">
                        <strong>{item.title}</strong>
                        <p>{item.detail || '-'}</p>
                        <div className="crm-order-insight-meta">
                          <span>{item.kind}</span>
                          <span>{item.channel}</span>
                          <span>{dateOnly(item.when) || '-'}</span>
                          <span>{item.owner}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
                <section className="card crm-order-insight-panel">
                  <div className="crm-section-head">
                    <div>
                      <p className="crm-kicker">Follow-up Window</p>
                      <h4>Upcoming touches and unread alerts</h4>
                    </div>
                  </div>
                  <div className="grid two">
                    <div className="crm-order-insight-list">
                      {communicationCenter.upcomingFollowups.length === 0 ? <p className="crm-empty">No upcoming follow-ups.</p> : communicationCenter.upcomingFollowups.map((item) => (
                        <article key={`followup-${item.id}`} className="crm-order-insight-card">
                          <strong>{item.subject || item.interaction_type}</strong>
                          <div className="crm-order-insight-meta">
                            <span>{dateOnly(item.next_followup_at) || '-'}</span>
                            <span>{item.created_by_name || '-'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="crm-order-insight-list">
                      {communicationCenter.unreadAlerts.length === 0 ? <p className="crm-empty">No unread alerts for this account.</p> : communicationCenter.unreadAlerts.map((item) => (
                        <article key={`alert-${item.id}`} className="crm-order-insight-card">
                          <strong>{item.title}</strong>
                          <p>{item.message}</p>
                          <div className="crm-order-insight-meta">
                            <span>{item.severity}</span>
                            <span>{dateOnly(item.created_at) || '-'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>
              </div>
            )}

            {workspaceTab === 'accounts' && activeTab === 'orders' && (
              <div className="crm-orders-grid">
                <div className="chart-grid two-col">
                  <DonutChartCard title="Order Type Mix" data={customerOrderInsights.orderTypeMix} totalLabel="Orders" />
                  <BarChartCard title="Current Stage Mix" data={customerOrderInsights.stageMix} yLabel="Orders" format="number" />
                </div>

                <div className="chart-grid two-col">
                  <DonutChartCard title="Refurbishment Type Mix" data={customerOrderInsights.refurbishmentTypeMix} totalLabel="Refurbishments" />
                  <BarChartCard title="Refurbishment Issue Mix" data={customerOrderInsights.issueMix} yLabel="Cases" format="number" />
                </div>

                <div className="grid two">
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Refurbishment Visibility</p>
                        <h4>All refurbishments for this customer</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {customerOrderInsights.refurbishmentOrders.length === 0 ? (
                        <p className="crm-empty">No refurbishment orders recorded for this customer.</p>
                      ) : customerOrderInsights.refurbishmentOrders.map((order) => (
                        <article key={`refurb-${order.id}`} className="crm-order-insight-card">
                          <strong>{order.production_order_no}</strong>
                          <p>{order.refurbishment_type || 'Refurbishment'} | {order.item_condition || 'Condition not logged'}</p>
                          <div className="crm-order-insight-meta">
                            <span>{order.issue_description || 'No issue description'}</span>
                            <span>{order.work_requested || 'No work requested'}</span>
                            <span>{order.current_stage || order.status || '-'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Service Watchlist</p>
                        <h4>Returns and replacement-linked orders</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {[...customerOrderInsights.returnOrders, ...customerOrderInsights.replacementTouchedOrders]
                        .slice(0, 10)
                        .map((order) => (
                          <article key={`service-${order.id}`} className="crm-order-insight-card">
                            <strong>{order.production_order_no}</strong>
                            <p>{order.order_type || 'MTO'} | {order.status || '-'}</p>
                            <div className="crm-order-insight-meta">
                              <span>{order.return_reason || order.return_request || order.comments || 'No service note'}</span>
                              <span>{order.replacement_count ? `${order.replacement_count} replacement(s)` : 'No replacement logged'}</span>
                              <span>{order.current_stage || '-'}</span>
                            </div>
                          </article>
                        ))}
                      {customerOrderInsights.returnOrders.length === 0 && customerOrderInsights.replacementTouchedOrders.length === 0 && (
                        <p className="crm-empty">No return or replacement burden on this customer account.</p>
                      )}
                    </div>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Replacement Chain</p>
                        <h4>Orders with repeat replacements</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {selectedAccountSignals.replacementOrders.length === 0 ? (
                        <p className="crm-empty">No replacement-linked orders for this customer.</p>
                      ) : selectedAccountSignals.replacementOrders.map((order) => (
                        <article key={`replacement-${order.id}`} className="crm-order-insight-card">
                          <strong>{order.production_order_no}</strong>
                          <p>{order.current_stage || order.status || '-'}</p>
                          <div className="crm-order-insight-meta">
                            <span>{order.order_type || 'MTO'}</span>
                            <span>{order.replacement_count} replacements</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Service Risk</p>
                        <h4>Customer-level relationship pressure</h4>
                      </div>
                    </div>
                    <div className="crm-priority-list">
                      <article className="crm-priority-card">
                        <div className="crm-priority-head">
                          <strong>Health signal</strong>
                          <span className={`crm-badge crm-badge-${selectedAccountSignals.health.tone}`}>{selectedAccountSignals.health.label}</span>
                        </div>
                        <p>CRM should use this signal before committing new dates or promises.</p>
                      </article>
                      <article className="crm-priority-card">
                        <div className="crm-priority-head">
                          <strong>Service signal</strong>
                          <span className={`crm-badge crm-badge-${selectedAccountSignals.service.tone}`}>{selectedAccountSignals.service.label}</span>
                        </div>
                        <p>Refurbishments, returns, and replacements are now visible in one account-level decision view.</p>
                      </article>
                    </div>
                  </section>
                </div>

                <section className="card table-wrap">
                  <h4>Order History</h4>
                  <table>
                    <thead><tr><th>Order #</th><th>Type</th><th>Order Date</th><th>Due Date</th><th>Status / Stage</th><th>Service Detail</th><th>Price</th><th>Advance</th><th>Balance</th></tr></thead>
                    <tbody>
                      {(detail.orders || []).length === 0 ? <tr><td colSpan={9}>No orders found for this customer.</td></tr> : (detail.orders || []).map((order) => {
                        const price = Number(order.product_price || 0);
                        const advance = Number(order.advance_paid || 0);
                        const serviceDetail = String(order.order_type || 'MTO').toUpperCase() === 'REFURBISHMENT'
                          ? `${order.refurbishment_type || 'Refurbishment'} | ${order.issue_description || order.work_requested || 'No issue logged'}`
                          : String(order.order_type || '').toUpperCase() === 'RETURN'
                            ? `${order.return_reason || 'Return'} | ${order.return_request || 'No request logged'}`
                            : order.replacement_count
                              ? `${order.replacement_count} replacement(s)`
                              : '-';
                        return <tr key={order.id}><td>{order.production_order_no}</td><td>{order.order_type || 'MTO'}</td><td>{dateOnly(order.order_date) || '-'}</td><td>{dateOnly(order.due_date) || '-'}</td><td>{order.status || '-'}<br /><small>{order.current_stage || '-'}</small></td><td>{serviceDetail}</td><td>{money(price)}</td><td>{money(advance)}</td><td>{money(price - advance)}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </section>

                <section className="card table-wrap">
                  <h4>Ledger Entries</h4>
                  <table>
                    <thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Amount</th><th>Order Ref</th><th>Notes</th></tr></thead>
                    <tbody>
                      {(detail.ledger?.entries || []).length === 0 ? <tr><td colSpan={6}>No ledger entries found.</td></tr> : (detail.ledger?.entries || []).map((entry) => <tr key={entry.id}><td>{dateOnly(entry.entry_date) || '-'}</td><td>{entry.entry_type || '-'}</td><td>{entry.category || '-'}</td><td>{money(entry.amount)}</td><td>{entry.reference_order_id || '-'}</td><td>{entry.notes || '-'}</td></tr>)}
                    </tbody>
                  </table>
                </section>
              </div>
            )}

            {workspaceTab === 'contacts' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Contact</h4>
                    <form className="grid two" onSubmit={createContact}>
                      <label>Account<select value={contactForm.accountId} onChange={(e) => setContactForm((p) => ({ ...p, accountId: e.target.value }))} required><option value="">Select account</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_name || customer.customer_number}</option>)}</select></label>
                      <label>First Name<input value={contactForm.firstName} onChange={(e) => setContactForm((p) => ({ ...p, firstName: e.target.value }))} required /></label>
                      <label>Last Name<input value={contactForm.lastName} onChange={(e) => setContactForm((p) => ({ ...p, lastName: e.target.value }))} /></label>
                      <label>Email<input value={contactForm.email} onChange={(e) => setContactForm((p) => ({ ...p, email: e.target.value }))} /></label>
                      <label>Phone<input value={contactForm.phone} onChange={(e) => setContactForm((p) => ({ ...p, phone: e.target.value }))} /></label>
                      <label>Alternate Email<input value={contactForm.alternateEmail} onChange={(e) => setContactForm((p) => ({ ...p, alternateEmail: e.target.value }))} /></label>
                      <label>Alternate Phone<input value={contactForm.alternatePhone} onChange={(e) => setContactForm((p) => ({ ...p, alternatePhone: e.target.value }))} /></label>
                      <label>Title<input value={contactForm.title} onChange={(e) => setContactForm((p) => ({ ...p, title: e.target.value }))} /></label>
                      <label>Department<input value={contactForm.department} onChange={(e) => setContactForm((p) => ({ ...p, department: e.target.value }))} /></label>
                      <label>Owner<select value={contactForm.ownerId} onChange={(e) => setContactForm((p) => ({ ...p, ownerId: e.target.value }))}><option value="">Current user</option>{crmUsers.map((userRow) => <option key={userRow.id} value={userRow.id}>{userRow.full_name}</option>)}</select></label>
                      <label>Status<select value={contactForm.status} onChange={(e) => setContactForm((p) => ({ ...p, status: e.target.value }))}><option value="ACTIVE">ACTIVE</option><option value="INACTIVE">INACTIVE</option></select></label>
                      <label>Preferred Channel<select value={contactForm.preferredChannel} onChange={(e) => setContactForm((p) => ({ ...p, preferredChannel: e.target.value }))}><option value="PHONE">PHONE</option><option value="EMAIL">EMAIL</option><option value="WHATSAPP">WHATSAPP</option><option value="VISIT">VISIT</option></select></label>
                      <label>Decision Role<input value={contactForm.decisionRole} onChange={(e) => setContactForm((p) => ({ ...p, decisionRole: e.target.value }))} placeholder="Buyer, Approver, Influencer" /></label>
                      <label>Influence<select value={contactForm.influenceLevel} onChange={(e) => setContactForm((p) => ({ ...p, influenceLevel: e.target.value }))}><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option></select></label>
                      <label>Relationship<select value={contactForm.relationshipStrength} onChange={(e) => setContactForm((p) => ({ ...p, relationshipStrength: e.target.value }))}><option value="COLD">COLD</option><option value="WARM">WARM</option><option value="HOT">HOT</option><option value="STRATEGIC">STRATEGIC</option></select></label>
                      <label>Reports To<select value={contactForm.reportsToContactId} onChange={(e) => setContactForm((p) => ({ ...p, reportsToContactId: e.target.value }))}><option value="">No manager</option>{contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.first_name} {contact.last_name || ''}</option>)}</select></label>
                      <label>Verification<select value={contactForm.verificationStatus} onChange={(e) => setContactForm((p) => ({ ...p, verificationStatus: e.target.value }))}><option value="UNVERIFIED">UNVERIFIED</option><option value="VERIFIED">VERIFIED</option><option value="BOUNCED">BOUNCED</option><option value="INVALID">INVALID</option></select></label>
                      <label className="crm-field-checkbox"><input type="checkbox" checked={contactForm.isPrimary} onChange={(e) => setContactForm((p) => ({ ...p, isPrimary: e.target.checked }))} /> Primary contact</label>
                      <label className="crm-field-checkbox"><input type="checkbox" checked={contactForm.doNotContact} onChange={(e) => setContactForm((p) => ({ ...p, doNotContact: e.target.checked }))} /> Do not contact</label>
                      <label className="crm-field-checkbox"><input type="checkbox" checked={contactForm.whatsappOptIn} onChange={(e) => setContactForm((p) => ({ ...p, whatsappOptIn: e.target.checked }))} /> WhatsApp opt-in</label>
                      <label className="crm-field-span-two">Notes<textarea rows={2} value={contactForm.notes} onChange={(e) => setContactForm((p) => ({ ...p, notes: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Contact</button></div>
                    </form>
                  </section>
                  <section className="card table-wrap">
                    <h4>Contacts</h4>
                    <table>
                      <thead><tr><th>Name</th><th>Account</th><th>Channel</th><th>Role / Influence</th><th>Status</th><th>Owner</th><th>Hierarchy</th></tr></thead>
                      <tbody>
                        {contacts.length === 0 ? <tr><td colSpan={7}>No contacts.</td></tr> : contacts.map((contact) => (
                          <tr key={contact.id}>
                            <td>{contact.first_name} {contact.last_name || ''}</td>
                            <td>{contact.customer_name || contact.customer_number}</td>
                            <td>{contact.preferred_channel || 'PHONE'}<br /><small>{contact.email || contact.phone || '-'}</small></td>
                            <td>{contact.decision_role || contact.title || '-'}<br /><small>{contact.influence_level || 'MEDIUM'}</small></td>
                            <td>{contact.status}{contact.is_primary ? ' | Primary' : ''}<br /><small>{contact.verification_status || 'UNVERIFIED'}</small></td>
                            <td>{contact.owner_name || '-'}</td>
                            <td>{contact.reports_to_name || '-'}<br /><small>{contact.relationship_strength || 'WARM'}</small></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
                <div className="chart-grid three-col">
                  <DonutChartCard title="Decision Role Mix" data={contactInsights.roleMix} totalLabel="Contacts" />
                  <DonutChartCard title="Preferred Channel Mix" data={contactInsights.channelMix} totalLabel="Contacts" />
                  <DonutChartCard title="Influence Mix" data={contactInsights.influenceMix} totalLabel="Contacts" />
                </div>
                <div className="chart-grid two-col">
                  <DonutChartCard title="Verification Mix" data={contactInsights.verificationMix} totalLabel="Contacts" />
                  <DonutChartCard title="Relationship Strength Mix" data={contactInsights.relationshipMix} totalLabel="Contacts" />
                </div>
                <div className="grid three">
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Key Stakeholders</p>
                        <h4>Primary and influential contacts</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {contactInsights.keyStakeholders.length === 0 ? <p className="crm-empty">No key stakeholders tagged yet.</p> : contactInsights.keyStakeholders.map((contact) => (
                        <article key={`stakeholder-${contact.id}`} className="crm-order-insight-card">
                          <strong>{contact.first_name} {contact.last_name || ''}</strong>
                          <p>{contact.customer_name || contact.customer_number}</p>
                          <div className="crm-order-insight-meta">
                            <span>{contact.decision_role || contact.title || '-'}</span>
                            <span>{contact.influence_level || 'MEDIUM'}</span>
                            <span>{contact.is_primary ? 'Primary' : 'Secondary'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Org Hierarchy</p>
                        <h4>Contacts with reporting lines</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {contactInsights.orgContacts.length === 0 ? <p className="crm-empty">No contact hierarchy mapped.</p> : contactInsights.orgContacts.map((contact) => (
                        <article key={`org-${contact.id}`} className="crm-order-insight-card">
                          <strong>{contact.first_name} {contact.last_name || ''}</strong>
                          <p>{contact.decision_role || contact.title || '-'}</p>
                          <div className="crm-order-insight-meta">
                            <span>Reports to {contact.reports_to_name || 'Unknown'}</span>
                            <span>{contact.customer_name || contact.customer_number}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Data And Compliance</p>
                        <h4>Duplicates and do-not-contact</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {contactInsights.duplicateContacts.map((entry) => (
                        <article key={`${entry.type}-${entry.key}`} className="crm-order-insight-card">
                          <strong>{entry.type}: {entry.key}</strong>
                          <div className="crm-order-insight-meta">
                            <span>{entry.contacts.length} duplicates</span>
                            <span>Needs merge review</span>
                          </div>
                        </article>
                      ))}
                      {contactInsights.doNotContactList.map((contact) => (
                        <article key={`dnc-${contact.id}`} className="crm-order-insight-card">
                          <strong>{contact.first_name} {contact.last_name || ''}</strong>
                          <div className="crm-order-insight-meta">
                            <span>Do not contact</span>
                            <span>{contact.customer_name || contact.customer_number}</span>
                          </div>
                        </article>
                      ))}
                      {contactInsights.duplicateContacts.length === 0 && contactInsights.doNotContactList.length === 0 ? <p className="crm-empty">No duplicate or DNC issues right now.</p> : null}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'campaigns' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Campaign</h4>
                    <form className="grid two" onSubmit={createCampaign}>
                      <label>Name<input value={campaignForm.name} onChange={(e) => setCampaignForm((p) => ({ ...p, name: e.target.value }))} required /></label>
                      <label>Type<input value={campaignForm.type} onChange={(e) => setCampaignForm((p) => ({ ...p, type: e.target.value }))} /></label>
                      <label>Status<select value={campaignForm.status} onChange={(e) => setCampaignForm((p) => ({ ...p, status: e.target.value }))}><option value="PLANNED">PLANNED</option><option value="ACTIVE">ACTIVE</option><option value="PAUSED">PAUSED</option><option value="COMPLETED">COMPLETED</option></select></label>
                      <label>Budget<input type="number" min="0" step="0.01" value={campaignForm.budget} onChange={(e) => setCampaignForm((p) => ({ ...p, budget: e.target.value }))} /></label>
                      <label>Expected Revenue<input type="number" min="0" step="0.01" value={campaignForm.expectedRevenue} onChange={(e) => setCampaignForm((p) => ({ ...p, expectedRevenue: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Campaign</button></div>
                    </form>
                  </section>
                  <section className="card table-wrap">
                    <h4>Campaigns</h4>
                    <table>
                      <thead><tr><th>Name</th><th>Status</th><th>Budget</th><th>Expected</th></tr></thead>
                      <tbody>
                        {campaigns.length === 0 ? <tr><td colSpan={4}>No campaigns.</td></tr> : campaigns.map((campaign) => (
                          <tr key={campaign.id}>
                            <td>{campaign.name}</td>
                            <td>{campaign.status}</td>
                            <td>{money(campaign.budget)}</td>
                            <td>{money(campaign.expected_revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'catalog' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Product</h4>
                    <form className="grid two" onSubmit={createProduct}>
                      <label>SKU<input value={productForm.sku} onChange={(e) => setProductForm((p) => ({ ...p, sku: e.target.value }))} required /></label>
                      <label>Name<input value={productForm.name} onChange={(e) => setProductForm((p) => ({ ...p, name: e.target.value }))} required /></label>
                      <label>Family<input value={productForm.family} onChange={(e) => setProductForm((p) => ({ ...p, family: e.target.value }))} /></label>
                      <label>Unit Price<input type="number" min="0" step="0.01" value={productForm.unitPrice} onChange={(e) => setProductForm((p) => ({ ...p, unitPrice: e.target.value }))} /></label>
                      <label>Cost Price<input type="number" min="0" step="0.01" value={productForm.costPrice} onChange={(e) => setProductForm((p) => ({ ...p, costPrice: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Product</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Create Price Book</h4>
                    <form className="grid two" onSubmit={createPriceBook}>
                      <label>Name<input value={priceBookForm.name} onChange={(e) => setPriceBookForm((p) => ({ ...p, name: e.target.value }))} required /></label>
                      <label>Currency<input value={priceBookForm.currencyCode} onChange={(e) => setPriceBookForm((p) => ({ ...p, currencyCode: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Price Book</button></div>
                    </form>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Products</h4>
                    <table><thead><tr><th>SKU</th><th>Name</th><th>Family</th><th>Price</th></tr></thead><tbody>{products.length === 0 ? <tr><td colSpan={4}>No products.</td></tr> : products.map((item) => <tr key={item.id}><td>{item.sku}</td><td>{item.name}</td><td>{item.family || '-'}</td><td>{money(item.unit_price)}</td></tr>)}</tbody></table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Price Books</h4>
                    <table><thead><tr><th>Name</th><th>Currency</th><th>Standard</th></tr></thead><tbody>{priceBooks.length === 0 ? <tr><td colSpan={3}>No price books.</td></tr> : priceBooks.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.currency_code}</td><td>{item.is_standard ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'quotes' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Quote</h4>
                    <form className="grid two" onSubmit={createQuote}>
                      <label>Account<select value={quoteForm.accountId} onChange={(e) => setQuoteForm((p) => ({ ...p, accountId: e.target.value }))} required><option value="">Select account</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_name || customer.customer_number}</option>)}</select></label>
                      <label>Opportunity<select value={quoteForm.opportunityId} onChange={(e) => setQuoteForm((p) => ({ ...p, opportunityId: e.target.value }))}><option value="">No opportunity</option>{opportunities.map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.title}</option>)}</select></label>
                      <label>Price Book<select value={quoteForm.priceBookId} onChange={(e) => setQuoteForm((p) => ({ ...p, priceBookId: e.target.value }))}><option value="">Default</option>{priceBooks.map((priceBook) => <option key={priceBook.id} value={priceBook.id}>{priceBook.name}</option>)}</select></label>
                      <label>Valid Until<input type="date" value={quoteForm.validUntil} onChange={(e) => setQuoteForm((p) => ({ ...p, validUntil: e.target.value }))} /></label>
                      <label>Owner<select value={quoteForm.ownerId} onChange={(e) => setQuoteForm((p) => ({ ...p, ownerId: e.target.value }))}><option value="">Current user</option>{crmUsers.map((userRow) => <option key={userRow.id} value={userRow.id}>{userRow.full_name}</option>)}</select></label>
                      <label className="crm-field-span-two">Notes<textarea rows={2} value={quoteForm.notes} onChange={(e) => setQuoteForm((p) => ({ ...p, notes: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Quote</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Add Quote Line</h4>
                    <form className="grid two" onSubmit={addQuoteLine}>
                      <label>Quote<select value={quoteLineForm.quoteId} onChange={(e) => setQuoteLineForm((p) => ({ ...p, quoteId: e.target.value }))} required><option value="">Select quote</option>{quotes.map((quote) => <option key={quote.id} value={quote.id}>{quote.quote_number}</option>)}</select></label>
                      <label>Product<select value={quoteLineForm.productId} onChange={(e) => setQuoteLineForm((p) => ({ ...p, productId: e.target.value, lineName: e.target.value ? (e.target.selectedOptions[0]?.text || '') : p.lineName }))}><option value="">Manual line</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                      <label>Line Name<input value={quoteLineForm.lineName} onChange={(e) => setQuoteLineForm((p) => ({ ...p, lineName: e.target.value }))} required /></label>
                      <label>Quantity<input type="number" min="1" step="1" value={quoteLineForm.quantity} onChange={(e) => setQuoteLineForm((p) => ({ ...p, quantity: e.target.value }))} /></label>
                      <label>Unit Price<input type="number" min="0" step="0.01" value={quoteLineForm.unitPrice} onChange={(e) => setQuoteLineForm((p) => ({ ...p, unitPrice: e.target.value }))} /></label>
                      <label>Discount %<input type="number" min="0" max="100" step="0.01" value={quoteLineForm.discountPercent} onChange={(e) => setQuoteLineForm((p) => ({ ...p, discountPercent: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Add Line</button></div>
                    </form>
                  </section>
                </div>
                <div className="chart-grid two-col">
                  <DonutChartCard title="Quote Status Mix" data={quoteInsights.statusMix} totalLabel="Quotes" />
                  <BarChartCard title="Quote Value By Account" data={quoteInsights.accountValueMix} yLabel="Quote value" format="currency" />
                </div>
                <div className="grid two">
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Expiring Quotes</p>
                        <h4>Quotes needing action</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {quoteInsights.expiringQuotes.length === 0 ? <p className="crm-empty">No expiring quotes.</p> : quoteInsights.expiringQuotes.map((quote) => (
                        <article key={`expiring-quote-${quote.id}`} className="crm-order-insight-card">
                          <strong>{quote.quote_number}</strong>
                          <p>{quote.customer_name || quote.customer_number}</p>
                          <div className="crm-order-insight-meta">
                            <span>{quote.status}</span>
                            <span>{quote.validDays < 0 ? 'Expired' : `${quote.validDays} days left`}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">High Value Quotes</p>
                        <h4>Commercial focus queue</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {quoteInsights.highValueQuotes.length === 0 ? <p className="crm-empty">No high-value quotes.</p> : quoteInsights.highValueQuotes.map((quote) => (
                        <article key={`high-quote-${quote.id}`} className="crm-order-insight-card">
                          <strong>{quote.quote_number}</strong>
                          <p>{quote.customer_name || quote.customer_number}</p>
                          <div className="crm-order-insight-meta">
                            <span>{money(quote.grand_total)}</span>
                            <span>{quote.status}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
                <section className="card table-wrap">
                  <h4>Quotes</h4>
                  <table>
                    <thead><tr><th>Quote #</th><th>Account</th><th>Status</th><th>Valid Until</th><th>Total</th><th>Action</th></tr></thead>
                    <tbody>
                      {quotes.length === 0 ? <tr><td colSpan={6}>No quotes.</td></tr> : quotes.map((quote) => (
                        <tr key={quote.id}>
                          <td>{quote.quote_number}</td>
                          <td>{quote.customer_name || quote.customer_number}</td>
                          <td>{quote.status}</td>
                          <td>{dateOnly(quote.valid_until) || '-'}</td>
                          <td>{money(quote.grand_total)}</td>
                          <td className="actions-cell">
                            <button type="button" className="button-secondary" onClick={() => api.put(`/crm/quotes/${quote.id}/status`, { status: 'SENT' }).then(loadQuotes)}>Mark SENT</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )}

            {workspaceTab === 'governance' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Assignment Rule</h4>
                    <form className="grid two" onSubmit={createAssignmentRule}>
                      <label>Name<input value={assignmentRuleForm.name} onChange={(e) => setAssignmentRuleForm((p) => ({ ...p, name: e.target.value }))} required /></label>
                      <label>Entity<select value={assignmentRuleForm.entityType} onChange={(e) => setAssignmentRuleForm((p) => ({ ...p, entityType: e.target.value }))}><option value="LEAD">LEAD</option><option value="CASE">CASE</option><option value="TASK">TASK</option><option value="OPPORTUNITY">OPPORTUNITY</option></select></label>
                      <label className="crm-field-span-two">Criteria JSON<textarea rows={3} value={assignmentRuleForm.criteria} onChange={(e) => setAssignmentRuleForm((p) => ({ ...p, criteria: e.target.value }))} /></label>
                      <label className="crm-field-span-two">Action JSON<textarea rows={3} value={assignmentRuleForm.action} onChange={(e) => setAssignmentRuleForm((p) => ({ ...p, action: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Rule</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Create SLA Policy</h4>
                    <form className="grid two" onSubmit={createSlaPolicy}>
                      <label>Name<input value={slaForm.name} onChange={(e) => setSlaForm((p) => ({ ...p, name: e.target.value }))} required /></label>
                      <label>Entity<select value={slaForm.entityType} onChange={(e) => setSlaForm((p) => ({ ...p, entityType: e.target.value }))}><option value="CASE">CASE</option><option value="TASK">TASK</option></select></label>
                      <label>Priority<select value={slaForm.priority} onChange={(e) => setSlaForm((p) => ({ ...p, priority: e.target.value }))}><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option></select></label>
                      <label>First Response (min)<input type="number" min="1" value={slaForm.firstResponseMinutes} onChange={(e) => setSlaForm((p) => ({ ...p, firstResponseMinutes: e.target.value }))} /></label>
                      <label>Resolution (min)<input type="number" min="1" value={slaForm.resolutionMinutes} onChange={(e) => setSlaForm((p) => ({ ...p, resolutionMinutes: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create SLA</button></div>
                    </form>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Assignment Rules</h4>
                    <table><thead><tr><th>Name</th><th>Entity</th><th>Active</th></tr></thead><tbody>{assignmentRules.length === 0 ? <tr><td colSpan={3}>No rules.</td></tr> : assignmentRules.map((rule) => <tr key={rule.id}><td>{rule.name}</td><td>{rule.entity_type}</td><td>{rule.is_active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
                  </section>
                  <section className="card table-wrap">
                    <h4>SLA Policies</h4>
                    <table><thead><tr><th>Name</th><th>Entity</th><th>Priority</th><th>First Response</th><th>Resolution</th></tr></thead><tbody>{slaPolicies.length === 0 ? <tr><td colSpan={5}>No SLA policies.</td></tr> : slaPolicies.map((policy) => <tr key={policy.id}><td>{policy.name}</td><td>{policy.entity_type}</td><td>{policy.priority || '-'}</td><td>{policy.first_response_minutes}</td><td>{policy.resolution_minutes}</td></tr>)}</tbody></table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'knowledge' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Knowledge Article</h4>
                    <form className="grid two" onSubmit={createKnowledgeArticle}>
                      <label>Title<input value={articleForm.title} onChange={(e) => setArticleForm((p) => ({ ...p, title: e.target.value }))} required /></label>
                      <label>Category<select value={articleForm.category} onChange={(e) => setArticleForm((p) => ({ ...p, category: e.target.value }))}><option value="GENERAL">GENERAL</option><option value="SERVICE">SERVICE</option><option value="SALES">SALES</option><option value="FINANCE">FINANCE</option></select></label>
                      <label>Status<select value={articleForm.status} onChange={(e) => setArticleForm((p) => ({ ...p, status: e.target.value }))}><option value="DRAFT">DRAFT</option><option value="PUBLISHED">PUBLISHED</option><option value="ARCHIVED">ARCHIVED</option></select></label>
                      <label className="crm-field-span-two">Summary<input value={articleForm.summary} onChange={(e) => setArticleForm((p) => ({ ...p, summary: e.target.value }))} /></label>
                      <label className="crm-field-span-two">Body<textarea rows={6} value={articleForm.bodyMarkdown} onChange={(e) => setArticleForm((p) => ({ ...p, bodyMarkdown: e.target.value }))} required /></label>
                      <div className="actions-cell"><button type="submit">Create Article</button></div>
                    </form>
                  </section>
                  <section className="card table-wrap">
                    <h4>Knowledge Library</h4>
                    <table>
                      <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Published</th></tr></thead>
                      <tbody>
                        {knowledgeArticles.length === 0 ? <tr><td colSpan={4}>No articles.</td></tr> : knowledgeArticles.map((article) => (
                          <tr key={article.id}>
                            <td>{article.title}</td>
                            <td>{article.category || '-'}</td>
                            <td>{article.status}</td>
                            <td>{dateOnly(article.published_at) || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'entitlements' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Entitlement Plan</h4>
                    <form className="grid two" onSubmit={createEntitlement}>
                      <label>Account<select value={entitlementForm.accountId} onChange={(e) => setEntitlementForm((p) => ({ ...p, accountId: e.target.value }))} required><option value="">Select account</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_name || customer.customer_number}</option>)}</select></label>
                      <label>Plan Name<input value={entitlementForm.planName} onChange={(e) => setEntitlementForm((p) => ({ ...p, planName: e.target.value }))} required /></label>
                      <label>Tier<select value={entitlementForm.tier} onChange={(e) => setEntitlementForm((p) => ({ ...p, tier: e.target.value }))}><option value="STANDARD">STANDARD</option><option value="PREMIUM">PREMIUM</option><option value="ENTERPRISE">ENTERPRISE</option></select></label>
                      <label>Start Date<input type="date" value={entitlementForm.startDate} onChange={(e) => setEntitlementForm((p) => ({ ...p, startDate: e.target.value }))} required /></label>
                      <label>End Date<input type="date" value={entitlementForm.endDate} onChange={(e) => setEntitlementForm((p) => ({ ...p, endDate: e.target.value }))} /></label>
                      <label>First Response (min)<input type="number" min="1" value={entitlementForm.firstResponseTargetMinutes} onChange={(e) => setEntitlementForm((p) => ({ ...p, firstResponseTargetMinutes: e.target.value }))} /></label>
                      <label>Resolution (min)<input type="number" min="1" value={entitlementForm.resolutionTargetMinutes} onChange={(e) => setEntitlementForm((p) => ({ ...p, resolutionTargetMinutes: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Entitlement</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Create Case Milestone</h4>
                    <form className="grid two" onSubmit={createMilestone}>
                      <label>Case<select value={milestoneForm.caseId} onChange={(e) => setMilestoneForm((p) => ({ ...p, caseId: e.target.value }))} required><option value="">Select case</option>{cases.map((item) => <option key={item.id} value={item.id}>{item.case_number || item.subject}</option>)}</select></label>
                      <label>Entitlement<select value={milestoneForm.entitlementId} onChange={(e) => setMilestoneForm((p) => ({ ...p, entitlementId: e.target.value }))}><option value="">None</option>{entitlements.map((item) => <option key={item.id} value={item.id}>{item.plan_name}</option>)}</select></label>
                      <label>Milestone Name<input value={milestoneForm.milestoneName} onChange={(e) => setMilestoneForm((p) => ({ ...p, milestoneName: e.target.value }))} required /></label>
                      <label>Target At<input type="datetime-local" value={milestoneForm.targetAt} onChange={(e) => setMilestoneForm((p) => ({ ...p, targetAt: e.target.value }))} required /></label>
                      <div className="actions-cell"><button type="submit">Create Milestone</button></div>
                    </form>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Entitlements</h4>
                    <table>
                      <thead><tr><th>Account</th><th>Plan</th><th>Tier</th><th>Start</th><th>End</th></tr></thead>
                      <tbody>
                        {entitlements.length === 0 ? <tr><td colSpan={5}>No entitlements.</td></tr> : entitlements.map((item) => (
                          <tr key={item.id}>
                            <td>{item.customer_name || item.customer_number}</td>
                            <td>{item.plan_name}</td>
                            <td>{item.tier}</td>
                            <td>{dateOnly(item.start_date)}</td>
                            <td>{dateOnly(item.end_date) || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Case Milestones</h4>
                    <table>
                      <thead><tr><th>Case</th><th>Milestone</th><th>Target</th><th>Status</th><th>Action</th></tr></thead>
                      <tbody>
                        {milestones.length === 0 ? <tr><td colSpan={5}>No milestones.</td></tr> : milestones.map((item) => (
                          <tr key={item.id}>
                            <td>{item.case_subject || `Case #${item.case_id}`}</td>
                            <td>{item.milestone_name}</td>
                            <td>{String(item.target_at || '').slice(0, 16).replace('T', ' ')}</td>
                            <td>{item.status}</td>
                            <td className="actions-cell">
                              <button type="button" className="button-secondary" disabled={item.status === 'COMPLETED'} onClick={() => markMilestoneComplete(item.id)}>Complete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'territories' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Territory</h4>
                    <form className="grid two" onSubmit={createTerritory}>
                      <label>Name<input value={territoryForm.name} onChange={(e) => setTerritoryForm((p) => ({ ...p, name: e.target.value }))} required /></label>
                      <label>Region Code<input value={territoryForm.regionCode} onChange={(e) => setTerritoryForm((p) => ({ ...p, regionCode: e.target.value }))} /></label>
                      <label>Manager<select value={territoryForm.managerUserId} onChange={(e) => setTerritoryForm((p) => ({ ...p, managerUserId: e.target.value }))}><option value="">None</option>{crmUsers.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label>
                      <label className="crm-field-span-two">Description<input value={territoryForm.description} onChange={(e) => setTerritoryForm((p) => ({ ...p, description: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Territory</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Assign Account to Territory</h4>
                    <form className="grid two" onSubmit={assignTerritory}>
                      <label>Territory<select value={territoryAssignmentForm.territoryId} onChange={(e) => setTerritoryAssignmentForm((p) => ({ ...p, territoryId: e.target.value }))} required><option value="">Select territory</option>{territories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                      <label>Account<select value={territoryAssignmentForm.accountId} onChange={(e) => setTerritoryAssignmentForm((p) => ({ ...p, accountId: e.target.value }))} required><option value="">Select account</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_name || customer.customer_number}</option>)}</select></label>
                      <div className="actions-cell"><button type="submit">Assign</button></div>
                    </form>
                  </section>
                </div>
                <section className="card table-wrap">
                  <h4>Territory Model</h4>
                  <table>
                    <thead><tr><th>Name</th><th>Region</th><th>Manager</th><th>Accounts</th><th>Active</th></tr></thead>
                    <tbody>
                      {territories.length === 0 ? <tr><td colSpan={5}>No territories.</td></tr> : territories.map((item) => (
                        <tr key={item.id}>
                          <td>{item.name}</td>
                          <td>{item.region_code || '-'}</td>
                          <td>{item.manager_name || '-'}</td>
                          <td>{Number(item.account_count || 0)}</td>
                          <td>{item.is_active ? 'Yes' : 'No'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )}

            {workspaceTab === 'subscriptions' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Report Subscription</h4>
                    <form className="grid two" onSubmit={createSubscription}>
                      <label>Report Name<input value={subscriptionForm.reportName} onChange={(e) => setSubscriptionForm((p) => ({ ...p, reportName: e.target.value }))} required /></label>
                      <label>Subscriber<select value={subscriptionForm.subscriberUserId} onChange={(e) => setSubscriptionForm((p) => ({ ...p, subscriberUserId: e.target.value }))}><option value="">Current user</option>{crmUsers.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label>
                      <label>Schedule<select value={subscriptionForm.scheduleType} onChange={(e) => setSubscriptionForm((p) => ({ ...p, scheduleType: e.target.value }))}><option value="DAILY">DAILY</option><option value="WEEKLY">WEEKLY</option><option value="MONTHLY">MONTHLY</option></select></label>
                      <label>Channel<select value={subscriptionForm.deliveryChannel} onChange={(e) => setSubscriptionForm((p) => ({ ...p, deliveryChannel: e.target.value }))}><option value="IN_APP">IN_APP</option><option value="EMAIL">EMAIL</option><option value="WEBHOOK">WEBHOOK</option></select></label>
                      <div className="actions-cell"><button type="submit">Create Subscription</button></div>
                    </form>
                  </section>
                  <section className="card table-wrap">
                    <h4>Subscriptions</h4>
                    <table>
                      <thead><tr><th>Report</th><th>Subscriber</th><th>Schedule</th><th>Channel</th><th>Active</th></tr></thead>
                      <tbody>
                        {subscriptions.length === 0 ? <tr><td colSpan={5}>No subscriptions.</td></tr> : subscriptions.map((item) => (
                          <tr key={item.id}>
                            <td>{item.report_name}</td>
                            <td>{item.subscriber_name || `User #${item.subscriber_user_id}`}</td>
                            <td>{item.schedule_type}</td>
                            <td>{item.delivery_channel}</td>
                            <td>{item.active ? 'Yes' : 'No'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'integrations' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Register Webhook</h4>
                    <form className="grid two" onSubmit={createWebhook}>
                      <label>Name<input value={webhookForm.name} onChange={(e) => setWebhookForm((p) => ({ ...p, name: e.target.value }))} required /></label>
                      <label>Target URL<input value={webhookForm.targetUrl} onChange={(e) => setWebhookForm((p) => ({ ...p, targetUrl: e.target.value }))} required /></label>
                      <label className="crm-field-span-two">Event Types (comma-separated)<input value={webhookForm.eventTypes} onChange={(e) => setWebhookForm((p) => ({ ...p, eventTypes: e.target.value }))} /></label>
                      <label>Retry Limit<input type="number" min="1" max="10" value={webhookForm.retryLimit} onChange={(e) => setWebhookForm((p) => ({ ...p, retryLimit: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Webhook</button></div>
                    </form>
                  </section>
                  <section className="card table-wrap">
                    <h4>Webhook Endpoints</h4>
                    <table>
                      <thead><tr><th>Name</th><th>Target</th><th>Events</th><th>Status</th><th>Retry</th></tr></thead>
                      <tbody>
                        {webhooks.length === 0 ? <tr><td colSpan={5}>No webhooks.</td></tr> : webhooks.map((item) => (
                          <tr key={item.id}>
                            <td>{item.name}</td>
                            <td>{item.target_url}</td>
                            <td>{Array.isArray(item.event_types) ? item.event_types.join(', ') : ''}</td>
                            <td>{item.is_active ? 'Active' : 'Inactive'}</td>
                            <td>{item.retry_limit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'object_manager' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Custom Object</h4>
                    <form className="grid two" onSubmit={createCustomObject}>
                      <label>API Name<input value={objectForm.apiName} onChange={(e) => setObjectForm((p) => ({ ...p, apiName: e.target.value }))} required /></label>
                      <label>Label<input value={objectForm.label} onChange={(e) => setObjectForm((p) => ({ ...p, label: e.target.value }))} required /></label>
                      <label>Plural Label<input value={objectForm.pluralLabel} onChange={(e) => setObjectForm((p) => ({ ...p, pluralLabel: e.target.value }))} required /></label>
                      <label>Sharing<select value={objectForm.sharingModel} onChange={(e) => setObjectForm((p) => ({ ...p, sharingModel: e.target.value }))}><option value="PRIVATE">PRIVATE</option><option value="PUBLIC_READ_ONLY">PUBLIC_READ_ONLY</option><option value="PUBLIC_READ_WRITE">PUBLIC_READ_WRITE</option></select></label>
                      <label>Status<select value={objectForm.deploymentStatus} onChange={(e) => setObjectForm((p) => ({ ...p, deploymentStatus: e.target.value }))}><option value="DEPLOYED">DEPLOYED</option><option value="IN_DEVELOPMENT">IN_DEVELOPMENT</option></select></label>
                      <div className="actions-cell"><button type="submit">Create Object</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Create Custom Field</h4>
                    <form className="grid two" onSubmit={createCustomField}>
                      <label>Object<select value={fieldForm.objectId} onChange={(e) => setFieldForm((p) => ({ ...p, objectId: e.target.value }))} required><option value="">Select object</option>{customObjects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                      <label>API Name<input value={fieldForm.apiName} onChange={(e) => setFieldForm((p) => ({ ...p, apiName: e.target.value }))} required /></label>
                      <label>Label<input value={fieldForm.label} onChange={(e) => setFieldForm((p) => ({ ...p, label: e.target.value }))} required /></label>
                      <label>Type<select value={fieldForm.dataType} onChange={(e) => setFieldForm((p) => ({ ...p, dataType: e.target.value }))}><option value="TEXT">TEXT</option><option value="NUMBER">NUMBER</option><option value="DATE">DATE</option><option value="BOOLEAN">BOOLEAN</option><option value="PICKLIST">PICKLIST</option><option value="LONG_TEXT">LONG_TEXT</option></select></label>
                      <div className="actions-cell"><button type="submit">Create Field</button></div>
                    </form>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card">
                    <h4>Create Record Type</h4>
                    <form className="grid two" onSubmit={createRecordType}>
                      <label>Object<select value={recordTypeForm.objectId} onChange={(e) => setRecordTypeForm((p) => ({ ...p, objectId: e.target.value }))} required><option value="">Select object</option>{customObjects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                      <label>Developer Name<input value={recordTypeForm.developerName} onChange={(e) => setRecordTypeForm((p) => ({ ...p, developerName: e.target.value }))} required /></label>
                      <label>Label<input value={recordTypeForm.label} onChange={(e) => setRecordTypeForm((p) => ({ ...p, label: e.target.value }))} required /></label>
                      <div className="actions-cell"><button type="submit">Create Record Type</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Create Page Layout</h4>
                    <form className="grid two" onSubmit={createPageLayout}>
                      <label>Object<select value={layoutForm.objectId} onChange={(e) => setLayoutForm((p) => ({ ...p, objectId: e.target.value }))} required><option value="">Select object</option>{customObjects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
                      <label>Layout Name<input value={layoutForm.layoutName} onChange={(e) => setLayoutForm((p) => ({ ...p, layoutName: e.target.value }))} required /></label>
                      <label className="crm-field-span-two">Sections JSON<textarea rows={4} value={layoutForm.sections} onChange={(e) => setLayoutForm((p) => ({ ...p, sections: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Layout</button></div>
                    </form>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Custom Objects</h4>
                    <table><thead><tr><th>API</th><th>Label</th><th>Sharing</th></tr></thead><tbody>{customObjects.length === 0 ? <tr><td colSpan={3}>No objects.</td></tr> : customObjects.map((item) => <tr key={item.id}><td>{item.api_name}</td><td>{item.label}</td><td>{item.sharing_model}</td></tr>)}</tbody></table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Custom Fields</h4>
                    <table><thead><tr><th>Object</th><th>API</th><th>Label</th><th>Type</th></tr></thead><tbody>{customFields.length === 0 ? <tr><td colSpan={4}>No fields.</td></tr> : customFields.map((item) => <tr key={item.id}><td>{item.object_id}</td><td>{item.api_name}</td><td>{item.label}</td><td>{item.data_type}</td></tr>)}</tbody></table>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Record Types</h4>
                    <table><thead><tr><th>Object</th><th>Developer Name</th><th>Label</th></tr></thead><tbody>{recordTypes.length === 0 ? <tr><td colSpan={3}>No record types.</td></tr> : recordTypes.map((item) => <tr key={item.id}><td>{item.object_id}</td><td>{item.developer_name}</td><td>{item.label}</td></tr>)}</tbody></table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Page Layouts</h4>
                    <table><thead><tr><th>Object</th><th>Layout</th><th>Active</th></tr></thead><tbody>{pageLayouts.length === 0 ? <tr><td colSpan={3}>No layouts.</td></tr> : pageLayouts.map((item) => <tr key={item.id}><td>{item.object_id}</td><td>{item.layout_name}</td><td>{item.active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'security_model' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Role Node</h4>
                    <form className="grid two" onSubmit={createRoleNode}>
                      <label>Role Name<input value={roleNodeForm.roleName} onChange={(e) => setRoleNodeForm((p) => ({ ...p, roleName: e.target.value }))} required /></label>
                      <label>Parent Role<select value={roleNodeForm.parentRoleId} onChange={(e) => setRoleNodeForm((p) => ({ ...p, parentRoleId: e.target.value }))}><option value="">None</option>{roleNodes.map((item) => <option key={item.id} value={item.id}>{item.role_name}</option>)}</select></label>
                      <label>Owner<select value={roleNodeForm.ownerUserId} onChange={(e) => setRoleNodeForm((p) => ({ ...p, ownerUserId: e.target.value }))}><option value="">None</option>{crmUsers.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label>
                      <div className="actions-cell"><button type="submit">Create Role</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Update Org-Wide Default</h4>
                    <form className="grid two" onSubmit={saveOrgWideDefault}>
                      <label>Object<select value={owdForm.objectName} onChange={(e) => setOwdForm((p) => ({ ...p, objectName: e.target.value }))}><option value="ACCOUNT">ACCOUNT</option><option value="OPPORTUNITY">OPPORTUNITY</option><option value="CASE">CASE</option></select></label>
                      <label>Internal<select value={owdForm.internalAccess} onChange={(e) => setOwdForm((p) => ({ ...p, internalAccess: e.target.value }))}><option value="PRIVATE">PRIVATE</option><option value="PUBLIC_READ_ONLY">PUBLIC_READ_ONLY</option><option value="PUBLIC_READ_WRITE">PUBLIC_READ_WRITE</option></select></label>
                      <label>External<select value={owdForm.externalAccess} onChange={(e) => setOwdForm((p) => ({ ...p, externalAccess: e.target.value }))}><option value="PRIVATE">PRIVATE</option><option value="PUBLIC_READ_ONLY">PUBLIC_READ_ONLY</option><option value="PUBLIC_READ_WRITE">PUBLIC_READ_WRITE</option></select></label>
                      <div className="actions-cell"><button type="submit">Save OWD</button></div>
                    </form>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card">
                    <h4>Create Sharing Rule</h4>
                    <form className="grid two" onSubmit={createSharingRule}>
                      <label>Object<select value={sharingRuleForm.objectName} onChange={(e) => setSharingRuleForm((p) => ({ ...p, objectName: e.target.value }))}><option value="ACCOUNT">ACCOUNT</option><option value="OPPORTUNITY">OPPORTUNITY</option><option value="CASE">CASE</option></select></label>
                      <label>Rule Name<input value={sharingRuleForm.ruleName} onChange={(e) => setSharingRuleForm((p) => ({ ...p, ruleName: e.target.value }))} required /></label>
                      <label>Grant<select value={sharingRuleForm.grantAccess} onChange={(e) => setSharingRuleForm((p) => ({ ...p, grantAccess: e.target.value }))}><option value="READ">READ</option><option value="EDIT">EDIT</option></select></label>
                      <label>Target Scope<select value={sharingRuleForm.targetScope} onChange={(e) => setSharingRuleForm((p) => ({ ...p, targetScope: e.target.value }))}><option value="ROLE">ROLE</option><option value="PUBLIC_GROUP">PUBLIC_GROUP</option><option value="USER">USER</option></select></label>
                      <label>Target Identifier<input value={sharingRuleForm.targetIdentifier} onChange={(e) => setSharingRuleForm((p) => ({ ...p, targetIdentifier: e.target.value }))} required /></label>
                      <label className="crm-field-span-two">Criteria JSON<textarea rows={3} value={sharingRuleForm.criteria} onChange={(e) => setSharingRuleForm((p) => ({ ...p, criteria: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Rule</button></div>
                    </form>
                  </section>
                  <section className="card table-wrap">
                    <h4>Role Hierarchy</h4>
                    <table><thead><tr><th>Role</th><th>Parent</th><th>Owner</th></tr></thead><tbody>{roleNodes.length === 0 ? <tr><td colSpan={3}>No roles.</td></tr> : roleNodes.map((item) => <tr key={item.id}><td>{item.role_name}</td><td>{item.parent_role_id || '-'}</td><td>{item.owner_name || '-'}</td></tr>)}</tbody></table>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Org-Wide Defaults</h4>
                    <table><thead><tr><th>Object</th><th>Internal</th><th>External</th></tr></thead><tbody>{owdRows.length === 0 ? <tr><td colSpan={3}>No OWD rows.</td></tr> : owdRows.map((item) => <tr key={item.id}><td>{item.object_name}</td><td>{item.internal_access}</td><td>{item.external_access}</td></tr>)}</tbody></table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Sharing Rules</h4>
                    <table><thead><tr><th>Name</th><th>Object</th><th>Access</th><th>Target</th></tr></thead><tbody>{sharingRules.length === 0 ? <tr><td colSpan={4}>No sharing rules.</td></tr> : sharingRules.map((item) => <tr key={item.id}><td>{item.rule_name}</td><td>{item.object_name}</td><td>{item.grant_access}</td><td>{item.target_scope}:{item.target_identifier}</td></tr>)}</tbody></table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'cpq_designer' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Product Bundle</h4>
                    <form className="grid two" onSubmit={createBundle}>
                      <label>Name<input value={bundleForm.bundleName} onChange={(e) => setBundleForm((p) => ({ ...p, bundleName: e.target.value }))} required /></label>
                      <label>Code<input value={bundleForm.bundleCode} onChange={(e) => setBundleForm((p) => ({ ...p, bundleCode: e.target.value }))} required /></label>
                      <label>Base Price<input type="number" min="0" step="0.01" value={bundleForm.basePrice} onChange={(e) => setBundleForm((p) => ({ ...p, basePrice: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Bundle</button></div>
                    </form>
                    <hr />
                    <form className="grid two" onSubmit={addBundleItem}>
                      <label>Bundle<select value={bundleItemForm.bundleId} onChange={(e) => setBundleItemForm((p) => ({ ...p, bundleId: e.target.value }))} required><option value="">Select bundle</option>{cpqBundles.map((item) => <option key={item.id} value={item.id}>{item.bundle_name}</option>)}</select></label>
                      <label>Product<select value={bundleItemForm.productId} onChange={(e) => setBundleItemForm((p) => ({ ...p, productId: e.target.value }))} required><option value="">Select product</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                      <label>Quantity<input type="number" min="1" step="1" value={bundleItemForm.quantity} onChange={(e) => setBundleItemForm((p) => ({ ...p, quantity: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Add Bundle Item</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Create Pricing Rule</h4>
                    <form className="grid two" onSubmit={createPricingRule}>
                      <label>Name<input value={pricingRuleForm.ruleName} onChange={(e) => setPricingRuleForm((p) => ({ ...p, ruleName: e.target.value }))} required /></label>
                      <label>Scope<select value={pricingRuleForm.scope} onChange={(e) => setPricingRuleForm((p) => ({ ...p, scope: e.target.value }))}><option value="QUOTE_LINE">QUOTE_LINE</option><option value="QUOTE">QUOTE</option><option value="BUNDLE">BUNDLE</option></select></label>
                      <label>Priority<input type="number" min="1" value={pricingRuleForm.priority} onChange={(e) => setPricingRuleForm((p) => ({ ...p, priority: e.target.value }))} /></label>
                      <label className="crm-field-span-two">Condition JSON<textarea rows={3} value={pricingRuleForm.condition} onChange={(e) => setPricingRuleForm((p) => ({ ...p, condition: e.target.value }))} /></label>
                      <label className="crm-field-span-two">Action JSON<textarea rows={3} value={pricingRuleForm.action} onChange={(e) => setPricingRuleForm((p) => ({ ...p, action: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Pricing Rule</button></div>
                    </form>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card">
                    <h4>Create Discount Schedule</h4>
                    <form className="grid two" onSubmit={createDiscountSchedule}>
                      <label>Name<input value={discountScheduleForm.scheduleName} onChange={(e) => setDiscountScheduleForm((p) => ({ ...p, scheduleName: e.target.value }))} required /></label>
                      <label>Applies To<select value={discountScheduleForm.appliesTo} onChange={(e) => setDiscountScheduleForm((p) => ({ ...p, appliesTo: e.target.value }))}><option value="PRODUCT">PRODUCT</option><option value="BUNDLE">BUNDLE</option></select></label>
                      <label>Target ID<input type="number" min="1" value={discountScheduleForm.targetId} onChange={(e) => setDiscountScheduleForm((p) => ({ ...p, targetId: e.target.value }))} required /></label>
                      <label className="crm-field-span-two">Tiers JSON<textarea rows={3} value={discountScheduleForm.tiers} onChange={(e) => setDiscountScheduleForm((p) => ({ ...p, tiers: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Schedule</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Request Quote Approval</h4>
                    <form className="grid two" onSubmit={requestQuoteApproval}>
                      <label>Quote<select value={quoteApprovalForm.quoteId} onChange={(e) => setQuoteApprovalForm((p) => ({ ...p, quoteId: e.target.value }))} required><option value="">Select quote</option>{quotes.map((item) => <option key={item.id} value={item.id}>{item.quote_number}</option>)}</select></label>
                      <label>Threshold %<input type="number" min="0" step="0.01" value={quoteApprovalForm.thresholdPercent} onChange={(e) => setQuoteApprovalForm((p) => ({ ...p, thresholdPercent: e.target.value }))} /></label>
                      <label>Approver<select value={quoteApprovalForm.approverId} onChange={(e) => setQuoteApprovalForm((p) => ({ ...p, approverId: e.target.value }))}><option value="">Any approver</option>{crmUsers.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label>
                      <div className="actions-cell"><button type="submit">Request Approval</button></div>
                    </form>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Bundles + Items</h4>
                    <table><thead><tr><th>Bundle</th><th>Code</th><th>Base</th></tr></thead><tbody>{cpqBundles.length === 0 ? <tr><td colSpan={3}>No bundles.</td></tr> : cpqBundles.map((item) => <tr key={item.id}><td>{item.bundle_name}</td><td>{item.bundle_code}</td><td>{money(item.base_price)}</td></tr>)}</tbody></table>
                    <table><thead><tr><th>Bundle ID</th><th>Product</th><th>Qty</th></tr></thead><tbody>{cpqBundleItems.length === 0 ? <tr><td colSpan={3}>No bundle items.</td></tr> : cpqBundleItems.map((item) => <tr key={item.id}><td>{item.bundle_id}</td><td>{item.product_name}</td><td>{item.quantity}</td></tr>)}</tbody></table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Pricing, Discounts, Approvals</h4>
                    <table><thead><tr><th>Pricing Rule</th><th>Scope</th><th>Priority</th></tr></thead><tbody>{cpqPricingRules.length === 0 ? <tr><td colSpan={3}>No pricing rules.</td></tr> : cpqPricingRules.map((item) => <tr key={item.id}><td>{item.rule_name}</td><td>{item.scope}</td><td>{item.priority}</td></tr>)}</tbody></table>
                    <table><thead><tr><th>Schedule</th><th>Applies To</th><th>Target</th></tr></thead><tbody>{cpqDiscountSchedules.length === 0 ? <tr><td colSpan={3}>No discount schedules.</td></tr> : cpqDiscountSchedules.map((item) => <tr key={item.id}><td>{item.schedule_name}</td><td>{item.applies_to}</td><td>{item.target_id}</td></tr>)}</tbody></table>
                    <table><thead><tr><th>Quote</th><th>Status</th><th>Action</th></tr></thead><tbody>{cpqQuoteApprovals.length === 0 ? <tr><td colSpan={3}>No quote approvals.</td></tr> : cpqQuoteApprovals.map((item) => <tr key={item.id}><td>{item.quote_number}</td><td>{item.status}</td><td className="actions-cell">{item.status === 'PENDING' ? <><button type="button" onClick={() => decideQuoteApproval(item.id, 'APPROVED')}>Approve</button><button type="button" className="button-secondary" onClick={() => decideQuoteApproval(item.id, 'REJECTED')}>Reject</button></> : '-'}</td></tr>)}</tbody></table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'flow_builder' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Flow</h4>
                    <form className="grid two" onSubmit={createFlow}>
                      <label>Flow Name<input value={flowForm.flowName} onChange={(e) => setFlowForm((p) => ({ ...p, flowName: e.target.value }))} required /></label>
                      <label>Type<select value={flowForm.flowType} onChange={(e) => setFlowForm((p) => ({ ...p, flowType: e.target.value }))}><option value="RECORD_TRIGGERED">RECORD_TRIGGERED</option><option value="SCHEDULED">SCHEDULED</option><option value="SCREEN">SCREEN</option></select></label>
                      <label>Trigger Object<input value={flowForm.triggerObject} onChange={(e) => setFlowForm((p) => ({ ...p, triggerObject: e.target.value }))} /></label>
                      <label>Trigger Event<input value={flowForm.triggerEvent} onChange={(e) => setFlowForm((p) => ({ ...p, triggerEvent: e.target.value }))} /></label>
                      <label className="crm-field-span-two">Definition JSON<textarea rows={4} value={flowForm.definition} onChange={(e) => setFlowForm((p) => ({ ...p, definition: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Flow</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Simulate Flow</h4>
                    <form className="grid two" onSubmit={simulateFlow}>
                      <label>Flow<select value={flowRunForm.flowId} onChange={(e) => setFlowRunForm((p) => ({ ...p, flowId: e.target.value }))} required><option value="">Select flow</option>{flows.map((item) => <option key={item.id} value={item.id}>{item.flow_name}</option>)}</select></label>
                      <label className="crm-field-span-two">Context JSON<textarea rows={4} value={flowRunForm.context} onChange={(e) => setFlowRunForm((p) => ({ ...p, context: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Run Simulation</button></div>
                    </form>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Flow Definitions</h4>
                    <table><thead><tr><th>Name</th><th>Type</th><th>Trigger</th><th>Version</th><th>Active</th></tr></thead><tbody>{flows.length === 0 ? <tr><td colSpan={5}>No flows.</td></tr> : flows.map((item) => <tr key={item.id}><td>{item.flow_name}</td><td>{item.flow_type}</td><td>{item.trigger_object || '-'} {item.trigger_event || ''}</td><td>{item.version_number}</td><td>{item.active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Flow Runs</h4>
                    <table><thead><tr><th>Flow</th><th>Status</th><th>Started</th><th>Finished</th></tr></thead><tbody>{flowRuns.length === 0 ? <tr><td colSpan={4}>No runs.</td></tr> : flowRuns.map((item) => <tr key={item.id}><td>{item.flow_name}</td><td>{item.status}</td><td>{String(item.started_at || '').slice(0, 19).replace('T', ' ')}</td><td>{String(item.finished_at || '').slice(0, 19).replace('T', ' ')}</td></tr>)}</tbody></table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'omnichannel' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Queue</h4>
                    <form className="grid two" onSubmit={createQueue}>
                      <label>Name<input value={queueForm.queueName} onChange={(e) => setQueueForm((p) => ({ ...p, queueName: e.target.value }))} required /></label>
                      <label>Channel<select value={queueForm.channelType} onChange={(e) => setQueueForm((p) => ({ ...p, channelType: e.target.value }))}><option value="CASE">CASE</option><option value="CHAT">CHAT</option><option value="VOICE">VOICE</option><option value="TASK">TASK</option></select></label>
                      <label>Priority Model<select value={queueForm.priorityModel} onChange={(e) => setQueueForm((p) => ({ ...p, priorityModel: e.target.value }))}><option value="FIFO">FIFO</option><option value="PRIORITY">PRIORITY</option><option value="SLA_FIRST">SLA_FIRST</option></select></label>
                      <div className="actions-cell"><button type="submit">Create Queue</button></div>
                    </form>
                    <hr />
                    <form className="grid two" onSubmit={saveSkill}>
                      <label>User<select value={skillForm.userId} onChange={(e) => setSkillForm((p) => ({ ...p, userId: e.target.value }))} required><option value="">Select user</option>{crmUsers.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label>
                      <label>Skill<input value={skillForm.skillName} onChange={(e) => setSkillForm((p) => ({ ...p, skillName: e.target.value }))} required /></label>
                      <label>Proficiency<input type="number" min="1" max="5" value={skillForm.proficiency} onChange={(e) => setSkillForm((p) => ({ ...p, proficiency: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Save Skill</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Queue Membership + Work Routing</h4>
                    <form className="grid two" onSubmit={saveQueueMember}>
                      <label>Queue<select value={queueMemberForm.queueId} onChange={(e) => setQueueMemberForm((p) => ({ ...p, queueId: e.target.value }))} required><option value="">Select queue</option>{omniQueues.map((item) => <option key={item.id} value={item.id}>{item.queue_name}</option>)}</select></label>
                      <label>User<select value={queueMemberForm.userId} onChange={(e) => setQueueMemberForm((p) => ({ ...p, userId: e.target.value }))} required><option value="">Select user</option>{crmUsers.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label>
                      <label>Capacity<input type="number" min="1" value={queueMemberForm.capacity} onChange={(e) => setQueueMemberForm((p) => ({ ...p, capacity: e.target.value }))} /></label>
                      <label>Presence<select value={queueMemberForm.presenceStatus} onChange={(e) => setQueueMemberForm((p) => ({ ...p, presenceStatus: e.target.value }))}><option value="AVAILABLE">AVAILABLE</option><option value="AWAY">AWAY</option><option value="OFFLINE">OFFLINE</option></select></label>
                      <div className="actions-cell"><button type="submit">Save Membership</button></div>
                    </form>
                    <hr />
                    <form className="grid two" onSubmit={createWorkItem}>
                      <label>Channel<select value={workItemForm.channelType} onChange={(e) => setWorkItemForm((p) => ({ ...p, channelType: e.target.value }))}><option value="CASE">CASE</option><option value="CHAT">CHAT</option><option value="VOICE">VOICE</option><option value="TASK">TASK</option></select></label>
                      <label>Subject<input value={workItemForm.subject} onChange={(e) => setWorkItemForm((p) => ({ ...p, subject: e.target.value }))} required /></label>
                      <label>Priority<select value={workItemForm.priority} onChange={(e) => setWorkItemForm((p) => ({ ...p, priority: e.target.value }))}><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option></select></label>
                      <label>Queue<select value={workItemForm.assignedQueueId} onChange={(e) => setWorkItemForm((p) => ({ ...p, assignedQueueId: e.target.value }))}><option value="">Unassigned</option>{omniQueues.map((item) => <option key={item.id} value={item.id}>{item.queue_name}</option>)}</select></label>
                      <label className="crm-field-span-two">Required Skills (comma-separated)<input value={workItemForm.requiredSkills} onChange={(e) => setWorkItemForm((p) => ({ ...p, requiredSkills: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Work Item</button></div>
                    </form>
                    <hr />
                    <form className="grid two" onSubmit={routeWorkItem}>
                      <label>Work Item<select value={routeForm.workItemId} onChange={(e) => setRouteForm((p) => ({ ...p, workItemId: e.target.value }))} required><option value="">Select item</option>{omniWorkItems.map((item) => <option key={item.id} value={item.id}>{item.subject}</option>)}</select></label>
                      <label>Queue<select value={routeForm.assignedQueueId} onChange={(e) => setRouteForm((p) => ({ ...p, assignedQueueId: e.target.value }))}><option value="">None</option>{omniQueues.map((item) => <option key={item.id} value={item.id}>{item.queue_name}</option>)}</select></label>
                      <label>User<select value={routeForm.assignedUserId} onChange={(e) => setRouteForm((p) => ({ ...p, assignedUserId: e.target.value }))}><option value="">None</option>{crmUsers.map((row) => <option key={row.id} value={row.id}>{row.full_name}</option>)}</select></label>
                      <div className="actions-cell"><button type="submit">Route Item</button></div>
                    </form>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Queues + Members</h4>
                    <table><thead><tr><th>Queue</th><th>Channel</th><th>Model</th></tr></thead><tbody>{omniQueues.length === 0 ? <tr><td colSpan={3}>No queues.</td></tr> : omniQueues.map((item) => <tr key={item.id}><td>{item.queue_name}</td><td>{item.channel_type}</td><td>{item.priority_model}</td></tr>)}</tbody></table>
                    <table><thead><tr><th>Queue</th><th>User</th><th>Capacity</th><th>Presence</th></tr></thead><tbody>{omniMembers.length === 0 ? <tr><td colSpan={4}>No members.</td></tr> : omniMembers.map((item) => <tr key={item.id}><td>{item.queue_name}</td><td>{item.full_name}</td><td>{item.capacity}</td><td>{item.presence_status}</td></tr>)}</tbody></table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Skills + Work Items</h4>
                    <table><thead><tr><th>User</th><th>Skill</th><th>Level</th></tr></thead><tbody>{omniSkills.length === 0 ? <tr><td colSpan={3}>No skills.</td></tr> : omniSkills.map((item) => <tr key={item.id}><td>{item.full_name}</td><td>{item.skill_name}</td><td>{item.proficiency}</td></tr>)}</tbody></table>
                    <table><thead><tr><th>Subject</th><th>Priority</th><th>Status</th><th>Queue</th><th>User</th></tr></thead><tbody>{omniWorkItems.length === 0 ? <tr><td colSpan={5}>No work items.</td></tr> : omniWorkItems.map((item) => <tr key={item.id}><td>{item.subject}</td><td>{item.priority}</td><td>{item.status}</td><td>{item.queue_name || '-'}</td><td>{item.assigned_user_name || '-'}</td></tr>)}</tbody></table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'app_marketplace' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Marketplace Apps</h4>
                    <table>
                      <thead><tr><th>App</th><th>Category</th><th>Publisher</th><th>Pricing</th><th>Action</th></tr></thead>
                      <tbody>
                        {marketApps.length === 0 ? <tr><td colSpan={5}>No apps.</td></tr> : marketApps.map((app) => (
                          <tr key={app.id}>
                            <td>{app.app_name}<br /><small>{app.app_key} v{app.version_label}</small></td>
                            <td>{app.category}</td>
                            <td>{app.publisher_name}</td>
                            <td>{app.pricing_model}</td>
                            <td><button type="button" className="button-secondary" onClick={() => installApp(app.id)}>Install</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                  <section className="card">
                    <h4>Update Installed App</h4>
                    <form className="grid two" onSubmit={updateInstalledApp}>
                      <label>Installed App<select value={installedUpdateForm.installedId} onChange={(e) => setInstalledUpdateForm((p) => ({ ...p, installedId: e.target.value }))} required><option value="">Select installed app</option>{installedApps.map((item) => <option key={item.id} value={item.id}>{item.app_name}</option>)}</select></label>
                      <label>Status<select value={installedUpdateForm.status} onChange={(e) => setInstalledUpdateForm((p) => ({ ...p, status: e.target.value }))}><option value="ACTIVE">ACTIVE</option><option value="DISABLED">DISABLED</option><option value="UNINSTALLED">UNINSTALLED</option></select></label>
                      <label className="crm-field-span-two">Config JSON<textarea rows={4} value={installedUpdateForm.config} onChange={(e) => setInstalledUpdateForm((p) => ({ ...p, config: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Update Installed App</button></div>
                    </form>
                  </section>
                </div>
                <section className="card table-wrap">
                  <h4>Installed Apps</h4>
                  <table><thead><tr><th>App</th><th>Status</th><th>Installed At</th></tr></thead><tbody>{installedApps.length === 0 ? <tr><td colSpan={3}>No installed apps.</td></tr> : installedApps.map((item) => <tr key={item.id}><td>{item.app_name}</td><td>{item.status}</td><td>{String(item.installed_at || '').slice(0, 19).replace('T', ' ')}</td></tr>)}</tbody></table>
                </section>
              </div>
            )}

            {workspaceTab === 'metadata_runtime' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Validation Rule</h4>
                    <form className="grid two" onSubmit={createValidationRule}>
                      <label>Object<input value={validationRuleForm.objectName} onChange={(e) => setValidationRuleForm((p) => ({ ...p, objectName: e.target.value }))} /></label>
                      <label>Rule Name<input value={validationRuleForm.ruleName} onChange={(e) => setValidationRuleForm((p) => ({ ...p, ruleName: e.target.value }))} required /></label>
                      <label className="crm-field-span-two">Condition JSON<textarea rows={3} value={validationRuleForm.conditionExpr} onChange={(e) => setValidationRuleForm((p) => ({ ...p, conditionExpr: e.target.value }))} /></label>
                      <label className="crm-field-span-two">Error Message<input value={validationRuleForm.errorMessage} onChange={(e) => setValidationRuleForm((p) => ({ ...p, errorMessage: e.target.value }))} required /></label>
                      <div className="actions-cell"><button type="submit">Create Rule</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Create Formula Field</h4>
                    <form className="grid two" onSubmit={createFormulaField}>
                      <label>Object<input value={formulaFieldForm.objectName} onChange={(e) => setFormulaFieldForm((p) => ({ ...p, objectName: e.target.value }))} /></label>
                      <label>Field Name<input value={formulaFieldForm.fieldName} onChange={(e) => setFormulaFieldForm((p) => ({ ...p, fieldName: e.target.value }))} required /></label>
                      <label>Data Type<select value={formulaFieldForm.dataType} onChange={(e) => setFormulaFieldForm((p) => ({ ...p, dataType: e.target.value }))}><option value="TEXT">TEXT</option><option value="NUMBER">NUMBER</option></select></label>
                      <label className="crm-field-span-two">Formula JSON<textarea rows={3} value={formulaFieldForm.formulaExpr} onChange={(e) => setFormulaFieldForm((p) => ({ ...p, formulaExpr: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Formula</button></div>
                    </form>
                  </section>
                </div>
                <section className="card">
                  <h4>Create Runtime Record</h4>
                  <form className="grid two" onSubmit={createRuntimeRecord}>
                    <label>Object API<input value={runtimeRecordForm.objectApiName} onChange={(e) => setRuntimeRecordForm((p) => ({ ...p, objectApiName: e.target.value }))} /></label>
                    <label>Object Filter<input value={runtimeObjectFilter} onChange={(e) => setRuntimeObjectFilter(e.target.value)} /></label>
                    <label className="crm-field-span-two">Record Data JSON<textarea rows={4} value={runtimeRecordForm.recordData} onChange={(e) => setRuntimeRecordForm((p) => ({ ...p, recordData: e.target.value }))} /></label>
                    <div className="actions-cell"><button type="submit">Create Runtime Record</button><button type="button" className="button-secondary" onClick={loadRuntime}>Refresh Runtime</button></div>
                  </form>
                </section>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Validation Rules</h4>
                    <table><thead><tr><th>Object</th><th>Rule</th><th>Error</th></tr></thead><tbody>{runtimeValidationRules.length === 0 ? <tr><td colSpan={3}>No rules.</td></tr> : runtimeValidationRules.map((rule) => <tr key={rule.id}><td>{rule.object_name}</td><td>{rule.rule_name}</td><td>{rule.error_message}</td></tr>)}</tbody></table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Formula Fields</h4>
                    <table><thead><tr><th>Object</th><th>Field</th><th>Type</th></tr></thead><tbody>{runtimeFormulaFields.length === 0 ? <tr><td colSpan={3}>No formulas.</td></tr> : runtimeFormulaFields.map((formula) => <tr key={formula.id}><td>{formula.object_name}</td><td>{formula.field_name}</td><td>{formula.data_type}</td></tr>)}</tbody></table>
                  </section>
                </div>
                <section className="card table-wrap">
                  <h4>Dynamic Runtime Records</h4>
                  <table><thead><tr><th>Object</th><th>Record Data</th><th>Computed</th></tr></thead><tbody>{runtimeRecords.length === 0 ? <tr><td colSpan={3}>No runtime records.</td></tr> : runtimeRecords.map((record) => <tr key={record.id}><td>{record.object_api_name}</td><td><code>{JSON.stringify(record.record_data)}</code></td><td><code>{JSON.stringify(record.computed_data)}</code></td></tr>)}</tbody></table>
                </section>
              </div>
            )}

            {workspaceTab === 'engine_lab' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Pricing Engine Preview</h4>
                    <form className="grid two" onSubmit={previewPricing}>
                      <label>Product<select value={pricingPreviewForm.productId} onChange={(e) => setPricingPreviewForm((p) => ({ ...p, productId: e.target.value }))}><option value="">None</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                      <label>Quantity<input type="number" min="1" value={pricingPreviewForm.quantity} onChange={(e) => setPricingPreviewForm((p) => ({ ...p, quantity: e.target.value }))} /></label>
                      <label>Unit Price<input type="number" min="0" step="0.01" value={pricingPreviewForm.unitPrice} onChange={(e) => setPricingPreviewForm((p) => ({ ...p, unitPrice: e.target.value }))} /></label>
                      <label>Manual Discount %<input type="number" min="0" step="0.01" value={pricingPreviewForm.manualDiscountPercent} onChange={(e) => setPricingPreviewForm((p) => ({ ...p, manualDiscountPercent: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Preview Pricing</button></div>
                    </form>
                    {pricingPreview && (
                      <div className="crm-inline-summary">
                        <p>Base: {money(pricingPreview.baseTotal)}</p>
                        <p>Discount %: {pricingPreview.discountPercent}</p>
                        <p>Final: {money(pricingPreview.finalTotal)}</p>
                      </div>
                    )}
                  </section>
                  <section className="card">
                    <h4>Routing Engine</h4>
                    <form className="grid two" onSubmit={runRoutingEngine}>
                      <label>Work Item<select value={routingEngineForm.workItemId} onChange={(e) => setRoutingEngineForm((p) => ({ ...p, workItemId: e.target.value }))} required><option value="">Select work item</option>{omniWorkItems.map((item) => <option key={item.id} value={item.id}>{item.subject}</option>)}</select></label>
                      <div className="actions-cell"><button type="submit">Run Routing</button></div>
                    </form>
                    {routingEngineResult && (
                      <div className="crm-inline-summary">
                        <p>Queue: {routingEngineResult.assignment?.queueName}</p>
                        <p>User: {routingEngineResult.assignment?.userName}</p>
                        <p>Score: {routingEngineResult.assignment?.score}</p>
                      </div>
                    )}
                  </section>
                </div>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Flow Publish and Debug</h4>
                    <table>
                      <thead><tr><th>Flow</th><th>Version</th><th>Actions</th></tr></thead>
                      <tbody>
                        {flows.length === 0 ? <tr><td colSpan={3}>No flows.</td></tr> : flows.map((flow) => (
                          <tr key={flow.id}>
                            <td>{flow.flow_name}</td>
                            <td>{flow.version_number}</td>
                            <td className="actions-cell">
                              <button type="button" onClick={() => publishFlow(flow.id)}>Publish</button>
                              <button type="button" className="button-secondary" onClick={() => debugSelectedFlow(flow.id)}>Debug</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Flow Debug Traces</h4>
                    <table><thead><tr><th>Step</th><th>Status</th><th>Payload</th></tr></thead><tbody>{flowDebugTraces.length === 0 ? <tr><td colSpan={3}>No traces.</td></tr> : flowDebugTraces.map((trace) => <tr key={trace.id}><td>{trace.trace_step}</td><td>{trace.status}</td><td><code>{JSON.stringify(trace.payload_json)}</code></td></tr>)}</tbody></table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'ops_center' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Ops Job</h4>
                    <form className="grid two" onSubmit={createOpsJob}>
                      <label>Job Name<input value={opsJobForm.jobName} onChange={(e) => setOpsJobForm((p) => ({ ...p, jobName: e.target.value }))} required /></label>
                      <label>Job Type<select value={opsJobForm.jobType} onChange={(e) => setOpsJobForm((p) => ({ ...p, jobType: e.target.value }))}><option value="SHARING_RECALC">SHARING_RECALC</option><option value="FLOW_SCHEDULE">FLOW_SCHEDULE</option><option value="REPORT_DELIVERY">REPORT_DELIVERY</option><option value="DATA_SYNC">DATA_SYNC</option></select></label>
                      <label>Cron<input value={opsJobForm.scheduleCron} onChange={(e) => setOpsJobForm((p) => ({ ...p, scheduleCron: e.target.value }))} /></label>
                      <label className="crm-field-span-two">Config JSON<textarea rows={3} value={opsJobForm.config} onChange={(e) => setOpsJobForm((p) => ({ ...p, config: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Job</button></div>
                    </form>
                  </section>
                  <section className="card table-wrap">
                    <h4>Jobs</h4>
                    <table>
                      <thead><tr><th>Name</th><th>Type</th><th>Cron</th><th>Action</th></tr></thead>
                      <tbody>
                        {opsJobs.length === 0 ? <tr><td colSpan={4}>No jobs.</td></tr> : opsJobs.map((job) => (
                          <tr key={job.id}>
                            <td>{job.job_name}</td>
                            <td>{job.job_type}</td>
                            <td>{job.schedule_cron || '-'}</td>
                            <td><button type="button" className="button-secondary" onClick={() => runOpsJob(job.id)}>Run Now</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Job Runs</h4>
                    <table><thead><tr><th>Job</th><th>Status</th><th>Started</th><th>Finished</th></tr></thead><tbody>{opsRuns.length === 0 ? <tr><td colSpan={4}>No job runs.</td></tr> : opsRuns.map((run) => <tr key={run.id}><td>{run.job_name}</td><td>{run.status}</td><td>{String(run.started_at || '').slice(0, 19).replace('T', ' ')}</td><td>{String(run.finished_at || '').slice(0, 19).replace('T', ' ')}</td></tr>)}</tbody></table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Setup Audit Log</h4>
                    <table><thead><tr><th>When</th><th>Area</th><th>Action</th><th>Entity</th><th>By</th></tr></thead><tbody>{runtimeAuditLogs.length === 0 ? <tr><td colSpan={5}>No audit logs.</td></tr> : runtimeAuditLogs.map((log) => <tr key={log.id}><td>{String(log.performed_at || '').slice(0, 19).replace('T', ' ')}</td><td>{log.area}</td><td>{log.action}</td><td>{log.entity_type} #{log.entity_id || '-'}</td><td>{log.performed_by_name || log.performed_by || '-'}</td></tr>)}</tbody></table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'package_lifecycle' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Security Review</h4>
                    <form className="grid two" onSubmit={submitPackageReview}>
                      <label>App<select value={packageReviewForm.appId} onChange={(e) => setPackageReviewForm((p) => ({ ...p, appId: e.target.value }))} required><option value="">Select app</option>{marketApps.map((app) => <option key={app.id} value={app.id}>{app.app_name}</option>)}</select></label>
                      <label>Status<select value={packageReviewForm.reviewStatus} onChange={(e) => setPackageReviewForm((p) => ({ ...p, reviewStatus: e.target.value }))}><option value="PENDING">PENDING</option><option value="APPROVED">APPROVED</option><option value="REJECTED">REJECTED</option></select></label>
                      <label className="crm-field-span-two">Findings JSON<textarea rows={3} value={packageReviewForm.findings} onChange={(e) => setPackageReviewForm((p) => ({ ...p, findings: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Submit Review</button></div>
                    </form>
                    <hr />
                    <form className="grid two" onSubmit={addPackageDependency}>
                      <label>App<select value={packageDependencyForm.appId} onChange={(e) => setPackageDependencyForm((p) => ({ ...p, appId: e.target.value }))} required><option value="">Select app</option>{marketApps.map((app) => <option key={app.id} value={app.id}>{app.app_name}</option>)}</select></label>
                      <label>Dependency<select value={packageDependencyForm.dependencyAppId} onChange={(e) => setPackageDependencyForm((p) => ({ ...p, dependencyAppId: e.target.value }))} required><option value="">Select dependency</option>{marketApps.map((app) => <option key={app.id} value={app.id}>{app.app_name}</option>)}</select></label>
                      <label>Min Version<input value={packageDependencyForm.minimumVersion} onChange={(e) => setPackageDependencyForm((p) => ({ ...p, minimumVersion: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Save Dependency</button></div>
                    </form>
                  </section>
                  <section className="card">
                    <h4>Upgrade/Uninstall</h4>
                    <form className="grid two" onSubmit={upgradeInstalledPackage}>
                      <label>Installed App<select value={packageVersionForm.installedId} onChange={(e) => setPackageVersionForm((p) => ({ ...p, installedId: e.target.value }))} required><option value="">Select installed app</option>{installedApps.map((app) => <option key={app.id} value={app.id}>{app.app_name}</option>)}</select></label>
                      <label>Target Version<input value={packageVersionForm.targetVersion} onChange={(e) => setPackageVersionForm((p) => ({ ...p, targetVersion: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Upgrade</button></div>
                    </form>
                    <section className="card table-wrap">
                      <table>
                        <thead><tr><th>Installed</th><th>Status</th><th>Action</th></tr></thead>
                        <tbody>
                          {installedApps.length === 0 ? <tr><td colSpan={3}>No installed apps.</td></tr> : installedApps.map((app) => (
                            <tr key={app.id}>
                              <td>{app.app_name}</td>
                              <td>{app.status}</td>
                              <td><button type="button" className="button-secondary" onClick={() => uninstallPackage(app.id)}>Uninstall</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </section>
                  </section>
                </div>
                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Security Reviews</h4>
                    <table><thead><tr><th>App</th><th>Status</th><th>Reviewed At</th></tr></thead><tbody>{packageReviews.length === 0 ? <tr><td colSpan={3}>No reviews.</td></tr> : packageReviews.map((row) => <tr key={row.id}><td>{row.app_name}</td><td>{row.review_status}</td><td>{String(row.reviewed_at || '').slice(0, 19).replace('T', ' ') || '-'}</td></tr>)}</tbody></table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Dependencies</h4>
                    <table><thead><tr><th>App</th><th>Depends On</th><th>Min Version</th></tr></thead><tbody>{packageDependencies.length === 0 ? <tr><td colSpan={3}>No dependencies.</td></tr> : packageDependencies.map((row) => <tr key={row.id}><td>{row.app_name}</td><td>{row.dependency_name}</td><td>{row.minimum_version || '-'}</td></tr>)}</tbody></table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'deployment_center' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Create Deployment</h4>
                    <form className="grid two" onSubmit={createDeployment}>
                      <label>Name<input value={deploymentForm.deploymentName} onChange={(e) => setDeploymentForm((p) => ({ ...p, deploymentName: e.target.value }))} required /></label>
                      <label>Source<select value={deploymentForm.sourceEnv} onChange={(e) => setDeploymentForm((p) => ({ ...p, sourceEnv: e.target.value }))}><option value="DEV">DEV</option><option value="TEST">TEST</option><option value="PROD">PROD</option></select></label>
                      <label>Target<select value={deploymentForm.targetEnv} onChange={(e) => setDeploymentForm((p) => ({ ...p, targetEnv: e.target.value }))}><option value="DEV">DEV</option><option value="TEST">TEST</option><option value="PROD">PROD</option></select></label>
                      <label className="crm-field-span-two">Items JSON<textarea rows={4} value={deploymentForm.items} onChange={(e) => setDeploymentForm((p) => ({ ...p, items: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Deployment</button></div>
                    </form>
                  </section>
                  <section className="card table-wrap">
                    <h4>Deployments</h4>
                    <table>
                      <thead><tr><th>Name</th><th>From</th><th>To</th><th>Status</th><th>Action</th></tr></thead>
                      <tbody>
                        {deploymentRows.length === 0 ? <tr><td colSpan={5}>No deployments.</td></tr> : deploymentRows.map((dep) => (
                          <tr key={dep.id}>
                            <td>{dep.deployment_name}</td>
                            <td>{dep.source_env}</td>
                            <td>{dep.target_env}</td>
                            <td>{dep.status}</td>
                            <td><button type="button" onClick={() => runDeployment(dep.id)}>Run</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
                <section className="card table-wrap">
                  <h4>Deployment Items</h4>
                  <table><thead><tr><th>Deployment</th><th>Type</th><th>Identifier</th><th>Action</th><th>Status</th></tr></thead><tbody>{deploymentItems.length === 0 ? <tr><td colSpan={5}>No deployment items.</td></tr> : deploymentItems.map((item) => <tr key={item.id}><td>{item.deployment_id}</td><td>{item.item_type}</td><td>{item.item_identifier}</td><td>{item.action}</td><td>{item.status}</td></tr>)}</tbody></table>
                </section>
              </div>
            )}

            {workspaceTab === 'flow_canvas' && (
              <div className="crm-generic-layout">
                <div className="grid two">
                  <section className="card">
                    <h4>Flow Canvas Editor</h4>
                    <div className="grid two">
                      <label>Flow<select value={canvasFlowId} onChange={(e) => setCanvasFlowId(e.target.value)}><option value="">Select flow</option>{flows.map((flow) => <option key={flow.id} value={flow.id}>{flow.flow_name}</option>)}</select></label>
                      <div className="actions-cell"><button type="button" className="button-secondary" onClick={() => openCanvas(canvasFlowId)}>Load Canvas</button></div>
                    </div>
                    <form className="grid two" onSubmit={saveCanvas}>
                      <label className="crm-field-span-two">Nodes JSON<textarea rows={5} value={canvasNodesJson} onChange={(e) => setCanvasNodesJson(e.target.value)} /></label>
                      <label className="crm-field-span-two">Edges JSON<textarea rows={5} value={canvasEdgesJson} onChange={(e) => setCanvasEdgesJson(e.target.value)} /></label>
                      <div className="actions-cell"><button type="submit">Save Canvas</button></div>
                    </form>
                  </section>
                  <section className="card table-wrap">
                    <h4>Canvas Nodes</h4>
                    <table><thead><tr><th>Key</th><th>Type</th><th>Label</th><th>Pos</th></tr></thead><tbody>{canvasNodes.length === 0 ? <tr><td colSpan={4}>No nodes.</td></tr> : canvasNodes.map((node) => <tr key={node.id}><td>{node.node_key}</td><td>{node.node_type}</td><td>{node.label}</td><td>{node.position_x},{node.position_y}</td></tr>)}</tbody></table>
                    <h4>Canvas Edges</h4>
                    <table><thead><tr><th>From</th><th>To</th><th>Condition</th></tr></thead><tbody>{canvasEdges.length === 0 ? <tr><td colSpan={3}>No edges.</td></tr> : canvasEdges.map((edge) => <tr key={edge.id}><td>{edge.from_node_key}</td><td>{edge.to_node_key}</td><td>{edge.condition_label || '-'}</td></tr>)}</tbody></table>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'leads' && (
              <div className="crm-leads-layout">
                <div className="summary-grid">
                  <article className="card"><h4>Total Leads</h4><p className="metric">{Number(leadSummary.total_leads || 0)}</p></article>
                  <article className="card"><h4>Hot Leads</h4><p className="metric">{Number(leadSummary.hot_count || 0)}</p></article>
                  <article className="card"><h4>Working</h4><p className="metric">{Number(leadSummary.working_count || 0)}</p></article>
                  <article className="card"><h4>Qualified</h4><p className="metric">{Number(leadSummary.qualified_count || 0)}</p></article>
                  <article className="card"><h4>SLA Breaches</h4><p className="metric">{Number(leadSummary.sla_breach_count || 0)}</p></article>
                  <article className="card"><h4>Conversion Ready</h4><p className="metric">{Number(leadSummary.conversion_ready_count || 0)}</p></article>
                  <article className="card"><h4>Unassigned</h4><p className="metric">{Number(leadSummary.unassigned_count || 0)}</p></article>
                </div>
                <div className="chart-grid four-col">
                  <DonutChartCard title="Lead Stage Mix" data={leadInsights.stageMix} totalLabel="Leads" />
                  <DonutChartCard title="Lead Temperature" data={leadInsights.tempMix} totalLabel="Leads" />
                  <BarChartCard title="Lead Owner Load" data={leadInsights.ownerLoad} yLabel="Lead load" />
                  <BarChartCard title="Lead Source Mix" data={leadInsights.sourceMix} yLabel="Leads" format="number" />
                </div>
                <div className="card filter-grid">
                  <input placeholder="Search lead account" value={leadFilters.search} onChange={(e) => setLeadFilters((p) => ({ ...p, search: e.target.value }))} />
                  <select value={leadFilters.status} onChange={(e) => setLeadFilters((p) => ({ ...p, status: e.target.value }))}>
                    <option value="">All Statuses</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="BLOCKED">BLOCKED</option>
                  </select>
                  <select value={leadFilters.stage} onChange={(e) => setLeadFilters((p) => ({ ...p, stage: e.target.value }))}>
                    <option value="">All Lead Stages</option>
                    <option value="NEW">NEW</option>
                    <option value="ROUTED">ROUTED</option>
                    <option value="WORKING">WORKING</option>
                    <option value="QUALIFIED">QUALIFIED</option>
                    <option value="DISQUALIFIED">DISQUALIFIED</option>
                    <option value="CONVERTED">CONVERTED</option>
                  </select>
                  <select value={leadFilters.temperature} onChange={(e) => setLeadFilters((p) => ({ ...p, temperature: e.target.value }))}>
                    <option value="">All Temperatures</option>
                    <option value="HOT">HOT</option>
                    <option value="WARM">WARM</option>
                    <option value="COLD">COLD</option>
                  </select>
                  <select value={leadFilters.ownerMine} onChange={(e) => setLeadFilters((p) => ({ ...p, ownerMine: e.target.value }))}>
                    <option value="false">All Owners</option>
                    <option value="true">Assigned To Me</option>
                  </select>
                  <div className="actions-cell">
                    <button type="button" onClick={loadLeadQueue}>Refresh</button>
                  </div>
                </div>
                <div className="chart-grid two-col">
                  <BarChartCard title="Lead Aging Buckets" data={leadInsights.agingMix} yLabel="Leads" format="number" />
                  <DonutChartCard title="Lead Source Distribution" data={leadInsights.sourceMix} totalLabel="Leads" />
                </div>
                <div className="crm-grid-two">
                  <section className="card table-wrap">
                    <table>
                      <thead><tr><th>Account</th><th>Stage</th><th>Temp</th><th>Lead</th><th>Owner</th><th>SLA</th><th>Next Action</th><th>Action</th></tr></thead>
                      <tbody>
                        {leadQueue.length === 0 ? (
                          <tr><td colSpan={8}>No leads in queue.</td></tr>
                        ) : leadQueue.map((lead) => (
                          <tr key={lead.id} className={selectedLeadId === lead.id ? 'crm-row-selected' : ''} onClick={() => setSelectedLeadId(lead.id)}>
                            <td>{lead.customer_name || lead.customer_number}<br /><small>{lead.customer_number}</small></td>
                            <td>{lead.lead_stage || 'NEW'}<br /><small>{lead.customer_status || '-'}</small></td>
                            <td>{lead.lead_temperature || 'COLD'}</td>
                            <td>{Number(lead.lead_score || 0)}<br /><small>{Number(lead.open_opportunity_count || 0)} open opps</small></td>
                            <td>{lead.lead_owner_name || 'Unassigned'}<br /><small>{Number(lead.open_task_count || 0)} open tasks</small></td>
                            <td>{lead.lead_sla_due_at ? `${dateOnly(lead.lead_sla_due_at)}${daysUntil(lead.lead_sla_due_at) !== null ? ` (${daysUntil(lead.lead_sla_due_at)}d)` : ''}` : 'Not set'}</td>
                            <td>{lead.lead_next_action || 'No next action'}<br /><small>{lead.lead_next_action_due_at ? String(lead.lead_next_action_due_at).slice(0, 16).replace('T', ' ') : (lead.lead_last_worked_at ? `Worked ${dateOnly(lead.lead_last_worked_at)}` : 'Never worked')}</small></td>
                            <td className="actions-cell">
                              <button type="button" className="button-secondary" onClick={(event) => { event.stopPropagation(); prepareLeadConversion(lead); }}>Open Conversion</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                  <section className="card">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Lead Workbench</p>
                        <h4>{selectedLeadRecord?.customer_name || 'Select a lead'}</h4>
                      </div>
                    </div>
                    {!selectedLeadRecord ? (
                      <p className="crm-empty">Choose a lead from the queue to route, qualify, or disqualify it.</p>
                    ) : (
                      <>
                        <div className="summary-grid">
                          <article className="card"><h4>Lead Score</h4><p className="metric">{Number(selectedLeadRecord.lead_score || 0)}</p></article>
                          <article className="card"><h4>Open Opps</h4><p className="metric">{Number(selectedLeadRecord.open_opportunity_count || 0)}</p></article>
                          <article className="card"><h4>Tasks</h4><p className="metric">{Number(selectedLeadRecord.open_task_count || 0)}</p></article>
                          <article className="card"><h4>Last Worked</h4><p className="metric">{dateOnly(selectedLeadRecord.lead_last_worked_at || selectedLeadRecord.updated_at) || '-'}</p></article>
                        </div>
                        <form className="crm-form-grid" onSubmit={(event) => { event.preventDefault(); saveLeadWorkbench(); }}>
                          <label>Lead Stage<select value={leadWorkbench.leadStage} onChange={(e) => setLeadWorkbench((p) => ({ ...p, leadStage: e.target.value }))}><option value="NEW">NEW</option><option value="ROUTED">ROUTED</option><option value="WORKING">WORKING</option><option value="QUALIFIED">QUALIFIED</option><option value="DISQUALIFIED">DISQUALIFIED</option><option value="CONVERTED">CONVERTED</option></select></label>
                          <label>Lead Owner<select value={leadWorkbench.leadOwnerId} onChange={(e) => setLeadWorkbench((p) => ({ ...p, leadOwnerId: e.target.value }))}><option value="">Unassigned</option>{crmUsers.map((userRow) => <option key={userRow.id} value={userRow.id}>{userRow.full_name}</option>)}</select></label>
                          <label>Temperature<select value={leadWorkbench.leadTemperature} onChange={(e) => setLeadWorkbench((p) => ({ ...p, leadTemperature: e.target.value }))}><option value="HOT">HOT</option><option value="WARM">WARM</option><option value="COLD">COLD</option></select></label>
                          <label>SLA Due<input type="datetime-local" value={leadWorkbench.leadSlaDueAt} onChange={(e) => setLeadWorkbench((p) => ({ ...p, leadSlaDueAt: e.target.value }))} /></label>
                          <label>Lead Score<input type="number" min="0" max="100" value={leadWorkbench.leadScore} onChange={(e) => setLeadWorkbench((p) => ({ ...p, leadScore: e.target.value }))} /></label>
                          <label>Source Detail<input value={leadWorkbench.leadSourceDetail} onChange={(e) => setLeadWorkbench((p) => ({ ...p, leadSourceDetail: e.target.value }))} placeholder="Walk-in, referral, expo, repeat service" /></label>
                          <label className="crm-field-span-two">Next Action<input value={leadWorkbench.leadNextAction} onChange={(e) => setLeadWorkbench((p) => ({ ...p, leadNextAction: e.target.value }))} placeholder="Call back, send lookbook, confirm budget, book meeting" /></label>
                          <label>Next Action Due<input type="datetime-local" value={leadWorkbench.leadNextActionDueAt} onChange={(e) => setLeadWorkbench((p) => ({ ...p, leadNextActionDueAt: e.target.value }))} /></label>
                          <label className="crm-field-span-two">Qualification Notes<textarea rows={3} value={leadWorkbench.leadQualificationNotes} onChange={(e) => setLeadWorkbench((p) => ({ ...p, leadQualificationNotes: e.target.value }))} /></label>
                          <label className="crm-field-span-two">Disqualification Reason<textarea rows={2} value={leadWorkbench.leadDisqualificationReason} onChange={(e) => setLeadWorkbench((p) => ({ ...p, leadDisqualificationReason: e.target.value }))} /></label>
                          <div className="actions-cell crm-field-span-two">
                            <button type="submit">Save Lead</button>
                            <button type="button" className="button-secondary" onClick={() => applyLeadStage('ROUTED')}>Route</button>
                            <button type="button" className="button-secondary" onClick={() => applyLeadStage('QUALIFIED')}>Qualify</button>
                            <button type="button" className="button-secondary" onClick={() => applyLeadStage('DISQUALIFIED')}>Disqualify</button>
                            <button type="button" className="button-secondary" onClick={() => prepareLeadConversion(selectedLeadRecord)}>Open Conversion</button>
                          </div>
                        </form>
                      </>
                    )}
                  </section>
                </div>
                <div className="chart-grid three-col">
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">SLA Risk</p>
                        <h4>Leads that need action now</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {leadInsights.slaRisk.length === 0 ? <p className="crm-empty">No SLA risk leads.</p> : leadInsights.slaRisk.map((lead) => (
                        <article key={`sla-${lead.id}`} className="crm-order-insight-card">
                          <strong>{lead.customer_name || lead.customer_number}</strong>
                          <p>{lead.lead_stage || 'NEW'} | {lead.lead_owner_name || 'Unassigned'}</p>
                          <div className="crm-order-insight-meta">
                            <span>{lead.daysLeft < 0 ? `${Math.abs(lead.daysLeft)}d overdue` : `${lead.daysLeft}d left`}</span>
                            <span>Score {Number(lead.lead_score || 0)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Qualification Queue</p>
                        <h4>Hot leads to convert</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {leadInsights.hotLeads.length === 0 ? <p className="crm-empty">No hot leads in queue.</p> : leadInsights.hotLeads.map((lead) => (
                        <article key={`hot-${lead.id}`} className="crm-order-insight-card">
                          <strong>{lead.customer_name || lead.customer_number}</strong>
                          <p>{lead.lead_source_detail || lead.source || 'Unknown source'}</p>
                          <div className="crm-order-insight-meta">
                            <span>{lead.lead_owner_name || 'Unassigned'}</span>
                            <span>Score {Number(lead.lead_score || 0)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Disqualified Leads</p>
                        <h4>Closed-out routing history</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {leadInsights.disqualified.length === 0 ? <p className="crm-empty">No disqualified leads.</p> : leadInsights.disqualified.map((lead) => (
                        <article key={`disq-${lead.id}`} className="crm-order-insight-card">
                          <strong>{lead.customer_name || lead.customer_number}</strong>
                          <p>{lead.lead_disqualification_reason || 'No reason recorded yet.'}</p>
                          <div className="crm-order-insight-meta">
                            <span>{lead.lead_owner_name || 'Unassigned'}</span>
                            <span>{dateOnly(lead.updated_at) || '-'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
                <div className="chart-grid two-col">
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Conversion Ready</p>
                        <h4>Leads most ready to become opportunities</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {leadInsights.conversionReady.length === 0 ? <p className="crm-empty">No conversion-ready leads.</p> : leadInsights.conversionReady.map((lead) => (
                        <article key={`convert-${lead.id}`} className="crm-order-insight-card">
                          <strong>{lead.customer_name || lead.customer_number}</strong>
                          <p>{lead.lead_next_action || lead.lead_source_detail || 'No next action recorded'}</p>
                          <div className="crm-order-insight-meta">
                            <span>{lead.lead_owner_name || 'Unassigned'}</span>
                            <span>Score {Number(lead.lead_score || 0)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Unassigned Leads</p>
                        <h4>Queue needing routing ownership</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {leadInsights.unassigned.length === 0 ? <p className="crm-empty">No unassigned leads.</p> : leadInsights.unassigned.map((lead) => (
                        <article key={`unassigned-${lead.id}`} className="crm-order-insight-card">
                          <strong>{lead.customer_name || lead.customer_number}</strong>
                          <p>{lead.lead_source_detail || lead.source || 'Unknown source'}</p>
                          <div className="crm-order-insight-meta">
                            <span>{lead.lead_stage || 'NEW'}</span>
                            <span>Score {Number(lead.lead_score || 0)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'timeline' && (
              <div className="crm-timeline-layout">
                <div className="card filter-grid">
                  <select value={timelineFilters.type} onChange={(e) => setTimelineFilters((p) => ({ ...p, type: e.target.value }))}>
                    <option value="">All Event Types</option>
                    <option value="ORDER">ORDER</option>
                    <option value="INTERACTION">INTERACTION</option>
                    <option value="LEDGER">LEDGER</option>
                    <option value="OPPORTUNITY">OPPORTUNITY</option>
                    <option value="TASK">TASK</option>
                  </select>
                  <input placeholder="Search timeline" value={timelineFilters.search} onChange={(e) => setTimelineFilters((p) => ({ ...p, search: e.target.value }))} />
                </div>

                <section className="card crm-timeline-feed">
                  <h4>Account 360 Timeline</h4>
                  {filteredTimeline.length === 0 ? (
                    <p className="crm-empty">No timeline events for current filters.</p>
                  ) : (
                    <div className="crm-timeline-list">
                      {filteredTimeline.map((event) => (
                        <article key={`${event.event_type}-${event.reference_id}-${event.event_at}`} className="crm-timeline-item">
                          <div className="crm-timeline-item-head">
                            <strong>{event.title || event.event_type}</strong>
                            <span>{dateOnly(event.event_at) || '-'}</span>
                          </div>
                          <p>{event.subtitle || '-'}</p>
                          <div className="crm-timeline-meta">
                            <span>{event.event_type}</span>
                            {event.status && <span>Status: {event.status}</span>}
                            {event.amount !== null && event.amount !== undefined && <span>Amount: {money(event.amount)}</span>}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}

            {workspaceTab === 'tasks' && (
              <div className="crm-task-layout">
                <div className="summary-grid">
                  <article className="card"><h4>Total Tasks</h4><p className="metric">{Number(taskSummary.summary?.total_count || 0)}</p></article>
                  <article className="card"><h4>Open</h4><p className="metric">{Number(taskSummary.summary?.open_count || 0)}</p></article>
                  <article className="card"><h4>Overdue</h4><p className="metric">{Number(taskSummary.summary?.overdue_count || 0)}</p></article>
                  <article className="card"><h4>Due Today</h4><p className="metric">{Number(taskSummary.summary?.due_today_count || 0)}</p></article>
                  <article className="card"><h4>Upcoming</h4><p className="metric">{Number(taskSummary.summary?.upcoming_count || 0)}</p></article>
                  <article className="card"><h4>Completed</h4><p className="metric">{Number(taskSummary.summary?.completed_count || 0)}</p></article>
                </div>

                <div className="card filter-grid">
                  <input placeholder="Search task/account" value={taskFilters.search} onChange={(e) => setTaskFilters((p) => ({ ...p, search: e.target.value }))} />
                  <select value={taskFilters.status} onChange={(e) => setTaskFilters((p) => ({ ...p, status: e.target.value }))}>
                    <option value="">All Statuses</option>
                    <option value="OPEN">OPEN</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                  <select value={taskFilters.priority} onChange={(e) => setTaskFilters((p) => ({ ...p, priority: e.target.value }))}>
                    <option value="">All Priorities</option>
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                  <select value={taskFilters.dueBucket} onChange={(e) => setTaskFilters((p) => ({ ...p, dueBucket: e.target.value }))}>
                    <option value="">All Due Buckets</option>
                    <option value="OVERDUE">OVERDUE</option>
                    <option value="TODAY">TODAY</option>
                    <option value="UPCOMING">UPCOMING</option>
                  </select>
                  <select value={taskFilters.assignedToMe} onChange={(e) => setTaskFilters((p) => ({ ...p, assignedToMe: e.target.value }))}>
                    <option value="false">All Owners</option>
                    <option value="true">Assigned To Me</option>
                  </select>
                </div>

                <div className="grid two">
                  <section className="card">
                    <h4>Create Follow-up Task</h4>
                    <form className="grid two" onSubmit={createTask}>
                      <label>Account<select value={taskForm.accountId} onChange={(e) => setTaskForm((p) => ({ ...p, accountId: e.target.value }))} required><option value="">Select account</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_name || customer.customer_number} ({customer.customer_number})</option>)}</select></label>
                      <label>Opportunity<select value={taskForm.opportunityId} onChange={(e) => setTaskForm((p) => ({ ...p, opportunityId: e.target.value }))}><option value="">No linked opportunity</option>{opportunities.map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.title}</option>)}</select></label>
                      <label>Task Template<select value={taskForm.templateId} onChange={(e) => {
                        const selectedTemplate = taskTemplates.find((template) => String(template.id) === e.target.value);
                        setTaskForm((p) => ({
                          ...p,
                          templateId: e.target.value,
                          title: selectedTemplate ? selectedTemplate.title : p.title,
                          description: selectedTemplate ? (selectedTemplate.description || '') : p.description,
                          priority: selectedTemplate ? selectedTemplate.priority : p.priority,
                          recurrenceType: selectedTemplate ? selectedTemplate.default_recurrence_type : p.recurrenceType,
                          recurrenceIntervalDays: selectedTemplate && Number(selectedTemplate.default_recurrence_interval_days || 0) > 0 ? String(selectedTemplate.default_recurrence_interval_days) : p.recurrenceIntervalDays,
                          dueDate: selectedTemplate ? addDays(new Date().toISOString().slice(0, 10), Number(selectedTemplate.default_due_in_days || 0)) : p.dueDate,
                        }));
                      }}><option value="">No template</option>{taskTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
                      <label>Title<input value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} /></label>
                      <label>Due Date<input type="date" value={taskForm.dueDate} onChange={(e) => setTaskForm((p) => ({ ...p, dueDate: e.target.value }))} /></label>
                      <label>Owner<select value={taskForm.assignedTo} onChange={(e) => setTaskForm((p) => ({ ...p, assignedTo: e.target.value }))}><option value="">Assigned to me</option>{crmUsers.map((userRow) => <option key={userRow.id} value={userRow.id}>{userRow.full_name} ({userRow.role_name})</option>)}</select></label>
                      <label>Priority<select value={taskForm.priority} onChange={(e) => setTaskForm((p) => ({ ...p, priority: e.target.value }))}><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option></select></label>
                      <label>Status<select value={taskForm.status} onChange={(e) => setTaskForm((p) => ({ ...p, status: e.target.value }))}><option value="OPEN">OPEN</option><option value="COMPLETED">COMPLETED</option><option value="CANCELLED">CANCELLED</option></select></label>
                      <label>Recurrence<select value={taskForm.recurrenceType} onChange={(e) => setTaskForm((p) => ({ ...p, recurrenceType: e.target.value }))}><option value="NONE">NONE</option><option value="DAILY">DAILY</option><option value="WEEKLY">WEEKLY</option><option value="MONTHLY">MONTHLY</option><option value="CUSTOM">CUSTOM</option></select></label>
                      <label>Repeat Every (days)<input type="number" min="0" value={taskForm.recurrenceIntervalDays} onChange={(e) => setTaskForm((p) => ({ ...p, recurrenceIntervalDays: e.target.value }))} /></label>
                      <label className="crm-field-span-two">Dependencies<select multiple value={taskForm.dependencyIds} onChange={(e) => setTaskForm((p) => ({ ...p, dependencyIds: Array.from(e.target.selectedOptions).map((option) => option.value) }))}>{tasks.filter((task) => task.status === 'OPEN').map((task) => <option key={task.id} value={task.id}>{task.title} ({task.customer_name || task.customer_number || 'No account'})</option>)}</select></label>
                      <label className="crm-field-span-two">Description<textarea rows={3} value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Task</button></div>
                    </form>
                  </section>

                  <section className="card table-wrap">
                    <h4>Task Queue</h4>
                    <table>
                      <thead><tr><th>Title</th><th>Account</th><th>Due</th><th>Priority</th><th>Status</th><th>Owner</th><th>Template / Dependencies</th><th>Actions</th></tr></thead>
                      <tbody>
                        {tasks.length === 0 ? (
                          <tr><td colSpan={8}>No tasks found for current filters.</td></tr>
                        ) : tasks.map((task) => (
                          <tr key={task.id} className={task.status === 'OPEN' && dateOnly(task.due_date) < dateOnly(new Date().toISOString()) ? 'late-row' : ''}>
                            <td>{task.title}<br /><small>{task.description || '-'}</small></td>
                            <td>{task.customer_name || '-'}<br /><small>{task.opportunity_title || ''}</small></td>
                            <td>{dateOnly(task.due_date) || '-'}</td>
                            <td>{task.priority}</td>
                            <td>{task.status}<br /><small>{task.recurrence_type !== 'NONE' ? `${task.recurrence_type}${Number(task.recurrence_interval_days || 0) > 0 ? ` / ${task.recurrence_interval_days}d` : ''}` : 'One-off'}</small></td>
                            <td>{task.assigned_to_name || '-'}</td>
                            <td>{task.template_name || 'Manual'}<br /><small>{Number(task.open_dependency_count || 0) > 0 ? `${task.open_dependency_count} blockers` : `${Number(task.dependency_count || 0)} deps`}</small></td>
                            <td className="actions-cell">
                              <button type="button" className="button-secondary" onClick={() => updateTask(task.id, { status: 'COMPLETED' })} disabled={Number(task.open_dependency_count || 0) > 0}>Done</button>
                              <button type="button" className="button-secondary" onClick={() => updateTask(task.id, { status: 'OPEN' })}>Reopen</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
                <div className="grid three">
                  <section className="card">
                    <h4>Task Templates</h4>
                    {['SUPER_USER', 'FINANCE'].includes(user?.role) && (
                      <>
                        <div className="grid two">
                          <label>Name<input value={taskTemplateForm.name} onChange={(e) => setTaskTemplateForm((p) => ({ ...p, name: e.target.value }))} /></label>
                          <label>Title<input value={taskTemplateForm.title} onChange={(e) => setTaskTemplateForm((p) => ({ ...p, title: e.target.value }))} /></label>
                          <label>Priority<select value={taskTemplateForm.priority} onChange={(e) => setTaskTemplateForm((p) => ({ ...p, priority: e.target.value }))}><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option></select></label>
                          <label>Default Due In Days<input type="number" min="0" value={taskTemplateForm.defaultDueInDays} onChange={(e) => setTaskTemplateForm((p) => ({ ...p, defaultDueInDays: e.target.value }))} /></label>
                          <label>Default Recurrence<select value={taskTemplateForm.defaultRecurrenceType} onChange={(e) => setTaskTemplateForm((p) => ({ ...p, defaultRecurrenceType: e.target.value }))}><option value="NONE">NONE</option><option value="DAILY">DAILY</option><option value="WEEKLY">WEEKLY</option><option value="MONTHLY">MONTHLY</option><option value="CUSTOM">CUSTOM</option></select></label>
                          <label>Repeat Every (days)<input type="number" min="0" value={taskTemplateForm.defaultRecurrenceIntervalDays} onChange={(e) => setTaskTemplateForm((p) => ({ ...p, defaultRecurrenceIntervalDays: e.target.value }))} /></label>
                          <label className="crm-field-span-two">Description<textarea rows={3} value={taskTemplateForm.description} onChange={(e) => setTaskTemplateForm((p) => ({ ...p, description: e.target.value }))} /></label>
                        </div>
                        <div className="actions-cell"><button type="button" onClick={createTaskTemplate}>Create Template</button></div>
                        <hr />
                      </>
                    )}
                    <div className="crm-order-insight-list">
                      {taskTemplates.length === 0 ? <p className="crm-empty">No task templates yet.</p> : taskTemplates.slice(0, 8).map((template) => (
                        <article key={`task-template-${template.id}`} className="crm-order-insight-card">
                          <strong>{template.name}</strong>
                          <p>{template.title}</p>
                          <div className="crm-order-insight-meta">
                            <span>{template.priority}</span>
                            <span>{template.default_due_in_days}d due</span>
                            <span>{template.default_recurrence_type}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Critical Queue</p>
                        <h4>Highest-priority follow-ups</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {crmCommandCenter.criticalTaskQueue.length === 0 ? <p className="crm-empty">No critical tasks.</p> : crmCommandCenter.criticalTaskQueue.map((task) => (
                        <article key={`critical-task-${task.id}`} className="crm-order-insight-card">
                          <strong>{task.title}</strong>
                          <p>{task.customer_name || '-'}</p>
                          <div className="crm-order-insight-meta">
                            <span>{task.priority}</span>
                            <span>{dateOnly(task.due_date) || '-'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card">
                    <BarChartCard title="Task Load By Owner" data={crmCommandCenter.taskOwnerLoad} yLabel="Tasks" format="number" />
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Follow-up Compliance</p>
                        <h4>Accounts missing attention</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {crmCommandCenter.communicationGaps.slice(0, 6).map((row) => (
                        <article key={`follow-up-gap-${row.id}`} className="crm-order-insight-card">
                          <strong>{row.label}</strong>
                          <p>{row.nextBestAction}</p>
                          <div className="crm-order-insight-meta">
                            <span>{row.staleDays === null ? 'No contact logged' : `${row.staleDays} days`}</span>
                            <span>{row.outlet}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'communications' && (
              <div className="crm-notifications-layout">
                <div className="summary-grid">
                  <article className="card"><h4>Open Threads</h4><p className="metric">{Number(communications.analytics?.open_threads || 0)}</p></article>
                  <article className="card"><h4>Unread Messages</h4><p className="metric">{Number(communications.analytics?.unread_messages || 0)}</p></article>
                  <article className="card"><h4>Overdue Responses</h4><p className="metric">{Number(communications.analytics?.overdue_responses || 0)}</p></article>
                  <article className="card"><h4>Owned Threads</h4><p className="metric">{Number(communications.analytics?.owned_threads || 0)}</p></article>
                  <article className="card"><h4>Follow-up Due</h4><p className="metric">{Number(communications.followupCompliance?.overdue_followups || 0)}</p></article>
                  <article className="card"><h4>Follow-up Tasks Late</h4><p className="metric">{Number(communications.followupCompliance?.overdue_followup_tasks || 0)}</p></article>
                </div>

                <div className="card filter-grid">
                  <select value={communicationFilters.channel} onChange={(e) => setCommunicationFilters((p) => ({ ...p, channel: e.target.value }))}>
                    <option value="">All Channels</option>
                    <option value="EMAIL">EMAIL</option>
                    <option value="WHATSAPP">WHATSAPP</option>
                    <option value="SMS">SMS</option>
                    <option value="CALL">CALL</option>
                    <option value="VISIT">VISIT</option>
                    <option value="NOTE">NOTE</option>
                  </select>
                  <select value={communicationFilters.status} onChange={(e) => setCommunicationFilters((p) => ({ ...p, status: e.target.value }))}>
                    <option value="">All Thread Statuses</option>
                    <option value="OPEN">OPEN</option>
                    <option value="PENDING">PENDING</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                  <select value={communicationFilters.ownerMine} onChange={(e) => setCommunicationFilters((p) => ({ ...p, ownerMine: e.target.value }))}>
                    <option value="false">All Owners</option>
                    <option value="true">My Conversations</option>
                  </select>
                  <div className="actions-cell">
                    <button type="button" onClick={loadCommunicationCenter}>Refresh Center</button>
                  </div>
                </div>

                <div className="chart-grid two-col">
                  <DonutChartCard title="Channel Mix" data={communications.analytics?.channel_mix || []} totalLabel="Messages" />
                  <BarChartCard title="Conversation Ownership" data={communications.analytics?.owner_mix || []} yLabel="Threads" format="number" />
                </div>

                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Unified Inbox</h4>
                    <table>
                      <thead><tr><th>Customer</th><th>Channel</th><th>Subject</th><th>Owner</th><th>Last Activity</th><th>SLA / Follow-up</th><th>Status</th></tr></thead>
                      <tbody>
                        {(communications.inbox || []).length === 0 ? (
                          <tr><td colSpan={7}>No communication threads found.</td></tr>
                        ) : (communications.inbox || []).map((item) => (
                          <tr key={item.thread_key} className={item.overdue_response ? 'late-row' : ''}>
                            <td>{item.customer_name || item.customer_number}<br /><small>{item.customer_number}</small></td>
                            <td>{item.channel}<br /><small>{item.message_count} messages</small></td>
                            <td>{item.latest_subject}<br /><small>{item.latest_notes || '-'}</small></td>
                            <td>{item.owner_name || '-'}</td>
                            <td>{String(item.last_activity_at || '').slice(0, 19).replace('T', ' ') || '-'}</td>
                            <td>{item.response_due_at ? `Reply by ${String(item.response_due_at).slice(0, 16).replace('T', ' ')}` : (item.next_followup_at ? `Follow-up ${dateOnly(item.next_followup_at)}` : '-')}</td>
                            <td>{item.status}{item.unread_count > 0 ? ` / ${item.unread_count} unread` : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>

                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">No Response Alerts</p>
                        <h4>Threads breaching response SLAs</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {(communications.noResponseAlerts || []).length === 0 ? <p className="crm-empty">No active no-response alerts.</p> : (communications.noResponseAlerts || []).map((alert) => (
                        <article key={`no-response-${alert.id}`} className="crm-order-insight-card">
                          <strong>{alert.customer_name || alert.customer_number}</strong>
                          <p>{alert.channel} waiting on {alert.owner_name || 'unassigned owner'}</p>
                          <div className="crm-order-insight-meta">
                            <span>Due {String(alert.response_due_at || '').slice(0, 16).replace('T', ' ') || '-'}</span>
                            <span>Alerted {String(alert.alerted_at || '').slice(0, 16).replace('T', ' ') || '-'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'cases' && (
              <div className="crm-cases-layout">
                <div className="summary-grid">
                  <article className="card"><h4>Total Cases</h4><p className="metric">{Number(caseSummary.summary?.total_count || 0)}</p></article>
                  <article className="card"><h4>Open</h4><p className="metric">{Number(caseSummary.summary?.open_count || 0)}</p></article>
                  <article className="card"><h4>Escalated</h4><p className="metric">{Number(caseSummary.summary?.escalated_count || 0)}</p></article>
                  <article className="card"><h4>Overdue</h4><p className="metric">{Number(caseSummary.summary?.overdue_count || 0)}</p></article>
                  <article className="card"><h4>Resolved</h4><p className="metric">{Number(caseSummary.summary?.resolved_count || 0)}</p></article>
                  <article className="card"><h4>High Priority</h4><p className="metric">{Number(caseSummary.summary?.high_priority_count || 0)}</p></article>
                </div>

                <div className="card filter-grid">
                  <input placeholder="Search case/account" value={caseFilters.search} onChange={(e) => setCaseFilters((p) => ({ ...p, search: e.target.value }))} />
                  <select value={caseFilters.status} onChange={(e) => setCaseFilters((p) => ({ ...p, status: e.target.value }))}>
                    <option value="">All Statuses</option>
                    <option value="NEW">NEW</option>
                    <option value="WORKING">WORKING</option>
                    <option value="WAITING_CUSTOMER">WAITING_CUSTOMER</option>
                    <option value="ESCALATED">ESCALATED</option>
                    <option value="RESOLVED">RESOLVED</option>
                    <option value="CLOSED">CLOSED</option>
                  </select>
                  <select value={caseFilters.priority} onChange={(e) => setCaseFilters((p) => ({ ...p, priority: e.target.value }))}>
                    <option value="">All Priority</option>
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                  <select value={caseFilters.caseType} onChange={(e) => setCaseFilters((p) => ({ ...p, caseType: e.target.value }))}>
                    <option value="">All Types</option>
                    <option value="GENERAL">GENERAL</option>
                    <option value="ORDER">ORDER</option>
                    <option value="PAYMENT">PAYMENT</option>
                    <option value="QUALITY">QUALITY</option>
                    <option value="DELIVERY">DELIVERY</option>
                    <option value="RETURNS">RETURNS</option>
                  </select>
                  <select value={caseFilters.assignedToMe} onChange={(e) => setCaseFilters((p) => ({ ...p, assignedToMe: e.target.value }))}>
                    <option value="false">All Owners</option>
                    <option value="true">Assigned To Me</option>
                  </select>
                </div>

                <div className="grid two">
                  <section className="card">
                    <h4>Create Case</h4>
                    <form className="grid two" onSubmit={createCase}>
                      <label>Account<select value={caseForm.accountId} onChange={(e) => setCaseForm((p) => ({ ...p, accountId: e.target.value }))} required><option value="">Select account</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_name || customer.customer_number}</option>)}</select></label>
                      <label>Opportunity<select value={caseForm.opportunityId} onChange={(e) => setCaseForm((p) => ({ ...p, opportunityId: e.target.value }))}><option value="">No linked opportunity</option>{opportunities.map((opportunity) => <option key={opportunity.id} value={opportunity.id}>{opportunity.title}</option>)}</select></label>
                      <label>Subject<input value={caseForm.subject} onChange={(e) => setCaseForm((p) => ({ ...p, subject: e.target.value }))} required /></label>
                      <label>Type<select value={caseForm.caseType} onChange={(e) => setCaseForm((p) => ({ ...p, caseType: e.target.value }))}><option value="GENERAL">GENERAL</option><option value="ORDER">ORDER</option><option value="PAYMENT">PAYMENT</option><option value="QUALITY">QUALITY</option><option value="DELIVERY">DELIVERY</option><option value="RETURNS">RETURNS</option></select></label>
                      <label>Priority<select value={caseForm.priority} onChange={(e) => setCaseForm((p) => ({ ...p, priority: e.target.value }))}><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option></select></label>
                      <label>Status<select value={caseForm.status} onChange={(e) => setCaseForm((p) => ({ ...p, status: e.target.value }))}><option value="NEW">NEW</option><option value="WORKING">WORKING</option><option value="WAITING_CUSTOMER">WAITING_CUSTOMER</option><option value="ESCALATED">ESCALATED</option><option value="RESOLVED">RESOLVED</option><option value="CLOSED">CLOSED</option></select></label>
                      <label>Origin<select value={caseForm.origin} onChange={(e) => setCaseForm((p) => ({ ...p, origin: e.target.value }))}><option value="MANUAL">MANUAL</option><option value="EMAIL">EMAIL</option><option value="PHONE">PHONE</option><option value="WEB">WEB</option><option value="WHATSAPP">WHATSAPP</option></select></label>
                      <label>Service Channel<select value={caseForm.serviceChannel} onChange={(e) => setCaseForm((p) => ({ ...p, serviceChannel: e.target.value }))}><option value="MANUAL">MANUAL</option><option value="RETAIL">RETAIL</option><option value="WHATSAPP">WHATSAPP</option><option value="EMAIL">EMAIL</option><option value="PHONE">PHONE</option><option value="PORTAL">PORTAL</option></select></label>
                      <label>Due At<input type="datetime-local" value={caseForm.dueAt} onChange={(e) => setCaseForm((p) => ({ ...p, dueAt: e.target.value }))} /></label>
                      <label>Assigned To<select value={caseForm.assignedTo} onChange={(e) => setCaseForm((p) => ({ ...p, assignedTo: e.target.value }))}><option value="">Current user</option>{crmUsers.map((userRow) => <option key={userRow.id} value={userRow.id}>{userRow.full_name}</option>)}</select></label>
                      <label>Reported Order<select value={caseForm.reportedOrderId} onChange={(e) => setCaseForm((p) => ({ ...p, reportedOrderId: e.target.value }))}><option value="">No linked order</option>{(detail.orders || []).map((order) => <option key={order.id} value={order.id}>{order.production_order_no}</option>)}</select></label>
                      <label>Root Cause<input value={caseForm.rootCauseCode} onChange={(e) => setCaseForm((p) => ({ ...p, rootCauseCode: e.target.value }))} placeholder="Measurement, Delay, Quality" /></label>
                      <label>Resolution Code<input value={caseForm.resolutionCode} onChange={(e) => setCaseForm((p) => ({ ...p, resolutionCode: e.target.value }))} placeholder="Refund, Replace, Repair" /></label>
                      <label>Business Impact<input value={caseForm.businessImpact} onChange={(e) => setCaseForm((p) => ({ ...p, businessImpact: e.target.value }))} placeholder="VIP customer, store escalation" /></label>
                      <label>Next Action Due<input type="datetime-local" value={caseForm.nextActionDueAt} onChange={(e) => setCaseForm((p) => ({ ...p, nextActionDueAt: e.target.value }))} /></label>
                      <label className="crm-field-span-two">Next Action<textarea rows={2} value={caseForm.nextAction} onChange={(e) => setCaseForm((p) => ({ ...p, nextAction: e.target.value }))} /></label>
                      <label className="crm-field-span-two">Description<textarea rows={3} value={caseForm.description} onChange={(e) => setCaseForm((p) => ({ ...p, description: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Case</button></div>
                    </form>
                  </section>

                  <section className="card table-wrap">
                    <h4>Case Queue</h4>
                    <table>
                      <thead><tr><th>Subject</th><th>Account</th><th>Priority</th><th>Status</th><th>Due</th><th>Owner</th><th>Actions</th></tr></thead>
                      <tbody>
                        {cases.length === 0 ? (
                          <tr><td colSpan={7}>No cases found.</td></tr>
                        ) : cases.map((caseRow) => (
                          <tr key={caseRow.id} className={selectedCaseId === caseRow.id ? 'active-row' : ''}>
                            <td>{caseRow.subject}<br /><small>{caseRow.case_type}</small></td>
                            <td>{caseRow.customer_name || caseRow.customer_number}<br /><small>{caseRow.reported_order_no || caseRow.root_cause_code || '-'}</small></td>
                            <td>{caseRow.priority}</td>
                            <td>{caseRow.status}<br /><small>{caseRow.service_channel || 'MANUAL'}</small></td>
                            <td>{String(caseRow.due_at || '').slice(0, 16).replace('T', ' ') || '-'}</td>
                            <td>{caseRow.assigned_to_name || '-'}<br /><small>{caseRow.next_action_due_at ? String(caseRow.next_action_due_at).slice(0, 16).replace('T', ' ') : (caseRow.next_action || '')}</small></td>
                            <td className="actions-cell">
                              <button type="button" className="button-secondary" onClick={() => setSelectedCaseId(caseRow.id)}>Details</button>
                              <button type="button" className="button-secondary" onClick={() => updateCase(caseRow.id, { status: 'WORKING' })}>Work</button>
                              <button type="button" className="button-secondary" onClick={() => updateCase(caseRow.id, { status: 'RESOLVED' })}>Resolve</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>
                <div className="chart-grid two-col">
                  <DonutChartCard title="Case Type Mix" data={crmCommandCenter.caseTypeMix} totalLabel="Cases" />
                  <DonutChartCard title="Case Priority Mix" data={crmCommandCenter.casePriorityMix} totalLabel="Cases" />
                </div>
                <div className="grid three">
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Escalation Cockpit</p>
                        <h4>Escalated cases</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {crmCommandCenter.escalatedCases.length === 0 ? <p className="crm-empty">No escalated cases.</p> : crmCommandCenter.escalatedCases.map((caseRow) => (
                        <article key={`escalated-${caseRow.id}`} className="crm-order-insight-card">
                          <strong>{caseRow.subject}</strong>
                          <p>{caseRow.customer_name || caseRow.customer_number}</p>
                          <div className="crm-order-insight-meta">
                            <span>{caseRow.priority}</span>
                            <span>{String(caseRow.due_at || '').slice(0, 16).replace('T', ' ') || '-'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">SLA Risk</p>
                        <h4>Cases close to breach</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {crmCommandCenter.slaRiskCases.length === 0 ? <p className="crm-empty">No near-breach cases.</p> : crmCommandCenter.slaRiskCases.map((caseRow) => (
                        <article key={`sla-risk-${caseRow.id}`} className="crm-order-insight-card">
                          <strong>{caseRow.subject}</strong>
                          <p>{caseRow.customer_name || caseRow.customer_number}</p>
                          <div className="crm-order-insight-meta">
                            <span>{caseRow.daysLeft < 0 ? 'Overdue' : `${caseRow.daysLeft} days left`}</span>
                            <span>{caseRow.assigned_to_name || caseRow.owner_name || '-'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card">
                    <BarChartCard title="Case Load By Owner" data={crmCommandCenter.caseOwnerLoad} yLabel="Cases" format="number" />
                  </section>
                </div>

                <section className="card table-wrap">
                  <h4>Case Collaboration Feed</h4>
                  {!selectedCaseId ? (
                    <p className="crm-empty">Select a case from queue to view comments.</p>
                  ) : (
                    <>
                      <div className="grid two">
                        <label>Root Cause<input value={selectedCaseRecord?.root_cause_code || ''} onChange={(e) => updateCase(selectedCaseId, { rootCauseCode: e.target.value })} /></label>
                        <label>Resolution<input value={selectedCaseRecord?.resolution_code || ''} onChange={(e) => updateCase(selectedCaseId, { resolutionCode: e.target.value })} /></label>
                        <label>Business Impact<input value={selectedCaseRecord?.business_impact || ''} onChange={(e) => updateCase(selectedCaseId, { businessImpact: e.target.value })} /></label>
                        <label>Service Channel<select value={selectedCaseRecord?.service_channel || 'MANUAL'} onChange={(e) => updateCase(selectedCaseId, { serviceChannel: e.target.value })}><option value="MANUAL">MANUAL</option><option value="RETAIL">RETAIL</option><option value="WHATSAPP">WHATSAPP</option><option value="EMAIL">EMAIL</option><option value="PHONE">PHONE</option><option value="PORTAL">PORTAL</option></select></label>
                        <label className="crm-field-span-two">Next Action<input value={selectedCaseRecord?.next_action || ''} onChange={(e) => updateCase(selectedCaseId, { nextAction: e.target.value })} /></label>
                      </div>
                      <div className="actions-cell">
                        <input placeholder="Add internal comment" value={caseCommentInput} onChange={(e) => setCaseCommentInput(e.target.value)} />
                        <button type="button" onClick={addCaseComment}>Post Comment</button>
                      </div>
                      <table>
                        <thead><tr><th>When</th><th>By</th><th>Comment</th></tr></thead>
                        <tbody>
                          {caseComments.length === 0 ? <tr><td colSpan={3}>No comments yet.</td></tr> : caseComments.map((comment) => (
                            <tr key={comment.id}>
                              <td>{String(comment.created_at || '').slice(0, 19).replace('T', ' ')}</td>
                              <td>{comment.created_by_name || '-'}</td>
                              <td>{comment.comment_text}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </section>
              </div>
            )}

            {workspaceTab === 'opportunities' && (
              <div className="crm-pipeline-layout">
                <div className="summary-grid">
                  <article className="card"><h4>Total Opportunities</h4><p className="metric">{Number(opportunitySummary.summary?.total_count || 0)}</p></article>
                  <article className="card"><h4>Open</h4><p className="metric">{Number(opportunitySummary.summary?.open_count || 0)}</p></article>
                  <article className="card"><h4>Won</h4><p className="metric">{Number(opportunitySummary.summary?.won_count || 0)}</p></article>
                  <article className="card"><h4>Lost</h4><p className="metric">{Number(opportunitySummary.summary?.lost_count || 0)}</p></article>
                  <article className="card"><h4>Pipeline Value</h4><p className="metric">{money(opportunitySummary.summary?.total_pipeline_value)}</p></article>
                  <article className="card"><h4>Weighted Forecast</h4><p className="metric">{money(opportunitySummary.summary?.weighted_pipeline_value)}</p></article>
                  <article className="card"><h4>High Risk</h4><p className="metric">{pipelineInspection.highRiskDeals.length}</p></article>
                  <article className="card"><h4>Stale Deals</h4><p className="metric">{pipelineInspection.staleDeals.length}</p></article>
                </div>

                <div className="chart-grid two-col">
                  <DonutChartCard title="Pipeline by Stage" data={pipelineInsights.stageBreakdown} totalLabel="Opportunities" />
                  <BarChartCard title="Open Pipeline Value by Stage" data={pipelineInsights.openPipelineByStage} yLabel="Open expected value" format="currency" />
                </div>
                <div className="chart-grid two-col">
                  <DonutChartCard title="Competitor Mix" data={pipelineInspection.competitorMix} totalLabel="Tracked" />
                  <BarChartCard title="Loss Reasons" data={pipelineInspection.lossReasonMix} yLabel="Lost deals" />
                </div>

                <div className="card filter-grid">
                  <input placeholder="Search opportunity/customer" value={opportunityFilters.search} onChange={(e) => setOpportunityFilters((p) => ({ ...p, search: e.target.value }))} />
                  <select value={opportunityFilters.stage} onChange={(e) => setOpportunityFilters((p) => ({ ...p, stage: e.target.value }))}>
                    <option value="">All Stages</option>
                    {PIPELINE_STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
                  </select>
                  <select value={opportunityFilters.status} onChange={(e) => setOpportunityFilters((p) => ({ ...p, status: e.target.value }))}>
                    <option value="">All Statuses</option>
                    <option value="OPEN">OPEN</option>
                    <option value="WON">WON</option>
                    <option value="LOST">LOST</option>
                  </select>
                </div>

                <div className="grid two">
                  <section className="card">
                    <h4>Create Opportunity</h4>
                    <form className="grid two" onSubmit={createOpportunity}>
                      <label>Account<select value={opportunityForm.accountId} onChange={(e) => setOpportunityForm((p) => ({ ...p, accountId: e.target.value }))} required><option value="">Select account</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_name || customer.customer_number} ({customer.customer_number})</option>)}</select></label>
                      <label>Title<input value={opportunityForm.title} onChange={(e) => setOpportunityForm((p) => ({ ...p, title: e.target.value }))} required /></label>
                      <label>Stage<select value={opportunityForm.stage} onChange={(e) => setOpportunityForm((p) => ({ ...p, stage: e.target.value }))}>{PIPELINE_STAGES.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</select></label>
                      <label>Status<select value={opportunityForm.status} onChange={(e) => setOpportunityForm((p) => ({ ...p, status: e.target.value }))}><option value="OPEN">OPEN</option><option value="WON">WON</option><option value="LOST">LOST</option></select></label>
                      <label>Owner<select value={opportunityForm.ownerId} onChange={(e) => setOpportunityForm((p) => ({ ...p, ownerId: e.target.value }))}><option value="">Unassigned</option>{crmUsers.map((userRow) => <option key={userRow.id} value={userRow.id}>{userRow.full_name} ({userRow.role_name})</option>)}</select></label>
                      <label>Probability %<input type="number" min="0" max="100" value={opportunityForm.probability} onChange={(e) => setOpportunityForm((p) => ({ ...p, probability: e.target.value }))} /></label>
                      <label>Expected Value<input type="number" min="0" step="0.01" value={opportunityForm.expectedValue} onChange={(e) => setOpportunityForm((p) => ({ ...p, expectedValue: e.target.value }))} /></label>
                      <label>Expected Close<input type="date" value={opportunityForm.expectedCloseDate} onChange={(e) => setOpportunityForm((p) => ({ ...p, expectedCloseDate: e.target.value }))} /></label>
                      <label>Source<input value={opportunityForm.source} onChange={(e) => setOpportunityForm((p) => ({ ...p, source: e.target.value }))} /></label>
                      <label>Competitor<input value={opportunityForm.competitorName} onChange={(e) => setOpportunityForm((p) => ({ ...p, competitorName: e.target.value }))} /></label>
                      <label>Risk<select value={opportunityForm.riskLevel} onChange={(e) => setOpportunityForm((p) => ({ ...p, riskLevel: e.target.value }))}><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option></select></label>
                      <label>Next Step<input value={opportunityForm.nextStep} onChange={(e) => setOpportunityForm((p) => ({ ...p, nextStep: e.target.value }))} /></label>
                      <label>Next Step Due<input type="date" value={opportunityForm.nextStepDueAt} onChange={(e) => setOpportunityForm((p) => ({ ...p, nextStepDueAt: e.target.value }))} /></label>
                      <label>Buying Committee<input value={opportunityForm.buyingCommittee} onChange={(e) => setOpportunityForm((p) => ({ ...p, buyingCommittee: e.target.value }))} /></label>
                      <label className="crm-field-span-two">Close Plan<textarea rows={2} value={opportunityForm.closePlan} onChange={(e) => setOpportunityForm((p) => ({ ...p, closePlan: e.target.value }))} /></label>
                      <label>Win Reason<input value={opportunityForm.winReason} onChange={(e) => setOpportunityForm((p) => ({ ...p, winReason: e.target.value }))} /></label>
                      <label>Loss Reason<input value={opportunityForm.lossReason} onChange={(e) => setOpportunityForm((p) => ({ ...p, lossReason: e.target.value }))} /></label>
                      <label className="crm-field-span-two">Notes<textarea rows={3} value={opportunityForm.notes} onChange={(e) => setOpportunityForm((p) => ({ ...p, notes: e.target.value }))} /></label>
                      <div className="actions-cell"><button type="submit">Create Opportunity</button></div>
                    </form>
                  </section>

                  <section className="card crm-pipeline-board">
                    <h4>Pipeline Board</h4>
                    <p className="crm-empty">Drag opportunity cards across stages to update pipeline quickly.</p>
                    <div className="crm-pipeline-columns">
                      {PIPELINE_STAGES.map((stage) => (
                        <div
                          key={stage.key}
                          className={`crm-pipeline-column ${dragTargetStage === stage.key ? 'drag-target' : ''}`}
                          onDragOver={(event) => {
                            event.preventDefault();
                            if (dragTargetStage !== stage.key) setDragTargetStage(stage.key);
                          }}
                          onDragLeave={() => {
                            if (dragTargetStage === stage.key) setDragTargetStage('');
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            dropOpportunityToStage(stage.key).catch(() => {});
                          }}
                        >
                          <div className="crm-pipeline-column-head"><strong>{stage.label}</strong><span>{(pipelineInsights.byStage[stage.key] || []).length}</span></div>
                          <div className="crm-pipeline-card-list">
                            {(pipelineInsights.byStage[stage.key] || []).map((opportunity) => (
                              <article
                                key={opportunity.id}
                                className="crm-opportunity-card"
                                draggable
                                onClick={() => setSelectedOpportunityId(opportunity.id)}
                                onDragStart={() => startOpportunityDrag(opportunity.id)}
                                onDragEnd={() => {
                                  setDraggedOpportunityId(null);
                                  setDragTargetStage('');
                                }}
                              >
                                <h5>{opportunity.title}</h5>
                                <p>{opportunity.customer_name || opportunity.customer_number}</p>
                                <p>Value {money(opportunity.expected_value)} | Prob {opportunity.probability}%</p>
                                <p>Weighted {money(opportunity.weighted_value)} | Close {dateOnly(opportunity.expected_close_date) || '-'}</p>
                                <p>Risk {opportunity.risk_level || 'MEDIUM'} | Items {Number(opportunity.line_item_count || 0)}</p>
                                <div className="crm-opportunity-actions">
                                  <select value={opportunity.stage} onChange={(e) => updateOpportunity(opportunity.id, { stage: e.target.value })}>{PIPELINE_STAGES.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
                                  <select value={opportunity.status} onChange={(e) => updateOpportunity(opportunity.id, { status: e.target.value })}><option value="OPEN">OPEN</option><option value="WON">WON</option><option value="LOST">LOST</option></select>
                                  <select value={opportunity.owner_id || ''} onChange={(e) => updateOpportunity(opportunity.id, { ownerId: e.target.value ? Number(e.target.value) : null })}><option value="">Owner: Unassigned</option>{crmUsers.map((userRow) => <option key={userRow.id} value={userRow.id}>{userRow.full_name}</option>)}</select>
                                </div>
                              </article>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
                <div className="crm-grid-two">
                  <section className="card">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Opportunity Workbench</p>
                        <h4>{selectedOpportunityRecord?.title || 'Select an opportunity'}</h4>
                      </div>
                    </div>
                    {!selectedOpportunityRecord ? (
                      <p className="crm-empty">Choose an opportunity from the pipeline board to manage competitor, next step, risk, and close plan.</p>
                    ) : (
                      <form className="crm-form-grid" onSubmit={(event) => { event.preventDefault(); updateOpportunity(selectedOpportunityRecord.id, {
                        stage: selectedOpportunityRecord.stage,
                        status: selectedOpportunityRecord.status,
                        ownerId: selectedOpportunityRecord.owner_id,
                        probability: selectedOpportunityRecord.probability,
                        expectedValue: selectedOpportunityRecord.expected_value,
                        expectedCloseDate: selectedOpportunityRecord.expected_close_date ? String(selectedOpportunityRecord.expected_close_date).slice(0, 10) : null,
                        source: selectedOpportunityRecord.source || '',
                        competitorName: selectedOpportunityRecord.competitor_name || '',
                        winReason: selectedOpportunityRecord.win_reason || '',
                        lossReason: selectedOpportunityRecord.loss_reason || '',
                        nextStep: selectedOpportunityRecord.next_step || '',
                        nextStepDueAt: selectedOpportunityRecord.next_step_due_at ? String(selectedOpportunityRecord.next_step_due_at).slice(0, 10) : null,
                        riskLevel: selectedOpportunityRecord.risk_level || 'MEDIUM',
                        closePlan: selectedOpportunityRecord.close_plan || '',
                        buyingCommittee: selectedOpportunityRecord.buying_committee || '',
                        notes: selectedOpportunityRecord.notes || '',
                      }); }}>
                        <label>Competitor<input value={selectedOpportunityRecord.competitor_name || ''} onChange={(e) => setOpportunities((prev) => prev.map((row) => row.id === selectedOpportunityRecord.id ? { ...row, competitor_name: e.target.value } : row))} /></label>
                        <label>Risk<select value={selectedOpportunityRecord.risk_level || 'MEDIUM'} onChange={(e) => setOpportunities((prev) => prev.map((row) => row.id === selectedOpportunityRecord.id ? { ...row, risk_level: e.target.value } : row))}><option value="LOW">LOW</option><option value="MEDIUM">MEDIUM</option><option value="HIGH">HIGH</option><option value="CRITICAL">CRITICAL</option></select></label>
                        <label>Next Step<input value={selectedOpportunityRecord.next_step || ''} onChange={(e) => setOpportunities((prev) => prev.map((row) => row.id === selectedOpportunityRecord.id ? { ...row, next_step: e.target.value } : row))} /></label>
                        <label>Next Step Due<input type="date" value={selectedOpportunityRecord.next_step_due_at ? String(selectedOpportunityRecord.next_step_due_at).slice(0, 10) : ''} onChange={(e) => setOpportunities((prev) => prev.map((row) => row.id === selectedOpportunityRecord.id ? { ...row, next_step_due_at: e.target.value } : row))} /></label>
                        <label>Win Reason<input value={selectedOpportunityRecord.win_reason || ''} onChange={(e) => setOpportunities((prev) => prev.map((row) => row.id === selectedOpportunityRecord.id ? { ...row, win_reason: e.target.value } : row))} /></label>
                        <label>Loss Reason<input value={selectedOpportunityRecord.loss_reason || ''} onChange={(e) => setOpportunities((prev) => prev.map((row) => row.id === selectedOpportunityRecord.id ? { ...row, loss_reason: e.target.value } : row))} /></label>
                        <label>Buying Committee<input value={selectedOpportunityRecord.buying_committee || ''} onChange={(e) => setOpportunities((prev) => prev.map((row) => row.id === selectedOpportunityRecord.id ? { ...row, buying_committee: e.target.value } : row))} /></label>
                        <label>Probability %<input type="number" min="0" max="100" value={selectedOpportunityRecord.probability || 0} onChange={(e) => setOpportunities((prev) => prev.map((row) => row.id === selectedOpportunityRecord.id ? { ...row, probability: e.target.value } : row))} /></label>
                        <label className="crm-field-span-two">Close Plan<textarea rows={2} value={selectedOpportunityRecord.close_plan || ''} onChange={(e) => setOpportunities((prev) => prev.map((row) => row.id === selectedOpportunityRecord.id ? { ...row, close_plan: e.target.value } : row))} /></label>
                        <label className="crm-field-span-two">Notes<textarea rows={3} value={selectedOpportunityRecord.notes || ''} onChange={(e) => setOpportunities((prev) => prev.map((row) => row.id === selectedOpportunityRecord.id ? { ...row, notes: e.target.value } : row))} /></label>
                        <div className="actions-cell crm-field-span-two">
                          <button type="submit">Save Opportunity</button>
                        </div>
                      </form>
                    )}
                  </section>
                  <section className="card">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Opportunity Products</p>
                        <h4>Line items and commercial value</h4>
                      </div>
                    </div>
                    {!selectedOpportunityRecord ? (
                      <p className="crm-empty">Select an opportunity to manage its line items.</p>
                    ) : (
                      <>
                        <div className="summary-grid">
                          <article className="card"><h4>Items</h4><p className="metric">{Number(selectedOpportunityRecord.line_item_count || 0)}</p></article>
                          <article className="card"><h4>Line Item Value</h4><p className="metric">{money(selectedOpportunityRecord.line_item_total)}</p></article>
                        </div>
                        <form className="crm-form-grid" onSubmit={addOpportunityLineItem}>
                          <label>Product<input value={lineItemForm.productName} onChange={(e) => setLineItemForm((p) => ({ ...p, productName: e.target.value }))} required /></label>
                          <label>Quantity<input type="number" min="0.01" step="0.01" value={lineItemForm.quantity} onChange={(e) => setLineItemForm((p) => ({ ...p, quantity: e.target.value }))} required /></label>
                          <label>Unit Price<input type="number" min="0" step="0.01" value={lineItemForm.unitPrice} onChange={(e) => setLineItemForm((p) => ({ ...p, unitPrice: e.target.value }))} required /></label>
                          <label className="crm-field-span-two">Notes<textarea rows={2} value={lineItemForm.notes} onChange={(e) => setLineItemForm((p) => ({ ...p, notes: e.target.value }))} /></label>
                          <div className="actions-cell crm-field-span-two"><button type="submit">Add Line Item</button></div>
                        </form>
                        <section className="card table-wrap">
                          <table>
                            <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Total</th><th>Notes</th></tr></thead>
                            <tbody>
                              {opportunityLineItems.length === 0 ? (
                                <tr><td colSpan={5}>No line items for this opportunity.</td></tr>
                              ) : opportunityLineItems.map((item) => (
                                <tr key={item.id}>
                                  <td>{item.product_name}</td>
                                  <td>{Number(item.quantity || 0)}</td>
                                  <td>{money(item.unit_price)}</td>
                                  <td>{money(item.line_total)}</td>
                                  <td>{item.notes || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </section>
                      </>
                    )}
                  </section>
                </div>
                <div className="chart-grid two-col">
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">High Risk Deals</p>
                        <h4>Needs inspection this week</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {pipelineInspection.highRiskDeals.length === 0 ? <p className="crm-empty">No high-risk open deals.</p> : pipelineInspection.highRiskDeals.map((opportunity) => (
                        <article key={`high-risk-${opportunity.id}`} className="crm-order-insight-card">
                          <strong>{opportunity.title}</strong>
                          <p>{opportunity.customer_name || opportunity.customer_number}</p>
                          <div className="crm-order-insight-meta">
                            <span>{opportunity.risk_level}</span>
                            <span>{money(opportunity.expected_value)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Stale Deals</p>
                        <h4>Pipeline needing movement</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {pipelineInspection.staleDeals.length === 0 ? <p className="crm-empty">No stale deals right now.</p> : pipelineInspection.staleDeals.map((opportunity) => (
                        <article key={`stale-${opportunity.id}`} className="crm-order-insight-card">
                          <strong>{opportunity.title}</strong>
                          <p>{opportunity.next_step || 'No next step recorded'}</p>
                          <div className="crm-order-insight-meta">
                            <span>{opportunity.daysSinceUpdate}d since movement</span>
                            <span>{opportunity.owner_name || 'Unassigned'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'forecast' && (
              <div className="crm-forecast-layout">
                <div className="summary-grid">
                  <article className="card"><h4>Open Pipeline</h4><p className="metric">{money(reports.kpis?.open_pipeline_value)}</p></article>
                  <article className="card"><h4>Weighted Pipeline</h4><p className="metric">{money(reports.kpis?.weighted_pipeline_value)}</p></article>
                  <article className="card"><h4>Open Opportunities</h4><p className="metric">{Number(opportunitySummary.summary?.open_count || 0)}</p></article>
                  <article className="card"><h4>Latest Win Rate</h4><p className="metric">{Number(reportInsights.winRateTrend.at(-1)?.value || 0).toFixed(2)}%</p></article>
                </div>
                <div className="chart-grid two-col">
                  <BarChartCard title="Weighted Forecast by Month" data={reportInsights.forecastTrend} yLabel="Weighted forecast" format="currency" />
                  <BarChartCard title="Win Rate by Month (%)" data={reportInsights.winRateTrend} yLabel="Win rate" />
                </div>
                <div className="chart-grid one-col">
                  <DonutChartCard title="Open Pipeline by Owner" data={reportInsights.ownerMix} totalLabel="Pipeline value" />
                </div>
                <section className="card table-wrap">
                  <h4>Owner Forecast Table</h4>
                  <table>
                    <thead><tr><th>Owner</th><th>Open Opps</th><th>Open Value</th><th>Weighted Value</th></tr></thead>
                    <tbody>
                      {(reports.owner_pipeline || []).length === 0 ? (
                        <tr><td colSpan={4}>No owner forecast data.</td></tr>
                      ) : (reports.owner_pipeline || []).map((row) => (
                        <tr key={`${row.owner_name}-${row.open_count}`}>
                          <td>{row.owner_name}</td>
                          <td>{Number(row.open_count || 0)}</td>
                          <td>{money(row.open_value)}</td>
                          <td>{money(row.weighted_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )}

            {workspaceTab === 'reports' && (
              <div className="crm-reports-layout">
                <div className="card filter-grid">
                  <input type="date" value={reportFilters.from} onChange={(e) => setReportFilters((p) => ({ ...p, from: e.target.value }))} />
                  <input type="date" value={reportFilters.to} onChange={(e) => setReportFilters((p) => ({ ...p, to: e.target.value }))} />
                  <div className="actions-cell">
                    <button type="button" onClick={loadReports}>Apply</button>
                    <button type="button" className="button-secondary" onClick={exportReportCsv}>Export CSV</button>
                  </div>
                </div>
                <div className="summary-grid">
                  <article className="card"><h4>Total Customers</h4><p className="metric">{Number(reports.kpis?.total_customers || 0)}</p></article>
                  <article className="card"><h4>Total Opportunities</h4><p className="metric">{Number(reports.kpis?.total_opportunities || 0)}</p></article>
                  <article className="card"><h4>Open Pipeline Value</h4><p className="metric">{money(reports.kpis?.open_pipeline_value)}</p></article>
                  <article className="card"><h4>Open Tasks</h4><p className="metric">{Number(reports.kpis?.open_tasks || 0)}</p></article>
                  <article className="card"><h4>Overdue Tasks</h4><p className="metric">{Number(reports.kpis?.overdue_tasks || 0)}</p></article>
                  <article className="card"><h4>Duplicate Accounts</h4><p className="metric">{crmCommandCenter.duplicateAccounts.length}</p></article>
                  <article className="card"><h4>Escalated Cases</h4><p className="metric">{crmCommandCenter.escalatedCases.length}</p></article>
                </div>
                <div className="chart-grid two-col">
                  <BarChartCard title="Order Value by Day" data={reportInsights.orderTrend} yLabel="Order value" format="currency" />
                  <BarChartCard title="Tasks by Due Day" data={reportInsights.taskTrend} yLabel="Task count" />
                </div>
                <div className="chart-grid one-col">
                  <DonutChartCard title="Opportunities by Stage" data={reportInsights.stageMix} totalLabel="Opportunities" />
                </div>
                <div className="chart-grid two-col">
                  <BarChartCard title="Weighted Forecast by Month" data={reportInsights.forecastTrend} yLabel="Weighted forecast" format="currency" />
                  <BarChartCard title="Win Rate by Month (%)" data={reportInsights.winRateTrend} yLabel="Win rate" />
                </div>
                <div className="chart-grid three-col">
                  <DonutChartCard title="Customer Health Distribution" data={crmCommandCenter.healthDistribution} totalLabel="Accounts" />
                  <DonutChartCard title="Quote Status Mix" data={crmCommandCenter.quoteStatusMix} totalLabel="Quotes" />
                  <BarChartCard title="Task Load By Owner" data={crmCommandCenter.taskOwnerLoad} yLabel="Tasks" format="number" />
                </div>
                <div className="chart-grid two-col">
                  <BarChartCard title="Case Load By Owner" data={crmCommandCenter.caseOwnerLoad} yLabel="Cases" format="number" />
                  <BarChartCard title="Outlet Exposure" data={crmCommandCenter.outletExposure} yLabel="Risk score" format="number" />
                </div>
                <div className="chart-grid three-col">
                  <DonutChartCard title="Customer Segment Mix" data={crmDepthInsights.segmentMix} totalLabel="Accounts" />
                  <DonutChartCard title="Account Tier Mix" data={crmDepthInsights.tierMix} totalLabel="Accounts" />
                  <DonutChartCard title="Service Channel Mix" data={crmDepthInsights.serviceChannelMix} totalLabel="Cases" />
                </div>
                <div className="chart-grid two-col">
                  <BarChartCard title="Case Root Cause Mix" data={crmDepthInsights.rootCauseMix} yLabel="Cases" format="number" />
                  <BarChartCard title="Resolution Mix" data={crmDepthInsights.resolutionMix} yLabel="Cases" format="number" />
                </div>
                <div className="grid two">
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Pipeline Risk</p>
                        <h4>Open opportunities needing intervention</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {crmCommandCenter.pipelineRiskQueue.length === 0 ? <p className="crm-empty">No open opportunity risk queue.</p> : crmCommandCenter.pipelineRiskQueue.map((opportunity) => (
                        <article key={`pipeline-risk-${opportunity.id}`} className="crm-order-insight-card">
                          <strong>{opportunity.title}</strong>
                          <p>{opportunity.customer_name || opportunity.customer_number}</p>
                          <div className="crm-order-insight-meta">
                            <span>Risk {opportunity.riskScore}</span>
                            <span>Close {dateOnly(opportunity.expected_close_date) || '-'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <section className="card crm-order-insight-panel">
                    <div className="crm-section-head">
                      <div>
                        <p className="crm-kicker">Quote Watchlist</p>
                        <h4>Quotes nearing expiry</h4>
                      </div>
                    </div>
                    <div className="crm-order-insight-list">
                      {crmCommandCenter.quoteExpiryQueue.length === 0 ? <p className="crm-empty">No quote expiry pressure.</p> : crmCommandCenter.quoteExpiryQueue.map((quote) => (
                        <article key={`quote-expiry-${quote.id}`} className="crm-order-insight-card">
                          <strong>{quote.quote_number}</strong>
                          <p>{quote.customer_name || quote.customer_number}</p>
                          <div className="crm-order-insight-meta">
                            <span>{quote.status}</span>
                            <span>{quote.validDays < 0 ? 'Expired' : `${quote.validDays} days left`}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            )}

            {workspaceTab === 'approvals' && (
              <div className="crm-approvals-layout">
                <div className="card filter-grid">
                  <select value={approvalFilter} onChange={(e) => setApprovalFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    <option value="PENDING">PENDING</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="REJECTED">REJECTED</option>
                    <option value="CANCELLED">CANCELLED</option>
                  </select>
                  <div className="actions-cell">
                    <button type="button" onClick={loadApprovals}>Refresh</button>
                  </div>
                </div>
                <section className="card table-wrap">
                  <table>
                    <thead><tr><th>Requested</th><th>Entity</th><th>Stage</th><th>Status</th><th>Requested By</th><th>Decision</th></tr></thead>
                    <tbody>
                      {approvals.length === 0 ? (
                        <tr><td colSpan={6}>No approvals.</td></tr>
                      ) : approvals.map((approval) => (
                        <tr key={approval.id}>
                          <td>{String(approval.requested_at || '').slice(0, 19).replace('T', ' ')}</td>
                          <td>{approval.entity_type} #{approval.entity_id}</td>
                          <td>{approval.stage_name || '-'}</td>
                          <td>{approval.status}</td>
                          <td>{approval.requested_by_name || '-'}</td>
                          <td className="actions-cell">
                            {approval.status === 'PENDING' && ['SUPER_USER', 'FINANCE'].includes(user?.role) ? (
                              <>
                                <button type="button" onClick={() => decideApproval(approval.id, 'APPROVED')}>Approve</button>
                                <button type="button" className="button-secondary" onClick={() => decideApproval(approval.id, 'REJECTED')}>Reject</button>
                              </>
                            ) : (
                              <span>{approval.decided_by_name || '-'}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )}

            {workspaceTab === 'engagement' && (
              <div className="crm-engagement-layout">
                <div className="grid two">
                  {['SUPER_USER', 'FINANCE'].includes(user?.role) && (
                    <section className="card">
                      <h4>Create Email Template</h4>
                      <div className="grid two">
                        <label>Name<input value={templateForm.name} onChange={(e) => setTemplateForm((p) => ({ ...p, name: e.target.value }))} /></label>
                        <label>Subject<input value={templateForm.subjectTemplate} onChange={(e) => setTemplateForm((p) => ({ ...p, subjectTemplate: e.target.value }))} /></label>
                        <label className="crm-field-span-two">Body<textarea rows={4} value={templateForm.bodyTemplate} onChange={(e) => setTemplateForm((p) => ({ ...p, bodyTemplate: e.target.value }))} /></label>
                      </div>
                      <div className="actions-cell"><button type="button" onClick={createTemplate}>Create Template</button></div>
                    </section>
                  )}
                  {['SUPER_USER', 'FINANCE'].includes(user?.role) && (
                    <section className="card">
                      <h4>Create Cadence + Step</h4>
                      <div className="grid two">
                        <label>Cadence Name<input value={cadenceForm.name} onChange={(e) => setCadenceForm((p) => ({ ...p, name: e.target.value }))} /></label>
                        <label>Description<input value={cadenceForm.description} onChange={(e) => setCadenceForm((p) => ({ ...p, description: e.target.value }))} /></label>
                      </div>
                      <div className="actions-cell"><button type="button" onClick={createCadence}>Create Cadence</button></div>
                      <hr />
                      <div className="grid two">
                        <label>Cadence<select value={stepForm.cadenceId} onChange={(e) => setStepForm((p) => ({ ...p, cadenceId: e.target.value }))}><option value="">Select cadence</option>{cadences.map((cadence) => <option key={cadence.id} value={cadence.id}>{cadence.name}</option>)}</select></label>
                        <label>Step #<input type="number" min="1" value={stepForm.stepNumber} onChange={(e) => setStepForm((p) => ({ ...p, stepNumber: e.target.value }))} /></label>
                        <label>Type<select value={stepForm.stepType} onChange={(e) => setStepForm((p) => ({ ...p, stepType: e.target.value }))}><option value="EMAIL">EMAIL</option><option value="CALL">CALL</option><option value="TASK">TASK</option></select></label>
                        <label>Day Offset<input type="number" min="0" value={stepForm.dayOffset} onChange={(e) => setStepForm((p) => ({ ...p, dayOffset: e.target.value }))} /></label>
                        <label>Template<select value={stepForm.templateId} onChange={(e) => setStepForm((p) => ({ ...p, templateId: e.target.value }))}><option value="">None</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
                        <label className="crm-field-span-two">Instructions<input value={stepForm.instructions} onChange={(e) => setStepForm((p) => ({ ...p, instructions: e.target.value }))} /></label>
                      </div>
                      <div className="actions-cell"><button type="button" onClick={addCadenceStep}>Add Step</button></div>
                    </section>
                  )}
                </div>

                <section className="card">
                  <h4>Enroll Account in Cadence</h4>
                  <div className="grid two">
                    <label>Cadence<select value={enrollmentForm.cadenceId} onChange={(e) => setEnrollmentForm((p) => ({ ...p, cadenceId: e.target.value }))}><option value="">Select cadence</option>{cadences.map((cadence) => <option key={cadence.id} value={cadence.id}>{cadence.name}</option>)}</select></label>
                    <label>Account<select value={enrollmentForm.accountId} onChange={(e) => setEnrollmentForm((p) => ({ ...p, accountId: e.target.value }))}><option value="">Select account</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_name || customer.customer_number}</option>)}</select></label>
                    <label>Owner<select value={enrollmentForm.ownerId} onChange={(e) => setEnrollmentForm((p) => ({ ...p, ownerId: e.target.value }))}><option value="">Current user</option>{crmUsers.map((userRow) => <option key={userRow.id} value={userRow.id}>{userRow.full_name}</option>)}</select></label>
                    <label>Start At<input type="datetime-local" value={enrollmentForm.startAt} onChange={(e) => setEnrollmentForm((p) => ({ ...p, startAt: e.target.value }))} /></label>
                  </div>
                  <div className="actions-cell"><button type="button" onClick={enrollAccountInCadence}>Enroll</button></div>
                </section>

                <div className="grid two">
                  <section className="card table-wrap">
                    <h4>Templates</h4>
                    <table>
                      <thead><tr><th>Name</th><th>Subject</th><th>Active</th></tr></thead>
                      <tbody>
                        {templates.length === 0 ? <tr><td colSpan={3}>No templates.</td></tr> : templates.map((template) => (
                          <tr key={template.id}>
                            <td>{template.name}</td>
                            <td>{template.subject_template}</td>
                            <td>{template.is_active ? 'Yes' : 'No'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                  <section className="card table-wrap">
                    <h4>Cadences</h4>
                    <table>
                      <thead><tr><th>Name</th><th>Description</th><th>Steps</th></tr></thead>
                      <tbody>
                        {cadences.length === 0 ? <tr><td colSpan={3}>No cadences.</td></tr> : cadences.map((cadence) => (
                          <tr key={cadence.id}>
                            <td>{cadence.name}</td>
                            <td>{cadence.description || '-'}</td>
                            <td>{(cadence.steps || []).length}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                </div>

                <section className="card table-wrap">
                  <h4>Sequence Enrollments</h4>
                  <table>
                    <thead><tr><th>Cadence</th><th>Account</th><th>Owner</th><th>Status</th><th>Next Step</th><th>Next Action</th><th>Action</th></tr></thead>
                    <tbody>
                      {enrollments.length === 0 ? <tr><td colSpan={7}>No enrollments.</td></tr> : enrollments.map((enrollment) => (
                        <tr key={enrollment.id}>
                          <td>{enrollment.cadence_name}</td>
                          <td>{enrollment.customer_name || enrollment.customer_number}</td>
                          <td>{enrollment.owner_name || '-'}</td>
                          <td>{enrollment.status}</td>
                          <td>{enrollment.next_step_number}</td>
                          <td>{String(enrollment.next_action_at || '').slice(0, 16).replace('T', ' ') || '-'}</td>
                          <td className="actions-cell">
                            <button type="button" className="button-secondary" onClick={() => completeEnrollmentStep(enrollment.id)}>Advance Step</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )}

            {workspaceTab === 'notifications' && (
              <div className="crm-notifications-layout">
                <div className="card filter-grid">
                  <select value={notificationFilter} onChange={(e) => setNotificationFilter(e.target.value)}>
                    <option value="">All Notifications</option>
                    <option value="UNREAD">UNREAD</option>
                    <option value="READ">READ</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                  <div className="actions-cell">
                    <button type="button" onClick={loadNotifications}>Refresh</button>
                    <button type="button" className="button-secondary" onClick={markAllNotificationsRead}>Mark All Read</button>
                  </div>
                </div>
                <div className="summary-grid">
                  <article className="card"><h4>Total</h4><p className="metric">{Number(notifications.summary?.total || 0)}</p></article>
                  <article className="card"><h4>Unread</h4><p className="metric">{Number(notifications.summary?.unread || 0)}</p></article>
                </div>
                <section className="card table-wrap">
                  <table>
                    <thead><tr><th>When</th><th>Severity</th><th>Title</th><th>Message</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>
                      {(notifications.notifications || []).length === 0 ? (
                        <tr><td colSpan={6}>No notifications.</td></tr>
                      ) : (notifications.notifications || []).map((notification) => (
                        <tr key={notification.id}>
                          <td>{String(notification.created_at || '').slice(0, 19).replace('T', ' ')}</td>
                          <td>{notification.severity}</td>
                          <td>{notification.title}</td>
                          <td>{notification.message}</td>
                          <td>{notification.status}</td>
                          <td>
                            <button type="button" className="button-secondary" onClick={() => markNotificationRead(notification.id)}>Mark Read</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )}

            {workspaceTab === 'automation' && (
              <div className="crm-automation-layout">
                <section className="card table-wrap">
                  <h4>Automation Rules</h4>
                  <table>
                    <thead><tr><th>Name</th><th>Event</th><th>Condition</th><th>Action</th><th>Active</th><th>Toggle</th></tr></thead>
                    <tbody>
                      {(automation.rules || []).length === 0 ? (
                        <tr><td colSpan={6}>No automation rules configured.</td></tr>
                      ) : (automation.rules || []).map((rule) => (
                        <tr key={rule.id}>
                          <td>{rule.name}</td>
                          <td>{rule.event_type}</td>
                          <td><code>{JSON.stringify(rule.condition_json || {})}</code></td>
                          <td><code>{JSON.stringify(rule.action_json || {})}</code></td>
                          <td>{rule.is_active ? 'Yes' : 'No'}</td>
                          <td>
                            <button
                              type="button"
                              className="button-secondary"
                              disabled={user?.role !== 'SUPER_USER'}
                              onClick={() => toggleAutomationRule(rule.id, !rule.is_active)}
                            >
                              {rule.is_active ? 'Disable' : 'Enable'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                <section className="card table-wrap">
                  <h4>Automation Logs</h4>
                  <table>
                    <thead><tr><th>When</th><th>Rule</th><th>Event</th><th>Reference</th><th>Result</th><th>Detail</th></tr></thead>
                    <tbody>
                      {(automation.logs || []).length === 0 ? (
                        <tr><td colSpan={6}>No automation logs available.</td></tr>
                      ) : (automation.logs || []).map((log) => (
                        <tr key={log.id}>
                          <td>{String(log.created_at || '').slice(0, 19).replace('T', ' ')}</td>
                          <td>{log.rule_name || '-'}</td>
                          <td>{log.event_type}</td>
                          <td>{log.reference_type || '-'} #{log.reference_id || '-'}</td>
                          <td>{log.result}</td>
                          <td><code>{JSON.stringify(log.detail_json || {})}</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>
            )}

            {message && <p className="crm-message">{message}</p>}
          </section>
        </div>
      </div>
    </section>
  );
}
