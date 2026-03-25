import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';

export default function StageScanner({ onScanned, stageAccess, stageName }) {
  const [barcode, setBarcode] = useState('');
  const [moveBackReason, setMoveBackReason] = useState({});
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ total_in_stage: 0, completed_today: 0 });
  const [completedTodayItems, setCompletedTodayItems] = useState([]);
  const [customPatternTodayItems, setCustomPatternTodayItems] = useState([]);
  const [customPatternTotalItems, setCustomPatternTotalItems] = useState([]);
  const [message, setMessage] = useState('');
  const stageNameByAccess = {
    1: 'Verification',
    2: 'Model Room',
    3: 'Cutting',
    4: 'Closing',
    5: 'Sole',
    6: 'Lasting',
    7: 'Finishing',
    8: 'QC',
    9: 'Packing',
    10: 'Embroidery',
    11: 'Laser',
    12: 'Bespoke',
  };
  const currentStageName = stageName || stageNameByAccess[Number(stageAccess)] || '';
  const isCuttingStage = currentStageName === 'Cutting';
  const isClosingStage = currentStageName === 'Closing';
  const isModelRoomStage = currentStageName === 'Model Room';
  const today = new Date();
  const todayYmd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  function isLate(item) {
    const due = item?.due_date?.slice(0, 10);
    if (!due) return false;
    return due < todayYmd;
  }

  const latePairs = items.filter((item) => isLate(item)).length;
  const redoPairs = items.filter((item) => Boolean(item.is_redo)).length;
  const holdCustomerItems = items.filter((item) => item.status === 'HOLD_CUSTOMER');
  const holdSalesItems = items.filter((item) => item.status === 'HOLD_SALES');
  const customPatternItems = items.filter((item) => Boolean(item.custom_pattern));
  const nextStageByName = {
    Verification: 'Flow-based next stage',
    Bespoke: 'Model Room',
    Embroidery: 'Closing',
    Laser: 'Closing',
    'Model Room': 'Cutting',
    Cutting: 'Closing',
    Closing: 'Sole',
    Sole: 'Lasting',
    Lasting: 'Finishing',
    Finishing: 'QC',
    QC: 'Packing',
    Packing: 'Completed',
  };
  const nextStageName = nextStageByName[currentStageName] || 'Next Stage';

  async function loadAssigned() {
    const { data } = await api.get('/production/assigned');
    setItems(data.items || []);
  }

  async function loadSummary() {
    const { data } = await api.get('/production/summary');
    setSummary(data || { total_in_stage: 0, completed_today: 0 });
  }

  async function loadCompletedTodayItems() {
    const { data } = await api.get('/production/completed-today');
    setCompletedTodayItems(data.items || []);
  }

  const loadCustomPatternItems = useCallback(async () => {
    if (!isModelRoomStage) {
      setCustomPatternTodayItems([]);
      setCustomPatternTotalItems([]);
      return;
    }
    const [todayRes, totalRes] = await Promise.all([
      api.get('/production/custom-pattern?scope=today'),
      api.get('/production/custom-pattern?scope=all'),
    ]);
    setCustomPatternTodayItems(todayRes.data.items || []);
    setCustomPatternTotalItems(totalRes.data.items || []);
  }, [isModelRoomStage]);

  useEffect(() => {
    loadAssigned();
    loadSummary();
    loadCompletedTodayItems();
    loadCustomPatternItems();
  }, [loadCustomPatternItems]);

  async function onSubmit(event) {
    event.preventDefault();
    try {
      const { data } = await api.post('/production/scan', { barcode });
      setMessage(`Order ${data.order.production_order_no} moved to ${data.toStageName || 'next stage'}`);
      setBarcode('');
      loadAssigned();
      loadSummary();
      loadCompletedTodayItems();
      loadCustomPatternItems();
      if (onScanned) onScanned(data);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Scan failed');
    }
  }

  async function moveToClosing(orderId) {
    try {
      const { data } = await api.post('/production/advance', { orderId });
      setMessage(`Order ${data.order.production_order_no} moved to ${data.toStageName || 'next stage'}`);
      loadAssigned();
      loadSummary();
      loadCompletedTodayItems();
      loadCustomPatternItems();
      if (onScanned) onScanned();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to move order');
    }
  }

  async function moveBack(orderId) {
    try {
      const reason = moveBackReason[orderId] || '';
      if (!reason.trim()) {
        setMessage('Move back reason is required');
        return;
      }

      const { data } = await api.post('/production/move-back', { orderId, reason });
      setMessage(`Order ${data.order.production_order_no} moved back to ${data.toStageName || 'previous stage'}`);
      setMoveBackReason((prev) => ({ ...prev, [orderId]: '' }));
      loadAssigned();
      loadSummary();
      loadCompletedTodayItems();
      loadCustomPatternItems();
      if (onScanned) onScanned();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to move back order');
    }
  }

  async function markMtoSoleComplete(orderId) {
    try {
      const { data } = await api.post('/production/mto/sole-complete', { orderId });
      setMessage(`Order ${data.order.production_order_no} marked: MTO Sole Completed`);
      loadAssigned();
      loadSummary();
      loadCompletedTodayItems();
      loadCustomPatternItems();
      if (onScanned) onScanned();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to mark MTO sole completion');
    }
  }

  async function toggleCustomPattern(orderId, currentValue) {
    try {
      if (currentValue) {
        setMessage('Custom Pattern already marked for this order');
        return;
      }
      const { data } = await api.post('/production/model-room/custom-pattern', { orderId });
      setMessage(`Order ${data.order.production_order_no} custom pattern enabled`);
      loadAssigned();
      loadSummary();
      loadCompletedTodayItems();
      if (onScanned) onScanned();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update custom pattern');
    }
  }

  function exportCurrentCountCsv() {
    const safeStage = String(stageName || 'stage').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    exportItemsCsv(items, `${safeStage}-current-count.csv`);
  }

  function exportCompletedTodayCsv() {
    const safeStage = String(stageName || 'stage').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    exportItemsCsv(completedTodayItems, `${safeStage}-completed-today.csv`);
  }

  function exportLatePairsCsv() {
    const safeStage = String(stageName || 'stage').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const lateItems = items.filter((item) => isLate(item));
    exportItemsCsv(lateItems, `${safeStage}-late-pairs.csv`);
  }

  function exportRedoPairsCsv() {
    const safeStage = String(stageName || 'stage').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    const redoItems = items.filter((item) => Boolean(item.is_redo));
    exportItemsCsv(redoItems, `${safeStage}-redo-pairs.csv`);
  }

  function exportHoldCustomerCsv() {
    const safeStage = String(stageName || 'stage').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    exportItemsCsv(holdCustomerItems, `${safeStage}-hold-customer.csv`);
  }

  function exportHoldSalesCsv() {
    const safeStage = String(stageName || 'stage').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    exportItemsCsv(holdSalesItems, `${safeStage}-hold-sales.csv`);
  }

  function exportCustomPatternCurrentCsv() {
    const safeStage = String(stageName || 'stage').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    exportItemsCsv(customPatternItems, `${safeStage}-custom-pattern-current.csv`);
  }

  function exportCustomPatternTodayCsv() {
    const safeStage = String(stageName || 'stage').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    exportItemsCsv(customPatternTodayItems, `${safeStage}-custom-pattern-today.csv`);
  }

  function exportCustomPatternTotalCsv() {
    const safeStage = String(stageName || 'stage').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    exportItemsCsv(customPatternTotalItems, `${safeStage}-custom-pattern-total.csv`);
  }

  function exportItemsCsv(sourceItems, filename) {
    const header = 'Order Number,Delivery Date';
    const rows = sourceItems.map((item) => {
      const orderNo = String(item.production_order_no || '').replace(/"/g, '""');
      const deliveryDate = item.due_date?.slice(0, 10) || '';
      return `"${orderNo}","${deliveryDate}"`;
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section className="card">
      <h3>{stageName ? `${stageName} Scanner` : 'Stage Barcode Scanner'}</h3>
      <p style={{ marginTop: 0, color: '#4b5563' }}>
        Scan barcode to move order to <strong>{nextStageName}</strong>.
      </p>
      {currentStageName === 'Model Room' && (
        <p style={{ marginTop: 0, color: '#4b5563' }}>
          For <strong>MTO</strong> flow, this action starts <strong>Cutting + Sole</strong> together.
        </p>
      )}
      <form onSubmit={onSubmit} className="scanner-row">
        <input
          placeholder="Scan barcode"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          autoFocus
        />
        <button type="submit">Scan &amp; Move To {nextStageName}</button>
      </form>
      {message && <p>{message}</p>}
      <div className="summary-grid">
        <article className="card">
          <div className="metric-card-head">
            <h4>Current Count</h4>
            <button type="button" className="button-secondary metric-export-btn" onClick={exportCurrentCountCsv}>
              Export CSV
            </button>
          </div>
          <p className="metric">{items.length}</p>
        </article>
        <article className="card">
          <div className="metric-card-head">
            <h4>Completed Today</h4>
            <button type="button" className="button-secondary metric-export-btn" onClick={exportCompletedTodayCsv}>
              Export CSV
            </button>
          </div>
          <p className="metric">{summary.completed_today || 0}</p>
        </article>
        <article className="card">
          <div className="metric-card-head">
            <h4>Late Pairs</h4>
            <button type="button" className="button-secondary metric-export-btn" onClick={exportLatePairsCsv}>
              Export CSV
            </button>
          </div>
          <p className="metric">{latePairs}</p>
        </article>
        <article className="card">
          <div className="metric-card-head">
            <h4>Redo Count</h4>
            <button type="button" className="button-secondary metric-export-btn" onClick={exportRedoPairsCsv}>
              Export CSV
            </button>
          </div>
          <p className="metric">{redoPairs}</p>
        </article>
        {isModelRoomStage && (
          <article className="card">
            <div className="metric-card-head">
              <h4>Custom Pattern</h4>
              <button type="button" className="button-secondary metric-export-btn" onClick={exportCustomPatternCurrentCsv}>
                Export CSV
              </button>
            </div>
            <p className="metric">{customPatternItems.length}</p>
          </article>
        )}
        {isModelRoomStage && (
          <article className="card">
            <div className="metric-card-head">
              <h4>Custom Made Today</h4>
              <button type="button" className="button-secondary metric-export-btn" onClick={exportCustomPatternTodayCsv}>
                Export CSV
              </button>
            </div>
            <p className="metric">{summary.custom_pattern_marked_today || 0}</p>
          </article>
        )}
        {isModelRoomStage && (
          <article className="card">
            <div className="metric-card-head">
              <h4>Custom Made Total</h4>
              <button type="button" className="button-secondary metric-export-btn" onClick={exportCustomPatternTotalCsv}>
                Export CSV
              </button>
            </div>
            <p className="metric">{summary.custom_pattern_marked_total || 0}</p>
          </article>
        )}
        {currentStageName === 'Verification' && (
          <article className="card">
            <div className="metric-card-head">
              <h4>Hold (Customer)</h4>
              <button type="button" className="button-secondary metric-export-btn" onClick={exportHoldCustomerCsv}>
                Export CSV
              </button>
            </div>
            <p className="metric">{holdCustomerItems.length}</p>
          </article>
        )}
        {currentStageName === 'Verification' && (
          <article className="card">
            <div className="metric-card-head">
              <h4>Hold (Sales)</h4>
              <button type="button" className="button-secondary metric-export-btn" onClick={exportHoldSalesCsv}>
                Export CSV
              </button>
            </div>
            <p className="metric">{holdSalesItems.length}</p>
          </article>
        )}
      </div>

      <h4>Items Assigned To Your Stage</h4>
      {!isCuttingStage && !isModelRoomStage && (
        <ul className="assigned-list">
          {items.map((item) => (
            <li key={item.order_id}>
              {item.production_order_no} | {item.customer_name} | {item.barcode} | Due: {item.due_date?.slice(0, 10)} | Late: {isLate(item) ? 'Yes' : 'No'} | Redo: {item.is_redo ? 'Yes' : 'No'}
            </li>
          ))}
        </ul>
      )}

      {(isCuttingStage || isClosingStage || isModelRoomStage) && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Barcode</th>
                <th>Due Date</th>
                <th>Late</th>
                <th>Redo</th>
                {isModelRoomStage && <th>Custom Pattern</th>}
                <th>Flow</th>
                <th>MTO Sole</th>
                {(isCuttingStage || isClosingStage) && <th>Send Back Reason</th>}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.order_id}>
                  <td>{item.production_order_no}</td>
                  <td>{item.customer_name}</td>
                  <td>{item.barcode}</td>
                  <td>{item.due_date?.slice(0, 10)}</td>
                  <td>{isLate(item) ? 'Yes' : 'No'}</td>
                  <td>{item.is_redo ? 'Yes' : 'No'}</td>
                  {isModelRoomStage && <td>{item.custom_pattern ? 'Yes' : 'No'}</td>}
                  <td>{item.production_flow}</td>
                  <td>{item.production_flow === 'MTO' ? (item.mto_sole_done ? 'Completed' : 'Pending') : '-'}</td>
                  {(isCuttingStage || isClosingStage) && (
                    <td>
                      <input
                        value={moveBackReason[item.order_id] || ''}
                        onChange={(e) => setMoveBackReason((prev) => ({ ...prev, [item.order_id]: e.target.value }))}
                        placeholder={isCuttingStage ? 'Reason required to send back to Model Room' : 'Reason required to send back to previous stage'}
                      />
                    </td>
                  )}
                  <td>
                    <div className="actions-cell">
                      <button type="button" onClick={() => moveToClosing(item.order_id)}>
                        {isCuttingStage ? 'Move To Closing' : isModelRoomStage ? 'Move To Next Stage' : 'Move To Next Stage'}
                      </button>
                      {isModelRoomStage && (
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={Boolean(item.custom_pattern)}
                          onClick={() => toggleCustomPattern(item.order_id, Boolean(item.custom_pattern))}
                        >
                          {item.custom_pattern ? 'Custom Pattern Marked' : 'Mark Custom Pattern'}
                        </button>
                      )}
                      {isClosingStage && item.production_flow === 'MTO' && !item.mto_sole_done && (
                        <button type="button" className="button-secondary" onClick={() => markMtoSoleComplete(item.order_id)}>
                          Mark Sole Completed
                        </button>
                      )}
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => moveBack(item.order_id)}
                      >
                        {isCuttingStage ? 'Send Back To Model Room' : 'Send Back To Previous Stage'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
