import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useOutlets } from '../context/OutletsContext';
import { useAuth } from '../context/AuthContext';
import { BarChartCard, DonutChartCard, LineChartCard } from './ReportingCharts';
import LateReportView from './LateReportView';
import A4PrintableOrderView from './A4PrintableOrderView';

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : '';
}

function formatDueState(order) {
  if (order.is_late) return 'Late';
  if (!order.due_date) return 'No due date';
  const due = new Date(order.due_date);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((due - today) / 86400000);
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  if (diff > 1) return `${diff} days left`;
  return `${Math.abs(diff)} days overdue`;
}

function daysBetween(startValue, endValue) {
  if (!startValue || !endValue) return null;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end - start) / 86400000));
}

function averageOf(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (!clean.length) return 0;
  return Math.round((clean.reduce((sum, value) => sum + value, 0) / clean.length) * 10) / 10;
}

function RetailKpis({ summary, attentionCount, dueTodayCount }) {
  const cards = [
    ['Active Orders', summary.total_orders || 0, 'All retail orders in the system.'],
    ['In Production', summary.pending_in_production || 0, 'Orders currently moving through factory stages.'],
    ['Ready / Completed', summary.completed || 0, 'Orders that are ready for delivery or handoff.'],
    ['Attention Needed', attentionCount, 'Late or blocked orders needing follow-up.'],
    ['Due Today', dueTodayCount, 'Customer commitments due today.'],
    ['Shipped', summary.shipped || 0, 'Orders already delivered out of retail.'],
  ];

  return (
    <div className="retail-kpi-grid">
      {cards.map(([label, value, note]) => (
        <article key={label} className="retail-kpi-card">
          <span>{label}</span>
          <strong>{value}</strong>
          <p>{note}</p>
        </article>
      ))}
    </div>
  );
}

function RetailHeadKpis({ summary, outletCount, delayedOutletCount, dueTodayCount }) {
  const cards = [
    ['Network Orders', summary.total_orders || 0, 'All retail orders across the outlet network.'],
    ['Network In Production', summary.pending_in_production || 0, 'Orders still moving through production.'],
    ['Completed', summary.completed || 0, 'Orders ready for store release or delivery.'],
    ['Late Orders', summary.late_orders || 0, 'Customer commitments already behind promise date.'],
    ['Outlets In Scope', outletCount, 'Outlets currently visible in this reporting view.'],
    ['Outlets Under Pressure', delayedOutletCount, 'Outlets carrying at least one delayed order.'],
    ['Due Today', dueTodayCount, 'Network commitments due today.'],
    ['Shipped', summary.shipped || 0, 'Orders already handed over to customers.'],
  ];

  return (
    <div className="retail-kpi-grid">
      {cards.map(([label, value, note]) => (
        <article key={label} className="retail-kpi-card">
          <span>{label}</span>
          <strong>{value}</strong>
          <p>{note}</p>
        </article>
      ))}
    </div>
  );
}

function buildNetworkTrend(orders) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - index));
    const iso = day.toISOString().slice(0, 10);
    return {
      label: iso.slice(5, 10),
      value: orders.filter((order) => dateOnly(order.order_date) === iso).length,
    };
  });
}

function toCsvFile(filename, header, rows) {
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function buildHeatClass(value) {
  if (value >= 8) return 'critical';
  if (value >= 4) return 'high';
  if (value >= 1) return 'moderate';
  return 'stable';
}

function formatRecoveryChainLabel(item) {
  const rawCaseType = String(item?.case_type || '').toUpperCase();
  const caseType = rawCaseType === 'REMAKE' ? 'REPLACEMENT' : rawCaseType;
  const sequence = Number(item?.replacement_sequence || 1);
  if (caseType === 'REPLACEMENT') return `Replacement ${sequence}`;
  if (caseType === 'REPAIR') return `Repair ${sequence}`;
  return `${caseType || 'Case'} ${sequence}`;
}

function exportOutletRankingCsv(rows) {
  const header = ['Rank', 'Outlet', 'Total Orders', 'Late Orders', 'In Production', 'Completed', 'Due Today'].join(',');
  const body = rows.map((row, index) => [
    index + 1,
    `"${String(row.outlet || '').replace(/"/g, '""')}"`,
    row.total || 0,
    row.late || 0,
    row.inProduction || 0,
    row.completed || 0,
    row.dueToday || 0,
  ].join(','));
  const blob = new Blob([[header, ...body].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'retail-head-outlet-ranking.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function exportReplacementChainCsv(rows) {
  const header = [
    'Original Order',
    'Customer',
    'Outlet',
    'Chain Length',
    'Open Cases',
    'Closed Cases',
    'Max Sequence',
    'Total Cost',
    'Latest Status',
    'Latest Reason',
    'Latest Owner',
  ].join(',');
  const body = rows.map((row) => [
    row.originalOrderNo,
    `"${String(row.customerName || '').replace(/"/g, '""')}"`,
    `"${String(row.outlet || '').replace(/"/g, '""')}"`,
    row.chainLength,
    row.openCount,
    row.closedCount,
    row.maxSequence,
    Number(row.totalCost || 0).toFixed(2),
    row.latestStatus || '',
    row.latestReason || '',
    `"${String(row.latestOwner || '').replace(/"/g, '""')}"`,
  ].join(','));
  toCsvFile('retail-head-replacement-chains.csv', header, body);
}

export default function RetailDashboard({
  refreshSignal,
  onCreateOrder,
  lockedHeadWorkspace = '',
  lockedOutletName = '',
}) {
  const { user } = useAuth();
  const isOutletUser = Boolean(user?.outlet_name);
  const isShopManager = ['RETAIL', 'SHOP_MANAGER'].includes(user?.role) || isOutletUser;
  const canManageReplacements = Boolean(
    user?.role === 'SUPER_USER' ||
    user?.permissions?.retail_manage_replacements ||
    ['RETAIL', 'SHOP_MANAGER', 'RETAIL_HEAD'].includes(user?.role)
  );
  const canViewReplacementReports = Boolean(
    user?.role === 'SUPER_USER' ||
    user?.permissions?.retail_view_head_reports ||
    user?.role === 'RETAIL_HEAD'
  );
  const [headWorkspace, setHeadWorkspace] = useState('overview');
  const { outlets } = useOutlets();
  const [data, setData] = useState({ orders: [], summary: {} });
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailOrder, setDetailOrder] = useState(null);
  const [storeDelivery, setStoreDelivery] = useState({ summary: {}, awaiting_receive: [], pending_deliveries: [] });
  const [changeLogs, setChangeLogs] = useState([]);
  const [recoveryData, setRecoveryData] = useState({ cases: [], notes: [], delivery_updates: [] });
  const [selectedRecoveryCaseId, setSelectedRecoveryCaseId] = useState(null);
  const [recoveryDeskMessage, setRecoveryDeskMessage] = useState('');
  const [attachmentDraft, setAttachmentDraft] = useState({ file: null, note: '' });
  const [reasonDraft, setReasonDraft] = useState({ code: '', label: '', slaDays: 7 });
  const [financialDraft, setFinancialDraft] = useState({ code: '', label: '' });
  const [thresholdDraft, setThresholdDraft] = useState(25000);
  const [recoveryDraft, setRecoveryDraft] = useState({
    orderId: '',
    productionOrderNo: '',
    caseType: 'REPLACEMENT',
    reasonCode: '',
    rootCauseBucket: '',
    complaintChannel: '',
    ownerName: '',
    promisedResolutionDate: '',
    estimatedCost: '',
    financialResolutionType: 'REPLACEMENT_ONLY',
    customerSatisfactionStatus: 'PENDING',
    customerValueBand: 'STANDARD',
    priorityLevel: 'STANDARD',
    workflowStatus: 'OPEN',
    notes: '',
    firstTimeFix: false,
    closedCleanly: false,
    approvalStatus: '',
  });
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    outlets: [],
    status: '',
    search: '',
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) params.set('dateTo', filters.dateTo);
    if (filters.status) params.set('status', filters.status);
    if (filters.search) params.set('search', filters.search);
    if (filters.outlets.length) params.set('outlets', filters.outlets.join(','));
    return params.toString();
  }, [filters]);

  useEffect(() => {
    if (!lockedHeadWorkspace) return;
    setHeadWorkspace(lockedHeadWorkspace);
  }, [lockedHeadWorkspace]);

  useEffect(() => {
    if (!lockedOutletName) return;
    setFilters((prev) => ({
      ...prev,
      outlets: [lockedOutletName],
      search: '',
    }));
  }, [lockedOutletName]);

  useEffect(() => {
    api.get(`/orders/retail-dashboard?${query}`).then(({ data: payload }) => setData(payload));
  }, [query, refreshSignal]);

  async function reloadRecoveryDashboard() {
    const [deliveryRes, logsRes, recoveryRes] = await Promise.all([
      api.get('/orders/store-delivery-dashboard').catch(() => ({ data: { summary: {}, awaiting_receive: [], pending_deliveries: [] } })),
      api.get('/orders/change-logs?limit=500').catch(() => ({ data: { logs: [] } })),
      api.get('/orders/retail-head/replacement-dashboard').catch(() => ({ data: { cases: [], notes: [], delivery_updates: [] } })),
    ]);
    setStoreDelivery(deliveryRes.data || { summary: {}, awaiting_receive: [], pending_deliveries: [] });
    setChangeLogs(logsRes.data?.logs || []);
    setRecoveryData(recoveryRes.data || { cases: [], notes: [], delivery_updates: [] });
  }

  useEffect(() => {
    if (!canManageReplacements && !canViewReplacementReports) return;
    reloadRecoveryDashboard();
  }, [canManageReplacements, canViewReplacementReports, refreshSignal]);

  async function openPrintable(orderId) {
    const { data: order } = await api.get(`/orders/${orderId}`);
    setSelectedOrder(order);
  }

  async function openOrderDetail(orderId) {
    const { data: order } = await api.get(`/orders/${orderId}`);
    setDetailOrder(order);
    setRecoveryDraft((prev) => ({
      ...prev,
      orderId: String(order.id),
      ownerName: order.ordered_from || '',
      notes: '',
    }));
  }

  async function downloadOrderPdf(orderId, productionOrderNo) {
    const response = await api.get(`/orders/${orderId}/pdf`, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `order-${productionOrderNo}.pdf`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function downloadCustomerReference(orderId, productionOrderNo) {
    const response = await api.get(`/orders/${orderId}/customer-reference`, { responseType: 'blob' });
    const blob = new Blob([response.data], { type: 'application/pdf' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `customer-reference-${productionOrderNo}.pdf`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function onOutletsChange(event) {
    const values = Array.from(event.target.selectedOptions).map((item) => item.value);
    setFilters((prev) => ({ ...prev, outlets: values }));
  }

  function openOutletDetail(outletName) {
    const params = new URLSearchParams({ page: 'retail-head-outlet' });
    if (outletName) params.set('outlet', outletName);
    window.open(`${window.location.origin}?${params.toString()}`, '_blank', 'noopener,noreferrer');
  }

  function loadRecoveryCaseIntoDraft(item) {
    setSelectedRecoveryCaseId(item?.id || null);
    setRecoveryDraft({
      orderId: String(item?.order_id || ''),
      productionOrderNo: item?.production_order_no || '',
      caseType: String(item?.case_type || '').toUpperCase() === 'REMAKE' ? 'REPLACEMENT' : (item?.case_type || 'REPLACEMENT'),
      reasonCode: item?.reason_code || '',
      rootCauseBucket: item?.root_cause_bucket || '',
      complaintChannel: item?.complaint_channel || '',
      ownerName: item?.owner_name || '',
      promisedResolutionDate: dateOnly(item?.promised_resolution_date),
      estimatedCost: item?.estimated_cost || '',
      financialResolutionType: item?.financial_resolution_type || 'REPLACEMENT_ONLY',
      customerSatisfactionStatus: item?.customer_satisfaction_status || 'PENDING',
      customerValueBand: item?.customer_value_band || 'STANDARD',
      priorityLevel: item?.priority_level || 'STANDARD',
      workflowStatus: item?.workflow_status || item?.status || 'OPEN',
      notes: '',
      firstTimeFix: Boolean(item?.first_time_fix),
      closedCleanly: Boolean(item?.closed_cleanly),
      approvalStatus: item?.approval_status || '',
    });
  }

  async function submitRecoveryCase() {
    const payload = {
      ...recoveryDraft,
      orderId: Number(recoveryDraft.orderId),
      estimatedCost: Number(recoveryDraft.estimatedCost || 0),
    };
    if (!payload.orderId || !payload.reasonCode) return;
    await api.post('/orders/retail-replacement-cases', payload);
    setRecoveryDeskMessage('Replacement case created.');
    setRecoveryDraft((prev) => ({ ...prev, notes: '', estimatedCost: prev.estimatedCost, reasonCode: prev.reasonCode }));
    await reloadRecoveryDashboard();
  }

  async function saveRecoveryCase() {
    if (!selectedRecoveryCaseId) return;
    const payload = {
      ...recoveryDraft,
      estimatedCost: Number(recoveryDraft.estimatedCost || 0),
      resolvedAt: recoveryDraft.workflowStatus === 'CLOSED' ? new Date().toISOString() : undefined,
    };
    await api.put(`/orders/retail-replacement-cases/${selectedRecoveryCaseId}`, payload);
    setRecoveryDeskMessage(`Replacement case #${selectedRecoveryCaseId} updated.`);
    await reloadRecoveryDashboard();
  }

  async function uploadRecoveryAttachment() {
    if (!selectedRecoveryCaseId || !attachmentDraft.file) return;
    const formData = new FormData();
    formData.append('attachment', attachmentDraft.file);
    formData.append('note', attachmentDraft.note || '');
    await api.post(`/orders/retail-replacement-cases/${selectedRecoveryCaseId}/attachments`, formData);
    setAttachmentDraft({ file: null, note: '' });
    setRecoveryDeskMessage('Replacement attachment uploaded.');
    await reloadRecoveryDashboard();
  }

  async function saveRecoverySetting(settingKey, settingValue) {
    await api.post('/orders/retail-replacement-settings', { settingKey, settingValue });
    setRecoveryDeskMessage(`Replacement setting ${settingKey} updated.`);
    await reloadRecoveryDashboard();
  }

  async function saveRecoveryReason() {
    if (!reasonDraft.code || !reasonDraft.label) return;
    await api.post('/orders/retail-replacement-reasons', reasonDraft);
    setReasonDraft({ code: '', label: '', slaDays: 7 });
    setRecoveryDeskMessage('Replacement reason saved.');
    await reloadRecoveryDashboard();
  }

  async function saveFinancialResolution() {
    if (!financialDraft.code || !financialDraft.label) return;
    await api.post('/orders/retail-replacement-financial-resolutions', financialDraft);
    setFinancialDraft({ code: '', label: '' });
    setRecoveryDeskMessage('Financial resolution saved.');
    await reloadRecoveryDashboard();
  }

  function exportRetailHeadPack() {
    toCsvFile(
      'retail-head-scorecards.csv',
      'Outlet,Score,Attainment,Late,Due Today,Total',
      outletScorecards.map((row) => [row.outlet, row.score, row.attainment, row.late, row.dueToday, row.total].join(','))
    );
    toCsvFile(
      'retail-head-promise-drift.csv',
      'Order,Outlet,Customer,Before Due,After Due,Changed At,Changed By',
      promiseDriftRows.map((row) => [
        row.orderNo,
        `"${String(row.outlet || '').replace(/"/g, '""')}"`,
        `"${String(row.customer || '').replace(/"/g, '""')}"`,
        row.beforeDue,
        row.afterDue,
        row.changedAt,
        `"${String(row.changedBy || '').replace(/"/g, '""')}"`,
      ].join(','))
    );
    toCsvFile(
      'retail-head-factory-time.csv',
      'Order,Outlet,Customer,Factory Time Days,Outlet Acceptance Days,Promised Lead,Actual Lead,Variance',
      timingRows.map((row) => [
        row.production_order_no,
        `"${String(row.ordered_from || '').replace(/"/g, '""')}"`,
        `"${String(row.customer_name || '').replace(/"/g, '""')}"`,
        row.factoryTime ?? '',
        row.outletAcceptance ?? '',
        row.promisedLead ?? '',
        row.actualLead ?? '',
        row.leadVariance ?? '',
      ].join(','))
    );
    toCsvFile(
      'retail-head-refinishing.csv',
      'Case ID,Order,Outlet,Customer,Reason,Workflow,Estimated Cost,Promise Date,Resolved At',
      refinishingCases.map((row) => [
        row.id,
        row.production_order_no,
        `"${String(row.ordered_from || '').replace(/"/g, '""')}"`,
        `"${String(row.customer_name || '').replace(/"/g, '""')}"`,
        row.reason_code || '',
        row.workflow_status || '',
        Number(row.estimated_cost || 0).toFixed(2),
        dateOnly(row.promised_resolution_date),
        dateOnly(row.resolved_at),
      ].join(','))
    );
  }

  function printRetailHeadSummary() {
    window.print();
  }

  const orders = useMemo(() => data.orders || [], [data.orders]);
  const attentionOrders = orders
    .filter((order) => order.is_late || ['PENDING', 'REJECTED'].includes(order.status))
    .slice(0, 6);
  const today = new Date().toISOString().slice(0, 10);
  const dueTodayOrders = orders.filter((order) => dateOnly(order.due_date) === today).slice(0, 6);
  const recentOrders = orders.slice(0, 12);
  const outletSummary = Object.values(orders.reduce((acc, order) => {
    const outletName = order.ordered_from || 'Unknown Outlet';
    if (!acc[outletName]) {
      acc[outletName] = {
        outlet: outletName,
        total: 0,
        late: 0,
        completed: 0,
        inProduction: 0,
        dueToday: 0,
      };
    }
    acc[outletName].total += 1;
    if (order.is_late) acc[outletName].late += 1;
    if (order.status === 'COMPLETED') acc[outletName].completed += 1;
    if (order.status === 'IN_PRODUCTION') acc[outletName].inProduction += 1;
    if (dateOnly(order.due_date) === today) acc[outletName].dueToday += 1;
    return acc;
  }, {})).sort((a, b) => (b.late - a.late) || (b.dueToday - a.dueToday) || (b.total - a.total));
  const delayedOutlets = outletSummary.filter((row) => row.late > 0).slice(0, 6);
  const readyOrders = orders.filter((order) => ['COMPLETED', 'SHIPPED'].includes(order.status)).slice(0, 6);
  const promiseBuckets = {
    overdue: orders.filter((order) => order.is_late).length,
    today: orders.filter((order) => dateOnly(order.due_date) === today).length,
    tomorrow: orders.filter((order) => {
      if (!order.due_date) return false;
      const diff = Math.round((new Date(dateOnly(order.due_date)) - new Date(today)) / 86400000);
      return diff === 1;
    }).length,
    thisWeek: orders.filter((order) => {
      if (!order.due_date) return false;
      const diff = Math.round((new Date(dateOnly(order.due_date)) - new Date(today)) / 86400000);
      return diff >= 2 && diff <= 7;
    }).length,
  };
  const statusMix = ['PENDING', 'IN_PRODUCTION', 'COMPLETED', 'SHIPPED', 'REJECTED'].map((status) => ({
    status,
    count: orders.filter((order) => order.status === status).length,
  }));
  const mostExposedOutlet = delayedOutlets[0] || outletSummary[0] || null;
  const releaseReadyCount = orders.filter((order) => ['COMPLETED', 'SHIPPED'].includes(order.status)).length;
  const blockedCount = orders.filter((order) => ['PENDING', 'REJECTED'].includes(order.status)).length;
  const topRiskOrders = orders
    .filter((order) => order.is_late || dateOnly(order.due_date) === today)
    .sort((a, b) => {
      if (a.is_late !== b.is_late) return a.is_late ? -1 : 1;
      return new Date(a.due_date || 0) - new Date(b.due_date || 0);
    })
    .slice(0, 5);
  const networkTrend = useMemo(() => buildNetworkTrend(orders), [orders]);
  const outletDelayRanking = useMemo(
    () => outletSummary.slice(0, 8).map((row) => ({ label: row.outlet, value: row.late })),
    [outletSummary]
  );
  const completedOnTime = useMemo(
    () => orders.filter((order) => ['COMPLETED', 'SHIPPED'].includes(order.status) && dateOnly(order.completed_at) && (!order.due_date || dateOnly(order.completed_at) <= dateOnly(order.due_date))).length,
    [orders]
  );
  const completedCount = useMemo(
    () => orders.filter((order) => ['COMPLETED', 'SHIPPED'].includes(order.status)).length,
    [orders]
  );
  const promiseAttainment = completedCount > 0 ? Math.round((completedOnTime / completedCount) * 100) : 0;
  const cancelledOrders = useMemo(() => orders.filter((order) => order.status === 'REJECTED').length, [orders]);
  const conversionFunnel = useMemo(() => ([
    { label: 'Booked', value: orders.length },
    { label: 'In Production', value: orders.filter((order) => order.status === 'IN_PRODUCTION').length },
    { label: 'Completed', value: orders.filter((order) => order.status === 'COMPLETED').length },
    { label: 'Shipped', value: orders.filter((order) => order.status === 'SHIPPED').length },
  ]), [orders]);
  const deliveryStatusWaterfall = useMemo(() => {
    const statuses = (storeDelivery.pending_deliveries || []).reduce((acc, row) => {
      const key = row.today_update_status || row.last_update_status || 'NO_UPDATE';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(statuses).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [storeDelivery.pending_deliveries]);
  const unpaidReadyOrders = useMemo(
    () => (storeDelivery.pending_deliveries || []).filter((row) => Number(row.outstanding_balance || 0) > 0).slice(0, 8),
    [storeDelivery.pending_deliveries]
  );
  const complaintQueue = useMemo(
    () => (storeDelivery.pending_deliveries || []).filter((row) => /complaint|escalat|delay|no_response|no show|requested_delay/i.test(`${row.today_update_status || ''} ${row.last_update_status || ''} ${row.today_update_notes || ''} ${row.last_update_notes || ''}`)).slice(0, 8),
    [storeDelivery.pending_deliveries]
  );
  const followupProductivity = useMemo(() => {
    const grouped = (storeDelivery.pending_deliveries || []).reduce((acc, row) => {
      const key = row.ordered_from || 'Unknown Outlet';
      if (!acc[key]) acc[key] = { outlet: key, updated: 0, pending: 0, delivered: 0 };
      if (row.today_update_status) acc[key].updated += 1;
      else acc[key].pending += 1;
      if ((row.today_update_status || row.last_update_status) === 'DELIVERED') acc[key].delivered += 1;
      return acc;
    }, {});
    return Object.values(grouped).sort((a, b) => b.updated - a.updated).slice(0, 8);
  }, [storeDelivery.pending_deliveries]);
  const readyReleaseHoldReasons = useMemo(() => {
    const grouped = (storeDelivery.pending_deliveries || []).reduce((acc, row) => {
      if (Number(row.outstanding_balance || 0) > 0) acc.UNPAID_BALANCE = (acc.UNPAID_BALANCE || 0) + 1;
      else if (row.today_update_status || row.last_update_status) {
        const key = row.today_update_status || row.last_update_status;
        acc[key] = (acc[key] || 0) + 1;
      } else {
        acc.NO_CUSTOMER_UPDATE = (acc.NO_CUSTOMER_UPDATE || 0) + 1;
      }
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [storeDelivery.pending_deliveries]);
  const promiseDriftRows = useMemo(() => {
    const orderLookup = new Map(orders.map((order) => [Number(order.id), order]));
    return (changeLogs || [])
      .map((log) => {
        const before = log.before_data || {};
        const after = log.after_data || {};
        const beforeDue = dateOnly(before.due_date || before.dueDate);
        const afterDue = dateOnly(after.due_date || after.dueDate);
        if (!afterDue || beforeDue === afterDue) return null;
        const order = orderLookup.get(Number(log.order_id));
        if (!order) return null;
        return {
          id: log.id,
          orderId: log.order_id,
          orderNo: order.production_order_no,
          outlet: order.ordered_from,
          customer: order.customer_name,
          beforeDue,
          afterDue,
          changedAt: dateOnly(log.changed_at),
          changedBy: log.changed_by_name || 'Unknown',
        };
      })
      .filter(Boolean)
      .slice(0, 12);
  }, [changeLogs, orders]);
  const customerRiskRows = useMemo(() => {
    const grouped = orders.reduce((acc, order) => {
      const key = order.customer_name || 'Unknown Customer';
      if (!acc[key]) acc[key] = { customer: key, overdue: 0, rejected: 0, total: 0 };
      acc[key].total += 1;
      if (order.is_late) acc[key].overdue += 1;
      if (order.status === 'REJECTED') acc[key].rejected += 1;
      return acc;
    }, {});
    return Object.values(grouped)
      .map((row) => ({ ...row, risk: row.overdue * 3 + row.rejected * 2 + Math.max(0, row.total - 1) }))
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 8);
  }, [orders]);
  const repeatDelayCustomers = useMemo(
    () => customerRiskRows.filter((row) => row.overdue >= 2),
    [customerRiskRows]
  );
  const recoveryCustomers = useMemo(
    () => customerRiskRows.filter((row) => row.rejected >= 1 || row.total >= 3).slice(0, 8),
    [customerRiskRows]
  );
  const alertCenter = useMemo(() => {
    const alerts = [];
    if (promiseBuckets.overdue > 0) alerts.push({ severity: 'critical', title: 'Overdue orders', note: `${promiseBuckets.overdue} customer commitments are already overdue.` });
    if (unpaidReadyOrders.length > 0) alerts.push({ severity: 'high', title: 'Unpaid ready orders', note: `${unpaidReadyOrders.length} ready orders are blocked on balance collection.` });
    if (complaintQueue.length > 0) alerts.push({ severity: 'high', title: 'Complaint and escalation queue', note: `${complaintQueue.length} delivery updates contain complaint or escalation signals.` });
    if (promiseDriftRows.length > 0) alerts.push({ severity: 'moderate', title: 'Promise-date drift', note: `${promiseDriftRows.length} recent due-date changes need retail-head visibility.` });
    return alerts.slice(0, 6);
  }, [promiseBuckets.overdue, unpaidReadyOrders.length, complaintQueue.length, promiseDriftRows.length]);
  const outletScorecards = useMemo(() => (
    outletSummary.slice(0, 12).map((row) => ({
      ...row,
      score: Math.max(0, 100 - (row.late * 8 + row.dueToday * 4 + Math.max(0, row.total - row.completed) * 1)),
      attainment: row.completed > 0 ? Math.round((row.completed / Math.max(row.total, 1)) * 100) : 0,
    }))
  ), [outletSummary]);
  const slaBoard = useMemo(() => (
    outletScorecards.map((row) => ({
      outlet: row.outlet,
      sla: row.score >= 85 ? 'On Track' : row.score >= 65 ? 'Watch' : 'Breach',
      late: row.late,
      dueToday: row.dueToday,
    }))
  ), [outletScorecards]);
  const recoveryCases = useMemo(() => recoveryData.cases || [], [recoveryData.cases]);
  const recoveryNotes = useMemo(() => recoveryData.notes || [], [recoveryData.notes]);
  const recoveryAttachments = useMemo(() => recoveryData.attachments || [], [recoveryData.attachments]);
  const recoveryAudit = useMemo(() => recoveryData.audit || [], [recoveryData.audit]);
  const recoveryReasons = useMemo(() => recoveryData.reason_master || [], [recoveryData.reason_master]);
  const financialResolutions = useMemo(() => recoveryData.financial_resolution_master || [], [recoveryData.financial_resolution_master]);
  const recoverySettings = useMemo(() => recoveryData.settings || [], [recoveryData.settings]);
  const recoveryNotifications = useMemo(() => recoveryData.notifications || [], [recoveryData.notifications]);
  const ordersById = useMemo(() => new Map(orders.map((order) => [Number(order.id), order])), [orders]);
  const settingsMap = useMemo(
    () => Object.fromEntries(recoverySettings.map((item) => [item.setting_key, item.setting_value])),
    [recoverySettings]
  );
  const highCostApprovalThreshold = Number(settingsMap.HIGH_COST_APPROVAL_THRESHOLD?.amount || 25000);
  useEffect(() => {
    setThresholdDraft(highCostApprovalThreshold);
  }, [highCostApprovalThreshold]);
  const replacementRate = orders.length > 0 ? Math.round((recoveryCases.length / orders.length) * 100) : 0;
  const replacementChains = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = Number(item.original_order_id || item.order_id || item.id);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
    return Object.values(grouped).map((items) => {
      const sorted = [...items].sort((a, b) => Number(a.replacement_sequence || 1) - Number(b.replacement_sequence || 1));
      const latest = sorted[sorted.length - 1] || {};
      const openItems = sorted.filter((row) => !['CLOSED', 'REJECTED'].includes(String(row.workflow_status || row.status || '').toUpperCase()));
      const closedItems = sorted.filter((row) => ['CLOSED', 'REJECTED'].includes(String(row.workflow_status || row.status || '').toUpperCase()));
      const turnaroundValues = closedItems
        .filter((row) => row.resolved_at)
        .map((row) => Math.max(0, Math.round((new Date(row.resolved_at) - new Date(row.created_at)) / 86400000)));
      return {
        originalOrderId: Number(latest.original_order_id || latest.order_id || 0),
        originalOrderNo: latest.production_order_no,
        customerName: latest.customer_name,
        outlet: latest.ordered_from || 'Unknown Outlet',
        chainLength: sorted.length,
        maxSequence: Math.max(...sorted.map((row) => Number(row.replacement_sequence || 1))),
        openCount: openItems.length,
        closedCount: closedItems.length,
        totalCost: sorted.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0),
        latestStatus: latest.workflow_status || latest.status || 'OPEN',
        latestReason: latest.reason_code || 'UNKNOWN',
        latestOwner: latest.owner_name || 'Unassigned',
        latestCreatedAt: latest.created_at,
        avgTurnaroundDays: turnaroundValues.length ? Math.round(turnaroundValues.reduce((sum, value) => sum + value, 0) / turnaroundValues.length) : 0,
        items: sorted,
      };
    }).sort((a, b) => (b.chainLength - a.chainLength) || (b.totalCost - a.totalCost));
  }, [recoveryCases]);
  const repeatReplacementChains = useMemo(() => replacementChains.filter((row) => row.chainLength >= 2), [replacementChains]);
  const thirdReplacementChains = useMemo(() => replacementChains.filter((row) => row.maxSequence >= 3), [replacementChains]);
  const avgChainLength = useMemo(
    () => repeatReplacementChains.length ? Math.round((repeatReplacementChains.reduce((sum, row) => sum + row.chainLength, 0) / repeatReplacementChains.length) * 10) / 10 : 0,
    [repeatReplacementChains]
  );
  const maxChainDepth = useMemo(
    () => replacementChains.length ? Math.max(...replacementChains.map((row) => row.maxSequence)) : 0,
    [replacementChains]
  );
  const repeatReplacementExposure = useMemo(
    () => repeatReplacementChains.reduce((sum, row) => sum + Number(row.totalCost || 0), 0),
    [repeatReplacementChains]
  );
  const repeatReplacementRate = useMemo(
    () => replacementChains.length ? Math.round((repeatReplacementChains.length / replacementChains.length) * 100) : 0,
    [replacementChains, repeatReplacementChains]
  );
  const chainAgeing = useMemo(() => {
    const grouped = repeatReplacementChains.reduce((acc, row) => {
      const latestDate = dateOnly(row.latestCreatedAt);
      const age = latestDate ? Math.max(0, Math.round((new Date(today) - new Date(latestDate)) / 86400000)) : 0;
      const bucket = age <= 3 ? '0-3 days' : age <= 7 ? '4-7 days' : age <= 14 ? '8-14 days' : '15+ days';
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value }));
  }, [repeatReplacementChains, today]);
  const repeatChainOutletRanking = useMemo(() => {
    const grouped = repeatReplacementChains.reduce((acc, row) => {
      acc[row.outlet] = (acc[row.outlet] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [repeatReplacementChains]);
  const repeatChainCustomerRanking = useMemo(() => {
    const grouped = repeatReplacementChains.reduce((acc, row) => {
      acc[row.customerName || 'Unknown Customer'] = (acc[row.customerName || 'Unknown Customer'] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [repeatReplacementChains]);
  const highRiskRepeatChains = useMemo(
    () => repeatReplacementChains.filter((row) => row.openCount > 0).slice(0, 10),
    [repeatReplacementChains]
  );
  const topReplacementCostChains = useMemo(
    () => [...repeatReplacementChains].sort((a, b) => b.totalCost - a.totalCost).slice(0, 10),
    [repeatReplacementChains]
  );
  const chainLengthDistribution = useMemo(() => {
    const grouped = repeatReplacementChains.reduce((acc, row) => {
      const key = `${row.chainLength} cases`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [repeatReplacementChains]);
  const thirdReplacementOutletRanking = useMemo(() => {
    const grouped = thirdReplacementChains.reduce((acc, row) => {
      acc[row.outlet] = (acc[row.outlet] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [thirdReplacementChains]);
  const repeatChainOwnerLoad = useMemo(() => {
    const grouped = repeatReplacementChains.reduce((acc, row) => {
      const key = row.latestOwner || 'Unassigned';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [repeatReplacementChains]);
  const repeatChainTurnaround = useMemo(
    () => [...repeatReplacementChains].sort((a, b) => b.avgTurnaroundDays - a.avgTurnaroundDays).slice(0, 8).map((row) => ({ label: row.originalOrderNo, value: row.avgTurnaroundDays })),
    [repeatReplacementChains]
  );
  const replacement2Chains = useMemo(() => replacementChains.filter((row) => row.maxSequence === 2), [replacementChains]);
  const repeatChainReasonRanking = useMemo(() => {
    const grouped = repeatReplacementChains.reduce((acc, row) => {
      acc[row.latestReason || 'UNKNOWN'] = (acc[row.latestReason || 'UNKNOWN'] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [repeatReplacementChains]);
  const repeatChainValueBandMix = useMemo(() => {
    const grouped = repeatReplacementChains.reduce((acc, row) => {
      const latest = row.items[row.items.length - 1] || {};
      const key = latest.customer_value_band || 'STANDARD';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value }));
  }, [repeatReplacementChains]);
  const repeatChainFinancialMix = useMemo(() => {
    const grouped = repeatReplacementChains.reduce((acc, row) => {
      const latest = row.items[row.items.length - 1] || {};
      const key = latest.financial_resolution_type || 'REPLACEMENT_ONLY';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value }));
  }, [repeatReplacementChains]);
  const repeatChainClosureHealth = useMemo(() => {
    const grouped = repeatReplacementChains.reduce((acc, row) => {
      const latest = row.items[row.items.length - 1] || {};
      let key = 'Open';
      if (row.openCount === 0 && latest.closed_cleanly) key = 'Closed Cleanly';
      else if (Number(latest.reopened_count || 0) > 0) key = 'Reopened';
      else if (row.openCount === 0) key = 'Closed';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value }));
  }, [repeatReplacementChains]);
  const repeatChainPromiseAdherence = useMemo(() => {
    const closed = repeatReplacementChains.filter((row) => {
      const latest = row.items[row.items.length - 1] || {};
      return latest.resolved_at && latest.promised_resolution_date;
    });
    if (!closed.length) return 0;
    const met = closed.filter((row) => {
      const latest = row.items[row.items.length - 1] || {};
      return dateOnly(latest.resolved_at) <= dateOnly(latest.promised_resolution_date);
    }).length;
    return Math.round((met / closed.length) * 100);
  }, [repeatReplacementChains]);
  const repeatChainReopenRate = useMemo(() => {
    if (!repeatReplacementChains.length) return 0;
    const reopened = repeatReplacementChains.filter((row) => row.items.some((item) => Number(item.reopened_count || 0) > 0)).length;
    return Math.round((reopened / repeatReplacementChains.length) * 100);
  }, [repeatReplacementChains]);
  const repeatChainFirstTimeFixRate = useMemo(() => {
    const closed = repeatReplacementChains.filter((row) => row.openCount === 0);
    if (!closed.length) return 0;
    const fixed = closed.filter((row) => row.items.every((item) => item.first_time_fix === true)).length;
    return Math.round((fixed / closed.length) * 100);
  }, [repeatReplacementChains]);
  const repeatChainAvgCost = useMemo(
    () => repeatReplacementChains.length ? Math.round((repeatReplacementChains.reduce((sum, row) => sum + row.totalCost, 0) / repeatReplacementChains.length) * 100) / 100 : 0,
    [repeatReplacementChains]
  );
  const repeatChainBreachCount = useMemo(
    () => repeatReplacementChains.filter((row) => row.items.some((item) => dateOnly(item.promised_resolution_date) && dateOnly(item.promised_resolution_date) < today && !item.resolved_at)).length,
    [repeatReplacementChains, today]
  );
  const repeatChainCustomerLossRisk = useMemo(() => {
    const grouped = repeatReplacementChains.reduce((acc, row) => {
      const latest = row.items[row.items.length - 1] || {};
      const key = latest.customer_satisfaction_status || 'PENDING';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value }));
  }, [repeatReplacementChains]);
  const repeatChainStagePressure = useMemo(() => {
    const grouped = repeatReplacementChains.reduce((acc, row) => {
      const stage = ordersById.get(Number(row.originalOrderId))?.current_stage || 'Completed / Released';
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [repeatReplacementChains, ordersById]);
  const repeatChainCostByOutlet = useMemo(() => {
    const grouped = repeatReplacementChains.reduce((acc, row) => {
      acc[row.outlet] = (acc[row.outlet] || 0) + row.totalCost;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [repeatReplacementChains]);
  const repeatChainOriginalVsRecoveryLead = useMemo(() => {
    return repeatReplacementChains.slice(0, 8).map((row) => {
      const originalOrder = ordersById.get(Number(row.originalOrderId));
      const originalLead = originalOrder ? daysBetween(originalOrder.order_date, originalOrder.due_date) : 0;
      return {
        label: row.originalOrderNo,
        value: row.avgTurnaroundDays - Number(originalLead || 0),
      };
    }).sort((a, b) => b.value - a.value);
  }, [repeatReplacementChains, ordersById]);
  const repeatChainOpenReasonBoard = useMemo(() => {
    const grouped = repeatReplacementChains.reduce((acc, row) => {
      if (!row.openCount) return acc;
      acc[row.latestReason || 'UNKNOWN'] = (acc[row.latestReason || 'UNKNOWN'] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [repeatReplacementChains]);
  const replacementReasonAnalysis = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = item.reason_code || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [recoveryCases]);
  const recoveryPipeline = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = item.status || 'OPEN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [recoveryCases]);
  const recoveryTypeSplit = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = String(item.case_type || 'UNKNOWN').toUpperCase() === 'REMAKE' ? 'REPLACEMENT' : (item.case_type || 'UNKNOWN');
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value }));
  }, [recoveryCases]);
  const replacementWeeklyTrend = useMemo(() => buildNetworkTrend(recoveryCases.map((item) => ({ order_date: item.created_at }))), [recoveryCases]);
  const replacementAgeing = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const opened = dateOnly(item.created_at);
      const age = opened ? Math.max(0, Math.round((new Date(today) - new Date(opened)) / 86400000)) : 0;
      const bucket = age <= 3 ? '0-3 days' : age <= 7 ? '4-7 days' : age <= 14 ? '8-14 days' : '15+ days';
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value }));
  }, [recoveryCases, today]);
  const replacementCostExposure = useMemo(
    () => recoveryCases.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0),
    [recoveryCases]
  );
  const replacementBacklog = useMemo(
    () => recoveryCases.filter((item) => !['CLOSED', 'REJECTED'].includes(String(item.status || ''))),
    [recoveryCases]
  );
  const replacementSlaBoard = useMemo(
    () => replacementBacklog.map((item) => {
      const promised = dateOnly(item.promised_resolution_date);
      const overdue = promised && promised < today;
      return { ...item, overdue };
    }).slice(0, 12),
    [replacementBacklog, today]
  );
  const replacementOutletRanking = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = item.ordered_from || 'Unknown Outlet';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [recoveryCases]);
  const replacementCustomerRanking = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = item.customer_name || 'Unknown Customer';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [recoveryCases]);
  const repeatReplacementOutlets = useMemo(() => replacementOutletRanking.filter((row) => row.value >= 2), [replacementOutletRanking]);
  const repeatReplacementCustomers = useMemo(() => replacementCustomerRanking.filter((row) => row.value >= 2), [replacementCustomerRanking]);
  const postDeliveryComplaintConversion = useMemo(() => {
    const delivered = storeDelivery.pending_deliveries || [];
    const deliveredCount = delivered.length || 1;
    return Math.round((recoveryCases.length / deliveredCount) * 100);
  }, [storeDelivery.pending_deliveries, recoveryCases.length]);
  const replacementRootCauseHeat = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = `${item.ordered_from || 'Unknown Outlet'}__${item.root_cause_bucket || 'UNKNOWN'}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([compound, value]) => {
      const [outlet, cause] = compound.split('__');
      return { outlet, cause, value };
    }).sort((a, b) => b.value - a.value).slice(0, 12);
  }, [recoveryCases]);
  const recoveryOwners = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = item.owner_name || 'Unassigned';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [recoveryCases]);
  const recoveryTurnaround = useMemo(() => {
    const closed = recoveryCases.filter((item) => item.resolved_at);
    if (!closed.length) return 0;
    const avg = closed.reduce((sum, item) => {
      const opened = new Date(item.created_at).getTime();
      const closedAt = new Date(item.resolved_at).getTime();
      return sum + Math.max(0, Math.round((closedAt - opened) / 86400000));
    }, 0) / closed.length;
    return Math.round(avg);
  }, [recoveryCases]);
  const replacementPromiseAdherence = useMemo(() => {
    const closed = recoveryCases.filter((item) => item.resolved_at && item.promised_resolution_date);
    if (!closed.length) return 0;
    const met = closed.filter((item) => dateOnly(item.resolved_at) <= dateOnly(item.promised_resolution_date)).length;
    return Math.round((met / closed.length) * 100);
  }, [recoveryCases]);
  const escalatedRecoveryQueue = useMemo(
    () => replacementBacklog.filter((item) => Number(item.escalation_level || 0) > 0 || (dateOnly(item.promised_resolution_date) && dateOnly(item.promised_resolution_date) < today)).slice(0, 8),
    [replacementBacklog, today]
  );
  const outletQualityRecoveryScore = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = item.ordered_from || 'Unknown Outlet';
      if (!acc[key]) acc[key] = { outlet: key, count: 0, closed: 0 };
      acc[key].count += 1;
      if (item.status === 'CLOSED') acc[key].closed += 1;
      return acc;
    }, {});
    return Object.values(grouped).map((row) => ({ ...row, score: Math.max(0, 100 - (row.count * 10) + row.closed * 4) })).sort((a, b) => a.score - b.score).slice(0, 8);
  }, [recoveryCases]);
  const complaintToReplacementFunnel = useMemo(() => ([
    { label: 'Complaints', value: complaintQueue.length },
    { label: 'Recovery Cases', value: recoveryCases.length },
    { label: 'Approved', value: recoveryCases.filter((item) => item.approved_at).length },
    { label: 'Closed', value: recoveryCases.filter((item) => item.status === 'CLOSED').length },
  ]), [complaintQueue.length, recoveryCases]);
  const satisfactionRecovery = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = item.customer_satisfaction_status || 'PENDING';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value }));
  }, [recoveryCases]);
  const financialRecovery = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = item.financial_resolution_type || 'REPLACEMENT_ONLY';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value }));
  }, [recoveryCases]);
  const slaByOutlet = useMemo(() => {
    const grouped = replacementBacklog.reduce((acc, item) => {
      const key = item.ordered_from || 'Unknown Outlet';
      if (!acc[key]) acc[key] = { label: key, overdue: 0, watch: 0 };
      const promised = dateOnly(item.promised_resolution_date);
      if (promised && promised < today) acc[key].overdue += 1;
      else acc[key].watch += 1;
      return acc;
    }, {});
    return Object.values(grouped)
      .map((row) => ({ label: row.label, value: row.overdue * 2 + row.watch }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [replacementBacklog, today]);
  const slaByOwner = useMemo(() => {
    const grouped = replacementBacklog.reduce((acc, item) => {
      const key = item.owner_name || 'Unassigned';
      if (!acc[key]) acc[key] = { label: key, overdue: 0, watch: 0 };
      const promised = dateOnly(item.promised_resolution_date);
      if (promised && promised < today) acc[key].overdue += 1;
      else acc[key].watch += 1;
      return acc;
    }, {});
    return Object.values(grouped)
      .map((row) => ({ label: row.label, value: row.overdue * 2 + row.watch }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [replacementBacklog, today]);
  const highValueRecoveryWatchlist = useMemo(
    () => recoveryCases.filter((item) => ['VIP', 'HIGH'].includes(String(item.customer_value_band || '').toUpperCase())).slice(0, 8),
    [recoveryCases]
  );
  const repeatComplaintCustomers = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = item.customer_name || 'Unknown Customer';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped)
      .filter(([, value]) => value >= 2)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [recoveryCases]);
  const outletQualityTrend = useMemo(() => {
    const ranges = [30, 60, 90];
    return outletSummary.slice(0, 6).map((outlet) => {
      const metrics = {};
      ranges.forEach((days) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        metrics[`d${days}`] = recoveryCases.filter((item) => item.ordered_from === outlet.outlet && new Date(item.created_at) >= cutoff).length;
      });
      return { outlet: outlet.outlet, ...metrics };
    });
  }, [outletSummary, recoveryCases]);
  const turnaroundByOutlet = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      if (!item.resolved_at) return acc;
      const key = item.ordered_from || 'Unknown Outlet';
      if (!acc[key]) acc[key] = { label: key, total: 0, count: 0 };
      acc[key].total += Math.max(0, Math.round((new Date(item.resolved_at) - new Date(item.created_at)) / 86400000));
      acc[key].count += 1;
      return acc;
    }, {});
    return Object.values(grouped)
      .map((row) => ({ label: row.label, value: Math.round(row.total / Math.max(row.count, 1)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [recoveryCases]);
  const turnaroundByReason = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      if (!item.resolved_at) return acc;
      const key = item.reason_code || 'UNKNOWN';
      if (!acc[key]) acc[key] = { label: key, total: 0, count: 0 };
      acc[key].total += Math.max(0, Math.round((new Date(item.resolved_at) - new Date(item.created_at)) / 86400000));
      acc[key].count += 1;
      return acc;
    }, {});
    return Object.values(grouped)
      .map((row) => ({ label: row.label, value: Math.round(row.total / Math.max(row.count, 1)) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [recoveryCases]);
  const costTrendByOutlet = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = item.ordered_from || 'Unknown Outlet';
      acc[key] = (acc[key] || 0) + Number(item.estimated_cost || 0);
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [recoveryCases]);
  const costTrendByReason = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = item.reason_code || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + Number(item.estimated_cost || 0);
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [recoveryCases]);
  const reopenRate = useMemo(() => {
    if (!recoveryCases.length) return 0;
    const reopened = recoveryCases.filter((item) => Number(item.reopened_count || 0) > 0).length;
    return Math.round((reopened / recoveryCases.length) * 100);
  }, [recoveryCases]);
  const firstTimeFixRate = useMemo(() => {
    const closed = recoveryCases.filter((item) => item.status === 'CLOSED');
    if (!closed.length) return 0;
    const fixed = closed.filter((item) => item.first_time_fix === true).length;
    return Math.round((fixed / closed.length) * 100);
  }, [recoveryCases]);
  const complaintClosureDistribution = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      if (!item.resolved_at) return acc;
      const age = Math.max(0, Math.round((new Date(item.resolved_at) - new Date(item.complaint_received_at || item.created_at)) / 86400000));
      const bucket = age <= 3 ? '0-3d' : age <= 7 ? '4-7d' : age <= 14 ? '8-14d' : '15d+';
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {});
    return ['0-3d', '4-7d', '8-14d', '15d+'].map((label) => ({ label, value: grouped[label] || 0 }));
  }, [recoveryCases]);
  const promiseSlipReport = useMemo(
    () => recoveryCases
      .filter((item) => item.resolved_at && item.promised_resolution_date && dateOnly(item.resolved_at) > dateOnly(item.promised_resolution_date))
      .slice(0, 12),
    [recoveryCases]
  );
  const mtoOrders = useMemo(
    () => orders.filter((order) => String(order.order_type || '').toUpperCase() === 'MTO'),
    [orders]
  );
  const timingRows = useMemo(() => mtoOrders.map((order) => {
    const factoryTime = daysBetween(order.factory_released_at || order.created_at, order.due_date);
    const outletAcceptance = daysBetween(order.order_date, order.created_at);
    const actualLead = daysBetween(order.order_date, order.completed_at || today);
    const promisedLead = daysBetween(order.order_date, order.due_date);
    return {
      ...order,
      factoryTime,
      outletAcceptance,
      actualLead,
      promisedLead,
      leadVariance: Number.isFinite(actualLead) && Number.isFinite(promisedLead) ? Math.round((actualLead - promisedLead) * 10) / 10 : null,
    };
  }), [mtoOrders, today]);
  const factoryTimeDistribution = useMemo(() => {
    const grouped = timingRows.reduce((acc, row) => {
      const value = row.factoryTime;
      const bucket = value === null ? 'Unknown' : value <= 3 ? '0-3 days' : value <= 7 ? '4-7 days' : value <= 14 ? '8-14 days' : '15+ days';
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {});
    return ['0-3 days', '4-7 days', '8-14 days', '15+ days', 'Unknown']
      .filter((label) => grouped[label])
      .map((label) => ({ label, value: grouped[label] }));
  }, [timingRows]);
  const averageFactoryTime = useMemo(() => averageOf(timingRows.map((row) => row.factoryTime)), [timingRows]);
  const averageOutletAcceptance = useMemo(() => averageOf(timingRows.map((row) => row.outletAcceptance)), [timingRows]);
  const averageLeadVariance = useMemo(() => averageOf(timingRows.map((row) => row.leadVariance)), [timingRows]);
  const timingByOutlet = useMemo(() => {
    const grouped = timingRows.reduce((acc, row) => {
      const key = row.ordered_from || 'Unknown Outlet';
      if (!acc[key]) acc[key] = { outlet: key, factoryTime: [], acceptance: [], count: 0 };
      acc[key].factoryTime.push(row.factoryTime);
      acc[key].acceptance.push(row.outletAcceptance);
      acc[key].count += 1;
      return acc;
    }, {});
    return Object.values(grouped).map((row) => ({
      outlet: row.outlet,
      avgFactoryTime: averageOf(row.factoryTime),
      avgAcceptance: averageOf(row.acceptance),
      count: row.count,
    })).sort((a, b) => a.avgFactoryTime - b.avgFactoryTime).slice(0, 12);
  }, [timingRows]);
  const promiseDiscipline = useMemo(
    () => timingByOutlet.map((row) => ({
      label: row.outlet,
      value: row.avgFactoryTime,
    })),
    [timingByOutlet]
  );
  const acceptanceByOutlet = useMemo(
    () => timingByOutlet.map((row) => ({ label: row.outlet, value: row.avgAcceptance })).sort((a, b) => b.value - a.value),
    [timingByOutlet]
  );
  const acceptanceByStaff = useMemo(() => {
    const grouped = timingRows.reduce((acc, row) => {
      const key = row.created_by_name || 'Unknown User';
      if (!acc[key]) acc[key] = [];
      acc[key].push(row.outletAcceptance);
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, values]) => ({ label, value: averageOf(values) })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [timingRows]);
  const leadTimeExceptionQueue = useMemo(
    () => timingRows.filter((row) => Number.isFinite(row.factoryTime) && row.factoryTime <= 7).sort((a, b) => a.factoryTime - b.factoryTime).slice(0, 12),
    [timingRows]
  );
  const highRiskMtoOrders = useMemo(
    () => timingRows.filter((row) => Number.isFinite(row.factoryTime) && row.factoryTime <= 7).sort((a, b) => (a.factoryTime - b.factoryTime) || Number(b.product_price || 0) - Number(a.product_price || 0)).slice(0, 8),
    [timingRows]
  );
  const promiseCompressionRows = useMemo(
    () => promiseDriftRows.filter((row) => row.beforeDue && row.afterDue && row.afterDue < row.beforeDue).slice(0, 12),
    [promiseDriftRows]
  );
  const mtoLeadTrend = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, index) => {
      const day = new Date();
      day.setDate(day.getDate() - (6 - index));
      const iso = day.toISOString().slice(0, 10);
      const rows = timingRows.filter((row) => dateOnly(row.created_at) === iso);
      return { label: iso.slice(5, 10), value: averageOf(rows.map((row) => row.factoryTime)) };
    });
    return days;
  }, [timingRows]);
  const customerWaitByOutlet = useMemo(() => {
    const grouped = timingRows.reduce((acc, row) => {
      const key = row.ordered_from || 'Unknown Outlet';
      if (!acc[key]) acc[key] = [];
      acc[key].push(daysBetween(row.order_date, row.completed_at || today));
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, values]) => ({ label, value: averageOf(values) })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [timingRows, today]);
  const refinishingCases = useMemo(() => {
    const finishReasons = ['FINISH_ISSUE', 'COLOUR_MISMATCH', 'POLISH_ISSUE', 'SURFACE_DEFECT'];
    return recoveryCases.filter((item) =>
      String(item.case_type || '').toUpperCase() === 'REPAIR'
      || finishReasons.includes(String(item.reason_code || '').toUpperCase())
      || String(item.root_cause_bucket || '').toUpperCase().includes('FINISH')
    );
  }, [recoveryCases]);
  const refinishingVolumeTrend = useMemo(() => buildNetworkTrend(refinishingCases.map((item) => ({ order_date: item.created_at }))), [refinishingCases]);
  const refinishingReasons = useMemo(() => {
    const grouped = refinishingCases.reduce((acc, item) => {
      const key = item.reason_code || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [refinishingCases]);
  const refinishingAgeing = useMemo(() => {
    const grouped = refinishingCases.reduce((acc, item) => {
      const age = daysBetween(item.created_at, item.resolved_at || today);
      const bucket = age <= 3 ? '0-3 days' : age <= 7 ? '4-7 days' : age <= 14 ? '8-14 days' : '15+ days';
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {});
    return ['0-3 days', '4-7 days', '8-14 days', '15+ days'].map((label) => ({ label, value: grouped[label] || 0 }));
  }, [refinishingCases, today]);
  const refinishingByOutlet = useMemo(() => {
    const grouped = refinishingCases.reduce((acc, item) => {
      const key = item.ordered_from || 'Unknown Outlet';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [refinishingCases]);
  const refinishingByStage = useMemo(() => {
    const ordersMap = new Map(orders.map((order) => [Number(order.id), order]));
    const grouped = refinishingCases.reduce((acc, item) => {
      const stage = ordersMap.get(Number(item.order_id))?.current_stage || 'Completed / Released';
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [refinishingCases, orders]);
  const refinishingTurnaround = useMemo(() => averageOf(refinishingCases.filter((item) => item.resolved_at).map((item) => daysBetween(item.created_at, item.resolved_at))), [refinishingCases]);
  const refinishingSlaBreaches = useMemo(
    () => refinishingCases.filter((item) => item.promised_resolution_date && dateOnly(item.promised_resolution_date) < today && item.workflow_status !== 'CLOSED').slice(0, 10),
    [refinishingCases, today]
  );
  const refinishingReopenRate = useMemo(() => {
    if (!refinishingCases.length) return 0;
    const reopened = refinishingCases.filter((item) => Number(item.reopened_count || 0) > 0).length;
    return Math.round((reopened / refinishingCases.length) * 100);
  }, [refinishingCases]);
  const refinishingCostByOutlet = useMemo(() => {
    const grouped = refinishingCases.reduce((acc, item) => {
      const key = item.ordered_from || 'Unknown Outlet';
      acc[key] = (acc[key] || 0) + Number(item.estimated_cost || 0);
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [refinishingCases]);
  const refinishingCostByReason = useMemo(() => {
    const grouped = refinishingCases.reduce((acc, item) => {
      const key = item.reason_code || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + Number(item.estimated_cost || 0);
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [refinishingCases]);
  const recoveryCostByOrderId = useMemo(() => {
    const map = new Map();
    recoveryCases.forEach((item) => {
      const key = Number(item.order_id);
      map.set(key, (map.get(key) || 0) + Number(item.estimated_cost || 0));
    });
    return map;
  }, [recoveryCases]);
  const outletProfitability = useMemo(() => {
    const grouped = orders.reduce((acc, order) => {
      const key = order.ordered_from || 'Unknown Outlet';
      if (!acc[key]) acc[key] = { outlet: key, revenue: 0, recoveryCost: 0, refinishingCost: 0, orders: 0 };
      acc[key].revenue += Number(order.product_price || 0);
      acc[key].recoveryCost += Number(recoveryCostByOrderId.get(Number(order.id)) || 0);
      acc[key].orders += 1;
      return acc;
    }, {});
    refinishingCases.forEach((item) => {
      const key = item.ordered_from || 'Unknown Outlet';
      if (!grouped[key]) grouped[key] = { outlet: key, revenue: 0, recoveryCost: 0, refinishingCost: 0, orders: 0 };
      grouped[key].refinishingCost += Number(item.estimated_cost || 0);
    });
    return Object.values(grouped).map((row) => ({
      ...row,
      estimatedMargin: Math.round((row.revenue - row.recoveryCost - row.refinishingCost) * 100) / 100,
    })).sort((a, b) => b.estimatedMargin - a.estimatedMargin).slice(0, 12);
  }, [orders, recoveryCostByOrderId, refinishingCases]);
  const orderProfitability = useMemo(() => orders
    .filter((order) => String(order.order_type || '').toUpperCase() === 'MTO')
    .map((order) => ({
      id: order.id,
      production_order_no: order.production_order_no,
      customer_name: order.customer_name,
      ordered_from: order.ordered_from,
      revenue: Number(order.product_price || 0),
      recoveryCost: Number(recoveryCostByOrderId.get(Number(order.id)) || 0),
      estimatedMargin: Math.round((Number(order.product_price || 0) - Number(recoveryCostByOrderId.get(Number(order.id)) || 0)) * 100) / 100,
    }))
    .sort((a, b) => a.estimatedMargin - b.estimatedMargin)
    .slice(0, 12), [orders, recoveryCostByOrderId]);
  const commercialLeakage = useMemo(() => {
    const grouped = {};
    (storeDelivery.pending_deliveries || []).forEach((row) => {
      const key = row.ordered_from || 'Unknown Outlet';
      grouped[key] = (grouped[key] || 0) + Number(row.outstanding_balance || 0);
    });
    recoveryCases.forEach((item) => {
      const key = item.ordered_from || 'Unknown Outlet';
      grouped[key] = (grouped[key] || 0) + Number(item.estimated_cost || 0);
    });
    return Object.entries(grouped).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [storeDelivery.pending_deliveries, recoveryCases]);
  const staffPerformance = useMemo(() => {
    const grouped = {};
    orders.forEach((order) => {
      const key = order.created_by_name || 'Unknown User';
      if (!grouped[key]) grouped[key] = { label: key, orders: 0, late: 0, acceptance: [], recovery: 0 };
      grouped[key].orders += 1;
      if (order.is_late) grouped[key].late += 1;
      const timing = timingRows.find((row) => Number(row.id) === Number(order.id));
      if (timing) grouped[key].acceptance.push(timing.outletAcceptance);
    });
    recoveryCases.forEach((item) => {
      const order = orders.find((row) => Number(row.id) === Number(item.order_id));
      const key = order?.created_by_name || 'Unknown User';
      if (!grouped[key]) grouped[key] = { label: key, orders: 0, late: 0, acceptance: [], recovery: 0 };
      grouped[key].recovery += 1;
    });
    return Object.values(grouped).map((row) => ({
      ...row,
      avgAcceptance: averageOf(row.acceptance),
      score: Math.max(0, 100 - (row.late * 6) - (row.recovery * 4) - averageOf(row.acceptance) * 3),
    })).sort((a, b) => a.score - b.score).slice(0, 12);
  }, [orders, timingRows, recoveryCases]);
  const noShowRows = useMemo(
    () => (storeDelivery.pending_deliveries || []).filter((row) => /no show|no-show|customer unavailable|failed pickup/i.test(`${row.today_update_status || ''} ${row.last_update_status || ''} ${row.today_update_notes || ''} ${row.last_update_notes || ''}`)).slice(0, 10),
    [storeDelivery.pending_deliveries]
  );
  const completedNotCollectedByOutlet = useMemo(() => {
    const grouped = (storeDelivery.pending_deliveries || []).reduce((acc, row) => {
      if (String(row.status) !== 'COMPLETED') return acc;
      const key = row.ordered_from || 'Unknown Outlet';
      if (!acc[key]) acc[key] = [];
      acc[key].push(daysBetween(row.received_in_store_at, today));
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, values]) => ({ label, value: averageOf(values) })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [storeDelivery.pending_deliveries, today]);
  const cancellationByOutlet = useMemo(() => {
    const grouped = orders.reduce((acc, order) => {
      if (String(order.status) !== 'REJECTED') return acc;
      const key = order.ordered_from || 'Unknown Outlet';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [orders]);
  const promiseAccuracyByOutlet = useMemo(() => {
    const grouped = {};
    timingRows.forEach((row) => {
      const key = row.ordered_from || 'Unknown Outlet';
      if (!grouped[key]) grouped[key] = { met: 0, total: 0 };
      if (row.completed_at) {
        grouped[key].total += 1;
        if (dateOnly(row.completed_at) <= dateOnly(row.due_date)) grouped[key].met += 1;
      }
    });
    return Object.entries(grouped).map(([label, row]) => ({ label, value: row.total ? Math.round((row.met / row.total) * 100) : 0 })).sort((a, b) => a.value - b.value).slice(0, 8);
  }, [timingRows]);
  const complaintRateByOutlet = useMemo(() => {
    const complaintGrouped = complaintQueue.reduce((acc, row) => {
      const key = row.ordered_from || 'Unknown Outlet';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return outletSummary.map((row) => ({
      label: row.outlet,
      value: row.total ? Math.round(((complaintGrouped[row.outlet] || 0) / row.total) * 100) : 0,
    })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [complaintQueue, outletSummary]);
  const vipCustomerRisk = useMemo(() => {
    const highValueOrders = orders.filter((order) => Number(order.product_price || 0) >= 25000 || order.customer_name);
    const grouped = highValueOrders.reduce((acc, order) => {
      const key = order.customer_name || 'Unknown Customer';
      if (!acc[key]) acc[key] = { customer: key, value: 0, late: 0, unpaid: 0, recovery: 0 };
      acc[key].value += Number(order.product_price || 0);
      if (order.is_late) acc[key].late += 1;
      return acc;
    }, {});
    unpaidReadyOrders.forEach((row) => {
      const key = row.customer_name || 'Unknown Customer';
      if (!grouped[key]) grouped[key] = { customer: key, value: 0, late: 0, unpaid: 0, recovery: 0 };
      grouped[key].unpaid += Number(row.outstanding_balance || 0);
    });
    recoveryCases.forEach((item) => {
      const key = item.customer_name || 'Unknown Customer';
      if (!grouped[key]) grouped[key] = { customer: key, value: 0, late: 0, unpaid: 0, recovery: 0 };
      grouped[key].recovery += 1;
    });
    return Object.values(grouped).map((row) => ({ ...row, risk: row.late * 8 + row.recovery * 6 + Math.round(row.unpaid / 1000) })).sort((a, b) => b.risk - a.risk).slice(0, 8);
  }, [orders, unpaidReadyOrders, recoveryCases]);
  const cashCollectionPressure = useMemo(() => {
    const grouped = unpaidReadyOrders.reduce((acc, row) => {
      const key = row.ordered_from || 'Unknown Outlet';
      if (!acc[key]) acc[key] = 0;
      acc[key] += Number(row.outstanding_balance || 0);
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value: Math.round(value) })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [unpaidReadyOrders]);
  const releaseBlockDashboard = useMemo(() => {
    const grouped = {};
    (storeDelivery.pending_deliveries || []).forEach((row) => {
      let key = 'NO_CUSTOMER_UPDATE';
      if (Number(row.outstanding_balance || 0) > 0) key = 'UNPAID_BALANCE';
      else if (/complaint|escalat/i.test(`${row.today_update_status || ''} ${row.last_update_status || ''}`)) key = 'COMPLAINT';
      else if (/no show|failed pickup|customer unavailable/i.test(`${row.today_update_status || ''} ${row.last_update_status || ''} ${row.today_update_notes || ''} ${row.last_update_notes || ''}`)) key = 'NO_SHOW';
      else if (row.today_update_status || row.last_update_status) key = row.today_update_status || row.last_update_status;
      grouped[key] = (grouped[key] || 0) + 1;
    });
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [storeDelivery.pending_deliveries]);
  const communicationCompliance = useMemo(() => {
    const grouped = (storeDelivery.pending_deliveries || []).reduce((acc, row) => {
      const key = row.ordered_from || 'Unknown Outlet';
      if (!acc[key]) acc[key] = { updated: 0, total: 0 };
      acc[key].total += 1;
      if (row.today_update_status) acc[key].updated += 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, row]) => ({ label, value: row.total ? Math.round((row.updated / row.total) * 100) : 0 })).sort((a, b) => a.value - b.value).slice(0, 8);
  }, [storeDelivery.pending_deliveries]);
  const followupAgeing = useMemo(() => {
    const grouped = (storeDelivery.pending_deliveries || []).reduce((acc, row) => {
      const lastUpdate = row.today_update_at || row.last_update_at || row.received_in_store_at;
      const age = daysBetween(lastUpdate, today);
      const bucket = age <= 1 ? '0-1 day' : age <= 3 ? '2-3 days' : age <= 7 ? '4-7 days' : '8+ days';
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, {});
    return ['0-1 day', '2-3 days', '4-7 days', '8+ days'].map((label) => ({ label, value: grouped[label] || 0 }));
  }, [storeDelivery.pending_deliveries, today]);
  const outletStageBacklogHeat = useMemo(() => {
    const grouped = orders.reduce((acc, order) => {
      const key = `${order.ordered_from || 'Unknown Outlet'}__${order.current_stage || 'Completed / Released'}`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([compound, value]) => {
      const [outlet, stage] = compound.split('__');
      return { outlet, cause: stage, value };
    }).sort((a, b) => b.value - a.value).slice(0, 18);
  }, [orders]);
  const handoffBreachReport = useMemo(
    () => timingRows.filter((row) => Number.isFinite(row.outletAcceptance) && row.outletAcceptance > 1).sort((a, b) => b.outletAcceptance - a.outletAcceptance).slice(0, 12),
    [timingRows]
  );
  const modificationFrequency = useMemo(() => {
    const orderLookup = new Map(orders.map((order) => [Number(order.id), order]));
    const grouped = changeLogs.reduce((acc, log) => {
      const order = orderLookup.get(Number(log.order_id));
      const key = order?.production_order_no || `Order ${log.order_id}`;
      if (!acc[key]) acc[key] = { label: key, outlet: order?.ordered_from || 'Unknown Outlet', value: 0 };
      acc[key].value += 1;
      return acc;
    }, {});
    return Object.values(grouped).sort((a, b) => b.value - a.value).slice(0, 10);
  }, [changeLogs, orders]);
  const measurementError = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      if (String(item.reason_code || '').toUpperCase() !== 'SIZE_ISSUE') return acc;
      const key = item.ordered_from || 'Unknown Outlet';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [recoveryCases]);
  const replacementAccountability = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      if ((String(item.case_type || '').toUpperCase() === 'REMAKE' ? 'REPLACEMENT' : String(item.case_type || '').toUpperCase()) !== 'REPLACEMENT') return acc;
      const key = item.ordered_from || 'Unknown Outlet';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [recoveryCases]);
  const serviceQualityScore = useMemo(() => outletSummary.map((outlet) => {
    const accuracy = promiseAccuracyByOutlet.find((row) => row.label === outlet.outlet)?.value || 0;
    const complaint = complaintRateByOutlet.find((row) => row.label === outlet.outlet)?.value || 0;
    const communication = communicationCompliance.find((row) => row.label === outlet.outlet)?.value || 0;
    const replacements = replacementAccountability.find((row) => row.label === outlet.outlet)?.value || 0;
    const score = Math.max(0, Math.round(accuracy * 0.45 + communication * 0.35 - complaint * 1.2 - replacements * 4));
    return { outlet: outlet.outlet, score, accuracy, communication, complaint, replacements };
  }).sort((a, b) => a.score - b.score).slice(0, 10), [outletSummary, promiseAccuracyByOutlet, complaintRateByOutlet, communicationCompliance, replacementAccountability]);
  const monthlyTrend = useMemo(() => {
    const grouped = orders.reduce((acc, order) => {
      const key = dateOnly(order.order_date).slice(0, 7);
      if (!key) return acc;
      if (!acc[key]) acc[key] = { booked: 0, late: 0, completed: 0, complaints: 0 };
      acc[key].booked += 1;
      if (order.is_late) acc[key].late += 1;
      if (['COMPLETED', 'SHIPPED'].includes(order.status)) acc[key].completed += 1;
      return acc;
    }, {});
    complaintQueue.forEach((row) => {
      const key = dateOnly(row.order_date).slice(0, 7);
      if (!key) return;
      if (!grouped[key]) grouped[key] = { booked: 0, late: 0, completed: 0, complaints: 0 };
      grouped[key].complaints += 1;
    });
    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).slice(-6).map(([label, row]) => ({ label, value: row.booked, late: row.late, completed: row.completed, complaints: row.complaints }));
  }, [orders, complaintQueue]);
  const notificationRuleDrafts = useMemo(() => ({
    late: Number(settingsMap.LATE_ORDER_ALERT_THRESHOLD?.count || 5),
    collection: Number(settingsMap.COLLECTION_ALERT_THRESHOLD?.amount || 50000),
    complaint: Number(settingsMap.COMPLAINT_RATE_ALERT_THRESHOLD?.percent || 10),
  }), [settingsMap]);
  const deliverySuccessByOutlet = useMemo(() => {
    const grouped = (recoveryData.delivery_updates || []).reduce((acc, row) => {
      const key = row.ordered_from || 'Unknown Outlet';
      if (!acc[key]) acc[key] = { delivered: 0, total: 0 };
      acc[key].total += 1;
      if (String(row.customer_status || '').toUpperCase() === 'DELIVERED') acc[key].delivered += 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, row]) => ({ label, value: row.total ? Math.round((row.delivered / row.total) * 100) : 0 })).sort((a, b) => a.value - b.value).slice(0, 8);
  }, [recoveryData.delivery_updates]);
  const selectedRecoveryCase = useMemo(
    () => recoveryCases.find((item) => Number(item.id) === Number(selectedRecoveryCaseId)) || null,
    [recoveryCases, selectedRecoveryCaseId]
  );
  const detailOrderRecoveryCases = useMemo(
    () => recoveryCases
      .filter((item) => Number(item.original_order_id || item.order_id) === Number(detailOrder?.id))
      .sort((a, b) => Number(a.replacement_sequence || 1) - Number(b.replacement_sequence || 1)),
    [recoveryCases, detailOrder]
  );
  const draftRecoveryOrder = useMemo(
    () => orders.find((item) => item.production_order_no === recoveryDraft.productionOrderNo) || null,
    [orders, recoveryDraft.productionOrderNo]
  );
  const draftReplacementChain = useMemo(
    () => recoveryCases
      .filter((item) => Number(item.original_order_id || item.order_id) === Number(draftRecoveryOrder?.id))
      .sort((a, b) => Number(a.replacement_sequence || 1) - Number(b.replacement_sequence || 1)),
    [recoveryCases, draftRecoveryOrder]
  );
  const detailCustomerRecoveryHistory = useMemo(
    () => recoveryCases.filter((item) => item.customer_name && item.customer_name === detailOrder?.customer_name).slice(0, 8),
    [recoveryCases, detailOrder]
  );
  const headWorkspaceButtons = [
    { id: 'overview', label: 'Overview' },
    { id: 'outlets', label: 'Outlets' },
    { id: 'risk', label: 'Risk' },
    { id: 'timing', label: 'Timing' },
    { id: 'refinishing', label: 'Refinishing' },
    { id: 'recovery', label: 'Replacement' },
    { id: 'roster', label: 'Roster' },
  ];

  return (
    <section className="module-page retail-page">
      <div className="module-hero retail-hero">
        <div>
          <p className="module-kicker">Retail Command</p>
          <h2>{isShopManager ? `${user.outlet_name} Shop Manager Workspace` : 'Retail Head Workspace'}</h2>
          <p className="module-subtitle">
            {isShopManager
              ? 'Run daily store operations, customer commitments, and pickup readiness for your outlet.'
              : 'Oversee outlet performance, network delays, and customer promise-date risk without mixing in shop-floor task views.'}
          </p>
        </div>
        <div className="retail-hero-actions">
          {isShopManager && (
            <>
              <button type="button" onClick={() => onCreateOrder?.('MTO')}>New MTO</button>
              <button type="button" onClick={() => onCreateOrder?.('REFURBISHMENT')}>New Refurbishment</button>
              <button type="button" onClick={() => onCreateOrder?.('RETURN')}>New Return</button>
            </>
          )}
          <button
            type="button"
            className="button-secondary"
            onClick={() => window.open(`${window.location.origin}?page=sales-report`, '_blank', 'noopener,noreferrer')}
          >
            Sales Report
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => window.open(`${window.location.origin}?page=store-delivery`, '_blank', 'noopener,noreferrer')}
          >
            MTO Received
          </button>
          {!isShopManager && (
            <>
              <button
                type="button"
                className="button-secondary"
                onClick={exportRetailHeadPack}
              >
                Export Pack
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={printRetailHeadSummary}
              >
                Print Summary
              </button>
            </>
          )}
        </div>
      </div>

      <div className="retail-filter-shell">
        <label className="retail-filter-field retail-filter-field-search">
          <span>Search</span>
          <div className="retail-search-box">
            <span className="retail-search-icon" aria-hidden="true">Search</span>
            <input
              placeholder="Search by order number, customer, or phone"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            />
            {filters.search ? (
              <button
                type="button"
                className="retail-search-clear"
                onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}
              >
                Clear
              </button>
            ) : null}
          </div>
        </label>
        <label className="retail-filter-field">
          <span>Date From</span>
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))} />
        </label>
        <label className="retail-filter-field">
          <span>Date To</span>
          <input type="date" value={filters.dateTo} onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))} />
        </label>
        {!isOutletUser && (
          <label className="retail-filter-field">
            <span>Outlet</span>
            <select multiple value={filters.outlets} onChange={onOutletsChange} className="multi-select retail-multi-select">
              {outlets.map((outlet) => <option key={outlet} value={outlet}>{outlet}</option>)}
            </select>
          </label>
        )}
        <label className="retail-filter-field">
          <span>Status</span>
          <select value={filters.status} onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}>
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PRODUCTION">In production</option>
            <option value="COMPLETED">Completed</option>
            <option value="REJECTED">Rejected</option>
            <option value="SHIPPED">Shipped</option>
          </select>
        </label>
        <div className="retail-filter-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => setFilters({
              dateFrom: '',
              dateTo: '',
              outlets: [],
              status: '',
              search: '',
            })}
          >
            Reset Filters
          </button>
        </div>
      </div>

      {isShopManager ? (
        <>
          <RetailKpis
            summary={data.summary || {}}
            attentionCount={attentionOrders.length}
            dueTodayCount={dueTodayOrders.length}
          />

          <div className="retail-story-grid">
            <div className="retail-panel retail-panel-highlight">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Attention Queue</p>
                  <h3>Orders needing retail follow-up</h3>
                </div>
              </div>
              <div className="retail-queue-list">
                {attentionOrders.map((order) => (
                  <article key={order.id} className="retail-queue-card">
                    <div className="retail-queue-head">
                      <div>
                        <strong>{order.production_order_no}</strong>
                        <p>{order.customer_name}</p>
                      </div>
                      <label className={`production-chip ${order.is_late ? 'critical' : 'high'}`}>
                        {order.is_late ? 'Late' : order.status}
                      </label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{order.ordered_from}</span>
                      <span>{order.current_stage || 'Awaiting production start'}</span>
                      <span>{formatDueState(order)}</span>
                    </div>
                  </article>
                ))}
                {attentionOrders.length === 0 && (
                  <article className="retail-queue-card retail-queue-card-empty">
                    <strong>No urgent retail exceptions</strong>
                    <p>Late, pending, and rejected orders will surface here automatically.</p>
                  </article>
                )}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Today&apos;s Commitments</p>
                  <h3>Orders due today</h3>
                </div>
              </div>
              <div className="retail-queue-list">
                {dueTodayOrders.map((order) => (
                  <article key={order.id} className="retail-queue-card">
                    <div className="retail-queue-head">
                      <div>
                        <strong>{order.production_order_no}</strong>
                        <p>{order.customer_name}</p>
                      </div>
                      <label className="production-chip neutral">{order.status}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{order.ordered_from}</span>
                      <span>{order.current_stage || '-'}</span>
                      <span>{formatDueState(order)}</span>
                    </div>
                  </article>
                ))}
                {dueTodayOrders.length === 0 && (
                  <article className="retail-queue-card retail-queue-card-empty">
                    <strong>No orders due today</strong>
                    <p>Orders landing on today&apos;s commitment date will appear here.</p>
                  </article>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="retail-head-shell">
            <aside className="retail-head-sidebar">
              <div className="retail-head-sidebar-copy">
                <p className="retail-panel-kicker">Retail Head</p>
                <strong>Network Control</strong>
                <p>Navigate executive summary, outlet pressure, risk, and network roster from one fixed control rail.</p>
              </div>
              <div className="production-sidebar-nav retail-head-sidebar-nav" role="tablist" aria-label="Retail head workspaces">
                {headWorkspaceButtons.map((workspace) => (
                  <button
                    key={workspace.id}
                    type="button"
                    className={`production-nav-btn ${headWorkspace === workspace.id ? 'active' : ''}`}
                    onClick={() => setHeadWorkspace(workspace.id)}
                  >
                    {workspace.label}
                  </button>
                ))}
              </div>
            </aside>

            <div className="retail-head-main">
          <div hidden={headWorkspace !== 'overview'}>
          <div className="retail-alert-grid">
            {alertCenter.map((alert) => (
              <article key={alert.title} className={`retail-alert-card ${alert.severity}`}>
                <span>{alert.title}</span>
                <strong>{alert.note}</strong>
              </article>
            ))}
          </div>
          <div className="retail-head-command">
            <div className="retail-head-command-copy">
              <p className="retail-panel-kicker">Executive Focus</p>
              <h3>
                {promiseBuckets.overdue > 0
                  ? `${promiseBuckets.overdue} overdue orders are the main customer risk right now.`
                  : 'No overdue customer commitments at the moment.'}
              </h3>
              <p>
                {mostExposedOutlet
                  ? `${mostExposedOutlet.outlet} is currently the most exposed outlet with ${mostExposedOutlet.late} late orders and ${mostExposedOutlet.dueToday} due today.`
                  : 'Outlet pressure will appear here once network order volume is available.'}
              </p>
            </div>
            <div className="retail-head-command-metrics">
              <article className="retail-head-command-card">
                <span>Release Ready</span>
                <strong>{releaseReadyCount}</strong>
                <p>Orders available for store handover.</p>
              </article>
              <article className="retail-head-command-card">
                <span>Blocked</span>
                <strong>{blockedCount}</strong>
                <p>Orders still pending or rejected.</p>
              </article>
              <article className="retail-head-command-card">
                <span>Most Exposed Outlet</span>
                <strong>{mostExposedOutlet?.outlet || 'None'}</strong>
                <p>{mostExposedOutlet ? `${mostExposedOutlet.late} late / ${mostExposedOutlet.total} total` : 'No outlet signal yet.'}</p>
              </article>
            </div>
          </div>

          <RetailHeadKpis
            summary={data.summary || {}}
            outletCount={outletSummary.length}
            delayedOutletCount={delayedOutlets.length}
            dueTodayCount={dueTodayOrders.length}
          />

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Promise Risk</p>
                  <h3>Customer commitment windows</h3>
                </div>
              </div>
              <div className="retail-mini-kpis">
                <article className="retail-mini-kpi"><span>Overdue</span><strong>{promiseBuckets.overdue}</strong></article>
                <article className="retail-mini-kpi"><span>Today</span><strong>{promiseBuckets.today}</strong></article>
                <article className="retail-mini-kpi"><span>Tomorrow</span><strong>{promiseBuckets.tomorrow}</strong></article>
                <article className="retail-mini-kpi"><span>This Week</span><strong>{promiseBuckets.thisWeek}</strong></article>
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Status Mix</p>
                  <h3>Network order distribution</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {statusMix.map((row) => (
                  <article key={row.status} className="retail-status-row">
                    <span>{row.status.replace('_', ' ')}</span>
                    <strong>{row.count}</strong>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <LineChartCard title="7-Day Network Booking Trend" points={networkTrend} format="number" />
            <BarChartCard title="Outlet Delay Ranking" data={outletDelayRanking} yLabel="Late orders" format="number" />
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Conversion Funnel</p>
                  <h3>Booking to delivery movement</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {conversionFunnel.map((row) => (
                  <article key={row.label} className="retail-status-row">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </article>
                ))}
                <article className="retail-status-row">
                  <span>Cancelled / Rejected</span>
                  <strong>{cancelledOrders}</strong>
                </article>
                <article className="retail-status-row">
                  <span>Promise Attainment</span>
                  <strong>{promiseAttainment}%</strong>
                </article>
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Delivery Waterfall</p>
                  <h3>Current retail-delivery status mix</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {deliveryStatusWaterfall.map((row) => (
                  <article key={row.label} className="retail-status-row">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-story-grid">
            <div className="retail-panel retail-panel-highlight">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Outlet Pressure</p>
                  <h3>Outlets carrying delay risk</h3>
                </div>
              </div>
              <div className="retail-queue-list">
                {delayedOutlets.map((row, index) => (
                  <article
                    key={row.outlet}
                    className="retail-queue-card retail-queue-card-clickable"
                    onClick={() => openOutletDetail(row.outlet)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openOutletDetail(row.outlet);
                      }
                    }}
                  >
                    <div className="retail-queue-head">
                      <div>
                        <span className="retail-rank-badge">#{index + 1}</span>
                        <strong>{row.outlet}</strong>
                        <p>{row.total} active orders in scope</p>
                      </div>
                      <label className="production-chip critical">{row.late} late</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.inProduction} in production</span>
                      <span>{row.completed} completed</span>
                      <span>{row.dueToday} due today</span>
                    </div>
                  </article>
                ))}
                {delayedOutlets.length === 0 && (
                  <article className="retail-queue-card retail-queue-card-empty">
                    <strong>No delayed outlets</strong>
                    <p>Outlet delay hotspots will appear here automatically.</p>
                  </article>
                )}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Release Readiness</p>
                  <h3>Orders ready for outlet handover</h3>
                </div>
              </div>
              <div className="retail-queue-list">
                {readyOrders.map((order) => (
                  <article key={order.id} className="retail-queue-card">
                    <div className="retail-queue-head">
                      <div>
                        <strong>{order.production_order_no}</strong>
                        <p>{order.customer_name}</p>
                      </div>
                      <label className="production-chip stable">{order.status}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{order.ordered_from}</span>
                      <span>{dateOnly(order.due_date) || '-'}</span>
                      <span>{order.current_stage || 'Completed'}</span>
                    </div>
                  </article>
                ))}
                {readyOrders.length === 0 && (
                  <article className="retail-queue-card retail-queue-card-empty">
                    <strong>No ready orders</strong>
                    <p>Completed or shipped orders will appear here for head-office visibility.</p>
                  </article>
                )}
              </div>
            </div>
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Outlet Service Quality Composite Score" data={serviceQualityScore.map((row) => ({ label: row.outlet, value: row.score }))} yLabel="Score" format="number" />
            <BarChartCard title="Outlet Profitability Estimate" data={outletProfitability.map((row) => ({ label: row.outlet, value: row.estimatedMargin }))} yLabel="Margin" format="currency" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Retail Cash Collection Pressure" data={cashCollectionPressure} yLabel="Outstanding" format="currency" />
            <LineChartCard title="Monthly Retail Trend" points={monthlyTrend.map((row) => ({ label: row.label, value: row.value }))} format="number" />
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Alert Rules</p>
                  <h3>Retail-head notification thresholds</h3>
                </div>
              </div>
              <div className="retail-form-grid">
                <label><span>Late Order Alert Count</span><input type="number" defaultValue={notificationRuleDrafts.late} onBlur={(e) => saveRecoverySetting('LATE_ORDER_ALERT_THRESHOLD', { count: Number(e.target.value || 0) })} /></label>
                <label><span>Collection Alert Amount</span><input type="number" defaultValue={notificationRuleDrafts.collection} onBlur={(e) => saveRecoverySetting('COLLECTION_ALERT_THRESHOLD', { amount: Number(e.target.value || 0) })} /></label>
                <label><span>Complaint Rate Alert %</span><input type="number" defaultValue={notificationRuleDrafts.complaint} onBlur={(e) => saveRecoverySetting('COMPLAINT_RATE_ALERT_THRESHOLD', { percent: Number(e.target.value || 0) })} /></label>
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Commercial Leakage</p>
                  <h3>Value erosion by outlet</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {commercialLeakage.map((row) => (
                  <article key={row.label} className="retail-status-row">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">MTO Profitability By Order</p>
                  <h3>Orders with weakest margin after recovery burden</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {orderProfitability.map((row) => (
                  <article key={row.id} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div><strong>{row.production_order_no}</strong><p>{row.customer_name}</p></div>
                      <label className={`production-chip ${row.estimatedMargin < 0 ? 'critical' : row.estimatedMargin < 10000 ? 'high' : 'stable'}`}>{row.estimatedMargin}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.ordered_from}</span>
                      <span>Revenue {Math.round(row.revenue)}</span>
                      <span>Recovery {Math.round(row.recoveryCost)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Delivery Success Rate</p>
                  <h3>Delivered update success by outlet</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {deliverySuccessByOutlet.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}%</strong></article>
                ))}
              </div>
            </div>
          </div>
          </div>

          <div hidden={headWorkspace !== 'outlets'}>
          <div className="retail-panel">
            <div className="retail-panel-head">
              <div>
                <p className="retail-panel-kicker">Outlet Network Board</p>
                <h3>Outlet-by-outlet operating picture</h3>
              </div>
              <button type="button" className="button-secondary" onClick={() => exportOutletRankingCsv(outletSummary.slice(0, 12))}>
                Export Ranking
              </button>
            </div>
            <div className="retail-network-board">
              {outletSummary.slice(0, 12).map((row, index) => (
                <article
                  key={row.outlet}
                  className="retail-network-card retail-network-card-clickable"
                  onClick={() => openOutletDetail(row.outlet)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openOutletDetail(row.outlet);
                    }
                  }}
                >
                  <div className="retail-queue-head">
                    <div>
                      <span className="retail-rank-badge">#{index + 1}</span>
                      <strong>{row.outlet}</strong>
                      <p>{row.total} orders visible</p>
                    </div>
                    <label className={`production-chip ${row.late > 0 ? 'critical' : 'stable'}`}>
                      {row.late > 0 ? `${row.late} late` : 'Stable'}
                    </label>
                  </div>
                  <div className="retail-queue-meta">
                    <span>{row.inProduction} in production</span>
                    <span>{row.completed} completed</span>
                    <span>{row.dueToday} due today</span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Outlet Scorecards</p>
                  <h3>Weighted outlet operating score</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {outletScorecards.slice(0, 8).map((row) => (
                  <article key={row.outlet} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div>
                        <strong>{row.outlet}</strong>
                        <p>Attainment {row.attainment}%</p>
                      </div>
                      <label className={`production-chip ${row.score < 65 ? 'critical' : row.score < 85 ? 'high' : 'stable'}`}>
                        Score {row.score}
                      </label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.late} late</span>
                      <span>{row.dueToday} due today</span>
                      <span>{row.total} total</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Outlet SLA Board</p>
                  <h3>Outlet-by-outlet service state</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {slaBoard.slice(0, 8).map((row) => (
                  <article key={row.outlet} className="retail-status-row">
                    <span>{row.outlet} · {row.sla}</span>
                    <strong>{row.late} late / {row.dueToday} today</strong>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-panel">
            <div className="retail-panel-head">
              <div>
                <p className="retail-panel-kicker">Outlet Heatmap</p>
                <h3>Delay concentration by outlet</h3>
              </div>
            </div>
            <div className="retail-heatmap-grid">
              {outletSummary.slice(0, 12).map((row) => (
                <article key={row.outlet} className={`retail-heatmap-cell ${buildHeatClass(row.late)}`}>
                  <span>{row.outlet}</span>
                  <strong>{row.late}</strong>
                </article>
              ))}
            </div>
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Promise Accuracy By Outlet" data={promiseAccuracyByOutlet} yLabel="On-time %" format="number" />
            <BarChartCard title="Complaint Rate By Outlet" data={complaintRateByOutlet} yLabel="Complaint %" format="number" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Completed-Not-Collected Ageing By Outlet" data={completedNotCollectedByOutlet} yLabel="Avg days" format="number" />
            <BarChartCard title="Outlet Staff Performance Score" data={staffPerformance.map((row) => ({ label: row.label, value: row.score }))} yLabel="Score" format="number" />
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Outlet Profitability Detail</p>
                  <h3>Revenue vs recovery/refinishing burden</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {outletProfitability.slice(0, 8).map((row) => (
                  <article key={row.outlet} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div><strong>{row.outlet}</strong><p>{row.orders} orders</p></div>
                      <label className={`production-chip ${row.estimatedMargin < 0 ? 'critical' : row.estimatedMargin < 50000 ? 'high' : 'stable'}`}>{row.estimatedMargin}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>Revenue {Math.round(row.revenue)}</span>
                      <span>Recovery {Math.round(row.recoveryCost)}</span>
                      <span>Refinishing {Math.round(row.refinishingCost)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Outlet Comparison Matrix</p>
                  <h3>Composite comparison across service, complaints, and communication</h3>
                </div>
              </div>
              <div className="retail-heatmap-grid">
                {serviceQualityScore.map((row) => (
                  <article key={row.outlet} className={`retail-heatmap-cell ${buildHeatClass(Math.max(0, 10 - Math.round(row.score / 10)))}`}>
                    <span>{row.outlet}</span>
                    <strong>{row.score}</strong>
                    <p>{row.accuracy}% on-time / {row.communication}% communication</p>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-panel">
            <div className="retail-panel-head">
              <div>
                <p className="retail-panel-kicker">Outlet Backlog Heatmap By Stage</p>
                <h3>Where outlet backlog is stuck operationally</h3>
              </div>
            </div>
            <div className="retail-heatmap-grid">
              {outletStageBacklogHeat.map((row, index) => (
                <article key={`${row.outlet}-${row.cause}-${index}`} className={`retail-heatmap-cell ${buildHeatClass(row.value)}`}>
                  <span>{row.outlet}</span>
                  <strong>{row.cause}</strong>
                  <p>{row.value} orders</p>
                </article>
              ))}
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Cancellation Pressure</p>
                  <h3>Rejected orders by outlet</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {cancellationByOutlet.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}</strong></article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Measurement Error</p>
                  <h3>Recovery cases driven by sizing/measurement issues</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {measurementError.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}</strong></article>
                ))}
              </div>
            </div>
          </div>
          </div>

          <div hidden={headWorkspace !== 'risk'}>
          <div className="retail-story-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Risk Watchlist</p>
                  <h3>Orders most likely to trigger escalation</h3>
                </div>
              </div>
              <div className="retail-queue-list">
                {topRiskOrders.map((order) => (
                  <article key={order.id} className="retail-queue-card">
                    <div className="retail-queue-head">
                      <div>
                        <strong>{order.production_order_no}</strong>
                        <p>{order.customer_name}</p>
                      </div>
                      <label className={`production-chip ${order.is_late ? 'critical' : 'high'}`}>
                        {order.is_late ? 'Overdue' : 'Due today'}
                      </label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{order.ordered_from}</span>
                      <span>{order.current_stage || 'Awaiting assignment'}</span>
                      <span>{formatDueState(order)}</span>
                    </div>
                  </article>
                ))}
                {topRiskOrders.length === 0 && (
                  <article className="retail-queue-card retail-queue-card-empty">
                    <strong>No immediate risk orders</strong>
                    <p>Overdue and due-today customer risks will appear here.</p>
                  </article>
                )}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Priority Outlets</p>
                  <h3>Where head office should intervene first</h3>
                </div>
              </div>
              <div className="retail-queue-list">
                {outletSummary.slice(0, 5).map((row, index) => (
                  <article
                    key={row.outlet}
                    className="retail-queue-card retail-queue-card-clickable"
                    onClick={() => openOutletDetail(row.outlet)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openOutletDetail(row.outlet);
                      }
                    }}
                  >
                    <div className="retail-queue-head">
                      <div>
                        <span className="retail-rank-badge">#{index + 1}</span>
                        <strong>{row.outlet}</strong>
                        <p>{row.total} active orders</p>
                      </div>
                      <label className={`production-chip ${row.late > 0 ? 'critical' : row.dueToday > 0 ? 'high' : 'stable'}`}>
                        {row.late > 0 ? `${row.late} late` : row.dueToday > 0 ? `${row.dueToday} due today` : 'Stable'}
                      </label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.inProduction} in production</span>
                      <span>{row.completed} completed</span>
                      <span>{row.dueToday} due today</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Customer Risk</p>
                  <h3>Top customers by repeated delay pressure</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {customerRiskRows.map((row) => (
                  <article key={row.customer} className="retail-status-row">
                    <span>{row.customer}</span>
                    <strong>Risk {row.risk}</strong>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Repeat Delay Customers</p>
                  <h3>Customers with 2+ overdue orders</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {repeatDelayCustomers.map((row) => (
                  <article key={row.customer} className="retail-status-row">
                    <span>{row.customer}</span>
                    <strong>{row.overdue} overdue</strong>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Recovery Cases</p>
                  <h3>Customers needing recovery attention</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {recoveryCustomers.map((row) => (
                  <article key={row.customer} className="retail-status-row">
                    <span>{row.customer}</span>
                    <strong>{row.rejected} rejected / {row.total} total</strong>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Follow-up Productivity</p>
                  <h3>Outlet response activity for today</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {followupProductivity.map((row) => (
                  <article key={row.outlet} className="retail-status-row">
                    <span>{row.outlet}</span>
                    <strong>{row.updated} updated / {row.pending} pending</strong>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Promise-Date Drift</p>
                  <h3>Recent due-date changes</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {promiseDriftRows.map((row) => (
                  <article key={row.id} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div>
                        <strong>{row.orderNo}</strong>
                        <p>{row.customer}</p>
                      </div>
                      <label className="production-chip high">{row.outlet}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.beforeDue} -> {row.afterDue}</span>
                      <span>{row.changedAt}</span>
                      <span>{row.changedBy}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Complaint / Escalation Queue</p>
                  <h3>Delivery notes needing intervention</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {complaintQueue.map((row) => (
                  <article key={row.id} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div>
                        <strong>{row.production_order_no}</strong>
                        <p>{row.customer_name}</p>
                      </div>
                      <label className="production-chip critical">{row.today_update_status || row.last_update_status || 'Flagged'}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.ordered_from}</span>
                      <span>{row.today_update_notes || row.last_update_notes || 'No notes'}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Unpaid Ready Orders</p>
                  <h3>Orders blocked on balance collection</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {unpaidReadyOrders.map((row) => (
                  <article key={row.id} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div>
                        <strong>{row.production_order_no}</strong>
                        <p>{row.customer_name}</p>
                      </div>
                      <label className="production-chip critical">{Number(row.outstanding_balance || 0).toFixed(2)}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.ordered_from}</span>
                      <span>{dateOnly(row.due_date)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Release Hold Reasons</p>
                  <h3>Why ready orders are not closing out</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {readyReleaseHoldReasons.map((row) => (
                  <article key={row.label} className="retail-status-row">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Communication Compliance By Outlet" data={communicationCompliance} yLabel="Updated %" format="number" />
            <DonutChartCard title="Delivery Follow-up Ageing" data={followupAgeing} totalLabel="Orders" />
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">VIP Customer Risk</p>
                  <h3>High-value customers under service pressure</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {vipCustomerRisk.map((row) => (
                  <article key={row.customer} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div><strong>{row.customer}</strong><p>Value {Math.round(row.value)}</p></div>
                      <label className="production-chip critical">Risk {row.risk}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.late} late</span>
                      <span>{Math.round(row.unpaid)} unpaid</span>
                      <span>{row.recovery} recovery</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Pickup No-Show Report</p>
                  <h3>Customers not collecting or unavailable for handover</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {noShowRows.map((row) => (
                  <article key={row.id} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div><strong>{row.production_order_no}</strong><p>{row.customer_name}</p></div>
                      <label className="production-chip critical">No Show</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.ordered_from}</span>
                      <span>{row.today_update_notes || row.last_update_notes || 'No note'}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Retail-To-Factory Handoff Breaches</p>
                  <h3>Orders delayed before reaching production</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {handoffBreachReport.map((row) => (
                  <article key={row.id} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div><strong>{row.production_order_no}</strong><p>{row.customer_name}</p></div>
                      <label className="production-chip high">{row.outletAcceptance}d lag</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.ordered_from}</span>
                      <span>Factory time {row.factoryTime ?? '-'}</span>
                      <span>{row.created_by_name || 'Unknown user'}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Order Modification Frequency</p>
                  <h3>Orders repeatedly changed after booking</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {modificationFrequency.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}</strong></article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Outlet Replacement Accountability</p>
                  <h3>Outlets driving replacement burden</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {replacementAccountability.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}</strong></article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Release-Block Dashboard</p>
                  <h3>Why completed/ready orders are not closing out</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {releaseBlockDashboard.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}</strong></article>
                ))}
              </div>
            </div>
          </div>
          </div>
            </div>
          </div>

          <div hidden={headWorkspace !== 'timing'}>
            <div className="retail-alert-grid">
              <article className="retail-alert-card high"><span>Avg Factory Time Given</span><strong>{averageFactoryTime} days average production window granted to factory.</strong></article>
              <article className="retail-alert-card moderate"><span>Avg Outlet Acceptance</span><strong>{averageOutletAcceptance} days average outlet acceptance / booking lag.</strong></article>
              <article className="retail-alert-card high"><span>Lead Variance</span><strong>{averageLeadVariance} days average lead variance against promise.</strong></article>
              <article className="retail-alert-card critical"><span>Lead-Time Exceptions</span><strong>{leadTimeExceptionQueue.length} MTO orders were given 7 days or less.</strong></article>
            </div>

            <div className="chart-grid two-col production-chart-grid">
              <DonutChartCard title="Factory Time Distribution" data={factoryTimeDistribution} totalLabel="MTOs" />
              <LineChartCard title="MTO Lead-Time Trend" points={mtoLeadTrend} format="number" />
            </div>

            <div className="chart-grid two-col production-chart-grid">
              <BarChartCard title="Average Days Given To Factory By Outlet" data={promiseDiscipline} yLabel="Days" format="number" />
              <BarChartCard title="Average Outlet Acceptance Delay By Outlet" data={acceptanceByOutlet} yLabel="Days" format="number" />
            </div>

            <div className="chart-grid two-col production-chart-grid">
              <BarChartCard title="Average Outlet Acceptance Delay By Staff" data={acceptanceByStaff} yLabel="Days" format="number" />
              <BarChartCard title="Customer Wait Time By Outlet" data={customerWaitByOutlet} yLabel="Days" format="number" />
            </div>

            <div className="retail-head-mini-grid">
              <div className="retail-panel">
                <div className="retail-panel-head">
                  <div>
                    <p className="retail-panel-kicker">Lead-Time Exception Queue</p>
                    <h3>Orders that gave the factory too little time</h3>
                  </div>
                </div>
                <div className="retail-network-board">
                  {leadTimeExceptionQueue.map((row) => (
                    <article key={row.id} className="retail-network-card">
                      <div className="retail-queue-head">
                        <div><strong>{row.production_order_no}</strong><p>{row.customer_name}</p></div>
                        <label className="production-chip critical">{row.factoryTime}d</label>
                      </div>
                      <div className="retail-queue-meta">
                        <span>{row.ordered_from}</span>
                        <span>Accepted {row.outletAcceptance ?? 0}d</span>
                        <span>Due {dateOnly(row.due_date)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="retail-panel">
                <div className="retail-panel-head">
                  <div>
                    <p className="retail-panel-kicker">Promise-Date Compression</p>
                    <h3>Orders whose promise date was tightened after booking</h3>
                  </div>
                </div>
                <div className="retail-network-board">
                  {promiseCompressionRows.map((row) => (
                    <article key={row.id} className="retail-network-card">
                      <div className="retail-queue-head">
                        <div><strong>{row.orderNo}</strong><p>{row.customer}</p></div>
                        <label className="production-chip high">{row.outlet}</label>
                      </div>
                      <div className="retail-queue-meta">
                        <span>{row.beforeDue} -> {row.afterDue}</span>
                        <span>{row.changedBy}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">High-Risk MTO Orders</p>
                  <h3>Short factory window plus order value pressure</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {highRiskMtoOrders.map((row) => (
                  <article key={row.id} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div><strong>{row.production_order_no}</strong><p>{row.customer_name}</p></div>
                      <label className="production-chip critical">{row.factoryTime}d to factory</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.ordered_from}</span>
                      <span>{Number(row.product_price || 0).toFixed(2)}</span>
                      <span>{row.created_by_name || 'Unknown user'}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div hidden={headWorkspace !== 'refinishing'}>
            <div className="retail-alert-grid">
              <article className="retail-alert-card high"><span>Refinishing Cases</span><strong>{refinishingCases.length} repair / finish-correction cases are on record.</strong></article>
              <article className="retail-alert-card moderate"><span>Refinishing Turnaround</span><strong>{refinishingTurnaround} days average to close.</strong></article>
              <article className="retail-alert-card high"><span>Refinishing SLA Breaches</span><strong>{refinishingSlaBreaches.length} refinishing cases are beyond promise date.</strong></article>
              <article className="retail-alert-card moderate"><span>Refinishing Reopen Rate</span><strong>{refinishingReopenRate}% of refinishing cases reopened.</strong></article>
            </div>

            <div className="chart-grid two-col production-chart-grid">
              <LineChartCard title="Refinishing Volume Trend" points={refinishingVolumeTrend} format="number" />
              <DonutChartCard title="Refinishing Ageing" data={refinishingAgeing} totalLabel="Cases" />
            </div>

            <div className="chart-grid two-col production-chart-grid">
              <BarChartCard title="Refinishing Reasons" data={refinishingReasons} yLabel="Cases" format="number" />
              <BarChartCard title="Refinishing By Outlet" data={refinishingByOutlet} yLabel="Cases" format="number" />
            </div>

            <div className="chart-grid two-col production-chart-grid">
              <BarChartCard title="Refinishing By Production Stage" data={refinishingByStage} yLabel="Cases" format="number" />
              <BarChartCard title="Refinishing Cost By Outlet" data={refinishingCostByOutlet} yLabel="Cost" format="currency" />
            </div>

            <div className="chart-grid two-col production-chart-grid">
              <BarChartCard title="Refinishing Cost By Reason" data={refinishingCostByReason} yLabel="Cost" format="currency" />
              <div className="retail-panel">
                <div className="retail-panel-head">
                  <div>
                    <p className="retail-panel-kicker">Refinishing SLA Breach Report</p>
                    <h3>Highlighted refinishing cases that need immediate attention</h3>
                  </div>
                </div>
                <div className="retail-network-board">
                  {refinishingSlaBreaches.map((row) => (
                    <article key={row.id} className="retail-network-card">
                      <div className="retail-queue-head">
                        <div><strong>{row.production_order_no}</strong><p>{row.customer_name}</p></div>
                        <label className="production-chip critical">{row.reason_code}</label>
                      </div>
                      <div className="retail-queue-meta">
                        <span>{row.ordered_from}</span>
                        <span>{row.owner_name || 'Unassigned'}</span>
                        <span>Promised {dateOnly(row.promised_resolution_date)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div hidden={headWorkspace !== 'recovery'}>
          <div className="retail-alert-grid">
            <article className="retail-alert-card high"><span>Replacement Rate</span><strong>{replacementRate}% of visible orders have replacement cases.</strong></article>
            <article className="retail-alert-card moderate"><span>Cost Exposure</span><strong>{replacementCostExposure.toFixed(2)} estimated recovery cost.</strong></article>
            <article className="retail-alert-card high"><span>Replacement Backlog</span><strong>{replacementBacklog.length} open replacement / repair cases.</strong></article>
            <article className="retail-alert-card moderate"><span>Turnaround</span><strong>{recoveryTurnaround} average days to close.</strong></article>
            <article className="retail-alert-card moderate"><span>Promise Adherence</span><strong>{replacementPromiseAdherence}% of closed cases met replacement promise date.</strong></article>
            <article className="retail-alert-card high"><span>Complaint Conversion</span><strong>{postDeliveryComplaintConversion}% complaint-to-replacement conversion.</strong></article>
            <article className="retail-alert-card moderate"><span>Reopen Rate</span><strong>{reopenRate}% of cases reopened after closure.</strong></article>
            <article className="retail-alert-card moderate"><span>First Time Fix</span><strong>{firstTimeFixRate}% of closed cases resolved cleanly first time.</strong></article>
            <article className="retail-alert-card high"><span>Repeat Chain Rate</span><strong>{repeatReplacementRate}% of replacement orders have repeat chains.</strong></article>
            <article className="retail-alert-card high"><span>Third Replacement Chains</span><strong>{thirdReplacementChains.length} chains reached Replacement 3 or more.</strong></article>
            <article className="retail-alert-card moderate"><span>Average Chain Length</span><strong>{avgChainLength} cases per repeat chain.</strong></article>
            <article className="retail-alert-card critical"><span>Max Chain Depth</span><strong>{maxChainDepth} replacement levels on the deepest order.</strong></article>
            <article className="retail-alert-card moderate"><span>Repeat Exposure</span><strong>{repeatReplacementExposure.toFixed(2)} tied up in repeat replacement chains.</strong></article>
            <article className="retail-alert-card moderate"><span>Repeat Promise Adherence</span><strong>{repeatChainPromiseAdherence}% of repeat chains met promise.</strong></article>
            <article className="retail-alert-card high"><span>Repeat Reopen Rate</span><strong>{repeatChainReopenRate}% of repeat chains reopened again.</strong></article>
            <article className="retail-alert-card moderate"><span>Repeat First-Time Fix</span><strong>{repeatChainFirstTimeFixRate}% of repeat chains closed cleanly.</strong></article>
            <article className="retail-alert-card moderate"><span>Average Repeat Cost</span><strong>{repeatChainAvgCost.toFixed(2)} average cost per repeat chain.</strong></article>
            <article className="retail-alert-card critical"><span>Repeat SLA Breaches</span><strong>{repeatChainBreachCount} repeat chains are breaching promise dates.</strong></article>
            <article className="retail-alert-card high"><span>Replacement 2 Queue</span><strong>{replacement2Chains.length} original orders are currently at Replacement 2.</strong></article>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel retail-panel-highlight">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Replacement Desk</p>
                  <h3>Create, update, approve, and close replacement cases inline</h3>
                </div>
                <button type="button" className="button-secondary" onClick={() => setSelectedRecoveryCaseId(null)}>New Case</button>
              </div>
              {recoveryDeskMessage ? <p className="retail-recovery-message">{recoveryDeskMessage}</p> : null}
              <div className="retail-form-grid">
                <label><span>Booked Order No</span><input value={recoveryDraft.productionOrderNo} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, productionOrderNo: e.target.value, orderId: '' }))} placeholder="PO-YYYYMMDD-000001" /></label>
                <label><span>Case Type</span><select value={recoveryDraft.caseType} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, caseType: e.target.value }))}><option value="REPLACEMENT">Replacement</option><option value="REPAIR">Repair</option></select></label>
                <label><span>Reason</span><select value={recoveryDraft.reasonCode} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, reasonCode: e.target.value }))}><option value="">Select reason</option>{recoveryReasons.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
                <label><span>Owner</span><input value={recoveryDraft.ownerName} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, ownerName: e.target.value }))} /></label>
                <label><span>Workflow</span><select value={recoveryDraft.workflowStatus} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, workflowStatus: e.target.value }))}><option value="OPEN">Open</option><option value="APPROVED">Approved</option><option value="IN_PROGRESS">In Progress</option><option value="WAITING_CUSTOMER">Waiting Customer</option><option value="READY_TO_DISPATCH">Ready To Dispatch</option><option value="CLOSED">Closed</option><option value="REJECTED">Rejected</option></select></label>
                <label><span>Priority</span><select value={recoveryDraft.priorityLevel} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, priorityLevel: e.target.value }))}><option value="STANDARD">Standard</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label>
                <label><span>Promised Resolution</span><input type="date" value={recoveryDraft.promisedResolutionDate} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, promisedResolutionDate: e.target.value }))} /></label>
                <label><span>Estimated Cost</span><input type="number" value={recoveryDraft.estimatedCost} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, estimatedCost: e.target.value }))} /></label>
                <label><span>Financial Resolution</span><select value={recoveryDraft.financialResolutionType} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, financialResolutionType: e.target.value }))}>{financialResolutions.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
                <label><span>Customer Value</span><select value={recoveryDraft.customerValueBand} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, customerValueBand: e.target.value }))}><option value="STANDARD">Standard</option><option value="HIGH">High</option><option value="VIP">VIP</option></select></label>
                <label><span>Approval</span><select value={recoveryDraft.approvalStatus} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, approvalStatus: e.target.value }))}><option value="">Auto</option><option value="NOT_REQUIRED">Not Required</option><option value="PENDING_APPROVAL">Pending Approval</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option></select></label>
                <label><span>Customer Satisfaction</span><select value={recoveryDraft.customerSatisfactionStatus} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, customerSatisfactionStatus: e.target.value }))}><option value="PENDING">Pending</option><option value="RECOVERED">Recovered</option><option value="AT_RISK">At Risk</option><option value="LOST">Lost</option></select></label>
              </div>
              <label className="retail-form-block">
                <span>Action Note</span>
                <textarea value={recoveryDraft.notes} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, notes: e.target.value }))} rows={3} />
              </label>
              <div className="retail-status-list">
                <article className="retail-status-row">
                  <span>Resolved Booking</span>
                  <strong>{draftRecoveryOrder ? `${draftRecoveryOrder.production_order_no} / ${draftRecoveryOrder.customer_name}` : 'Enter a valid booked order number'}</strong>
                </article>
              </div>
              {draftReplacementChain.length > 0 && (
                <div className="retail-network-board">
                  {draftReplacementChain.map((row) => (
                    <article key={row.id} className="retail-network-card retail-network-card-clickable" onClick={() => loadRecoveryCaseIntoDraft(row)} role="button" tabIndex={0}>
                      <div className="retail-queue-head">
                        <div>
                          <strong>{formatRecoveryChainLabel(row)}</strong>
                          <p>{row.recovery_reference_no || row.production_order_no}</p>
                        </div>
                        <label className={`production-chip ${row.workflow_status === 'CLOSED' ? 'stable' : 'high'}`}>{row.workflow_status}</label>
                      </div>
                      <div className="retail-queue-meta">
                        <span>{row.reason_code}</span>
                        <span>{row.owner_name || 'Unassigned'}</span>
                        <span>Seq {row.replacement_sequence || 1}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <div className="retail-inline-checks">
                <label><input type="checkbox" checked={recoveryDraft.firstTimeFix} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, firstTimeFix: e.target.checked }))} /> First-time fix</label>
                <label><input type="checkbox" checked={recoveryDraft.closedCleanly} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, closedCleanly: e.target.checked }))} /> Closed cleanly</label>
              </div>
              <div className="actions-cell">
                <button type="button" onClick={submitRecoveryCase}>Create Case</button>
                <button type="button" className="button-secondary" onClick={saveRecoveryCase} disabled={!selectedRecoveryCaseId}>Save Case</button>
                {selectedRecoveryCase && Number(selectedRecoveryCase.estimated_cost || 0) >= highCostApprovalThreshold ? (
                  <button type="button" className="button-secondary" onClick={() => { setRecoveryDraft((prev) => ({ ...prev, approvalStatus: 'APPROVED' })); }}>
                    Mark Approved
                  </button>
                ) : null}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Masters And Settings</p>
                  <h3>Reason codes, financial resolutions, and threshold control</h3>
                </div>
              </div>
              <div className="retail-form-grid">
                <label><span>High-Cost Threshold</span><input type="number" value={thresholdDraft} onChange={(e) => setThresholdDraft(e.target.value)} /></label>
                <label><span>Reason Code</span><input value={reasonDraft.code} onChange={(e) => setReasonDraft((prev) => ({ ...prev, code: e.target.value }))} /></label>
                <label><span>Reason Label</span><input value={reasonDraft.label} onChange={(e) => setReasonDraft((prev) => ({ ...prev, label: e.target.value }))} /></label>
                <label><span>Reason SLA Days</span><input type="number" value={reasonDraft.slaDays} onChange={(e) => setReasonDraft((prev) => ({ ...prev, slaDays: Number(e.target.value || 0) }))} /></label>
                <label><span>Financial Code</span><input value={financialDraft.code} onChange={(e) => setFinancialDraft((prev) => ({ ...prev, code: e.target.value }))} /></label>
                <label><span>Financial Label</span><input value={financialDraft.label} onChange={(e) => setFinancialDraft((prev) => ({ ...prev, label: e.target.value }))} /></label>
              </div>
              <div className="actions-cell">
                <button type="button" onClick={() => saveRecoverySetting('HIGH_COST_APPROVAL_THRESHOLD', { amount: Number(thresholdDraft || 0) })}>Save Threshold</button>
                <button type="button" onClick={saveRecoveryReason}>Save Reason</button>
                <button type="button" className="button-secondary" onClick={saveFinancialResolution}>Save Financial Resolution</button>
              </div>
              <div className="retail-status-list">
                {recoveryReasons.slice(0, 6).map((item) => <article key={item.code} className="retail-status-row"><span>{item.label}</span><strong>{item.sla_days}d SLA</strong></article>)}
              </div>
            </div>
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Replacement Reasons" data={replacementReasonAnalysis} yLabel="Cases" format="number" />
            <DonutChartCard title="Recovery Pipeline" data={recoveryPipeline.map((row) => ({ label: row.label, value: row.value }))} totalLabel="Cases" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <DonutChartCard title="Repeat Chain Ageing" data={chainAgeing} totalLabel="Chains" />
            <DonutChartCard title="Repeat Chain Length Distribution" data={chainLengthDistribution} totalLabel="Chains" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <DonutChartCard title="Recovery Type Split" data={recoveryTypeSplit.map((row) => ({ label: row.label, value: row.value }))} totalLabel="Cases" />
            <LineChartCard title="Weekly Replacement Case Trend" points={replacementWeeklyTrend} format="number" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <DonutChartCard title="Replacement Ageing" data={replacementAgeing} totalLabel="Cases" />
            <DonutChartCard title="Customer Satisfaction Recovery" data={satisfactionRecovery} totalLabel="Cases" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <DonutChartCard title="Financial Recovery Visibility" data={financialRecovery} totalLabel="Cases" />
            <DonutChartCard title="Complaint To Replacement Funnel" data={complaintToReplacementFunnel} totalLabel="Flow" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Replacement SLA Pressure By Outlet" data={slaByOutlet} yLabel="SLA pressure" format="number" />
            <BarChartCard title="Replacement SLA Pressure By Owner" data={slaByOwner} yLabel="SLA pressure" format="number" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Turnaround By Outlet" data={turnaroundByOutlet} yLabel="Avg days" format="number" />
            <BarChartCard title="Turnaround By Reason" data={turnaroundByReason} yLabel="Avg days" format="number" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Replacement Cost By Outlet" data={costTrendByOutlet} yLabel="Cost" format="currency" />
            <BarChartCard title="Replacement Cost By Reason" data={costTrendByReason} yLabel="Cost" format="currency" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Complaint To Closure Cycle Distribution" data={complaintClosureDistribution} yLabel="Cases" format="number" />
            <BarChartCard title="Outlet Quality Trend 30 / 60 / 90" data={outletQualityTrend.map((row) => ({ label: row.outlet, value: row.d30 + row.d60 + row.d90 }))} yLabel="Cases" format="number" />
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Outlet Replacement Ranking</p>
                  <h3>Outlets driving replacement volume</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {replacementOutletRanking.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}</strong></article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Customer Replacement Ranking</p>
                  <h3>Customers with repeat recovery pressure</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {replacementCustomerRanking.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}</strong></article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">High-Value Customer Watchlist</p>
                  <h3>Recovery cases involving VIP and high-value customers</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {highValueRecoveryWatchlist.map((row) => (
                  <article key={row.id} className="retail-network-card retail-network-card-clickable" onClick={() => loadRecoveryCaseIntoDraft(row)} role="button" tabIndex={0}>
                    <div className="retail-queue-head">
                      <div><strong>{row.customer_name}</strong><p>{row.production_order_no}</p></div>
                      <label className="production-chip high">{row.customer_value_band}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.reason_code}</span>
                      <span>{row.owner_name || 'Unassigned'}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Repeat-Complaint Customers</p>
                  <h3>Customers generating multiple recovery events</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {repeatComplaintCustomers.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value} cases</strong></article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Repeat Replacement Outlets</p>
                  <h3>Chronic outlet quality recovery</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {repeatReplacementOutlets.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}</strong></article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Repeat Replacement Customers</p>
                  <h3>Customers with repeated replacement requests</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {repeatReplacementCustomers.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}</strong></article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Third Replacement Outlet Ranking</p>
                  <h3>Outlets driving replacement 3 and beyond</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {thirdReplacementOutletRanking.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}</strong></article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Repeat Chain Owner Load</p>
                  <h3>Owners currently carrying repeated replacements</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {repeatChainOwnerLoad.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}</strong></article>
                ))}
              </div>
            </div>
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Repeat Chain Pressure By Outlet" data={repeatChainOutletRanking} yLabel="Chains" format="number" />
            <BarChartCard title="Repeat Chain Pressure By Customer" data={repeatChainCustomerRanking} yLabel="Chains" format="number" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Slowest Repeat Chains" data={repeatChainTurnaround} yLabel="Avg days" format="number" />
            <BarChartCard title="Highest Cost Repeat Chains" data={topReplacementCostChains.map((row) => ({ label: row.originalOrderNo, value: row.totalCost }))} yLabel="Cost" format="currency" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Repeat Chain Cost By Outlet" data={repeatChainCostByOutlet} yLabel="Cost" format="currency" />
            <BarChartCard title="Original Order Vs Recovery Lead Delta" data={repeatChainOriginalVsRecoveryLead} yLabel="Days delta" format="number" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <BarChartCard title="Repeat Chain Stage Pressure" data={repeatChainStagePressure} yLabel="Chains" format="number" />
            <BarChartCard title="Open Repeat Chain Reasons" data={repeatChainOpenReasonBoard} yLabel="Open chains" format="number" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <DonutChartCard title="Repeat Chain Financial Mix" data={repeatChainFinancialMix} totalLabel="Chains" />
            <DonutChartCard title="Repeat Chain Value Band Mix" data={repeatChainValueBandMix} totalLabel="Chains" />
          </div>

          <div className="chart-grid two-col production-chart-grid">
            <DonutChartCard title="Repeat Chain Closure Health" data={repeatChainClosureHealth} totalLabel="Chains" />
            <DonutChartCard title="Repeat Chain Customer Risk" data={repeatChainCustomerLossRisk} totalLabel="Chains" />
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Replacement 2 Queue</p>
                  <h3>Orders that have entered second replacement</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {replacement2Chains.map((row) => (
                  <article key={`r2-${row.originalOrderId}`} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div><strong>{row.originalOrderNo}</strong><p>{row.customerName}</p></div>
                      <label className="production-chip high">Replacement 2</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.outlet}</span>
                      <span>{row.latestReason}</span>
                      <span>{row.latestStatus}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Repeat Chain Reason Ranking</p>
                  <h3>Latest reasons driving repeat chains</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {repeatChainReasonRanking.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}</strong></article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Replacement SLA Board</p>
                  <h3>Recovery cases at risk of breach</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {replacementSlaBoard.map((row) => (
                  <article key={row.id} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div>
                        <strong>{row.production_order_no}</strong>
                        <p>{row.customer_name}</p>
                      </div>
                      <label className={`production-chip ${row.overdue ? 'critical' : 'high'}`}>{row.status}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.owner_name || 'Unassigned'}</span>
                      <span>{dateOnly(row.promised_resolution_date) || 'No promise date'}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Escalated Recovery Queue</p>
                  <h3>Cases already escalated or overdue</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {escalatedRecoveryQueue.map((row) => (
                  <article key={row.id} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div>
                        <strong>{row.production_order_no}</strong>
                        <p>{row.customer_name}</p>
                      </div>
                      <label className="production-chip critical">Esc {row.escalation_level || 0}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.owner_name || 'Unassigned'}</span>
                      <span>{row.reason_code}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Recovery Ownership</p>
                  <h3>Owner tracking</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {recoveryOwners.map((row) => (
                  <article key={row.label} className="retail-status-row"><span>{row.label}</span><strong>{row.value}</strong></article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Outlet Quality Recovery Score</p>
                  <h3>Recovery burden by outlet</h3>
                </div>
              </div>
              <div className="retail-status-list">
                {outletQualityRecoveryScore.map((row) => (
                  <article key={row.outlet} className="retail-status-row"><span>{row.outlet}</span><strong>{row.score}</strong></article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Replacement Notifications</p>
                  <h3>Auto-escalation and approval routing</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {recoveryNotifications.slice(0, 10).map((note) => (
                  <article key={note.id} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div><strong>{note.title}</strong><p>{note.assigned_role || 'RETAIL_HEAD'}</p></div>
                      <label className={`production-chip ${note.is_read ? 'stable' : 'high'}`}>{note.notification_type}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{dateOnly(note.created_at)}</span>
                      <span>{note.message}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Attachments</p>
                  <h3>Complaint evidence and recovery support files</h3>
                </div>
              </div>
              <div className="retail-form-grid">
                <label><span>Select file</span><input type="file" onChange={(e) => setAttachmentDraft((prev) => ({ ...prev, file: e.target.files?.[0] || null }))} /></label>
                <label><span>Note</span><input value={attachmentDraft.note} onChange={(e) => setAttachmentDraft((prev) => ({ ...prev, note: e.target.value }))} /></label>
              </div>
              <div className="actions-cell">
                <button type="button" onClick={uploadRecoveryAttachment} disabled={!selectedRecoveryCaseId}>Upload Attachment</button>
              </div>
              <div className="retail-status-list">
                {recoveryAttachments.filter((item) => Number(item.recovery_case_id) === Number(selectedRecoveryCaseId)).slice(0, 6).map((item) => (
                  <article key={item.id} className="retail-status-row"><span>{item.file_name}</span><strong>{item.uploaded_by_name || 'Unknown'}</strong></article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-panel">
            <div className="retail-panel-head">
              <div>
                <p className="retail-panel-kicker">Replacement Root-Cause Heatmap</p>
                <h3>Outlet by reason concentration</h3>
              </div>
              <button type="button" className="button-secondary" onClick={() => exportReplacementChainCsv(repeatReplacementChains)}>Export Chains CSV</button>
            </div>
            <div className="retail-heatmap-grid">
              {replacementRootCauseHeat.map((row, index) => (
                <article key={`${row.outlet}-${row.cause}-${index}`} className={`retail-heatmap-cell ${buildHeatClass(row.value)}`}>
                  <span>{row.outlet}</span>
                  <strong>{row.cause}</strong>
                  <p>{row.value} cases</p>
                </article>
              ))}
            </div>
          </div>

          <div className="retail-panel">
            <div className="retail-panel-head">
              <div>
                <p className="retail-panel-kicker">Repeat Replacement Chains</p>
                <h3>Original orders with Replacement 2 / 3 visibility</h3>
              </div>
            </div>
            <div className="retail-network-board">
              {repeatReplacementChains.slice(0, 12).map((row) => (
                <article key={row.originalOrderId} className="retail-network-card">
                  <div className="retail-queue-head">
                    <div>
                      <strong>{row.originalOrderNo}</strong>
                      <p>{row.customerName}</p>
                    </div>
                    <label className={`production-chip ${row.maxSequence >= 3 ? 'critical' : 'high'}`}>Depth {row.maxSequence}</label>
                  </div>
                  <div className="retail-queue-meta">
                    <span>{row.outlet}</span>
                    <span>{row.latestStatus}</span>
                    <span>{row.latestReason}</span>
                  </div>
                  <div className="retail-queue-meta">
                    <span>Open {row.openCount}</span>
                    <span>Closed {row.closedCount}</span>
                    <span>Cost {row.totalCost.toFixed(2)}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="retail-head-mini-grid">
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">High-Risk Repeat Chains</p>
                  <h3>Repeated orders still unresolved</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {highRiskRepeatChains.map((row) => (
                  <article key={`risk-${row.originalOrderId}`} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div><strong>{row.originalOrderNo}</strong><p>{row.customerName}</p></div>
                      <label className="production-chip critical">Open {row.openCount}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.outlet}</span>
                      <span>Depth {row.maxSequence}</span>
                      <span>{row.latestOwner}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Replacement 3 Queue</p>
                  <h3>Orders already at third replacement or beyond</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {thirdReplacementChains.map((row) => (
                  <article key={`third-${row.originalOrderId}`} className="retail-network-card">
                    <div className="retail-queue-head">
                      <div><strong>{row.originalOrderNo}</strong><p>{row.customerName}</p></div>
                      <label className="production-chip critical">Replacement {row.maxSequence}</label>
                    </div>
                    <div className="retail-queue-meta">
                      <span>{row.outlet}</span>
                      <span>{row.latestReason}</span>
                      <span>{row.latestStatus}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="retail-panel">
            <div className="retail-panel-head">
              <div>
                <p className="retail-panel-kicker">Replacement Notes Timeline</p>
                <h3>Latest replacement / repair actions</h3>
              </div>
            </div>
            <div className="retail-network-board">
              {recoveryNotes.slice(0, 12).map((note) => (
                <article key={note.id} className="retail-network-card">
                  <div className="retail-queue-head">
                    <div>
                      <strong>Case #{note.recovery_case_id}</strong>
                      <p>{note.actor_name || 'Unknown actor'}</p>
                    </div>
                    <label className="production-chip neutral">{note.note_type}</label>
                  </div>
                  <div className="retail-queue-meta">
                    <span>{dateOnly(note.created_at)}</span>
                    <span>{note.note_text}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="retail-panel">
            <div className="retail-panel-head">
              <div>
                <p className="retail-panel-kicker">Replacement Audit Trail</p>
                <h3>Every replacement field change and workflow transition</h3>
              </div>
            </div>
            <div className="retail-network-board">
              {recoveryAudit.slice(0, 12).map((entry) => (
                <article key={entry.id} className="retail-network-card">
                  <div className="retail-queue-head">
                    <div>
                      <strong>Case #{entry.recovery_case_id}</strong>
                      <p>{entry.changed_by_name || 'Unknown user'}</p>
                    </div>
                    <label className="production-chip neutral">{entry.change_type}</label>
                  </div>
                  <div className="retail-queue-meta">
                    <span>{dateOnly(entry.created_at)}</span>
                    <span>{JSON.stringify(entry.after_data || {})}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div className="retail-panel">
            <div className="retail-panel-head">
              <div>
                <p className="retail-panel-kicker">Replacement Promise Slip Report</p>
                <h3>Closed replacement cases that missed the revised promise date</h3>
              </div>
            </div>
            <div className="retail-network-board">
              {promiseSlipReport.map((row) => (
                <article key={row.id} className="retail-network-card">
                  <div className="retail-queue-head">
                    <div><strong>{row.production_order_no}</strong><p>{row.customer_name}</p></div>
                    <label className="production-chip critical">{row.reason_code}</label>
                  </div>
                  <div className="retail-queue-meta">
                    <span>Promised {dateOnly(row.promised_resolution_date)}</span>
                    <span>Resolved {dateOnly(row.resolved_at)}</span>
                    <span>{row.owner_name || 'Unassigned'}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
          </div>
        </>
      )}

      <div
        className={`retail-panel ${!isShopManager ? 'retail-panel-roster' : ''}`}
        hidden={!isShopManager && headWorkspace !== 'roster'}
      >
        <div className="retail-panel-head">
          <div>
            <p className="retail-panel-kicker">{isShopManager ? 'Recent Orders' : 'Network Order Roster'}</p>
            <h3>{isShopManager ? 'Retail order roster' : 'Cross-outlet order detail'}</h3>
          </div>
        </div>
        <div className="retail-roster">
          {recentOrders.map((order) => (
            <article
              key={order.id}
              className="retail-order-row retail-order-row-clickable"
              onClick={() => openOrderDetail(order.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openOrderDetail(order.id);
                }
              }}
            >
              <div className="retail-order-primary">
                <strong>{order.production_order_no}</strong>
                <p>{order.customer_name}</p>
              </div>
              <div className="retail-order-cells">
                <span>{order.ordered_from}</span>
                <span>{order.current_stage || '-'}</span>
                <span>{dateOnly(order.due_date) || '-'}</span>
                <label className={`production-chip ${order.is_late ? 'critical' : order.status === 'COMPLETED' || order.status === 'SHIPPED' ? 'stable' : 'neutral'}`}>
                  {order.is_late ? 'Late' : order.status}
                </label>
              </div>
              <div className="actions-cell">
                <button type="button" onClick={(event) => { event.stopPropagation(); openPrintable(order.id); }}>Print A4</button>
                <button type="button" onClick={(event) => { event.stopPropagation(); downloadOrderPdf(order.id, order.production_order_no); }}>PDF</button>
                <button type="button" className="button-secondary" onClick={(event) => { event.stopPropagation(); downloadCustomerReference(order.id, order.production_order_no); }}>
                  Customer Ref
                </button>
              </div>
            </article>
          ))}
          {recentOrders.length === 0 && (
            <article className="retail-order-row retail-order-row-empty">
              <strong>No orders found</strong>
              <p>Adjust your filters or create a new retail order.</p>
            </article>
          )}
        </div>
      </div>

      <LateReportView />
      {detailOrder && (
        <aside className="retail-detail-drawer" role="dialog" aria-modal="true">
          <div className="retail-detail-panel">
            <div className="retail-detail-head">
              <div>
                <p className="retail-panel-kicker">Order Detail</p>
                <h3>{detailOrder.production_order_no}</h3>
              </div>
              <button type="button" className="button-secondary" onClick={() => setDetailOrder(null)}>Close</button>
            </div>
            <div className="retail-detail-grid">
              <article><span>Customer</span><strong>{detailOrder.customer_name || '-'}</strong></article>
              <article><span>Outlet</span><strong>{detailOrder.ordered_from || '-'}</strong></article>
              <article><span>Status</span><strong>{detailOrder.status || '-'}</strong></article>
              <article><span>Current Stage</span><strong>{detailOrder.current_stage || '-'}</strong></article>
              <article><span>Order Date</span><strong>{dateOnly(detailOrder.order_date) || '-'}</strong></article>
              <article><span>Due Date</span><strong>{dateOnly(detailOrder.due_date) || '-'}</strong></article>
              <article><span>Phone</span><strong>{detailOrder.customer_number || '-'}</strong></article>
              <article><span>Flow</span><strong>{detailOrder.production_flow || '-'}</strong></article>
            </div>
            <div className="retail-panel">
              <div className="retail-panel-head">
                <div>
                  <p className="retail-panel-kicker">Communication Log</p>
                  <h3>Latest retail follow-up notes</h3>
                </div>
              </div>
              <div className="retail-network-board">
                {(storeDelivery.pending_deliveries || [])
                  .filter((row) => Number(row.id) === Number(detailOrder.id))
                  .map((row) => (
                    <article key={row.id} className="retail-network-card">
                      <div className="retail-queue-meta">
                        <span>Today: {row.today_update_status || 'No update'}</span>
                        <span>Last: {row.last_update_status || 'No update'}</span>
                      </div>
                      <div className="retail-queue-meta">
                        <span>{row.today_update_notes || 'No note for today'}</span>
                        <span>{row.last_update_notes || 'No previous note'}</span>
                      </div>
                    </article>
                  ))}
              </div>
            </div>
            {canManageReplacements && (
              <>
                <div className="retail-panel">
                  <div className="retail-panel-head">
                    <div>
                      <p className="retail-panel-kicker">Customer Replacement History</p>
                      <h3>Previous replacement / repair cases for this customer</h3>
                    </div>
                  </div>
                  <div className="retail-network-board">
                    {detailCustomerRecoveryHistory.map((row) => (
                      <article key={row.id} className="retail-network-card retail-network-card-clickable" onClick={() => loadRecoveryCaseIntoDraft(row)} role="button" tabIndex={0}>
                        <div className="retail-queue-head">
                          <div><strong>{row.production_order_no}</strong><p>{row.case_type}</p></div>
                          <label className={`production-chip ${row.workflow_status === 'CLOSED' ? 'stable' : 'high'}`}>{row.workflow_status}</label>
                        </div>
                        <div className="retail-queue-meta">
                          <span>{row.reason_code}</span>
                          <span>{row.owner_name || 'Unassigned'}</span>
                        </div>
                      </article>
                    ))}
                    {detailCustomerRecoveryHistory.length === 0 && (
                      <article className="retail-network-card"><strong>No replacement history</strong><p>This customer has no recorded replacement cases yet.</p></article>
                    )}
                  </div>
                </div>
                <div className="retail-panel">
                  <div className="retail-panel-head">
                    <div>
                      <p className="retail-panel-kicker">Replacement For This Order</p>
                      <h3>Create or update replacement directly from the order drawer</h3>
                    </div>
                  </div>
                  <div className="retail-status-list">
                    {detailOrderRecoveryCases.map((row) => (
                      <article key={row.id} className="retail-status-row">
                        <span>{(row.recovery_reference_no || formatRecoveryChainLabel(row))} / {row.reason_code}</span>
                        <strong>{row.workflow_status}</strong>
                        <button type="button" className="button-secondary" onClick={() => loadRecoveryCaseIntoDraft(row)}>Edit</button>
                      </article>
                    ))}
                  </div>
                  {detailOrderRecoveryCases.length > 0 && (
                    <div className="retail-network-board">
                      {detailOrderRecoveryCases.map((row) => (
                        <article key={`chain-${row.id}`} className="retail-network-card">
                          <div className="retail-queue-head">
                            <div>
                              <strong>{row.recovery_reference_no || formatRecoveryChainLabel(row)}</strong>
                              <p>{row.reason_code}</p>
                            </div>
                            <label className={`production-chip ${row.workflow_status === 'CLOSED' ? 'stable' : 'high'}`}>{row.workflow_status}</label>
                          </div>
                          <div className="retail-queue-meta">
                            <span>{dateOnly(row.created_at)}</span>
                            <span>{row.owner_name || 'Unassigned'}</span>
                            <span>{row.financial_resolution_type || '-'}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                  <div className="retail-form-grid">
                    <label><span>Booked Order No</span><input value={recoveryDraft.productionOrderNo || detailOrder.production_order_no} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, productionOrderNo: e.target.value, orderId: String(detailOrder.id) }))} /></label>
                    <label><span>Case Type</span><select value={recoveryDraft.caseType} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, caseType: e.target.value, orderId: String(detailOrder.id), productionOrderNo: detailOrder.production_order_no }))}><option value="REPLACEMENT">Replacement</option><option value="REPAIR">Repair</option></select></label>
                    <label><span>Reason</span><select value={recoveryDraft.reasonCode} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, reasonCode: e.target.value, orderId: String(detailOrder.id), productionOrderNo: detailOrder.production_order_no }))}><option value="">Select reason</option>{recoveryReasons.map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
                    <label><span>Promised Resolution</span><input type="date" value={recoveryDraft.promisedResolutionDate} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, promisedResolutionDate: e.target.value, orderId: String(detailOrder.id), productionOrderNo: detailOrder.production_order_no }))} /></label>
                    <label><span>Estimated Cost</span><input type="number" value={recoveryDraft.estimatedCost} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, estimatedCost: e.target.value, orderId: String(detailOrder.id), productionOrderNo: detailOrder.production_order_no }))} /></label>
                  </div>
                  <label className="retail-form-block">
                    <span>Replacement Note</span>
                    <textarea value={recoveryDraft.notes} onChange={(e) => setRecoveryDraft((prev) => ({ ...prev, notes: e.target.value, orderId: String(detailOrder.id), productionOrderNo: detailOrder.production_order_no }))} rows={3} />
                  </label>
                  <div className="actions-cell">
                    <button type="button" onClick={submitRecoveryCase}>Create Replacement Case</button>
                    <button type="button" className="button-secondary" onClick={saveRecoveryCase} disabled={!selectedRecoveryCaseId}>Save Selected Replacement</button>
                  </div>
                </div>
              </>
            )}
            <div className="actions-cell">
              <button type="button" onClick={() => openPrintable(detailOrder.id)}>Print A4</button>
              <button type="button" onClick={() => downloadOrderPdf(detailOrder.id, detailOrder.production_order_no)}>PDF</button>
              <button type="button" className="button-secondary" onClick={() => downloadCustomerReference(detailOrder.id, detailOrder.production_order_no)}>Customer Ref</button>
            </div>
          </div>
        </aside>
      )}
      {selectedOrder && <A4PrintableOrderView order={selectedOrder} onClose={() => setSelectedOrder(null)} />}
    </section>
  );
}

