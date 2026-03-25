import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const UPDATE_STATUS_OPTIONS = [
  'CALLED_NO_RESPONSE',
  'CUSTOMER_CONFIRMED_VISIT',
  'PICKUP_SCHEDULED',
  'FOLLOW_UP_REQUIRED',
  'CUSTOMER_REQUESTED_DELAY',
];

export default function StoreDeliveryDashboard({ refreshSignal = 0 }) {
  const [date, setDate] = useState(todayIso());
  const [data, setData] = useState({
    summary: {},
    awaiting_receive: [],
    pending_deliveries: [],
    scoped_outlet: null,
  });
  const [message, setMessage] = useState('');
  const [drafts, setDrafts] = useState({});
  const [paymentAccounts, setPaymentAccounts] = useState([]);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (date) p.set('date', date);
    return p.toString();
  }, [date]);

  const loadData = useCallback(async () => {
    const { data: payload } = await api.get(`/orders/store-delivery-dashboard?${query}`);
    setData(payload || { summary: {}, awaiting_receive: [], pending_deliveries: [], scoped_outlet: null });
  }, [query]);

  useEffect(() => {
    loadData().catch(() => {});
  }, [loadData, refreshSignal]);

  useEffect(() => {
    api.get('/finance/payment-accounts?active=1').then(({ data: payload }) => {
      setPaymentAccounts(payload.accounts || []);
    }).catch(() => {});
  }, []);

  function getDraft(orderId, initialStatus = 'FOLLOW_UP_REQUIRED') {
    return drafts[orderId] || { status: initialStatus, notes: '', balanceReceived: '', paymentAccountId: '' };
  }

  function patchDraft(orderId, patch) {
    setDrafts((prev) => ({ ...prev, [orderId]: { ...getDraft(orderId), ...patch } }));
  }

  async function markReceived(orderId) {
    try {
      await api.post(`/orders/${orderId}/mark-received-store`);
      setMessage('Order marked as received in store.');
      await loadData();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to mark received in store');
    }
  }

  async function saveDailyUpdate(orderId) {
    const draft = getDraft(orderId);
    try {
      await api.post(`/orders/${orderId}/customer-delivery-update`, {
        updateDate: date,
        customerStatus: draft.status,
        notes: draft.notes,
      });
      setMessage('Daily customer update saved.');
      await loadData();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save customer update');
    }
  }

  async function markDelivered(orderId) {
    const draft = getDraft(orderId);
    try {
      await api.post(`/orders/${orderId}/mark-delivered-customer`, {
        updateDate: date,
        notes: draft.notes || 'Delivered to customer',
        balanceReceived: draft.balanceReceived || 0,
        paymentAccountId: draft.paymentAccountId || null,
      });
      setMessage('Order marked as delivered.');
      await loadData();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to mark delivered');
    }
  }

  return (
    <section>
      <h2>MTO Received From Factory Dashboard</h2>
      {data.scoped_outlet && <p>Outlet Scope: {data.scoped_outlet}</p>}

      <div className="card filter-grid">
        <label className="crm-field">
          <span>Daily Follow-up Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className="summary-grid">
        <article className="card"><h4>Awaiting Receive</h4><p className="metric">{data.summary.awaiting_receive || 0}</p></article>
        <article className="card"><h4>Pending Delivery</h4><p className="metric">{data.summary.pending_customer_delivery || 0}</p></article>
        <article className="card"><h4>Updated Today</h4><p className="metric">{data.summary.updated_today || 0}</p></article>
        <article className="card"><h4>Pending Today Update</h4><p className="metric">{data.summary.pending_today_update || 0}</p></article>
      </div>

      <section className="card table-wrap">
        <h3>Awaiting Store Receive</h3>
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Outlet</th>
              <th>Due Date</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {(data.awaiting_receive || []).length === 0 ? (
              <tr>
                <td colSpan={6}>No completed/shipped orders awaiting store receive.</td>
              </tr>
            ) : (
              (data.awaiting_receive || []).map((row) => (
                <tr key={row.id}>
                  <td>{row.production_order_no}</td>
                  <td>{row.customer_name}</td>
                  <td>{row.ordered_from}</td>
                  <td>{String(row.due_date || '').slice(0, 10)}</td>
                  <td>{row.status}</td>
                  <td className="actions-cell">
                    <button type="button" onClick={() => markReceived(row.id)}>Mark Received In Store</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="card table-wrap">
        <h3>Pending Customer Deliveries (Received In Store)</h3>
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Outlet</th>
              <th>Received In Store</th>
              <th>Due Date</th>
              <th>Pending Balance</th>
              <th>Last Update</th>
              <th>Today Status</th>
              <th>Notes</th>
              <th>Balance Received</th>
              <th>Payment Account</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data.pending_deliveries || []).length === 0 ? (
              <tr>
                <td colSpan={12}>No pending deliveries in store.</td>
              </tr>
            ) : (
              (data.pending_deliveries || []).map((row) => {
                const draft = getDraft(row.id, row.today_update_status || 'FOLLOW_UP_REQUIRED');
                return (
                  <tr key={row.id}>
                    <td>{row.production_order_no}</td>
                    <td>{row.customer_name}</td>
                    <td>{row.ordered_from}</td>
                    <td>{String(row.received_in_store_at || '').slice(0, 10)}</td>
                    <td>{String(row.due_date || '').slice(0, 10)}</td>
                    <td>{Number(row.outstanding_balance || 0).toFixed(2)}</td>
                    <td>
                      {row.last_update_date ? `${String(row.last_update_date).slice(0, 10)} - ${row.last_update_status}` : 'No update'}
                    </td>
                    <td>
                      <select
                        value={draft.status}
                        onChange={(e) => patchDraft(row.id, { status: e.target.value })}
                      >
                        {UPDATE_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                        <option value="DELIVERED">DELIVERED</option>
                      </select>
                    </td>
                    <td>
                      <input
                        value={draft.notes}
                        onChange={(e) => patchDraft(row.id, { notes: e.target.value })}
                        placeholder={row.today_update_notes || 'Daily customer remark'}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={draft.balanceReceived}
                        onChange={(e) => patchDraft(row.id, { balanceReceived: e.target.value })}
                        placeholder={Number(row.outstanding_balance || 0).toFixed(2)}
                      />
                    </td>
                    <td>
                      <select
                        value={draft.paymentAccountId}
                        onChange={(e) => patchDraft(row.id, { paymentAccountId: e.target.value })}
                      >
                        <option value="">Select account</option>
                        {paymentAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>
                        ))}
                      </select>
                    </td>
                    <td className="actions-cell">
                      <button type="button" onClick={() => saveDailyUpdate(row.id)}>Save Daily Update</button>
                      <button type="button" className="button-secondary" onClick={() => markDelivered(row.id)}>Mark Delivered</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>

      {message && <p>{message}</p>}
    </section>
  );
}
