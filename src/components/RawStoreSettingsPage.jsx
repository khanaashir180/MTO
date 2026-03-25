import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';

function money(v) {
  return Number(v || 0).toFixed(2);
}

export default function RawStoreSettingsPage({ refreshSignal }) {
  const [message, setMessage] = useState('');
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [bins, setBins] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [replenishmentRules, setReplenishmentRules] = useState([]);
  const [cyclePolicies, setCyclePolicies] = useState([]);
  const [putawayRules, setPutawayRules] = useState([]);

  const [replenishmentForm, setReplenishmentForm] = useState({ itemId: '', warehouseId: '', minQty: '', maxQty: '', multipleQty: 1, leadTimeDays: 0, preferredVendorId: '' });
  const [cyclePolicyForm, setCyclePolicyForm] = useState({ warehouseId: '', itemId: '', abcClass: '', frequencyDays: 30 });
  const [putawayForm, setPutawayForm] = useState({ warehouseId: '', itemId: '', itemType: '', preferredBinId: '', priorityRank: 100 });

  const loadAll = useCallback(async () => {
    const [itemRes, whRes, binRes, replRes, cycRes, putRes] = await Promise.all([
      api.get('/raw-store/items'),
      api.get('/raw-store/warehouses'),
      api.get('/raw-store/bins'),
      api.get('/raw-store/replenishment-rules'),
      api.get('/raw-store/cycle-count-policies'),
      api.get('/raw-store/putaway-rules'),
    ]);
    setItems(itemRes.data?.items || []);
    setWarehouses(whRes.data?.warehouses || []);
    setBins(binRes.data?.bins || []);
    setReplenishmentRules(replRes.data?.rules || []);
    setCyclePolicies(cycRes.data?.policies || []);
    setPutawayRules(putRes.data?.rules || []);
    try {
      const { data } = await api.get('/finance/vendors');
      setVendors(data?.vendors || []);
    } catch (_error) {
      setVendors([]);
    }
  }, []);

  useEffect(() => {
    loadAll().catch((error) => setMessage(error.response?.data?.message || 'Unable to load settings'));
  }, [loadAll, refreshSignal]);

  async function saveReplenishmentRule(event) {
    event.preventDefault();
    try {
      await api.post('/raw-store/replenishment-rules', {
        itemId: Number(replenishmentForm.itemId),
        warehouseId: Number(replenishmentForm.warehouseId),
        minQty: Number(replenishmentForm.minQty || 0),
        maxQty: Number(replenishmentForm.maxQty || 0),
        multipleQty: Number(replenishmentForm.multipleQty || 1),
        leadTimeDays: Number(replenishmentForm.leadTimeDays || 0),
        preferredVendorId: replenishmentForm.preferredVendorId ? Number(replenishmentForm.preferredVendorId) : null,
      });
      setMessage('Min/Max rule saved');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save min/max rule');
    }
  }

  async function saveCyclePolicy(event) {
    event.preventDefault();
    try {
      await api.post('/raw-store/cycle-count-policies', {
        warehouseId: Number(cyclePolicyForm.warehouseId),
        itemId: cyclePolicyForm.itemId ? Number(cyclePolicyForm.itemId) : null,
        abcClass: cyclePolicyForm.abcClass || null,
        frequencyDays: Number(cyclePolicyForm.frequencyDays || 30),
      });
      setMessage('Cycle count policy saved');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save cycle policy');
    }
  }

  async function savePutawayRule(event) {
    event.preventDefault();
    try {
      await api.post('/raw-store/putaway-rules', {
        warehouseId: Number(putawayForm.warehouseId),
        itemId: putawayForm.itemId ? Number(putawayForm.itemId) : null,
        itemType: putawayForm.itemType || null,
        preferredBinId: Number(putawayForm.preferredBinId),
        priorityRank: Number(putawayForm.priorityRank || 100),
      });
      setMessage('Putaway rule saved');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save putaway rule');
    }
  }

  return (
    <section>
      <h2>Raw Store Settings</h2>
      {message && <p className="form-hint">{message}</p>}
      <article className="card">
        <h3>Min/Max Replenishment Settings</h3>
        <form className="filters-grid" onSubmit={saveReplenishmentRule}>
          <label>Item<select value={replenishmentForm.itemId} onChange={(e) => setReplenishmentForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku}</option>)}</select></label>
          <label>Warehouse<select value={replenishmentForm.warehouseId} onChange={(e) => setReplenishmentForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
          <label>Min<input type="number" min="0" step="0.01" value={replenishmentForm.minQty} onChange={(e) => setReplenishmentForm((p) => ({ ...p, minQty: e.target.value }))} /></label>
          <label>Max<input type="number" min="0" step="0.01" value={replenishmentForm.maxQty} onChange={(e) => setReplenishmentForm((p) => ({ ...p, maxQty: e.target.value }))} /></label>
          <label>Multiple<input type="number" min="1" step="0.01" value={replenishmentForm.multipleQty} onChange={(e) => setReplenishmentForm((p) => ({ ...p, multipleQty: e.target.value }))} /></label>
          <label>Lead Days<input type="number" min="0" value={replenishmentForm.leadTimeDays} onChange={(e) => setReplenishmentForm((p) => ({ ...p, leadTimeDays: e.target.value }))} /></label>
          <label>Preferred Vendor<select value={replenishmentForm.preferredVendorId} onChange={(e) => setReplenishmentForm((p) => ({ ...p, preferredVendorId: e.target.value }))}><option value="">Optional</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}</select></label>
          <button type="submit">Save Min/Max Rule</button>
        </form>
        <div className="table-wrap">
          <table><thead><tr><th>SKU</th><th>Warehouse</th><th>Min</th><th>Max</th><th>Multiple</th><th>Lead</th></tr></thead><tbody>{replenishmentRules.length === 0 ? <tr><td colSpan={6}>No rules.</td></tr> : replenishmentRules.slice(0, 120).map((r) => <tr key={r.id}><td>{r.sku}</td><td>{r.warehouse_name}</td><td>{money(r.min_qty)}</td><td>{money(r.max_qty)}</td><td>{money(r.multiple_qty)}</td><td>{r.lead_time_days}</td></tr>)}</tbody></table>
        </div>
      </article>

      <div className="summary-grid">
        <article className="card">
          <h3>Cycle Count Policy</h3>
          <form className="filters-grid" onSubmit={saveCyclePolicy}>
            <label>Warehouse<select value={cyclePolicyForm.warehouseId} onChange={(e) => setCyclePolicyForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>Item (Optional)<select value={cyclePolicyForm.itemId} onChange={(e) => setCyclePolicyForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">All</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku}</option>)}</select></label>
            <label>ABC Class<input value={cyclePolicyForm.abcClass} onChange={(e) => setCyclePolicyForm((p) => ({ ...p, abcClass: e.target.value }))} /></label>
            <label>Frequency Days<input type="number" min="1" value={cyclePolicyForm.frequencyDays} onChange={(e) => setCyclePolicyForm((p) => ({ ...p, frequencyDays: e.target.value }))} /></label>
            <button type="submit">Save Cycle Policy</button>
          </form>
          <div className="table-wrap">
            <table><thead><tr><th>Warehouse</th><th>Item</th><th>ABC</th><th>Frequency Days</th></tr></thead><tbody>{cyclePolicies.length === 0 ? <tr><td colSpan={4}>No policies.</td></tr> : cyclePolicies.slice(0, 120).map((p) => <tr key={p.id}><td>{p.warehouse_name}</td><td>{p.sku || 'ALL'}</td><td>{p.abc_class || '-'}</td><td>{p.frequency_days}</td></tr>)}</tbody></table>
          </div>
        </article>

        <article className="card">
          <h3>Putaway Rule Settings</h3>
          <form className="filters-grid" onSubmit={savePutawayRule}>
            <label>Warehouse<select value={putawayForm.warehouseId} onChange={(e) => setPutawayForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>Item (Optional)<select value={putawayForm.itemId} onChange={(e) => setPutawayForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Any</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku}</option>)}</select></label>
            <label>Item Type (Optional)<input value={putawayForm.itemType} onChange={(e) => setPutawayForm((p) => ({ ...p, itemType: e.target.value }))} /></label>
            <label>Preferred Bin<select value={putawayForm.preferredBinId} onChange={(e) => setPutawayForm((p) => ({ ...p, preferredBinId: e.target.value }))}><option value="">Select</option>{bins.filter((b) => !putawayForm.warehouseId || Number(b.warehouse_id) === Number(putawayForm.warehouseId)).map((b) => <option key={b.id} value={b.id}>{b.bin_code}</option>)}</select></label>
            <label>Priority<input type="number" min="1" value={putawayForm.priorityRank} onChange={(e) => setPutawayForm((p) => ({ ...p, priorityRank: e.target.value }))} /></label>
            <button type="submit">Save Putaway Rule</button>
          </form>
          <div className="table-wrap">
            <table><thead><tr><th>Warehouse</th><th>Item</th><th>Type</th><th>Bin</th><th>Priority</th></tr></thead><tbody>{putawayRules.length === 0 ? <tr><td colSpan={5}>No rules.</td></tr> : putawayRules.slice(0, 120).map((r) => <tr key={r.id}><td>{r.warehouse_name}</td><td>{r.sku || 'ANY'}</td><td>{r.item_type || '-'}</td><td>{r.bin_code}</td><td>{r.priority_rank}</td></tr>)}</tbody></table>
          </div>
        </article>
      </div>
    </section>
  );
}
