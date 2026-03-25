const express = require('express');
const { authRequired, requireRoles, requireRoleOrPermission } = require('../middleware/auth');
const { idempotencyRequired } = require('../middleware/idempotency');
const {
  listAccounts,
  getAccountLedger,
  postLedgerEntry,
  listBankStatementEntries,
  addBankStatementEntry,
  listPendingVerifications,
  verifyPaymentEntry,
  getTrialBalance,
  listPaymentAccounts,
  createPaymentAccount,
  updatePaymentAccount,
} = require('../controllers/financeController');
const {
  listChartAccounts,
  createChartAccount,
  listVendors,
  createVendor,
  listTaxRates,
  createTaxRate,
  listInvoices,
  createInvoice,
  addInvoiceLine,
  updateInvoiceStatus,
  listBills,
  createBill,
  addBillLine,
  updateBillStatus,
  listBankTransactions,
  createBankTransaction,
  listReconciliations,
  createReconciliation,
  closeReconciliation,
  getAccountingOverview,
} = require('../controllers/financeAdvancedController');
const {
  getFinancialReports,
  listPurchaseOrders,
  createPurchaseOrder,
  addPurchaseOrderLine,
  updatePurchaseOrderStatus,
  listRecurringTemplates,
  createRecurringTemplate,
  runRecurringTemplate,
  runBatchFinanceActions,
} = require('../controllers/financeProController');
const {
  listInventoryItems,
  createInventoryItem,
  createInventoryMovement,
  getInventoryValuation,
  listBudgets,
  createBudget,
  listProjects,
  createProject,
  addProjectEntry,
  listClasses,
  createClass,
  listLocations,
  createLocation,
  listPayrollProfiles,
  createPayrollProfile,
  listPayrollRuns,
  createPayrollRun,
  updatePayrollRunStatus,
} = require('../controllers/financeEnterpriseController');
const {
  listBankRules,
  createBankRule,
  runBankRuleEngine,
  listReportAutomation,
  createReportPreset,
  createReportSchedule,
  exportReport,
  listInventoryLots,
  receiveInventoryLot,
  issueInventoryWithCogs,
  listPayrollCompliance,
  createPayrollTaxSetting,
  submitPayrollFiling,
  listAccountingControls,
  createApprovalPolicy,
  requestAccountingApproval,
  decideAccountingApproval,
  listCloseBooks,
  upsertCloseBooksPeriod,
  closeBooksPeriod,
  reopenBooksPeriod,
  listFixedAssets,
  createFixedAsset,
  postAssetDepreciationRun,
  listFxCenter,
  upsertFxRate,
  runFxRevaluation,
  listArCollections,
  runArCollectionSweep,
  listBankFeedCenter,
  createBankFeedConnector,
  runBankFeedImport,
  listSalesTaxCenter,
  upsertSalesTaxJurisdiction,
  upsertSalesTaxNexus,
  previewSalesTax,
  listPayrollCompliancePlus,
  createPayrollSchedule,
  createPayrollComponent,
  listArApOps,
  createArDispute,
  createCreditMemo,
  createRefund,
  listPhase2Overview,
  createMultiCurrencyEntry,
  runFxSettlement,
  createFixedAssetEvent,
  createMonthEndWorkspace,
  createMonthEndTask,
  updateMonthEndTaskStatus,
  createAdjustingEntry,
  decideAdjustingEntry,
  createFilingCalendar,
  updateFilingCalendarStatus,
  listMaturityAutomation,
  createOpsJob,
  runOpsJob,
  queueBankFeedRetry,
  runBankFeedRetry,
  createTaxReturn,
  updateTaxReturnStatus,
  createPayrollBatch,
  createPaymentIntent,
  autoApplyPaymentIntent,
  createDunningCampaign,
  runDunningCampaign,
  listFinalParityOverview,
  createBankProviderConnection,
  runBankProviderSync,
  createPaymentGateway,
  createPaymentLink,
  capturePaymentLink,
  createChargeback,
  createDocumentTemplate,
  dispatchDocument,
  createPracticeClient,
  grantPracticeAccess,
  requestPeriodException,
  decidePeriodException,
  createTaxRuleSet,
  createPayrollRuleSet,
} = require('../controllers/financeControlController');

const router = express.Router();

router.use(authRequired);
const canUseRetailFinanceLookups = requireRoleOrPermission(
  ['RETAIL', 'RETAIL_STAFF', 'SHOP_MANAGER', 'FINANCE'],
  ['retail_create_order', 'finance_view_module']
);
const canViewFinanceReports = requireRoleOrPermission(
  ['FINANCE'],
  ['finance_view_trial_balance', 'finance_manage_settings']
);

router.get('/accounts', canUseRetailFinanceLookups, listAccounts);
router.get('/trial-balance', canViewFinanceReports, getTrialBalance);
router.get('/payment-accounts', canUseRetailFinanceLookups, listPaymentAccounts);
router.post('/payment-accounts', requireRoles('SUPER_USER', 'FINANCE'), createPaymentAccount);
router.put('/payment-accounts/:id', requireRoles('SUPER_USER', 'FINANCE'), updatePaymentAccount);
router.get('/accounts/:id/ledger', canUseRetailFinanceLookups, getAccountLedger);
router.post('/accounts/:id/ledger', canUseRetailFinanceLookups, idempotencyRequired(), postLedgerEntry);
router.get('/bank-statements', requireRoles('SUPER_USER', 'FINANCE'), listBankStatementEntries);
router.post('/bank-statements', requireRoles('SUPER_USER', 'FINANCE'), idempotencyRequired(), addBankStatementEntry);
router.get('/payments/pending', requireRoles('SUPER_USER', 'FINANCE'), listPendingVerifications);
router.post('/payments/verify', requireRoles('SUPER_USER', 'FINANCE'), idempotencyRequired(), verifyPaymentEntry);
router.get('/dashboard/overview', canViewFinanceReports, getAccountingOverview);
router.get('/coa/accounts', requireRoles('SUPER_USER', 'FINANCE'), listChartAccounts);
router.post('/coa/accounts', requireRoles('SUPER_USER', 'FINANCE'), createChartAccount);
router.get('/vendors', requireRoles('SUPER_USER', 'FINANCE'), listVendors);
router.post('/vendors', requireRoles('SUPER_USER', 'FINANCE'), createVendor);
router.get('/tax-rates', requireRoles('SUPER_USER', 'FINANCE'), listTaxRates);
router.post('/tax-rates', requireRoles('SUPER_USER', 'FINANCE'), createTaxRate);
router.get('/invoices', requireRoles('SUPER_USER', 'FINANCE'), listInvoices);
router.post('/invoices', requireRoles('SUPER_USER', 'FINANCE'), createInvoice);
router.post('/invoices/:id/lines', requireRoles('SUPER_USER', 'FINANCE'), addInvoiceLine);
router.put('/invoices/:id/status', requireRoles('SUPER_USER', 'FINANCE'), updateInvoiceStatus);
router.get('/bills', requireRoles('SUPER_USER', 'FINANCE'), listBills);
router.post('/bills', requireRoles('SUPER_USER', 'FINANCE'), createBill);
router.post('/bills/:id/lines', requireRoles('SUPER_USER', 'FINANCE'), addBillLine);
router.put('/bills/:id/status', requireRoles('SUPER_USER', 'FINANCE'), updateBillStatus);
router.get('/bank-transactions', requireRoles('SUPER_USER', 'FINANCE'), listBankTransactions);
router.post('/bank-transactions', requireRoles('SUPER_USER', 'FINANCE'), createBankTransaction);
router.get('/reconciliations', requireRoles('SUPER_USER', 'FINANCE'), listReconciliations);
router.post('/reconciliations', requireRoles('SUPER_USER', 'FINANCE'), createReconciliation);
router.put('/reconciliations/:id/close', requireRoles('SUPER_USER', 'FINANCE'), closeReconciliation);
router.get('/reports/financials', requireRoles('SUPER_USER', 'FINANCE'), getFinancialReports);
router.get('/purchasing/orders', requireRoles('SUPER_USER', 'FINANCE'), listPurchaseOrders);
router.post('/purchasing/orders', requireRoles('SUPER_USER', 'FINANCE'), createPurchaseOrder);
router.post('/purchasing/orders/:id/lines', requireRoles('SUPER_USER', 'FINANCE'), addPurchaseOrderLine);
router.put('/purchasing/orders/:id/status', requireRoles('SUPER_USER', 'FINANCE'), updatePurchaseOrderStatus);
router.get('/recurring/templates', requireRoles('SUPER_USER', 'FINANCE'), listRecurringTemplates);
router.post('/recurring/templates', requireRoles('SUPER_USER', 'FINANCE'), createRecurringTemplate);
router.post('/recurring/templates/:id/run', requireRoles('SUPER_USER', 'FINANCE'), runRecurringTemplate);
router.post('/batch/actions', requireRoles('SUPER_USER', 'FINANCE'), runBatchFinanceActions);
router.get('/inventory/items', requireRoles('SUPER_USER', 'FINANCE'), listInventoryItems);
router.post('/inventory/items', requireRoles('SUPER_USER', 'FINANCE'), createInventoryItem);
router.post('/inventory/movements', requireRoles('SUPER_USER', 'FINANCE'), createInventoryMovement);
router.get('/inventory/valuation', requireRoles('SUPER_USER', 'FINANCE'), getInventoryValuation);
router.get('/budgeting/budgets', requireRoles('SUPER_USER', 'FINANCE'), listBudgets);
router.post('/budgeting/budgets', requireRoles('SUPER_USER', 'FINANCE'), createBudget);
router.get('/projects', requireRoles('SUPER_USER', 'FINANCE'), listProjects);
router.post('/projects', requireRoles('SUPER_USER', 'FINANCE'), createProject);
router.post('/projects/:id/entries', requireRoles('SUPER_USER', 'FINANCE'), addProjectEntry);
router.get('/dimensions/classes', requireRoles('SUPER_USER', 'FINANCE'), listClasses);
router.post('/dimensions/classes', requireRoles('SUPER_USER', 'FINANCE'), createClass);
router.get('/dimensions/locations', requireRoles('SUPER_USER', 'FINANCE'), listLocations);
router.post('/dimensions/locations', requireRoles('SUPER_USER', 'FINANCE'), createLocation);
router.get('/payroll/profiles', requireRoles('SUPER_USER', 'FINANCE'), listPayrollProfiles);
router.post('/payroll/profiles', requireRoles('SUPER_USER', 'FINANCE'), createPayrollProfile);
router.get('/payroll/runs', requireRoles('SUPER_USER', 'FINANCE'), listPayrollRuns);
router.post('/payroll/runs', requireRoles('SUPER_USER', 'FINANCE'), createPayrollRun);
router.put('/payroll/runs/:id/status', requireRoles('SUPER_USER', 'FINANCE'), updatePayrollRunStatus);
router.get('/automation/bank-rules', requireRoles('SUPER_USER', 'FINANCE'), listBankRules);
router.post('/automation/bank-rules', requireRoles('SUPER_USER', 'FINANCE'), createBankRule);
router.post('/automation/bank-rules/run-engine', requireRoles('SUPER_USER', 'FINANCE'), runBankRuleEngine);
router.get('/automation/reports', requireRoles('SUPER_USER', 'FINANCE'), listReportAutomation);
router.post('/automation/reports/presets', requireRoles('SUPER_USER', 'FINANCE'), createReportPreset);
router.post('/automation/reports/schedules', requireRoles('SUPER_USER', 'FINANCE'), createReportSchedule);
router.post('/automation/reports/exports', requireRoles('SUPER_USER', 'FINANCE'), exportReport);
router.get('/inventory/lots', requireRoles('SUPER_USER', 'FINANCE'), listInventoryLots);
router.post('/inventory/lots/receive', requireRoles('SUPER_USER', 'FINANCE'), receiveInventoryLot);
router.post('/inventory/lots/issue', requireRoles('SUPER_USER', 'FINANCE'), issueInventoryWithCogs);
router.get('/payroll/compliance', requireRoles('SUPER_USER', 'FINANCE'), listPayrollCompliance);
router.post('/payroll/compliance/tax-settings', requireRoles('SUPER_USER', 'FINANCE'), createPayrollTaxSetting);
router.post('/payroll/compliance/filings', requireRoles('SUPER_USER', 'FINANCE'), submitPayrollFiling);
router.get('/controls/accounting', requireRoles('SUPER_USER', 'FINANCE'), listAccountingControls);
router.post('/controls/accounting/policies', requireRoles('SUPER_USER', 'FINANCE'), createApprovalPolicy);
router.post('/controls/accounting/approvals', requireRoles('SUPER_USER', 'FINANCE'), requestAccountingApproval);
router.put('/controls/accounting/approvals/:id/decision', requireRoles('SUPER_USER', 'FINANCE'), decideAccountingApproval);
router.get('/quickbooks/close-books', requireRoles('SUPER_USER', 'FINANCE'), listCloseBooks);
router.post('/quickbooks/close-books', requireRoles('SUPER_USER', 'FINANCE'), upsertCloseBooksPeriod);
router.put('/quickbooks/close-books/:id/close', requireRoles('SUPER_USER', 'FINANCE'), closeBooksPeriod);
router.put('/quickbooks/close-books/:id/reopen', requireRoles('SUPER_USER', 'FINANCE'), reopenBooksPeriod);
router.get('/quickbooks/fixed-assets', requireRoles('SUPER_USER', 'FINANCE'), listFixedAssets);
router.post('/quickbooks/fixed-assets', requireRoles('SUPER_USER', 'FINANCE'), createFixedAsset);
router.post('/quickbooks/fixed-assets/depreciation-run', requireRoles('SUPER_USER', 'FINANCE'), postAssetDepreciationRun);
router.get('/quickbooks/fx', requireRoles('SUPER_USER', 'FINANCE'), listFxCenter);
router.post('/quickbooks/fx/rates', requireRoles('SUPER_USER', 'FINANCE'), upsertFxRate);
router.post('/quickbooks/fx/revalue', requireRoles('SUPER_USER', 'FINANCE'), runFxRevaluation);
router.get('/quickbooks/collections', requireRoles('SUPER_USER', 'FINANCE'), listArCollections);
router.post('/quickbooks/collections/run', requireRoles('SUPER_USER', 'FINANCE'), runArCollectionSweep);
router.get('/quickbooks/bank-feeds', requireRoles('SUPER_USER', 'FINANCE'), listBankFeedCenter);
router.post('/quickbooks/bank-feeds/connectors', requireRoles('SUPER_USER', 'FINANCE'), createBankFeedConnector);
router.post('/quickbooks/bank-feeds/import', requireRoles('SUPER_USER', 'FINANCE'), runBankFeedImport);
router.get('/quickbooks/tax-center', requireRoles('SUPER_USER', 'FINANCE'), listSalesTaxCenter);
router.post('/quickbooks/tax-center/jurisdictions', requireRoles('SUPER_USER', 'FINANCE'), upsertSalesTaxJurisdiction);
router.post('/quickbooks/tax-center/nexus', requireRoles('SUPER_USER', 'FINANCE'), upsertSalesTaxNexus);
router.post('/quickbooks/tax-center/preview', requireRoles('SUPER_USER', 'FINANCE'), previewSalesTax);
router.get('/quickbooks/payroll-plus', requireRoles('SUPER_USER', 'FINANCE'), listPayrollCompliancePlus);
router.post('/quickbooks/payroll-plus/schedules', requireRoles('SUPER_USER', 'FINANCE'), createPayrollSchedule);
router.post('/quickbooks/payroll-plus/components', requireRoles('SUPER_USER', 'FINANCE'), createPayrollComponent);
router.get('/quickbooks/ar-ap-ops', requireRoles('SUPER_USER', 'FINANCE'), listArApOps);
router.post('/quickbooks/ar-ap-ops/disputes', requireRoles('SUPER_USER', 'FINANCE'), createArDispute);
router.post('/quickbooks/ar-ap-ops/credit-memos', requireRoles('SUPER_USER', 'FINANCE'), createCreditMemo);
router.post('/quickbooks/ar-ap-ops/refunds', requireRoles('SUPER_USER', 'FINANCE'), createRefund);
router.get('/quickbooks/phase2/overview', requireRoles('SUPER_USER', 'FINANCE'), listPhase2Overview);
router.post('/quickbooks/phase2/multi-currency', requireRoles('SUPER_USER', 'FINANCE'), createMultiCurrencyEntry);
router.post('/quickbooks/phase2/fx-settlement', requireRoles('SUPER_USER', 'FINANCE'), runFxSettlement);
router.post('/quickbooks/phase2/fixed-asset-events', requireRoles('SUPER_USER', 'FINANCE'), createFixedAssetEvent);
router.post('/quickbooks/phase2/month-end/workspaces', requireRoles('SUPER_USER', 'FINANCE'), createMonthEndWorkspace);
router.post('/quickbooks/phase2/month-end/tasks', requireRoles('SUPER_USER', 'FINANCE'), createMonthEndTask);
router.put('/quickbooks/phase2/month-end/tasks/:id/status', requireRoles('SUPER_USER', 'FINANCE'), updateMonthEndTaskStatus);
router.post('/quickbooks/phase2/month-end/adjusting-entries', requireRoles('SUPER_USER', 'FINANCE'), createAdjustingEntry);
router.put('/quickbooks/phase2/month-end/adjusting-entries/:id/decision', requireRoles('SUPER_USER', 'FINANCE'), decideAdjustingEntry);
router.post('/quickbooks/phase2/filings', requireRoles('SUPER_USER', 'FINANCE'), createFilingCalendar);
router.put('/quickbooks/phase2/filings/:id/status', requireRoles('SUPER_USER', 'FINANCE'), updateFilingCalendarStatus);
router.get('/quickbooks/phase2/maturity', requireRoles('SUPER_USER', 'FINANCE'), listMaturityAutomation);
router.post('/quickbooks/phase2/maturity/jobs', requireRoles('SUPER_USER', 'FINANCE'), createOpsJob);
router.post('/quickbooks/phase2/maturity/jobs/:id/run', requireRoles('SUPER_USER', 'FINANCE'), runOpsJob);
router.post('/quickbooks/phase2/maturity/bank-feed-retries', requireRoles('SUPER_USER', 'FINANCE'), queueBankFeedRetry);
router.post('/quickbooks/phase2/maturity/bank-feed-retries/:id/run', requireRoles('SUPER_USER', 'FINANCE'), runBankFeedRetry);
router.post('/quickbooks/phase2/maturity/tax-returns', requireRoles('SUPER_USER', 'FINANCE'), createTaxReturn);
router.put('/quickbooks/phase2/maturity/tax-returns/:id/status', requireRoles('SUPER_USER', 'FINANCE'), updateTaxReturnStatus);
router.post('/quickbooks/phase2/maturity/payroll-batches', requireRoles('SUPER_USER', 'FINANCE'), createPayrollBatch);
router.post('/quickbooks/phase2/maturity/payment-intents', requireRoles('SUPER_USER', 'FINANCE'), createPaymentIntent);
router.post('/quickbooks/phase2/maturity/payment-intents/:id/apply', requireRoles('SUPER_USER', 'FINANCE'), autoApplyPaymentIntent);
router.post('/quickbooks/phase2/maturity/dunning-campaigns', requireRoles('SUPER_USER', 'FINANCE'), createDunningCampaign);
router.post('/quickbooks/phase2/maturity/dunning-campaigns/:id/run', requireRoles('SUPER_USER', 'FINANCE'), runDunningCampaign);
router.get('/quickbooks/final/overview', requireRoles('SUPER_USER', 'FINANCE'), listFinalParityOverview);
router.post('/quickbooks/final/bank-connections', requireRoles('SUPER_USER', 'FINANCE'), createBankProviderConnection);
router.post('/quickbooks/final/bank-connections/:id/sync', requireRoles('SUPER_USER', 'FINANCE'), runBankProviderSync);
router.post('/quickbooks/final/payment-gateways', requireRoles('SUPER_USER', 'FINANCE'), createPaymentGateway);
router.post('/quickbooks/final/payment-links', requireRoles('SUPER_USER', 'FINANCE'), createPaymentLink);
router.post('/quickbooks/final/payment-links/:id/capture', requireRoles('SUPER_USER', 'FINANCE'), capturePaymentLink);
router.post('/quickbooks/final/chargebacks', requireRoles('SUPER_USER', 'FINANCE'), createChargeback);
router.post('/quickbooks/final/document-templates', requireRoles('SUPER_USER', 'FINANCE'), createDocumentTemplate);
router.post('/quickbooks/final/document-dispatch', requireRoles('SUPER_USER', 'FINANCE'), dispatchDocument);
router.post('/quickbooks/final/practice-clients', requireRoles('SUPER_USER', 'FINANCE'), createPracticeClient);
router.post('/quickbooks/final/practice-access', requireRoles('SUPER_USER', 'FINANCE'), grantPracticeAccess);
router.post('/quickbooks/final/period-exceptions', requireRoles('SUPER_USER', 'FINANCE'), requestPeriodException);
router.put('/quickbooks/final/period-exceptions/:id/decision', requireRoles('SUPER_USER', 'FINANCE'), decidePeriodException);
router.post('/quickbooks/final/tax-rules', requireRoles('SUPER_USER', 'FINANCE'), createTaxRuleSet);
router.post('/quickbooks/final/payroll-rules', requireRoles('SUPER_USER', 'FINANCE'), createPayrollRuleSet);

module.exports = router;
