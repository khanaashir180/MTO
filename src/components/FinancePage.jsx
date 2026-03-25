import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

function money(v) {
  return Number(v || 0).toFixed(2);
}

export default function FinancePage({ refreshSignal = 0 }) {
  const { user } = useAuth();
  const isOutletUser = Boolean(user?.outlet_name);
  const canAdvancedFinance = ['FINANCE', 'SUPER_USER'].includes(user?.role);
  const [filters, setFilters] = useState({ search: '', outlet: '' });
  const [accounts, setAccounts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [ledger, setLedger] = useState({ account: null, summary: {}, entries: [] });
  const [entryForm, setEntryForm] = useState({
    entryDate: new Date().toISOString().slice(0, 10),
    entryType: 'CREDIT',
    category: 'RECEIPT',
    amount: '',
    referenceOrderId: '',
    notes: '',
  });
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('ledger');
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [accountForm, setAccountForm] = useState({
    name: '',
    accountType: 'BANK',
    bankName: '',
    accountNumber: '',
    iban: '',
    isDefault: false,
  });
  const [pendingReceipts, setPendingReceipts] = useState([]);
  const [bankEntries, setBankEntries] = useState([]);
  const [selectedPendingId, setSelectedPendingId] = useState(null);
  const [selectedBankId, setSelectedBankId] = useState(null);
  const [verificationNotes, setVerificationNotes] = useState('');
  const [bankForm, setBankForm] = useState({
    transactionDate: new Date().toISOString().slice(0, 10),
    amount: '',
    referenceNo: '',
    narration: '',
    outletName: '',
    customerNumber: '',
    paymentAccountId: '',
  });
  const [overview, setOverview] = useState({ kpis: {} });
  const [coaAccounts, setCoaAccounts] = useState([]);
  const [coaForm, setCoaForm] = useState({ code: '', name: '', accountType: 'ASSET', detailType: 'OTHER' });
  const [vendors, setVendors] = useState([]);
  const [vendorForm, setVendorForm] = useState({ vendorName: '', email: '', phone: '', taxNumber: '', paymentTerms: '' });
  const [taxRates, setTaxRates] = useState([]);
  const [taxForm, setTaxForm] = useState({ taxName: '', ratePercent: '', taxScope: 'BOTH' });
  const [invoices, setInvoices] = useState([]);
  const [invoiceForm, setInvoiceForm] = useState({ accountId: '', issueDate: '', dueDate: '' });
  const [invoiceLineForm, setInvoiceLineForm] = useState({ invoiceId: '', description: '', qty: 1, unitPrice: 0, taxRateId: '' });
  const [bills, setBills] = useState([]);
  const [billForm, setBillForm] = useState({ vendorId: '', billDate: '', dueDate: '' });
  const [billLineForm, setBillLineForm] = useState({ billId: '', description: '', qty: 1, unitCost: 0, taxRateId: '' });
  const [bankTransactions, setBankTransactions] = useState([]);
  const [bankTxForm, setBankTxForm] = useState({ paymentAccountId: '', txDate: '', txType: 'MONEY_IN', amount: '', referenceNo: '', payeeName: '' });
  const [reconciliations, setReconciliations] = useState([]);
  const [reconcileForm, setReconcileForm] = useState({ paymentAccountId: '', statementEndingDate: '', statementEndingBalance: '' });
  const [financialReports, setFinancialReports] = useState({ pnl: { monthly: [] }, balance_sheet: {}, cash_flow: {}, aging: { ar: {}, ap: {} } });
  const [reportFilters, setReportFilters] = useState({ from: '', to: '' });
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [purchaseOrderForm, setPurchaseOrderForm] = useState({ vendorId: '', poDate: '', expectedDate: '' });
  const [purchaseOrderLineForm, setPurchaseOrderLineForm] = useState({ purchaseOrderId: '', description: '', qty: 1, unitCost: 0, taxRateId: '' });
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [recurringRuns, setRecurringRuns] = useState([]);
  const [recurringTemplateForm, setRecurringTemplateForm] = useState({ templateName: '', entityType: 'INVOICE', frequency: 'MONTHLY', nextRunDate: '', payload: '{}' });
  const [batchForm, setBatchForm] = useState({ actionType: 'INVOICE_STATUS', ids: '', status: 'SENT' });
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventoryValuation, setInventoryValuation] = useState({ item_count: 0, total_qty: 0, inventory_value: 0 });
  const [inventoryItemForm, setInventoryItemForm] = useState({ sku: '', itemName: '', itemType: 'PRODUCT', valuationMethod: 'FIFO', salesPrice: '' });
  const [inventoryMoveForm, setInventoryMoveForm] = useState({ itemId: '', movementType: 'PURCHASE', qty: '', unitCost: '' });
  const [budgetRows, setBudgetRows] = useState([]);
  const [classRows, setClassRows] = useState([]);
  const [locationRows, setLocationRows] = useState([]);
  const [budgetForm, setBudgetForm] = useState({ budgetName: '', fiscalYear: new Date().getFullYear(), classId: '', locationId: '', revenueTarget: '', expenseTarget: '' });
  const [projectRows, setProjectRows] = useState([]);
  const [projectForm, setProjectForm] = useState({ projectCode: '', projectName: '', customerAccountId: '', classId: '', locationId: '', budgetAmount: '' });
  const [projectEntryForm, setProjectEntryForm] = useState({ projectId: '', entryType: 'COST', amount: '', notes: '' });
  const [classForm, setClassForm] = useState({ className: '', description: '' });
  const [locationForm, setLocationForm] = useState({ locationName: '', description: '' });
  const [payrollProfiles, setPayrollProfiles] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [payrollProfileForm, setPayrollProfileForm] = useState({ employeeCode: '', fullName: '', salaryType: 'MONTHLY', baseSalary: '', taxPercent: '' });
  const [payrollRunForm, setPayrollRunForm] = useState({ runLabel: '', periodStart: '', periodEnd: '' });
  const [bankRules, setBankRules] = useState([]);
  const [bankRuleLogs, setBankRuleLogs] = useState([]);
  const [bankRuleForm, setBankRuleForm] = useState({ ruleName: '', referenceContains: '', memoContains: '', amountLte: '', amountGte: '', action: 'MATCH_INVOICE', priority: 100, active: true });
  const [reportPresets, setReportPresets] = useState([]);
  const [reportSchedules, setReportSchedules] = useState([]);
  const [reportExports, setReportExports] = useState([]);
  const [reportPresetForm, setReportPresetForm] = useState({ presetName: '', reportType: 'FINANCIAL', definition: '{}' });
  const [reportScheduleForm, setReportScheduleForm] = useState({ presetId: '', scheduleType: 'MONTHLY', nextRunDate: '', deliveryChannel: 'IN_APP', active: true });
  const [reportExportForm, setReportExportForm] = useState({ presetId: '', exportFormat: 'CSV', exportScope: '{}' });
  const [inventoryLots, setInventoryLots] = useState([]);
  const [lotReceiveForm, setLotReceiveForm] = useState({ itemId: '', lotNumber: '', receivedDate: '', qtyReceived: '', unitCost: '', expiryDate: '' });
  const [lotIssueForm, setLotIssueForm] = useState({ itemId: '', qty: '', movementDate: '', notes: '' });
  const [payrollTaxSettings, setPayrollTaxSettings] = useState([]);
  const [payrollFilings, setPayrollFilings] = useState([]);
  const [payrollTaxSettingForm, setPayrollTaxSettingForm] = useState({ countryCode: 'US', taxAuthority: '', filingFrequency: 'MONTHLY', paymentAccountId: '' });
  const [payrollFilingForm, setPayrollFilingForm] = useState({ payrollRunId: '', periodLabel: '', taxAuthority: '', taxDue: '', referenceNo: '', payload: '{}' });
  const [approvalPolicies, setApprovalPolicies] = useState([]);
  const [accountingApprovals, setAccountingApprovals] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [approvalPolicyForm, setApprovalPolicyForm] = useState({ entityType: 'INVOICE', thresholdAmount: '', approverRole: 'FINANCE', active: true });
  const [approvalRequestForm, setApprovalRequestForm] = useState({ entityType: 'INVOICE', entityId: '', thresholdAmount: '' });
  const [approvalDecisionForm, setApprovalDecisionForm] = useState({ approvalId: '', status: 'APPROVED', decisionNote: '' });
  const [closeBookPeriods, setCloseBookPeriods] = useState([]);
  const [closeBookForm, setCloseBookForm] = useState({ periodMonth: '', checklistJson: '{"reconcileBank":true,"reviewAR":true,"reviewAP":true,"journalReview":true}' });
  const [fixedAssets, setFixedAssets] = useState([]);
  const [depreciationRuns, setDepreciationRuns] = useState([]);
  const [fixedAssetForm, setFixedAssetForm] = useState({ assetCode: '', assetName: '', category: '', purchaseDate: '', cost: '', salvageValue: '', usefulLifeMonths: 36, currencyCode: 'USD' });
  const [depreciationForm, setDepreciationForm] = useState({ periodMonth: '', assetId: '' });
  const [fxRates, setFxRates] = useState([]);
  const [fxRevaluations, setFxRevaluations] = useState([]);
  const [fxRateForm, setFxRateForm] = useState({ currencyCode: 'USD', rateDate: '', rateToUsd: '' });
  const [fxRevalForm, setFxRevalForm] = useState({ periodEndDate: '', currencyCode: 'USD' });
  const [collectionRuns, setCollectionRuns] = useState([]);
  const [collectionItems, setCollectionItems] = useState([]);
  const [collectionForm, setCollectionForm] = useState({ minOverdueDays: 7 });
  const [bankFeedConnectors, setBankFeedConnectors] = useState([]);
  const [bankFeedRuns, setBankFeedRuns] = useState([]);
  const [bankFeedEntries, setBankFeedEntries] = useState([]);
  const [bankFeedConnectorForm, setBankFeedConnectorForm] = useState({ connectorName: '', provider: 'MANUAL' });
  const [bankFeedImportForm, setBankFeedImportForm] = useState({ connectorId: '', entriesJson: '[{"extTxId":"","txDate":"","amount":0}]' });
  const [taxJurisdictions, setTaxJurisdictions] = useState([]);
  const [taxNexusRows, setTaxNexusRows] = useState([]);
  const [taxJurisdictionForm, setTaxJurisdictionForm] = useState({ jurisdictionCode: '', countryCode: 'US', regionName: '', taxRatePercent: '' });
  const [taxNexusForm, setTaxNexusForm] = useState({ jurisdictionId: '', outletName: '' });
  const [taxPreviewForm, setTaxPreviewForm] = useState({ outletName: '', jurisdictionCode: '', amount: '' });
  const [taxPreviewResult, setTaxPreviewResult] = useState(null);
  const [payrollSchedules, setPayrollSchedules] = useState([]);
  const [payrollComponents, setPayrollComponents] = useState([]);
  const [payrollScheduleForm, setPayrollScheduleForm] = useState({ scheduleName: '', frequency: 'MONTHLY', nextPayDate: '' });
  const [payrollComponentForm, setPayrollComponentForm] = useState({ componentName: '', componentType: 'EARNING', calcType: 'PERCENT', defaultValue: '' });
  const [arDisputes, setArDisputes] = useState([]);
  const [creditMemos, setCreditMemos] = useState([]);
  const [refunds, setRefunds] = useState([]);
  const [disputeForm, setDisputeForm] = useState({ invoiceId: '', disputeReason: '' });
  const [creditMemoForm, setCreditMemoForm] = useState({ invoiceId: '', accountId: '', amount: '', reason: '' });
  const [refundForm, setRefundForm] = useState({ creditMemoId: '', amount: '', refundDate: '', paymentAccountId: '', referenceNo: '' });
  const [mcEntries, setMcEntries] = useState([]);
  const [fxSettlements, setFxSettlements] = useState([]);
  const [fixedAssetEvents, setFixedAssetEvents] = useState([]);
  const [monthEndWorkspaces, setMonthEndWorkspaces] = useState([]);
  const [monthEndTasks, setMonthEndTasks] = useState([]);
  const [adjustingEntries, setAdjustingEntries] = useState([]);
  const [filingCalendarRows, setFilingCalendarRows] = useState([]);
  const [mcForm, setMcForm] = useState({ sourceType: 'JOURNAL', sourceId: '', entrySide: 'DEBIT', currencyCode: 'USD', amountForeign: '', fxRateToUsd: '', entryDate: '' });
  const [fxSettlementForm, setFxSettlementForm] = useState({ currencyCode: 'USD', settlementDate: '', amountForeign: '', bookedRate: '', settlementRate: '' });
  const [assetEventForm, setAssetEventForm] = useState({ assetId: '', eventType: 'IMPAIRMENT', eventDate: '', amount: '', note: '' });
  const [monthEndWorkspaceForm, setMonthEndWorkspaceForm] = useState({ periodMonth: '', ownerId: '', notes: '' });
  const [monthEndTaskForm, setMonthEndTaskForm] = useState({ workspaceId: '', taskName: '', assignedTo: '', dueDate: '' });
  const [adjustingForm, setAdjustingForm] = useState({ workspaceId: '', entryDate: '', description: '', debitAccountId: '', creditAccountId: '', amount: '' });
  const [adjustingDecisionForm, setAdjustingDecisionForm] = useState({ entryId: '', status: 'APPROVED' });
  const [filingCalForm, setFilingCalForm] = useState({ filingType: 'SALES_TAX', authority: '', periodLabel: '', dueDate: '', amountDue: '' });
  const [opsJobs, setOpsJobs] = useState([]);
  const [retryQueue, setRetryQueue] = useState([]);
  const [taxReturns, setTaxReturns] = useState([]);
  const [payrollBatches, setPayrollBatches] = useState([]);
  const [paymentIntents, setPaymentIntents] = useState([]);
  const [paymentAllocations, setPaymentAllocations] = useState([]);
  const [dunningCampaigns, setDunningCampaigns] = useState([]);
  const [dunningRuns, setDunningRuns] = useState([]);
  const [opsJobForm, setOpsJobForm] = useState({ jobType: 'BANK_FEED_RETRY_SWEEP', payloadJson: '{}' });
  const [retryForm, setRetryForm] = useState({ importRunId: '', reason: '' });
  const [taxReturnForm, setTaxReturnForm] = useState({ filingType: 'SALES_TAX', authority: '', periodStart: '', periodEnd: '' });
  const [taxReturnDecisionForm, setTaxReturnDecisionForm] = useState({ taxReturnId: '', status: 'FILED' });
  const [payrollBatchForm, setPayrollBatchForm] = useState({ periodLabel: '', filingAuthority: '' });
  const [paymentIntentForm, setPaymentIntentForm] = useState({ entityType: 'INVOICE', entityId: '', intendedAmount: '', paymentDate: '', currencyCode: 'USD' });
  const [paymentApplyForm, setPaymentApplyForm] = useState({ intentId: '' });
  const [dunningCampaignForm, setDunningCampaignForm] = useState({ campaignName: '', minOverdueDays: 7, reminderChannel: 'EMAIL' });
  const [dunningRunForm, setDunningRunForm] = useState({ campaignId: '' });
  const [finalBankConnections, setFinalBankConnections] = useState([]);
  const [finalBankSyncRuns, setFinalBankSyncRuns] = useState([]);
  const [finalPaymentGateways, setFinalPaymentGateways] = useState([]);
  const [finalPaymentLinks, setFinalPaymentLinks] = useState([]);
  const [finalPaymentTxns, setFinalPaymentTxns] = useState([]);
  const [finalChargebacks, setFinalChargebacks] = useState([]);
  const [finalDocTemplates, setFinalDocTemplates] = useState([]);
  const [finalDocDispatchLogs, setFinalDocDispatchLogs] = useState([]);
  const [finalPracticeClients, setFinalPracticeClients] = useState([]);
  const [finalPracticeAccess, setFinalPracticeAccess] = useState([]);
  const [finalPeriodExceptions, setFinalPeriodExceptions] = useState([]);
  const [finalTaxRules, setFinalTaxRules] = useState([]);
  const [finalPayrollRules, setFinalPayrollRules] = useState([]);
  const [finalBankConnectionForm, setFinalBankConnectionForm] = useState({ providerName: '', connectorLabel: '', authMode: 'OAUTH2' });
  const [finalBankSyncForm, setFinalBankSyncForm] = useState({ connectionId: '', importedCount: '', failedCount: '', webhookEventRef: '' });
  const [finalGatewayForm, setFinalGatewayForm] = useState({ gatewayName: '', provider: '' });
  const [finalPaymentLinkForm, setFinalPaymentLinkForm] = useState({ entityType: 'INVOICE', entityId: '', gatewayId: '', amount: '', currencyCode: 'USD', expiresAt: '' });
  const [finalCaptureForm, setFinalCaptureForm] = useState({ paymentLinkId: '' });
  const [finalChargebackForm, setFinalChargebackForm] = useState({ paymentTransactionId: '', amount: '', reason: '' });
  const [finalDocTemplateForm, setFinalDocTemplateForm] = useState({ templateName: '', documentType: 'INVOICE', subjectTemplate: '', bodyTemplate: '' });
  const [finalDocDispatchForm, setFinalDocDispatchForm] = useState({ templateId: '', entityType: 'INVOICE', entityId: '', recipient: '', channel: 'EMAIL', metadataJson: '{}' });
  const [finalPracticeClientForm, setFinalPracticeClientForm] = useState({ clientName: '', legalEntity: '' });
  const [finalPracticeAccessForm, setFinalPracticeAccessForm] = useState({ clientId: '', userId: '', roleLabel: 'ACCOUNTANT' });
  const [finalPeriodExceptionForm, setFinalPeriodExceptionForm] = useState({ periodMonth: '', exceptionType: 'POST_CLOSE_JOURNAL', reason: '' });
  const [finalPeriodDecisionForm, setFinalPeriodDecisionForm] = useState({ exceptionId: '', status: 'APPROVED' });
  const [finalTaxRuleForm, setFinalTaxRuleForm] = useState({ ruleName: '', jurisdictionCode: '', ruleJson: '{}' });
  const [finalPayrollRuleForm, setFinalPayrollRuleForm] = useState({ ruleName: '', countryCode: 'US', ruleJson: '{}' });

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.search) p.set('search', filters.search);
    if (!isOutletUser && filters.outlet) p.set('outlet', filters.outlet);
    return p.toString();
  }, [filters, isOutletUser]);
  const paymentSummary = useMemo(() => {
    const total = paymentAccounts.length;
    const bank = paymentAccounts.filter((a) => a.account_type === 'BANK').length;
    const cash = paymentAccounts.filter((a) => a.account_type === 'CASH').length;
    const cod = paymentAccounts.filter((a) => a.account_type === 'COD').length;
    const active = paymentAccounts.filter((a) => a.is_active).length;
    const defaultName = paymentAccounts.find((a) => a.is_default)?.name || '-';
    return { total, bank, cash, cod, active, defaultName };
  }, [paymentAccounts]);

  useEffect(() => {
    api.get(`/finance/accounts?${query}`).then(({ data }) => {
      const list = data.accounts || [];
      setAccounts(list);
      if (!selectedId && list.length) setSelectedId(list[0].id);
      if (selectedId && !list.some((a) => a.id === selectedId)) {
        setSelectedId(list[0]?.id || null);
      }
    });
  }, [query, refreshSignal, selectedId]);

  async function loadPaymentAccounts() {
    const { data } = await api.get('/finance/payment-accounts');
    const list = data.accounts || [];
    setPaymentAccounts(list);
    const def = list.find((a) => a.is_default) || list[0];
    if (def) {
      setEntryForm((p) => ({ ...p, paymentAccountId: p.paymentAccountId || String(def.id) }));
      setBankForm((p) => ({ ...p, paymentAccountId: p.paymentAccountId || String(def.id) }));
    }
  }

  useEffect(() => {
    loadPaymentAccounts().catch(() => {});
  }, [refreshSignal]);

  const loadAdvancedFinance = useCallback(async () => {
    if (!canAdvancedFinance) return;
    const [
      overviewRes,
      coaRes,
      vendorRes,
      taxRes,
      invoiceRes,
      billRes,
      bankTxRes,
      reconcileRes,
    ] = await Promise.all([
      api.get('/finance/dashboard/overview'),
      api.get('/finance/coa/accounts'),
      api.get('/finance/vendors'),
      api.get('/finance/tax-rates'),
      api.get('/finance/invoices'),
      api.get('/finance/bills'),
      api.get('/finance/bank-transactions'),
      api.get('/finance/reconciliations'),
    ]);
    setOverview(overviewRes.data || { kpis: {} });
    setCoaAccounts(coaRes.data?.accounts || []);
    setVendors(vendorRes.data?.vendors || []);
    setTaxRates(taxRes.data?.taxRates || []);
    setInvoices(invoiceRes.data?.invoices || []);
    setBills(billRes.data?.bills || []);
    setBankTransactions(bankTxRes.data?.transactions || []);
    setReconciliations(reconcileRes.data?.reconciliations || []);
  }, [canAdvancedFinance]);

  const loadFinancePro = useCallback(async () => {
    if (!canAdvancedFinance) return;
    const params = new URLSearchParams();
    if (reportFilters.from) params.set('from', reportFilters.from);
    if (reportFilters.to) params.set('to', reportFilters.to);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    const [reportsRes, poRes, recurringRes] = await Promise.all([
      api.get(`/finance/reports/financials${suffix}`),
      api.get('/finance/purchasing/orders'),
      api.get('/finance/recurring/templates'),
    ]);
    setFinancialReports(reportsRes.data || { pnl: { monthly: [] }, balance_sheet: {}, cash_flow: {}, aging: { ar: {}, ap: {} } });
    setPurchaseOrders(poRes.data?.purchaseOrders || []);
    setRecurringTemplates(recurringRes.data?.templates || []);
    setRecurringRuns(recurringRes.data?.runs || []);
  }, [canAdvancedFinance, reportFilters.from, reportFilters.to]);

  const loadFinanceEnterprise = useCallback(async () => {
    if (!canAdvancedFinance) return;
    const [
      itemsRes,
      valuationRes,
      budgetsRes,
      classesRes,
      locationsRes,
      projectsRes,
      payrollProfilesRes,
      payrollRunsRes,
    ] = await Promise.all([
      api.get('/finance/inventory/items'),
      api.get('/finance/inventory/valuation'),
      api.get('/finance/budgeting/budgets'),
      api.get('/finance/dimensions/classes'),
      api.get('/finance/dimensions/locations'),
      api.get('/finance/projects'),
      api.get('/finance/payroll/profiles'),
      api.get('/finance/payroll/runs'),
    ]);
    setInventoryItems(itemsRes.data?.items || []);
    setInventoryValuation(valuationRes.data?.valuation || { item_count: 0, total_qty: 0, inventory_value: 0 });
    setBudgetRows(budgetsRes.data?.budgets || []);
    setClassRows(classesRes.data?.classes || []);
    setLocationRows(locationsRes.data?.locations || []);
    setProjectRows(projectsRes.data?.projects || []);
    setPayrollProfiles(payrollProfilesRes.data?.profiles || []);
    setPayrollRuns(payrollRunsRes.data?.runs || []);
  }, [canAdvancedFinance]);

  const loadFinanceControls = useCallback(async () => {
    if (!canAdvancedFinance) return;
    const [rulesRes, automationRes, lotsRes, complianceRes, controlsRes] = await Promise.all([
      api.get('/finance/automation/bank-rules'),
      api.get('/finance/automation/reports'),
      api.get('/finance/inventory/lots'),
      api.get('/finance/payroll/compliance'),
      api.get('/finance/controls/accounting'),
    ]);
    setBankRules(rulesRes.data?.rules || []);
    setBankRuleLogs(rulesRes.data?.matchLogs || []);
    setReportPresets(automationRes.data?.presets || []);
    setReportSchedules(automationRes.data?.schedules || []);
    setReportExports(automationRes.data?.exports || []);
    setInventoryLots(lotsRes.data?.lots || []);
    setPayrollTaxSettings(complianceRes.data?.taxSettings || []);
    setPayrollFilings(complianceRes.data?.filings || []);
    setApprovalPolicies(controlsRes.data?.policies || []);
    setAccountingApprovals(controlsRes.data?.approvals || []);
    setAuditLogs(controlsRes.data?.audits || []);
  }, [canAdvancedFinance]);

  const loadQuickbooksOps = useCallback(async () => {
    if (!canAdvancedFinance) return;
    const [closeRes, assetsRes, fxRes, collectionsRes, bankFeedRes, taxCenterRes, payrollPlusRes, arapRes, phase2Res, maturityRes, finalRes] = await Promise.all([
      api.get('/finance/quickbooks/close-books'),
      api.get('/finance/quickbooks/fixed-assets'),
      api.get('/finance/quickbooks/fx'),
      api.get('/finance/quickbooks/collections'),
      api.get('/finance/quickbooks/bank-feeds'),
      api.get('/finance/quickbooks/tax-center'),
      api.get('/finance/quickbooks/payroll-plus'),
      api.get('/finance/quickbooks/ar-ap-ops'),
      api.get('/finance/quickbooks/phase2/overview'),
      api.get('/finance/quickbooks/phase2/maturity'),
      api.get('/finance/quickbooks/final/overview'),
    ]);
    setCloseBookPeriods(closeRes.data?.periods || []);
    setFixedAssets(assetsRes.data?.assets || []);
    setDepreciationRuns(assetsRes.data?.depreciationRuns || []);
    setFxRates(fxRes.data?.rates || []);
    setFxRevaluations(fxRes.data?.revaluations || []);
    setCollectionRuns(collectionsRes.data?.runs || []);
    setCollectionItems(collectionsRes.data?.items || []);
    setBankFeedConnectors(bankFeedRes.data?.connectors || []);
    setBankFeedRuns(bankFeedRes.data?.importRuns || []);
    setBankFeedEntries(bankFeedRes.data?.entries || []);
    setTaxJurisdictions(taxCenterRes.data?.jurisdictions || []);
    setTaxNexusRows(taxCenterRes.data?.nexus || []);
    setPayrollSchedules(payrollPlusRes.data?.schedules || []);
    setPayrollComponents(payrollPlusRes.data?.components || []);
    setArDisputes(arapRes.data?.disputes || []);
    setCreditMemos(arapRes.data?.creditMemos || []);
    setRefunds(arapRes.data?.refunds || []);
    setMcEntries(phase2Res.data?.multiCurrencyEntries || []);
    setFxSettlements(phase2Res.data?.fxSettlements || []);
    setFixedAssetEvents(phase2Res.data?.fixedAssetEvents || []);
    setMonthEndWorkspaces(phase2Res.data?.monthEndWorkspaces || []);
    setMonthEndTasks(phase2Res.data?.monthEndTasks || []);
    setAdjustingEntries(phase2Res.data?.adjustingEntries || []);
    setFilingCalendarRows(phase2Res.data?.filingCalendar || []);
    setOpsJobs(maturityRes.data?.jobs || []);
    setRetryQueue(maturityRes.data?.retryQueue || []);
    setTaxReturns(maturityRes.data?.taxReturns || []);
    setPayrollBatches(maturityRes.data?.payrollBatches || []);
    setPaymentIntents(maturityRes.data?.paymentIntents || []);
    setPaymentAllocations(maturityRes.data?.paymentAllocations || []);
    setDunningCampaigns(maturityRes.data?.dunningCampaigns || []);
    setDunningRuns(maturityRes.data?.dunningRuns || []);
    setFinalBankConnections(finalRes.data?.bankProviderConnections || []);
    setFinalBankSyncRuns(finalRes.data?.bankSyncRuns || []);
    setFinalPaymentGateways(finalRes.data?.paymentGateways || []);
    setFinalPaymentLinks(finalRes.data?.paymentLinks || []);
    setFinalPaymentTxns(finalRes.data?.paymentTransactions || []);
    setFinalChargebacks(finalRes.data?.chargebacks || []);
    setFinalDocTemplates(finalRes.data?.documentTemplates || []);
    setFinalDocDispatchLogs(finalRes.data?.documentDispatchLogs || []);
    setFinalPracticeClients(finalRes.data?.practiceClients || []);
    setFinalPracticeAccess(finalRes.data?.practiceAccess || []);
    setFinalPeriodExceptions(finalRes.data?.periodExceptions || []);
    setFinalTaxRules(finalRes.data?.taxRuleSets || []);
    setFinalPayrollRules(finalRes.data?.payrollRuleSets || []);
  }, [canAdvancedFinance]);

  useEffect(() => {
    loadAdvancedFinance().catch(() => {});
  }, [loadAdvancedFinance, refreshSignal]);

  useEffect(() => {
    loadFinancePro().catch(() => {});
  }, [loadFinancePro, refreshSignal]);

  useEffect(() => {
    loadFinanceEnterprise().catch(() => {});
  }, [loadFinanceEnterprise, refreshSignal]);

  useEffect(() => {
    loadFinanceControls().catch(() => {});
  }, [loadFinanceControls, refreshSignal]);

  useEffect(() => {
    loadQuickbooksOps().catch(() => {});
  }, [loadQuickbooksOps, refreshSignal]);

  useEffect(() => {
    if (!selectedId) {
      setLedger({ account: null, summary: {}, entries: [] });
      return;
    }
    api.get(`/finance/accounts/${selectedId}/ledger`).then(({ data }) => setLedger(data));
  }, [selectedId, refreshSignal]);

  const loadVerificationData = useCallback(async () => {
    const [pendingRes, bankRes] = await Promise.all([
      api.get(`/finance/payments/pending${selectedId ? `?accountId=${selectedId}` : ''}`),
      api.get('/finance/bank-statements?status=UNMATCHED'),
    ]);
    setPendingReceipts(pendingRes.data.entries || []);
    setBankEntries(bankRes.data.entries || []);
    if (selectedPendingId && !(pendingRes.data.entries || []).some((x) => x.id === selectedPendingId)) setSelectedPendingId(null);
    if (selectedBankId && !(bankRes.data.entries || []).some((x) => x.id === selectedBankId)) setSelectedBankId(null);
  }, [selectedId, selectedPendingId, selectedBankId]);

  useEffect(() => {
    if (!['FINANCE', 'SUPER_USER'].includes(user?.role)) return;
    loadVerificationData().catch(() => {});
  }, [user?.role, loadVerificationData, refreshSignal]);

  async function postEntry() {
    try {
      setMessage('');
      if (!selectedId) return;
      if (['RECEIPT', 'ADVANCE'].includes(entryForm.category) && !entryForm.referenceOrderId) {
        setMessage('Linked order is required for receipt/advance entries');
        return;
      }
      await api.post(`/finance/accounts/${selectedId}/ledger`, {
        ...entryForm,
        amount: Number(entryForm.amount || 0),
        referenceOrderId: entryForm.referenceOrderId ? Number(entryForm.referenceOrderId) : null,
        paymentAccountId: entryForm.paymentAccountId ? Number(entryForm.paymentAccountId) : null,
      });
      setEntryForm((p) => ({ ...p, amount: '', notes: '', referenceOrderId: '' }));
      const [accountsRes, ledgerRes] = await Promise.all([
        api.get(`/finance/accounts?${query}`),
        api.get(`/finance/accounts/${selectedId}/ledger`),
      ]);
      setAccounts(accountsRes.data.accounts || []);
      setLedger(ledgerRes.data || { account: null, summary: {}, entries: [] });
      if (['FINANCE', 'SUPER_USER'].includes(user?.role)) await loadVerificationData();
      setMessage('Ledger entry posted');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to post ledger entry');
    }
  }

  async function addBankEntry() {
    try {
      setMessage('');
      await api.post('/finance/bank-statements', {
        ...bankForm,
        amount: Number(bankForm.amount || 0),
        paymentAccountId: bankForm.paymentAccountId ? Number(bankForm.paymentAccountId) : null,
      });
      setBankForm((p) => ({ ...p, amount: '', referenceNo: '', narration: '' }));
      await loadVerificationData();
      setMessage('Bank statement entry added');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to add bank statement entry');
    }
  }

  async function createPaymentAccount() {
    try {
      setMessage('');
      await api.post('/finance/payment-accounts', {
        ...accountForm,
      });
      setAccountForm({
        name: '',
        accountType: 'BANK',
        bankName: '',
        accountNumber: '',
        iban: '',
        isDefault: false,
      });
      await loadPaymentAccounts();
      setMessage('Payment account created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create payment account');
    }
  }

  async function verifySelectedPayment() {
    try {
      setMessage('');
      if (!selectedPendingId || !selectedBankId) {
        setMessage('Select one pending receipt and one bank entry to verify');
        return;
      }
      await api.post('/finance/payments/verify', {
        ledgerEntryId: selectedPendingId,
        bankStatementEntryId: selectedBankId,
        verificationNotes,
      });
      setVerificationNotes('');
      await Promise.all([
        loadVerificationData(),
        selectedId ? api.get(`/finance/accounts/${selectedId}/ledger`).then(({ data }) => setLedger(data)) : Promise.resolve(),
      ]);
      setMessage('Payment verified successfully');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to verify payment');
    }
  }

  async function createCoaAccount() {
    try {
      if (!coaForm.code.trim() || !coaForm.name.trim()) {
        setMessage('COA code and name are required');
        return;
      }
      await api.post('/finance/coa/accounts', coaForm);
      setCoaForm({ code: '', name: '', accountType: 'ASSET', detailType: 'OTHER' });
      await loadAdvancedFinance();
      setMessage('Chart of account created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create chart account');
    }
  }

  async function createVendor() {
    try {
      if (!vendorForm.vendorName.trim()) {
        setMessage('Vendor name is required');
        return;
      }
      await api.post('/finance/vendors', vendorForm);
      setVendorForm({ vendorName: '', email: '', phone: '', taxNumber: '', paymentTerms: '' });
      await loadAdvancedFinance();
      setMessage('Vendor created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create vendor');
    }
  }

  async function createTaxRate() {
    try {
      if (!taxForm.taxName.trim()) {
        setMessage('Tax name is required');
        return;
      }
      await api.post('/finance/tax-rates', { ...taxForm, ratePercent: Number(taxForm.ratePercent || 0) });
      setTaxForm({ taxName: '', ratePercent: '', taxScope: 'BOTH' });
      await loadAdvancedFinance();
      setMessage('Tax rate created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create tax rate');
    }
  }

  async function createInvoice() {
    try {
      if (!invoiceForm.accountId) {
        setMessage('Customer account is required');
        return;
      }
      await api.post('/finance/invoices', {
        accountId: Number(invoiceForm.accountId),
        issueDate: invoiceForm.issueDate || null,
        dueDate: invoiceForm.dueDate || null,
      });
      setInvoiceForm({ accountId: '', issueDate: '', dueDate: '' });
      await loadAdvancedFinance();
      setMessage('Invoice created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create invoice');
    }
  }

  async function addInvoiceLine() {
    try {
      if (!invoiceLineForm.invoiceId || !invoiceLineForm.description.trim()) {
        setMessage('Invoice and line description are required');
        return;
      }
      await api.post(`/finance/invoices/${invoiceLineForm.invoiceId}/lines`, {
        description: invoiceLineForm.description,
        qty: Number(invoiceLineForm.qty || 1),
        unitPrice: Number(invoiceLineForm.unitPrice || 0),
        taxRateId: invoiceLineForm.taxRateId ? Number(invoiceLineForm.taxRateId) : null,
      });
      setInvoiceLineForm((p) => ({ ...p, description: '', qty: 1, unitPrice: 0, taxRateId: '' }));
      await loadAdvancedFinance();
      setMessage('Invoice line added');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to add invoice line');
    }
  }

  async function markInvoiceStatus(invoiceId, status) {
    try {
      await api.put(`/finance/invoices/${invoiceId}/status`, { status });
      await loadAdvancedFinance();
      setMessage(`Invoice marked ${status}`);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update invoice status');
    }
  }

  async function createBill() {
    try {
      if (!billForm.vendorId) {
        setMessage('Vendor is required');
        return;
      }
      await api.post('/finance/bills', {
        vendorId: Number(billForm.vendorId),
        billDate: billForm.billDate || null,
        dueDate: billForm.dueDate || null,
      });
      setBillForm({ vendorId: '', billDate: '', dueDate: '' });
      await loadAdvancedFinance();
      setMessage('Bill created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create bill');
    }
  }

  async function addBillLine() {
    try {
      if (!billLineForm.billId || !billLineForm.description.trim()) {
        setMessage('Bill and line description are required');
        return;
      }
      await api.post(`/finance/bills/${billLineForm.billId}/lines`, {
        description: billLineForm.description,
        qty: Number(billLineForm.qty || 1),
        unitCost: Number(billLineForm.unitCost || 0),
        taxRateId: billLineForm.taxRateId ? Number(billLineForm.taxRateId) : null,
      });
      setBillLineForm((p) => ({ ...p, description: '', qty: 1, unitCost: 0, taxRateId: '' }));
      await loadAdvancedFinance();
      setMessage('Bill line added');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to add bill line');
    }
  }

  async function markBillStatus(billId, status) {
    try {
      await api.put(`/finance/bills/${billId}/status`, { status });
      await loadAdvancedFinance();
      setMessage(`Bill marked ${status}`);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update bill status');
    }
  }

  async function createBankTransaction() {
    try {
      if (!bankTxForm.paymentAccountId || !bankTxForm.amount) {
        setMessage('Bank account and amount are required');
        return;
      }
      await api.post('/finance/bank-transactions', {
        paymentAccountId: Number(bankTxForm.paymentAccountId),
        txDate: bankTxForm.txDate || null,
        txType: bankTxForm.txType,
        amount: Number(bankTxForm.amount || 0),
        referenceNo: bankTxForm.referenceNo,
        payeeName: bankTxForm.payeeName,
      });
      setBankTxForm({ paymentAccountId: '', txDate: '', txType: 'MONEY_IN', amount: '', referenceNo: '', payeeName: '' });
      await loadAdvancedFinance();
      setMessage('Bank transaction added');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create bank transaction');
    }
  }

  async function createReconciliation() {
    try {
      if (!reconcileForm.paymentAccountId || !reconcileForm.statementEndingDate) {
        setMessage('Bank account and statement date are required');
        return;
      }
      await api.post('/finance/reconciliations', {
        paymentAccountId: Number(reconcileForm.paymentAccountId),
        statementEndingDate: reconcileForm.statementEndingDate,
        statementEndingBalance: Number(reconcileForm.statementEndingBalance || 0),
      });
      setReconcileForm({ paymentAccountId: '', statementEndingDate: '', statementEndingBalance: '' });
      await loadAdvancedFinance();
      setMessage('Reconciliation created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create reconciliation');
    }
  }

  async function closeReconciliation(id) {
    try {
      await api.put(`/finance/reconciliations/${id}/close`);
      await loadAdvancedFinance();
      setMessage('Reconciliation closed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to close reconciliation');
    }
  }

  async function createPurchaseOrder() {
    try {
      if (!purchaseOrderForm.vendorId) {
        setMessage('Vendor is required');
        return;
      }
      await api.post('/finance/purchasing/orders', {
        vendorId: Number(purchaseOrderForm.vendorId),
        poDate: purchaseOrderForm.poDate || null,
        expectedDate: purchaseOrderForm.expectedDate || null,
      });
      setPurchaseOrderForm({ vendorId: '', poDate: '', expectedDate: '' });
      await loadFinancePro();
      setMessage('Purchase order created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create purchase order');
    }
  }

  async function addPurchaseOrderLine() {
    try {
      if (!purchaseOrderLineForm.purchaseOrderId || !purchaseOrderLineForm.description.trim()) {
        setMessage('Purchase order and description are required');
        return;
      }
      await api.post(`/finance/purchasing/orders/${purchaseOrderLineForm.purchaseOrderId}/lines`, {
        description: purchaseOrderLineForm.description,
        qty: Number(purchaseOrderLineForm.qty || 1),
        unitCost: Number(purchaseOrderLineForm.unitCost || 0),
        taxRateId: purchaseOrderLineForm.taxRateId ? Number(purchaseOrderLineForm.taxRateId) : null,
      });
      setPurchaseOrderLineForm((p) => ({ ...p, description: '', qty: 1, unitCost: 0, taxRateId: '' }));
      await loadFinancePro();
      setMessage('Purchase order line added');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to add purchase order line');
    }
  }

  async function markPurchaseOrderStatus(id, status) {
    try {
      await api.put(`/finance/purchasing/orders/${id}/status`, { status });
      await loadFinancePro();
      setMessage(`Purchase order marked ${status}`);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update purchase order status');
    }
  }

  async function createRecurringTemplate() {
    try {
      if (!recurringTemplateForm.templateName.trim() || !recurringTemplateForm.nextRunDate) {
        setMessage('Template name and next run date are required');
        return;
      }
      await api.post('/finance/recurring/templates', {
        templateName: recurringTemplateForm.templateName,
        entityType: recurringTemplateForm.entityType,
        frequency: recurringTemplateForm.frequency,
        nextRunDate: recurringTemplateForm.nextRunDate,
        payload: JSON.parse(recurringTemplateForm.payload || '{}'),
      });
      setRecurringTemplateForm({ templateName: '', entityType: 'INVOICE', frequency: 'MONTHLY', nextRunDate: '', payload: '{}' });
      await loadFinancePro();
      setMessage('Recurring template created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create recurring template');
    }
  }

  async function runRecurringNow(id) {
    try {
      await api.post(`/finance/recurring/templates/${id}/run`);
      await Promise.all([loadFinancePro(), loadAdvancedFinance()]);
      setMessage('Recurring template executed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run recurring template');
    }
  }

  async function runBatchAction() {
    try {
      const ids = batchForm.ids
        .split(',')
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isInteger(id) && id > 0);
      if (!ids.length) {
        setMessage('Provide comma-separated ids');
        return;
      }
      await api.post('/finance/batch/actions', {
        actionType: batchForm.actionType,
        ids,
        status: batchForm.status,
      });
      await Promise.all([loadFinancePro(), loadAdvancedFinance()]);
      setMessage('Batch action executed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to execute batch action');
    }
  }

  async function createInventoryItem() {
    try {
      if (!inventoryItemForm.sku.trim() || !inventoryItemForm.itemName.trim()) {
        setMessage('Inventory SKU and name are required');
        return;
      }
      await api.post('/finance/inventory/items', {
        ...inventoryItemForm,
        salesPrice: Number(inventoryItemForm.salesPrice || 0),
      });
      setInventoryItemForm({ sku: '', itemName: '', itemType: 'PRODUCT', valuationMethod: 'FIFO', salesPrice: '' });
      await loadFinanceEnterprise();
      setMessage('Inventory item created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create inventory item');
    }
  }

  async function addInventoryMovement() {
    try {
      if (!inventoryMoveForm.itemId || !inventoryMoveForm.qty) {
        setMessage('Item and quantity are required');
        return;
      }
      await api.post('/finance/inventory/movements', {
        itemId: Number(inventoryMoveForm.itemId),
        movementType: inventoryMoveForm.movementType,
        qty: Number(inventoryMoveForm.qty || 0),
        unitCost: Number(inventoryMoveForm.unitCost || 0),
      });
      setInventoryMoveForm({ itemId: '', movementType: 'PURCHASE', qty: '', unitCost: '' });
      await loadFinanceEnterprise();
      setMessage('Inventory movement posted');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to post inventory movement');
    }
  }

  async function createClassTag() {
    try {
      if (!classForm.className.trim()) {
        setMessage('Class name is required');
        return;
      }
      await api.post('/finance/dimensions/classes', classForm);
      setClassForm({ className: '', description: '' });
      await loadFinanceEnterprise();
      setMessage('Class created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create class');
    }
  }

  async function createLocationTag() {
    try {
      if (!locationForm.locationName.trim()) {
        setMessage('Location name is required');
        return;
      }
      await api.post('/finance/dimensions/locations', locationForm);
      setLocationForm({ locationName: '', description: '' });
      await loadFinanceEnterprise();
      setMessage('Location created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create location');
    }
  }

  async function createBudget() {
    try {
      if (!budgetForm.budgetName.trim()) {
        setMessage('Budget name is required');
        return;
      }
      await api.post('/finance/budgeting/budgets', {
        ...budgetForm,
        fiscalYear: Number(budgetForm.fiscalYear),
        classId: budgetForm.classId ? Number(budgetForm.classId) : null,
        locationId: budgetForm.locationId ? Number(budgetForm.locationId) : null,
        revenueTarget: Number(budgetForm.revenueTarget || 0),
        expenseTarget: Number(budgetForm.expenseTarget || 0),
      });
      setBudgetForm((p) => ({ ...p, budgetName: '', revenueTarget: '', expenseTarget: '' }));
      await loadFinanceEnterprise();
      setMessage('Budget created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create budget');
    }
  }

  async function createProject() {
    try {
      if (!projectForm.projectCode.trim() || !projectForm.projectName.trim()) {
        setMessage('Project code and name are required');
        return;
      }
      await api.post('/finance/projects', {
        ...projectForm,
        customerAccountId: projectForm.customerAccountId ? Number(projectForm.customerAccountId) : null,
        classId: projectForm.classId ? Number(projectForm.classId) : null,
        locationId: projectForm.locationId ? Number(projectForm.locationId) : null,
        budgetAmount: Number(projectForm.budgetAmount || 0),
      });
      setProjectForm({ projectCode: '', projectName: '', customerAccountId: '', classId: '', locationId: '', budgetAmount: '' });
      await loadFinanceEnterprise();
      setMessage('Project created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create project');
    }
  }

  async function addProjectEntry() {
    try {
      if (!projectEntryForm.projectId || !projectEntryForm.amount) {
        setMessage('Project and amount are required');
        return;
      }
      await api.post(`/finance/projects/${projectEntryForm.projectId}/entries`, {
        entryType: projectEntryForm.entryType,
        amount: Number(projectEntryForm.amount || 0),
        notes: projectEntryForm.notes,
      });
      setProjectEntryForm((p) => ({ ...p, amount: '', notes: '' }));
      await loadFinanceEnterprise();
      setMessage('Project entry logged');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to add project entry');
    }
  }

  async function createPayrollProfile() {
    try {
      if (!payrollProfileForm.employeeCode.trim() || !payrollProfileForm.fullName.trim()) {
        setMessage('Employee code and name are required');
        return;
      }
      await api.post('/finance/payroll/profiles', {
        ...payrollProfileForm,
        baseSalary: Number(payrollProfileForm.baseSalary || 0),
        taxPercent: Number(payrollProfileForm.taxPercent || 0),
      });
      setPayrollProfileForm({ employeeCode: '', fullName: '', salaryType: 'MONTHLY', baseSalary: '', taxPercent: '' });
      await loadFinanceEnterprise();
      setMessage('Payroll profile created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create payroll profile');
    }
  }

  async function createPayrollRun() {
    try {
      if (!payrollRunForm.runLabel.trim() || !payrollRunForm.periodStart || !payrollRunForm.periodEnd) {
        setMessage('Run label and period range are required');
        return;
      }
      await api.post('/finance/payroll/runs', payrollRunForm);
      setPayrollRunForm({ runLabel: '', periodStart: '', periodEnd: '' });
      await loadFinanceEnterprise();
      setMessage('Payroll run created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create payroll run');
    }
  }

  async function markPayrollRun(id, status) {
    try {
      await api.put(`/finance/payroll/runs/${id}/status`, { status });
      await loadFinanceEnterprise();
      setMessage(`Payroll run marked ${status}`);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update payroll run');
    }
  }

  async function createBankRule() {
    try {
      if (!bankRuleForm.ruleName.trim()) {
        setMessage('Rule name is required');
        return;
      }
      await api.post('/finance/automation/bank-rules', {
        ruleName: bankRuleForm.ruleName,
        condition: {
          referenceContains: bankRuleForm.referenceContains || undefined,
          memoContains: bankRuleForm.memoContains || undefined,
          amountLte: bankRuleForm.amountLte ? Number(bankRuleForm.amountLte) : undefined,
          amountGte: bankRuleForm.amountGte ? Number(bankRuleForm.amountGte) : undefined,
        },
        action: { action: bankRuleForm.action },
        priority: Number(bankRuleForm.priority || 100),
        active: Boolean(bankRuleForm.active),
      });
      setBankRuleForm({ ruleName: '', referenceContains: '', memoContains: '', amountLte: '', amountGte: '', action: 'MATCH_INVOICE', priority: 100, active: true });
      await loadFinanceControls();
      setMessage('Bank rule created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create bank rule');
    }
  }

  async function runBankRuleEngineNow() {
    try {
      await api.post('/finance/automation/bank-rules/run-engine');
      await Promise.all([loadFinanceControls(), loadAdvancedFinance()]);
      setMessage('Bank rule engine run completed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run bank rules');
    }
  }

  async function createReportPresetAutomation() {
    try {
      if (!reportPresetForm.presetName.trim()) {
        setMessage('Preset name is required');
        return;
      }
      await api.post('/finance/automation/reports/presets', {
        presetName: reportPresetForm.presetName,
        reportType: reportPresetForm.reportType,
        definition: JSON.parse(reportPresetForm.definition || '{}'),
      });
      setReportPresetForm({ presetName: '', reportType: 'FINANCIAL', definition: '{}' });
      await loadFinanceControls();
      setMessage('Report preset created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create report preset');
    }
  }

  async function createReportScheduleAutomation() {
    try {
      if (!reportScheduleForm.presetId || !reportScheduleForm.nextRunDate) {
        setMessage('Preset and next run date are required');
        return;
      }
      await api.post('/finance/automation/reports/schedules', {
        presetId: Number(reportScheduleForm.presetId),
        scheduleType: reportScheduleForm.scheduleType,
        nextRunDate: reportScheduleForm.nextRunDate,
        deliveryChannel: reportScheduleForm.deliveryChannel,
        active: Boolean(reportScheduleForm.active),
      });
      setReportScheduleForm({ presetId: '', scheduleType: 'MONTHLY', nextRunDate: '', deliveryChannel: 'IN_APP', active: true });
      await loadFinanceControls();
      setMessage('Report schedule created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create report schedule');
    }
  }

  async function exportReportNow() {
    try {
      await api.post('/finance/automation/reports/exports', {
        presetId: reportExportForm.presetId ? Number(reportExportForm.presetId) : null,
        exportFormat: reportExportForm.exportFormat,
        exportScope: JSON.parse(reportExportForm.exportScope || '{}'),
      });
      setReportExportForm((p) => ({ ...p, exportScope: '{}' }));
      await loadFinanceControls();
      setMessage('Report export logged');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to export report');
    }
  }

  async function receiveInventoryLotItem() {
    try {
      if (!lotReceiveForm.itemId || !lotReceiveForm.lotNumber.trim() || !lotReceiveForm.qtyReceived) {
        setMessage('Item, lot number and quantity are required');
        return;
      }
      await api.post('/finance/inventory/lots/receive', {
        itemId: Number(lotReceiveForm.itemId),
        lotNumber: lotReceiveForm.lotNumber,
        receivedDate: lotReceiveForm.receivedDate || null,
        qtyReceived: Number(lotReceiveForm.qtyReceived || 0),
        unitCost: Number(lotReceiveForm.unitCost || 0),
        expiryDate: lotReceiveForm.expiryDate || null,
      });
      setLotReceiveForm({ itemId: '', lotNumber: '', receivedDate: '', qtyReceived: '', unitCost: '', expiryDate: '' });
      await Promise.all([loadFinanceControls(), loadFinanceEnterprise()]);
      setMessage('Inventory lot received');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to receive inventory lot');
    }
  }

  async function issueInventoryLotCogs() {
    try {
      if (!lotIssueForm.itemId || !lotIssueForm.qty) {
        setMessage('Item and quantity are required');
        return;
      }
      await api.post('/finance/inventory/lots/issue', {
        itemId: Number(lotIssueForm.itemId),
        qty: Number(lotIssueForm.qty || 0),
        movementDate: lotIssueForm.movementDate || null,
        notes: lotIssueForm.notes || '',
      });
      setLotIssueForm({ itemId: '', qty: '', movementDate: '', notes: '' });
      await Promise.all([loadFinanceControls(), loadFinanceEnterprise()]);
      setMessage('Inventory issued with COGS');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to issue inventory with COGS');
    }
  }

  async function createPayrollTaxSetting() {
    try {
      if (!payrollTaxSettingForm.taxAuthority.trim()) {
        setMessage('Tax authority is required');
        return;
      }
      await api.post('/finance/payroll/compliance/tax-settings', {
        countryCode: payrollTaxSettingForm.countryCode,
        taxAuthority: payrollTaxSettingForm.taxAuthority,
        filingFrequency: payrollTaxSettingForm.filingFrequency,
        paymentAccountId: payrollTaxSettingForm.paymentAccountId ? Number(payrollTaxSettingForm.paymentAccountId) : null,
      });
      setPayrollTaxSettingForm({ countryCode: 'US', taxAuthority: '', filingFrequency: 'MONTHLY', paymentAccountId: '' });
      await loadFinanceControls();
      setMessage('Payroll tax setting created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create payroll tax setting');
    }
  }

  async function submitPayrollFiling() {
    try {
      if (!payrollFilingForm.periodLabel.trim() || !payrollFilingForm.taxAuthority.trim()) {
        setMessage('Period and tax authority are required');
        return;
      }
      await api.post('/finance/payroll/compliance/filings', {
        payrollRunId: payrollFilingForm.payrollRunId ? Number(payrollFilingForm.payrollRunId) : null,
        periodLabel: payrollFilingForm.periodLabel,
        taxAuthority: payrollFilingForm.taxAuthority,
        taxDue: Number(payrollFilingForm.taxDue || 0),
        referenceNo: payrollFilingForm.referenceNo || '',
        payload: JSON.parse(payrollFilingForm.payload || '{}'),
      });
      setPayrollFilingForm({ payrollRunId: '', periodLabel: '', taxAuthority: '', taxDue: '', referenceNo: '', payload: '{}' });
      await loadFinanceControls();
      setMessage('Payroll filing submitted');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to submit payroll filing');
    }
  }

  async function createAccountingApprovalPolicy() {
    try {
      await api.post('/finance/controls/accounting/policies', {
        entityType: approvalPolicyForm.entityType,
        thresholdAmount: Number(approvalPolicyForm.thresholdAmount || 0),
        approverRole: approvalPolicyForm.approverRole,
        active: Boolean(approvalPolicyForm.active),
      });
      setApprovalPolicyForm({ entityType: 'INVOICE', thresholdAmount: '', approverRole: 'FINANCE', active: true });
      await loadFinanceControls();
      setMessage('Approval policy created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create policy');
    }
  }

  async function requestAccountingApprovalFlow() {
    try {
      if (!approvalRequestForm.entityId) {
        setMessage('Entity ID is required');
        return;
      }
      await api.post('/finance/controls/accounting/approvals', {
        entityType: approvalRequestForm.entityType,
        entityId: Number(approvalRequestForm.entityId),
        thresholdAmount: Number(approvalRequestForm.thresholdAmount || 0),
      });
      setApprovalRequestForm((p) => ({ ...p, entityId: '', thresholdAmount: '' }));
      await loadFinanceControls();
      setMessage('Approval requested');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to request approval');
    }
  }

  async function decideAccountingApprovalFlow() {
    try {
      if (!approvalDecisionForm.approvalId) {
        setMessage('Approval id is required');
        return;
      }
      await api.put(`/finance/controls/accounting/approvals/${approvalDecisionForm.approvalId}/decision`, {
        status: approvalDecisionForm.status,
        decisionNote: approvalDecisionForm.decisionNote,
      });
      setApprovalDecisionForm({ approvalId: '', status: 'APPROVED', decisionNote: '' });
      await loadFinanceControls();
      setMessage('Approval decision recorded');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to decide approval');
    }
  }

  async function upsertCloseBooks() {
    try {
      if (!closeBookForm.periodMonth) {
        setMessage('Period month is required');
        return;
      }
      await api.post('/finance/quickbooks/close-books', {
        periodMonth: closeBookForm.periodMonth,
        checklist: JSON.parse(closeBookForm.checklistJson || '{}'),
      });
      await loadQuickbooksOps();
      setMessage('Close books period saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save close books period');
    }
  }

  async function closeBooksPeriodNow(id) {
    try {
      await api.put(`/finance/quickbooks/close-books/${id}/close`);
      await loadQuickbooksOps();
      setMessage('Period closed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to close period');
    }
  }

  async function reopenBooksPeriodNow(id) {
    try {
      await api.put(`/finance/quickbooks/close-books/${id}/reopen`);
      await loadQuickbooksOps();
      setMessage('Period reopened');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to reopen period');
    }
  }

  async function createFixedAssetRecord() {
    try {
      if (!fixedAssetForm.assetCode.trim() || !fixedAssetForm.assetName.trim()) {
        setMessage('Asset code and name are required');
        return;
      }
      await api.post('/finance/quickbooks/fixed-assets', {
        ...fixedAssetForm,
        cost: Number(fixedAssetForm.cost || 0),
        salvageValue: Number(fixedAssetForm.salvageValue || 0),
        usefulLifeMonths: Number(fixedAssetForm.usefulLifeMonths || 36),
      });
      setFixedAssetForm({ assetCode: '', assetName: '', category: '', purchaseDate: '', cost: '', salvageValue: '', usefulLifeMonths: 36, currencyCode: 'USD' });
      await loadQuickbooksOps();
      setMessage('Fixed asset created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create fixed asset');
    }
  }

  async function runDepreciationNow() {
    try {
      if (!depreciationForm.periodMonth) {
        setMessage('Depreciation period is required');
        return;
      }
      await api.post('/finance/quickbooks/fixed-assets/depreciation-run', {
        periodMonth: depreciationForm.periodMonth,
        assetId: depreciationForm.assetId ? Number(depreciationForm.assetId) : null,
      });
      await loadQuickbooksOps();
      setMessage('Depreciation run posted');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run depreciation');
    }
  }

  async function upsertFxRateRecord() {
    try {
      if (!fxRateForm.currencyCode || !fxRateForm.rateDate || !fxRateForm.rateToUsd) {
        setMessage('Currency, rate date and rate are required');
        return;
      }
      await api.post('/finance/quickbooks/fx/rates', {
        currencyCode: fxRateForm.currencyCode,
        rateDate: fxRateForm.rateDate,
        rateToUsd: Number(fxRateForm.rateToUsd || 0),
      });
      setFxRateForm((p) => ({ ...p, rateToUsd: '' }));
      await loadQuickbooksOps();
      setMessage('FX rate saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save FX rate');
    }
  }

  async function runFxRevaluationNow() {
    try {
      if (!fxRevalForm.periodEndDate || !fxRevalForm.currencyCode) {
        setMessage('Revaluation date and currency are required');
        return;
      }
      await api.post('/finance/quickbooks/fx/revalue', fxRevalForm);
      await loadQuickbooksOps();
      setMessage('FX revaluation posted');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run FX revaluation');
    }
  }

  async function runArCollectionsNow() {
    try {
      await api.post('/finance/quickbooks/collections/run', {
        minOverdueDays: Number(collectionForm.minOverdueDays || 1),
      });
      await loadQuickbooksOps();
      setMessage('Collections run generated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run collections');
    }
  }

  async function createBankFeedConnectorNow() {
    try {
      if (!bankFeedConnectorForm.connectorName.trim()) {
        setMessage('Connector name is required');
        return;
      }
      await api.post('/finance/quickbooks/bank-feeds/connectors', bankFeedConnectorForm);
      setBankFeedConnectorForm({ connectorName: '', provider: 'MANUAL' });
      await loadQuickbooksOps();
      setMessage('Bank feed connector created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create bank feed connector');
    }
  }

  async function runBankFeedImportNow() {
    try {
      if (!bankFeedImportForm.connectorId) {
        setMessage('Connector is required for import');
        return;
      }
      await api.post('/finance/quickbooks/bank-feeds/import', {
        connectorId: Number(bankFeedImportForm.connectorId),
        entries: JSON.parse(bankFeedImportForm.entriesJson || '[]'),
      });
      await loadQuickbooksOps();
      setMessage('Bank feed import completed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to import bank feed entries');
    }
  }

  async function upsertTaxJurisdictionNow() {
    try {
      if (!taxJurisdictionForm.jurisdictionCode || !taxJurisdictionForm.regionName) {
        setMessage('Jurisdiction code and region name are required');
        return;
      }
      await api.post('/finance/quickbooks/tax-center/jurisdictions', {
        ...taxJurisdictionForm,
        taxRatePercent: Number(taxJurisdictionForm.taxRatePercent || 0),
      });
      setTaxJurisdictionForm({ jurisdictionCode: '', countryCode: 'US', regionName: '', taxRatePercent: '' });
      await loadQuickbooksOps();
      setMessage('Tax jurisdiction saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save tax jurisdiction');
    }
  }

  async function upsertTaxNexusNow() {
    try {
      if (!taxNexusForm.jurisdictionId || !taxNexusForm.outletName.trim()) {
        setMessage('Jurisdiction and outlet are required');
        return;
      }
      await api.post('/finance/quickbooks/tax-center/nexus', {
        jurisdictionId: Number(taxNexusForm.jurisdictionId),
        outletName: taxNexusForm.outletName,
      });
      setTaxNexusForm({ jurisdictionId: '', outletName: '' });
      await loadQuickbooksOps();
      setMessage('Tax nexus saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save tax nexus');
    }
  }

  async function previewTaxNow() {
    try {
      const { data } = await api.post('/finance/quickbooks/tax-center/preview', {
        outletName: taxPreviewForm.outletName,
        jurisdictionCode: taxPreviewForm.jurisdictionCode,
        amount: Number(taxPreviewForm.amount || 0),
      });
      setTaxPreviewResult(data || null);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to preview tax');
    }
  }

  async function createPayrollScheduleNow() {
    try {
      if (!payrollScheduleForm.scheduleName || !payrollScheduleForm.nextPayDate) {
        setMessage('Schedule name and next pay date are required');
        return;
      }
      await api.post('/finance/quickbooks/payroll-plus/schedules', payrollScheduleForm);
      setPayrollScheduleForm({ scheduleName: '', frequency: 'MONTHLY', nextPayDate: '' });
      await loadQuickbooksOps();
      setMessage('Payroll schedule created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create payroll schedule');
    }
  }

  async function createPayrollComponentNow() {
    try {
      if (!payrollComponentForm.componentName) {
        setMessage('Component name is required');
        return;
      }
      await api.post('/finance/quickbooks/payroll-plus/components', {
        ...payrollComponentForm,
        defaultValue: Number(payrollComponentForm.defaultValue || 0),
      });
      setPayrollComponentForm({ componentName: '', componentType: 'EARNING', calcType: 'PERCENT', defaultValue: '' });
      await loadQuickbooksOps();
      setMessage('Payroll component created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create payroll component');
    }
  }

  async function createDisputeNow() {
    try {
      if (!disputeForm.invoiceId || !disputeForm.disputeReason.trim()) {
        setMessage('Invoice and dispute reason are required');
        return;
      }
      await api.post('/finance/quickbooks/ar-ap-ops/disputes', {
        invoiceId: Number(disputeForm.invoiceId),
        disputeReason: disputeForm.disputeReason,
      });
      setDisputeForm({ invoiceId: '', disputeReason: '' });
      await loadQuickbooksOps();
      setMessage('AR dispute created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create AR dispute');
    }
  }

  async function createCreditMemoNow() {
    try {
      if (!creditMemoForm.accountId || !creditMemoForm.amount) {
        setMessage('Account and amount are required');
        return;
      }
      await api.post('/finance/quickbooks/ar-ap-ops/credit-memos', {
        invoiceId: creditMemoForm.invoiceId ? Number(creditMemoForm.invoiceId) : null,
        accountId: Number(creditMemoForm.accountId),
        amount: Number(creditMemoForm.amount),
        reason: creditMemoForm.reason,
      });
      setCreditMemoForm({ invoiceId: '', accountId: '', amount: '', reason: '' });
      await loadQuickbooksOps();
      setMessage('Credit memo created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create credit memo');
    }
  }

  async function createRefundNow() {
    try {
      if (!refundForm.creditMemoId || !refundForm.amount) {
        setMessage('Credit memo and amount are required');
        return;
      }
      await api.post('/finance/quickbooks/ar-ap-ops/refunds', {
        creditMemoId: Number(refundForm.creditMemoId),
        amount: Number(refundForm.amount),
        refundDate: refundForm.refundDate || null,
        paymentAccountId: refundForm.paymentAccountId ? Number(refundForm.paymentAccountId) : null,
        referenceNo: refundForm.referenceNo || '',
      });
      setRefundForm({ creditMemoId: '', amount: '', refundDate: '', paymentAccountId: '', referenceNo: '' });
      await loadQuickbooksOps();
      setMessage('Refund created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create refund');
    }
  }

  async function createMcEntryNow() {
    try {
      if (!mcForm.amountForeign || !mcForm.fxRateToUsd) {
        setMessage('Amount and FX rate are required');
        return;
      }
      await api.post('/finance/quickbooks/phase2/multi-currency', {
        ...mcForm,
        sourceId: mcForm.sourceId ? Number(mcForm.sourceId) : null,
        amountForeign: Number(mcForm.amountForeign || 0),
        fxRateToUsd: Number(mcForm.fxRateToUsd || 0),
        entryDate: mcForm.entryDate || null,
      });
      setMcForm((p) => ({ ...p, sourceId: '', amountForeign: '', fxRateToUsd: '' }));
      await loadQuickbooksOps();
      setMessage('Multi-currency entry posted');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to post multi-currency entry');
    }
  }

  async function runFxSettlementNow() {
    try {
      await api.post('/finance/quickbooks/phase2/fx-settlement', {
        ...fxSettlementForm,
        amountForeign: Number(fxSettlementForm.amountForeign || 0),
        bookedRate: Number(fxSettlementForm.bookedRate || 0),
        settlementRate: Number(fxSettlementForm.settlementRate || 0),
      });
      setFxSettlementForm({ currencyCode: 'USD', settlementDate: '', amountForeign: '', bookedRate: '', settlementRate: '' });
      await loadQuickbooksOps();
      setMessage('FX settlement run created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run FX settlement');
    }
  }

  async function createAssetEventNow() {
    try {
      if (!assetEventForm.assetId || !assetEventForm.eventType) {
        setMessage('Asset and event type are required');
        return;
      }
      await api.post('/finance/quickbooks/phase2/fixed-asset-events', {
        ...assetEventForm,
        assetId: Number(assetEventForm.assetId),
        eventDate: assetEventForm.eventDate || null,
        amount: Number(assetEventForm.amount || 0),
      });
      setAssetEventForm({ assetId: '', eventType: 'IMPAIRMENT', eventDate: '', amount: '', note: '' });
      await Promise.all([loadQuickbooksOps(), loadFinanceControls()]);
      setMessage('Fixed asset event posted');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to post fixed asset event');
    }
  }

  async function createMonthEndWorkspaceNow() {
    try {
      if (!monthEndWorkspaceForm.periodMonth) {
        setMessage('Period month is required');
        return;
      }
      await api.post('/finance/quickbooks/phase2/month-end/workspaces', {
        ...monthEndWorkspaceForm,
        ownerId: monthEndWorkspaceForm.ownerId ? Number(monthEndWorkspaceForm.ownerId) : null,
      });
      setMonthEndWorkspaceForm({ periodMonth: '', ownerId: '', notes: '' });
      await loadQuickbooksOps();
      setMessage('Month-end workspace saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save month-end workspace');
    }
  }

  async function createMonthEndTaskNow() {
    try {
      if (!monthEndTaskForm.workspaceId || !monthEndTaskForm.taskName.trim()) {
        setMessage('Workspace and task name are required');
        return;
      }
      await api.post('/finance/quickbooks/phase2/month-end/tasks', {
        ...monthEndTaskForm,
        workspaceId: Number(monthEndTaskForm.workspaceId),
        assignedTo: monthEndTaskForm.assignedTo ? Number(monthEndTaskForm.assignedTo) : null,
        dueDate: monthEndTaskForm.dueDate || null,
      });
      setMonthEndTaskForm({ workspaceId: '', taskName: '', assignedTo: '', dueDate: '' });
      await loadQuickbooksOps();
      setMessage('Month-end task created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create month-end task');
    }
  }

  async function markMonthEndTask(taskId, status) {
    try {
      await api.put(`/finance/quickbooks/phase2/month-end/tasks/${taskId}/status`, { status });
      await loadQuickbooksOps();
      setMessage(`Task marked ${status}`);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update task');
    }
  }

  async function createAdjustingEntryNow() {
    try {
      if (!adjustingForm.workspaceId || !adjustingForm.description.trim() || !adjustingForm.amount) {
        setMessage('Workspace, description and amount are required');
        return;
      }
      await api.post('/finance/quickbooks/phase2/month-end/adjusting-entries', {
        ...adjustingForm,
        workspaceId: Number(adjustingForm.workspaceId),
        debitAccountId: adjustingForm.debitAccountId ? Number(adjustingForm.debitAccountId) : null,
        creditAccountId: adjustingForm.creditAccountId ? Number(adjustingForm.creditAccountId) : null,
        amount: Number(adjustingForm.amount || 0),
        entryDate: adjustingForm.entryDate || null,
      });
      setAdjustingForm({ workspaceId: '', entryDate: '', description: '', debitAccountId: '', creditAccountId: '', amount: '' });
      await loadQuickbooksOps();
      setMessage('Adjusting entry created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create adjusting entry');
    }
  }

  async function decideAdjustingEntryNow() {
    try {
      if (!adjustingDecisionForm.entryId) {
        setMessage('Adjusting entry id is required');
        return;
      }
      await api.put(`/finance/quickbooks/phase2/month-end/adjusting-entries/${adjustingDecisionForm.entryId}/decision`, {
        status: adjustingDecisionForm.status,
      });
      setAdjustingDecisionForm({ entryId: '', status: 'APPROVED' });
      await loadQuickbooksOps();
      setMessage('Adjusting entry decision submitted');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to decide adjusting entry');
    }
  }

  async function createFilingCalendarNow() {
    try {
      if (!filingCalForm.authority || !filingCalForm.periodLabel || !filingCalForm.dueDate) {
        setMessage('Authority, period and due date are required');
        return;
      }
      await api.post('/finance/quickbooks/phase2/filings', {
        ...filingCalForm,
        amountDue: Number(filingCalForm.amountDue || 0),
      });
      setFilingCalForm({ filingType: 'SALES_TAX', authority: '', periodLabel: '', dueDate: '', amountDue: '' });
      await loadQuickbooksOps();
      setMessage('Filing calendar item created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create filing item');
    }
  }

  async function markFilingStatus(id, status) {
    try {
      await api.put(`/finance/quickbooks/phase2/filings/${id}/status`, { status });
      await loadQuickbooksOps();
      setMessage(`Filing marked ${status}`);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update filing status');
    }
  }

  async function createOpsJobNow() {
    try {
      if (!opsJobForm.jobType) {
        setMessage('Job type is required');
        return;
      }
      await api.post('/finance/quickbooks/phase2/maturity/jobs', {
        jobType: opsJobForm.jobType,
        payload: JSON.parse(opsJobForm.payloadJson || '{}'),
      });
      setOpsJobForm((p) => ({ ...p, payloadJson: '{}' }));
      await loadQuickbooksOps();
      setMessage('Ops job queued');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to queue ops job');
    }
  }

  async function runOpsJobNow(id) {
    try {
      await api.post(`/finance/quickbooks/phase2/maturity/jobs/${id}/run`);
      await loadQuickbooksOps();
      setMessage('Ops job executed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run ops job');
    }
  }

  async function queueRetryNow() {
    try {
      if (!retryForm.importRunId) {
        setMessage('Import run id is required');
        return;
      }
      await api.post('/finance/quickbooks/phase2/maturity/bank-feed-retries', {
        importRunId: Number(retryForm.importRunId),
        reason: retryForm.reason,
      });
      setRetryForm({ importRunId: '', reason: '' });
      await loadQuickbooksOps();
      setMessage('Retry queued');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to queue retry');
    }
  }

  async function runRetryNow(id) {
    try {
      await api.post(`/finance/quickbooks/phase2/maturity/bank-feed-retries/${id}/run`);
      await loadQuickbooksOps();
      setMessage('Retry processed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to process retry');
    }
  }

  async function createTaxReturnNow() {
    try {
      if (!taxReturnForm.authority || !taxReturnForm.periodStart || !taxReturnForm.periodEnd) {
        setMessage('Authority and period are required');
        return;
      }
      await api.post('/finance/quickbooks/phase2/maturity/tax-returns', taxReturnForm);
      setTaxReturnForm({ filingType: 'SALES_TAX', authority: '', periodStart: '', periodEnd: '' });
      await loadQuickbooksOps();
      setMessage('Tax return generated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to generate tax return');
    }
  }

  async function updateTaxReturnNow() {
    try {
      if (!taxReturnDecisionForm.taxReturnId) {
        setMessage('Tax return id is required');
        return;
      }
      await api.put(`/finance/quickbooks/phase2/maturity/tax-returns/${taxReturnDecisionForm.taxReturnId}/status`, {
        status: taxReturnDecisionForm.status,
      });
      await loadQuickbooksOps();
      setMessage('Tax return status updated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update tax return');
    }
  }

  async function createPayrollBatchNow() {
    try {
      if (!payrollBatchForm.periodLabel || !payrollBatchForm.filingAuthority) {
        setMessage('Period label and filing authority are required');
        return;
      }
      await api.post('/finance/quickbooks/phase2/maturity/payroll-batches', payrollBatchForm);
      setPayrollBatchForm({ periodLabel: '', filingAuthority: '' });
      await loadQuickbooksOps();
      setMessage('Payroll filing batch prepared');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to prepare payroll batch');
    }
  }

  async function createPaymentIntentNow() {
    try {
      if (!paymentIntentForm.entityId || !paymentIntentForm.intendedAmount) {
        setMessage('Entity and amount are required');
        return;
      }
      await api.post('/finance/quickbooks/phase2/maturity/payment-intents', {
        ...paymentIntentForm,
        entityId: Number(paymentIntentForm.entityId),
        intendedAmount: Number(paymentIntentForm.intendedAmount),
        paymentDate: paymentIntentForm.paymentDate || null,
      });
      setPaymentIntentForm({ entityType: 'INVOICE', entityId: '', intendedAmount: '', paymentDate: '', currencyCode: 'USD' });
      await loadQuickbooksOps();
      setMessage('Payment intent created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create payment intent');
    }
  }

  async function applyPaymentIntentNow() {
    try {
      if (!paymentApplyForm.intentId) {
        setMessage('Payment intent id is required');
        return;
      }
      await api.post(`/finance/quickbooks/phase2/maturity/payment-intents/${paymentApplyForm.intentId}/apply`);
      setPaymentApplyForm({ intentId: '' });
      await Promise.all([loadQuickbooksOps(), loadAdvancedFinance()]);
      setMessage('Payment intent auto-applied');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to auto-apply payment');
    }
  }

  async function createDunningCampaignNow() {
    try {
      if (!dunningCampaignForm.campaignName) {
        setMessage('Campaign name is required');
        return;
      }
      await api.post('/finance/quickbooks/phase2/maturity/dunning-campaigns', {
        ...dunningCampaignForm,
        minOverdueDays: Number(dunningCampaignForm.minOverdueDays || 7),
      });
      setDunningCampaignForm({ campaignName: '', minOverdueDays: 7, reminderChannel: 'EMAIL' });
      await loadQuickbooksOps();
      setMessage('Dunning campaign saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save dunning campaign');
    }
  }

  async function runDunningCampaignNow() {
    try {
      if (!dunningRunForm.campaignId) {
        setMessage('Campaign is required');
        return;
      }
      await api.post(`/finance/quickbooks/phase2/maturity/dunning-campaigns/${dunningRunForm.campaignId}/run`);
      await loadQuickbooksOps();
      setMessage('Dunning campaign run completed');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run dunning campaign');
    }
  }

  async function createFinalBankConnectionNow() {
    try {
      if (!finalBankConnectionForm.providerName || !finalBankConnectionForm.connectorLabel) {
        setMessage('Provider and connector label are required');
        return;
      }
      await api.post('/finance/quickbooks/final/bank-connections', finalBankConnectionForm);
      setFinalBankConnectionForm({ providerName: '', connectorLabel: '', authMode: 'OAUTH2' });
      await loadQuickbooksOps();
      setMessage('Bank provider connection created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create bank provider connection');
    }
  }

  async function runFinalBankSyncNow() {
    try {
      if (!finalBankSyncForm.connectionId) {
        setMessage('Connection is required');
        return;
      }
      await api.post(`/finance/quickbooks/final/bank-connections/${finalBankSyncForm.connectionId}/sync`, {
        importedCount: Number(finalBankSyncForm.importedCount || 0),
        failedCount: Number(finalBankSyncForm.failedCount || 0),
        webhookEventRef: finalBankSyncForm.webhookEventRef || '',
      });
      setFinalBankSyncForm({ connectionId: '', importedCount: '', failedCount: '', webhookEventRef: '' });
      await loadQuickbooksOps();
      setMessage('Bank provider sync run logged');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run provider sync');
    }
  }

  async function createFinalGatewayNow() {
    try {
      if (!finalGatewayForm.gatewayName || !finalGatewayForm.provider) {
        setMessage('Gateway name and provider are required');
        return;
      }
      await api.post('/finance/quickbooks/final/payment-gateways', finalGatewayForm);
      setFinalGatewayForm({ gatewayName: '', provider: '' });
      await loadQuickbooksOps();
      setMessage('Payment gateway saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save gateway');
    }
  }

  async function createFinalPaymentLinkNow() {
    try {
      if (!finalPaymentLinkForm.entityId || !finalPaymentLinkForm.amount) {
        setMessage('Entity and amount are required');
        return;
      }
      await api.post('/finance/quickbooks/final/payment-links', {
        ...finalPaymentLinkForm,
        entityId: Number(finalPaymentLinkForm.entityId),
        gatewayId: finalPaymentLinkForm.gatewayId ? Number(finalPaymentLinkForm.gatewayId) : null,
        amount: Number(finalPaymentLinkForm.amount),
        expiresAt: finalPaymentLinkForm.expiresAt || null,
      });
      setFinalPaymentLinkForm({ entityType: 'INVOICE', entityId: '', gatewayId: '', amount: '', currencyCode: 'USD', expiresAt: '' });
      await loadQuickbooksOps();
      setMessage('Payment link created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create payment link');
    }
  }

  async function captureFinalPaymentNow() {
    try {
      if (!finalCaptureForm.paymentLinkId) {
        setMessage('Payment link id is required');
        return;
      }
      await api.post(`/finance/quickbooks/final/payment-links/${finalCaptureForm.paymentLinkId}/capture`);
      setFinalCaptureForm({ paymentLinkId: '' });
      await Promise.all([loadQuickbooksOps(), loadAdvancedFinance()]);
      setMessage('Payment captured');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to capture payment');
    }
  }

  async function createFinalChargebackNow() {
    try {
      if (!finalChargebackForm.paymentTransactionId || !finalChargebackForm.amount) {
        setMessage('Transaction and amount are required');
        return;
      }
      await api.post('/finance/quickbooks/final/chargebacks', {
        paymentTransactionId: Number(finalChargebackForm.paymentTransactionId),
        amount: Number(finalChargebackForm.amount),
        reason: finalChargebackForm.reason || '',
      });
      setFinalChargebackForm({ paymentTransactionId: '', amount: '', reason: '' });
      await loadQuickbooksOps();
      setMessage('Chargeback created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create chargeback');
    }
  }

  async function createFinalDocTemplateNow() {
    try {
      if (!finalDocTemplateForm.templateName || !finalDocTemplateForm.bodyTemplate) {
        setMessage('Template name and body are required');
        return;
      }
      await api.post('/finance/quickbooks/final/document-templates', finalDocTemplateForm);
      setFinalDocTemplateForm({ templateName: '', documentType: 'INVOICE', subjectTemplate: '', bodyTemplate: '' });
      await loadQuickbooksOps();
      setMessage('Document template saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save template');
    }
  }

  async function dispatchFinalDocNow() {
    try {
      if (!finalDocDispatchForm.entityType || !finalDocDispatchForm.recipient) {
        setMessage('Entity type and recipient are required');
        return;
      }
      await api.post('/finance/quickbooks/final/document-dispatch', {
        ...finalDocDispatchForm,
        templateId: finalDocDispatchForm.templateId ? Number(finalDocDispatchForm.templateId) : null,
        entityId: finalDocDispatchForm.entityId ? Number(finalDocDispatchForm.entityId) : null,
        metadata: JSON.parse(finalDocDispatchForm.metadataJson || '{}'),
      });
      setFinalDocDispatchForm((p) => ({ ...p, metadataJson: '{}' }));
      await loadQuickbooksOps();
      setMessage('Document dispatch logged');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to dispatch document');
    }
  }

  async function createFinalPracticeClientNow() {
    try {
      if (!finalPracticeClientForm.clientName) {
        setMessage('Practice client name is required');
        return;
      }
      await api.post('/finance/quickbooks/final/practice-clients', finalPracticeClientForm);
      setFinalPracticeClientForm({ clientName: '', legalEntity: '' });
      await loadQuickbooksOps();
      setMessage('Practice client created');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create practice client');
    }
  }

  async function grantFinalPracticeAccessNow() {
    try {
      if (!finalPracticeAccessForm.clientId || !finalPracticeAccessForm.userId) {
        setMessage('Client and user are required');
        return;
      }
      await api.post('/finance/quickbooks/final/practice-access', {
        ...finalPracticeAccessForm,
        clientId: Number(finalPracticeAccessForm.clientId),
        userId: Number(finalPracticeAccessForm.userId),
      });
      setFinalPracticeAccessForm({ clientId: '', userId: '', roleLabel: 'ACCOUNTANT' });
      await loadQuickbooksOps();
      setMessage('Practice access granted');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to grant practice access');
    }
  }

  async function requestFinalPeriodExceptionNow() {
    try {
      if (!finalPeriodExceptionForm.periodMonth || !finalPeriodExceptionForm.reason) {
        setMessage('Period and reason are required');
        return;
      }
      await api.post('/finance/quickbooks/final/period-exceptions', finalPeriodExceptionForm);
      setFinalPeriodExceptionForm({ periodMonth: '', exceptionType: 'POST_CLOSE_JOURNAL', reason: '' });
      await loadQuickbooksOps();
      setMessage('Period exception requested');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to request period exception');
    }
  }

  async function decideFinalPeriodExceptionNow() {
    try {
      if (!finalPeriodDecisionForm.exceptionId) {
        setMessage('Exception id is required');
        return;
      }
      await api.put(`/finance/quickbooks/final/period-exceptions/${finalPeriodDecisionForm.exceptionId}/decision`, {
        status: finalPeriodDecisionForm.status,
      });
      setFinalPeriodDecisionForm({ exceptionId: '', status: 'APPROVED' });
      await loadQuickbooksOps();
      setMessage('Period exception decided');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to decide period exception');
    }
  }

  async function createFinalTaxRuleNow() {
    try {
      if (!finalTaxRuleForm.ruleName) {
        setMessage('Tax rule name is required');
        return;
      }
      await api.post('/finance/quickbooks/final/tax-rules', {
        ruleName: finalTaxRuleForm.ruleName,
        jurisdictionCode: finalTaxRuleForm.jurisdictionCode,
        rule: JSON.parse(finalTaxRuleForm.ruleJson || '{}'),
      });
      setFinalTaxRuleForm({ ruleName: '', jurisdictionCode: '', ruleJson: '{}' });
      await loadQuickbooksOps();
      setMessage('Tax rule set saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save tax rule');
    }
  }

  async function createFinalPayrollRuleNow() {
    try {
      if (!finalPayrollRuleForm.ruleName) {
        setMessage('Payroll rule name is required');
        return;
      }
      await api.post('/finance/quickbooks/final/payroll-rules', {
        ruleName: finalPayrollRuleForm.ruleName,
        countryCode: finalPayrollRuleForm.countryCode,
        rule: JSON.parse(finalPayrollRuleForm.ruleJson || '{}'),
      });
      setFinalPayrollRuleForm({ ruleName: '', countryCode: 'US', ruleJson: '{}' });
      await loadQuickbooksOps();
      setMessage('Payroll rule set saved');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save payroll rule');
    }
  }

  return (
    <section className="module-page">
      <div className="module-hero">
        <div>
          <p className="module-kicker">Financial Operations</p>
          <h2>Finance Module</h2>
          <p className="module-subtitle">Cash, controls, reporting, and accounting workflows in one shared workspace shell.</p>
        </div>
      </div>
      <div className="card toolbar-row finance-toolbar module-toolbar-card">
        {canAdvancedFinance && (
          <button type="button" className={activeTab === 'dashboard' ? '' : 'button-secondary'} onClick={() => setActiveTab('dashboard')}>Dashboard</button>
        )}
        <button type="button" className={activeTab === 'ledger' ? '' : 'button-secondary'} onClick={() => setActiveTab('ledger')}>Ledger</button>
        {['FINANCE', 'SUPER_USER'].includes(user?.role) && (
          <button type="button" className={activeTab === 'settings' ? '' : 'button-secondary'} onClick={() => setActiveTab('settings')}>Settings</button>
        )}
        {canAdvancedFinance && (
          <>
            <button type="button" className={activeTab === 'sales' ? '' : 'button-secondary'} onClick={() => setActiveTab('sales')}>Sales</button>
            <button type="button" className={activeTab === 'expenses' ? '' : 'button-secondary'} onClick={() => setActiveTab('expenses')}>Expenses</button>
            <button type="button" className={activeTab === 'banking' ? '' : 'button-secondary'} onClick={() => setActiveTab('banking')}>Banking</button>
            <button type="button" className={activeTab === 'tax' ? '' : 'button-secondary'} onClick={() => setActiveTab('tax')}>Tax</button>
            <button type="button" className={activeTab === 'coa' ? '' : 'button-secondary'} onClick={() => setActiveTab('coa')}>Chart of Accounts</button>
            <button type="button" className={activeTab === 'reports' ? '' : 'button-secondary'} onClick={() => setActiveTab('reports')}>Reports</button>
            <button type="button" className={activeTab === 'recurring' ? '' : 'button-secondary'} onClick={() => setActiveTab('recurring')}>Recurring</button>
            <button type="button" className={activeTab === 'purchasing' ? '' : 'button-secondary'} onClick={() => setActiveTab('purchasing')}>Purchasing</button>
            <button type="button" className={activeTab === 'inventory' ? '' : 'button-secondary'} onClick={() => setActiveTab('inventory')}>Inventory</button>
            <button type="button" className={activeTab === 'budgeting' ? '' : 'button-secondary'} onClick={() => setActiveTab('budgeting')}>Budgeting</button>
            <button type="button" className={activeTab === 'projects' ? '' : 'button-secondary'} onClick={() => setActiveTab('projects')}>Projects</button>
            <button type="button" className={activeTab === 'payroll' ? '' : 'button-secondary'} onClick={() => setActiveTab('payroll')}>Payroll</button>
            <button type="button" className={activeTab === 'automation' ? '' : 'button-secondary'} onClick={() => setActiveTab('automation')}>Automation</button>
            <button type="button" className={activeTab === 'compliance' ? '' : 'button-secondary'} onClick={() => setActiveTab('compliance')}>Compliance</button>
            <button type="button" className={activeTab === 'controls' ? '' : 'button-secondary'} onClick={() => setActiveTab('controls')}>Controls</button>
            <button type="button" className={activeTab === 'close_books' ? '' : 'button-secondary'} onClick={() => setActiveTab('close_books')}>Close Books</button>
            <button type="button" className={activeTab === 'assets_fx' ? '' : 'button-secondary'} onClick={() => setActiveTab('assets_fx')}>Assets & FX</button>
            <button type="button" className={activeTab === 'collections' ? '' : 'button-secondary'} onClick={() => setActiveTab('collections')}>Collections</button>
            <button type="button" className={activeTab === 'phase2_ops' ? '' : 'button-secondary'} onClick={() => setActiveTab('phase2_ops')}>Phase2 Ops</button>
            <button type="button" className={activeTab === 'final_100' ? '' : 'button-secondary'} onClick={() => setActiveTab('final_100')}>Final 100</button>
          </>
        )}
        <button
          type="button"
          className="button-secondary"
          onClick={() => window.open(`${window.location.origin}?page=trial-balance`, '_blank', 'noopener,noreferrer')}
        >
          Trial Balance
        </button>
      </div>
      {activeTab === 'dashboard' && canAdvancedFinance && (
        <div className="summary-grid">
          <article className="card"><h4>Total Invoiced</h4><p className="metric">{money(overview.kpis?.totalInvoiced)}</p></article>
          <article className="card"><h4>Open Invoices</h4><p className="metric">{money(overview.kpis?.openInvoices)}</p></article>
          <article className="card"><h4>Total Billed</h4><p className="metric">{money(overview.kpis?.totalBilled)}</p></article>
          <article className="card"><h4>Open Bills</h4><p className="metric">{money(overview.kpis?.openBills)}</p></article>
          <article className="card"><h4>A/R Balance</h4><p className="metric">{money(overview.kpis?.arBalance)}</p></article>
          <article className="card"><h4>A/P Balance</h4><p className="metric">{money(overview.kpis?.apBalance)}</p></article>
          <article className="card"><h4>Open Reconciliations</h4><p className="metric">{Number(overview.kpis?.openReconciliations || 0)}</p></article>
          <article className="card"><h4>Closed Reconciliations</h4><p className="metric">{Number(overview.kpis?.closedReconciliations || 0)}</p></article>
        </div>
      )}
      {activeTab === 'sales' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Create Invoice</h3>
            <div className="grid two">
              <label>Customer<select value={invoiceForm.accountId} onChange={(e) => setInvoiceForm((p) => ({ ...p, accountId: e.target.value }))}><option value="">Select customer</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.customer_name}</option>)}</select></label>
              <label>Issue Date<input type="date" value={invoiceForm.issueDate} onChange={(e) => setInvoiceForm((p) => ({ ...p, issueDate: e.target.value }))} /></label>
              <label>Due Date<input type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm((p) => ({ ...p, dueDate: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createInvoice}>Create Invoice</button></div>
            <hr />
            <h4>Add Invoice Line</h4>
            <div className="grid two">
              <label>Invoice<select value={invoiceLineForm.invoiceId} onChange={(e) => setInvoiceLineForm((p) => ({ ...p, invoiceId: e.target.value }))}><option value="">Select invoice</option>{invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number}</option>)}</select></label>
              <label>Description<input value={invoiceLineForm.description} onChange={(e) => setInvoiceLineForm((p) => ({ ...p, description: e.target.value }))} /></label>
              <label>Qty<input type="number" min="1" value={invoiceLineForm.qty} onChange={(e) => setInvoiceLineForm((p) => ({ ...p, qty: e.target.value }))} /></label>
              <label>Unit Price<input type="number" min="0" step="0.01" value={invoiceLineForm.unitPrice} onChange={(e) => setInvoiceLineForm((p) => ({ ...p, unitPrice: e.target.value }))} /></label>
              <label>Tax<select value={invoiceLineForm.taxRateId} onChange={(e) => setInvoiceLineForm((p) => ({ ...p, taxRateId: e.target.value }))}><option value="">None</option>{taxRates.map((t) => <option key={t.id} value={t.id}>{t.tax_name}</option>)}</select></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={addInvoiceLine}>Add Line</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Invoices</h3>
            <table>
              <thead><tr><th>#</th><th>Customer</th><th>Status</th><th>Total</th><th>Action</th></tr></thead>
              <tbody>
                {invoices.length === 0 ? <tr><td colSpan={5}>No invoices.</td></tr> : invoices.map((i) => (
                  <tr key={i.id}>
                    <td>{i.invoice_number}</td>
                    <td>{i.customer_name || i.customer_number}</td>
                    <td>{i.status}</td>
                    <td>{money(i.total)}</td>
                    <td className="actions-cell">
                      <button type="button" className="button-secondary" onClick={() => markInvoiceStatus(i.id, 'SENT')}>Send</button>
                      <button type="button" onClick={() => markInvoiceStatus(i.id, 'PAID')}>Paid</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
      {activeTab === 'expenses' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Create Vendor + Bill</h3>
            <div className="grid two">
              <label>Vendor Name<input value={vendorForm.vendorName} onChange={(e) => setVendorForm((p) => ({ ...p, vendorName: e.target.value }))} /></label>
              <label>Email<input value={vendorForm.email} onChange={(e) => setVendorForm((p) => ({ ...p, email: e.target.value }))} /></label>
              <label>Phone<input value={vendorForm.phone} onChange={(e) => setVendorForm((p) => ({ ...p, phone: e.target.value }))} /></label>
              <label>Tax Number<input value={vendorForm.taxNumber} onChange={(e) => setVendorForm((p) => ({ ...p, taxNumber: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createVendor}>Create Vendor</button></div>
            <hr />
            <div className="grid two">
              <label>Vendor<select value={billForm.vendorId} onChange={(e) => setBillForm((p) => ({ ...p, vendorId: e.target.value }))}><option value="">Select vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}</select></label>
              <label>Bill Date<input type="date" value={billForm.billDate} onChange={(e) => setBillForm((p) => ({ ...p, billDate: e.target.value }))} /></label>
              <label>Due Date<input type="date" value={billForm.dueDate} onChange={(e) => setBillForm((p) => ({ ...p, dueDate: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createBill}>Create Bill</button></div>
            <hr />
            <h4>Add Bill Line</h4>
            <div className="grid two">
              <label>Bill<select value={billLineForm.billId} onChange={(e) => setBillLineForm((p) => ({ ...p, billId: e.target.value }))}><option value="">Select bill</option>{bills.map((b) => <option key={b.id} value={b.id}>{b.bill_number}</option>)}</select></label>
              <label>Description<input value={billLineForm.description} onChange={(e) => setBillLineForm((p) => ({ ...p, description: e.target.value }))} /></label>
              <label>Qty<input type="number" min="1" value={billLineForm.qty} onChange={(e) => setBillLineForm((p) => ({ ...p, qty: e.target.value }))} /></label>
              <label>Unit Cost<input type="number" min="0" step="0.01" value={billLineForm.unitCost} onChange={(e) => setBillLineForm((p) => ({ ...p, unitCost: e.target.value }))} /></label>
              <label>Tax<select value={billLineForm.taxRateId} onChange={(e) => setBillLineForm((p) => ({ ...p, taxRateId: e.target.value }))}><option value="">None</option>{taxRates.map((t) => <option key={t.id} value={t.id}>{t.tax_name}</option>)}</select></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={addBillLine}>Add Bill Line</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Bills</h3>
            <table>
              <thead><tr><th>#</th><th>Vendor</th><th>Status</th><th>Total</th><th>Action</th></tr></thead>
              <tbody>
                {bills.length === 0 ? <tr><td colSpan={5}>No bills.</td></tr> : bills.map((b) => (
                  <tr key={b.id}>
                    <td>{b.bill_number}</td>
                    <td>{b.vendor_name}</td>
                    <td>{b.status}</td>
                    <td>{money(b.total)}</td>
                    <td className="actions-cell">
                      <button type="button" className="button-secondary" onClick={() => markBillStatus(b.id, 'PARTIAL')}>Partial</button>
                      <button type="button" onClick={() => markBillStatus(b.id, 'PAID')}>Paid</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
      {activeTab === 'banking' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Bank Transactions</h3>
            <div className="grid two">
              <label>Bank Account<select value={bankTxForm.paymentAccountId} onChange={(e) => setBankTxForm((p) => ({ ...p, paymentAccountId: e.target.value }))}><option value="">Select bank account</option>{paymentAccounts.filter((a) => a.account_type === 'BANK').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
              <label>Date<input type="date" value={bankTxForm.txDate} onChange={(e) => setBankTxForm((p) => ({ ...p, txDate: e.target.value }))} /></label>
              <label>Type<select value={bankTxForm.txType} onChange={(e) => setBankTxForm((p) => ({ ...p, txType: e.target.value }))}><option value="MONEY_IN">MONEY_IN</option><option value="MONEY_OUT">MONEY_OUT</option><option value="TRANSFER">TRANSFER</option></select></label>
              <label>Amount<input type="number" min="0.01" step="0.01" value={bankTxForm.amount} onChange={(e) => setBankTxForm((p) => ({ ...p, amount: e.target.value }))} /></label>
              <label>Reference<input value={bankTxForm.referenceNo} onChange={(e) => setBankTxForm((p) => ({ ...p, referenceNo: e.target.value }))} /></label>
              <label>Payee<input value={bankTxForm.payeeName} onChange={(e) => setBankTxForm((p) => ({ ...p, payeeName: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createBankTransaction}>Add Transaction</button></div>
            <hr />
            <h4>Create Reconciliation</h4>
            <div className="grid two">
              <label>Bank Account<select value={reconcileForm.paymentAccountId} onChange={(e) => setReconcileForm((p) => ({ ...p, paymentAccountId: e.target.value }))}><option value="">Select bank account</option>{paymentAccounts.filter((a) => a.account_type === 'BANK').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
              <label>Statement End Date<input type="date" value={reconcileForm.statementEndingDate} onChange={(e) => setReconcileForm((p) => ({ ...p, statementEndingDate: e.target.value }))} /></label>
              <label>Statement End Balance<input type="number" step="0.01" value={reconcileForm.statementEndingBalance} onChange={(e) => setReconcileForm((p) => ({ ...p, statementEndingBalance: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createReconciliation}>Create Reconciliation</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Bank Feed + Reconciliation</h3>
            <table><thead><tr><th>Date</th><th>Account</th><th>Type</th><th>Amount</th><th>Match</th></tr></thead><tbody>{bankTransactions.length === 0 ? <tr><td colSpan={5}>No transactions.</td></tr> : bankTransactions.map((t) => <tr key={t.id}><td>{String(t.tx_date || '').slice(0, 10)}</td><td>{t.payment_account_name}</td><td>{t.tx_type}</td><td>{money(t.amount)}</td><td>{t.match_type}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Date</th><th>Account</th><th>Statement</th><th>System</th><th>Diff</th><th>Status</th><th>Action</th></tr></thead><tbody>{reconciliations.length === 0 ? <tr><td colSpan={7}>No reconciliations.</td></tr> : reconciliations.map((r) => <tr key={r.id}><td>{String(r.statement_ending_date || '').slice(0, 10)}</td><td>{r.payment_account_name}</td><td>{money(r.statement_ending_balance)}</td><td>{money(r.system_balance)}</td><td>{money(r.difference)}</td><td>{r.status}</td><td>{r.status === 'OPEN' ? <button type="button" onClick={() => closeReconciliation(r.id)}>Close</button> : '-'}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'tax' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Tax Setup</h3>
            <div className="grid two">
              <label>Tax Name<input value={taxForm.taxName} onChange={(e) => setTaxForm((p) => ({ ...p, taxName: e.target.value }))} /></label>
              <label>Rate %<input type="number" step="0.01" value={taxForm.ratePercent} onChange={(e) => setTaxForm((p) => ({ ...p, ratePercent: e.target.value }))} /></label>
              <label>Scope<select value={taxForm.taxScope} onChange={(e) => setTaxForm((p) => ({ ...p, taxScope: e.target.value }))}><option value="BOTH">BOTH</option><option value="SALES">SALES</option><option value="PURCHASE">PURCHASE</option></select></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createTaxRate}>Create Tax Rate</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Tax Rates</h3>
            <table><thead><tr><th>Name</th><th>Rate</th><th>Scope</th><th>Active</th></tr></thead><tbody>{taxRates.length === 0 ? <tr><td colSpan={4}>No tax rates.</td></tr> : taxRates.map((t) => <tr key={t.id}><td>{t.tax_name}</td><td>{Number(t.rate_percent || 0)}%</td><td>{t.tax_scope}</td><td>{t.is_active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'coa' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Create Chart Account</h3>
            <div className="grid two">
              <label>Code<input value={coaForm.code} onChange={(e) => setCoaForm((p) => ({ ...p, code: e.target.value }))} /></label>
              <label>Name<input value={coaForm.name} onChange={(e) => setCoaForm((p) => ({ ...p, name: e.target.value }))} /></label>
              <label>Type<select value={coaForm.accountType} onChange={(e) => setCoaForm((p) => ({ ...p, accountType: e.target.value }))}><option value="ASSET">ASSET</option><option value="LIABILITY">LIABILITY</option><option value="EQUITY">EQUITY</option><option value="REVENUE">REVENUE</option><option value="EXPENSE">EXPENSE</option><option value="COGS">COGS</option></select></label>
              <label>Detail Type<input value={coaForm.detailType} onChange={(e) => setCoaForm((p) => ({ ...p, detailType: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createCoaAccount}>Create COA Account</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Chart of Accounts</h3>
            <table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Detail</th><th>Active</th></tr></thead><tbody>{coaAccounts.length === 0 ? <tr><td colSpan={5}>No chart accounts.</td></tr> : coaAccounts.map((a) => <tr key={a.id}><td>{a.code}</td><td>{a.name}</td><td>{a.account_type}</td><td>{a.detail_type}</td><td>{a.is_active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'reports' && canAdvancedFinance && (
        <div className="crm-reports-layout">
          <div className="card filter-grid">
            <input type="date" value={reportFilters.from} onChange={(e) => setReportFilters((p) => ({ ...p, from: e.target.value }))} />
            <input type="date" value={reportFilters.to} onChange={(e) => setReportFilters((p) => ({ ...p, to: e.target.value }))} />
            <div className="actions-cell"><button type="button" onClick={loadFinancePro}>Apply</button></div>
          </div>
          <div className="summary-grid">
            <article className="card"><h4>Revenue</h4><p className="metric">{money(financialReports.pnl?.revenue)}</p></article>
            <article className="card"><h4>Expenses</h4><p className="metric">{money(financialReports.pnl?.expenses)}</p></article>
            <article className="card"><h4>Gross Profit</h4><p className="metric">{money(financialReports.pnl?.grossProfit)}</p></article>
            <article className="card"><h4>Assets</h4><p className="metric">{money(financialReports.balance_sheet?.assets)}</p></article>
            <article className="card"><h4>Liabilities</h4><p className="metric">{money(financialReports.balance_sheet?.liabilities)}</p></article>
            <article className="card"><h4>Net Cash Flow</h4><p className="metric">{money(financialReports.cash_flow?.netCashFlow)}</p></article>
          </div>
          <div className="grid two">
            <section className="card table-wrap">
              <h4>A/R Aging</h4>
              <table><thead><tr><th>Current</th><th>1-30</th><th>31-60</th><th>90+</th></tr></thead><tbody><tr><td>{money(financialReports.aging?.ar?.current)}</td><td>{money(financialReports.aging?.ar?.days30)}</td><td>{money(financialReports.aging?.ar?.days60)}</td><td>{money(financialReports.aging?.ar?.days90plus)}</td></tr></tbody></table>
            </section>
            <section className="card table-wrap">
              <h4>A/P Aging</h4>
              <table><thead><tr><th>Current</th><th>1-30</th><th>31-60</th><th>90+</th></tr></thead><tbody><tr><td>{money(financialReports.aging?.ap?.current)}</td><td>{money(financialReports.aging?.ap?.days30)}</td><td>{money(financialReports.aging?.ap?.days60)}</td><td>{money(financialReports.aging?.ap?.days90plus)}</td></tr></tbody></table>
            </section>
          </div>
          <section className="card table-wrap">
            <h4>Monthly P&L Trend</h4>
            <table><thead><tr><th>Month</th><th>Revenue</th><th>Expenses</th><th>Net</th></tr></thead><tbody>{(financialReports.pnl?.monthly || []).length === 0 ? <tr><td colSpan={4}>No data.</td></tr> : (financialReports.pnl?.monthly || []).map((m) => <tr key={m.month}><td>{m.month}</td><td>{money(m.revenue)}</td><td>{money(m.expenses)}</td><td>{money(m.net)}</td></tr>)}</tbody></table>
          </section>
          <div className="grid two">
            <section className="card">
              <h4>Report Automation</h4>
              <div className="grid two">
                <label>Name<input value={reportPresetForm.presetName} onChange={(e) => setReportPresetForm((p) => ({ ...p, presetName: e.target.value }))} /></label>
                <label>Type<select value={reportPresetForm.reportType} onChange={(e) => setReportPresetForm((p) => ({ ...p, reportType: e.target.value }))}><option value="FINANCIAL">FINANCIAL</option><option value="AGING">AGING</option><option value="CUSTOM">CUSTOM</option></select></label>
                <label className="finance-ledger-notes">Definition JSON<textarea rows={3} value={reportPresetForm.definition} onChange={(e) => setReportPresetForm((p) => ({ ...p, definition: e.target.value }))} /></label>
              </div>
              <div className="actions-cell"><button type="button" onClick={createReportPresetAutomation}>Create Preset</button></div>
              <hr />
              <div className="grid two">
                <label>Preset<select value={reportScheduleForm.presetId} onChange={(e) => setReportScheduleForm((p) => ({ ...p, presetId: e.target.value }))}><option value="">Select preset</option>{reportPresets.map((p) => <option key={p.id} value={p.id}>{p.preset_name}</option>)}</select></label>
                <label>Schedule<select value={reportScheduleForm.scheduleType} onChange={(e) => setReportScheduleForm((p) => ({ ...p, scheduleType: e.target.value }))}><option value="DAILY">DAILY</option><option value="WEEKLY">WEEKLY</option><option value="MONTHLY">MONTHLY</option></select></label>
                <label>Next Run<input type="date" value={reportScheduleForm.nextRunDate} onChange={(e) => setReportScheduleForm((p) => ({ ...p, nextRunDate: e.target.value }))} /></label>
                <label>Delivery<select value={reportScheduleForm.deliveryChannel} onChange={(e) => setReportScheduleForm((p) => ({ ...p, deliveryChannel: e.target.value }))}><option value="IN_APP">IN_APP</option><option value="EMAIL">EMAIL</option><option value="WEBHOOK">WEBHOOK</option></select></label>
              </div>
              <div className="actions-cell"><button type="button" className="button-secondary" onClick={createReportScheduleAutomation}>Create Schedule</button></div>
              <hr />
              <div className="grid two">
                <label>Export Preset<select value={reportExportForm.presetId} onChange={(e) => setReportExportForm((p) => ({ ...p, presetId: e.target.value }))}><option value="">None</option>{reportPresets.map((p) => <option key={p.id} value={p.id}>{p.preset_name}</option>)}</select></label>
                <label>Format<select value={reportExportForm.exportFormat} onChange={(e) => setReportExportForm((p) => ({ ...p, exportFormat: e.target.value }))}><option value="CSV">CSV</option><option value="PDF">PDF</option><option value="XLSX">XLSX</option></select></label>
                <label className="finance-ledger-notes">Scope JSON<textarea rows={2} value={reportExportForm.exportScope} onChange={(e) => setReportExportForm((p) => ({ ...p, exportScope: e.target.value }))} /></label>
              </div>
              <div className="actions-cell"><button type="button" onClick={exportReportNow}>Export</button></div>
            </section>
            <section className="card table-wrap">
              <h4>Presets, Schedules, Exports</h4>
              <table><thead><tr><th>Preset</th><th>Type</th><th>Shared</th></tr></thead><tbody>{reportPresets.length === 0 ? <tr><td colSpan={3}>No presets.</td></tr> : reportPresets.map((p) => <tr key={p.id}><td>{p.preset_name}</td><td>{p.report_type}</td><td>{p.is_shared ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
              <table><thead><tr><th>Preset</th><th>Schedule</th><th>Next</th><th>Channel</th></tr></thead><tbody>{reportSchedules.length === 0 ? <tr><td colSpan={4}>No schedules.</td></tr> : reportSchedules.map((s) => <tr key={s.id}><td>{s.preset_name}</td><td>{s.schedule_type}</td><td>{String(s.next_run_date || '').slice(0, 10)}</td><td>{s.delivery_channel}</td></tr>)}</tbody></table>
              <table><thead><tr><th>Preset</th><th>Format</th><th>When</th></tr></thead><tbody>{reportExports.length === 0 ? <tr><td colSpan={3}>No exports.</td></tr> : reportExports.slice(0, 20).map((x) => <tr key={x.id}><td>{x.preset_name || 'Ad-hoc'}</td><td>{x.export_format}</td><td>{String(x.exported_at || '').slice(0, 19).replace('T', ' ')}</td></tr>)}</tbody></table>
            </section>
          </div>
        </div>
      )}
      {activeTab === 'recurring' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Create Recurring Template</h3>
            <div className="grid two">
              <label>Name<input value={recurringTemplateForm.templateName} onChange={(e) => setRecurringTemplateForm((p) => ({ ...p, templateName: e.target.value }))} /></label>
              <label>Entity<select value={recurringTemplateForm.entityType} onChange={(e) => setRecurringTemplateForm((p) => ({ ...p, entityType: e.target.value }))}><option value="INVOICE">INVOICE</option><option value="BILL">BILL</option><option value="JOURNAL">JOURNAL</option></select></label>
              <label>Frequency<select value={recurringTemplateForm.frequency} onChange={(e) => setRecurringTemplateForm((p) => ({ ...p, frequency: e.target.value }))}><option value="WEEKLY">WEEKLY</option><option value="MONTHLY">MONTHLY</option><option value="QUARTERLY">QUARTERLY</option></select></label>
              <label>Next Run<input type="date" value={recurringTemplateForm.nextRunDate} onChange={(e) => setRecurringTemplateForm((p) => ({ ...p, nextRunDate: e.target.value }))} /></label>
              <label className="finance-ledger-notes">Payload JSON<textarea rows={4} value={recurringTemplateForm.payload} onChange={(e) => setRecurringTemplateForm((p) => ({ ...p, payload: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createRecurringTemplate}>Create Template</button></div>
            <hr />
            <h4>Batch Actions</h4>
            <div className="grid two">
              <label>Action<select value={batchForm.actionType} onChange={(e) => setBatchForm((p) => ({ ...p, actionType: e.target.value }))}><option value="INVOICE_STATUS">INVOICE_STATUS</option><option value="BILL_STATUS">BILL_STATUS</option><option value="PO_STATUS">PO_STATUS</option></select></label>
              <label>Status<input value={batchForm.status} onChange={(e) => setBatchForm((p) => ({ ...p, status: e.target.value }))} /></label>
              <label className="finance-ledger-notes">IDs (comma-separated)<textarea rows={3} value={batchForm.ids} onChange={(e) => setBatchForm((p) => ({ ...p, ids: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={runBatchAction}>Run Batch</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Recurring Templates</h3>
            <table><thead><tr><th>Name</th><th>Entity</th><th>Frequency</th><th>Next Run</th><th>Action</th></tr></thead><tbody>{recurringTemplates.length === 0 ? <tr><td colSpan={5}>No templates.</td></tr> : recurringTemplates.map((t) => <tr key={t.id}><td>{t.template_name}</td><td>{t.entity_type}</td><td>{t.frequency}</td><td>{String(t.next_run_date || '').slice(0, 10)}</td><td><button type="button" onClick={() => runRecurringNow(t.id)}>Run Now</button></td></tr>)}</tbody></table>
            <h4>Recurring Runs</h4>
            <table><thead><tr><th>Template</th><th>Entity</th><th>Generated ID</th><th>Status</th><th>When</th></tr></thead><tbody>{recurringRuns.length === 0 ? <tr><td colSpan={5}>No runs.</td></tr> : recurringRuns.map((r) => <tr key={r.id}><td>{r.template_name}</td><td>{r.entity_type}</td><td>{r.generated_entity_id || '-'}</td><td>{r.status}</td><td>{String(r.created_at || '').slice(0, 19).replace('T', ' ')}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'purchasing' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Create Purchase Order</h3>
            <div className="grid two">
              <label>Vendor<select value={purchaseOrderForm.vendorId} onChange={(e) => setPurchaseOrderForm((p) => ({ ...p, vendorId: e.target.value }))}><option value="">Select vendor</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}</select></label>
              <label>PO Date<input type="date" value={purchaseOrderForm.poDate} onChange={(e) => setPurchaseOrderForm((p) => ({ ...p, poDate: e.target.value }))} /></label>
              <label>Expected Date<input type="date" value={purchaseOrderForm.expectedDate} onChange={(e) => setPurchaseOrderForm((p) => ({ ...p, expectedDate: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createPurchaseOrder}>Create PO</button></div>
            <hr />
            <h4>Add PO Line</h4>
            <div className="grid two">
              <label>PO<select value={purchaseOrderLineForm.purchaseOrderId} onChange={(e) => setPurchaseOrderLineForm((p) => ({ ...p, purchaseOrderId: e.target.value }))}><option value="">Select PO</option>{purchaseOrders.map((po) => <option key={po.id} value={po.id}>{po.po_number}</option>)}</select></label>
              <label>Description<input value={purchaseOrderLineForm.description} onChange={(e) => setPurchaseOrderLineForm((p) => ({ ...p, description: e.target.value }))} /></label>
              <label>Qty<input type="number" min="1" value={purchaseOrderLineForm.qty} onChange={(e) => setPurchaseOrderLineForm((p) => ({ ...p, qty: e.target.value }))} /></label>
              <label>Unit Cost<input type="number" min="0" step="0.01" value={purchaseOrderLineForm.unitCost} onChange={(e) => setPurchaseOrderLineForm((p) => ({ ...p, unitCost: e.target.value }))} /></label>
              <label>Tax<select value={purchaseOrderLineForm.taxRateId} onChange={(e) => setPurchaseOrderLineForm((p) => ({ ...p, taxRateId: e.target.value }))}><option value="">None</option>{taxRates.map((t) => <option key={t.id} value={t.id}>{t.tax_name}</option>)}</select></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={addPurchaseOrderLine}>Add PO Line</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Purchase Orders</h3>
            <table>
              <thead><tr><th>#</th><th>Vendor</th><th>Status</th><th>Total</th><th>Action</th></tr></thead>
              <tbody>
                {purchaseOrders.length === 0 ? <tr><td colSpan={5}>No purchase orders.</td></tr> : purchaseOrders.map((po) => (
                  <tr key={po.id}>
                    <td>{po.po_number}</td>
                    <td>{po.vendor_name}</td>
                    <td>{po.status}</td>
                    <td>{money(po.total)}</td>
                    <td className="actions-cell">
                      <button type="button" className="button-secondary" onClick={() => markPurchaseOrderStatus(po.id, 'APPROVED')}>Approve</button>
                      <button type="button" onClick={() => markPurchaseOrderStatus(po.id, 'RECEIVED')}>Receive</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
      {activeTab === 'inventory' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Inventory Items</h3>
            <div className="grid two">
              <label>SKU<input value={inventoryItemForm.sku} onChange={(e) => setInventoryItemForm((p) => ({ ...p, sku: e.target.value }))} /></label>
              <label>Name<input value={inventoryItemForm.itemName} onChange={(e) => setInventoryItemForm((p) => ({ ...p, itemName: e.target.value }))} /></label>
              <label>Type<select value={inventoryItemForm.itemType} onChange={(e) => setInventoryItemForm((p) => ({ ...p, itemType: e.target.value }))}><option value="PRODUCT">PRODUCT</option><option value="SERVICE">SERVICE</option><option value="MATERIAL">MATERIAL</option></select></label>
              <label>Valuation<select value={inventoryItemForm.valuationMethod} onChange={(e) => setInventoryItemForm((p) => ({ ...p, valuationMethod: e.target.value }))}><option value="FIFO">FIFO</option><option value="AVERAGE">AVERAGE</option></select></label>
              <label>Sales Price<input type="number" min="0" step="0.01" value={inventoryItemForm.salesPrice} onChange={(e) => setInventoryItemForm((p) => ({ ...p, salesPrice: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createInventoryItem}>Create Item</button></div>
            <hr />
            <h4>Inventory Movement</h4>
            <div className="grid two">
              <label>Item<select value={inventoryMoveForm.itemId} onChange={(e) => setInventoryMoveForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select item</option>{inventoryItems.map((i) => <option key={i.id} value={i.id}>{i.sku} - {i.item_name}</option>)}</select></label>
              <label>Type<select value={inventoryMoveForm.movementType} onChange={(e) => setInventoryMoveForm((p) => ({ ...p, movementType: e.target.value }))}><option value="PURCHASE">PURCHASE</option><option value="SALE">SALE</option><option value="ADJUSTMENT_IN">ADJUSTMENT_IN</option><option value="ADJUSTMENT_OUT">ADJUSTMENT_OUT</option></select></label>
              <label>Qty<input type="number" min="0.01" step="0.01" value={inventoryMoveForm.qty} onChange={(e) => setInventoryMoveForm((p) => ({ ...p, qty: e.target.value }))} /></label>
              <label>Unit Cost<input type="number" min="0" step="0.0001" value={inventoryMoveForm.unitCost} onChange={(e) => setInventoryMoveForm((p) => ({ ...p, unitCost: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={addInventoryMovement}>Post Movement</button></div>
            <hr />
            <h4>Lot Receive (FIFO)</h4>
            <div className="grid two">
              <label>Item<select value={lotReceiveForm.itemId} onChange={(e) => setLotReceiveForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select item</option>{inventoryItems.map((i) => <option key={i.id} value={i.id}>{i.sku} - {i.item_name}</option>)}</select></label>
              <label>Lot Number<input value={lotReceiveForm.lotNumber} onChange={(e) => setLotReceiveForm((p) => ({ ...p, lotNumber: e.target.value }))} /></label>
              <label>Receive Date<input type="date" value={lotReceiveForm.receivedDate} onChange={(e) => setLotReceiveForm((p) => ({ ...p, receivedDate: e.target.value }))} /></label>
              <label>Expiry Date<input type="date" value={lotReceiveForm.expiryDate} onChange={(e) => setLotReceiveForm((p) => ({ ...p, expiryDate: e.target.value }))} /></label>
              <label>Qty<input type="number" min="0.01" step="0.01" value={lotReceiveForm.qtyReceived} onChange={(e) => setLotReceiveForm((p) => ({ ...p, qtyReceived: e.target.value }))} /></label>
              <label>Unit Cost<input type="number" min="0" step="0.0001" value={lotReceiveForm.unitCost} onChange={(e) => setLotReceiveForm((p) => ({ ...p, unitCost: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={receiveInventoryLotItem}>Receive Lot</button></div>
            <hr />
            <h4>Issue With COGS</h4>
            <div className="grid two">
              <label>Item<select value={lotIssueForm.itemId} onChange={(e) => setLotIssueForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select item</option>{inventoryItems.map((i) => <option key={i.id} value={i.id}>{i.sku} - {i.item_name}</option>)}</select></label>
              <label>Qty<input type="number" min="0.01" step="0.01" value={lotIssueForm.qty} onChange={(e) => setLotIssueForm((p) => ({ ...p, qty: e.target.value }))} /></label>
              <label>Date<input type="date" value={lotIssueForm.movementDate} onChange={(e) => setLotIssueForm((p) => ({ ...p, movementDate: e.target.value }))} /></label>
              <label>Notes<input value={lotIssueForm.notes} onChange={(e) => setLotIssueForm((p) => ({ ...p, notes: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={issueInventoryLotCogs}>Issue & Post COGS</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Inventory Valuation</h3>
            <p>Items: {Number(inventoryValuation.item_count || 0)} | Qty: {money(inventoryValuation.total_qty)} | Value: {money(inventoryValuation.inventory_value)}</p>
            <table><thead><tr><th>SKU</th><th>Name</th><th>Qty</th><th>Avg Cost</th><th>Value</th></tr></thead><tbody>{inventoryItems.length === 0 ? <tr><td colSpan={5}>No inventory items.</td></tr> : inventoryItems.map((i) => <tr key={i.id}><td>{i.sku}</td><td>{i.item_name}</td><td>{money(i.qty_on_hand)}</td><td>{money(i.avg_unit_cost)}</td><td>{money(Number(i.qty_on_hand || 0) * Number(i.avg_unit_cost || 0))}</td></tr>)}</tbody></table>
            <h4>Inventory Lots</h4>
            <table><thead><tr><th>Item</th><th>Lot</th><th>Received</th><th>Available</th><th>Unit Cost</th><th>Expiry</th></tr></thead><tbody>{inventoryLots.length === 0 ? <tr><td colSpan={6}>No lots.</td></tr> : inventoryLots.map((l) => <tr key={l.id}><td>{l.sku}</td><td>{l.lot_number}</td><td>{String(l.received_date || '').slice(0, 10)}</td><td>{money(l.qty_available)}</td><td>{money(l.unit_cost)}</td><td>{l.expiry_date ? String(l.expiry_date).slice(0, 10) : '-'}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'budgeting' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Create Budget + Dimensions</h3>
            <div className="grid two">
              <label>Class Name<input value={classForm.className} onChange={(e) => setClassForm((p) => ({ ...p, className: e.target.value }))} /></label>
              <label>Class Desc<input value={classForm.description} onChange={(e) => setClassForm((p) => ({ ...p, description: e.target.value }))} /></label>
              <div className="actions-cell"><button type="button" className="button-secondary" onClick={createClassTag}>Add Class</button></div>
            </div>
            <div className="grid two">
              <label>Location Name<input value={locationForm.locationName} onChange={(e) => setLocationForm((p) => ({ ...p, locationName: e.target.value }))} /></label>
              <label>Location Desc<input value={locationForm.description} onChange={(e) => setLocationForm((p) => ({ ...p, description: e.target.value }))} /></label>
              <div className="actions-cell"><button type="button" className="button-secondary" onClick={createLocationTag}>Add Location</button></div>
            </div>
            <hr />
            <div className="grid two">
              <label>Budget Name<input value={budgetForm.budgetName} onChange={(e) => setBudgetForm((p) => ({ ...p, budgetName: e.target.value }))} /></label>
              <label>Fiscal Year<input type="number" value={budgetForm.fiscalYear} onChange={(e) => setBudgetForm((p) => ({ ...p, fiscalYear: e.target.value }))} /></label>
              <label>Class<select value={budgetForm.classId} onChange={(e) => setBudgetForm((p) => ({ ...p, classId: e.target.value }))}><option value="">None</option>{classRows.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}</select></label>
              <label>Location<select value={budgetForm.locationId} onChange={(e) => setBudgetForm((p) => ({ ...p, locationId: e.target.value }))}><option value="">None</option>{locationRows.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}</select></label>
              <label>Revenue Target<input type="number" min="0" step="0.01" value={budgetForm.revenueTarget} onChange={(e) => setBudgetForm((p) => ({ ...p, revenueTarget: e.target.value }))} /></label>
              <label>Expense Target<input type="number" min="0" step="0.01" value={budgetForm.expenseTarget} onChange={(e) => setBudgetForm((p) => ({ ...p, expenseTarget: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createBudget}>Create Budget</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Budgets</h3>
            <table><thead><tr><th>Name</th><th>Year</th><th>Class</th><th>Location</th><th>Revenue</th><th>Expense</th></tr></thead><tbody>{budgetRows.length === 0 ? <tr><td colSpan={6}>No budgets.</td></tr> : budgetRows.map((b) => <tr key={b.id}><td>{b.budget_name}</td><td>{b.fiscal_year}</td><td>{b.class_name || '-'}</td><td>{b.location_name || '-'}</td><td>{money(b.revenue_target)}</td><td>{money(b.expense_target)}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'projects' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Create Project</h3>
            <div className="grid two">
              <label>Code<input value={projectForm.projectCode} onChange={(e) => setProjectForm((p) => ({ ...p, projectCode: e.target.value }))} /></label>
              <label>Name<input value={projectForm.projectName} onChange={(e) => setProjectForm((p) => ({ ...p, projectName: e.target.value }))} /></label>
              <label>Customer<select value={projectForm.customerAccountId} onChange={(e) => setProjectForm((p) => ({ ...p, customerAccountId: e.target.value }))}><option value="">None</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.customer_name}</option>)}</select></label>
              <label>Class<select value={projectForm.classId} onChange={(e) => setProjectForm((p) => ({ ...p, classId: e.target.value }))}><option value="">None</option>{classRows.map((c) => <option key={c.id} value={c.id}>{c.class_name}</option>)}</select></label>
              <label>Location<select value={projectForm.locationId} onChange={(e) => setProjectForm((p) => ({ ...p, locationId: e.target.value }))}><option value="">None</option>{locationRows.map((l) => <option key={l.id} value={l.id}>{l.location_name}</option>)}</select></label>
              <label>Budget<input type="number" min="0" step="0.01" value={projectForm.budgetAmount} onChange={(e) => setProjectForm((p) => ({ ...p, budgetAmount: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createProject}>Create Project</button></div>
            <hr />
            <h4>Add Project Entry</h4>
            <div className="grid two">
              <label>Project<select value={projectEntryForm.projectId} onChange={(e) => setProjectEntryForm((p) => ({ ...p, projectId: e.target.value }))}><option value="">Select project</option>{projectRows.map((p) => <option key={p.id} value={p.id}>{p.project_code}</option>)}</select></label>
              <label>Type<select value={projectEntryForm.entryType} onChange={(e) => setProjectEntryForm((p) => ({ ...p, entryType: e.target.value }))}><option value="COST">COST</option><option value="REVENUE">REVENUE</option><option value="TIME">TIME</option></select></label>
              <label>Amount<input type="number" step="0.01" value={projectEntryForm.amount} onChange={(e) => setProjectEntryForm((p) => ({ ...p, amount: e.target.value }))} /></label>
              <label>Notes<input value={projectEntryForm.notes} onChange={(e) => setProjectEntryForm((p) => ({ ...p, notes: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={addProjectEntry}>Log Entry</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Projects</h3>
            <table><thead><tr><th>Code</th><th>Name</th><th>Budget</th><th>Cost</th><th>Revenue</th><th>Status</th></tr></thead><tbody>{projectRows.length === 0 ? <tr><td colSpan={6}>No projects.</td></tr> : projectRows.map((p) => <tr key={p.id}><td>{p.project_code}</td><td>{p.project_name}</td><td>{money(p.budget_amount)}</td><td>{money(p.actual_cost)}</td><td>{money(p.actual_revenue)}</td><td>{p.status}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'payroll' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Payroll Profiles + Runs</h3>
            <div className="grid two">
              <label>Employee Code<input value={payrollProfileForm.employeeCode} onChange={(e) => setPayrollProfileForm((p) => ({ ...p, employeeCode: e.target.value }))} /></label>
              <label>Full Name<input value={payrollProfileForm.fullName} onChange={(e) => setPayrollProfileForm((p) => ({ ...p, fullName: e.target.value }))} /></label>
              <label>Salary Type<select value={payrollProfileForm.salaryType} onChange={(e) => setPayrollProfileForm((p) => ({ ...p, salaryType: e.target.value }))}><option value="MONTHLY">MONTHLY</option><option value="HOURLY">HOURLY</option></select></label>
              <label>Base Salary<input type="number" min="0" step="0.01" value={payrollProfileForm.baseSalary} onChange={(e) => setPayrollProfileForm((p) => ({ ...p, baseSalary: e.target.value }))} /></label>
              <label>Tax %<input type="number" min="0" step="0.01" value={payrollProfileForm.taxPercent} onChange={(e) => setPayrollProfileForm((p) => ({ ...p, taxPercent: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createPayrollProfile}>Create Profile</button></div>
            <hr />
            <div className="grid two">
              <label>Run Label<input value={payrollRunForm.runLabel} onChange={(e) => setPayrollRunForm((p) => ({ ...p, runLabel: e.target.value }))} /></label>
              <label>Period Start<input type="date" value={payrollRunForm.periodStart} onChange={(e) => setPayrollRunForm((p) => ({ ...p, periodStart: e.target.value }))} /></label>
              <label>Period End<input type="date" value={payrollRunForm.periodEnd} onChange={(e) => setPayrollRunForm((p) => ({ ...p, periodEnd: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createPayrollRun}>Create Payroll Run</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Payroll Runs</h3>
            <table><thead><tr><th>Run</th><th>Period</th><th>Gross</th><th>Tax</th><th>Net</th><th>Status</th><th>Action</th></tr></thead><tbody>{payrollRuns.length === 0 ? <tr><td colSpan={7}>No payroll runs.</td></tr> : payrollRuns.map((r) => <tr key={r.id}><td>{r.run_label}</td><td>{String(r.period_start || '').slice(0, 10)} to {String(r.period_end || '').slice(0, 10)}</td><td>{money(r.total_gross)}</td><td>{money(r.total_tax)}</td><td>{money(r.total_net)}</td><td>{r.status}</td><td className="actions-cell"><button type="button" className="button-secondary" onClick={() => markPayrollRun(r.id, 'POSTED')}>Post</button><button type="button" onClick={() => markPayrollRun(r.id, 'PAID')}>Pay</button></td></tr>)}</tbody></table>
            <h4>Payroll Profiles</h4>
            <table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Base</th><th>Tax %</th></tr></thead><tbody>{payrollProfiles.length === 0 ? <tr><td colSpan={5}>No profiles.</td></tr> : payrollProfiles.map((p) => <tr key={p.id}><td>{p.employee_code}</td><td>{p.full_name}</td><td>{p.salary_type}</td><td>{money(p.base_salary)}</td><td>{Number(p.tax_percent || 0)}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'automation' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Bank Rules</h3>
            <div className="grid two">
              <label>Rule Name<input value={bankRuleForm.ruleName} onChange={(e) => setBankRuleForm((p) => ({ ...p, ruleName: e.target.value }))} /></label>
              <label>Action<select value={bankRuleForm.action} onChange={(e) => setBankRuleForm((p) => ({ ...p, action: e.target.value }))}><option value="MATCH_INVOICE">MATCH_INVOICE</option><option value="EXCLUDE">EXCLUDE</option></select></label>
              <label>Reference Contains<input value={bankRuleForm.referenceContains} onChange={(e) => setBankRuleForm((p) => ({ ...p, referenceContains: e.target.value }))} /></label>
              <label>Memo Contains<input value={bankRuleForm.memoContains} onChange={(e) => setBankRuleForm((p) => ({ ...p, memoContains: e.target.value }))} /></label>
              <label>Amount {'<='}<input type="number" min="0" step="0.01" value={bankRuleForm.amountLte} onChange={(e) => setBankRuleForm((p) => ({ ...p, amountLte: e.target.value }))} /></label>
              <label>Amount {'>='}<input type="number" min="0" step="0.01" value={bankRuleForm.amountGte} onChange={(e) => setBankRuleForm((p) => ({ ...p, amountGte: e.target.value }))} /></label>
              <label>Priority<input type="number" min="1" value={bankRuleForm.priority} onChange={(e) => setBankRuleForm((p) => ({ ...p, priority: e.target.value }))} /></label>
              <label><input type="checkbox" checked={bankRuleForm.active} onChange={(e) => setBankRuleForm((p) => ({ ...p, active: e.target.checked }))} /> Active</label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createBankRule}>Create Rule</button></div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={runBankRuleEngineNow}>Run Rule Engine</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Rules + Match Logs</h3>
            <table><thead><tr><th>Name</th><th>Priority</th><th>Active</th></tr></thead><tbody>{bankRules.length === 0 ? <tr><td colSpan={3}>No rules.</td></tr> : bankRules.map((r) => <tr key={r.id}><td>{r.rule_name}</td><td>{r.priority}</td><td>{r.active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Rule</th><th>Result</th><th>When</th></tr></thead><tbody>{bankRuleLogs.length === 0 ? <tr><td colSpan={3}>No logs.</td></tr> : bankRuleLogs.slice(0, 25).map((l) => <tr key={l.id}><td>{l.rule_name || '-'}</td><td>{l.match_result}</td><td>{String(l.created_at || '').slice(0, 19).replace('T', ' ')}</td></tr>)}</tbody></table>
            <hr />
            <h4>Bank Feed Connectors</h4>
            <div className="grid two">
              <label>Connector Name<input value={bankFeedConnectorForm.connectorName} onChange={(e) => setBankFeedConnectorForm((p) => ({ ...p, connectorName: e.target.value }))} /></label>
              <label>Provider<input value={bankFeedConnectorForm.provider} onChange={(e) => setBankFeedConnectorForm((p) => ({ ...p, provider: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createBankFeedConnectorNow}>Create Connector</button></div>
            <div className="grid two">
              <label>Import Connector<select value={bankFeedImportForm.connectorId} onChange={(e) => setBankFeedImportForm((p) => ({ ...p, connectorId: e.target.value }))}><option value="">Select connector</option>{bankFeedConnectors.map((c) => <option key={c.id} value={c.id}>{c.connector_name}</option>)}</select></label>
              <label className="finance-ledger-notes">Entries JSON<textarea rows={4} value={bankFeedImportForm.entriesJson} onChange={(e) => setBankFeedImportForm((p) => ({ ...p, entriesJson: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={runBankFeedImportNow}>Run Feed Import</button></div>
            <table><thead><tr><th>Connector</th><th>Status</th><th>Imported</th><th>Duplicates</th></tr></thead><tbody>{bankFeedRuns.length === 0 ? <tr><td colSpan={4}>No import runs.</td></tr> : bankFeedRuns.slice(0, 10).map((r) => <tr key={r.id}><td>{r.connector_name}</td><td>{r.run_status}</td><td>{r.imported_count}</td><td>{r.duplicate_count}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Connector</th><th>Ext Tx</th><th>Amount</th><th>Confidence</th></tr></thead><tbody>{bankFeedEntries.length === 0 ? <tr><td colSpan={4}>No feed entries.</td></tr> : bankFeedEntries.slice(0, 10).map((e) => <tr key={e.id}><td>{e.connector_name}</td><td>{e.ext_tx_id}</td><td>{money(e.amount)}</td><td>{Number(e.match_confidence || 0)}%</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'compliance' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Payroll Tax Compliance</h3>
            <div className="grid two">
              <label>Country<input value={payrollTaxSettingForm.countryCode} onChange={(e) => setPayrollTaxSettingForm((p) => ({ ...p, countryCode: e.target.value }))} /></label>
              <label>Authority<input value={payrollTaxSettingForm.taxAuthority} onChange={(e) => setPayrollTaxSettingForm((p) => ({ ...p, taxAuthority: e.target.value }))} /></label>
              <label>Frequency<select value={payrollTaxSettingForm.filingFrequency} onChange={(e) => setPayrollTaxSettingForm((p) => ({ ...p, filingFrequency: e.target.value }))}><option value="MONTHLY">MONTHLY</option><option value="QUARTERLY">QUARTERLY</option><option value="ANNUAL">ANNUAL</option></select></label>
              <label>Payment Account<select value={payrollTaxSettingForm.paymentAccountId} onChange={(e) => setPayrollTaxSettingForm((p) => ({ ...p, paymentAccountId: e.target.value }))}><option value="">None</option>{paymentAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createPayrollTaxSetting}>Create Tax Setting</button></div>
            <hr />
            <h4>Submit Filing</h4>
            <div className="grid two">
              <label>Payroll Run<select value={payrollFilingForm.payrollRunId} onChange={(e) => setPayrollFilingForm((p) => ({ ...p, payrollRunId: e.target.value }))}><option value="">None</option>{payrollRuns.map((r) => <option key={r.id} value={r.id}>{r.run_label}</option>)}</select></label>
              <label>Period Label<input value={payrollFilingForm.periodLabel} onChange={(e) => setPayrollFilingForm((p) => ({ ...p, periodLabel: e.target.value }))} /></label>
              <label>Authority<input value={payrollFilingForm.taxAuthority} onChange={(e) => setPayrollFilingForm((p) => ({ ...p, taxAuthority: e.target.value }))} /></label>
              <label>Tax Due<input type="number" min="0" step="0.01" value={payrollFilingForm.taxDue} onChange={(e) => setPayrollFilingForm((p) => ({ ...p, taxDue: e.target.value }))} /></label>
              <label>Reference<input value={payrollFilingForm.referenceNo} onChange={(e) => setPayrollFilingForm((p) => ({ ...p, referenceNo: e.target.value }))} /></label>
              <label className="finance-ledger-notes">Payload JSON<textarea rows={3} value={payrollFilingForm.payload} onChange={(e) => setPayrollFilingForm((p) => ({ ...p, payload: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={submitPayrollFiling}>Submit Filing</button></div>
            <hr />
            <h4>Sales Tax Center</h4>
            <div className="grid two">
              <label>Jurisdiction Code<input value={taxJurisdictionForm.jurisdictionCode} onChange={(e) => setTaxJurisdictionForm((p) => ({ ...p, jurisdictionCode: e.target.value }))} /></label>
              <label>Country<input value={taxJurisdictionForm.countryCode} onChange={(e) => setTaxJurisdictionForm((p) => ({ ...p, countryCode: e.target.value }))} /></label>
              <label>Region<input value={taxJurisdictionForm.regionName} onChange={(e) => setTaxJurisdictionForm((p) => ({ ...p, regionName: e.target.value }))} /></label>
              <label>Tax Rate %<input type="number" min="0" step="0.0001" value={taxJurisdictionForm.taxRatePercent} onChange={(e) => setTaxJurisdictionForm((p) => ({ ...p, taxRatePercent: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={upsertTaxJurisdictionNow}>Save Jurisdiction</button></div>
            <div className="grid two">
              <label>Nexus Jurisdiction<select value={taxNexusForm.jurisdictionId} onChange={(e) => setTaxNexusForm((p) => ({ ...p, jurisdictionId: e.target.value }))}><option value="">Select jurisdiction</option>{taxJurisdictions.map((j) => <option key={j.id} value={j.id}>{j.jurisdiction_code}</option>)}</select></label>
              <label>Outlet<input value={taxNexusForm.outletName} onChange={(e) => setTaxNexusForm((p) => ({ ...p, outletName: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={upsertTaxNexusNow}>Save Nexus</button></div>
            <div className="grid two">
              <label>Preview Outlet<input value={taxPreviewForm.outletName} onChange={(e) => setTaxPreviewForm((p) => ({ ...p, outletName: e.target.value }))} /></label>
              <label>Preview Jurisdiction<input value={taxPreviewForm.jurisdictionCode} onChange={(e) => setTaxPreviewForm((p) => ({ ...p, jurisdictionCode: e.target.value }))} /></label>
              <label>Amount<input type="number" min="0" step="0.01" value={taxPreviewForm.amount} onChange={(e) => setTaxPreviewForm((p) => ({ ...p, amount: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={previewTaxNow}>Preview Tax</button></div>
            {taxPreviewResult && <p>Tax {money(taxPreviewResult.taxAmount)} | Total {money(taxPreviewResult.total)} | Rate {Number(taxPreviewResult.taxRatePercent || 0)}%</p>}
            <hr />
            <h4>Payroll Schedules & Components</h4>
            <div className="grid two">
              <label>Schedule Name<input value={payrollScheduleForm.scheduleName} onChange={(e) => setPayrollScheduleForm((p) => ({ ...p, scheduleName: e.target.value }))} /></label>
              <label>Frequency<select value={payrollScheduleForm.frequency} onChange={(e) => setPayrollScheduleForm((p) => ({ ...p, frequency: e.target.value }))}><option value="WEEKLY">WEEKLY</option><option value="BIWEEKLY">BIWEEKLY</option><option value="MONTHLY">MONTHLY</option></select></label>
              <label>Next Pay Date<input type="date" value={payrollScheduleForm.nextPayDate} onChange={(e) => setPayrollScheduleForm((p) => ({ ...p, nextPayDate: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createPayrollScheduleNow}>Create Schedule</button></div>
            <div className="grid two">
              <label>Component Name<input value={payrollComponentForm.componentName} onChange={(e) => setPayrollComponentForm((p) => ({ ...p, componentName: e.target.value }))} /></label>
              <label>Type<select value={payrollComponentForm.componentType} onChange={(e) => setPayrollComponentForm((p) => ({ ...p, componentType: e.target.value }))}><option value="EARNING">EARNING</option><option value="DEDUCTION">DEDUCTION</option><option value="TAX">TAX</option></select></label>
              <label>Calc<select value={payrollComponentForm.calcType} onChange={(e) => setPayrollComponentForm((p) => ({ ...p, calcType: e.target.value }))}><option value="PERCENT">PERCENT</option><option value="FIXED">FIXED</option></select></label>
              <label>Default Value<input type="number" step="0.0001" value={payrollComponentForm.defaultValue} onChange={(e) => setPayrollComponentForm((p) => ({ ...p, defaultValue: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={createPayrollComponentNow}>Create Component</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Tax Settings + Filings</h3>
            <table><thead><tr><th>Country</th><th>Authority</th><th>Frequency</th><th>Active</th></tr></thead><tbody>{payrollTaxSettings.length === 0 ? <tr><td colSpan={4}>No tax settings.</td></tr> : payrollTaxSettings.map((s) => <tr key={s.id}><td>{s.country_code}</td><td>{s.tax_authority}</td><td>{s.filing_frequency}</td><td>{s.active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Period</th><th>Authority</th><th>Status</th><th>Tax Due</th><th>Run</th></tr></thead><tbody>{payrollFilings.length === 0 ? <tr><td colSpan={5}>No filings.</td></tr> : payrollFilings.map((f) => <tr key={f.id}><td>{f.period_label}</td><td>{f.tax_authority}</td><td>{f.filing_status}</td><td>{money(f.tax_due)}</td><td>{f.run_label || '-'}</td></tr>)}</tbody></table>
            <h4>Jurisdictions & Nexus</h4>
            <table><thead><tr><th>Code</th><th>Region</th><th>Rate %</th><th>Active</th></tr></thead><tbody>{taxJurisdictions.length === 0 ? <tr><td colSpan={4}>No jurisdictions.</td></tr> : taxJurisdictions.map((j) => <tr key={j.id}><td>{j.jurisdiction_code}</td><td>{j.region_name}</td><td>{Number(j.tax_rate_percent || 0)}</td><td>{j.active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Outlet</th><th>Jurisdiction</th><th>Region</th></tr></thead><tbody>{taxNexusRows.length === 0 ? <tr><td colSpan={3}>No nexus rows.</td></tr> : taxNexusRows.map((n) => <tr key={n.id}><td>{n.outlet_name}</td><td>{n.jurisdiction_code}</td><td>{n.region_name}</td></tr>)}</tbody></table>
            <h4>Payroll Schedules & Components</h4>
            <table><thead><tr><th>Name</th><th>Frequency</th><th>Next Pay Date</th><th>Active</th></tr></thead><tbody>{payrollSchedules.length === 0 ? <tr><td colSpan={4}>No schedules.</td></tr> : payrollSchedules.map((s) => <tr key={s.id}><td>{s.schedule_name}</td><td>{s.frequency}</td><td>{String(s.next_pay_date || '').slice(0, 10)}</td><td>{s.active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Name</th><th>Type</th><th>Calc</th><th>Default</th></tr></thead><tbody>{payrollComponents.length === 0 ? <tr><td colSpan={4}>No components.</td></tr> : payrollComponents.map((c) => <tr key={c.id}><td>{c.component_name}</td><td>{c.component_type}</td><td>{c.calc_type}</td><td>{Number(c.default_value || 0)}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'controls' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Approval Policies + Requests</h3>
            <div className="grid two">
              <label>Entity<select value={approvalPolicyForm.entityType} onChange={(e) => setApprovalPolicyForm((p) => ({ ...p, entityType: e.target.value }))}><option value="INVOICE">INVOICE</option><option value="BILL">BILL</option><option value="PURCHASE_ORDER">PURCHASE_ORDER</option><option value="PAYROLL_RUN">PAYROLL_RUN</option></select></label>
              <label>Threshold<input type="number" min="0" step="0.01" value={approvalPolicyForm.thresholdAmount} onChange={(e) => setApprovalPolicyForm((p) => ({ ...p, thresholdAmount: e.target.value }))} /></label>
              <label>Approver Role<select value={approvalPolicyForm.approverRole} onChange={(e) => setApprovalPolicyForm((p) => ({ ...p, approverRole: e.target.value }))}><option value="FINANCE">FINANCE</option><option value="SUPER_USER">SUPER_USER</option></select></label>
              <label><input type="checkbox" checked={approvalPolicyForm.active} onChange={(e) => setApprovalPolicyForm((p) => ({ ...p, active: e.target.checked }))} /> Active</label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createAccountingApprovalPolicy}>Create Policy</button></div>
            <hr />
            <div className="grid two">
              <label>Entity<select value={approvalRequestForm.entityType} onChange={(e) => setApprovalRequestForm((p) => ({ ...p, entityType: e.target.value }))}><option value="INVOICE">INVOICE</option><option value="BILL">BILL</option><option value="PURCHASE_ORDER">PURCHASE_ORDER</option><option value="PAYROLL_RUN">PAYROLL_RUN</option></select></label>
              <label>Entity ID<input type="number" min="1" value={approvalRequestForm.entityId} onChange={(e) => setApprovalRequestForm((p) => ({ ...p, entityId: e.target.value }))} /></label>
              <label>Amount<input type="number" min="0" step="0.01" value={approvalRequestForm.thresholdAmount} onChange={(e) => setApprovalRequestForm((p) => ({ ...p, thresholdAmount: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={requestAccountingApprovalFlow}>Request Approval</button></div>
            <hr />
            <h4>Decision</h4>
            <div className="grid two">
              <label>Approval ID<input type="number" min="1" value={approvalDecisionForm.approvalId} onChange={(e) => setApprovalDecisionForm((p) => ({ ...p, approvalId: e.target.value }))} /></label>
              <label>Status<select value={approvalDecisionForm.status} onChange={(e) => setApprovalDecisionForm((p) => ({ ...p, status: e.target.value }))}><option value="APPROVED">APPROVED</option><option value="REJECTED">REJECTED</option><option value="CANCELLED">CANCELLED</option></select></label>
              <label>Note<input value={approvalDecisionForm.decisionNote} onChange={(e) => setApprovalDecisionForm((p) => ({ ...p, decisionNote: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={decideAccountingApprovalFlow}>Submit Decision</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Policies, Queue, Audit</h3>
            <table><thead><tr><th>Entity</th><th>Threshold</th><th>Role</th><th>Active</th></tr></thead><tbody>{approvalPolicies.length === 0 ? <tr><td colSpan={4}>No policies.</td></tr> : approvalPolicies.map((p) => <tr key={p.id}><td>{p.entity_type}</td><td>{money(p.threshold_amount)}</td><td>{p.approver_role}</td><td>{p.active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Entity</th><th>ID</th><th>Status</th><th>Requested By</th><th>Approver</th></tr></thead><tbody>{accountingApprovals.length === 0 ? <tr><td colSpan={5}>No approvals.</td></tr> : accountingApprovals.map((a) => <tr key={a.id}><td>{a.entity_type}</td><td>{a.entity_id}</td><td>{a.status}</td><td>{a.requested_by_name || '-'}</td><td>{a.approver_name || '-'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Area</th><th>Action</th><th>Entity</th><th>When</th></tr></thead><tbody>{auditLogs.length === 0 ? <tr><td colSpan={4}>No audit logs.</td></tr> : auditLogs.slice(0, 25).map((a) => <tr key={a.id}><td>{a.area}</td><td>{a.action}</td><td>{a.entity_type}</td><td>{String(a.performed_at || '').slice(0, 19).replace('T', ' ')}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'close_books' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Close Books Workflow</h3>
            <div className="grid two">
              <label>Period Month<input type="month" value={closeBookForm.periodMonth} onChange={(e) => setCloseBookForm((p) => ({ ...p, periodMonth: e.target.value ? `${e.target.value}-01` : '' }))} /></label>
              <label className="finance-ledger-notes">Checklist JSON<textarea rows={5} value={closeBookForm.checklistJson} onChange={(e) => setCloseBookForm((p) => ({ ...p, checklistJson: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={upsertCloseBooks}>Save Period Checklist</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Close Books Periods</h3>
            <table><thead><tr><th>Period</th><th>Status</th><th>Closed By</th><th>Closed At</th><th>Action</th></tr></thead><tbody>{closeBookPeriods.length === 0 ? <tr><td colSpan={5}>No close books periods.</td></tr> : closeBookPeriods.map((p) => <tr key={p.id}><td>{String(p.period_month || '').slice(0, 10)}</td><td>{p.status}</td><td>{p.closed_by_name || '-'}</td><td>{p.closed_at ? String(p.closed_at).slice(0, 19).replace('T', ' ') : '-'}</td><td className="actions-cell">{p.status === 'OPEN' ? <button type="button" onClick={() => closeBooksPeriodNow(p.id)}>Close</button> : <button type="button" className="button-secondary" onClick={() => reopenBooksPeriodNow(p.id)}>Reopen</button>}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'assets_fx' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Fixed Assets + FX Center</h3>
            <div className="grid two">
              <label>Asset Code<input value={fixedAssetForm.assetCode} onChange={(e) => setFixedAssetForm((p) => ({ ...p, assetCode: e.target.value }))} /></label>
              <label>Asset Name<input value={fixedAssetForm.assetName} onChange={(e) => setFixedAssetForm((p) => ({ ...p, assetName: e.target.value }))} /></label>
              <label>Category<input value={fixedAssetForm.category} onChange={(e) => setFixedAssetForm((p) => ({ ...p, category: e.target.value }))} /></label>
              <label>Purchase Date<input type="date" value={fixedAssetForm.purchaseDate} onChange={(e) => setFixedAssetForm((p) => ({ ...p, purchaseDate: e.target.value }))} /></label>
              <label>Cost<input type="number" min="0" step="0.01" value={fixedAssetForm.cost} onChange={(e) => setFixedAssetForm((p) => ({ ...p, cost: e.target.value }))} /></label>
              <label>Salvage<input type="number" min="0" step="0.01" value={fixedAssetForm.salvageValue} onChange={(e) => setFixedAssetForm((p) => ({ ...p, salvageValue: e.target.value }))} /></label>
              <label>Life (months)<input type="number" min="1" value={fixedAssetForm.usefulLifeMonths} onChange={(e) => setFixedAssetForm((p) => ({ ...p, usefulLifeMonths: e.target.value }))} /></label>
              <label>Currency<input value={fixedAssetForm.currencyCode} onChange={(e) => setFixedAssetForm((p) => ({ ...p, currencyCode: e.target.value.toUpperCase() }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createFixedAssetRecord}>Create Asset</button></div>
            <hr />
            <div className="grid two">
              <label>Depreciation Period<input type="month" value={depreciationForm.periodMonth ? depreciationForm.periodMonth.slice(0, 7) : ''} onChange={(e) => setDepreciationForm((p) => ({ ...p, periodMonth: e.target.value ? `${e.target.value}-01` : '' }))} /></label>
              <label>Asset (optional)<select value={depreciationForm.assetId} onChange={(e) => setDepreciationForm((p) => ({ ...p, assetId: e.target.value }))}><option value="">All assets</option>{fixedAssets.map((a) => <option key={a.id} value={a.id}>{a.asset_code} - {a.asset_name}</option>)}</select></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={runDepreciationNow}>Run Depreciation</button></div>
            <hr />
            <div className="grid two">
              <label>FX Currency<input value={fxRateForm.currencyCode} onChange={(e) => setFxRateForm((p) => ({ ...p, currencyCode: e.target.value.toUpperCase() }))} /></label>
              <label>Rate Date<input type="date" value={fxRateForm.rateDate} onChange={(e) => setFxRateForm((p) => ({ ...p, rateDate: e.target.value }))} /></label>
              <label>Rate to USD<input type="number" min="0.00000001" step="0.00000001" value={fxRateForm.rateToUsd} onChange={(e) => setFxRateForm((p) => ({ ...p, rateToUsd: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={upsertFxRateRecord}>Save FX Rate</button></div>
            <div className="grid two">
              <label>Revaluation Date<input type="date" value={fxRevalForm.periodEndDate} onChange={(e) => setFxRevalForm((p) => ({ ...p, periodEndDate: e.target.value }))} /></label>
              <label>Currency<input value={fxRevalForm.currencyCode} onChange={(e) => setFxRevalForm((p) => ({ ...p, currencyCode: e.target.value.toUpperCase() }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={runFxRevaluationNow}>Run FX Revaluation</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Assets, Depreciation, FX</h3>
            <table><thead><tr><th>Code</th><th>Name</th><th>Cost</th><th>Accum Dep</th><th>NBV</th><th>Status</th></tr></thead><tbody>{fixedAssets.length === 0 ? <tr><td colSpan={6}>No fixed assets.</td></tr> : fixedAssets.map((a) => <tr key={a.id}><td>{a.asset_code}</td><td>{a.asset_name}</td><td>{money(a.cost)}</td><td>{money(a.accumulated_depreciation)}</td><td>{money(a.net_book_value)}</td><td>{a.status}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Period</th><th>Asset</th><th>Amount</th><th>Posted</th></tr></thead><tbody>{depreciationRuns.length === 0 ? <tr><td colSpan={4}>No depreciation runs.</td></tr> : depreciationRuns.slice(0, 20).map((r) => <tr key={r.id}><td>{String(r.period_month || '').slice(0, 10)}</td><td>{r.asset_name}</td><td>{money(r.depreciation_amount)}</td><td>{String(r.posted_at || '').slice(0, 19).replace('T', ' ')}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Currency</th><th>Date</th><th>Rate</th></tr></thead><tbody>{fxRates.length === 0 ? <tr><td colSpan={3}>No FX rates.</td></tr> : fxRates.slice(0, 20).map((r) => <tr key={r.id}><td>{r.currency_code}</td><td>{String(r.rate_date || '').slice(0, 10)}</td><td>{Number(r.rate_to_usd || 0)}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Date</th><th>CCY</th><th>Open Amt</th><th>Gain/Loss</th></tr></thead><tbody>{fxRevaluations.length === 0 ? <tr><td colSpan={4}>No revaluations.</td></tr> : fxRevaluations.slice(0, 20).map((r) => <tr key={r.id}><td>{String(r.period_end_date || '').slice(0, 10)}</td><td>{r.currency_code}</td><td>{money(r.open_amount)}</td><td>{money(r.unrealized_gain_loss)}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'collections' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>AR Collections Workflow</h3>
            <div className="grid two">
              <label>Min Overdue Days<input type="number" min="1" value={collectionForm.minOverdueDays} onChange={(e) => setCollectionForm((p) => ({ ...p, minOverdueDays: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={runArCollectionsNow}>Run Collections Sweep</button></div>
            <hr />
            <h4>Disputes / Credit Memos / Refunds</h4>
            <div className="grid two">
              <label>Dispute Invoice<select value={disputeForm.invoiceId} onChange={(e) => setDisputeForm((p) => ({ ...p, invoiceId: e.target.value }))}><option value="">Select invoice</option>{invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number}</option>)}</select></label>
              <label>Dispute Reason<input value={disputeForm.disputeReason} onChange={(e) => setDisputeForm((p) => ({ ...p, disputeReason: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createDisputeNow}>Create Dispute</button></div>
            <div className="grid two">
              <label>Memo Invoice<select value={creditMemoForm.invoiceId} onChange={(e) => setCreditMemoForm((p) => ({ ...p, invoiceId: e.target.value, accountId: p.accountId }))}><option value="">Optional</option>{invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number}</option>)}</select></label>
              <label>Memo Account<select value={creditMemoForm.accountId} onChange={(e) => setCreditMemoForm((p) => ({ ...p, accountId: e.target.value }))}><option value="">Select account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.customer_name}</option>)}</select></label>
              <label>Memo Amount<input type="number" min="0.01" step="0.01" value={creditMemoForm.amount} onChange={(e) => setCreditMemoForm((p) => ({ ...p, amount: e.target.value }))} /></label>
              <label>Memo Reason<input value={creditMemoForm.reason} onChange={(e) => setCreditMemoForm((p) => ({ ...p, reason: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={createCreditMemoNow}>Create Credit Memo</button></div>
            <div className="grid two">
              <label>Refund Memo<select value={refundForm.creditMemoId} onChange={(e) => setRefundForm((p) => ({ ...p, creditMemoId: e.target.value }))}><option value="">Select memo</option>{creditMemos.map((m) => <option key={m.id} value={m.id}>{m.memo_number}</option>)}</select></label>
              <label>Refund Amount<input type="number" min="0.01" step="0.01" value={refundForm.amount} onChange={(e) => setRefundForm((p) => ({ ...p, amount: e.target.value }))} /></label>
              <label>Refund Date<input type="date" value={refundForm.refundDate} onChange={(e) => setRefundForm((p) => ({ ...p, refundDate: e.target.value }))} /></label>
              <label>Payment Account<select value={refundForm.paymentAccountId} onChange={(e) => setRefundForm((p) => ({ ...p, paymentAccountId: e.target.value }))}><option value="">Optional</option>{paymentAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
              <label>Reference<input value={refundForm.referenceNo} onChange={(e) => setRefundForm((p) => ({ ...p, referenceNo: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createRefundNow}>Create Refund</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Collections Runs + Items</h3>
            <table><thead><tr><th>Run Date</th><th>Min Days</th><th>Generated</th></tr></thead><tbody>{collectionRuns.length === 0 ? <tr><td colSpan={3}>No runs.</td></tr> : collectionRuns.map((r) => <tr key={r.id}><td>{String(r.run_date || '').slice(0, 10)}</td><td>{r.min_overdue_days}</td><td>{r.generated_count}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Invoice</th><th>Customer</th><th>Days</th><th>Balance</th><th>Level</th></tr></thead><tbody>{collectionItems.length === 0 ? <tr><td colSpan={5}>No collection items.</td></tr> : collectionItems.slice(0, 30).map((i) => <tr key={i.id}><td>{i.invoice_number}</td><td>{i.customer_name}</td><td>{i.days_overdue}</td><td>{money(i.balance_due)}</td><td>{i.reminder_level}</td></tr>)}</tbody></table>
            <h4>AR Disputes</h4>
            <table><thead><tr><th>Invoice</th><th>Customer</th><th>Status</th><th>Reason</th></tr></thead><tbody>{arDisputes.length === 0 ? <tr><td colSpan={4}>No disputes.</td></tr> : arDisputes.slice(0, 20).map((d) => <tr key={d.id}><td>{d.invoice_number}</td><td>{d.customer_name}</td><td>{d.status}</td><td>{d.dispute_reason}</td></tr>)}</tbody></table>
            <h4>Credit Memos</h4>
            <table><thead><tr><th>Memo</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead><tbody>{creditMemos.length === 0 ? <tr><td colSpan={4}>No credit memos.</td></tr> : creditMemos.slice(0, 20).map((m) => <tr key={m.id}><td>{m.memo_number}</td><td>{m.customer_name}</td><td>{money(m.amount)}</td><td>{m.status}</td></tr>)}</tbody></table>
            <h4>Refunds</h4>
            <table><thead><tr><th>Memo</th><th>Date</th><th>Amount</th><th>Account</th></tr></thead><tbody>{refunds.length === 0 ? <tr><td colSpan={4}>No refunds.</td></tr> : refunds.slice(0, 20).map((r) => <tr key={r.id}><td>{r.memo_number}</td><td>{String(r.refund_date || '').slice(0, 10)}</td><td>{money(r.amount)}</td><td>{r.payment_account_name || '-'}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'phase2_ops' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Phase 2 Operations</h3>
            <h4>Multi-Currency + Settlement</h4>
            <div className="grid two">
              <label>Source Type<select value={mcForm.sourceType} onChange={(e) => setMcForm((p) => ({ ...p, sourceType: e.target.value }))}><option value="JOURNAL">JOURNAL</option><option value="INVOICE">INVOICE</option><option value="BILL">BILL</option><option value="PAYMENT">PAYMENT</option></select></label>
              <label>Source Id<input type="number" min="1" value={mcForm.sourceId} onChange={(e) => setMcForm((p) => ({ ...p, sourceId: e.target.value }))} /></label>
              <label>Side<select value={mcForm.entrySide} onChange={(e) => setMcForm((p) => ({ ...p, entrySide: e.target.value }))}><option value="DEBIT">DEBIT</option><option value="CREDIT">CREDIT</option></select></label>
              <label>Currency<input value={mcForm.currencyCode} onChange={(e) => setMcForm((p) => ({ ...p, currencyCode: e.target.value.toUpperCase() }))} /></label>
              <label>Amount Foreign<input type="number" min="0.01" step="0.01" value={mcForm.amountForeign} onChange={(e) => setMcForm((p) => ({ ...p, amountForeign: e.target.value }))} /></label>
              <label>FX Rate<input type="number" min="0.00000001" step="0.00000001" value={mcForm.fxRateToUsd} onChange={(e) => setMcForm((p) => ({ ...p, fxRateToUsd: e.target.value }))} /></label>
              <label>Entry Date<input type="date" value={mcForm.entryDate} onChange={(e) => setMcForm((p) => ({ ...p, entryDate: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createMcEntryNow}>Post MC Entry</button></div>
            <div className="grid two">
              <label>Settle Currency<input value={fxSettlementForm.currencyCode} onChange={(e) => setFxSettlementForm((p) => ({ ...p, currencyCode: e.target.value.toUpperCase() }))} /></label>
              <label>Settlement Date<input type="date" value={fxSettlementForm.settlementDate} onChange={(e) => setFxSettlementForm((p) => ({ ...p, settlementDate: e.target.value }))} /></label>
              <label>Amount Foreign<input type="number" min="0.01" step="0.01" value={fxSettlementForm.amountForeign} onChange={(e) => setFxSettlementForm((p) => ({ ...p, amountForeign: e.target.value }))} /></label>
              <label>Booked Rate<input type="number" min="0.00000001" step="0.00000001" value={fxSettlementForm.bookedRate} onChange={(e) => setFxSettlementForm((p) => ({ ...p, bookedRate: e.target.value }))} /></label>
              <label>Settlement Rate<input type="number" min="0.00000001" step="0.00000001" value={fxSettlementForm.settlementRate} onChange={(e) => setFxSettlementForm((p) => ({ ...p, settlementRate: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={runFxSettlementNow}>Run FX Settlement</button></div>
            <hr />
            <h4>Fixed Asset Lifecycle</h4>
            <div className="grid two">
              <label>Asset<select value={assetEventForm.assetId} onChange={(e) => setAssetEventForm((p) => ({ ...p, assetId: e.target.value }))}><option value="">Select asset</option>{fixedAssets.map((a) => <option key={a.id} value={a.id}>{a.asset_code} - {a.asset_name}</option>)}</select></label>
              <label>Event<select value={assetEventForm.eventType} onChange={(e) => setAssetEventForm((p) => ({ ...p, eventType: e.target.value }))}><option value="IMPAIRMENT">IMPAIRMENT</option><option value="TRANSFER">TRANSFER</option><option value="DISPOSAL">DISPOSAL</option></select></label>
              <label>Date<input type="date" value={assetEventForm.eventDate} onChange={(e) => setAssetEventForm((p) => ({ ...p, eventDate: e.target.value }))} /></label>
              <label>Amount<input type="number" min="0" step="0.01" value={assetEventForm.amount} onChange={(e) => setAssetEventForm((p) => ({ ...p, amount: e.target.value }))} /></label>
              <label>Note<input value={assetEventForm.note} onChange={(e) => setAssetEventForm((p) => ({ ...p, note: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createAssetEventNow}>Post Asset Event</button></div>
            <hr />
            <h4>Month-End Workspace</h4>
            <div className="grid two">
              <label>Period Month<input type="month" value={monthEndWorkspaceForm.periodMonth ? monthEndWorkspaceForm.periodMonth.slice(0, 7) : ''} onChange={(e) => setMonthEndWorkspaceForm((p) => ({ ...p, periodMonth: e.target.value ? `${e.target.value}-01` : '' }))} /></label>
              <label>Owner<select value={monthEndWorkspaceForm.ownerId} onChange={(e) => setMonthEndWorkspaceForm((p) => ({ ...p, ownerId: e.target.value }))}><option value="">Optional</option>{payrollProfiles.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></label>
              <label>Notes<input value={monthEndWorkspaceForm.notes} onChange={(e) => setMonthEndWorkspaceForm((p) => ({ ...p, notes: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createMonthEndWorkspaceNow}>Save Workspace</button></div>
            <div className="grid two">
              <label>Task Workspace<select value={monthEndTaskForm.workspaceId} onChange={(e) => setMonthEndTaskForm((p) => ({ ...p, workspaceId: e.target.value }))}><option value="">Select workspace</option>{monthEndWorkspaces.map((w) => <option key={w.id} value={w.id}>{String(w.period_month).slice(0, 10)}</option>)}</select></label>
              <label>Task Name<input value={monthEndTaskForm.taskName} onChange={(e) => setMonthEndTaskForm((p) => ({ ...p, taskName: e.target.value }))} /></label>
              <label>Due Date<input type="date" value={monthEndTaskForm.dueDate} onChange={(e) => setMonthEndTaskForm((p) => ({ ...p, dueDate: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={createMonthEndTaskNow}>Create Task</button></div>
            <hr />
            <h4>Adjusting Entries</h4>
            <div className="grid two">
              <label>Workspace<select value={adjustingForm.workspaceId} onChange={(e) => setAdjustingForm((p) => ({ ...p, workspaceId: e.target.value }))}><option value="">Select workspace</option>{monthEndWorkspaces.map((w) => <option key={w.id} value={w.id}>{String(w.period_month).slice(0, 10)}</option>)}</select></label>
              <label>Entry Date<input type="date" value={adjustingForm.entryDate} onChange={(e) => setAdjustingForm((p) => ({ ...p, entryDate: e.target.value }))} /></label>
              <label>Description<input value={adjustingForm.description} onChange={(e) => setAdjustingForm((p) => ({ ...p, description: e.target.value }))} /></label>
              <label>Debit<select value={adjustingForm.debitAccountId} onChange={(e) => setAdjustingForm((p) => ({ ...p, debitAccountId: e.target.value }))}><option value="">Optional</option>{coaAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></label>
              <label>Credit<select value={adjustingForm.creditAccountId} onChange={(e) => setAdjustingForm((p) => ({ ...p, creditAccountId: e.target.value }))}><option value="">Optional</option>{coaAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}</select></label>
              <label>Amount<input type="number" min="0.01" step="0.01" value={adjustingForm.amount} onChange={(e) => setAdjustingForm((p) => ({ ...p, amount: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createAdjustingEntryNow}>Create Adjusting Entry</button></div>
            <div className="grid two">
              <label>Entry ID<input type="number" min="1" value={adjustingDecisionForm.entryId} onChange={(e) => setAdjustingDecisionForm((p) => ({ ...p, entryId: e.target.value }))} /></label>
              <label>Status<select value={adjustingDecisionForm.status} onChange={(e) => setAdjustingDecisionForm((p) => ({ ...p, status: e.target.value }))}><option value="APPROVED">APPROVED</option><option value="REJECTED">REJECTED</option><option value="POSTED">POSTED</option></select></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={decideAdjustingEntryNow}>Decide Entry</button></div>
            <hr />
            <h4>Filing Calendar</h4>
            <div className="grid two">
              <label>Type<select value={filingCalForm.filingType} onChange={(e) => setFilingCalForm((p) => ({ ...p, filingType: e.target.value }))}><option value="SALES_TAX">SALES_TAX</option><option value="PAYROLL_TAX">PAYROLL_TAX</option><option value="INCOME_TAX">INCOME_TAX</option><option value="OTHER">OTHER</option></select></label>
              <label>Authority<input value={filingCalForm.authority} onChange={(e) => setFilingCalForm((p) => ({ ...p, authority: e.target.value }))} /></label>
              <label>Period<input value={filingCalForm.periodLabel} onChange={(e) => setFilingCalForm((p) => ({ ...p, periodLabel: e.target.value }))} /></label>
              <label>Due Date<input type="date" value={filingCalForm.dueDate} onChange={(e) => setFilingCalForm((p) => ({ ...p, dueDate: e.target.value }))} /></label>
              <label>Amount Due<input type="number" min="0" step="0.01" value={filingCalForm.amountDue} onChange={(e) => setFilingCalForm((p) => ({ ...p, amountDue: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createFilingCalendarNow}>Create Filing</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Phase 2 Logs</h3>
            <table><thead><tr><th>Date</th><th>Source</th><th>CCY</th><th>Foreign</th><th>Base</th></tr></thead><tbody>{mcEntries.length === 0 ? <tr><td colSpan={5}>No multicurrency entries.</td></tr> : mcEntries.slice(0, 20).map((e) => <tr key={e.id}><td>{String(e.entry_date || '').slice(0, 10)}</td><td>{e.source_type}</td><td>{e.currency_code}</td><td>{money(e.amount_foreign)}</td><td>{money(e.amount_base)}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Date</th><th>CCY</th><th>Amount</th><th>Gain/Loss</th></tr></thead><tbody>{fxSettlements.length === 0 ? <tr><td colSpan={4}>No settlements.</td></tr> : fxSettlements.slice(0, 20).map((s) => <tr key={s.id}><td>{String(s.settlement_date || '').slice(0, 10)}</td><td>{s.currency_code}</td><td>{money(s.amount_foreign)}</td><td>{money(s.realized_gain_loss)}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Date</th><th>Asset</th><th>Event</th><th>Amount</th></tr></thead><tbody>{fixedAssetEvents.length === 0 ? <tr><td colSpan={4}>No asset events.</td></tr> : fixedAssetEvents.slice(0, 20).map((e) => <tr key={e.id}><td>{String(e.event_date || '').slice(0, 10)}</td><td>{e.asset_name}</td><td>{e.event_type}</td><td>{money(e.amount)}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Period</th><th>Status</th><th>Owner</th></tr></thead><tbody>{monthEndWorkspaces.length === 0 ? <tr><td colSpan={3}>No workspaces.</td></tr> : monthEndWorkspaces.slice(0, 20).map((w) => <tr key={w.id}><td>{String(w.period_month || '').slice(0, 10)}</td><td>{w.status}</td><td>{w.owner_name || '-'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Task</th><th>Status</th><th>Assignee</th><th>Action</th></tr></thead><tbody>{monthEndTasks.length === 0 ? <tr><td colSpan={4}>No tasks.</td></tr> : monthEndTasks.slice(0, 20).map((t) => <tr key={t.id}><td>{t.task_name}</td><td>{t.status}</td><td>{t.assignee_name || '-'}</td><td className="actions-cell"><button type="button" className="button-secondary" onClick={() => markMonthEndTask(t.id, 'IN_PROGRESS')}>Start</button><button type="button" onClick={() => markMonthEndTask(t.id, 'DONE')}>Done</button></td></tr>)}</tbody></table>
            <table><thead><tr><th>ID</th><th>Description</th><th>Amount</th><th>Status</th></tr></thead><tbody>{adjustingEntries.length === 0 ? <tr><td colSpan={4}>No adjusting entries.</td></tr> : adjustingEntries.slice(0, 20).map((a) => <tr key={a.id}><td>{a.id}</td><td>{a.description}</td><td>{money(a.amount)}</td><td>{a.status}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Type</th><th>Authority</th><th>Period</th><th>Due</th><th>Status</th><th>Action</th></tr></thead><tbody>{filingCalendarRows.length === 0 ? <tr><td colSpan={6}>No filing rows.</td></tr> : filingCalendarRows.slice(0, 20).map((f) => <tr key={f.id}><td>{f.filing_type}</td><td>{f.authority}</td><td>{f.period_label}</td><td>{String(f.due_date || '').slice(0, 10)}</td><td>{f.status}</td><td className="actions-cell"><button type="button" className="button-secondary" onClick={() => markFilingStatus(f.id, 'FILED')}>Filed</button><button type="button" onClick={() => markFilingStatus(f.id, 'PAID')}>Paid</button></td></tr>)}</tbody></table>
            <hr />
            <h4>Maturity Automation</h4>
            <div className="grid two">
              <label>Job Type<input value={opsJobForm.jobType} onChange={(e) => setOpsJobForm((p) => ({ ...p, jobType: e.target.value }))} /></label>
              <label className="finance-ledger-notes">Job Payload JSON<textarea rows={3} value={opsJobForm.payloadJson} onChange={(e) => setOpsJobForm((p) => ({ ...p, payloadJson: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createOpsJobNow}>Queue Ops Job</button></div>
            <table><thead><tr><th>ID</th><th>Type</th><th>Status</th><th>Attempts</th><th>Action</th></tr></thead><tbody>{opsJobs.length === 0 ? <tr><td colSpan={5}>No ops jobs.</td></tr> : opsJobs.slice(0, 20).map((j) => <tr key={j.id}><td>{j.id}</td><td>{j.job_type}</td><td>{j.status}</td><td>{j.attempts}</td><td>{j.status !== 'COMPLETED' ? <button type="button" onClick={() => runOpsJobNow(j.id)}>Run</button> : '-'}</td></tr>)}</tbody></table>
            <div className="grid two">
              <label>Retry Import Run Id<input type="number" min="1" value={retryForm.importRunId} onChange={(e) => setRetryForm((p) => ({ ...p, importRunId: e.target.value }))} /></label>
              <label>Retry Reason<input value={retryForm.reason} onChange={(e) => setRetryForm((p) => ({ ...p, reason: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={queueRetryNow}>Queue Retry</button></div>
            <table><thead><tr><th>ID</th><th>Run</th><th>Status</th><th>Attempts</th><th>Action</th></tr></thead><tbody>{retryQueue.length === 0 ? <tr><td colSpan={5}>No retry queue.</td></tr> : retryQueue.slice(0, 20).map((r) => <tr key={r.id}><td>{r.id}</td><td>{r.import_run_id}</td><td>{r.status}</td><td>{r.attempts}</td><td>{r.status !== 'DONE' ? <button type="button" onClick={() => runRetryNow(r.id)}>Run</button> : '-'}</td></tr>)}</tbody></table>
            <div className="grid two">
              <label>Tax Return Type<select value={taxReturnForm.filingType} onChange={(e) => setTaxReturnForm((p) => ({ ...p, filingType: e.target.value }))}><option value="SALES_TAX">SALES_TAX</option><option value="PAYROLL_TAX">PAYROLL_TAX</option><option value="INCOME_TAX">INCOME_TAX</option><option value="OTHER">OTHER</option></select></label>
              <label>Authority<input value={taxReturnForm.authority} onChange={(e) => setTaxReturnForm((p) => ({ ...p, authority: e.target.value }))} /></label>
              <label>Period Start<input type="date" value={taxReturnForm.periodStart} onChange={(e) => setTaxReturnForm((p) => ({ ...p, periodStart: e.target.value }))} /></label>
              <label>Period End<input type="date" value={taxReturnForm.periodEnd} onChange={(e) => setTaxReturnForm((p) => ({ ...p, periodEnd: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createTaxReturnNow}>Generate Tax Return</button></div>
            <div className="grid two">
              <label>Tax Return Id<input type="number" min="1" value={taxReturnDecisionForm.taxReturnId} onChange={(e) => setTaxReturnDecisionForm((p) => ({ ...p, taxReturnId: e.target.value }))} /></label>
              <label>Status<select value={taxReturnDecisionForm.status} onChange={(e) => setTaxReturnDecisionForm((p) => ({ ...p, status: e.target.value }))}><option value="PREPARED">PREPARED</option><option value="FILED">FILED</option><option value="PAID">PAID</option><option value="VOID">VOID</option></select></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={updateTaxReturnNow}>Update Tax Return</button></div>
            <table><thead><tr><th>ID</th><th>Type</th><th>Authority</th><th>Tax Due</th><th>Status</th></tr></thead><tbody>{taxReturns.length === 0 ? <tr><td colSpan={5}>No tax returns.</td></tr> : taxReturns.slice(0, 20).map((t) => <tr key={t.id}><td>{t.id}</td><td>{t.filing_type}</td><td>{t.authority}</td><td>{money(t.tax_due)}</td><td>{t.status}</td></tr>)}</tbody></table>
            <div className="grid two">
              <label>Payroll Batch Period<input value={payrollBatchForm.periodLabel} onChange={(e) => setPayrollBatchForm((p) => ({ ...p, periodLabel: e.target.value }))} /></label>
              <label>Filing Authority<input value={payrollBatchForm.filingAuthority} onChange={(e) => setPayrollBatchForm((p) => ({ ...p, filingAuthority: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createPayrollBatchNow}>Create Payroll Batch</button></div>
            <table><thead><tr><th>Period</th><th>Authority</th><th>Runs</th><th>Tax</th><th>Status</th></tr></thead><tbody>{payrollBatches.length === 0 ? <tr><td colSpan={5}>No payroll batches.</td></tr> : payrollBatches.slice(0, 20).map((b) => <tr key={b.id}><td>{b.period_label}</td><td>{b.filing_authority}</td><td>{b.run_count}</td><td>{money(b.tax_amount)}</td><td>{b.status}</td></tr>)}</tbody></table>
            <div className="grid two">
              <label>Intent Entity<select value={paymentIntentForm.entityType} onChange={(e) => setPaymentIntentForm((p) => ({ ...p, entityType: e.target.value }))}><option value="INVOICE">INVOICE</option><option value="BILL">BILL</option></select></label>
              <label>Entity Id<input type="number" min="1" value={paymentIntentForm.entityId} onChange={(e) => setPaymentIntentForm((p) => ({ ...p, entityId: e.target.value }))} /></label>
              <label>Amount<input type="number" min="0.01" step="0.01" value={paymentIntentForm.intendedAmount} onChange={(e) => setPaymentIntentForm((p) => ({ ...p, intendedAmount: e.target.value }))} /></label>
              <label>Payment Date<input type="date" value={paymentIntentForm.paymentDate} onChange={(e) => setPaymentIntentForm((p) => ({ ...p, paymentDate: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createPaymentIntentNow}>Create Payment Intent</button></div>
            <div className="grid two">
              <label>Apply Intent Id<input type="number" min="1" value={paymentApplyForm.intentId} onChange={(e) => setPaymentApplyForm((p) => ({ ...p, intentId: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={applyPaymentIntentNow}>Auto Apply Payment</button></div>
            <table><thead><tr><th>ID</th><th>Entity</th><th>Amount</th><th>Status</th></tr></thead><tbody>{paymentIntents.length === 0 ? <tr><td colSpan={4}>No payment intents.</td></tr> : paymentIntents.slice(0, 20).map((p) => <tr key={p.id}><td>{p.id}</td><td>{p.entity_type}#{p.entity_id}</td><td>{money(p.intended_amount)}</td><td>{p.status}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Intent</th><th>Entity</th><th>Applied</th></tr></thead><tbody>{paymentAllocations.length === 0 ? <tr><td colSpan={3}>No allocations.</td></tr> : paymentAllocations.slice(0, 20).map((a) => <tr key={a.id}><td>{a.payment_intent_id}</td><td>{a.entity_type}#{a.entity_id}</td><td>{money(a.applied_amount)}</td></tr>)}</tbody></table>
            <div className="grid two">
              <label>Dunning Name<input value={dunningCampaignForm.campaignName} onChange={(e) => setDunningCampaignForm((p) => ({ ...p, campaignName: e.target.value }))} /></label>
              <label>Min Overdue Days<input type="number" min="1" value={dunningCampaignForm.minOverdueDays} onChange={(e) => setDunningCampaignForm((p) => ({ ...p, minOverdueDays: e.target.value }))} /></label>
              <label>Channel<select value={dunningCampaignForm.reminderChannel} onChange={(e) => setDunningCampaignForm((p) => ({ ...p, reminderChannel: e.target.value }))}><option value="EMAIL">EMAIL</option><option value="SMS">SMS</option><option value="IN_APP">IN_APP</option></select></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createDunningCampaignNow}>Save Dunning Campaign</button></div>
            <div className="grid two">
              <label>Run Campaign<select value={dunningRunForm.campaignId} onChange={(e) => setDunningRunForm((p) => ({ ...p, campaignId: e.target.value }))}><option value="">Select campaign</option>{dunningCampaigns.map((c) => <option key={c.id} value={c.id}>{c.campaign_name}</option>)}</select></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={runDunningCampaignNow}>Run Dunning Campaign</button></div>
            <table><thead><tr><th>Campaign</th><th>Min Days</th><th>Channel</th><th>Active</th></tr></thead><tbody>{dunningCampaigns.length === 0 ? <tr><td colSpan={4}>No campaigns.</td></tr> : dunningCampaigns.slice(0, 20).map((c) => <tr key={c.id}><td>{c.campaign_name}</td><td>{c.min_overdue_days}</td><td>{c.reminder_channel}</td><td>{c.active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Campaign</th><th>Date</th><th>Targeted</th><th>Status</th></tr></thead><tbody>{dunningRuns.length === 0 ? <tr><td colSpan={4}>No dunning runs.</td></tr> : dunningRuns.slice(0, 20).map((r) => <tr key={r.id}><td>{r.campaign_name}</td><td>{String(r.run_date || '').slice(0, 10)}</td><td>{r.targeted_count}</td><td>{r.status}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'final_100' && canAdvancedFinance && (
        <div className="grid two">
          <section className="card">
            <h3>Final Parity Controls</h3>
            <h4>Provider Bank Sync</h4>
            <div className="grid two">
              <label>Provider<input value={finalBankConnectionForm.providerName} onChange={(e) => setFinalBankConnectionForm((p) => ({ ...p, providerName: e.target.value }))} /></label>
              <label>Connector Label<input value={finalBankConnectionForm.connectorLabel} onChange={(e) => setFinalBankConnectionForm((p) => ({ ...p, connectorLabel: e.target.value }))} /></label>
              <label>Auth Mode<select value={finalBankConnectionForm.authMode} onChange={(e) => setFinalBankConnectionForm((p) => ({ ...p, authMode: e.target.value }))}><option value="OAUTH2">OAUTH2</option><option value="API_KEY">API_KEY</option></select></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createFinalBankConnectionNow}>Create Connection</button></div>
            <div className="grid two">
              <label>Sync Connection<select value={finalBankSyncForm.connectionId} onChange={(e) => setFinalBankSyncForm((p) => ({ ...p, connectionId: e.target.value }))}><option value="">Select connection</option>{finalBankConnections.map((c) => <option key={c.id} value={c.id}>{c.connector_label}</option>)}</select></label>
              <label>Imported<input type="number" min="0" value={finalBankSyncForm.importedCount} onChange={(e) => setFinalBankSyncForm((p) => ({ ...p, importedCount: e.target.value }))} /></label>
              <label>Failed<input type="number" min="0" value={finalBankSyncForm.failedCount} onChange={(e) => setFinalBankSyncForm((p) => ({ ...p, failedCount: e.target.value }))} /></label>
              <label>Webhook Ref<input value={finalBankSyncForm.webhookEventRef} onChange={(e) => setFinalBankSyncForm((p) => ({ ...p, webhookEventRef: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={runFinalBankSyncNow}>Run Sync</button></div>
            <hr />
            <h4>Payment Rails + Chargebacks</h4>
            <div className="grid two">
              <label>Gateway Name<input value={finalGatewayForm.gatewayName} onChange={(e) => setFinalGatewayForm((p) => ({ ...p, gatewayName: e.target.value }))} /></label>
              <label>Provider<input value={finalGatewayForm.provider} onChange={(e) => setFinalGatewayForm((p) => ({ ...p, provider: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createFinalGatewayNow}>Save Gateway</button></div>
            <div className="grid two">
              <label>Entity Type<select value={finalPaymentLinkForm.entityType} onChange={(e) => setFinalPaymentLinkForm((p) => ({ ...p, entityType: e.target.value }))}><option value="INVOICE">INVOICE</option><option value="BILL">BILL</option></select></label>
              <label>Entity Id<input type="number" min="1" value={finalPaymentLinkForm.entityId} onChange={(e) => setFinalPaymentLinkForm((p) => ({ ...p, entityId: e.target.value }))} /></label>
              <label>Gateway<select value={finalPaymentLinkForm.gatewayId} onChange={(e) => setFinalPaymentLinkForm((p) => ({ ...p, gatewayId: e.target.value }))}><option value="">Optional</option>{finalPaymentGateways.map((g) => <option key={g.id} value={g.id}>{g.gateway_name}</option>)}</select></label>
              <label>Amount<input type="number" min="0.01" step="0.01" value={finalPaymentLinkForm.amount} onChange={(e) => setFinalPaymentLinkForm((p) => ({ ...p, amount: e.target.value }))} /></label>
              <label>Currency<input value={finalPaymentLinkForm.currencyCode} onChange={(e) => setFinalPaymentLinkForm((p) => ({ ...p, currencyCode: e.target.value.toUpperCase() }))} /></label>
              <label>Expires<input type="datetime-local" value={finalPaymentLinkForm.expiresAt} onChange={(e) => setFinalPaymentLinkForm((p) => ({ ...p, expiresAt: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createFinalPaymentLinkNow}>Create Payment Link</button></div>
            <div className="grid two">
              <label>Capture Link Id<input type="number" min="1" value={finalCaptureForm.paymentLinkId} onChange={(e) => setFinalCaptureForm((p) => ({ ...p, paymentLinkId: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={captureFinalPaymentNow}>Capture Payment</button></div>
            <div className="grid two">
              <label>Chargeback Tx Id<input type="number" min="1" value={finalChargebackForm.paymentTransactionId} onChange={(e) => setFinalChargebackForm((p) => ({ ...p, paymentTransactionId: e.target.value }))} /></label>
              <label>Amount<input type="number" min="0.01" step="0.01" value={finalChargebackForm.amount} onChange={(e) => setFinalChargebackForm((p) => ({ ...p, amount: e.target.value }))} /></label>
              <label>Reason<input value={finalChargebackForm.reason} onChange={(e) => setFinalChargebackForm((p) => ({ ...p, reason: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createFinalChargebackNow}>Create Chargeback</button></div>
            <hr />
            <h4>Templates & Dispatch</h4>
            <div className="grid two">
              <label>Template Name<input value={finalDocTemplateForm.templateName} onChange={(e) => setFinalDocTemplateForm((p) => ({ ...p, templateName: e.target.value }))} /></label>
              <label>Doc Type<select value={finalDocTemplateForm.documentType} onChange={(e) => setFinalDocTemplateForm((p) => ({ ...p, documentType: e.target.value }))}><option value="INVOICE">INVOICE</option><option value="BILL">BILL</option><option value="STATEMENT">STATEMENT</option><option value="REMINDER">REMINDER</option></select></label>
              <label>Subject<input value={finalDocTemplateForm.subjectTemplate} onChange={(e) => setFinalDocTemplateForm((p) => ({ ...p, subjectTemplate: e.target.value }))} /></label>
              <label className="finance-ledger-notes">Body<textarea rows={3} value={finalDocTemplateForm.bodyTemplate} onChange={(e) => setFinalDocTemplateForm((p) => ({ ...p, bodyTemplate: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createFinalDocTemplateNow}>Save Template</button></div>
            <div className="grid two">
              <label>Template<select value={finalDocDispatchForm.templateId} onChange={(e) => setFinalDocDispatchForm((p) => ({ ...p, templateId: e.target.value }))}><option value="">Optional</option>{finalDocTemplates.map((t) => <option key={t.id} value={t.id}>{t.template_name}</option>)}</select></label>
              <label>Entity Type<input value={finalDocDispatchForm.entityType} onChange={(e) => setFinalDocDispatchForm((p) => ({ ...p, entityType: e.target.value }))} /></label>
              <label>Entity Id<input type="number" min="1" value={finalDocDispatchForm.entityId} onChange={(e) => setFinalDocDispatchForm((p) => ({ ...p, entityId: e.target.value }))} /></label>
              <label>Recipient<input value={finalDocDispatchForm.recipient} onChange={(e) => setFinalDocDispatchForm((p) => ({ ...p, recipient: e.target.value }))} /></label>
              <label>Channel<select value={finalDocDispatchForm.channel} onChange={(e) => setFinalDocDispatchForm((p) => ({ ...p, channel: e.target.value }))}><option value="EMAIL">EMAIL</option><option value="SMS">SMS</option><option value="IN_APP">IN_APP</option></select></label>
              <label className="finance-ledger-notes">Metadata JSON<textarea rows={2} value={finalDocDispatchForm.metadataJson} onChange={(e) => setFinalDocDispatchForm((p) => ({ ...p, metadataJson: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={dispatchFinalDocNow}>Dispatch</button></div>
            <hr />
            <h4>Accountant Collaboration + Statutory Rules</h4>
            <div className="grid two">
              <label>Practice Client<input value={finalPracticeClientForm.clientName} onChange={(e) => setFinalPracticeClientForm((p) => ({ ...p, clientName: e.target.value }))} /></label>
              <label>Legal Entity<input value={finalPracticeClientForm.legalEntity} onChange={(e) => setFinalPracticeClientForm((p) => ({ ...p, legalEntity: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createFinalPracticeClientNow}>Create Practice Client</button></div>
            <div className="grid two">
              <label>Client<select value={finalPracticeAccessForm.clientId} onChange={(e) => setFinalPracticeAccessForm((p) => ({ ...p, clientId: e.target.value }))}><option value="">Select client</option>{finalPracticeClients.map((c) => <option key={c.id} value={c.id}>{c.client_name}</option>)}</select></label>
              <label>User Id<input type="number" min="1" value={finalPracticeAccessForm.userId} onChange={(e) => setFinalPracticeAccessForm((p) => ({ ...p, userId: e.target.value }))} /></label>
              <label>Role<input value={finalPracticeAccessForm.roleLabel} onChange={(e) => setFinalPracticeAccessForm((p) => ({ ...p, roleLabel: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={grantFinalPracticeAccessNow}>Grant Access</button></div>
            <div className="grid two">
              <label>Exception Month<input type="month" value={finalPeriodExceptionForm.periodMonth ? finalPeriodExceptionForm.periodMonth.slice(0, 7) : ''} onChange={(e) => setFinalPeriodExceptionForm((p) => ({ ...p, periodMonth: e.target.value ? `${e.target.value}-01` : '' }))} /></label>
              <label>Type<select value={finalPeriodExceptionForm.exceptionType} onChange={(e) => setFinalPeriodExceptionForm((p) => ({ ...p, exceptionType: e.target.value }))}><option value="POST_CLOSE_JOURNAL">POST_CLOSE_JOURNAL</option><option value="BACKDATED_PAYMENT">BACKDATED_PAYMENT</option><option value="OTHER">OTHER</option></select></label>
              <label>Reason<input value={finalPeriodExceptionForm.reason} onChange={(e) => setFinalPeriodExceptionForm((p) => ({ ...p, reason: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={requestFinalPeriodExceptionNow}>Request Exception</button></div>
            <div className="grid two">
              <label>Exception Id<input type="number" min="1" value={finalPeriodDecisionForm.exceptionId} onChange={(e) => setFinalPeriodDecisionForm((p) => ({ ...p, exceptionId: e.target.value }))} /></label>
              <label>Status<select value={finalPeriodDecisionForm.status} onChange={(e) => setFinalPeriodDecisionForm((p) => ({ ...p, status: e.target.value }))}><option value="APPROVED">APPROVED</option><option value="REJECTED">REJECTED</option></select></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={decideFinalPeriodExceptionNow}>Decide Exception</button></div>
            <div className="grid two">
              <label>Tax Rule Name<input value={finalTaxRuleForm.ruleName} onChange={(e) => setFinalTaxRuleForm((p) => ({ ...p, ruleName: e.target.value }))} /></label>
              <label>Jurisdiction<input value={finalTaxRuleForm.jurisdictionCode} onChange={(e) => setFinalTaxRuleForm((p) => ({ ...p, jurisdictionCode: e.target.value }))} /></label>
              <label className="finance-ledger-notes">Rule JSON<textarea rows={2} value={finalTaxRuleForm.ruleJson} onChange={(e) => setFinalTaxRuleForm((p) => ({ ...p, ruleJson: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" onClick={createFinalTaxRuleNow}>Save Tax Rule</button></div>
            <div className="grid two">
              <label>Payroll Rule Name<input value={finalPayrollRuleForm.ruleName} onChange={(e) => setFinalPayrollRuleForm((p) => ({ ...p, ruleName: e.target.value }))} /></label>
              <label>Country<input value={finalPayrollRuleForm.countryCode} onChange={(e) => setFinalPayrollRuleForm((p) => ({ ...p, countryCode: e.target.value }))} /></label>
              <label className="finance-ledger-notes">Rule JSON<textarea rows={2} value={finalPayrollRuleForm.ruleJson} onChange={(e) => setFinalPayrollRuleForm((p) => ({ ...p, ruleJson: e.target.value }))} /></label>
            </div>
            <div className="actions-cell"><button type="button" className="button-secondary" onClick={createFinalPayrollRuleNow}>Save Payroll Rule</button></div>
          </section>
          <section className="card table-wrap">
            <h3>Final Parity Logs</h3>
            <table><thead><tr><th>Connection</th><th>Provider</th><th>Status</th><th>Last Sync</th></tr></thead><tbody>{finalBankConnections.length === 0 ? <tr><td colSpan={4}>No connections.</td></tr> : finalBankConnections.slice(0, 20).map((c) => <tr key={c.id}><td>{c.connector_label}</td><td>{c.provider_name}</td><td>{c.status}</td><td>{c.last_synced_at ? String(c.last_synced_at).slice(0, 19).replace('T', ' ') : '-'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Connection</th><th>Status</th><th>Imported</th><th>Failed</th></tr></thead><tbody>{finalBankSyncRuns.length === 0 ? <tr><td colSpan={4}>No sync runs.</td></tr> : finalBankSyncRuns.slice(0, 20).map((r) => <tr key={r.id}><td>{r.connector_label}</td><td>{r.run_status}</td><td>{r.imported_count}</td><td>{r.failed_count}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Gateway</th><th>Provider</th><th>Active</th></tr></thead><tbody>{finalPaymentGateways.length === 0 ? <tr><td colSpan={3}>No gateways.</td></tr> : finalPaymentGateways.slice(0, 20).map((g) => <tr key={g.id}><td>{g.gateway_name}</td><td>{g.provider}</td><td>{g.active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Link</th><th>Entity</th><th>Amount</th><th>Status</th></tr></thead><tbody>{finalPaymentLinks.length === 0 ? <tr><td colSpan={4}>No payment links.</td></tr> : finalPaymentLinks.slice(0, 20).map((l) => <tr key={l.id}><td>{l.link_code}</td><td>{l.entity_type}#{l.entity_id}</td><td>{money(l.amount)}</td><td>{l.status}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Txn Ref</th><th>Gateway</th><th>Amount</th><th>Status</th></tr></thead><tbody>{finalPaymentTxns.length === 0 ? <tr><td colSpan={4}>No payment txns.</td></tr> : finalPaymentTxns.slice(0, 20).map((t) => <tr key={t.id}><td>{t.transaction_ref}</td><td>{t.gateway_name || '-'}</td><td>{money(t.amount)}</td><td>{t.status}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Txn Id</th><th>Amount</th><th>Status</th><th>Reason</th></tr></thead><tbody>{finalChargebacks.length === 0 ? <tr><td colSpan={4}>No chargebacks.</td></tr> : finalChargebacks.slice(0, 20).map((c) => <tr key={c.id}><td>{c.payment_transaction_id}</td><td>{money(c.amount)}</td><td>{c.status}</td><td>{c.reason || '-'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Template</th><th>Type</th><th>Active</th></tr></thead><tbody>{finalDocTemplates.length === 0 ? <tr><td colSpan={3}>No templates.</td></tr> : finalDocTemplates.slice(0, 20).map((t) => <tr key={t.id}><td>{t.template_name}</td><td>{t.document_type}</td><td>{t.active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Template</th><th>Recipient</th><th>Channel</th><th>Status</th></tr></thead><tbody>{finalDocDispatchLogs.length === 0 ? <tr><td colSpan={4}>No dispatch logs.</td></tr> : finalDocDispatchLogs.slice(0, 20).map((d) => <tr key={d.id}><td>{d.template_name || '-'}</td><td>{d.recipient}</td><td>{d.channel}</td><td>{d.status}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Client</th><th>Legal Entity</th><th>Active</th></tr></thead><tbody>{finalPracticeClients.length === 0 ? <tr><td colSpan={3}>No practice clients.</td></tr> : finalPracticeClients.slice(0, 20).map((c) => <tr key={c.id}><td>{c.client_name}</td><td>{c.legal_entity || '-'}</td><td>{c.active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Client</th><th>User</th><th>Role</th></tr></thead><tbody>{finalPracticeAccess.length === 0 ? <tr><td colSpan={3}>No practice access.</td></tr> : finalPracticeAccess.slice(0, 20).map((a) => <tr key={a.id}><td>{a.client_name}</td><td>{a.full_name}</td><td>{a.role_label}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Month</th><th>Type</th><th>Status</th><th>Reason</th></tr></thead><tbody>{finalPeriodExceptions.length === 0 ? <tr><td colSpan={4}>No period exceptions.</td></tr> : finalPeriodExceptions.slice(0, 20).map((e) => <tr key={e.id}><td>{String(e.period_month || '').slice(0, 10)}</td><td>{e.exception_type}</td><td>{e.status}</td><td>{e.reason}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Tax Rule</th><th>Jurisdiction</th><th>Active</th></tr></thead><tbody>{finalTaxRules.length === 0 ? <tr><td colSpan={3}>No tax rules.</td></tr> : finalTaxRules.slice(0, 20).map((r) => <tr key={r.id}><td>{r.rule_name}</td><td>{r.jurisdiction_code || '-'}</td><td>{r.active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
            <table><thead><tr><th>Payroll Rule</th><th>Country</th><th>Active</th></tr></thead><tbody>{finalPayrollRules.length === 0 ? <tr><td colSpan={3}>No payroll rules.</td></tr> : finalPayrollRules.slice(0, 20).map((r) => <tr key={r.id}><td>{r.rule_name}</td><td>{r.country_code}</td><td>{r.active ? 'Yes' : 'No'}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
      {activeTab === 'settings' && ['FINANCE', 'SUPER_USER'].includes(user?.role) && (
        <>
          <div className="grid two finance-settings-grid">
            <section className="card">
              <h3>Finance Account Settings</h3>
              <p>Create one cash account and multiple bank/COD accounts.</p>
              <div className="finance-settings-form">
                <label>Account Name<input value={accountForm.name} onChange={(e) => setAccountForm((p) => ({ ...p, name: e.target.value }))} /></label>
                <label>
                  Type
                  <select value={accountForm.accountType} onChange={(e) => setAccountForm((p) => ({ ...p, accountType: e.target.value }))}>
                    <option value="BANK">BANK</option>
                    <option value="CASH">CASH</option>
                    <option value="COD">COD</option>
                  </select>
                </label>
                {accountForm.accountType === 'BANK' && (
                  <>
                    <label>Bank Name<input value={accountForm.bankName} onChange={(e) => setAccountForm((p) => ({ ...p, bankName: e.target.value }))} /></label>
                    <label>Account Number<input value={accountForm.accountNumber} onChange={(e) => setAccountForm((p) => ({ ...p, accountNumber: e.target.value }))} /></label>
                    <label>IBAN<input value={accountForm.iban} onChange={(e) => setAccountForm((p) => ({ ...p, iban: e.target.value }))} /></label>
                  </>
                )}
                {accountForm.accountType === 'COD' && (
                  <p className="finance-note">COD account created for cash-on-delivery collection tracking.</p>
                )}
                <label>
                  <input type="checkbox" checked={accountForm.isDefault} onChange={(e) => setAccountForm((p) => ({ ...p, isDefault: e.target.checked }))} />
                  {' '}Set as default
                </label>
              </div>
              <div className="actions-cell">
                <button type="button" onClick={createPaymentAccount}>Create Account</button>
              </div>
            </section>

            <section className="card">
              <h3>Account Overview</h3>
              <div className="finance-settings-summary">
                <article className="finance-pill"><strong>Total</strong><span>{paymentSummary.total}</span></article>
                <article className="finance-pill"><strong>Active</strong><span>{paymentSummary.active}</span></article>
                <article className="finance-pill"><strong>Bank</strong><span>{paymentSummary.bank}</span></article>
                <article className="finance-pill"><strong>Cash</strong><span>{paymentSummary.cash}</span></article>
                <article className="finance-pill"><strong>COD</strong><span>{paymentSummary.cod}</span></article>
                <article className="finance-pill"><strong>Default</strong><span>{paymentSummary.defaultName}</span></article>
              </div>
              <p className="finance-note">Default account is auto-selected in retail and finance payment forms.</p>
            </section>
          </div>

          <div className="card table-wrap">
            <h3>Payment Accounts</h3>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Bank</th>
                  <th>Account No</th>
                  <th>IBAN</th>
                  <th>Active</th>
                  <th>Default</th>
                </tr>
              </thead>
              <tbody>
                {paymentAccounts.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.account_type}</td>
                    <td>{a.bank_name || '-'}</td>
                    <td>{a.account_number || '-'}</td>
                    <td>{a.iban || '-'}</td>
                    <td>{a.is_active ? 'Yes' : 'No'}</td>
                    <td>{a.is_default ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {message && <p>{message}</p>}
        </>
      )}
      {activeTab === 'ledger' && (
        <>
      <div className="card filter-grid">
        <input
          placeholder="Search customer / number"
          value={filters.search}
          onChange={(e) => setFilters((p) => ({ ...p, search: e.target.value }))}
        />
        {!isOutletUser && (
          <input
            placeholder="Filter by outlet"
            value={filters.outlet}
            onChange={(e) => setFilters((p) => ({ ...p, outlet: e.target.value }))}
          />
        )}
      </div>

      <div className="grid two">
        <section className="card table-wrap">
          <h3>Customer Accounts</h3>
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Number</th>
                <th>Outlet</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  style={{ cursor: 'pointer', background: selectedId === a.id ? '#F3F4F6' : 'transparent' }}
                >
                  <td>{a.customer_name}</td>
                  <td>{a.customer_number}</td>
                  <td>{a.outlet_name}</td>
                  <td>{money(a.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h3>Customer Ledger</h3>
          {ledger.account ? (
            <>
              <p><strong>Name:</strong> {ledger.account.customer_name}</p>
              <p><strong>Number:</strong> {ledger.account.customer_number}</p>
              <p><strong>Outlet:</strong> {ledger.account.outlet_name}</p>
              <p><strong>Debit:</strong> {money(ledger.summary.total_debit)}</p>
              <p><strong>Credit:</strong> {money(ledger.summary.total_credit)}</p>
              <p><strong>Balance:</strong> {money(ledger.summary.balance)}</p>

              <div className="grid two finance-ledger-entry-grid">
                <label>
                  Date
                  <input
                    type="date"
                    value={entryForm.entryDate}
                    onChange={(e) => setEntryForm((p) => ({ ...p, entryDate: e.target.value }))}
                  />
                </label>
                <label>
                  Type
                  <select
                    value={entryForm.entryType}
                    onChange={(e) => setEntryForm((p) => ({ ...p, entryType: e.target.value }))}
                  >
                    <option value="CREDIT">CREDIT</option>
                    <option value="DEBIT">DEBIT</option>
                  </select>
                </label>
                <label>
                  Category
                  <select
                    value={entryForm.category}
                    onChange={(e) => setEntryForm((p) => ({ ...p, category: e.target.value }))}
                  >
                    <option value="RECEIPT">RECEIPT</option>
                    <option value="ADJUSTMENT">ADJUSTMENT</option>
                  </select>
                </label>
                <label>
                  Amount
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={entryForm.amount}
                    onChange={(e) => setEntryForm((p) => ({ ...p, amount: e.target.value }))}
                  />
                </label>
                <label>
                  Payment Account
                  <select
                    value={entryForm.paymentAccountId || ''}
                    onChange={(e) => setEntryForm((p) => ({ ...p, paymentAccountId: e.target.value }))}
                  >
                    <option value="">Select account</option>
                    {paymentAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>
                    ))}
                  </select>
                </label>
                <label>
                  Linked Order
                  <select
                    value={entryForm.referenceOrderId}
                    onChange={(e) => setEntryForm((p) => ({ ...p, referenceOrderId: e.target.value }))}
                  >
                    <option value="">Unallocated</option>
                    {(ledger.order_summaries || []).map((o) => (
                      <option key={o.order_id} value={o.order_id}>
                        {o.production_order_no}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="finance-ledger-notes">
                Notes
                <textarea
                  rows={3}
                  placeholder="Add notes for this ledger entry"
                  value={entryForm.notes}
                  onChange={(e) => setEntryForm((p) => ({ ...p, notes: e.target.value }))}
                />
              </label>
              <div className="actions-cell">
                <button type="button" onClick={postEntry}>Post Ledger Entry</button>
              </div>
              {message && <p>{message}</p>}
            </>
          ) : (
            <p>Select an account to view ledger.</p>
          )}
        </section>
      </div>

      <div className="card table-wrap">
        <h3>Order-wise Ledger</h3>
        <table>
          <thead>
            <tr>
              <th>Order No</th>
              <th>Order Date</th>
              <th>Status</th>
              <th>Order Debit</th>
              <th>Advance</th>
              <th>Receipts</th>
              <th>Adj (+)</th>
              <th>Adj (-)</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {(ledger.order_summaries || []).map((o) => (
              <tr key={o.order_id}>
                <td>{o.production_order_no}</td>
                <td>{String(o.order_date || '').slice(0, 10)}</td>
                <td>{o.status}</td>
                <td>{money(o.total_debit)}</td>
                <td>{money(o.advance_paid)}</td>
                <td>{money(o.receipts_paid)}</td>
                <td>{money(o.credit_adjustments)}</td>
                <td>{money(o.debit_adjustments)}</td>
                <td>{money(o.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {ledger.unallocated && (
          <p>
            Unallocated Entries: Debit {money(ledger.unallocated.debit)} | Credit {money(ledger.unallocated.credit)} | Balance {money(ledger.unallocated.balance)}
          </p>
        )}
      </div>

      <div className="card table-wrap">
        <h3>Ledger Entries</h3>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Category</th>
              <th>Amount</th>
              <th>Order Ref</th>
              <th>Pay Account</th>
              <th>Verify</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {(ledger.entries || []).map((e) => (
              <tr key={e.id}>
                <td>{String(e.entry_date || '').slice(0, 10)}</td>
                <td>{e.entry_type}</td>
                <td>{e.category}</td>
                <td>{money(e.amount)}</td>
                <td>
                  {e.reference_order_id
                    ? (ledger.order_summaries || []).find((o) => o.order_id === e.reference_order_id)?.production_order_no || e.reference_order_id
                    : '-'}
                </td>
                <td>{e.payment_account_id ? (paymentAccounts.find((a) => a.id === e.payment_account_id)?.name || e.payment_account_id) : '-'}</td>
                <td>{e.verification_status || '-'}</td>
                <td>{e.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {['FINANCE', 'SUPER_USER'].includes(user?.role) && (
        <div className="grid two">
          <section className="card">
            <h3>Bank Statement Entry</h3>
            <div className="grid two finance-bank-entry-grid">
              <label>
                Date
                <input type="date" value={bankForm.transactionDate} onChange={(e) => setBankForm((p) => ({ ...p, transactionDate: e.target.value }))} />
              </label>
              <label>
                Amount
                <input type="number" min="0.01" step="0.01" placeholder="0.00" value={bankForm.amount} onChange={(e) => setBankForm((p) => ({ ...p, amount: e.target.value }))} />
              </label>
              <label>
                Reference
                <input placeholder="Bank reference / UTR" value={bankForm.referenceNo} onChange={(e) => setBankForm((p) => ({ ...p, referenceNo: e.target.value }))} />
              </label>
              <label>
                Customer Number
                <input placeholder="Customer phone/number" value={bankForm.customerNumber} onChange={(e) => setBankForm((p) => ({ ...p, customerNumber: e.target.value }))} />
              </label>
              <label>
                Outlet
                <input placeholder="Outlet name" value={bankForm.outletName} onChange={(e) => setBankForm((p) => ({ ...p, outletName: e.target.value }))} />
              </label>
              <label>
                Bank Account
                <select value={bankForm.paymentAccountId || ''} onChange={(e) => setBankForm((p) => ({ ...p, paymentAccountId: e.target.value }))}>
                  <option value="">Select bank account</option>
                  {paymentAccounts.filter((a) => a.account_type === 'BANK').map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
              <label className="finance-bank-entry-narration">
                Narration
                <textarea rows={3} placeholder="Bank narration/description" value={bankForm.narration} onChange={(e) => setBankForm((p) => ({ ...p, narration: e.target.value }))} />
              </label>
            </div>
            <div className="actions-cell">
              <button type="button" onClick={addBankEntry}>Add Bank Statement Line</button>
            </div>
          </section>

          <section className="card">
            <h3>Payment Verification</h3>
            <p>Select one pending receipt and one unmatched bank line with same amount.</p>
            <label>Verification Notes<input value={verificationNotes} onChange={(e) => setVerificationNotes(e.target.value)} /></label>
            <div className="actions-cell">
              <button type="button" onClick={verifySelectedPayment}>Verify Selected Payment</button>
            </div>
          </section>
        </div>
      )}

      {['FINANCE', 'SUPER_USER'].includes(user?.role) && (
        <div className="grid two">
          <section className="card table-wrap">
            <h3>Pending Receipt Entries</h3>
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Number</th>
                  <th>Order No</th>
                  <th>Amount</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {pendingReceipts.map((e) => (
                  <tr key={e.id}>
                    <td><input type="radio" name="pendingReceipt" checked={selectedPendingId === e.id} onChange={() => setSelectedPendingId(e.id)} /></td>
                    <td>{String(e.entry_date || '').slice(0, 10)}</td>
                    <td>{e.customer_name}</td>
                    <td>{e.customer_number}</td>
                    <td>{e.production_order_no || e.reference_order_id || '-'}</td>
                    <td>{money(e.amount)}</td>
                    <td>{e.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card table-wrap">
            <h3>Unmatched Bank Entries</h3>
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Reference</th>
                  <th>Customer Number</th>
                  <th>Narration</th>
                </tr>
              </thead>
              <tbody>
                {bankEntries.map((b) => (
                  <tr key={b.id}>
                    <td><input type="radio" name="bankEntry" checked={selectedBankId === b.id} onChange={() => setSelectedBankId(b.id)} /></td>
                    <td>{String(b.transaction_date || '').slice(0, 10)}</td>
                    <td>{money(b.amount)}</td>
                    <td>{b.reference_no || '-'}</td>
                    <td>{b.customer_number || '-'}</td>
                    <td>{b.narration || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      )}
        </>
      )}
    </section>
  );
}
