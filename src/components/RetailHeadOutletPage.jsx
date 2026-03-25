import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { BarChartCard, DonutChartCard, LineChartCard } from './ReportingCharts';

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : '';
}

function buildRecentTrend(orders) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - index));
    const label = day.toISOString().slice(5, 10);
    const iso = day.toISOString().slice(0, 10);
    return {
      label,
      value: orders.filter((order) => dateOnly(order.order_date) === iso).length,
    };
  });
  return days;
}

function buildOverdueTrend(orders) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - index));
    const iso = day.toISOString().slice(0, 10);
    return {
      label: iso.slice(5, 10),
      value: orders.filter((order) => dateOnly(order.due_date) === iso && order.status !== 'SHIPPED').length,
    };
  });
}

function buildPickupTrend(orders) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - index));
    const iso = day.toISOString().slice(0, 10);
    return {
      label: iso.slice(5, 10),
      value: orders.filter((order) => order.status === 'COMPLETED' && dateOnly(order.completed_at) === iso).length,
    };
  });
}

function exportOutletCsv(outletName, orders) {
  const header = ['Order Number', 'Customer', 'Status', 'Current Stage', 'Order Date', 'Due Date'].join(',');
  const rows = orders.map((order) => ([
    order.production_order_no || '',
    `"${String(order.customer_name || '').replace(/"/g, '""')}"`,
    order.status || '',
    `"${String(order.current_stage || '').replace(/"/g, '""')}"`,
    dateOnly(order.order_date),
    dateOnly(order.due_date),
  ].join(',')));
  const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${String(outletName || 'outlet').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-retail-head.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function ageBucketLabel(order, today) {
  const baseDate = dateOnly(order.due_date) || dateOnly(order.order_date);
  if (!baseDate) return 'Unknown';
  const ageDays = Math.max(0, Math.round((new Date(today) - new Date(baseDate)) / 86400000));
  if (ageDays <= 3) return '0-3 days';
  if (ageDays <= 7) return '4-7 days';
  if (ageDays <= 14) return '8-14 days';
  return '15+ days';
}

function buildOutletReplacementChains(cases) {
  const grouped = cases.reduce((acc, item) => {
    const key = Number(item.original_order_id || item.order_id || item.id);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
  return Object.values(grouped).map((items) => {
    const sorted = [...items].sort((a, b) => Number(a.replacement_sequence || 1) - Number(b.replacement_sequence || 1));
    const latest = sorted[sorted.length - 1] || {};
    return {
      originalOrderNo: latest.production_order_no,
      customerName: latest.customer_name,
      chainLength: sorted.length,
      maxSequence: Math.max(...sorted.map((row) => Number(row.replacement_sequence || 1))),
      totalCost: sorted.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0),
      latestStatus: latest.workflow_status || latest.status || 'OPEN',
      latestReason: latest.reason_code || 'UNKNOWN',
    };
  }).sort((a, b) => b.maxSequence - a.maxSequence || b.totalCost - a.totalCost);
}

export default function RetailHeadOutletPage({ outletName }) {
  const [data, setData] = useState({ orders: [], summary: {} });
  const [recoveryData, setRecoveryData] = useState({ cases: [] });

  useEffect(() => {
    if (!outletName) return;
    api.get(`/orders/retail-dashboard?outlet=${encodeURIComponent(outletName)}`).then(({ data: payload }) => setData(payload));
    api.get('/orders/retail-head/replacement-dashboard').then(({ data: payload }) => setRecoveryData(payload || { cases: [] })).catch(() => {});
  }, [outletName]);

  const orders = useMemo(() => data.orders || [], [data.orders]);
  const recoveryCases = useMemo(
    () => (recoveryData.cases || []).filter((item) => item.ordered_from === outletName),
    [recoveryData.cases, outletName]
  );
  const today = new Date().toISOString().slice(0, 10);
  const lateOrders = orders.filter((order) => order.is_late);
  const dueToday = orders.filter((order) => dateOnly(order.due_date) === today);
  const readyOrders = orders.filter((order) => ['COMPLETED', 'SHIPPED'].includes(order.status));
  const pickupBacklog = orders.filter((order) => order.status === 'COMPLETED');
  const trendPoints = useMemo(() => buildRecentTrend(orders), [orders]);
  const overdueTrend = useMemo(() => buildOverdueTrend(orders), [orders]);
  const pickupTrend = useMemo(() => buildPickupTrend(orders), [orders]);
  const statusMix = useMemo(() => (
    ['PENDING', 'IN_PRODUCTION', 'COMPLETED', 'SHIPPED', 'REJECTED'].map((status) => ({
      label: status.replace('_', ' '),
      value: orders.filter((order) => order.status === status).length,
    }))
  ), [orders]);
  const stageMix = useMemo(() => {
    const grouped = orders.reduce((acc, order) => {
      const key = order.current_stage || 'Completed / Not Assigned';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [orders]);
  const riskRows = useMemo(() => (
    orders
      .filter((order) => order.is_late || dateOnly(order.due_date) === today)
      .sort((a, b) => {
        if (a.is_late !== b.is_late) return a.is_late ? -1 : 1;
        return new Date(a.due_date || 0) - new Date(b.due_date || 0);
      })
      .slice(0, 8)
  ), [orders, today]);
  const ageingMix = useMemo(() => {
    const grouped = orders.reduce((acc, order) => {
      const key = ageBucketLabel(order, today);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return ['0-3 days', '4-7 days', '8-14 days', '15+ days', 'Unknown']
      .filter((label) => grouped[label])
      .map((label) => ({ label, value: grouped[label] }));
  }, [orders, today]);
  const pickupBacklogMix = useMemo(() => {
    const grouped = pickupBacklog.reduce((acc, order) => {
      const key = ageBucketLabel(order, today);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return ['0-3 days', '4-7 days', '8-14 days', '15+ days', 'Unknown']
      .filter((label) => grouped[label])
      .map((label) => ({ label, value: grouped[label] }));
  }, [pickupBacklog, today]);
  const recoveryReasonMix = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = item.reason_code || 'UNKNOWN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [recoveryCases]);
  const recoveryPipeline = useMemo(() => {
    const grouped = recoveryCases.reduce((acc, item) => {
      const key = item.workflow_status || 'OPEN';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value }));
  }, [recoveryCases]);
  const recoveryTurnaround = useMemo(() => {
    const closed = recoveryCases.filter((item) => item.resolved_at);
    if (!closed.length) return [];
    return closed.slice(0, 7).map((item) => ({
      label: item.production_order_no,
      value: Math.max(0, Math.round((new Date(item.resolved_at) - new Date(item.created_at)) / 86400000)),
    }));
  }, [recoveryCases]);
  const replacementChains = useMemo(() => buildOutletReplacementChains(recoveryCases), [recoveryCases]);
  const repeatChains = useMemo(() => replacementChains.filter((row) => row.chainLength >= 2), [replacementChains]);
  const thirdReplacementQueue = useMemo(() => replacementChains.filter((row) => row.maxSequence >= 3), [replacementChains]);
  const replacement2Queue = useMemo(() => replacementChains.filter((row) => row.maxSequence === 2), [replacementChains]);
  const repeatChainLengthMix = useMemo(() => {
    const grouped = repeatChains.reduce((acc, row) => {
      const key = `${row.chainLength} cases`;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value }));
  }, [repeatChains]);
  const repeatChainReasonMix = useMemo(() => {
    const grouped = repeatChains.reduce((acc, row) => {
      acc[row.latestReason || 'UNKNOWN'] = (acc[row.latestReason || 'UNKNOWN'] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(grouped).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [repeatChains]);
  const repeatChainCost = useMemo(() => repeatChains.reduce((sum, row) => sum + row.totalCost, 0), [repeatChains]);

  return (
    <section className="module-page retail-outlet-page">
      <div className="module-hero retail-hero">
        <div>
          <p className="module-kicker">Outlet Drilldown</p>
          <h2>{outletName || 'Outlet'}</h2>
          <p className="module-subtitle">
            Outlet-level visibility for promise risk, readiness, order distribution, and latest operating pressure.
          </p>
        </div>
        <div className="retail-hero-actions">
          <button type="button" className="button-secondary" onClick={() => exportOutletCsv(outletName, orders)}>
            Export Outlet CSV
          </button>
        </div>
      </div>

      <div className="retail-kpi-grid">
        <article className="retail-kpi-card">
          <span>Total Orders</span>
          <strong>{data.summary?.total_orders || 0}</strong>
          <p>Orders visible in this outlet scope.</p>
        </article>
        <article className="retail-kpi-card">
          <span>Late Orders</span>
          <strong>{lateOrders.length}</strong>
          <p>Customer commitments already overdue.</p>
        </article>
        <article className="retail-kpi-card">
          <span>Due Today</span>
          <strong>{dueToday.length}</strong>
          <p>Orders promised for today.</p>
        </article>
        <article className="retail-kpi-card">
          <span>Ready</span>
          <strong>{readyOrders.length}</strong>
          <p>Orders ready for store release or handover.</p>
        </article>
        <article className="retail-kpi-card">
          <span>Pickup Backlog</span>
          <strong>{pickupBacklog.length}</strong>
          <p>Completed orders still waiting in the outlet.</p>
        </article>
        <article className="retail-kpi-card">
          <span>Replacement Cases</span>
          <strong>{recoveryCases.length}</strong>
          <p>Recorded replacement / repair cases for this outlet.</p>
        </article>
        <article className="retail-kpi-card">
          <span>Repeat Chains</span>
          <strong>{repeatChains.length}</strong>
          <p>Booked orders that required replacement 2 or more.</p>
        </article>
        <article className="retail-kpi-card">
          <span>Replacement 3+</span>
          <strong>{thirdReplacementQueue.length}</strong>
          <p>Orders that escalated to third replacement or beyond.</p>
        </article>
        <article className="retail-kpi-card">
          <span>Replacement 2</span>
          <strong>{replacement2Queue.length}</strong>
          <p>Orders currently sitting at second replacement.</p>
        </article>
        <article className="retail-kpi-card">
          <span>Repeat Chain Cost</span>
          <strong>{repeatChainCost.toFixed(2)}</strong>
          <p>Total cost exposure from repeat replacement chains.</p>
        </article>
      </div>

      <div className="chart-grid two-col production-chart-grid">
        <LineChartCard title="7-Day Booking Trend" points={trendPoints} format="number" />
        <DonutChartCard title="Order Status Mix" data={statusMix} totalLabel="Orders" />
      </div>

      <div className="chart-grid two-col production-chart-grid">
        <LineChartCard title="Promise-Date Breach Trend" points={overdueTrend} format="number" />
        <LineChartCard title="Completed Not Collected Trend" points={pickupTrend} format="number" />
      </div>

      <div className="chart-grid two-col production-chart-grid">
        <BarChartCard title="Orders By Current Stage" data={stageMix.map((row) => ({ label: row.label, value: row.value }))} yLabel="Orders" format="number" />
        <DonutChartCard title="Outlet Ageing Mix" data={ageingMix} totalLabel="Orders" />
      </div>

      <div className="chart-grid two-col production-chart-grid">
        <BarChartCard title="Pickup Backlog Ageing" data={pickupBacklogMix.map((row) => ({ label: row.label, value: row.value }))} yLabel="Completed orders waiting" format="number" />
        <div className="retail-panel">
          <div className="retail-panel-head">
            <div>
              <p className="retail-panel-kicker">Outlet Risk Watchlist</p>
              <h3>Orders demanding head-office attention</h3>
            </div>
          </div>
          <div className="retail-queue-list">
            {riskRows.map((order) => (
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
                  <span>{order.current_stage || 'Awaiting assignment'}</span>
                  <span>{dateOnly(order.due_date) || '-'}</span>
                  <span>{order.status}</span>
                </div>
              </article>
            ))}
            {riskRows.length === 0 && (
              <article className="retail-queue-card retail-queue-card-empty">
                <strong>No critical outlet risks</strong>
                <p>Late and due-today orders will appear here automatically.</p>
              </article>
            )}
          </div>
        </div>
      </div>

      <div className="chart-grid two-col production-chart-grid">
        <BarChartCard title="Replacement Reasons" data={recoveryReasonMix.map((row) => ({ label: row.label, value: row.value }))} yLabel="Cases" format="number" />
        <DonutChartCard title="Replacement Pipeline" data={recoveryPipeline} totalLabel="Cases" />
      </div>

      <div className="chart-grid two-col production-chart-grid">
        <BarChartCard title="Replacement Turnaround By Case" data={recoveryTurnaround} yLabel="Days" format="number" />
        <div className="retail-panel">
          <div className="retail-panel-head">
            <div>
              <p className="retail-panel-kicker">Outlet Replacement Drilldown</p>
              <h3>Open replacement cases for this outlet</h3>
            </div>
          </div>
          <div className="retail-network-board">
            {recoveryCases.slice(0, 8).map((row) => (
              <article key={row.id} className="retail-network-card">
                <div className="retail-queue-head">
                  <div><strong>{row.production_order_no}</strong><p>{row.customer_name}</p></div>
                  <label className={`production-chip ${row.workflow_status === 'CLOSED' ? 'stable' : 'high'}`}>{row.workflow_status}</label>
                </div>
                <div className="retail-queue-meta">
                  <span>{row.reason_code}</span>
                  <span>{row.owner_name || 'Unassigned'}</span>
                  <span>{dateOnly(row.promised_resolution_date) || 'No promise date'}</span>
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
              <p className="retail-panel-kicker">Repeat Replacement Chains</p>
              <h3>Original orders with multiple replacements</h3>
            </div>
          </div>
          <div className="retail-network-board">
            {repeatChains.map((row) => (
              <article key={row.originalOrderNo} className="retail-network-card">
                <div className="retail-queue-head">
                  <div><strong>{row.originalOrderNo}</strong><p>{row.customerName}</p></div>
                  <label className={`production-chip ${row.maxSequence >= 3 ? 'critical' : 'high'}`}>Depth {row.maxSequence}</label>
                </div>
                <div className="retail-queue-meta">
                  <span>{row.latestStatus}</span>
                  <span>{row.latestReason}</span>
                  <span>{row.totalCost.toFixed(2)}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="retail-panel">
          <div className="retail-panel-head">
            <div>
              <p className="retail-panel-kicker">Replacement 3 Queue</p>
              <h3>Orders at third replacement or beyond</h3>
            </div>
          </div>
          <div className="retail-network-board">
            {thirdReplacementQueue.map((row) => (
              <article key={`third-${row.originalOrderNo}`} className="retail-network-card">
                <div className="retail-queue-head">
                  <div><strong>{row.originalOrderNo}</strong><p>{row.customerName}</p></div>
                  <label className="production-chip critical">Replacement {row.maxSequence}</label>
                </div>
                <div className="retail-queue-meta">
                  <span>{row.latestStatus}</span>
                  <span>{row.latestReason}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      <div className="chart-grid two-col production-chart-grid">
        <DonutChartCard title="Repeat Chain Length Mix" data={repeatChainLengthMix} totalLabel="Chains" />
        <BarChartCard title="Repeat Chain Reasons" data={repeatChainReasonMix} yLabel="Chains" format="number" />
      </div>

      <div className="retail-head-mini-grid">
        <div className="retail-panel">
          <div className="retail-panel-head">
            <div>
              <p className="retail-panel-kicker">Replacement 2 Queue</p>
              <h3>Outlet orders currently at second replacement</h3>
            </div>
          </div>
          <div className="retail-network-board">
            {replacement2Queue.map((row) => (
              <article key={`r2-${row.originalOrderNo}`} className="retail-network-card">
                <div className="retail-queue-head">
                  <div><strong>{row.originalOrderNo}</strong><p>{row.customerName}</p></div>
                  <label className="production-chip high">Replacement 2</label>
                </div>
                <div className="retail-queue-meta">
                  <span>{row.latestStatus}</span>
                  <span>{row.latestReason}</span>
                  <span>{row.totalCost.toFixed(2)}</span>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="retail-panel">
          <div className="retail-panel-head">
            <div>
              <p className="retail-panel-kicker">Deepest Repeat Chains</p>
              <h3>Orders with the worst repeat replacement depth</h3>
            </div>
          </div>
          <div className="retail-network-board">
            {repeatChains.slice(0, 8).map((row) => (
              <article key={`deep-${row.originalOrderNo}`} className="retail-network-card">
                <div className="retail-queue-head">
                  <div><strong>{row.originalOrderNo}</strong><p>{row.customerName}</p></div>
                  <label className={`production-chip ${row.maxSequence >= 3 ? 'critical' : 'high'}`}>Depth {row.maxSequence}</label>
                </div>
                <div className="retail-queue-meta">
                  <span>{row.latestStatus}</span>
                  <span>{row.latestReason}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

