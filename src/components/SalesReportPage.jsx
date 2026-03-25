import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { BarChartCard, DonutChartCard, LineChartCard } from './ReportingCharts';

function money(value) {
  return Number(value || 0).toFixed(2);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function SalesReportPage({ refreshSignal = 0 }) {
  const [filters, setFilters] = useState({
    from: todayIso(),
    to: todayIso(),
  });
  const [data, setData] = useState({
    summary: {},
    orders: [],
    scoped_outlet: null,
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.from) params.set('dateFrom', filters.from);
    if (filters.to) params.set('dateTo', filters.to);
    return params.toString();
  }, [filters]);

  const chartData = useMemo(() => {
    const orders = data.orders || [];
    const statusMap = new Map();
    const outletSalesMap = new Map();
    const daySalesMap = new Map();

    orders.forEach((order) => {
      const status = order.status || 'UNKNOWN';
      statusMap.set(status, (statusMap.get(status) || 0) + 1);

      const outlet = order.ordered_from || 'Unknown Outlet';
      const value = Number(order.product_price || 0);
      outletSalesMap.set(outlet, (outletSalesMap.get(outlet) || 0) + value);

      const day = String(order.order_date || '').slice(0, 10) || 'N/A';
      daySalesMap.set(day, (daySalesMap.get(day) || 0) + value);
    });

    const statusBreakdown = Array.from(statusMap.entries()).map(([label, value]) => ({ label, value }));
    const outletSales = Array.from(outletSalesMap.entries())
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    const dailyTrend = Array.from(daySalesMap.entries())
      .sort((a, b) => (a[0] > b[0] ? 1 : -1))
      .map(([label, value]) => ({ label: label.slice(5), value }));

    return { statusBreakdown, outletSales, dailyTrend };
  }, [data.orders]);

  useEffect(() => {
    api.get(`/orders/sales-report?${query}`).then(({ data: payload }) => {
      setData(payload || { summary: {}, orders: [], scoped_outlet: null });
    });
  }, [query, refreshSignal]);

  return (
    <section>
      <h2>Sale Report</h2>
      {data.scoped_outlet && <p>Outlet Scope: {data.scoped_outlet}</p>}

      <div className="card filter-grid">
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
        />
      </div>

      <div className="chart-grid two-col">
        <DonutChartCard title="Order Status Mix" data={chartData.statusBreakdown} totalLabel="Orders" />
        <BarChartCard title="Top Outlet Sales" data={chartData.outletSales} yLabel="Sales by outlet" format="currency" />
      </div>

      <div className="chart-grid one-col">
        <LineChartCard title="Daily Sales Trend" points={chartData.dailyTrend} format="currency" />
      </div>

      <div className="summary-grid">
        <article className="card"><h4>Total Orders</h4><p className="metric">{data.summary.total_orders || 0}</p></article>
        <article className="card"><h4>Total Sales</h4><p className="metric">{money(data.summary.total_sales)}</p></article>
        <article className="card"><h4>Average Order Value</h4><p className="metric">{money(data.summary.average_order_value)}</p></article>
        <article className="card"><h4>Total Advance</h4><p className="metric">{money(data.summary.total_advance)}</p></article>
        <article className="card"><h4>Balance</h4><p className="metric">{money(data.summary.total_balance)}</p></article>
        <article className="card"><h4>Completed</h4><p className="metric">{data.summary.completed_orders || 0}</p></article>
        <article className="card"><h4>Pending</h4><p className="metric">{data.summary.pending_orders || 0}</p></article>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Order No</th>
              <th>Customer</th>
              <th>Outlet</th>
              <th>Order Date</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Price</th>
              <th>Advance</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {(data.orders || []).map((row) => (
              <tr key={row.id}>
                <td>{row.production_order_no}</td>
                <td>{row.customer_name}</td>
                <td>{row.ordered_from}</td>
                <td>{String(row.order_date || '').slice(0, 10)}</td>
                <td>{String(row.due_date || '').slice(0, 10)}</td>
                <td>{row.status}</td>
                <td>{money(row.product_price)}</td>
                <td>{money(row.advance_paid)}</td>
                <td>{money(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
