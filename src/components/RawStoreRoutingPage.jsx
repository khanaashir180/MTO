import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';

function money(v) {
  return Number(v || 0).toFixed(2);
}

export default function RawStoreRoutingPage({ refreshSignal }) {
  const [message, setMessage] = useState('');
  const [rules, setRules] = useState([]);
  const [procRuns, setProcRuns] = useState([]);
  const [valuations, setValuations] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [bins, setBins] = useState([]);
  const [ruleForm, setRuleForm] = useState({
    ruleName: '',
    itemId: '',
    itemType: '',
    sourceWarehouseId: '',
    sourceBinId: '',
    destinationWarehouseId: '',
    destinationBinId: '',
    routeAction: 'TRANSFER',
    priorityRank: 100,
  });

  const loadAll = useCallback(async () => {
    const [ruleRes, runRes, valRes, itemRes, whRes, binRes] = await Promise.all([
      api.get('/raw-store/routing-rules'),
      api.get('/raw-store/procurement-runs'),
      api.get('/raw-store/reports/valuation'),
      api.get('/raw-store/items'),
      api.get('/raw-store/warehouses'),
      api.get('/raw-store/bins'),
    ]);
    setRules(ruleRes.data?.rules || []);
    setProcRuns(runRes.data?.runs || []);
    setValuations(valRes.data?.summary || []);
    setItems(itemRes.data?.items || []);
    setWarehouses(whRes.data?.warehouses || []);
    setBins(binRes.data?.bins || []);
  }, []);

  useEffect(() => {
    loadAll().catch((error) => setMessage(error.response?.data?.message || 'Unable to load routing center'));
  }, [loadAll, refreshSignal]);

  async function createRule(event) {
    event.preventDefault();
    try {
      await api.post('/raw-store/routing-rules', {
        ...ruleForm,
        itemId: ruleForm.itemId ? Number(ruleForm.itemId) : null,
        sourceWarehouseId: ruleForm.sourceWarehouseId ? Number(ruleForm.sourceWarehouseId) : null,
        sourceBinId: ruleForm.sourceBinId ? Number(ruleForm.sourceBinId) : null,
        destinationWarehouseId: ruleForm.destinationWarehouseId ? Number(ruleForm.destinationWarehouseId) : null,
        destinationBinId: ruleForm.destinationBinId ? Number(ruleForm.destinationBinId) : null,
        priorityRank: Number(ruleForm.priorityRank || 100),
      });
      setRuleForm({
        ruleName: '', itemId: '', itemType: '', sourceWarehouseId: '', sourceBinId: '',
        destinationWarehouseId: '', destinationBinId: '', routeAction: 'TRANSFER', priorityRank: 100,
      });
      setMessage('Routing rule saved');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save routing rule');
    }
  }

  async function runScheduler() {
    try {
      await api.post('/raw-store/procurement-runs/scheduler', {});
      setMessage('Procurement scheduler executed');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run scheduler');
    }
  }

  return (
    <section>
      <h2>Raw Store Routing Center</h2>
      {message && <p className="form-hint">{message}</p>}

      <article className="card">
        <h3>Routing Matrix Rules</h3>
        <form className="filters-grid" onSubmit={createRule}>
          <label>Rule Name<input value={ruleForm.ruleName} onChange={(e) => setRuleForm((p) => ({ ...p, ruleName: e.target.value }))} /></label>
          <label>Item (Optional)<select value={ruleForm.itemId} onChange={(e) => setRuleForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Any</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku}</option>)}</select></label>
          <label>Item Type (Optional)<input value={ruleForm.itemType} onChange={(e) => setRuleForm((p) => ({ ...p, itemType: e.target.value }))} /></label>
          <label>Route Action<select value={ruleForm.routeAction} onChange={(e) => setRuleForm((p) => ({ ...p, routeAction: e.target.value }))}><option value="TRANSFER">TRANSFER</option><option value="PUTAWAY">PUTAWAY</option><option value="CROSS_DOCK">CROSS_DOCK</option><option value="PICK">PICK</option></select></label>
          <label>Source WH<select value={ruleForm.sourceWarehouseId} onChange={(e) => setRuleForm((p) => ({ ...p, sourceWarehouseId: e.target.value }))}><option value="">Any</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
          <label>Source Bin<select value={ruleForm.sourceBinId} onChange={(e) => setRuleForm((p) => ({ ...p, sourceBinId: e.target.value }))}><option value="">Any</option>{bins.map((b) => <option key={b.id} value={b.id}>{b.bin_code}</option>)}</select></label>
          <label>Destination WH<select value={ruleForm.destinationWarehouseId} onChange={(e) => setRuleForm((p) => ({ ...p, destinationWarehouseId: e.target.value }))}><option value="">Any</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
          <label>Destination Bin<select value={ruleForm.destinationBinId} onChange={(e) => setRuleForm((p) => ({ ...p, destinationBinId: e.target.value }))}><option value="">Any</option>{bins.map((b) => <option key={b.id} value={b.id}>{b.bin_code}</option>)}</select></label>
          <label>Priority<input type="number" min="1" value={ruleForm.priorityRank} onChange={(e) => setRuleForm((p) => ({ ...p, priorityRank: e.target.value }))} /></label>
          <button type="submit">Save Routing Rule</button>
        </form>
        <div className="table-wrap">
          <table><thead><tr><th>Name</th><th>Action</th><th>Item</th><th>Source</th><th>Destination</th><th>Priority</th></tr></thead><tbody>{rules.length === 0 ? <tr><td colSpan={6}>No rules.</td></tr> : rules.slice(0, 100).map((r) => <tr key={r.id}><td>{r.rule_name}</td><td>{r.route_action}</td><td>{r.sku || r.item_type || 'ANY'}</td><td>{r.source_warehouse_name || '-'} / {r.source_bin_code || '-'}</td><td>{r.destination_warehouse_name || '-'} / {r.destination_bin_code || '-'}</td><td>{r.priority_rank}</td></tr>)}</tbody></table>
        </div>
      </article>

      <div className="summary-grid">
        <article className="card">
          <h3>Procurement Scheduler</h3>
          <button type="button" onClick={runScheduler}>Run Scheduler</button>
          <div className="table-wrap">
            <table><thead><tr><th>Run No</th><th>Warehouse</th><th>Status</th><th>Created Suggestions</th><th>At</th></tr></thead><tbody>{procRuns.length === 0 ? <tr><td colSpan={5}>No runs.</td></tr> : procRuns.map((r) => <tr key={r.id}><td>{r.run_no}</td><td>{r.warehouse_name || 'ALL'}</td><td>{r.status}</td><td>{r.created_suggestions}</td><td>{String(r.created_at).slice(0, 16).replace('T', ' ')}</td></tr>)}</tbody></table>
          </div>
        </article>

        <article className="card">
          <h3>Valuation Snapshot</h3>
          <div className="table-wrap">
            <table><thead><tr><th>SKU</th><th>Warehouse</th><th>Closing Qty</th><th>Closing Value</th><th>Avg Cost</th></tr></thead><tbody>{valuations.length === 0 ? <tr><td colSpan={5}>No valuation data.</td></tr> : valuations.slice(0, 150).map((v, idx) => <tr key={`${v.item_id}-${v.warehouse_id || 0}-${idx}`}><td>{v.sku}</td><td>{v.warehouse_name || '-'}</td><td>{money(v.closing_qty)}</td><td>{money(v.closing_value)}</td><td>{money(v.avg_cost)}</td></tr>)}</tbody></table>
          </div>
        </article>
      </div>
    </section>
  );
}
