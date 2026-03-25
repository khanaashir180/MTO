const express = require('express');
const { authRequired, requireRoleOrPermission } = require('../middleware/auth');
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
const canManageFinanceSettings = requireRoleOrPermission(
  ['SUPER_USER', 'FINANCE'],
  ['finance_manage_settings']
);

router.get('/accounts', canUseRetailFinanceLookups, listAccounts);
router.get('/trial-balance', canViewFinanceReports, getTrialBalance);
router.get('/payment-accounts', canUseRetailFinanceLookups, listPaymentAccounts);
router.post('/payment-accounts', canManageFinanceSettings, createPaymentAccount);
router.put('/payment-accounts/:id', canManageFinanceSettings, updatePaymentAccount);
router.get('/accounts/:id/ledger', canUseRetailFinanceLookups, getAccountLedger);
router.post('/accounts/:id/ledger', canUseRetailFinanceLookups, idempotencyRequired(), postLedgerEntry);
router.get('/bank-statements', canManageFinanceSettings, listBankStatementEntries);
router.post('/bank-statements', canManageFinanceSettings, idempotencyRequired(), addBankStatementEntry);
router.get('/payments/pending', canManageFinanceSettings, listPendingVerifications);
router.post('/payments/verify', canManageFinanceSettings, idempotencyRequired(), verifyPaymentEntry);
router.get('/dashboard/overview', canViewFinanceReports, getAccountingOverview);
router.get('/coa/accounts', canManageFinanceSettings, listChartAccounts);
router.post('/coa/accounts', canManageFinanceSettings, createChartAccount);
router.get('/vendors', canManageFinanceSettings, listVendors);
router.post('/vendors', canManageFinanceSettings, createVendor);
router.get('/tax-rates', canManageFinanceSettings, listTaxRates);
router.post('/tax-rates', canManageFinanceSettings, createTaxRate);
router.get('/invoices', canManageFinanceSettings, listInvoices);
router.post('/invoices', canManageFinanceSettings, createInvoice);
router.post('/invoices/:id/lines', canManageFinanceSettings, addInvoiceLine);
router.put('/invoices/:id/status', canManageFinanceSettings, updateInvoiceStatus);
router.get('/bills', canManageFinanceSettings, listBills);
router.post('/bills', canManageFinanceSettings, createBill);
router.post('/bills/:id/lines', canManageFinanceSettings, addBillLine);
router.put('/bills/:id/status', canManageFinanceSettings, updateBillStatus);
router.get('/bank-transactions', canManageFinanceSettings, listBankTransactions);
router.post('/bank-transactions', canManageFinanceSettings, createBankTransaction);
router.get('/reconciliations', canManageFinanceSettings, listReconciliations);
router.post('/reconciliations', canManageFinanceSettings, createReconciliation);
router.put('/reconciliations/:id/close', canManageFinanceSettings, closeReconciliation);
router.get('/reports/financials', canManageFinanceSettings, getFinancialReports);
router.get('/purchasing/orders', canManageFinanceSettings, listPurchaseOrders);
router.post('/purchasing/orders', canManageFinanceSettings, createPurchaseOrder);
router.post('/purchasing/orders/:id/lines', canManageFinanceSettings, addPurchaseOrderLine);
router.put('/purchasing/orders/:id/status', canManageFinanceSettings, updatePurchaseOrderStatus);
router.get('/recurring/templates', canManageFinanceSettings, listRecurringTemplates);
router.post('/recurring/templates', canManageFinanceSettings, createRecurringTemplate);
router.post('/recurring/templates/:id/run', canManageFinanceSettings, runRecurringTemplate);
router.post('/batch/actions', canManageFinanceSettings, runBatchFinanceActions);
router.get('/inventory/items', canManageFinanceSettings, listInventoryItems);
router.post('/inventory/items', canManageFinanceSettings, createInventoryItem);
router.post('/inventory/movements', canManageFinanceSettings, createInventoryMovement);
router.get('/inventory/valuation', canManageFinanceSettings, getInventoryValuation);
router.get('/budgeting/budgets', canManageFinanceSettings, listBudgets);
router.post('/budgeting/budgets', canManageFinanceSettings, createBudget);
router.get('/projects', canManageFinanceSettings, listProjects);
router.post('/projects', canManageFinanceSettings, createProject);
router.post('/projects/:id/entries', canManageFinanceSettings, addProjectEntry);
router.get('/dimensions/classes', canManageFinanceSettings, listClasses);
router.post('/dimensions/classes', canManageFinanceSettings, createClass);
router.get('/dimensions/locations', canManageFinanceSettings, listLocations);
router.post('/dimensions/locations', canManageFinanceSettings, createLocation);
router.get('/payroll/profiles', canManageFinanceSettings, listPayrollProfiles);
router.post('/payroll/profiles', canManageFinanceSettings, createPayrollProfile);
router.get('/payroll/runs', canManageFinanceSettings, listPayrollRuns);
router.post('/payroll/runs', canManageFinanceSettings, createPayrollRun);
router.put('/payroll/runs/:id/status', canManageFinanceSettings, updatePayrollRunStatus);
router.get('/automation/bank-rules', canManageFinanceSettings, listBankRules);
router.post('/automation/bank-rules', canManageFinanceSettings, createBankRule);
router.post('/automation/bank-rules/run-engine', canManageFinanceSettings, runBankRuleEngine);
router.get('/automation/reports', canManageFinanceSettings, listReportAutomation);
router.post('/automation/reports/presets', canManageFinanceSettings, createReportPreset);
router.post('/automation/reports/schedules', canManageFinanceSettings, createReportSchedule);
router.post('/automation/reports/exports', canManageFinanceSettings, exportReport);
router.get('/inventory/lots', canManageFinanceSettings, listInventoryLots);
router.post('/inventory/lots/receive', canManageFinanceSettings, receiveInventoryLot);
router.post('/inventory/lots/issue', canManageFinanceSettings, issueInventoryWithCogs);
router.get('/payroll/compliance', canManageFinanceSettings, listPayrollCompliance);
router.post('/payroll/compliance/tax-settings', canManageFinanceSettings, createPayrollTaxSetting);
router.post('/payroll/compliance/filings', canManageFinanceSettings, submitPayrollFiling);
router.get('/controls/accounting', canManageFinanceSettings, listAccountingControls);
router.post('/controls/accounting/policies', canManageFinanceSettings, createApprovalPolicy);
router.post('/controls/accounting/approvals', canManageFinanceSettings, requestAccountingApproval);
router.put('/controls/accounting/approvals/:id/decision', canManageFinanceSettings, decideAccountingApproval);
router.get('/quickbooks/close-books', canManageFinanceSettings, listCloseBooks);
router.post('/quickbooks/close-books', canManageFinanceSettings, upsertCloseBooksPeriod);
router.put('/quickbooks/close-books/:id/close', canManageFinanceSettings, closeBooksPeriod);
router.put('/quickbooks/close-books/:id/reopen', canManageFinanceSettings, reopenBooksPeriod);
router.get('/quickbooks/fixed-assets', canManageFinanceSettings, listFixedAssets);
router.post('/quickbooks/fixed-assets', canManageFinanceSettings, createFixedAsset);
router.post('/quickbooks/fixed-assets/depreciation-run', canManageFinanceSettings, postAssetDepreciationRun);
router.get('/quickbooks/fx', canManageFinanceSettings, listFxCenter);
router.post('/quickbooks/fx/rates', canManageFinanceSettings, upsertFxRate);
router.post('/quickbooks/fx/revalue', canManageFinanceSettings, runFxRevaluation);
router.get('/quickbooks/collections', canManageFinanceSettings, listArCollections);
router.post('/quickbooks/collections/run', canManageFinanceSettings, runArCollectionSweep);
router.get('/quickbooks/bank-feeds', canManageFinanceSettings, listBankFeedCenter);
router.post('/quickbooks/bank-feeds/connectors', canManageFinanceSettings, createBankFeedConnector);
router.post('/quickbooks/bank-feeds/import', canManageFinanceSettings, runBankFeedImport);
router.get('/quickbooks/tax-center', canManageFinanceSettings, listSalesTaxCenter);
router.post('/quickbooks/tax-center/jurisdictions', canManageFinanceSettings, upsertSalesTaxJurisdiction);
router.post('/quickbooks/tax-center/nexus', canManageFinanceSettings, upsertSalesTaxNexus);
router.post('/quickbooks/tax-center/preview', canManageFinanceSettings, previewSalesTax);
router.get('/quickbooks/payroll-plus', canManageFinanceSettings, listPayrollCompliancePlus);
router.post('/quickbooks/payroll-plus/schedules', canManageFinanceSettings, createPayrollSchedule);
router.post('/quickbooks/payroll-plus/components', canManageFinanceSettings, createPayrollComponent);
router.get('/quickbooks/ar-ap-ops', canManageFinanceSettings, listArApOps);
router.post('/quickbooks/ar-ap-ops/disputes', canManageFinanceSettings, createArDispute);
router.post('/quickbooks/ar-ap-ops/credit-memos', canManageFinanceSettings, createCreditMemo);
router.post('/quickbooks/ar-ap-ops/refunds', canManageFinanceSettings, createRefund);
router.get('/quickbooks/phase2/overview', canManageFinanceSettings, listPhase2Overview);
router.post('/quickbooks/phase2/multi-currency', canManageFinanceSettings, createMultiCurrencyEntry);
router.post('/quickbooks/phase2/fx-settlement', canManageFinanceSettings, runFxSettlement);
router.post('/quickbooks/phase2/fixed-asset-events', canManageFinanceSettings, createFixedAssetEvent);
router.post('/quickbooks/phase2/month-end/workspaces', canManageFinanceSettings, createMonthEndWorkspace);
router.post('/quickbooks/phase2/month-end/tasks', canManageFinanceSettings, createMonthEndTask);
router.put('/quickbooks/phase2/month-end/tasks/:id/status', canManageFinanceSettings, updateMonthEndTaskStatus);
router.post('/quickbooks/phase2/month-end/adjusting-entries', canManageFinanceSettings, createAdjustingEntry);
router.put('/quickbooks/phase2/month-end/adjusting-entries/:id/decision', canManageFinanceSettings, decideAdjustingEntry);
router.post('/quickbooks/phase2/filings', canManageFinanceSettings, createFilingCalendar);
router.put('/quickbooks/phase2/filings/:id/status', canManageFinanceSettings, updateFilingCalendarStatus);
router.get('/quickbooks/phase2/maturity', canManageFinanceSettings, listMaturityAutomation);
router.post('/quickbooks/phase2/maturity/jobs', canManageFinanceSettings, createOpsJob);
router.post('/quickbooks/phase2/maturity/jobs/:id/run', canManageFinanceSettings, runOpsJob);
router.post('/quickbooks/phase2/maturity/bank-feed-retries', canManageFinanceSettings, queueBankFeedRetry);
router.post('/quickbooks/phase2/maturity/bank-feed-retries/:id/run', canManageFinanceSettings, runBankFeedRetry);
router.post('/quickbooks/phase2/maturity/tax-returns', canManageFinanceSettings, createTaxReturn);
router.put('/quickbooks/phase2/maturity/tax-returns/:id/status', canManageFinanceSettings, updateTaxReturnStatus);
router.post('/quickbooks/phase2/maturity/payroll-batches', canManageFinanceSettings, createPayrollBatch);
router.post('/quickbooks/phase2/maturity/payment-intents', canManageFinanceSettings, createPaymentIntent);
router.post('/quickbooks/phase2/maturity/payment-intents/:id/apply', canManageFinanceSettings, autoApplyPaymentIntent);
router.post('/quickbooks/phase2/maturity/dunning-campaigns', canManageFinanceSettings, createDunningCampaign);
router.post('/quickbooks/phase2/maturity/dunning-campaigns/:id/run', canManageFinanceSettings, runDunningCampaign);
router.get('/quickbooks/final/overview', canManageFinanceSettings, listFinalParityOverview);
router.post('/quickbooks/final/bank-connections', canManageFinanceSettings, createBankProviderConnection);
router.post('/quickbooks/final/bank-connections/:id/sync', canManageFinanceSettings, runBankProviderSync);
router.post('/quickbooks/final/payment-gateways', canManageFinanceSettings, createPaymentGateway);
router.post('/quickbooks/final/payment-links', canManageFinanceSettings, createPaymentLink);
router.post('/quickbooks/final/payment-links/:id/capture', canManageFinanceSettings, capturePaymentLink);
router.post('/quickbooks/final/chargebacks', canManageFinanceSettings, createChargeback);
router.post('/quickbooks/final/document-templates', canManageFinanceSettings, createDocumentTemplate);
router.post('/quickbooks/final/document-dispatch', canManageFinanceSettings, dispatchDocument);
router.post('/quickbooks/final/practice-clients', canManageFinanceSettings, createPracticeClient);
router.post('/quickbooks/final/practice-access', canManageFinanceSettings, grantPracticeAccess);
router.post('/quickbooks/final/period-exceptions', canManageFinanceSettings, requestPeriodException);
router.put('/quickbooks/final/period-exceptions/:id/decision', canManageFinanceSettings, decidePeriodException);
router.post('/quickbooks/final/tax-rules', canManageFinanceSettings, createTaxRuleSet);
router.post('/quickbooks/final/payroll-rules', canManageFinanceSettings, createPayrollRuleSet);

module.exports = router;
