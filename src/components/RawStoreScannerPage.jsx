import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

function money(v) {
  return Number(v || 0).toFixed(2);
}

export default function RawStoreScannerPage({ refreshSignal }) {
  const [message, setMessage] = useState('');
  const [queue, setQueue] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [filters, setFilters] = useState({ warehouseId: '' });
  const [scanForm, setScanForm] = useState({ waveLineId: '', barcode: '', qty: 1 });

  const loadQueue = useCallback(async () => {
    const query = filters.warehouseId ? `?warehouseId=${filters.warehouseId}` : '';
    const [queueRes, whRes] = await Promise.all([
      api.get(`/raw-store/scanner/queue${query}`),
      api.get('/raw-store/warehouses'),
    ]);
    setQueue(queueRes.data?.queue || []);
    setWarehouses(whRes.data?.warehouses || []);
  }, [filters.warehouseId]);

  useEffect(() => {
    loadQueue().catch((error) => setMessage(error.response?.data?.message || 'Unable to load scanner queue'));
  }, [loadQueue, refreshSignal]);

  const selectedLine = useMemo(
    () => queue.find((q) => Number(q.line_id) === Number(scanForm.waveLineId)),
    [queue, scanForm.waveLineId]
  );

  async function onScan(event) {
    event.preventDefault();
    try {
      await api.post('/raw-store/scanner/pick-scan', {
        waveLineId: Number(scanForm.waveLineId),
        barcode: scanForm.barcode,
        qty: Number(scanForm.qty || 1),
      });
      setMessage('Scan accepted');
      setScanForm({ waveLineId: '', barcode: '', qty: 1 });
      await loadQueue();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Scan failed');
    }
  }

  return (
    <section>
      <h2>Raw Store Scanner</h2>
      {message && <p className="form-hint">{message}</p>}
      <div className="card toolbar-row">
        <label>Warehouse<select value={filters.warehouseId} onChange={(e) => setFilters({ warehouseId: e.target.value })}><option value="">All</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
        <button type="button" onClick={() => loadQueue().catch(() => {})}>Refresh</button>
      </div>

      <article className="card">
        <h3>Pick Scan</h3>
        <form className="filters-grid" onSubmit={onScan}>
          <label>Wave Line<select value={scanForm.waveLineId} onChange={(e) => setScanForm((p) => ({ ...p, waveLineId: e.target.value }))}><option value="">Select line</option>{queue.map((q) => <option key={q.line_id} value={q.line_id}>{q.wave_no} | {q.sku} | Bin {q.bin_code || '-'}</option>)}</select></label>
          <label>Barcode / SKU<input value={scanForm.barcode} onChange={(e) => setScanForm((p) => ({ ...p, barcode: e.target.value }))} /></label>
          <label>Qty<input type="number" min="0.01" step="0.01" value={scanForm.qty} onChange={(e) => setScanForm((p) => ({ ...p, qty: e.target.value }))} /></label>
          <button type="submit">Submit Scan</button>
        </form>
        {selectedLine && (
          <p className="form-hint">
            Selected: {selectedLine.wave_no} | {selectedLine.sku} | To Pick {money(selectedLine.qty_to_pick)} | Picked {money(selectedLine.qty_picked)}
          </p>
        )}
      </article>

      <article className="card">
        <h3>Scanner Queue</h3>
        <div className="table-wrap">
          <table><thead><tr><th>Wave</th><th>SKU</th><th>Bin</th><th>To Pick</th><th>Picked</th><th>Status</th></tr></thead><tbody>{queue.length === 0 ? <tr><td colSpan={6}>No queue lines.</td></tr> : queue.slice(0, 300).map((q) => <tr key={q.line_id}><td>{q.wave_no}</td><td>{q.sku}</td><td>{q.bin_code || '-'}</td><td>{money(q.qty_to_pick)}</td><td>{money(q.qty_picked)}</td><td>{q.line_status}</td></tr>)}</tbody></table>
        </div>
      </article>
    </section>
  );
}
