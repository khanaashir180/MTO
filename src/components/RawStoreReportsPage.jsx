import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { BarChartCard, DonutChartCard } from './ReportingCharts';

function money(v) {
  return Number(v || 0).toFixed(2);
}

function dateOnly(v) {
  if (!v) return '';
  return String(v).slice(0, 10);
}

export default function RawStoreReportsPage({ refreshSignal }) {
  const [message, setMessage] = useState('');
  const [warehouses, setWarehouses] = useState([]);
  const [filters, setFilters] = useState(() => {
    const to = new Date().toISOString().slice(0, 10);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    return { warehouseId: '', from: fromDate.toISOString().slice(0, 10), to };
  });
  const [aging, setAging] = useState({ summary: [], rows: [] });
  const [minMax, setMinMax] = useState({ rows: [] });
  const [movement, setMovement] = useState({ from: '', to: '', rows: [] });

  const loadReports = useCallback(async () => {
    const warehouseQuery = filters.warehouseId ? `warehouseId=${filters.warehouseId}` : '';
    const [whRes, agingRes, minMaxRes, movementRes] = await Promise.all([
      api.get('/raw-store/warehouses'),
      api.get(`/raw-store/reports/aging${warehouseQuery ? `?${warehouseQuery}` : ''}`),
      api.get(`/raw-store/reports/min-max${warehouseQuery ? `?${warehouseQuery}` : ''}`),
      api.get(`/raw-store/reports/movement?from=${filters.from}&to=${filters.to}`),
    ]);
    setWarehouses(whRes.data?.warehouses || []);
    setAging(agingRes.data || { summary: [], rows: [] });
    setMinMax(minMaxRes.data || { rows: [] });
    setMovement(movementRes.data || { from: filters.from, to: filters.to, rows: [] });
  }, [filters.warehouseId, filters.from, filters.to]);

  useEffect(() => {
    loadReports().catch((error) => {
      setMessage(error.response?.data?.message || 'Unable to load reports');
    });
  }, [loadReports, refreshSignal]);

  const agingDonut = useMemo(
    () => (aging.summary || []).map((s) => ({ label: s.bucket, value: Number(s.sku_count || 0) })),
    [aging.summary]
  );
  const movementBars = useMemo(() => {
    const grouped = (movement.rows || []).reduce((acc, row) => {
      const key = `${dateOnly(row.txn_date)} ${row.txn_type}`;
      acc[key] = (acc[key] || 0) + Number(row.qty_total || 0);
      return acc;
    }, {});
    return Object.keys(grouped).slice(0, 20).map((k) => ({ label: k, value: grouped[k] }));
  }, [movement.rows]);

  function exportCsv(name, headers, rows) {
    const body = [headers.join(','), ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section>
      <h2>Raw Store Reports</h2>
      {message && <p className="form-hint">{message}</p>}
      <div className="card toolbar-row">
        <label>Warehouse<select value={filters.warehouseId} onChange={(e) => setFilters((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">All</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
        <label>From<input type="date" value={filters.from} onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))} /></label>
        <label>To<input type="date" value={filters.to} onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))} /></label>
        <button type="button" onClick={() => loadReports().catch(() => {})}>Apply</button>
      </div>

      <div className="summary-grid">
        <DonutChartCard title="Inventory Aging SKU Mix" data={agingDonut} totalLabel="SKU" />
        <BarChartCard title="Movement Trend (Qty)" data={movementBars} yLabel="Qty" format="number" />
      </div>

      <article className="card">
        <div className="metric-card-head">
          <h3>Aging Detail</h3>
          <button type="button" className="button-secondary" onClick={() => exportCsv('raw-store-aging.csv', ['SKU', 'Item', 'Warehouse', 'Qty', 'Last Txn', 'Bucket'], (aging.rows || []).map((r) => [r.sku, r.item_name, r.warehouse_name, money(r.qty_on_hand), dateOnly(r.last_txn_at), r.aging_bucket]))}>Export CSV</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>SKU</th><th>Item</th><th>Warehouse</th><th>Qty</th><th>Last Txn</th><th>Bucket</th></tr></thead><tbody>{(aging.rows || []).length === 0 ? <tr><td colSpan={6}>No data.</td></tr> : aging.rows.slice(0, 200).map((r, idx) => <tr key={`${r.item_id}-${idx}`}><td>{r.sku}</td><td>{r.item_name}</td><td>{r.warehouse_name}</td><td>{money(r.qty_on_hand)}</td><td>{dateOnly(r.last_txn_at)}</td><td>{r.aging_bucket}</td></tr>)}</tbody></table>
        </div>
      </article>

      <article className="card">
        <div className="metric-card-head">
          <h3>Min/Max Exception Report</h3>
          <button type="button" className="button-secondary" onClick={() => exportCsv('raw-store-min-max.csv', ['SKU', 'Warehouse', 'On Hand', 'Min', 'Max', 'State'], (minMax.rows || []).map((r) => [r.sku, r.warehouse_name, money(r.on_hand_qty), money(r.min_qty), money(r.max_qty), r.state]))}>Export CSV</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>SKU</th><th>Warehouse</th><th>On Hand</th><th>Min</th><th>Max</th><th>State</th></tr></thead><tbody>{(minMax.rows || []).length === 0 ? <tr><td colSpan={6}>No data.</td></tr> : minMax.rows.slice(0, 200).map((r) => <tr key={r.id}><td>{r.sku}</td><td>{r.warehouse_name}</td><td>{money(r.on_hand_qty)}</td><td>{money(r.min_qty)}</td><td>{money(r.max_qty)}</td><td>{r.state}</td></tr>)}</tbody></table>
        </div>
      </article>

      <article className="card">
        <div className="metric-card-head">
          <h3>Movement Summary</h3>
          <button type="button" className="button-secondary" onClick={() => exportCsv('raw-store-movement.csv', ['Date', 'Type', 'Direction', 'Txn Count', 'Qty'], (movement.rows || []).map((r) => [dateOnly(r.txn_date), r.txn_type, r.direction, r.txn_count, money(r.qty_total)]))}>Export CSV</button>
        </div>
        <div className="table-wrap">
          <table><thead><tr><th>Date</th><th>Type</th><th>Direction</th><th>Txn Count</th><th>Qty</th></tr></thead><tbody>{(movement.rows || []).length === 0 ? <tr><td colSpan={5}>No data.</td></tr> : movement.rows.slice(0, 300).map((r, idx) => <tr key={`${idx}-${r.txn_type}`}><td>{dateOnly(r.txn_date)}</td><td>{r.txn_type}</td><td>{r.direction}</td><td>{r.txn_count}</td><td>{money(r.qty_total)}</td></tr>)}</tbody></table>
        </div>
      </article>
    </section>
  );
}
