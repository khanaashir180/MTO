import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { BarChartCard, DonutChartCard, LineChartCard } from './ReportingCharts';
import { useAuth } from '../context/AuthContext';

function dateOnly(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function getWeekStart(value) {
  const date = new Date(value || new Date().toISOString().slice(0, 10));
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date.toISOString().slice(0, 10);
}

function buildWeekDates(startDate) {
  const start = new Date(startDate);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

function targetCellKey(targetDate, shiftName) {
  return `${targetDate}__${shiftName}`;
}

const FACTORY_SHIFT_NAME = 'Day';
const STAGE_WORKSPACES = ['command', 'planning', 'flow', 'quality', 'roster'];

function exportStageCsv(stageName, items) {
  const header = [
    'Order Number',
    'Customer',
    'Flow',
    'Due Date',
    'Late',
    'Redo',
    'Hold',
    'Age Days',
    'Barcode',
  ].join(',');
  const rows = items.map((item) => ([
    `"${String(item.production_order_no || '').replace(/"/g, '""')}"`,
    `"${String(item.customer_name || '').replace(/"/g, '""')}"`,
    item.production_flow || '',
    dateOnly(item.due_date),
    item.is_late ? 'Yes' : 'No',
    item.is_redo ? 'Yes' : 'No',
    item.status || '',
    item.age_days || 0,
    `"${String(item.barcode || '').replace(/"/g, '""')}"`,
  ].join(',')));
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${String(stageName || 'stage').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-detail.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function StageDetailPage({ stageName, refreshSignal }) {
  const { user } = useAuth();
  const [activeWorkspace, setActiveWorkspace] = useState(() => {
    if (typeof window === 'undefined') return 'command';
    const workspace = new URLSearchParams(window.location.search).get('workspace');
    return STAGE_WORKSPACES.includes(workspace) ? workspace : 'command';
  });
  const [slaHours, setSlaHours] = useState(() => {
    try {
      return localStorage.getItem(`stage_sla_hours_${stageName}`) || '';
    } catch (_) {
      return '';
    }
  });
  const [targetDate, setTargetDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shiftTargets, setShiftTargets] = useState({ [FACTORY_SHIFT_NAME]: '' });
  const [report, setReport] = useState({
    stage: null,
    summary: {},
    current_items: [],
    trend: [],
    blockers: [],
    operators: [],
    shift_board: [],
    allocation_plan: [],
    dispatch_queue: [],
    exception_queue: [],
    sla_alerts: {},
    dependency_view: [],
    action_audit: [],
    dependency_chain: [],
    target_history: [],
    weekly_targets: [],
    variance_reasons: [],
    weekly_attainment: [],
    pending_target_approvals: [],
    target_settings: {},
    notifications: [],
    target_suggestion: {},
  });
  const [message, setMessage] = useState('');
  const [weeklyTargets, setWeeklyTargets] = useState({});
  const [varianceDrafts, setVarianceDrafts] = useState({});
  const [targetSettingsDraft, setTargetSettingsDraft] = useState({ approvalAbsoluteDelta: '40', approvalPercentDelta: '0.30' });
  const [notificationFilter, setNotificationFilter] = useState('all');

  const setWorkspace = useCallback((workspaceId) => {
    setActiveWorkspace(workspaceId);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', workspaceId);
    window.history.replaceState({}, '', url.toString());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const syncWorkspaceFromUrl = () => {
      const workspace = new URLSearchParams(window.location.search).get('workspace');
      setActiveWorkspace(STAGE_WORKSPACES.includes(workspace) ? workspace : 'command');
    };
    window.addEventListener('popstate', syncWorkspaceFromUrl);
    syncWorkspaceFromUrl();
    return () => window.removeEventListener('popstate', syncWorkspaceFromUrl);
  }, []);

  const loadReport = useCallback(() => {
    if (!stageName) return;
    const query = new URLSearchParams({ stageName });
    if (slaHours) query.set('slaHours', slaHours);
    if (targetDate) query.set('targetDate', targetDate);
    api.get(`/production/reports/stage-detail?${query.toString()}`).then(({ data }) => {
      const currentItems = (data.current_items || []).map((item) => ({
        ...item,
        is_late: Number(item.due_in_days) < 0,
      }));
      setReport({ ...data, current_items: currentItems });
      const mappedTargets = (data.shift_board || []).reduce((acc, row) => ({
        ...acc,
        [row.shift_name]: String(row.target_completed || 0),
      }), { [FACTORY_SHIFT_NAME]: '' });
      setShiftTargets(mappedTargets);
      const mappedWeeklyTargets = (data.weekly_targets || []).reduce((acc, row) => ({
        ...acc,
        [targetCellKey(dateOnly(row.target_date), row.shift_name)]: String(row.target_pairs || 0),
      }), {});
      setWeeklyTargets(mappedWeeklyTargets);
      const mappedVariances = (data.variance_reasons || []).reduce((acc, row) => ({
        ...acc,
        [row.shift_name]: {
          reasonCode: row.reason_code || '',
          notes: row.notes || '',
          actorName: row.actor_name || '',
          updatedAt: row.updated_at || '',
        },
      }), {});
      setVarianceDrafts(mappedVariances);
      setTargetSettingsDraft({
        approvalAbsoluteDelta: String(data.target_settings?.approval_absolute_delta ?? 40),
        approvalPercentDelta: String(data.target_settings?.approval_percent_delta ?? 0.3),
      });
    });
  }, [stageName, slaHours, targetDate]);

  useEffect(() => {
    loadReport();
  }, [loadReport, refreshSignal]);

  const summary = report.summary || {};
  const currentItems = useMemo(() => report.current_items || [], [report.current_items]);
  const blockers = report.blockers || [];
  const operators = report.operators || [];
  const trend = report.trend || [];
  const shiftBoard = report.shift_board || [];
  const allocationPlan = report.allocation_plan || [];
  const dispatchQueue = report.dispatch_queue || [];
  const exceptionQueue = report.exception_queue || [];
  const slaAlerts = report.sla_alerts || {};
  const dependencyView = report.dependency_view || [];
  const actionAudit = report.action_audit || [];
  const dependencyChain = report.dependency_chain || [];
  const targetHistory = report.target_history || [];
  const weeklyAttainment = report.weekly_attainment || [];
  const pendingTargetApprovals = report.pending_target_approvals || [];
  const notifications = report.notifications || [];
  const targetSuggestion = report.target_suggestion || {};
  const isManager = ['PRODUCTION_MANAGER', 'SUPER_USER'].includes(user?.role);
  const isSuperUser = user?.role === 'SUPER_USER';
  const weekStart = useMemo(() => getWeekStart(targetDate), [targetDate]);
  const weekDates = useMemo(() => buildWeekDates(weekStart), [weekStart]);
  const workspaceButtons = [
    { id: 'command', label: 'Command' },
    { id: 'planning', label: 'Planning' },
    { id: 'flow', label: 'Flow' },
    { id: 'quality', label: 'Quality' },
    { id: 'roster', label: 'Roster' },
  ];

  const flowMix = useMemo(() => ([
    { label: 'Bespoke', value: currentItems.filter((item) => item.production_flow === 'BESPOKE').length },
    { label: 'MTO', value: currentItems.filter((item) => item.production_flow === 'MTO').length },
    { label: 'Laser', value: currentItems.filter((item) => item.production_flow === 'LASER').length },
    { label: 'Embroidery', value: currentItems.filter((item) => item.production_flow === 'EMBROIDERY').length },
  ]), [currentItems]);

  const blockerChart = blockers.map((row) => ({
    label: String(row.blocker_reason || row.status || '-').slice(0, 28),
    value: Number(row.event_count || 0),
  }));
  const rejectionChart = blockers
    .filter((row) => row.status === 'REJECTED')
    .map((row) => ({
      label: String(row.blocker_reason || 'Rejected').slice(0, 28),
      value: Number(row.event_count || 0),
    }));

  const operatorChart = operators.map((row) => ({
    label: String(row.operator_name || '-').slice(0, 20),
    value: Number(row.event_count || 0),
  }));

  const throughputTrend = trend.map((row) => ({
    label: dateOnly(row.report_date).slice(5, 10),
    value: Number(row.completed_count || 0),
  }));
  const shiftAchievement = shiftBoard.map((row) => ({
    label: row.shift_name,
    value: Number(row.completed_count || 0),
  }));
  const missedTargetRows = shiftBoard.filter((row) => Number(row.completed_count || 0) < Number(row.target_completed || 0));
  const visibleNotifications = notifications.filter((row) => (
    notificationFilter === 'all'
      ? true
      : notificationFilter === 'unread'
        ? !row.is_read
        : row.notification_type === notificationFilter
  ));

  async function advanceOrder(orderId) {
    try {
      await api.post('/production/advance', { orderId });
      setMessage('Order advanced.');
      loadReport();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to advance order');
    }
  }

  async function moveBackOrder(orderId) {
    const reason = window.prompt('Reason for move back');
    if (!reason || !reason.trim()) return;
    try {
      await api.post('/production/move-back', { orderId, reason });
      setMessage('Order moved back.');
      loadReport();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to move back order');
    }
  }

  async function rejectOrder(barcode) {
    const reason = window.prompt('Reason for rejection');
    if (!reason || !reason.trim()) return;
    try {
      await api.post('/production/reject', { barcode, reason });
      setMessage('Order rejected.');
      loadReport();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to reject order');
    }
  }

  async function markSoleComplete(orderId) {
    try {
      await api.post('/production/mto/sole-complete', { orderId });
      setMessage('MTO sole marked completed.');
      loadReport();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to mark sole complete');
    }
  }

  function saveSlaHours() {
    try {
      localStorage.setItem(`stage_sla_hours_${stageName}`, String(slaHours || ''));
    } catch (_) {
      // ignore storage failures
    }
    setMessage('SLA target updated.');
    loadReport();
  }

  async function saveShiftTargets() {
    try {
      await api.post('/production/targets', {
        stageName,
        targetDate,
        shifts: [FACTORY_SHIFT_NAME].map((shiftName) => ({
          shift_name: shiftName,
          target_pairs: Number(shiftTargets[shiftName] || 0),
        })),
      });
      setMessage(`Production targets updated for ${targetDate}.`);
      loadReport();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save targets');
    }
  }

  async function saveWeeklyTargets() {
    try {
      await api.post('/production/targets/weekly', {
        stageName,
        weekStartDate: weekStart,
        days: weekDates.map((dateValue) => ({
          targetDate: dateValue,
          shifts: [FACTORY_SHIFT_NAME].map((shiftName) => ({
            shift_name: shiftName,
            target_pairs: Number(weeklyTargets[targetCellKey(dateValue, shiftName)] || 0),
          })),
        })),
      });
      setMessage(`Weekly targets updated from ${weekStart}.`);
      loadReport();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save weekly targets');
    }
  }

  async function saveVarianceReason(shiftName) {
    const draft = varianceDrafts[shiftName] || {};
    if (!draft.reasonCode) {
      setMessage(`Select a variance reason for ${shiftName}.`);
      return;
    }
    try {
      await api.post('/production/targets/variance', {
        stageName,
        targetDate,
        shiftName,
        reasonCode: draft.reasonCode,
        notes: draft.notes || '',
      });
      setMessage(`Variance reason saved for ${shiftName}.`);
      loadReport();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save variance reason');
    }
  }

  async function decideApproval(approvalId, decision) {
    const notes = decision === 'REJECTED' ? window.prompt('Reason for rejection') : '';
    if (decision === 'REJECTED' && (!notes || !notes.trim())) return;
    try {
      await api.post('/production/targets/approval', {
        approvalId,
        decision,
        notes: notes || '',
      });
      setMessage(`Approval ${decision.toLowerCase()}.`);
      loadReport();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to process approval');
    }
  }

  async function saveTargetSettings() {
    try {
      await api.post('/production/targets/settings', {
        stageName,
        approvalAbsoluteDelta: Number(targetSettingsDraft.approvalAbsoluteDelta || 0),
        approvalPercentDelta: Number(targetSettingsDraft.approvalPercentDelta || 0),
      });
      setMessage('Target approval settings saved.');
      loadReport();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save target settings');
    }
  }

  async function markNotificationRead(notificationId) {
    try {
      await api.post('/production/notifications/read', { stageName, notificationId });
      loadReport();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to mark notification read');
    }
  }

  async function markAllNotificationsRead() {
    try {
      await api.post('/production/notifications/read', { stageName, markAll: true });
      loadReport();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to mark notifications read');
    }
  }

  async function updateNotificationWorkflow(notificationId, changes) {
    try {
      await api.post('/production/notifications/workflow', {
        stageName,
        notificationId,
        ...changes,
      });
      loadReport();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update notification workflow');
    }
  }

  function exportWeeklyAttainmentCsv() {
    const header = ['Date', 'Planned Pairs', 'Carry Forward', 'Adjusted Target', 'Actual Pairs', 'Gap'].join(',');
    const rows = weeklyAttainment.map((row) => [
      row.target_date,
      row.planned_pairs || 0,
      row.carry_forward_pairs || 0,
      row.adjusted_target_pairs || 0,
      row.actual_pairs || 0,
      row.gap_pairs || 0,
    ].join(','));
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${String(stageName || 'stage').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-weekly-attainment.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function printWeeklySummary() {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=980,height=720');
    if (!printWindow) return;
    const rows = weeklyAttainment.map((row) => `
      <tr>
        <td>${row.target_date}</td>
        <td>${row.planned_pairs || 0}</td>
        <td>${row.carry_forward_pairs || 0}</td>
        <td>${row.adjusted_target_pairs || 0}</td>
        <td>${row.actual_pairs || 0}</td>
        <td>${row.gap_pairs || 0}</td>
      </tr>
    `).join('');
    printWindow.document.write(`
      <html>
        <head>
          <title>${stageName} Weekly Summary</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 24px; color: #0f172a; }
            h1, h2 { margin: 0 0 12px; }
            p { margin: 0 0 8px; }
            table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
            th { background: #e2e8f0; }
            .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
            .summary div { border: 1px solid #cbd5e1; padding: 12px; border-radius: 8px; }
          </style>
        </head>
        <body>
          <h1>${stageName} Weekly Production Summary</h1>
          <p>Week starting ${weekStart}</p>
          <p>Suggested next-day target: ${targetSuggestion.suggested_pairs || 0} pairs</p>
          <p>${targetSuggestion.basis || ''}</p>
          <div class="summary">
            <div><strong>Pending approvals</strong><br/>${pendingTargetApprovals.length}</div>
            <div><strong>Unread notifications</strong><br/>${notifications.filter((row) => !row.is_read).length}</div>
            <div><strong>Carry forward</strong><br/>${weeklyAttainment[weeklyAttainment.length - 1]?.carry_forward_pairs || 0}</div>
          </div>
          <h2>Weekly Attainment</h2>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Plan</th>
                <th>Carry</th>
                <th>Adjusted</th>
                <th>Actual</th>
                <th>Gap</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  if (!stageName) {
    return (
      <section className="module-page">
        <div className="module-hero">
          <div>
            <p className="module-kicker">Stage Drilldown</p>
            <h2>Stage Details</h2>
            <p className="module-subtitle">Stage is not specified.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="module-page">
      <div className="module-hero">
        <div>
          <p className="module-kicker">Production Stage Cockpit</p>
          <h2>{stageName}</h2>
          <p className="module-subtitle">Manager drilldown for workload, throughput, blockers, operator activity, and due-date pressure inside this stage.</p>
        </div>
        <div className="production-hero-actions production-hero-actions-focused">
          <label className="production-filter">
            <span>Target Date</span>
            <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </label>
          <label className="production-filter">
            <span>SLA Hours</span>
            <input type="number" min="1" value={slaHours} onChange={(e) => setSlaHours(e.target.value)} />
          </label>
          <button type="button" onClick={saveSlaHours}>Apply SLA</button>
        </div>
      </div>

      {message ? (
        <article className="production-alert-banner production-alert-banner-inline moderate">
          <div className="production-alert-copy">
            <span>Stage Update</span>
            <strong>{message}</strong>
          </div>
        </article>
      ) : null}

      {(Number(slaAlerts.breach_count || 0) > 0 || Number(slaAlerts.at_risk_count || 0) > 0) && (
        <article className={`production-alert-banner production-alert-banner-inline ${Number(slaAlerts.breach_count || 0) > 0 ? 'critical' : 'high'}`}>
          <div className="production-alert-copy">
            <span>SLA Alert</span>
            <strong>{Number(slaAlerts.breach_count || 0)} breaches, {Number(slaAlerts.at_risk_count || 0)} at risk</strong>
            <p>Stage target is {Number(slaAlerts.target_hours || 0)} hours of dwell time inside {stageName}.</p>
          </div>
        </article>
      )}

      <div className="stage-workspace-nav" role="tablist" aria-label="Stage workspaces">
        {workspaceButtons.map((workspace) => (
          <button
            key={workspace.id}
            type="button"
            className={`production-nav-btn ${activeWorkspace === workspace.id ? 'active' : ''}`}
            onClick={() => setWorkspace(workspace.id)}
          >
            {workspace.label}
          </button>
        ))}
      </div>

      <div className="stage-focus-grid">
        <article className="stage-focus-card stage-focus-card-primary">
          <span>Command Focus</span>
          <strong>{targetSuggestion.suggested_pairs || 0} pairs</strong>
          <p>{targetSuggestion.basis || 'Suggested output target will appear here once stage history is available.'}</p>
        </article>
        <article className="stage-focus-card">
          <span>Exception Load</span>
          <strong>{exceptionQueue.length}</strong>
          <p>{exceptionQueue.length > 0 ? 'Orders need managed intervention before flow stabilizes.' : 'No high-severity exceptions are open right now.'}</p>
        </article>
        <article className="stage-focus-card">
          <span>Planning Pressure</span>
          <strong>{missedTargetRows.length}</strong>
          <p>{missedTargetRows.length > 0 ? 'Missed targets need variance capture and replan.' : 'Current date is on target or above plan.'}</p>
        </article>
        <article className="stage-focus-card">
          <span>Control Signal</span>
          <strong>{visibleNotifications.filter((row) => !row.is_read).length}</strong>
          <p>{visibleNotifications.length > 0 ? 'Unread target-control notifications are waiting for attention.' : 'No active notification pressure in this view.'}</p>
        </article>
      </div>

      <div hidden={activeWorkspace !== 'planning'}>
      <div className="production-panel">
        <div className="production-section-head">
          <div>
            <p className="production-section-kicker">Production Target Plan</p>
            <h3>Set handmade pair targets for {targetDate}</h3>
          </div>
          {isManager && (
            <button type="button" className="button-secondary metric-export-btn" onClick={saveShiftTargets}>
              Save Targets
            </button>
          )}
        </div>
        <div className="production-drilldown-grid production-drilldown-grid-tight">
          {[FACTORY_SHIFT_NAME].map((shiftName) => (
            <article key={shiftName} className="production-drilldown-card production-drilldown-card-compact">
              <div className="production-drilldown-head">
                <div>
                  <strong>{shiftName}</strong>
                  <p>Planned pairs for {stageName}</p>
                </div>
                <label className="production-chip neutral">{targetDate}</label>
              </div>
              <label className="production-filter production-filter-block">
                <span>Target Pairs</span>
                <input
                  type="number"
                  min="0"
                  value={shiftTargets[shiftName] ?? ''}
                  onChange={(e) => setShiftTargets((prev) => ({ ...prev, [shiftName]: e.target.value }))}
                  disabled={!isManager}
                />
              </label>
            </article>
          ))}
        </div>
      </div>

      <div className="production-panel">
        <div className="production-section-head">
          <div>
            <p className="production-section-kicker">Weekly Target Planner</p>
            <h3>Plan the full week from {weekStart}</h3>
          </div>
          {isManager && (
            <button type="button" className="button-secondary metric-export-btn" onClick={saveWeeklyTargets}>
              Save Week
            </button>
          )}
        </div>
        <div className="production-drilldown-grid">
          {weekDates.map((dateValue) => (
            <article key={dateValue} className="production-drilldown-card">
              <div className="production-drilldown-head">
                <div>
                  <strong>{dateValue}</strong>
                  <p>{new Date(dateValue).toLocaleDateString(undefined, { weekday: 'long' })}</p>
                </div>
                <label className={`production-chip ${dateValue === targetDate ? 'high' : 'neutral'}`}>
                  {dateValue === targetDate ? 'Selected day' : 'Week plan'}
                </label>
              </div>
              <div className="production-drilldown-grid production-drilldown-grid-tight">
                {[FACTORY_SHIFT_NAME].map((shiftName) => (
                  <label key={`${dateValue}-${shiftName}`} className="production-filter production-filter-block">
                    <span>{shiftName}</span>
                    <input
                      type="number"
                      min="0"
                      value={weeklyTargets[targetCellKey(dateValue, shiftName)] ?? ''}
                      onChange={(e) => setWeeklyTargets((prev) => ({
                        ...prev,
                        [targetCellKey(dateValue, shiftName)]: e.target.value,
                      }))}
                      disabled={!isManager}
                    />
                  </label>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      </div>

      <div hidden={activeWorkspace !== 'command'}>
      <div className="production-story-grid">
        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Weekly Attainment</p>
              <h3>Planned vs actual with carry-forward</h3>
            </div>
            <div className="actions-cell">
              <button type="button" className="button-secondary metric-export-btn" onClick={exportWeeklyAttainmentCsv}>
                Export CSV
              </button>
              <button type="button" className="button-secondary" onClick={printWeeklySummary}>
                Print Summary
              </button>
            </div>
          </div>
          <div className="production-order-list">
            {weeklyAttainment.map((row) => (
              <article key={row.target_date} className="production-order-card">
                <div className="production-order-head">
                  <strong>{row.target_date}</strong>
                  <span>{row.gap_pairs >= 0 ? `+${row.gap_pairs}` : row.gap_pairs}</span>
                </div>
                <div className="production-drilldown-metrics">
                  <div><span>Plan</span><strong>{row.planned_pairs}</strong></div>
                  <div><span>Carry</span><strong>{row.carry_forward_pairs}</strong></div>
                  <div><span>Adjusted</span><strong>{row.adjusted_target_pairs}</strong></div>
                  <div><span>Actual</span><strong>{row.actual_pairs}</strong></div>
                </div>
                <p className="production-note">
                  {row.carry_forward_pairs > 0
                    ? `${row.carry_forward_pairs} pairs carried in from the previous day shortfall.`
                    : 'No carry-forward pressure into this day.'}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Target Approvals</p>
              <h3>Threshold changes waiting for decision</h3>
            </div>
          </div>
          <div className="production-order-list">
            {pendingTargetApprovals.map((row) => (
              <article key={row.id} className="production-order-card">
                <div className="production-order-head">
                  <strong>{row.shift_name}</strong>
                  <span>{dateOnly(row.target_date)}</span>
                </div>
                <div className="production-drilldown-metrics">
                  <div><span>Current</span><strong>{row.existing_target_pairs ?? '-'}</strong></div>
                  <div><span>Requested</span><strong>{row.requested_target_pairs}</strong></div>
                </div>
                <p className="production-note">Requested by {row.requested_by_name}.</p>
                {isSuperUser ? (
                  <div className="actions-cell">
                    <button type="button" className="button-secondary" onClick={() => decideApproval(row.id, 'APPROVED')}>
                      Approve
                    </button>
                    <button type="button" className="button-secondary" onClick={() => decideApproval(row.id, 'REJECTED')}>
                      Reject
                    </button>
                  </div>
                ) : (
                  <label className="production-chip neutral">Pending approval</label>
                )}
              </article>
            ))}
            {pendingTargetApprovals.length === 0 && (
              <article className="production-order-card">
                <strong>No pending approvals</strong>
                <p className="production-note">Large target changes awaiting sign-off will appear here.</p>
              </article>
            )}
          </div>
        </div>
      </div>

      <div className="production-panel">
        <div className="production-section-head">
          <div>
            <p className="production-section-kicker">Suggested Target</p>
            <h3>Recommended next-day plan</h3>
          </div>
        </div>
          <div className="production-drilldown-grid production-drilldown-grid-tight">
            <article className="production-drilldown-card production-drilldown-card-compact">
              <div className="production-drilldown-head">
                <div>
                  <strong>Suggested Pairs</strong>
                <p>For the next production day</p>
              </div>
              <label className="production-chip high">{targetSuggestion.suggested_pairs || 0}</label>
            </div>
              <div className="production-drilldown-metrics">
                <div><span>Recent Avg</span><strong>{targetSuggestion.recent_avg_actual || 0}</strong></div>
                <div><span>Carry Forward</span><strong>{targetSuggestion.carry_forward_pairs || 0}</strong></div>
                <div><span>Capacity</span><strong>{targetSuggestion.staffing_capacity_pairs || 0}</strong></div>
                <div><span>WIP</span><strong>{targetSuggestion.active_wip_pairs || 0}</strong></div>
              </div>
              <p className="production-note">{targetSuggestion.basis || 'No suggestion available yet.'}</p>
            </article>
          </div>
        </div>

      <div className="production-story-grid">
        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Approval Settings</p>
              <h3>Control when target changes need sign-off</h3>
            </div>
            {isSuperUser && (
              <button type="button" className="button-secondary metric-export-btn" onClick={saveTargetSettings}>
                Save Settings
              </button>
            )}
          </div>
          <div className="production-drilldown-grid production-drilldown-grid-tight">
            <label className="production-filter production-filter-block">
              <span>Absolute pair delta</span>
              <input
                type="number"
                min="0"
                value={targetSettingsDraft.approvalAbsoluteDelta}
                onChange={(e) => setTargetSettingsDraft((prev) => ({ ...prev, approvalAbsoluteDelta: e.target.value }))}
                disabled={!isSuperUser}
              />
            </label>
            <label className="production-filter production-filter-block">
              <span>Percent delta</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={targetSettingsDraft.approvalPercentDelta}
                onChange={(e) => setTargetSettingsDraft((prev) => ({ ...prev, approvalPercentDelta: e.target.value }))}
                disabled={!isSuperUser}
              />
            </label>
          </div>
        </div>

        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Notifications</p>
              <h3>Recent target-control events</h3>
            </div>
            <div className="actions-cell">
              <label className="production-filter production-filter-inline">
                <span>Filter</span>
                <select value={notificationFilter} onChange={(e) => setNotificationFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="unread">Unread</option>
                  <option value="TARGET_APPROVAL_REQUIRED">Approval required</option>
                  <option value="TARGET_APPROVED">Approved</option>
                  <option value="TARGET_REJECTED">Rejected</option>
                </select>
              </label>
              <button type="button" className="button-secondary" onClick={markAllNotificationsRead}>
                Mark All Read
              </button>
            </div>
          </div>
          <div className="production-order-list">
            {visibleNotifications.map((row) => (
              <article key={row.id} className="production-order-card">
                <div className="production-order-head">
                  <strong>{row.title}</strong>
                  <span>{dateOnly(row.created_at)}</span>
                </div>
                <div className="production-chip-row">
                  <label className={`production-chip ${row.is_read ? 'neutral' : 'high'}`}>{row.is_read ? 'Read' : 'Unread'}</label>
                  <label className="production-chip neutral">{row.notification_type}</label>
                  <label className={`production-chip ${Number(row.escalation_level || 0) > 1 ? 'critical' : Number(row.escalation_level || 0) > 0 ? 'high' : 'neutral'}`}>
                    Escalation {row.escalation_level || 0}
                  </label>
                  <label className={`production-chip ${row.overdue ? 'critical' : 'stable'}`}>
                    {row.overdue ? 'SLA overdue' : `SLA ${row.sla_hours || 0}h`}
                  </label>
                </div>
                <p>{row.message}</p>
                <div className="production-order-meta">
                  <span>Owner {row.assigned_owner || 'Unassigned'}</span>
                  <span>Status {row.workflow_status || 'OPEN'}</span>
                  <span>Age {row.age_hours || 0}h</span>
                </div>
                <div className="actions-cell">
                  {!row.is_read && (
                    <button type="button" className="button-secondary" onClick={() => markNotificationRead(row.id)}>
                      Mark Read
                    </button>
                  )}
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => {
                      const owner = window.prompt('Assign owner', row.assigned_owner || '');
                      if (owner === null) return;
                      updateNotificationWorkflow(row.id, { assignedOwner: owner, workflowStatus: 'IN_PROGRESS' });
                    }}
                  >
                    Assign Owner
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => updateNotificationWorkflow(row.id, { escalationLevel: Number(row.escalation_level || 0) + 1, workflowStatus: 'ESCALATED' })}
                  >
                    Escalate
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => updateNotificationWorkflow(row.id, { workflowStatus: 'CLOSED' })}
                  >
                    Close
                  </button>
                </div>
              </article>
            ))}
            {visibleNotifications.length === 0 && (
              <article className="production-order-card">
                <strong>No notifications</strong>
                <p className="production-note">Approval and target-control events will appear here.</p>
              </article>
            )}
          </div>
        </div>
      </div>
      </div>

      <div hidden={activeWorkspace !== 'command'}>
      <div className="stage-detail-summary">
        <article className="stage-detail-card">
          <span>Active Orders</span>
          <strong>{summary.total_in_stage || 0}</strong>
          <p>Orders currently parked in this stage.</p>
        </article>
        <article className="stage-detail-card">
          <span>Late Pairs</span>
          <strong>{summary.late_pairs || 0}</strong>
          <p>Orders already beyond due date.</p>
        </article>
        <article className="stage-detail-card">
          <span>Hold Exposure</span>
          <strong>{summary.hold_pairs || 0}</strong>
          <p>Orders blocked by active holds.</p>
        </article>
        <article className="stage-detail-card">
          <span>Redo Load</span>
          <strong>{summary.redo_pairs || 0}</strong>
          <p>Orders that have already looped back.</p>
        </article>
        <article className="stage-detail-card">
          <span>Rejections 30D</span>
          <strong>{summary.reject_count_30d || 0}</strong>
          <p>Rejected pairs recorded in the last 30 days.</p>
        </article>
        <article className="stage-detail-card">
          <span>Avg Age</span>
          <strong>{summary.avg_age_days || 0}</strong>
          <p>Average order age in days inside this stage.</p>
        </article>
        <article className="stage-detail-card">
          <span>Avg Processing Time</span>
          <strong>{summary.avg_processing_hours_30d || 0} hrs</strong>
          <p>Average stage processing time over the last 30 days.</p>
        </article>
        <article className="stage-detail-card">
          <div className="metric-card-head">
            <span>Export Stage List</span>
            <button type="button" className="button-secondary metric-export-btn" onClick={() => exportStageCsv(stageName, currentItems)}>
              Export
            </button>
          </div>
          <strong>{summary.due_today || 0}</strong>
          <p>Orders due today requiring active intervention.</p>
        </article>
      </div>

      </div>

      <div hidden={activeWorkspace !== 'quality'}>
      <div className="chart-grid two-col production-chart-grid">
        <LineChartCard title="7-Day Stage Throughput" points={throughputTrend} format="number" />
        <DonutChartCard title="Flow Mix In Stage" data={flowMix} totalLabel="Orders" />
      </div>

      <div className="chart-grid two-col production-chart-grid">
        <BarChartCard title="Top Blocker Reasons" data={blockerChart} yLabel="Events in last 30 days" format="number" />
        <BarChartCard title="Operator Activity Load" data={operatorChart} yLabel="Events in last 14 days" format="number" />
      </div>

      <div className="chart-grid two-col production-chart-grid">
        <BarChartCard title="Rejection Reasons" data={rejectionChart} yLabel="Rejected events in last 30 days" format="number" />
        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Processing Time</p>
              <h3>Stage cycle expectation</h3>
            </div>
          </div>
          <div className="production-drilldown-grid production-drilldown-grid-tight">
            <article className="production-drilldown-card production-drilldown-card-compact">
              <div className="production-drilldown-head">
                <div>
                  <strong>Average Processing Time</strong>
                  <p>Completed work over last 30 days</p>
                </div>
                <label className="production-chip neutral">{summary.avg_processing_hours_30d || 0} hrs</label>
              </div>
              <p className="production-note">
                Use this as the baseline for staffing and dispatch decisions in {stageName}.
              </p>
            </article>
            <article className="production-drilldown-card production-drilldown-card-compact">
              <div className="production-drilldown-head">
                <div>
                  <strong>Rejection Load</strong>
                  <p>Recent quality failure signal</p>
                </div>
                <label className={`production-chip ${Number(summary.reject_count_30d || 0) > 0 ? 'high' : 'stable'}`}>
                  {summary.reject_count_30d || 0} rejects
                </label>
              </div>
              <p className="production-note">
                Review rejection reasons before releasing additional high-risk work into this stage.
              </p>
            </article>
          </div>
        </div>
      </div>

      </div>

      <div hidden={activeWorkspace !== 'flow'}>
      <div className="production-panel">
        <div className="production-section-head">
          <div>
            <p className="production-section-kicker">Dependency View</p>
            <h3>Upstream and downstream stage pressure</h3>
          </div>
        </div>
        <div className="production-drilldown-grid production-drilldown-grid-tight">
          {dependencyView.map((row) => (
            <article key={`${row.dependency_type}-${row.stage_name}`} className="production-drilldown-card production-drilldown-card-compact">
              <div className="production-drilldown-head">
                <div>
                  <strong>{row.stage_name}</strong>
                  <p>{row.dependency_type === 'upstream' ? 'Feeds this stage' : 'Receives from this stage'}</p>
                </div>
                <label className="production-chip neutral">{row.dependency_type}</label>
              </div>
              <div className="production-drilldown-metrics">
                <div><span>Active</span><strong>{row.active_orders}</strong></div>
                <div><span>Late</span><strong>{row.late_pairs}</strong></div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="production-panel">
        <div className="production-section-head">
          <div>
            <p className="production-section-kicker">Dependency Chain</p>
            <h3>Full flow impact by route</h3>
          </div>
        </div>
        <div className="production-order-list">
          {dependencyChain.map((flowRow) => (
            <article key={flowRow.flow} className="production-order-card">
              <div className="production-order-head">
                <strong>{flowRow.flow}</strong>
                <span>{flowRow.stages.length} stages</span>
              </div>
              <div className="production-drilldown-grid production-drilldown-grid-tight">
                {flowRow.stages.map((stageRow) => (
                  <article key={`${flowRow.flow}-${stageRow.stage_name}`} className="production-drilldown-card production-drilldown-card-compact">
                    <div className="production-drilldown-head">
                      <div>
                        <strong>{stageRow.stage_name}</strong>
                        <p>{stageRow.relation}</p>
                      </div>
                      <label className={`production-chip ${stageRow.relation === 'current' ? 'high' : 'neutral'}`}>{stageRow.relation}</label>
                    </div>
                    <div className="production-drilldown-metrics">
                      <div><span>Active</span><strong>{stageRow.active_orders}</strong></div>
                      <div><span>Late</span><strong>{stageRow.late_pairs}</strong></div>
                    </div>
                  </article>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>

      </div>

      <div hidden={activeWorkspace !== 'planning'}>
      <div className="production-story-grid">
        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Dispatch Queue</p>
              <h3>Recommended next jobs</h3>
            </div>
          </div>
          <div className="production-order-list">
            {dispatchQueue.map((item) => (
              <article key={item.order_id} className="production-order-card">
                <div className="production-order-head">
                  <strong>{item.production_order_no}</strong>
                  <span>Score {item.priority_score}</span>
                </div>
                <div className="production-chip-row">
                  <label className={`production-chip ${item.is_late ? 'critical' : item.is_redo ? 'high' : 'stable'}`}>
                    {item.is_late ? 'Late' : item.is_redo ? 'Redo' : 'Normal'}
                  </label>
                  <label className="production-chip neutral">{item.status}</label>
                </div>
                <p>{item.customer_name}</p>
                <div className="production-order-meta">
                  <span>Due {dateOnly(item.due_date) || '-'}</span>
                  <span>Age {item.age_days || 0} days</span>
                </div>
                <p className="production-note">{item.recommendation}</p>
                {isManager && (
                  <div className="actions-cell">
                    <button type="button" className="button-secondary" onClick={() => advanceOrder(item.order_id)}>
                      Advance
                    </button>
                    {(stageName === 'Cutting' || stageName === 'Closing') && (
                      <button type="button" className="button-secondary" onClick={() => moveBackOrder(item.order_id)}>
                        Move Back
                      </button>
                    )}
                    {stageName === 'Closing' && item.production_flow === 'MTO' && !item.mto_sole_done && (
                      <button type="button" className="button-secondary" onClick={() => markSoleComplete(item.order_id)}>
                        Mark Sole
                      </button>
                    )}
                    <button type="button" className="button-secondary" onClick={() => rejectOrder(item.barcode)}>
                      Reject
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>

        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Exception Queue</p>
              <h3>Orders needing managed resolution</h3>
            </div>
          </div>
          <div className="production-order-list">
            {exceptionQueue.map((row) => (
              <article key={`${row.order_id}-${row.exception_type}`} className="production-order-card">
                <div className="production-drilldown-head">
                  <div>
                    <strong>{row.production_order_no}</strong>
                    <p>{row.customer_name}</p>
                  </div>
                  <label className={`production-chip ${row.exception_type === 'Redo' || row.exception_type === 'SLA Breach' ? 'high' : 'critical'}`}>{row.exception_type}</label>
                </div>
                <div className="production-order-meta">
                  <span>Owner {row.owner}</span>
                  <span>Age {row.age_days || 0} days</span>
                  <span>Stage {Number(row.stage_age_hours || 0)} hrs</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      </div>

      <div hidden={activeWorkspace !== 'flow'}>
      <div className="production-panel">
        <div className="production-section-head">
          <div>
            <p className="production-section-kicker">Allocation Plan</p>
            <h3>Recommended lane/operator coverage</h3>
          </div>
        </div>
        <div className="production-drilldown-grid production-drilldown-grid-tight">
          {allocationPlan.map((row) => (
            <article key={row.lane_name} className="production-drilldown-card production-drilldown-card-compact">
              <div className="production-drilldown-head">
                <div>
                  <strong>{row.lane_name}</strong>
                  <p>Derived from current WIP mix</p>
                </div>
                <label className="production-chip neutral">{row.recommended_operators} operators</label>
              </div>
              <div className="production-drilldown-metrics">
                <div><span>WIP</span><strong>{row.wip_orders}</strong></div>
                <div><span>Coverage</span><strong>{row.recommended_operators}</strong></div>
              </div>
              <p className="production-note">{row.action}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="production-story-grid">
        <div className="production-panel">
          <div className="production-section-head">
            <div>
            <p className="production-section-kicker">Shift Board</p>
            <h3>Target vs actual by shift for {targetDate}</h3>
          </div>
        </div>
        <div className="chart-grid one-col production-chart-grid">
            <BarChartCard title="Completed By Shift" data={shiftAchievement} yLabel={`Completed on ${targetDate}`} format="number" />
        </div>
          <div className="production-drilldown-grid production-drilldown-grid-tight">
            {shiftBoard.map((row) => {
              const achieved = Number(row.completed_count || 0);
              const target = Number(row.target_completed || 0);
              const gap = achieved - target;
              return (
                <article key={row.shift_name} className="production-drilldown-card production-drilldown-card-compact">
                  <div className="production-drilldown-head">
                    <div>
                      <strong>{row.shift_name}</strong>
                      <p>{gap >= 0 ? 'Above target' : 'Below target'}</p>
                    </div>
                    <label className={`production-chip ${gap >= 0 ? 'stable' : 'high'}`}>{gap >= 0 ? `+${gap}` : gap}</label>
                  </div>
                  <div className="production-drilldown-metrics">
                    <div><span>Target</span><strong>{target}</strong></div>
                    <div><span>Completed</span><strong>{achieved}</strong></div>
                    <div><span>Holds</span><strong>{row.hold_count}</strong></div>
                    <div><span>Moved Back</span><strong>{row.move_back_count}</strong></div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Operator Detail</p>
              <h3>Who is driving stage activity</h3>
            </div>
          </div>
          <div className="production-drilldown-grid production-drilldown-grid-tight">
            {operators.map((row) => (
              <article key={row.operator_name} className="production-drilldown-card production-drilldown-card-compact">
                <div className="production-drilldown-head">
                  <div>
                    <strong>{row.operator_name}</strong>
                    <p>Last 14 days</p>
                  </div>
                  <label className="production-chip neutral">{row.event_count} events</label>
                </div>
                <div className="production-drilldown-metrics">
                  <div><span>Completed</span><strong>{row.completed_count}</strong></div>
                  <div><span>Entered</span><strong>{row.entered_count}</strong></div>
                  <div><span>Holds</span><strong>{row.hold_count}</strong></div>
                  <div><span>Moved Back</span><strong>{row.move_back_count}</strong></div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="production-story-grid">
        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Variance Reasons</p>
              <h3>Explain missed targets for {targetDate}</h3>
            </div>
          </div>
          <div className="production-order-list">
            {missedTargetRows.map((row) => {
              const draft = varianceDrafts[row.shift_name] || {};
              const varianceGap = Number(row.target_completed || 0) - Number(row.completed_count || 0);
              return (
                <article key={row.shift_name} className="production-order-card">
                  <div className="production-order-head">
                    <strong>{row.shift_name}</strong>
                    <span>Gap {varianceGap}</span>
                  </div>
                  <div className="production-drilldown-metrics">
                    <div><span>Target</span><strong>{row.target_completed}</strong></div>
                    <div><span>Actual</span><strong>{row.completed_count}</strong></div>
                  </div>
                  <label className="production-filter production-filter-block">
                    <span>Reason</span>
                    <select
                      value={draft.reasonCode || ''}
                      onChange={(e) => setVarianceDrafts((prev) => ({
                        ...prev,
                        [row.shift_name]: { ...prev[row.shift_name], reasonCode: e.target.value },
                      }))}
                      disabled={!isManager}
                    >
                      <option value="">Select reason</option>
                      <option value="LOW_STAFFING">Low staffing</option>
                      <option value="MATERIAL_DELAY">Material delay</option>
                      <option value="QUALITY_REWORK">Quality rework</option>
                      <option value="UPSTREAM_DELAY">Upstream delay</option>
                      <option value="MACHINE_DOWNTIME">Machine downtime</option>
                      <option value="PLAN_CHANGE">Plan change</option>
                      <option value="SKILL_BOTTLENECK">Skill bottleneck</option>
                    </select>
                  </label>
                  <label className="production-filter production-filter-block">
                    <span>Notes</span>
                    <textarea
                      rows="3"
                      value={draft.notes || ''}
                      onChange={(e) => setVarianceDrafts((prev) => ({
                        ...prev,
                        [row.shift_name]: { ...prev[row.shift_name], notes: e.target.value },
                      }))}
                      disabled={!isManager}
                    />
                  </label>
                  {draft.actorName ? (
                    <p className="production-note">Saved by {draft.actorName} on {dateOnly(draft.updatedAt)}.</p>
                  ) : null}
                  {isManager && (
                    <button type="button" className="button-secondary" onClick={() => saveVarianceReason(row.shift_name)}>
                      Save Reason
                    </button>
                  )}
                </article>
              );
            })}
            {missedTargetRows.length === 0 && (
              <article className="production-order-card">
                <strong>No missed shifts</strong>
                <p className="production-note">This date currently has no target miss that needs a variance explanation.</p>
              </article>
            )}
          </div>
        </div>

        <div className="production-panel">
          <div className="production-section-head">
            <div>
              <p className="production-section-kicker">Target History</p>
              <h3>Recent target changes</h3>
            </div>
          </div>
          <div className="production-order-list">
            {targetHistory.map((row, index) => (
              <article key={`${row.target_date}-${row.shift_name}-${row.changed_at}-${index}`} className="production-order-card">
                <div className="production-order-head">
                  <strong>{row.shift_name}</strong>
                  <span>{dateOnly(row.target_date)}</span>
                </div>
                <div className="production-drilldown-metrics">
                  <div><span>Before</span><strong>{row.previous_target_pairs ?? '-'}</strong></div>
                  <div><span>After</span><strong>{row.new_target_pairs}</strong></div>
                </div>
                <p className="production-note">Changed by {row.actor_name} on {dateOnly(row.changed_at)} {String(row.changed_at).slice(11, 16)}.</p>
              </article>
            ))}
            {targetHistory.length === 0 && (
              <article className="production-order-card">
                <strong>No target changes yet</strong>
                <p className="production-note">Target history will appear here after managers start revising plan values.</p>
              </article>
            )}
          </div>
        </div>
      </div>
      </div>

      <div hidden={activeWorkspace !== 'roster'}>
      <div className="production-panel">
        <div className="production-section-head">
          <div>
            <p className="production-section-kicker">Order Roster</p>
            <h3>Every order currently in {stageName}</h3>
          </div>
          <button
            type="button"
            className="button-secondary metric-export-btn"
            onClick={() => exportStageCsv(stageName, currentItems)}
          >
            Export CSV
          </button>
        </div>
        <div className="production-drilldown-grid">
          {currentItems.map((item) => (
            <article key={item.order_id} className="production-drilldown-card">
              <div className="production-drilldown-head">
                <div>
                  <strong>{item.production_order_no}</strong>
                  <p>{item.customer_name}</p>
                </div>
                <div className="production-chip-row">
                  <label className={`production-chip ${item.is_late ? 'critical' : item.is_redo ? 'high' : 'stable'}`}>
                    {item.is_late ? 'Late' : item.is_redo ? 'Redo' : 'Normal'}
                  </label>
                </div>
              </div>
              <div className="production-drilldown-metrics">
                <div><span>Flow</span><strong>{item.production_flow}</strong></div>
                <div><span>Status</span><strong>{item.status}</strong></div>
                <div><span>Due</span><strong>{dateOnly(item.due_date) || '-'}</strong></div>
                <div><span>Age</span><strong>{item.age_days || 0} days</strong></div>
                <div><span>Due In</span><strong>{Number(item.due_in_days || 0)} days</strong></div>
                <div><span>Barcode</span><strong>{item.barcode || '-'}</strong></div>
              </div>
            </article>
          ))}
          {currentItems.length === 0 && (
            <article className="production-drilldown-card">
              <strong>No active orders</strong>
              <p className="production-note">This stage currently has no orders assigned.</p>
            </article>
          )}
        </div>
      </div>

      <div className="production-panel">
        <div className="production-section-head">
          <div>
            <p className="production-section-kicker">Action Audit</p>
            <h3>Recent stage activity trail</h3>
          </div>
        </div>
        <div className="production-order-list">
          {actionAudit.map((row, index) => (
            <article key={`${row.production_order_no}-${row.scanned_at}-${index}`} className="production-order-card">
              <div className="production-order-head">
                <strong>{row.production_order_no}</strong>
                <span>{row.status}</span>
              </div>
              <div className="production-chip-row">
                <label className="production-chip neutral">{row.actor_name}</label>
                <label className="production-chip neutral">{dateOnly(row.scanned_at)} {String(row.scanned_at).slice(11, 16)}</label>
              </div>
              <p>{row.notes}</p>
            </article>
          ))}
        </div>
      </div>
      </div>
    </section>
  );
}
