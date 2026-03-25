import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';
import StageScanner from './StageScanner';
import VerificationConsole from './VerificationConsole';
import { BarChartCard, DonutChartCard, LineChartCard } from './ReportingCharts';

const STAGE_ORDER = [
  'Verification',
  'Bespoke',
  'Embroidery',
  'Laser',
  'Model Room',
  'Cutting',
  'Closing',
  'Sole',
  'Lasting',
  'Finishing',
  'QC',
  'Packing',
];

function downloadCsv(filename, header, rows) {
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function formatShortDate(value) {
  if (!value) return '-';
  return String(value).slice(5, 10);
}

function getSeverityLabel(score) {
  if (score >= 60) return { label: 'Critical', tone: 'critical' };
  if (score >= 30) return { label: 'High', tone: 'high' };
  if (score >= 12) return { label: 'Moderate', tone: 'moderate' };
  return { label: 'Stable', tone: 'stable' };
}

export default function ProductionDashboard({ refreshSignal, user, lockedWorkspace = '' }) {
  const [activeWorkspace, setActiveWorkspace] = useState(lockedWorkspace || 'overview');
  const [menuOpen, setMenuOpen] = useState(false);
  const [board, setBoard] = useState({});
  const [flowSummary, setFlowSummary] = useState({
    total_in_production: 0,
    wip_orders: 0,
    bespoke: 0,
    mto: 0,
    laser: 0,
    embroidery: 0,
    on_time_orders: 0,
    urgent_orders: 0,
  });
  const [dateReport, setDateReport] = useState({ from: '', to: '', rows: [] });
  const [performanceReport, setPerformanceReport] = useState({
    from: '',
    to: '',
    summary: {
      total_completed: 0,
      total_holds: 0,
      total_reworks: 0,
      total_rejects: 0,
      avg_oee_pct: 0,
      schedule_adherence_pct: 0,
    },
    stages: [],
    trend: [],
    derived_metrics_note: '',
  });
  const [agingReport, setAgingReport] = useState({
    as_of: '',
    summary: {
      total_wip: 0,
      overdue_count: 0,
      age_gt_30: 0,
      overdue_pct: 0,
    },
    stage_buckets: [],
    overdue_orders: [],
  });
  const [controlTowerReport, setControlTowerReport] = useState({
    target_date: '',
    shift_name: 'Day',
    summary: {
      total_target_pairs: 0,
      total_actual_pairs: 0,
      total_active_orders: 0,
      total_late_pairs: 0,
      pending_approvals: 0,
      unread_notifications: 0,
    },
    stage_rows: [],
  });
  const [reportFilters, setReportFilters] = useState(() => {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 5);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  });
  const isVerificationSupervisor = user?.role === 'PRODUCTION_SUPERVISOR' && user?.stage_name === 'Verification';
  const supervisorStageName = user?.stage_name || 'Assigned Stage';
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  function isLate(item) {
    const due = item?.dueDate?.slice(0, 10);
    if (!due) return false;
    return due < todayYmd;
  }

  async function loadBoard() {
    const { data } = await api.get('/production/board');
    setBoard(data.board || {});
  }

  async function loadFlowSummary() {
    const { data } = await api.get('/production/flow-summary');
    setFlowSummary(data || {
      total_in_production: 0,
      wip_orders: 0,
      bespoke: 0,
      mto: 0,
      laser: 0,
      embroidery: 0,
      on_time_orders: 0,
      urgent_orders: 0,
    });
  }

  const loadDateWiseReport = useCallback(async (from = reportFilters.from, to = reportFilters.to) => {
    const { data } = await api.get(`/production/reports/date-wise?from=${from}&to=${to}`);
    setDateReport(data || { from, to, rows: [] });
  }, [reportFilters.from, reportFilters.to]);

  const loadPerformanceReport = useCallback(async (from = reportFilters.from, to = reportFilters.to) => {
    const { data } = await api.get(`/production/reports/performance?from=${from}&to=${to}`);
    setPerformanceReport(data || {
      from,
      to,
      summary: {
        total_completed: 0,
        total_holds: 0,
        total_reworks: 0,
        total_rejects: 0,
        avg_oee_pct: 0,
        schedule_adherence_pct: 0,
      },
      stages: [],
      trend: [],
      derived_metrics_note: '',
    });
  }, [reportFilters.from, reportFilters.to]);

  const loadAgingReport = useCallback(async (asOf = reportFilters.to) => {
    const { data } = await api.get(`/production/reports/aging?asOf=${asOf}`);
    setAgingReport(data || {
      as_of: asOf,
      summary: {
        total_wip: 0,
        overdue_count: 0,
        age_gt_30: 0,
        overdue_pct: 0,
      },
      stage_buckets: [],
      overdue_orders: [],
    });
  }, [reportFilters.to]);

  const loadControlTowerReport = useCallback(async (targetDate = reportFilters.to) => {
    const { data } = await api.get(`/production/reports/control-tower?targetDate=${targetDate}`);
    setControlTowerReport(data || {
      target_date: targetDate,
      shift_name: 'Day',
      summary: {
        total_target_pairs: 0,
        total_actual_pairs: 0,
        total_active_orders: 0,
        total_late_pairs: 0,
        pending_approvals: 0,
        unread_notifications: 0,
      },
      stage_rows: [],
    });
  }, [reportFilters.to]);

  function exportDateWiseCsv() {
    const header = [
      'Date',
      'Created Total',
      'Created Bespoke',
      'Created MTO',
      'Created Laser',
      'Created Embroidery',
      'Moved Stage Total',
      'Hold Customer',
      'Hold Sales',
      'Hold Released',
      'Custom Pattern Marked',
      'Orders Completed',
    ].join(',');
    const rows = (dateReport.rows || []).map((r) => (
      [
        r.report_date?.slice?.(0, 10) || r.report_date || '',
        r.created_total,
        r.created_bespoke,
        r.created_mto,
        r.created_laser,
        r.created_embroidery,
        r.moved_stage_total,
        r.hold_customer,
        r.hold_sales,
        r.hold_released,
        r.custom_pattern_marked,
        r.orders_completed,
      ].join(',')
    ));
    downloadCsv(`production-date-wise-report-${dateReport.from}-to-${dateReport.to}.csv`, header, rows);
  }

  function exportPerformanceCsv() {
    const header = [
      'Stage',
      'WIP',
      'Completed',
      'Avg Cycle Hours',
      'Holds',
      'Rework',
      'Reject',
      'Availability %',
      'Performance %',
      'Quality %',
      'OEE %',
    ].join(',');
    const rows = (performanceReport.stages || []).map((r) => (
      [
        r.stage_name,
        r.wip_orders,
        r.completed_count,
        r.avg_cycle_hours,
        r.hold_count,
        r.rework_count,
        r.reject_count,
        r.availability_pct,
        r.performance_pct,
        r.quality_pct,
        r.oee_pct,
      ].join(',')
    ));
    downloadCsv(`production-performance-${performanceReport.from}-to-${performanceReport.to}.csv`, header, rows);
  }

  function exportAgingCsv() {
    const header = ['Stage', 'Total WIP', '0-7 Days', '8-14 Days', '15-30 Days', '>30 Days', 'Overdue', 'Avg Age Days'].join(',');
    const rows = (agingReport.stage_buckets || []).map((r) => (
      [
        r.stage_name,
        r.total_wip,
        r.age_0_7,
        r.age_8_14,
        r.age_15_30,
        r.age_gt_30,
        r.overdue_count,
        r.avg_age_days,
      ].join(',')
    ));
    downloadCsv(`production-aging-${agingReport.as_of || reportFilters.to}.csv`, header, rows);
  }

  function getAllActiveStageItems() {
    return STAGE_ORDER.flatMap((stage) => board[stage] || []);
  }

  function getLatePairsItems() {
    const today = new Date();
    const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return getAllActiveStageItems().filter((item) => (item?.dueDate?.slice?.(0, 10) || '') < todayYmd);
  }

  function exportLatePairsCsv() {
    const header = 'Order Number,Delivery Date';
    const rows = getLatePairsItems().map((item) => {
      const orderNo = String(item.productionOrderNo || '').replace(/"/g, '""');
      const due = item.dueDate?.slice?.(0, 10) || '';
      return `"${orderNo}","${due}"`;
    });
    downloadCsv('late-pairs.csv', header, rows);
  }

  function openStageWindow(stage) {
    const target = `${window.location.origin}${window.location.pathname}?page=stage&stage=${encodeURIComponent(stage)}`;
    window.open(target, '_blank', 'noopener');
  }

  useEffect(() => {
    if (['PRODUCTION_MANAGER', 'SUPER_USER'].includes(user?.role)) {
      loadBoard();
      loadFlowSummary();
      loadDateWiseReport();
      loadPerformanceReport();
      loadAgingReport();
      loadControlTowerReport();
    }
  }, [refreshSignal, user?.role, loadDateWiseReport, loadPerformanceReport, loadAgingReport, loadControlTowerReport]);

  useEffect(() => {
    if (lockedWorkspace) {
      setActiveWorkspace(lockedWorkspace);
    }
  }, [lockedWorkspace]);

  useEffect(() => {
    if (Boolean(lockedWorkspace)) {
      setMenuOpen(false);
    }
  }, [activeWorkspace, lockedWorkspace]);

  if (isVerificationSupervisor) {
    return <VerificationConsole refreshSignal={refreshSignal} />;
  }

  if (user?.role === 'PRODUCTION_SUPERVISOR') {
    return (
      <section className="production-page">
        <div className="production-hero">
          <div>
            <p className="production-kicker">Stage workspace</p>
            <h2>{supervisorStageName}</h2>
            <p className="production-subtitle">
              Scan work, move orders, and control stage throughput from a single focused surface.
            </p>
          </div>
        </div>
        <div className="production-panel production-panel-tight">
          <StageScanner stageAccess={user?.stage_access} stageName={supervisorStageName} />
        </div>
      </section>
    );
  }

  const latePairs = getLatePairsItems();
  const workspaceButtons = [
    { id: 'overview', label: 'Overview', page: 'production-overview' },
    { id: 'performance', label: 'Performance', page: 'production-performance' },
    { id: 'aging', label: 'Aging', page: 'production-aging' },
    { id: 'stages', label: 'Stages', page: 'production-stages' },
  ];
  const stageRiskRows = (performanceReport.stages || []).map((stage) => {
    const aging = (agingReport.stage_buckets || []).find((item) => item.stage_name === stage.stage_name) || {};
    const riskScore = (
      Number(stage.wip_orders || 0) * 2
      + Number(aging.overdue_count || 0) * 4
      + Number(aging.age_gt_30 || 0) * 5
      + Number(stage.rework_count || 0) * 3
      + Number(stage.hold_count || 0) * 2
    );
    let action = 'Monitor';
    if (Number(aging.overdue_count || 0) > 0) action = 'Expedite overdue pairs';
    if (Number(stage.rework_count || 0) > Number(stage.completed_count || 0) / 4) action = 'Contain rework';
    if (Number(stage.wip_orders || 0) > 8 && Number(stage.avg_cycle_hours || 0) > 24) action = 'Relieve bottleneck';
    const severity = getSeverityLabel(riskScore);
    return {
      ...stage,
      overdue_count: Number(aging.overdue_count || 0),
      age_gt_30: Number(aging.age_gt_30 || 0),
      avg_age_days: Number(aging.avg_age_days || 0),
      risk_score: riskScore,
      action,
      severity_label: severity.label,
      severity_tone: severity.tone,
    };
  }).sort((a, b) => b.risk_score - a.risk_score);
  const bottleneckStages = stageRiskRows.slice(0, 4);
  const overdueSpotlight = (agingReport.overdue_orders || []).slice(0, 6);
  const throughputPulse = (performanceReport.trend || []).slice(-7).reverse();
  const createdWindow = (dateReport.rows || []).reduce((sum, row) => sum + Number(row.created_total || 0), 0);
  const completedWindow = (dateReport.rows || []).reduce((sum, row) => sum + Number(row.orders_completed || 0), 0);
  const backlogDelta = createdWindow - completedWindow;
  const topLateStage = STAGE_ORDER
    .map((stage) => ({
      stage,
      lateCount: (board[stage] || []).filter((item) => isLate(item)).length,
    }))
    .sort((a, b) => b.lateCount - a.lateCount)[0];
  const pageTitleMap = {
    overview: 'Production Overview',
    performance: 'Performance Report',
    aging: 'Aging Report',
    stages: 'Stage Directory',
  };
  const pageIntroMap = {
    overview: 'Cross-factory summary with bottlenecks, overdue exposure, and decision focus.',
    performance: 'Execution quality, throughput, output trend, and risk ranking for stage performance review.',
    aging: 'Overdue concentration, WIP age buckets, and daily movement to manage delivery slippage.',
    stages: 'Direct launchpad into production stages for intervention and operational drilldown.',
  };
  const showSidebar = false;
  const flowMixChart = [
    { label: 'Bespoke', value: Number(flowSummary.bespoke || 0) },
    { label: 'MTO', value: Number(flowSummary.mto || 0) },
    { label: 'Laser', value: Number(flowSummary.laser || 0) },
    { label: 'Embroidery', value: Number(flowSummary.embroidery || 0) },
  ];
  const bottleneckChart = bottleneckStages.map((row) => ({
    label: row.stage_name,
    value: row.risk_score,
  }));
  const throughputLine = throughputPulse
    .slice()
    .reverse()
    .map((row) => ({
      label: formatShortDate(row.report_date),
      value: Number(row.completed_count || 0),
    }));
  const overdueStageChart = (agingReport.stage_buckets || [])
    .filter((row) => Number(row.overdue_count || 0) > 0)
    .map((row) => ({
      label: row.stage_name,
      value: Number(row.overdue_count || 0),
    }))
    .slice(0, 6);
  const qualityLossChart = (performanceReport.stages || [])
    .map((row) => ({
      label: row.stage_name,
      value: Number(row.rework_count || 0) + Number(row.reject_count || 0),
    }))
    .filter((row) => row.value > 0)
    .slice(0, 6);
  const agingMixChart = [
    { label: '0-7 Days', value: (agingReport.stage_buckets || []).reduce((sum, row) => sum + Number(row.age_0_7 || 0), 0) },
    { label: '8-14 Days', value: (agingReport.stage_buckets || []).reduce((sum, row) => sum + Number(row.age_8_14 || 0), 0) },
    { label: '15-30 Days', value: (agingReport.stage_buckets || []).reduce((sum, row) => sum + Number(row.age_15_30 || 0), 0) },
    { label: '>30 Days', value: (agingReport.stage_buckets || []).reduce((sum, row) => sum + Number(row.age_gt_30 || 0), 0) },
  ];
  const activeAlerts = [
    latePairs.length > 0
      ? {
        tone: 'critical',
        title: `${latePairs.length} late pairs need escalation`,
        detail: `${topLateStage?.stage || 'Production'} has the largest concentration of overdue work.`,
      }
      : null,
    backlogDelta > 0
      ? {
        tone: 'high',
        title: `Backlog increased by ${backlogDelta}`,
        detail: `${createdWindow} orders entered while ${completedWindow} were completed in the selected window.`,
      }
      : null,
    bottleneckStages[0]
      ? {
        tone: bottleneckStages[0].severity_tone,
        title: `${bottleneckStages[0].stage_name} is the main bottleneck`,
        detail: `${bottleneckStages[0].action}. Risk score ${bottleneckStages[0].risk_score}.`,
      }
      : null,
  ].filter(Boolean);
  const workspaceSummaryCardsMap = {
    overview: [
      { label: 'In Production', value: flowSummary.total_in_production || 0, note: 'Orders currently moving through the factory.' },
      { label: 'Backlog Delta', value: backlogDelta > 0 ? `+${backlogDelta}` : backlogDelta, note: `${createdWindow} created vs ${completedWindow} completed.` },
      { label: 'Late Pairs', value: latePairs.length, note: `${topLateStage?.stage || 'No stage'} is carrying the highest due-date pressure.` },
    ],
    performance: [
      { label: 'Avg OEE', value: `${Number(performanceReport.summary?.avg_oee_pct || 0).toFixed(2)}%`, note: 'Derived operating effectiveness across active stages.' },
      { label: 'Schedule Adherence', value: `${Number(performanceReport.summary?.schedule_adherence_pct || 0).toFixed(2)}%`, note: 'Delivery discipline in the selected date window.' },
      { label: 'Total Completed', value: performanceReport.summary?.total_completed || 0, note: 'Orders completed during the selected period.' },
    ],
    aging: [
      { label: 'Overdue Orders', value: agingReport.summary?.overdue_count || 0, note: 'Orders past due as of the selected date.' },
      { label: 'Aged > 30 Days', value: agingReport.summary?.age_gt_30 || 0, note: 'WIP lingering long enough to threaten flow.' },
      { label: 'Most Exposed Stage', value: topLateStage?.stage || '-', note: `${topLateStage?.lateCount || 0} late pairs concentrated here.` },
    ],
    stages: [
      { label: 'Tracked Stages', value: STAGE_ORDER.length, note: 'Production stages available for drilldown.' },
      { label: 'Primary Bottleneck', value: bottleneckStages[0]?.stage_name || '-', note: bottleneckStages[0]?.action || 'No critical action right now.' },
      { label: 'WIP Load', value: flowSummary.wip_orders || 0, note: 'Orders actively consuming production capacity.' },
    ],
  };
  const workspaceSummaryCards = workspaceSummaryCardsMap[activeWorkspace] || workspaceSummaryCardsMap.overview;
  const leadAlert = activeAlerts[0] || null;
  const performanceStageCards = stageRiskRows.slice(0, 8);
  const controlTowerRows = (controlTowerReport.stage_rows || []).slice(0, 6);
  const controlTowerChart = controlTowerRows.map((row) => ({
    label: row.stage_name,
    value: Number(row.gap_pairs || 0) < 0 ? Math.abs(Number(row.gap_pairs || 0)) : 0,
  })).filter((row) => row.value > 0);
  const movementCards = (dateReport.rows || [])
    .slice(-6)
    .reverse()
    .map((row) => ({
      date: row.report_date?.slice?.(0, 10) || row.report_date,
      created: Number(row.created_total || 0),
      moved: Number(row.moved_stage_total || 0),
      completed: Number(row.orders_completed || 0),
      holds: Number(row.hold_customer || 0) + Number(row.hold_sales || 0),
    }));
  const agingStageCards = (agingReport.stage_buckets || [])
    .slice()
    .sort((a, b) => Number(b.overdue_count || 0) - Number(a.overdue_count || 0) || Number(b.age_gt_30 || 0) - Number(a.age_gt_30 || 0))
    .slice(0, 8);

  function openWorkspacePage(page) {
    const target = `${window.location.origin}${window.location.pathname}?page=${page}`;
    window.open(target, '_self');
  }

  const overviewSections = (
    <>
      <div className="production-spotlight-grid">
        <article className="production-spotlight-card critical">
          <span>Immediate Focus</span>
          <strong>{bottleneckStages[0]?.stage_name || 'No active bottleneck'}</strong>
          <p>{bottleneckStages[0]?.action || 'No immediate action required'}</p>
        </article>
        <article className="production-spotlight-card">
          <span>Largest Due-Date Risk</span>
          <strong>{topLateStage?.stage || '-'}</strong>
          <p>{topLateStage?.lateCount || 0} late pairs concentrated in this stage.</p>
        </article>
        <article className="production-spotlight-card">
          <span>Factory Health</span>
          <strong>{latePairs.length === 0 && backlogDelta <= 0 ? 'Controlled' : 'Needs Attention'}</strong>
          <p>{createdWindow} entered, {completedWindow} completed, backlog delta {backlogDelta > 0 ? `+${backlogDelta}` : backlogDelta}.</p>
        </article>
      </div>

      <div className="chart-grid two-col production-chart-grid">
        <DonutChartCard title="Flow Mix" data={flowMixChart} totalLabel="Orders" />
        <LineChartCard title="7-Day Throughput" points={throughputLine} format="number" />
      </div>

      <div className="production-story-grid">
        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Factory Control Tower</p>
              <h3>Stage-by-stage manager summary</h3>
            </div>
          </div>
          <div className="production-mini-grid">
            <article className="production-mini-card"><span>Target Pairs</span><strong>{controlTowerReport.summary?.total_target_pairs || 0}</strong></article>
            <article className="production-mini-card"><span>Actual Pairs</span><strong>{controlTowerReport.summary?.total_actual_pairs || 0}</strong></article>
            <article className="production-mini-card"><span>Active Orders</span><strong>{controlTowerReport.summary?.total_active_orders || 0}</strong></article>
            <article className="production-mini-card"><span>Late Pairs</span><strong>{controlTowerReport.summary?.total_late_pairs || 0}</strong></article>
            <article className="production-mini-card"><span>Pending Approvals</span><strong>{controlTowerReport.summary?.pending_approvals || 0}</strong></article>
            <article className="production-mini-card"><span>Unread Notifications</span><strong>{controlTowerReport.summary?.unread_notifications || 0}</strong></article>
          </div>
          <div className="production-order-list">
            {controlTowerRows.map((row) => (
              <article key={row.stage_name} className="production-order-card">
                <div className="production-order-head">
                  <strong>{row.stage_name}</strong>
                  <span>{row.gap_pairs >= 0 ? `+${row.gap_pairs}` : row.gap_pairs}</span>
                </div>
                <div className="production-drilldown-metrics">
                  <div><span>Target</span><strong>{row.target_pairs}</strong></div>
                  <div><span>Actual</span><strong>{row.actual_pairs}</strong></div>
                  <div><span>Late</span><strong>{row.late_pairs}</strong></div>
                  <div><span>Approvals</span><strong>{row.pending_approvals}</strong></div>
                </div>
                <p className="production-note">{row.recommendation}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Gap Exposure</p>
              <h3>Stages behind target</h3>
            </div>
          </div>
          <div className="chart-grid one-col production-chart-grid">
            <BarChartCard title="Target Shortfall by Stage" data={controlTowerChart} yLabel="Pairs behind target" format="number" />
          </div>
        </div>
      </div>

      <div className="production-story-grid">
        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Action Queue</p>
              <h3>What needs intervention now</h3>
            </div>
          </div>
          <div className="production-priority-list">
            {bottleneckStages.map((row) => (
              <article key={row.stage_name} className="production-priority-card">
                <div className="production-priority-head">
                  <strong>{row.stage_name}</strong>
                  <span>Risk {row.risk_score}</span>
                </div>
                <div className="production-chip-row">
                  <label className={`production-chip ${row.severity_tone}`}>{row.severity_label}</label>
                  <label className="production-chip neutral">{row.action}</label>
                </div>
                <p>WIP {row.wip_orders} | Overdue {row.overdue_count} | Rework {row.rework_count} | Avg cycle {row.avg_cycle_hours} hrs</p>
                <div className="production-priority-footer">
                  <button type="button" className="button-secondary" onClick={() => openStageWindow(row.stage_name)}>
                    Open Stage
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Delivery Risk</p>
              <h3>Overdue order spotlight</h3>
            </div>
          </div>
          <div className="production-order-list">
            {overdueSpotlight.map((order) => (
              <article key={order.order_id} className="production-order-card">
                <div className="production-order-head">
                  <strong>{order.production_order_no}</strong>
                  <span>{order.current_stage}</span>
                </div>
                <div className="production-chip-row">
                  <label className={`production-chip ${Number(order.overdue_days || 0) > 14 ? 'critical' : 'high'}`}>
                    {Number(order.overdue_days || 0) > 14 ? 'Escalate now' : 'At risk'}
                  </label>
                  <label className="production-chip neutral">{order.production_flow}</label>
                </div>
                <p>{order.customer_name}</p>
                <div className="production-order-meta">
                  <span>{order.overdue_days} overdue</span>
                  <span>Due {String(order.due_date).slice(0, 10)}</span>
                </div>
              </article>
            ))}
            {!overdueSpotlight.length && <p className="production-note">No overdue orders in the selected as-of date.</p>}
          </div>
        </div>
      </div>
    </>
  );

  const performanceSections = (
    <>
      <div className="chart-grid two-col production-chart-grid">
        <LineChartCard title="7-Day Throughput" points={throughputLine} format="number" />
        <BarChartCard title="Top Bottleneck Stages" data={bottleneckChart} yLabel="Risk score" format="number" />
      </div>

      <div className="production-story-grid">
        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Performance Snapshot</p>
              <h3>Operational scorecard</h3>
            </div>
            <button type="button" className="button-secondary metric-export-btn" onClick={exportPerformanceCsv}>
              Export CSV
            </button>
          </div>
          <div className="production-mini-grid">
            <article className="production-mini-card"><span>Avg OEE</span><strong>{Number(performanceReport.summary?.avg_oee_pct || 0).toFixed(2)}%</strong></article>
            <article className="production-mini-card"><span>Schedule Adherence</span><strong>{Number(performanceReport.summary?.schedule_adherence_pct || 0).toFixed(2)}%</strong></article>
            <article className="production-mini-card"><span>Total Completed</span><strong>{performanceReport.summary?.total_completed || 0}</strong></article>
            <article className="production-mini-card"><span>Reworks</span><strong>{performanceReport.summary?.total_reworks || 0}</strong></article>
            <article className="production-mini-card"><span>Rejects</span><strong>{performanceReport.summary?.total_rejects || 0}</strong></article>
            <article className="production-mini-card"><span>WIP</span><strong>{flowSummary.wip_orders || 0}</strong></article>
          </div>
          <p className="production-note">{performanceReport.derived_metrics_note || 'Derived from production stage events.'}</p>
        </div>

        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Loss Analytics</p>
              <h3>Quality loss concentration</h3>
            </div>
          </div>
          <div className="chart-grid one-col production-chart-grid">
            <BarChartCard title="Rework + Reject Concentration" data={qualityLossChart} yLabel="Loss events" format="number" />
          </div>
        </div>
      </div>

      <div className="production-panel">
        <div className="production-section-head">
          <div>
            <p className="production-section-kicker">Stage Ranking</p>
            <h3>Performance by stage</h3>
          </div>
        </div>
        <div className="production-drilldown-grid">
          {performanceStageCards.map((row) => (
            <article key={row.stage_name} className="production-drilldown-card">
              <div className="production-drilldown-head">
                <div>
                  <strong>{row.stage_name}</strong>
                  <p>Cycle {row.avg_cycle_hours} hrs</p>
                </div>
                <div className="production-chip-row">
                  <label className={`production-chip ${row.severity_tone}`}>{row.severity_label}</label>
                  <label className="production-chip neutral">Risk {row.risk_score}</label>
                </div>
              </div>
              <div className="production-drilldown-metrics">
                <div><span>WIP</span><strong>{row.wip_orders}</strong></div>
                <div><span>Completed</span><strong>{row.completed_count}</strong></div>
                <div><span>Hold %</span><strong>{row.hold_rate_pct}</strong></div>
                <div><span>Rework %</span><strong>{row.rework_rate_pct}</strong></div>
                <div><span>Quality %</span><strong>{row.quality_pct}</strong></div>
                <div><span>OEE %</span><strong>{row.oee_pct}</strong></div>
              </div>
              <p className="production-note">{row.action}</p>
            </article>
          ))}
        </div>
      </div>
    </>
  );

  const agingSections = (
    <>
      <div className="chart-grid two-col production-chart-grid">
        <BarChartCard title="Overdue By Stage" data={overdueStageChart} yLabel="Overdue orders" format="number" />
        <DonutChartCard title="WIP Age Mix" data={agingMixChart} totalLabel="Pairs" />
      </div>

      <div className="production-story-grid">
        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Aging Snapshot</p>
              <h3>Where delivery risk is building</h3>
            </div>
            <button type="button" className="button-secondary metric-export-btn" onClick={exportAgingCsv}>
              Export CSV
            </button>
          </div>
          <div className="production-mini-grid">
            <article className="production-mini-card"><span>Total WIP</span><strong>{agingReport.summary?.total_wip || 0}</strong></article>
            <article className="production-mini-card"><span>Overdue Orders</span><strong>{agingReport.summary?.overdue_count || 0}</strong></article>
            <article className="production-mini-card"><span>Aged &gt; 30 Days</span><strong>{agingReport.summary?.age_gt_30 || 0}</strong></article>
            <article className="production-mini-card"><span>Overdue %</span><strong>{Number(agingReport.summary?.overdue_pct || 0).toFixed(2)}%</strong></article>
          </div>
        </div>

        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Movement</p>
              <h3>Daily production flow</h3>
            </div>
            <button type="button" className="button-secondary metric-export-btn" onClick={exportDateWiseCsv}>
              Export CSV
            </button>
          </div>
          <div className="production-drilldown-grid production-drilldown-grid-tight">
            {movementCards.map((row) => (
              <article key={row.date} className="production-drilldown-card production-drilldown-card-compact">
                <div className="production-drilldown-head">
                  <div>
                    <strong>{row.date}</strong>
                    <p>Movement snapshot</p>
                  </div>
                  <label className={`production-chip ${row.completed >= row.created ? 'stable' : 'high'}`}>
                    {row.completed >= row.created ? 'Healthy flow' : 'Backlog risk'}
                  </label>
                </div>
                <div className="production-drilldown-metrics">
                  <div><span>Created</span><strong>{row.created}</strong></div>
                  <div><span>Moved</span><strong>{row.moved}</strong></div>
                  <div><span>Completed</span><strong>{row.completed}</strong></div>
                  <div><span>Holds</span><strong>{row.holds}</strong></div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="production-panel">
        <div className="production-section-head">
          <div>
            <p className="production-section-kicker">Stage Aging</p>
            <h3>WIP age by production stage</h3>
          </div>
        </div>
        <div className="production-drilldown-grid">
          {agingStageCards.map((row) => (
            <article key={row.stage_name} className="production-drilldown-card">
              <div className="production-drilldown-head">
                <div>
                  <strong>{row.stage_name}</strong>
                  <p>{row.total_wip} total WIP</p>
                </div>
                <div className="production-chip-row">
                  <label className={`production-chip ${Number(row.overdue_count || 0) > 0 ? 'critical' : 'stable'}`}>
                    {Number(row.overdue_count || 0) > 0 ? `${row.overdue_count} overdue` : 'On time'}
                  </label>
                  <label className="production-chip neutral">{row.avg_age_days} avg days</label>
                </div>
              </div>
              <div className="production-drilldown-metrics">
                <div><span>0-7</span><strong>{row.age_0_7}</strong></div>
                <div><span>8-14</span><strong>{row.age_8_14}</strong></div>
                <div><span>15-30</span><strong>{row.age_15_30}</strong></div>
                <div><span>&gt;30</span><strong>{row.age_gt_30}</strong></div>
                <div><span>Overdue</span><strong>{row.overdue_count}</strong></div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </>
  );

  const stageSections = (
    <div className="production-panel">
      <div className="production-section-head">
        <div>
          <p className="production-section-kicker">Operational Drilldown</p>
          <h3>Stage launchpad</h3>
        </div>
      </div>
      <div className="production-stage-grid">
        {STAGE_ORDER.map((stage) => {
          const stageItems = board[stage] || [];
          const lateCount = stageItems.filter((item) => isLate(item)).length;
          const stageRisk = stageRiskRows.find((row) => row.stage_name === stage);
          const stageTone = stageRisk?.severity_tone || (lateCount > 0 ? 'high' : 'stable');
          return (
            <article
              className={`production-stage-card ${stageTone}`}
              key={stage}
              role="button"
              tabIndex={0}
              onClick={() => openStageWindow(stage)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openStageWindow(stage);
                }
              }}
            >
              <div className="production-stage-head">
                <h4>{stage}</h4>
                <span>{stageItems.length || 0} active</span>
              </div>
              <div className="production-chip-row">
                <label className={`production-chip ${stageTone}`}>{stageRisk?.severity_label || (lateCount > 0 ? 'High' : 'Stable')}</label>
                {stageRisk?.action ? <label className="production-chip neutral">{stageRisk.action}</label> : null}
              </div>
              <strong>{lateCount}</strong>
              <p>Late pairs needing escalation.</p>
              <button type="button" className="button-secondary">Open Stage</button>
            </article>
          );
        })}
      </div>
    </div>
  );

  return (
    <section className="production-page">
      <div className={showSidebar ? 'production-shell' : 'production-shell production-shell-focused'}>
        {showSidebar ? (
          <aside className="production-sidebar">
          <div className="production-sidebar-brand">
            <p className="production-kicker">Manufacturing control center</p>
            <h2>Production Command</h2>
            <p className="production-subtitle">
              Decision-first workspace for throughput, delivery risk, and stage intervention.
            </p>
          </div>

          <div className="production-sidebar-section">
            <span className="production-sidebar-label">Workspaces</span>
            <div className="production-sidebar-nav">
              {workspaceButtons.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={activeWorkspace === item.id ? 'production-nav-btn active' : 'production-nav-btn'}
                  onClick={() => openWorkspacePage(item.page)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="production-sidebar-section">
            <span className="production-sidebar-label">Critical focus</span>
            <div className="production-sidebar-stack">
              <article className="production-sidebar-card">
                <strong>{topLateStage?.stage || '-'}</strong>
                <span>Most exposed stage</span>
                <p>{topLateStage?.lateCount || 0} late pairs concentrated here.</p>
              </article>
              <article className="production-sidebar-card">
                <strong>{backlogDelta > 0 ? `+${backlogDelta}` : backlogDelta}</strong>
                <span>Backlog delta</span>
                <p>{createdWindow} created vs {completedWindow} completed in current window.</p>
              </article>
              <article className="production-sidebar-card production-sidebar-card-alert">
                <strong>{bottleneckStages[0]?.action || 'Monitor'}</strong>
                <span>Primary action</span>
                <p>{bottleneckStages[0]?.stage_name || 'No stage selected'} is the top operational priority.</p>
              </article>
            </div>
          </div>
          </aside>
        ) : null}

        <div className={showSidebar ? 'production-main' : 'production-main production-main-focused'}>
          <div className={showSidebar ? 'production-topbar' : 'production-topbar production-topbar-focused'}>
            <div className="production-topbar-copy">
              <div className="production-page-utility">
                <button
                  type="button"
                  className="production-hamburger"
                  aria-label="Open production navigation"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen((value) => !value)}
                >
                  <span />
                  <span />
                  <span />
                </button>
                {menuOpen && (
                  <div className="production-hamburger-menu">
                    {workspaceButtons.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={activeWorkspace === item.id ? 'production-hamburger-link active' : 'production-hamburger-link'}
                        onClick={() => openWorkspacePage(item.page)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <p className="production-kicker">Manager workspace</p>
              <h3>{pageTitleMap[activeWorkspace] || 'Production Overview'}</h3>
              <p className="production-subtitle">
                {pageIntroMap[activeWorkspace] || pageIntroMap.overview}
              </p>
            </div>
            <div className={showSidebar ? 'production-hero-actions' : 'production-hero-actions production-hero-actions-focused'}>
              <label className="production-filter">
                <span>From</span>
                <input
                  type="date"
                  value={reportFilters.from}
                  onChange={(e) => setReportFilters((p) => ({ ...p, from: e.target.value }))}
                />
              </label>
              <label className="production-filter">
                <span>To</span>
                <input
                  type="date"
                  value={reportFilters.to}
                  onChange={(e) => setReportFilters((p) => ({ ...p, to: e.target.value }))}
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  loadDateWiseReport(reportFilters.from, reportFilters.to);
                  loadPerformanceReport(reportFilters.from, reportFilters.to);
                  loadAgingReport(reportFilters.to);
                  loadControlTowerReport(reportFilters.to);
                }}
              >
                Refresh Workspace
              </button>
            </div>
          </div>

          <div className="production-page-nav-strip">
            {workspaceButtons.map((item) => (
              <button
                key={item.id}
                type="button"
                className={activeWorkspace === item.id ? '' : 'button-secondary'}
                onClick={() => openWorkspacePage(item.page)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {leadAlert && (
            <article className={`production-alert-banner production-alert-banner-inline ${leadAlert.tone}`}>
              <div className="production-alert-copy">
                <span>Decision Focus</span>
                <strong>{leadAlert.title}</strong>
                <p>{leadAlert.detail}</p>
              </div>
              <div className="production-alert-actions">
                <button type="button" className="button-secondary" onClick={exportLatePairsCsv}>
                  Export Late Pairs
                </button>
              </div>
            </article>
          )}

          <div className="production-summary-rail">
            {workspaceSummaryCards.map((card) => (
              <article key={card.label} className="production-summary-card">
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <p>{card.note}</p>
              </article>
            ))}
          </div>

          {activeWorkspace === 'overview' && overviewSections}
          {activeWorkspace === 'performance' && performanceSections}
          {activeWorkspace === 'aging' && agingSections}
          {activeWorkspace === 'stages' && stageSections}
        </div>
      </div>
    </section>
  );
}

