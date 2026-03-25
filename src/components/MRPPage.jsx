import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { BarChartCard, DonutChartCard, LineChartCard } from './ReportingCharts';

function toMoney(value) {
  return Number(value || 0).toFixed(2);
}

function dateOnly(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

export default function MRPPage({ refreshSignal }) {
  const [message, setMessage] = useState('');
  const [dashboard, setDashboard] = useState({
    workOrders: { planned: 0, released: 0, in_progress: 0, done: 0, on_hold: 0 },
    shortages: { shortage_items: 0, shortage_qty: 0 },
    stock: { lot_count: 0, total_available_qty: 0 },
    workCenters: [],
  });
  const [items, setItems] = useState([]);
  const [boms, setBoms] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [shortages, setShortages] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [capacityCenters, setCapacityCenters] = useState([]);
  const [shopQueue, setShopQueue] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [replenishmentPlan, setReplenishmentPlan] = useState([]);
  const [integrations, setIntegrations] = useState({ connectors: [], runs: [] });
  const [traceability, setTraceability] = useState(null);

  const [itemForm, setItemForm] = useState({
    sku: '',
    itemName: '',
    uom: 'EA',
    itemType: 'RAW_MATERIAL',
    leadTimeDays: 0,
    reorderPoint: '',
    safetyStock: '',
    preferredVendor: '',
  });
  const [bomForm, setBomForm] = useState({
    itemId: '',
    bomName: '',
    componentItemId: '',
    qtyPer: '',
    scrapPct: '',
  });
  const [workOrderForm, setWorkOrderForm] = useState({
    itemId: '',
    bomId: '',
    qtyPlanned: '',
    dueDate: '',
    priorityRank: 10,
  });
  const [stockForm, setStockForm] = useState({
    itemId: '',
    warehouseId: '',
    lotNo: '',
    qty: '',
    unitCost: '',
    expiryDate: '',
    sourceRef: '',
  });
  const [purchaseSuggestionForm, setPurchaseSuggestionForm] = useState({
    itemId: '',
    suggestedQty: '',
    requiredDate: '',
    reason: '',
  });
  const [warehouseForm, setWarehouseForm] = useState({ warehouseCode: '', warehouseName: '', isDefault: false });
  const [forecastForm, setForecastForm] = useState({ itemId: '', forecastMonth: '', demandQty: '', confidencePct: 70, source: 'MANUAL' });
  const [integrationForm, setIntegrationForm] = useState({ providerName: '', connectorType: 'ECOMMERCE' });

  const loadAll = useCallback(async () => {
    const [dashboardRes, itemsRes, bomsRes, woRes, shortageRes, suggestionRes, warehouseRes, capacityRes, queueRes, forecastRes, replenishRes, integrationRes] = await Promise.all([
      api.get('/mrp/dashboard'),
      api.get('/mrp/items'),
      api.get('/mrp/boms'),
      api.get('/mrp/work-orders'),
      api.get('/mrp/shortages'),
      api.get('/mrp/purchase-suggestions'),
      api.get('/mrp/warehouses'),
      api.get('/mrp/planner/capacity'),
      api.get('/mrp/shop-floor/queue'),
      api.get('/mrp/planning/forecasts'),
      api.get('/mrp/planning/replenishment'),
      api.get('/mrp/integrations'),
    ]);
    setDashboard(dashboardRes.data || {});
    setItems(itemsRes.data?.items || []);
    setBoms(bomsRes.data?.boms || []);
    setWorkOrders(woRes.data?.workOrders || []);
    setShortages(shortageRes.data?.shortages || []);
    setSuggestions(suggestionRes.data?.suggestions || []);
    setWarehouses(warehouseRes.data?.warehouses || []);
    setCapacityCenters(capacityRes.data?.centers || []);
    setShopQueue(queueRes.data?.queue || []);
    setForecasts(forecastRes.data?.forecasts || []);
    setReplenishmentPlan(replenishRes.data?.plan || []);
    setIntegrations({
      connectors: integrationRes.data?.connectors || [],
      runs: integrationRes.data?.runs || [],
    });
  }, []);

  useEffect(() => {
    loadAll().catch((error) => {
      setMessage(error.response?.data?.message || 'Unable to load MRP data');
    });
  }, [loadAll, refreshSignal]);

  const workOrderMix = useMemo(() => [
    { label: 'Planned', value: Number(dashboard.workOrders?.planned || 0) },
    { label: 'Released', value: Number(dashboard.workOrders?.released || 0) },
    { label: 'In Progress', value: Number(dashboard.workOrders?.in_progress || 0) },
    { label: 'Done', value: Number(dashboard.workOrders?.done || 0) },
    { label: 'On Hold', value: Number(dashboard.workOrders?.on_hold || 0) },
  ], [dashboard.workOrders]);

  const centerLoad = useMemo(
    () => (dashboard.workCenters || []).map((row) => ({ label: row.center_name, value: Number(row.planned_load_hours || 0) })),
    [dashboard.workCenters]
  );

  const shortageTrend = useMemo(
    () => shortages.slice(0, 8).map((row) => ({ label: row.sku, value: Number(row.shortage_qty || 0) })),
    [shortages]
  );

  async function onCreateItem(event) {
    event.preventDefault();
    try {
      await api.post('/mrp/items', itemForm);
      setItemForm({
        sku: '',
        itemName: '',
        uom: 'EA',
        itemType: 'RAW_MATERIAL',
        leadTimeDays: 0,
        reorderPoint: '',
        safetyStock: '',
        preferredVendor: '',
      });
      setMessage('Item created');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create item');
    }
  }

  async function onCreateBom(event) {
    event.preventDefault();
    try {
      await api.post('/mrp/boms', {
        itemId: Number(bomForm.itemId),
        bomName: bomForm.bomName,
        lines: [
          {
            componentItemId: Number(bomForm.componentItemId),
            qtyPer: Number(bomForm.qtyPer || 0),
            scrapPct: Number(bomForm.scrapPct || 0),
          },
        ],
      });
      setBomForm({ itemId: '', bomName: '', componentItemId: '', qtyPer: '', scrapPct: '' });
      setMessage('BOM created');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create BOM');
    }
  }

  async function onCreateWorkOrder(event) {
    event.preventDefault();
    try {
      await api.post('/mrp/work-orders', {
        itemId: Number(workOrderForm.itemId),
        bomId: workOrderForm.bomId ? Number(workOrderForm.bomId) : null,
        qtyPlanned: Number(workOrderForm.qtyPlanned),
        dueDate: workOrderForm.dueDate || null,
        priorityRank: Number(workOrderForm.priorityRank || 10),
      });
      setWorkOrderForm({ itemId: '', bomId: '', qtyPlanned: '', dueDate: '', priorityRank: 10 });
      setMessage('Work order created');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create work order');
    }
  }

  async function onReceiveStock(event) {
    event.preventDefault();
    try {
      await api.post('/mrp/stock/receive', {
        itemId: Number(stockForm.itemId),
        warehouseId: stockForm.warehouseId ? Number(stockForm.warehouseId) : null,
        lotNo: stockForm.lotNo,
        qty: Number(stockForm.qty),
        unitCost: Number(stockForm.unitCost || 0),
        expiryDate: stockForm.expiryDate || null,
        sourceRef: stockForm.sourceRef || null,
      });
      setStockForm({ itemId: '', warehouseId: '', lotNo: '', qty: '', unitCost: '', expiryDate: '', sourceRef: '' });
      setMessage('Stock received');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to receive stock');
    }
  }

  async function onCreatePurchaseSuggestion(event) {
    event.preventDefault();
    try {
      await api.post('/mrp/purchase-suggestions', {
        itemId: Number(purchaseSuggestionForm.itemId),
        suggestedQty: Number(purchaseSuggestionForm.suggestedQty),
        requiredDate: purchaseSuggestionForm.requiredDate || null,
        reason: purchaseSuggestionForm.reason || '',
      });
      setPurchaseSuggestionForm({ itemId: '', suggestedQty: '', requiredDate: '', reason: '' });
      setMessage('Purchase suggestion created');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create purchase suggestion');
    }
  }

  async function onCreateWarehouse(event) {
    event.preventDefault();
    try {
      await api.post('/mrp/warehouses', warehouseForm);
      setWarehouseForm({ warehouseCode: '', warehouseName: '', isDefault: false });
      setMessage('Warehouse created');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create warehouse');
    }
  }

  async function onCreateForecast(event) {
    event.preventDefault();
    try {
      await api.post('/mrp/planning/forecasts', {
        itemId: Number(forecastForm.itemId),
        forecastMonth: forecastForm.forecastMonth,
        demandQty: Number(forecastForm.demandQty || 0),
        confidencePct: Number(forecastForm.confidencePct || 70),
        source: forecastForm.source,
      });
      setForecastForm({ itemId: '', forecastMonth: '', demandQty: '', confidencePct: 70, source: 'MANUAL' });
      setMessage('Forecast updated');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save forecast');
    }
  }

  async function createPoFromSuggestion(id) {
    try {
      await api.post(`/mrp/purchase-suggestions/${id}/create-po`);
      setMessage('Finance PO created from suggestion');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create PO from suggestion');
    }
  }

  async function autoCreatePo() {
    try {
      await api.post('/mrp/purchase-suggestions/auto-create-po', { limit: 50 });
      setMessage('Auto PO generation completed');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to auto-create POs');
    }
  }

  async function transitionOperation(operationId, action) {
    try {
      await api.post(`/mrp/shop-floor/operations/${operationId}/transition`, { action });
      setMessage(`Operation ${action} applied`);
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update operation status');
    }
  }

  async function createIntegration(event) {
    event.preventDefault();
    try {
      await api.post('/mrp/integrations', integrationForm);
      setIntegrationForm({ providerName: '', connectorType: 'ECOMMERCE' });
      setMessage('Integration connector created');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create integration');
    }
  }

  async function runIntegrationSync(id) {
    try {
      await api.post(`/mrp/integrations/${id}/sync`);
      setMessage('Integration sync completed');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to run integration sync');
    }
  }

  async function actionWorkOrder(id, action, payload = null) {
    try {
      await api.post(`/mrp/work-orders/${id}/${action}`, payload || {});
      setMessage(`Work order ${action} completed`);
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || `Unable to ${action} work order`);
    }
  }

  async function viewTraceability(id) {
    try {
      const { data } = await api.get(`/mrp/work-orders/${id}/traceability`);
      setTraceability(data);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to load traceability');
    }
  }

  async function runReprioritize() {
    try {
      const orderedIds = [...workOrders].sort((a, b) => Number(a.priority_rank || 9999) - Number(b.priority_rank || 9999)).map((wo) => wo.id);
      await api.post('/mrp/work-orders/reprioritize', { orderedIds });
      setMessage('Schedule priorities synced');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update priorities');
    }
  }

  return (
    <section className="module-page">
      <div className="module-hero">
        <div>
          <p className="module-kicker">Material Planning</p>
          <h2>MRP Command Center</h2>
          <p className="module-subtitle">Supply, capacity, shortages, and replenishment aligned to the same application shell.</p>
        </div>
      </div>
      {message && <p className="form-hint">{message}</p>}

      <div className="summary-grid">
        <DonutChartCard title="Work Order Mix" data={workOrderMix} totalLabel="WO" />
        <BarChartCard title="Work Center Planned Load" data={centerLoad} yLabel="Planned hours" format="number" />
        <LineChartCard title="Top Shortage SKU Trend" points={shortageTrend} format="number" />
      </div>

      <div className="summary-grid">
        <article className="card"><h4>Shortage Items</h4><p className="metric">{Number(dashboard.shortages?.shortage_items || 0)}</p></article>
        <article className="card"><h4>Shortage Qty</h4><p className="metric">{toMoney(dashboard.shortages?.shortage_qty || 0)}</p></article>
        <article className="card"><h4>Stock Lots</h4><p className="metric">{Number(dashboard.stock?.lot_count || 0)}</p></article>
        <article className="card"><h4>Total Available Qty</h4><p className="metric">{toMoney(dashboard.stock?.total_available_qty || 0)}</p></article>
      </div>

      <div className="summary-grid">
        <article className="card">
          <h3>Item Master</h3>
          <form className="filters-grid" onSubmit={onCreateItem}>
            <label>SKU<input value={itemForm.sku} onChange={(e) => setItemForm((p) => ({ ...p, sku: e.target.value }))} /></label>
            <label>Name<input value={itemForm.itemName} onChange={(e) => setItemForm((p) => ({ ...p, itemName: e.target.value }))} /></label>
            <label>UOM<input value={itemForm.uom} onChange={(e) => setItemForm((p) => ({ ...p, uom: e.target.value }))} /></label>
            <label>Type<select value={itemForm.itemType} onChange={(e) => setItemForm((p) => ({ ...p, itemType: e.target.value }))}><option value="RAW_MATERIAL">RAW_MATERIAL</option><option value="SUBASSEMBLY">SUBASSEMBLY</option><option value="FINISHED_GOOD">FINISHED_GOOD</option><option value="CONSUMABLE">CONSUMABLE</option></select></label>
            <label>Lead Time Days<input type="number" min="0" value={itemForm.leadTimeDays} onChange={(e) => setItemForm((p) => ({ ...p, leadTimeDays: e.target.value }))} /></label>
            <label>Reorder Point<input type="number" min="0" step="0.01" value={itemForm.reorderPoint} onChange={(e) => setItemForm((p) => ({ ...p, reorderPoint: e.target.value }))} /></label>
            <label>Safety Stock<input type="number" min="0" step="0.01" value={itemForm.safetyStock} onChange={(e) => setItemForm((p) => ({ ...p, safetyStock: e.target.value }))} /></label>
            <label>Preferred Vendor<input value={itemForm.preferredVendor} onChange={(e) => setItemForm((p) => ({ ...p, preferredVendor: e.target.value }))} /></label>
            <button type="submit">Create Item</button>
          </form>
          <div className="table-wrap">
            <table><thead><tr><th>SKU</th><th>Name</th><th>Type</th><th>Available</th><th>Reorder</th></tr></thead><tbody>{items.length === 0 ? <tr><td colSpan={5}>No items.</td></tr> : items.slice(0, 20).map((i) => <tr key={i.id}><td>{i.sku}</td><td>{i.item_name}</td><td>{i.item_type}</td><td>{toMoney(i.qty_available)}</td><td>{toMoney(i.reorder_point)}</td></tr>)}</tbody></table>
          </div>
        </article>

        <article className="card">
          <h3>BOM Designer</h3>
          <form className="filters-grid" onSubmit={onCreateBom}>
            <label>Finished Item<select value={bomForm.itemId} onChange={(e) => setBomForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku} - {i.item_name}</option>)}</select></label>
            <label>BOM Name<input value={bomForm.bomName} onChange={(e) => setBomForm((p) => ({ ...p, bomName: e.target.value }))} /></label>
            <label>Component<select value={bomForm.componentItemId} onChange={(e) => setBomForm((p) => ({ ...p, componentItemId: e.target.value }))}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku} - {i.item_name}</option>)}</select></label>
            <label>Qty/Unit<input type="number" min="0.0001" step="0.0001" value={bomForm.qtyPer} onChange={(e) => setBomForm((p) => ({ ...p, qtyPer: e.target.value }))} /></label>
            <label>Scrap %<input type="number" min="0" step="0.001" value={bomForm.scrapPct} onChange={(e) => setBomForm((p) => ({ ...p, scrapPct: e.target.value }))} /></label>
            <button type="submit">Create BOM</button>
          </form>
          <div className="table-wrap">
            <table><thead><tr><th>Item</th><th>BOM</th><th>Version</th><th>Lines</th></tr></thead><tbody>{boms.length === 0 ? <tr><td colSpan={4}>No BOMs.</td></tr> : boms.slice(0, 20).map((b) => <tr key={b.id}><td>{b.item_sku}</td><td>{b.bom_name}</td><td>{b.version_no}</td><td>{(b.lines || []).length}</td></tr>)}</tbody></table>
          </div>
        </article>
      </div>

      <div className="summary-grid">
        <article className="card">
          <h3>Make Schedule</h3>
          <form className="filters-grid" onSubmit={onCreateWorkOrder}>
            <label>Item<select value={workOrderForm.itemId} onChange={(e) => setWorkOrderForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku} - {i.item_name}</option>)}</select></label>
            <label>BOM<select value={workOrderForm.bomId} onChange={(e) => setWorkOrderForm((p) => ({ ...p, bomId: e.target.value }))}><option value="">Default</option>{boms.map((b) => <option key={b.id} value={b.id}>{b.item_sku} - {b.bom_name}</option>)}</select></label>
            <label>Qty<input type="number" min="0.01" step="0.01" value={workOrderForm.qtyPlanned} onChange={(e) => setWorkOrderForm((p) => ({ ...p, qtyPlanned: e.target.value }))} /></label>
            <label>Due Date<input type="date" value={workOrderForm.dueDate} onChange={(e) => setWorkOrderForm((p) => ({ ...p, dueDate: e.target.value }))} /></label>
            <label>Priority<input type="number" min="1" value={workOrderForm.priorityRank} onChange={(e) => setWorkOrderForm((p) => ({ ...p, priorityRank: e.target.value }))} /></label>
            <button type="submit">Create Work Order</button>
          </form>
          <p className="form-hint">Edit priority directly in the table, then click sync.</p>
          <button type="button" onClick={runReprioritize}>Sync Priorities</button>
          <div className="table-wrap">
            <table>
              <thead><tr><th>WO</th><th>Item</th><th>Status</th><th>Priority</th><th>Due</th><th>Planned</th><th>Completed</th><th>Actions</th></tr></thead>
              <tbody>
                {workOrders.length === 0 ? <tr><td colSpan={8}>No work orders.</td></tr> : workOrders.slice(0, 30).map((wo) => (
                  <tr key={wo.id}>
                    <td>{wo.wo_no}</td>
                    <td>{wo.item_sku}</td>
                    <td>{wo.status}</td>
                    <td>
                      <input
                        type="number"
                        min="1"
                        value={wo.priority_rank}
                        onChange={(e) => setWorkOrders((prev) => prev.map((row) => (row.id === wo.id ? { ...row, priority_rank: Number(e.target.value || 9999) } : row)))}
                        style={{ width: 72 }}
                      />
                    </td>
                    <td>{dateOnly(wo.due_date)}</td>
                    <td>{toMoney(wo.qty_planned)}</td>
                    <td>{toMoney(wo.qty_completed)}</td>
                    <td className="actions-cell">
                      <button type="button" className="button-secondary" onClick={() => actionWorkOrder(wo.id, 'release')}>Release</button>
                      <button type="button" className="button-secondary" onClick={() => actionWorkOrder(wo.id, 'start')}>Start</button>
                      <button type="button" className="button-secondary" onClick={() => actionWorkOrder(wo.id, 'complete', { qtyCompleted: Number(wo.qty_planned || 0) })}>Complete</button>
                      <button type="button" className="button-secondary" onClick={() => viewTraceability(wo.id)}>Trace</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <h3>Inventory + Purchasing</h3>
          <form className="filters-grid" onSubmit={onReceiveStock}>
            <label>Item<select value={stockForm.itemId} onChange={(e) => setStockForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku}</option>)}</select></label>
            <label>Warehouse<select value={stockForm.warehouseId} onChange={(e) => setStockForm((p) => ({ ...p, warehouseId: e.target.value }))}><option value="">Default</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.warehouse_name}</option>)}</select></label>
            <label>Lot No<input value={stockForm.lotNo} onChange={(e) => setStockForm((p) => ({ ...p, lotNo: e.target.value }))} /></label>
            <label>Qty<input type="number" min="0.01" step="0.01" value={stockForm.qty} onChange={(e) => setStockForm((p) => ({ ...p, qty: e.target.value }))} /></label>
            <label>Unit Cost<input type="number" min="0" step="0.0001" value={stockForm.unitCost} onChange={(e) => setStockForm((p) => ({ ...p, unitCost: e.target.value }))} /></label>
            <label>Expiry<input type="date" value={stockForm.expiryDate} onChange={(e) => setStockForm((p) => ({ ...p, expiryDate: e.target.value }))} /></label>
            <label>Source Ref<input value={stockForm.sourceRef} onChange={(e) => setStockForm((p) => ({ ...p, sourceRef: e.target.value }))} /></label>
            <button type="submit">Receive Stock</button>
          </form>

          <form className="filters-grid" onSubmit={onCreatePurchaseSuggestion}>
            <label>Item<select value={purchaseSuggestionForm.itemId} onChange={(e) => setPurchaseSuggestionForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku}</option>)}</select></label>
            <label>Qty<input type="number" min="0.01" step="0.01" value={purchaseSuggestionForm.suggestedQty} onChange={(e) => setPurchaseSuggestionForm((p) => ({ ...p, suggestedQty: e.target.value }))} /></label>
            <label>Required Date<input type="date" value={purchaseSuggestionForm.requiredDate} onChange={(e) => setPurchaseSuggestionForm((p) => ({ ...p, requiredDate: e.target.value }))} /></label>
            <label className="finance-ledger-notes">Reason<textarea rows={2} value={purchaseSuggestionForm.reason} onChange={(e) => setPurchaseSuggestionForm((p) => ({ ...p, reason: e.target.value }))} /></label>
            <button type="submit">Add Suggestion</button>
          </form>

          <h4>Shortage Queue</h4>
          <div className="table-wrap">
            <table><thead><tr><th>SKU</th><th>Required</th><th>Available</th><th>Shortage</th><th>Need By</th></tr></thead><tbody>{shortages.length === 0 ? <tr><td colSpan={5}>No shortages.</td></tr> : shortages.map((s) => <tr key={s.item_id}><td>{s.sku}</td><td>{toMoney(s.required_qty)}</td><td>{toMoney(s.available_qty)}</td><td>{toMoney(s.shortage_qty)}</td><td>{dateOnly(s.earliest_due_date)}</td></tr>)}</tbody></table>
          </div>
          <h4>Purchase Suggestions</h4>
          <button type="button" onClick={autoCreatePo}>Auto Create Finance POs</button>
          <div className="table-wrap">
            <table><thead><tr><th>Item</th><th>Qty</th><th>Need By</th><th>Status</th><th>PO</th><th>Reason</th><th>Action</th></tr></thead><tbody>{suggestions.length === 0 ? <tr><td colSpan={7}>No suggestions.</td></tr> : suggestions.slice(0, 20).map((s) => <tr key={s.id}><td>{s.sku}</td><td>{toMoney(s.suggested_qty)}</td><td>{dateOnly(s.required_date)}</td><td>{s.status}</td><td>{s.po_number || '-'}</td><td>{s.reason}</td><td>{s.status === 'OPEN' ? <button type="button" className="button-secondary" onClick={() => createPoFromSuggestion(s.id)}>Create PO</button> : '-'}</td></tr>)}</tbody></table>
          </div>
        </article>
      </div>

      <div className="summary-grid">
        <article className="card">
          <h3>Warehouses</h3>
          <form className="filters-grid" onSubmit={onCreateWarehouse}>
            <label>Code<input value={warehouseForm.warehouseCode} onChange={(e) => setWarehouseForm((p) => ({ ...p, warehouseCode: e.target.value }))} /></label>
            <label>Name<input value={warehouseForm.warehouseName} onChange={(e) => setWarehouseForm((p) => ({ ...p, warehouseName: e.target.value }))} /></label>
            <label>Default<select value={warehouseForm.isDefault ? 'yes' : 'no'} onChange={(e) => setWarehouseForm((p) => ({ ...p, isDefault: e.target.value === 'yes' }))}><option value="no">No</option><option value="yes">Yes</option></select></label>
            <button type="submit">Create Warehouse</button>
          </form>
          <div className="table-wrap">
            <table><thead><tr><th>Code</th><th>Name</th><th>Default</th><th>Available Qty</th></tr></thead><tbody>{warehouses.length === 0 ? <tr><td colSpan={4}>No warehouses.</td></tr> : warehouses.map((w) => <tr key={w.id}><td>{w.warehouse_code}</td><td>{w.warehouse_name}</td><td>{w.is_default ? 'Yes' : 'No'}</td><td>{toMoney(w.total_available_qty)}</td></tr>)}</tbody></table>
          </div>
        </article>

        <article className="card">
          <h3>Capacity Planner</h3>
          <div className="table-wrap">
            <table><thead><tr><th>Center</th><th>Effective Daily Hrs</th><th>Open Load Hrs</th><th>Load Days</th></tr></thead><tbody>{capacityCenters.length === 0 ? <tr><td colSpan={4}>No centers.</td></tr> : capacityCenters.map((c) => <tr key={c.id}><td>{c.center_name}</td><td>{toMoney(c.effectiveDailyHours)}</td><td>{toMoney(c.openLoadHours)}</td><td>{toMoney(c.loadDays)}</td></tr>)}</tbody></table>
          </div>
        </article>
      </div>

      <div className="summary-grid">
        <article className="card">
          <h3>Shop Floor Queue</h3>
          <div className="table-wrap">
            <table><thead><tr><th>WO</th><th>SKU</th><th>Operation</th><th>Status</th><th>Planned Hrs</th><th>Actions</th></tr></thead><tbody>{shopQueue.length === 0 ? <tr><td colSpan={6}>No shop floor operations.</td></tr> : shopQueue.slice(0, 30).map((q) => <tr key={q.id}><td>{q.wo_no}</td><td>{q.sku}</td><td>{q.operation_name}</td><td>{q.status}</td><td>{toMoney(q.planned_hours)}</td><td className="actions-cell"><button type="button" className="button-secondary" onClick={() => transitionOperation(q.id, 'START')}>Start</button><button type="button" className="button-secondary" onClick={() => transitionOperation(q.id, 'PAUSE')}>Pause</button><button type="button" className="button-secondary" onClick={() => transitionOperation(q.id, 'RESUME')}>Resume</button><button type="button" className="button-secondary" onClick={() => transitionOperation(q.id, 'COMPLETE')}>Complete</button></td></tr>)}</tbody></table>
          </div>
        </article>

        <article className="card">
          <h3>Demand + Replenishment</h3>
          <form className="filters-grid" onSubmit={onCreateForecast}>
            <label>Item<select value={forecastForm.itemId} onChange={(e) => setForecastForm((p) => ({ ...p, itemId: e.target.value }))}><option value="">Select</option>{items.map((i) => <option key={i.id} value={i.id}>{i.sku}</option>)}</select></label>
            <label>Forecast Month<input type="date" value={forecastForm.forecastMonth} onChange={(e) => setForecastForm((p) => ({ ...p, forecastMonth: e.target.value }))} /></label>
            <label>Demand Qty<input type="number" min="0" step="0.01" value={forecastForm.demandQty} onChange={(e) => setForecastForm((p) => ({ ...p, demandQty: e.target.value }))} /></label>
            <label>Confidence %<input type="number" min="0" max="100" step="0.01" value={forecastForm.confidencePct} onChange={(e) => setForecastForm((p) => ({ ...p, confidencePct: e.target.value }))} /></label>
            <button type="submit">Save Forecast</button>
          </form>
          <div className="table-wrap">
            <table><thead><tr><th>SKU</th><th>Month</th><th>Demand</th><th>Confidence</th></tr></thead><tbody>{forecasts.length === 0 ? <tr><td colSpan={4}>No forecasts.</td></tr> : forecasts.slice(0, 20).map((f) => <tr key={f.id}><td>{f.sku}</td><td>{dateOnly(f.forecast_month)}</td><td>{toMoney(f.demand_qty)}</td><td>{toMoney(f.confidence_pct)}%</td></tr>)}</tbody></table>
          </div>
          <h4>3-Month Replenishment Plan</h4>
          <div className="table-wrap">
            <table><thead><tr><th>SKU</th><th>Forecast</th><th>On Hand</th><th>Incoming</th><th>Recommended Buy</th></tr></thead><tbody>{replenishmentPlan.length === 0 ? <tr><td colSpan={5}>No plan.</td></tr> : replenishmentPlan.slice(0, 20).map((p) => <tr key={p.item_id}><td>{p.sku}</td><td>{toMoney(p.forecast_3m_qty)}</td><td>{toMoney(p.on_hand_qty)}</td><td>{toMoney(p.incoming_qty)}</td><td>{toMoney(p.recommended_buy_qty)}</td></tr>)}</tbody></table>
          </div>
        </article>
      </div>

      <article className="card">
        <h3>Integrations</h3>
        <form className="filters-grid" onSubmit={createIntegration}>
          <label>Provider<input value={integrationForm.providerName} onChange={(e) => setIntegrationForm((p) => ({ ...p, providerName: e.target.value }))} /></label>
          <label>Type<select value={integrationForm.connectorType} onChange={(e) => setIntegrationForm((p) => ({ ...p, connectorType: e.target.value }))}><option value="ECOMMERCE">ECOMMERCE</option><option value="ACCOUNTING">ACCOUNTING</option><option value="WMS">WMS</option><option value="API">API</option></select></label>
          <button type="submit">Add Connector</button>
        </form>
        <div className="summary-grid">
          <div className="table-wrap">
            <table><thead><tr><th>Provider</th><th>Type</th><th>Status</th><th>Action</th></tr></thead><tbody>{integrations.connectors.length === 0 ? <tr><td colSpan={4}>No connectors.</td></tr> : integrations.connectors.map((c) => <tr key={c.id}><td>{c.provider_name}</td><td>{c.connector_type}</td><td>{c.status}</td><td><button type="button" className="button-secondary" onClick={() => runIntegrationSync(c.id)}>Run Sync</button></td></tr>)}</tbody></table>
          </div>
          <div className="table-wrap">
            <table><thead><tr><th>Provider</th><th>Pulled</th><th>Pushed</th><th>Status</th><th>At</th></tr></thead><tbody>{integrations.runs.length === 0 ? <tr><td colSpan={5}>No sync runs.</td></tr> : integrations.runs.slice(0, 20).map((r) => <tr key={r.id}><td>{r.provider_name}</td><td>{r.records_pulled}</td><td>{r.records_pushed}</td><td>{r.status}</td><td>{dateOnly(r.created_at)}</td></tr>)}</tbody></table>
          </div>
        </div>
      </article>

      {traceability && (
        <article className="card">
          <h3>Traceability: {traceability.workOrder?.wo_no}</h3>
          <div className="summary-grid">
            <div className="table-wrap">
              <h4>Input Lots</h4>
              <table><thead><tr><th>SKU</th><th>Lot</th><th>Reserved</th><th>Consumed</th><th>Status</th></tr></thead><tbody>{(traceability.inputs || []).length === 0 ? <tr><td colSpan={5}>No inputs.</td></tr> : traceability.inputs.map((r) => <tr key={r.id}><td>{r.sku}</td><td>{r.lot_no || '-'}</td><td>{toMoney(r.qty_reserved)}</td><td>{toMoney(r.qty_consumed)}</td><td>{r.status}</td></tr>)}</tbody></table>
            </div>
            <div className="table-wrap">
              <h4>Output Lots</h4>
              <table><thead><tr><th>Lot</th><th>Received</th><th>Available</th><th>Source</th></tr></thead><tbody>{(traceability.outputs || []).length === 0 ? <tr><td colSpan={4}>No outputs.</td></tr> : traceability.outputs.map((o) => <tr key={o.id}><td>{o.lot_no}</td><td>{toMoney(o.qty_received)}</td><td>{toMoney(o.qty_available)}</td><td>{o.source_type}</td></tr>)}</tbody></table>
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
