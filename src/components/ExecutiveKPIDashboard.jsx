import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { BarChartCard, DonutChartCard, LineChartCard } from './ReportingCharts';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toInt(v) {
  return Number(v || 0);
}

function toMoney(v) {
  return Number(v || 0).toFixed(0);
}

export default function ExecutiveKPIDashboard({ refreshSignal = 0 }) {
  const [date, setDate] = useState(todayIso());
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    retailSummary: {},
    retailOrders: [],
    salesSummary: {},
    salesOrders: [],
    productionSummary: {},
    productionBoard: {},
  });

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const [retailRes, salesRes, productionRes, boardRes] = await Promise.allSettled([
        api.get('/orders/retail-dashboard'),
        api.get(`/orders/sales-report?dateFrom=${date}&dateTo=${date}`),
        api.get('/production/flow-summary'),
        api.get('/production/board'),
      ]);

      if (!active) return;
      setData({
        retailSummary: retailRes.status === 'fulfilled' ? (retailRes.value.data.summary || {}) : {},
        retailOrders: retailRes.status === 'fulfilled' ? (retailRes.value.data.orders || []) : [],
        salesSummary: salesRes.status === 'fulfilled' ? (salesRes.value.data.summary || {}) : {},
        salesOrders: salesRes.status === 'fulfilled' ? (salesRes.value.data.orders || []) : [],
        productionSummary: productionRes.status === 'fulfilled' ? (productionRes.value.data || {}) : {},
        productionBoard: boardRes.status === 'fulfilled' ? (boardRes.value.data.board || {}) : {},
      });
      setLoading(false);
    }
    load().catch(() => setLoading(false));
    return () => { active = false; };
  }, [date, refreshSignal]);

  const statusMix = useMemo(() => {
    const counters = {};
    (data.retailOrders || []).forEach((order) => {
      const key = order.status || 'UNKNOWN';
      counters[key] = (counters[key] || 0) + 1;
    });
    return Object.keys(counters).map((key) => ({ label: key, value: counters[key] }));
  }, [data.retailOrders]);

  const stageMix = useMemo(() => {
    const entries = Object.entries(data.productionBoard || {});
    return entries
      .map(([stage, items]) => ({ label: stage, value: (items || []).length }))
      .filter((x) => x.value > 0)
      .slice(0, 8);
  }, [data.productionBoard]);

  const outletSales = useMemo(() => {
    const counters = {};
    (data.salesOrders || []).forEach((order) => {
      const key = order.ordered_from || 'Unknown';
      counters[key] = (counters[key] || 0) + Number(order.product_price || 0);
    });
    return Object.entries(counters)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [data.salesOrders]);

  const dailyTrend = useMemo(() => {
    const counter = {};
    (data.salesOrders || []).forEach((order) => {
      const d = String(order.order_date || '').slice(0, 10);
      if (!d) return;
      counter[d] = (counter[d] || 0) + Number(order.product_price || 0);
    });
    return Object.entries(counter)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, value]) => ({ label: label.slice(5), value }));
  }, [data.salesOrders]);

  const completionRate = useMemo(() => {
    const total = toInt(data.retailSummary.total_orders);
    const completed = toInt(data.retailSummary.completed);
    if (!total) return 0;
    return ((completed / total) * 100).toFixed(1);
  }, [data.retailSummary]);

  const lateRate = useMemo(() => {
    const total = toInt(data.retailSummary.total_orders);
    const late = toInt(data.retailSummary.late_orders);
    if (!total) return 0;
    return ((late / total) * 100).toFixed(1);
  }, [data.retailSummary]);

  function openPage(page) {
    window.open(`${window.location.origin}?page=${page}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="module-page executive-kpi-page">
      <div className="executive-kpi-hero">
        <div>
          <p className="executive-kpi-kicker">Executive Command Center</p>
          <h2>Enterprise KPI Dashboard</h2>
          <p className="executive-kpi-subtitle">
            Real-time snapshot across Retail, Production, and Sales with direct drill-through to action pages.
          </p>
        </div>
        <div className="executive-kpi-hero-actions">
          <label className="crm-field">
            <span>Sales Snapshot Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className="actions-cell">
            <button type="button" className="button-secondary" onClick={() => openPage('retail-head')}>Retail Analytics</button>
            <button type="button" className="button-secondary" onClick={() => openPage('production-overview')}>Production Analytics</button>
            <button type="button" className="button-secondary" onClick={() => openPage('sales-report')}>Sales Analytics</button>
          </div>
        </div>
      </div>

      <div className="executive-kpi-grid">
        <article className="executive-kpi-card">
          <span>Total Orders</span>
          <strong>{toInt(data.retailSummary.total_orders)}</strong>
          <p>Completion Rate: {completionRate}%</p>
          <button type="button" className="button-secondary" onClick={() => openPage('retail-head')}>Open Retail</button>
        </article>
        <article className="executive-kpi-card">
          <span>Pending In Production</span>
          <strong>{toInt(data.retailSummary.pending_in_production)}</strong>
          <p>WIP Pressure: {toInt(data.productionSummary.wip_orders)}</p>
          <button type="button" className="button-secondary" onClick={() => openPage('production-overview')}>Open Production</button>
        </article>
        <article className="executive-kpi-card executive-kpi-card-alert">
          <span>Late Orders</span>
          <strong>{toInt(data.retailSummary.late_orders)}</strong>
          <p>Late Rate: {lateRate}%</p>
          <button type="button" className="button-secondary" onClick={() => openPage('store-delivery')}>Open Delivery</button>
        </article>
        <article className="executive-kpi-card">
          <span>Sales (Day)</span>
          <strong>{toMoney(data.salesSummary.total_sales)}</strong>
          <p>Orders: {toInt(data.salesSummary.total_orders)}</p>
          <button type="button" className="button-secondary" onClick={() => openPage('sales-report')}>Open Sales</button>
        </article>
        <article className="executive-kpi-card">
          <span>AOV (Day)</span>
          <strong>{toMoney(data.salesSummary.average_order_value)}</strong>
          <p>Advance: {toMoney(data.salesSummary.total_advance)}</p>
          <button type="button" className="button-secondary" onClick={() => openPage('finance')}>Open Finance</button>
        </article>
        <article className="executive-kpi-card">
          <span>WIP</span>
          <strong>{toInt(data.productionSummary.wip_orders)}</strong>
          <p>Urgent: {toInt(data.productionSummary.urgent_orders)}</p>
          <button type="button" className="button-secondary" onClick={() => openPage('production-performance')}>Performance</button>
        </article>
      </div>

      {loading ? (
        <div className="card executive-kpi-loading"><p>Loading KPI charts...</p></div>
      ) : (
        <>
          <div className="executive-kpi-section-head">
            <h3>Operational Mix</h3>
            <p>Understand where demand sits and where execution load is concentrated.</p>
          </div>
          <div className="chart-grid two-col executive-kpi-chart-grid">
            <DonutChartCard title="Retail Status Mix" data={statusMix} totalLabel="Orders" />
            <DonutChartCard title="Production Stage Load" data={stageMix} totalLabel="Orders" />
          </div>
          <div className="executive-kpi-section-head">
            <h3>Revenue View</h3>
            <p>Outlet contribution and trend line for executive decision-making.</p>
          </div>
          <div className="chart-grid two-col executive-kpi-chart-grid">
            <BarChartCard title="Top Outlet Sales" data={outletSales} yLabel="Sales value" format="currency" />
            <LineChartCard title="Sales Trend (Selected Date Set)" points={dailyTrend} format="currency" />
          </div>
        </>
      )}
    </section>
  );
}
