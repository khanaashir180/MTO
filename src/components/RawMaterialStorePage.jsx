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

export default function RawMaterialStorePage({ refreshSignal }) {
  const [message, setMessage] = useState('');
  const [overview, setOverview] = useState({
    kpis: { sku_count: 0, balance_rows: 0, qty_on_hand: 0, below_reorder: 0 },
    warehouses: [],
    txnMix: [],
  });
  const [balances, setBalances] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [bins, setBins] = useState([]);
  const [grns, setGrns] = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  const [reorderSuggestions, setReorderSuggestions] = useState([]);
  const [putawayRules, setPutawayRules] = useState([]);
  const [cycleCounts, setCycleCounts] = useState([]);
  const [replenishmentRules, setReplenishmentRules] = useState([]);
  const [pickWaves, setPickWaves] = useState([]);
  const [barcodeResult, setBarcodeResult] = useState(null);

  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [vendors, setVendors] = useState([]);

  const [binForm, setBinForm] = useState({ warehouseId: '', binCode: '', binName: '', zoneName: '' });
  const [grnForm, setGrnForm] = useState({
    vendorId: '',
    warehouseId: '',
    grnDate: '',
    notes: '',
    itemId: '',
    binId: '',
    qtyReceived: '',
    unitCost: '',
    lotNo: '',
    expiryDate: '',
  });
  const [issueForm, setIssueForm] = useState({ itemId: '', warehouseId: '', binId: '', qty: '', unitCost: '', referenceNo: '', notes: '' });
  const [transferForm, setTransferForm] = useState({ itemId: '', fromWarehouseId: '', fromBinId: '', toWarehouseId: '', toBinId: '', qty: '', unitCost: '', notes: '' });
  const [adjustmentForm, setAdjustmentForm] = useState({ itemId: '', warehouseId: '', binId: '', adjustmentQty: '', unitCost: '', notes: '' });
  const [reqForm, setReqForm] = useState({ warehouseId: '', neededBy: '', notes: '', itemId: '', binId: '', qtyRequested: '' });
  const [putawayForm, setPutawayForm] = useState({ warehouseId: '', itemId: '', itemType: '', preferredBinId: '', priorityRank: 100 });
  const [cycleCountForm, setCycleCountForm] = useState({ warehouseId: '', itemIdsCsv: '', countDate: '' });
  const [replenishmentForm, setReplenishmentForm] = useState({ itemId: '', warehouseId: '', minQty: '', maxQty: '', multipleQty: 1, leadTimeDays: 0, preferredVendorId: '' });
  const [waveForm, setWaveForm] = useState({ warehouseId: '', requisitionIdsCsv: '' });
  const [barcodeForm, setBarcodeForm] = useState({ barcode: '', action: 'LOOKUP', warehouseId: '', toWarehouseId: '', qty: 1 });

  const loadAll = useCallback(async () => {
    const [overviewRes, balanceRes, txnRes, binRes, grnRes, reqRes, reorderRes, itemRes, whRes, putawayRes, countRes, replRes, waveRes] = await Promise.all([
      api.get('/raw-store/overview'),
      api.get('/raw-store/balances'),
      api.get('/raw-store/transactions?limit=300'),
      api.get('/raw-store/bins'),
      api.get('/raw-store/grns'),
      api.get('/raw-store/requisitions'),
      api.get('/raw-store/reorder-suggestions'),
      api.get('/raw-store/items'),
      api.get('/raw-store/warehouses'),
      api.get('/raw-store/putaway-rules'),
      api.get('/raw-store/cycle-counts'),
      api.get('/raw-store/replenishment-rules'),
      api.get('/raw-store/pick-waves'),
    ]);
    setOverview(overviewRes.data || {
      kpis: { sku_count: 0, balance_rows: 0, qty_on_hand: 0, below_reorder: 0 },
      warehouses: [],
      txnMix: [],
    });
    setBalances(balanceRes.data?.balances || []);
    setTransactions(txnRes.data?.transactions || []);
    setBins(binRes.data?.bins || []);
    setGrns(grnRes.data?.grns || []);
    setRequisitions(reqRes.data?.requisitions || []);
    setReorderSuggestions(reorderRes.data?.suggestions || []);
    setItems(itemRes.data?.items || []);
    setWarehouses(whRes.data?.warehouses || []);
    setPutawayRules(putawayRes.data?.rules || []);
    setCycleCounts(countRes.data?.counts || []);
    setReplenishmentRules(replRes.data?.rules || []);
    setPickWaves(waveRes.data?.waves || []);
    try {
      const { data } = await api.get('/finance/vendors');
      setVendors(data?.vendors || []);
    } catch (_error) {
      setVendors([]);
    }
  }, []);

  useEffect(() => {
    loadAll().catch((error) => {
      setMessage(error.response?.data?.message || 'Unable to load raw store');
    });
  }, [loadAll, refreshSignal]);

  const txnMix = useMemo(
    () => (overview.txnMix || []).map((t) => ({ label: t.txn_type, value: Number(t.txn_count || 0) })),
    [overview.txnMix]
  );
  const warehouseQty = useMemo(
    () => (overview.warehouses || []).map((w) => ({ label: w.warehouse_name, value: Number(w.qty_on_hand || 0) })),
    [overview.warehouses]
  );

  async function onCreateBin(event) {
    event.preventDefault();
    try {
      await api.post('/raw-store/bins', { ...binForm, warehouseId: Number(binForm.warehouseId) });
      setBinForm({ warehouseId: '', binCode: '', binName: '', zoneName: '' });
      setMessage('Bin created');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create bin');
    }
  }

  async function onCreatePutawayRule(event) {
    event.preventDefault();
    try {
      await api.post('/raw-store/putaway-rules', {
        warehouseId: Number(putawayForm.warehouseId),
        itemId: putawayForm.itemId ? Number(putawayForm.itemId) : null,
        itemType: putawayForm.itemType || null,
        preferredBinId: Number(putawayForm.preferredBinId),
        priorityRank: Number(putawayForm.priorityRank || 100),
      });
      setPutawayForm({ warehouseId: '', itemId: '', itemType: '', preferredBinId: '', priorityRank: 100 });
      setMessage('Putaway rule created');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create putaway rule');
    }
  }

  async function onCreateCycleCount(event) {
    event.preventDefault();
    try {
      const itemIds = String(cycleCountForm.itemIdsCsv || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      await api.post('/raw-store/cycle-counts', {
        warehouseId: Number(cycleCountForm.warehouseId),
        countDate: cycleCountForm.countDate || null,
        itemIds,
      });
      setCycleCountForm({ warehouseId: '', itemIdsCsv: '', countDate: '' });
      setMessage('Cycle count created');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create cycle count');
    }
  }

  async function postCycleCount(countId) {
    try {
      await api.post(`/raw-store/cycle-counts/${countId}/post`, { lines: [] });
      setMessage('Cycle count posted');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to post cycle count');
    }
  }

  async function onUpsertReplenishmentRule(event) {
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
      setReplenishmentForm({ itemId: '', warehouseId: '', minQty: '', maxQty: '', multipleQty: 1, leadTimeDays: 0, preferredVendorId: '' });
      setMessage('Replenishment rule saved');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save replenishment rule');
    }
  }

  async function generateReplenishment() {
    try {
      await api.post('/raw-store/replenishment-rules/generate', {});
      setMessage('Replenishment suggestions generated');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to generate replenishment');
    }
  }

  async function onCreateWave(event) {
    event.preventDefault();
    try {
      const requisitionIds = String(waveForm.requisitionIdsCsv || '')
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0);
      await api.post('/raw-store/pick-waves', {
        warehouseId: Number(waveForm.warehouseId),
        requisitionIds,
      });
      setWaveForm({ warehouseId: '', requisitionIdsCsv: '' });
      setMessage('Pick wave created');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create pick wave');
    }
  }

  async function onBarcodeAction(event) {
    event.preventDefault();
    try {
      const { data } = await api.post('/raw-store/barcode/actions', {
        barcode: barcodeForm.barcode,
        action: barcodeForm.action,
        warehouseId: barcodeForm.warehouseId ? Number(barcodeForm.warehouseId) : null,
        toWarehouseId: barcodeForm.toWarehouseId ? Number(barcodeForm.toWarehouseId) : null,
        qty: Number(barcodeForm.qty || 1),
      });
      setBarcodeResult(data);
      setMessage(`Barcode action ${barcodeForm.action} completed`);
      await loadAll();
    } catch (error) {
      setBarcodeResult(null);
      setMessage(error.response?.data?.message || 'Unable to run barcode action');
    }
  }

  async function onCreateGrn(event) {
    event.preventDefault();
    try {
      await api.post('/raw-store/grns', {
        vendorId: grnForm.vendorId ? Number(grnForm.vendorId) : null,
        warehouseId: Number(grnForm.warehouseId),
        grnDate: grnForm.grnDate || null,
        notes: grnForm.notes || '',
        lines: [{
          itemId: Number(grnForm.itemId),
          binId: grnForm.binId ? Number(grnForm.binId) : null,
          qtyReceived: Number(grnForm.qtyReceived),
          unitCost: Number(grnForm.unitCost || 0),
          lotNo: grnForm.lotNo || '',
          expiryDate: grnForm.expiryDate || null,
        }],
      });
      setMessage('GRN posted');
      setGrnForm({
        vendorId: '', warehouseId: '', grnDate: '', notes: '', itemId: '', binId: '',
        qtyReceived: '', unitCost: '', lotNo: '', expiryDate: '',
      });
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to post GRN');
    }
  }

  async function onIssue(event) {
    event.preventDefault();
    try {
      await api.post('/raw-store/issues', {
        ...issueForm,
        itemId: Number(issueForm.itemId),
        warehouseId: Number(issueForm.warehouseId),
        binId: issueForm.binId ? Number(issueForm.binId) : null,
        qty: Number(issueForm.qty),
        unitCost: Number(issueForm.unitCost || 0),
      });
      setIssueForm({ itemId: '', warehouseId: '', binId: '', qty: '', unitCost: '', referenceNo: '', notes: '' });
      setMessage('Issue posted');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to issue stock');
    }
  }

  async function onTransfer(event) {
    event.preventDefault();
    try {
      await api.post('/raw-store/transfers', {
        ...transferForm,
        itemId: Number(transferForm.itemId),
        fromWarehouseId: Number(transferForm.fromWarehouseId),
        fromBinId: transferForm.fromBinId ? Number(transferForm.fromBinId) : null,
        toWarehouseId: Number(transferForm.toWarehouseId),
        toBinId: transferForm.toBinId ? Number(transferForm.toBinId) : null,
        qty: Number(transferForm.qty),
        unitCost: Number(transferForm.unitCost || 0),
      });
      setTransferForm({ itemId: '', fromWarehouseId: '', fromBinId: '', toWarehouseId: '', toBinId: '', qty: '', unitCost: '', notes: '' });
      setMessage('Transfer posted');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to transfer stock');
    }
  }

  async function onAdjust(event) {
    event.preventDefault();
    try {
      await api.post('/raw-store/adjustments', {
        ...adjustmentForm,
        itemId: Number(adjustmentForm.itemId),
        warehouseId: Number(adjustmentForm.warehouseId),
        binId: adjustmentForm.binId ? Number(adjustmentForm.binId) : null,
        adjustmentQty: Number(adjustmentForm.adjustmentQty),
        unitCost: Number(adjustmentForm.unitCost || 0),
      });
      setAdjustmentForm({ itemId: '', warehouseId: '', binId: '', adjustmentQty: '', unitCost: '', notes: '' });
      setMessage('Adjustment posted');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to post adjustment');
    }
  }

  async function onCreateRequisition(event) {
    event.preventDefault();
    try {
      await api.post('/raw-store/requisitions', {
        warehouseId: Number(reqForm.warehouseId),
        neededBy: reqForm.neededBy || null,
        notes: reqForm.notes || '',
        lines: [{
          itemId: Number(reqForm.itemId),
          binId: reqForm.binId ? Number(reqForm.binId) : null,
          qtyRequested: Number(reqForm.qtyRequested),
        }],
      });
      setReqForm({ warehouseId: '', neededBy: '', notes: '', itemId: '', binId: '', qtyRequested: '' });
      setMessage('Requisition created');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create requisition');
    }
  }

  async function approveRequisition(id) {
    try {
      await api.post(`/raw-store/requisitions/${id}/approve`);
      setMessage('Requisition approved');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to approve requisition');
    }
  }

  async function issueRequisition(id) {
    try {
      await api.post(`/raw-store/requisitions/${id}/issue`);
      setMessage('Requisition issue posted');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to issue requisition');
    }
  }

  return (
    <section>
      <h2>Raw Material Store</h2>
      <div className="card toolbar-row">
        <button type="button" className="button-secondary" onClick={() => window.open(`${window.location.origin}?page=raw-store-scanner`, '_blank', 'noopener,noreferrer')}>Scanner Window</button>
        <button type="button" className="button-secondary" onClick={() => window.open(`${window.location.origin}?page=raw-store-routing`, '_blank', 'noopener,noreferrer')}>Routing Window</button>
        <button type="button" className="button-secondary" onClick={() => window.open(`${window.location.origin}?page=raw-store-reports`, '_blank', 'noopener,noreferrer')}>Reports Window</button>
        <button type="button" className="button-secondary" onClick={() => window.open(`${window.location.origin}?page=raw-store-settings`, '_blank', 'noopener,noreferrer')}>Settings Window</button>
      </div>
      {message && <p className="form-hint">{message}</p>}

      <div className="summary-grid">
        <article className="card"><h4>Active SKUs</h4><p className="metric">{Number(overview.kpis?.sku_count || 0)}</p></article>
        <article className="card"><h4>Balance Rows</h4><p className="metric">{Number(overview.kpis?.balance_rows || 0)}</p></article>
        <article className="card"><h4>Total On Hand</h4><p className="metric">{money(overview.kpis?.qty_on_hand)}</p></article>
        <article className="card"><h4>Below Reorder</h4><p className="metric">{Number(overview.kpis?.below_reorder || 0)}</p></article>
      </div>

      <div className="summary-grid">
        <BarChartCard title="Warehouse On-Hand Qty" data={warehouseQty} yLabel="Qty" format="number" />
        <DonutChartCard title="30-Day Transaction Mix" data={txnMix} totalLabel="Txns" />
      </div>

      <div className="summary-grid">
        <article className="card">
          <h3>Putaway + Barcode</h3>
          <form className="filters-grid" onSubmit={onCreatePutawayRule}>
            <label>Warehouse<select value={putawayForm.warehouseId} onChange={(e) => setPutawayForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>Item (Optional)<select value={putawayForm.itemId} onChange={(e) => setPutawayForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Any</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku}</option>)}</select></label>
            <label>Item Type (Optional)<input value={putawayForm.itemType} onChange={(e) => setPutawayForm((p) => ({ ...p, itemType: e.target.value }))} /></label>
            <label>Preferred Bin<select value={putawayForm.preferredBinId} onChange={(e) => setPutawayForm((p) => ({ ...p, preferredBinId: e.target.value }))}><option value="">Select</option>{bins.filter((b) => !putawayForm.warehouseId || Number(b.warehouse_id) === Number(putawayForm.warehouseId)).map((b) => <option key={b.id} value={b.id}>{b.bin_code}</option>)}</select></label>
            <label>Priority<input type="number" min="1" value={putawayForm.priorityRank} onChange={(e) => setPutawayForm((p) => ({ ...p, priorityRank: e.target.value }))} /></label>
            <button type="submit">Save Putaway Rule</button>
          </form>
          <div className="table-wrap">
            <table><thead><tr><th>Warehouse</th><th>Item</th><th>Type</th><th>Bin</th><th>Priority</th></tr></thead><tbody>{putawayRules.length === 0 ? <tr><td colSpan={5}>No putaway rules.</td></tr> : putawayRules.slice(0, 30).map((r) => <tr key={r.id}><td>{r.warehouse_name}</td><td>{r.sku || '-'}</td><td>{r.item_type || '-'}</td><td>{r.bin_code}</td><td>{r.priority_rank}</td></tr>)}</tbody></table>
          </div>
          <form className="filters-grid" onSubmit={onBarcodeAction}>
            <label>Barcode/SKU<input value={barcodeForm.barcode} onChange={(e) => setBarcodeForm((p) => ({ ...p, barcode: e.target.value }))} /></label>
            <label>Action<select value={barcodeForm.action} onChange={(e) => setBarcodeForm((p) => ({ ...p, action: e.target.value }))}><option value="LOOKUP">LOOKUP</option><option value="RECEIVE">RECEIVE</option><option value="ISSUE">ISSUE</option><option value="TRANSFER">TRANSFER</option></select></label>
            <label>Warehouse<select value={barcodeForm.warehouseId} onChange={(e) => setBarcodeForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>To Warehouse<select value={barcodeForm.toWarehouseId} onChange={(e) => setBarcodeForm((p) => ({ ...p, toWarehouseId: e.target.value }))}><option value="">None</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>Qty<input type="number" min="0.01" step="0.01" value={barcodeForm.qty} onChange={(e) => setBarcodeForm((p) => ({ ...p, qty: e.target.value }))} /></label>
            <button type="submit">Run Barcode Action</button>
          </form>
          {barcodeResult && <p className="form-hint">Barcode result: {barcodeResult.item?.sku} {barcodeResult.success ? `(${barcodeResult.action})` : ''}</p>}
        </article>

        <article className="card">
          <h3>Cycle Count + Replenishment + Picking Wave</h3>
          <form className="filters-grid" onSubmit={onCreateCycleCount}>
            <label>Warehouse<select value={cycleCountForm.warehouseId} onChange={(e) => setCycleCountForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>Count Date<input type="date" value={cycleCountForm.countDate} onChange={(e) => setCycleCountForm((p) => ({ ...p, countDate: e.target.value }))} /></label>
            <label>Item IDs CSV<input value={cycleCountForm.itemIdsCsv} onChange={(e) => setCycleCountForm((p) => ({ ...p, itemIdsCsv: e.target.value }))} placeholder="1,2,3" /></label>
            <button type="submit">Create Cycle Count</button>
          </form>
          <div className="table-wrap">
            <table><thead><tr><th>Count No</th><th>Warehouse</th><th>Date</th><th>Status</th><th>Counted/Lines</th><th>Action</th></tr></thead><tbody>{cycleCounts.length === 0 ? <tr><td colSpan={6}>No cycle counts.</td></tr> : cycleCounts.slice(0, 20).map((c) => <tr key={c.id}><td>{c.count_no}</td><td>{c.warehouse_name}</td><td>{dateOnly(c.count_date)}</td><td>{c.status}</td><td>{c.counted_lines}/{c.line_count}</td><td>{c.status === 'OPEN' ? <button type="button" className="button-secondary" onClick={() => postCycleCount(c.id)}>Post</button> : '-'}</td></tr>)}</tbody></table>
          </div>
          <form className="filters-grid" onSubmit={onUpsertReplenishmentRule}>
            <label>Item<select value={replenishmentForm.itemId} onChange={(e) => setReplenishmentForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku}</option>)}</select></label>
            <label>Warehouse<select value={replenishmentForm.warehouseId} onChange={(e) => setReplenishmentForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>Min<input type="number" min="0" step="0.01" value={replenishmentForm.minQty} onChange={(e) => setReplenishmentForm((p) => ({ ...p, minQty: e.target.value }))} /></label>
            <label>Max<input type="number" min="0" step="0.01" value={replenishmentForm.maxQty} onChange={(e) => setReplenishmentForm((p) => ({ ...p, maxQty: e.target.value }))} /></label>
            <label>Multiple<input type="number" min="1" step="0.01" value={replenishmentForm.multipleQty} onChange={(e) => setReplenishmentForm((p) => ({ ...p, multipleQty: e.target.value }))} /></label>
            <label>Lead Days<input type="number" min="0" value={replenishmentForm.leadTimeDays} onChange={(e) => setReplenishmentForm((p) => ({ ...p, leadTimeDays: e.target.value }))} /></label>
            <label>Vendor<select value={replenishmentForm.preferredVendorId} onChange={(e) => setReplenishmentForm((p) => ({ ...p, preferredVendorId: e.target.value }))}><option value="">Optional</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}</select></label>
            <button type="submit">Save Rule</button>
          </form>
          <button type="button" onClick={generateReplenishment}>Generate Replenishment Suggestions</button>
          <div className="table-wrap">
            <table><thead><tr><th>SKU</th><th>Warehouse</th><th>Min</th><th>Max</th><th>Multiple</th><th>Lead</th></tr></thead><tbody>{replenishmentRules.length === 0 ? <tr><td colSpan={6}>No replenishment rules.</td></tr> : replenishmentRules.slice(0, 20).map((r) => <tr key={r.id}><td>{r.sku}</td><td>{r.warehouse_name}</td><td>{money(r.min_qty)}</td><td>{money(r.max_qty)}</td><td>{money(r.multiple_qty)}</td><td>{r.lead_time_days}</td></tr>)}</tbody></table>
          </div>
          <form className="filters-grid" onSubmit={onCreateWave}>
            <label>Warehouse<select value={waveForm.warehouseId} onChange={(e) => setWaveForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>Requisition IDs CSV<input value={waveForm.requisitionIdsCsv} onChange={(e) => setWaveForm((p) => ({ ...p, requisitionIdsCsv: e.target.value }))} placeholder="12,15" /></label>
            <button type="submit">Create Pick Wave</button>
          </form>
          <div className="table-wrap">
            <table><thead><tr><th>Wave</th><th>Warehouse</th><th>Status</th><th>Picked/Lines</th></tr></thead><tbody>{pickWaves.length === 0 ? <tr><td colSpan={4}>No waves.</td></tr> : pickWaves.slice(0, 20).map((w) => <tr key={w.id}><td>{w.wave_no}</td><td>{w.warehouse_name}</td><td>{w.status}</td><td>{w.picked_lines}/{w.line_count}</td></tr>)}</tbody></table>
          </div>
        </article>
      </div>

      <div className="summary-grid">
        <article className="card">
          <h3>Master Setup</h3>
          <form className="filters-grid" onSubmit={onCreateBin}>
            <label>Warehouse<select value={binForm.warehouseId} onChange={(e) => setBinForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>Bin Code<input value={binForm.binCode} onChange={(e) => setBinForm((p) => ({ ...p, binCode: e.target.value }))} /></label>
            <label>Bin Name<input value={binForm.binName} onChange={(e) => setBinForm((p) => ({ ...p, binName: e.target.value }))} /></label>
            <label>Zone<input value={binForm.zoneName} onChange={(e) => setBinForm((p) => ({ ...p, zoneName: e.target.value }))} /></label>
            <button type="submit">Create Bin</button>
          </form>
          <div className="table-wrap">
            <table><thead><tr><th>Warehouse</th><th>Bin Code</th><th>Bin Name</th><th>Zone</th></tr></thead><tbody>{bins.length === 0 ? <tr><td colSpan={4}>No bins.</td></tr> : bins.map((b) => <tr key={b.id}><td>{b.warehouse_name}</td><td>{b.bin_code}</td><td>{b.bin_name}</td><td>{b.zone_name || '-'}</td></tr>)}</tbody></table>
          </div>
        </article>

        <article className="card">
          <h3>Goods Receipt (GRN)</h3>
          <form className="filters-grid" onSubmit={onCreateGrn}>
            <label>Vendor<select value={grnForm.vendorId} onChange={(e) => setGrnForm((p) => ({ ...p, vendorId: e.target.value }))}><option value="">Optional</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}</select></label>
            <label>Warehouse<select value={grnForm.warehouseId} onChange={(e) => setGrnForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>Date<input type="date" value={grnForm.grnDate} onChange={(e) => setGrnForm((p) => ({ ...p, grnDate: e.target.value }))} /></label>
            <label>Item<select value={grnForm.itemId} onChange={(e) => setGrnForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku} - {i.item_name}</option>)}</select></label>
            <label>Bin<select value={grnForm.binId} onChange={(e) => setGrnForm((p) => ({ ...p, binId: e.target.value }))}><option value="">None</option>{bins.filter((b) => !grnForm.warehouseId || Number(b.warehouse_id) === Number(grnForm.warehouseId)).map((b) => <option key={b.id} value={b.id}>{b.bin_code}</option>)}</select></label>
            <label>Qty<input type="number" min="0.01" step="0.01" value={grnForm.qtyReceived} onChange={(e) => setGrnForm((p) => ({ ...p, qtyReceived: e.target.value }))} /></label>
            <label>Unit Cost<input type="number" min="0" step="0.0001" value={grnForm.unitCost} onChange={(e) => setGrnForm((p) => ({ ...p, unitCost: e.target.value }))} /></label>
            <label>Lot No<input value={grnForm.lotNo} onChange={(e) => setGrnForm((p) => ({ ...p, lotNo: e.target.value }))} /></label>
            <label>Expiry<input type="date" value={grnForm.expiryDate} onChange={(e) => setGrnForm((p) => ({ ...p, expiryDate: e.target.value }))} /></label>
            <label className="finance-ledger-notes">Notes<textarea rows={2} value={grnForm.notes} onChange={(e) => setGrnForm((p) => ({ ...p, notes: e.target.value }))} /></label>
            <button type="submit">Post GRN</button>
          </form>
          <div className="table-wrap">
            <table><thead><tr><th>GRN</th><th>Date</th><th>Warehouse</th><th>Vendor</th><th>Status</th></tr></thead><tbody>{grns.length === 0 ? <tr><td colSpan={5}>No GRNs.</td></tr> : grns.slice(0, 20).map((g) => <tr key={g.id}><td>{g.grn_no}</td><td>{dateOnly(g.grn_date)}</td><td>{g.warehouse_name}</td><td>{g.vendor_name || '-'}</td><td>{g.status}</td></tr>)}</tbody></table>
          </div>
        </article>
      </div>

      <div className="summary-grid">
        <article className="card">
          <h3>Issue / Transfer / Adjustment</h3>
          <form className="filters-grid" onSubmit={onIssue}>
            <h4>Issue</h4>
            <label>Item<select value={issueForm.itemId} onChange={(e) => setIssueForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku}</option>)}</select></label>
            <label>Warehouse<select value={issueForm.warehouseId} onChange={(e) => setIssueForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>Bin<select value={issueForm.binId} onChange={(e) => setIssueForm((p) => ({ ...p, binId: e.target.value }))}><option value="">None</option>{bins.filter((b) => !issueForm.warehouseId || Number(b.warehouse_id) === Number(issueForm.warehouseId)).map((b) => <option key={b.id} value={b.id}>{b.bin_code}</option>)}</select></label>
            <label>Qty<input type="number" min="0.01" step="0.01" value={issueForm.qty} onChange={(e) => setIssueForm((p) => ({ ...p, qty: e.target.value }))} /></label>
            <label>Unit Cost<input type="number" min="0" step="0.0001" value={issueForm.unitCost} onChange={(e) => setIssueForm((p) => ({ ...p, unitCost: e.target.value }))} /></label>
            <label>Ref No<input value={issueForm.referenceNo} onChange={(e) => setIssueForm((p) => ({ ...p, referenceNo: e.target.value }))} /></label>
            <label>Notes<input value={issueForm.notes} onChange={(e) => setIssueForm((p) => ({ ...p, notes: e.target.value }))} /></label>
            <button type="submit">Post Issue</button>
          </form>

          <form className="filters-grid" onSubmit={onTransfer}>
            <h4>Transfer</h4>
            <label>Item<select value={transferForm.itemId} onChange={(e) => setTransferForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku}</option>)}</select></label>
            <label>From Warehouse<select value={transferForm.fromWarehouseId} onChange={(e) => setTransferForm((p) => ({ ...p, fromWarehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>From Bin<select value={transferForm.fromBinId} onChange={(e) => setTransferForm((p) => ({ ...p, fromBinId: e.target.value }))}><option value="">None</option>{bins.filter((b) => !transferForm.fromWarehouseId || Number(b.warehouse_id) === Number(transferForm.fromWarehouseId)).map((b) => <option key={b.id} value={b.id}>{b.bin_code}</option>)}</select></label>
            <label>To Warehouse<select value={transferForm.toWarehouseId} onChange={(e) => setTransferForm((p) => ({ ...p, toWarehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>To Bin<select value={transferForm.toBinId} onChange={(e) => setTransferForm((p) => ({ ...p, toBinId: e.target.value }))}><option value="">None</option>{bins.filter((b) => !transferForm.toWarehouseId || Number(b.warehouse_id) === Number(transferForm.toWarehouseId)).map((b) => <option key={b.id} value={b.id}>{b.bin_code}</option>)}</select></label>
            <label>Qty<input type="number" min="0.01" step="0.01" value={transferForm.qty} onChange={(e) => setTransferForm((p) => ({ ...p, qty: e.target.value }))} /></label>
            <label>Unit Cost<input type="number" min="0" step="0.0001" value={transferForm.unitCost} onChange={(e) => setTransferForm((p) => ({ ...p, unitCost: e.target.value }))} /></label>
            <label>Notes<input value={transferForm.notes} onChange={(e) => setTransferForm((p) => ({ ...p, notes: e.target.value }))} /></label>
            <button type="submit">Post Transfer</button>
          </form>

          <form className="filters-grid" onSubmit={onAdjust}>
            <h4>Adjustment</h4>
            <label>Item<select value={adjustmentForm.itemId} onChange={(e) => setAdjustmentForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku}</option>)}</select></label>
            <label>Warehouse<select value={adjustmentForm.warehouseId} onChange={(e) => setAdjustmentForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>Bin<select value={adjustmentForm.binId} onChange={(e) => setAdjustmentForm((p) => ({ ...p, binId: e.target.value }))}><option value="">None</option>{bins.filter((b) => !adjustmentForm.warehouseId || Number(b.warehouse_id) === Number(adjustmentForm.warehouseId)).map((b) => <option key={b.id} value={b.id}>{b.bin_code}</option>)}</select></label>
            <label>Adjustment Qty (+/-)<input type="number" step="0.01" value={adjustmentForm.adjustmentQty} onChange={(e) => setAdjustmentForm((p) => ({ ...p, adjustmentQty: e.target.value }))} /></label>
            <label>Unit Cost<input type="number" min="0" step="0.0001" value={adjustmentForm.unitCost} onChange={(e) => setAdjustmentForm((p) => ({ ...p, unitCost: e.target.value }))} /></label>
            <label>Notes<input value={adjustmentForm.notes} onChange={(e) => setAdjustmentForm((p) => ({ ...p, notes: e.target.value }))} /></label>
            <button type="submit">Post Adjustment</button>
          </form>
        </article>

        <article className="card">
          <h3>Requisitions</h3>
          <form className="filters-grid" onSubmit={onCreateRequisition}>
            <label>Warehouse<select value={reqForm.warehouseId} onChange={(e) => setReqForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>Needed By<input type="date" value={reqForm.neededBy} onChange={(e) => setReqForm((p) => ({ ...p, neededBy: e.target.value }))} /></label>
            <label>Item<select value={reqForm.itemId} onChange={(e) => setReqForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku}</option>)}</select></label>
            <label>Bin<select value={reqForm.binId} onChange={(e) => setReqForm((p) => ({ ...p, binId: e.target.value }))}><option value="">None</option>{bins.filter((b) => !reqForm.warehouseId || Number(b.warehouse_id) === Number(reqForm.warehouseId)).map((b) => <option key={b.id} value={b.id}>{b.bin_code}</option>)}</select></label>
            <label>Qty<input type="number" min="0.01" step="0.01" value={reqForm.qtyRequested} onChange={(e) => setReqForm((p) => ({ ...p, qtyRequested: e.target.value }))} /></label>
            <label>Notes<input value={reqForm.notes} onChange={(e) => setReqForm((p) => ({ ...p, notes: e.target.value }))} /></label>
            <button type="submit">Create Requisition</button>
          </form>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Req No</th><th>Warehouse</th><th>Needed By</th><th>Status</th><th>Requester</th><th>Actions</th></tr></thead>
              <tbody>
                {requisitions.length === 0 ? <tr><td colSpan={6}>No requisitions.</td></tr> : requisitions.slice(0, 30).map((r) => (
                  <tr key={r.id}>
                    <td>{r.req_no}</td>
                    <td>{r.warehouse_name}</td>
                    <td>{dateOnly(r.needed_by)}</td>
                    <td>{r.status}</td>
                    <td>{r.requester_name || '-'}</td>
                    <td className="actions-cell">
                      {(r.status === 'OPEN') && <button type="button" className="button-secondary" onClick={() => approveRequisition(r.id)}>Approve</button>}
                      {(['APPROVED', 'PARTIAL'].includes(r.status)) && <button type="button" className="button-secondary" onClick={() => issueRequisition(r.id)}>Issue</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </div>

      <div className="summary-grid">
        <article className="card">
          <h3>Stock Balances</h3>
          <div className="table-wrap">
            <table><thead><tr><th>SKU</th><th>Name</th><th>Warehouse</th><th>Bin</th><th>On Hand</th><th>Reserved</th><th>Reorder</th></tr></thead><tbody>{balances.length === 0 ? <tr><td colSpan={7}>No balances.</td></tr> : balances.slice(0, 120).map((b) => <tr key={b.id}><td>{b.sku}</td><td>{b.item_name}</td><td>{b.warehouse_name}</td><td>{b.bin_code || '-'}</td><td>{money(b.qty_on_hand)}</td><td>{money(b.qty_reserved)}</td><td>{money(b.reorder_level || b.reorder_point)}</td></tr>)}</tbody></table>
          </div>
        </article>
      </div>

      <div className="summary-grid">
        <article className="card">
          <h3>Reorder Suggestions</h3>
          <div className="table-wrap">
            <table><thead><tr><th>SKU</th><th>Warehouse</th><th>On Hand</th><th>Reorder</th><th>Suggested Qty</th></tr></thead><tbody>{reorderSuggestions.length === 0 ? <tr><td colSpan={5}>No reorder gaps.</td></tr> : reorderSuggestions.slice(0, 50).map((s) => <tr key={`${s.item_id}-${s.warehouse_id}`}><td>{s.sku}</td><td>{s.warehouse_name}</td><td>{money(s.qty_on_hand)}</td><td>{money(s.reorder_level)}</td><td>{money(s.suggested_qty)}</td></tr>)}</tbody></table>
          </div>
        </article>

        <article className="card">
          <h3>Transaction Ledger</h3>
          <div className="table-wrap">
            <table><thead><tr><th>Time</th><th>Type</th><th>SKU</th><th>Warehouse</th><th>Bin</th><th>Direction</th><th>Qty</th><th>Ref</th></tr></thead><tbody>{transactions.length === 0 ? <tr><td colSpan={8}>No transactions.</td></tr> : transactions.slice(0, 80).map((t) => <tr key={t.id}><td>{String(t.created_at).slice(0, 16).replace('T', ' ')}</td><td>{t.txn_type}</td><td>{t.sku}</td><td>{t.warehouse_name}</td><td>{t.bin_code || '-'}</td><td>{t.direction}</td><td>{money(t.qty)}</td><td>{t.reference_no || '-'}</td></tr>)}</tbody></table>
          </div>
        </article>
      </div>
    </section>
  );
}
