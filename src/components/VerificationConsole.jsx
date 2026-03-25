import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import StageScanner from './StageScanner';

const REF_SLOTS = [
  { type: 'DESIGN_REFERENCE', title: 'Design Reference', field: 'designReference' },
  { type: 'COLOUR_REFERENCE', title: 'Colour Reference', field: 'colourReference' },
  { type: 'SOLE_REFERENCE', title: 'Sole Reference', field: 'soleReference' },
  { type: 'ADDITIONAL_REFERENCE', title: 'Additional Reference', field: 'additionalReference' },
];

function toForm(order) {
  return {
    customerName: order.customer_name || '',
    customerNumber: order.customer_number || '',
    customerAddress: order.customer_address || '',
    orderDate: order.order_date?.slice(0, 10) || '',
    dueDate: order.due_date?.slice(0, 10) || '',
    orderedFrom: order.ordered_from || '',
    productionFlow: order.production_flow || 'BESPOKE',
    productName: order.product_name || '',
    size: order.size || '',
    colour: order.colour || '',
    lastNumber: order.last_number || '',
    sole: order.sole || '',
    upperMaterial: order.upper_material || '',
    liningMaterial: order.lining_material || '',
    edgeColour: order.edge_colour || '',
    socks: order.socks || '',
    welt: order.welt || '',
    stamp: order.stamp || '',
    comments: order.comments || '',
  };
}

function formatDateOnly(value) {
  return value ? String(value).slice(0, 10) : '-';
}

export default function VerificationConsole({ refreshSignal }) {
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedHeldId, setSelectedHeldId] = useState('');
  const [form, setForm] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [message, setMessage] = useState('');
  const [holdReason, setHoldReason] = useState('');
  const [imageEdits, setImageEdits] = useState({ removeTypes: {}, files: {}, previews: {} });

  const loadAssigned = useCallback(async () => {
    const { data } = await api.get('/production/assigned');
    setItems(data.items || []);
    const nextItems = data.items || [];
    const firstActive = nextItems.find((x) => !['HOLD_CUSTOMER', 'HOLD_SALES'].includes(x.status));
    setSelectedId(firstActive ? String(firstActive.order_id) : '');
    setSelectedHeldId((prev) => {
      if (!prev) return '';
      return nextItems.some((x) => String(x.order_id) === String(prev)) ? prev : '';
    });
  }, []);

  const loadDetails = useCallback(async (orderId) => {
    if (!orderId) return;
    const { data } = await api.get(`/orders/${orderId}`);
    setSelectedOrder(data);
    setForm(toForm(data));
  }, []);

  useEffect(() => {
    loadAssigned();
  }, [refreshSignal, loadAssigned]);

  useEffect(() => {
    setImageEdits({ removeTypes: {}, files: {}, previews: {} });
    const targetId = selectedHeldId || selectedId;
    loadDetails(targetId);
  }, [selectedId, selectedHeldId, loadDetails]);

  const selectedMeta = useMemo(
    () => items.find((x) => String(x.order_id) === String(selectedId)),
    [items, selectedId]
  );
  const heldItems = useMemo(
    () => items.filter((x) => ['HOLD_CUSTOMER', 'HOLD_SALES'].includes(x.status)),
    [items]
  );
  const selectedHeldMeta = useMemo(
    () => items.find((x) => String(x.order_id) === String(selectedHeldId)),
    [items, selectedHeldId]
  );
  const viewingMeta = selectedHeldMeta || selectedMeta;
  const replacementSummary = useMemo(() => selectedOrder?.replacement_summary || {}, [selectedOrder]);
  const replacementCases = useMemo(() => selectedOrder?.replacement_cases || [], [selectedOrder]);
  const replacementNotes = useMemo(() => selectedOrder?.replacement_notes || [], [selectedOrder]);
  const replacementAudit = useMemo(() => selectedOrder?.replacement_audit || [], [selectedOrder]);
  const activeReplacementCase = replacementCases.find((item) => !['CLOSED', 'REJECTED'].includes(String(item.workflow_status || '').toUpperCase()))
    || replacementCases[0]
    || null;
  const verificationChecklist = useMemo(() => {
    if (!replacementSummary.has_replacements) return [];
    return [
      { label: 'Problem clearly identified', done: Boolean(replacementSummary.latest_reason_code) },
      { label: 'Root cause recorded', done: Boolean(replacementSummary.latest_root_cause_bucket) },
      { label: 'Resolution owner assigned', done: Boolean(replacementSummary.latest_owner_name) },
      { label: 'Promised resolution date set', done: Boolean(replacementSummary.latest_promised_resolution_date) },
      { label: 'Resolution path defined', done: Boolean(replacementSummary.latest_financial_resolution_type) },
      { label: 'Replacement note recorded', done: Boolean(replacementSummary.latest_note_text || replacementSummary.latest_notes) },
      { label: 'Evidence attached', done: Number(replacementSummary.attachment_count || 0) > 0 },
    ];
  }, [replacementSummary]);
  const replacementTimeline = useMemo(() => {
    const noteEvents = replacementNotes.map((item) => ({
      id: `note-${item.id}`,
      when: item.created_at,
      type: `Note / ${item.note_type || 'COMMENT'}`,
      actor: item.actor_name || 'Unknown user',
      detail: item.note_text || '',
      caseId: item.recovery_case_id,
    }));
    const auditEvents = replacementAudit.map((item) => ({
      id: `audit-${item.id}`,
      when: item.created_at,
      type: `Audit / ${item.change_type || 'UPDATE'}`,
      actor: item.changed_by_name || 'Unknown user',
      detail: JSON.stringify(item.after_data || {}),
      caseId: item.recovery_case_id,
    }));
    return [...noteEvents, ...auditEvents]
      .sort((a, b) => new Date(b.when) - new Date(a.when))
      .slice(0, 16);
  }, [replacementNotes, replacementAudit]);

  const refsByType = useMemo(() => {
    if (!selectedOrder?.images) return {};
    return selectedOrder.images.reduce((acc, img) => {
      if (!acc[img.type]) acc[img.type] = img;
      return acc;
    }, {});
  }, [selectedOrder]);

  function updateField(event) {
    setForm((prev) => ({ ...prev, [event.target.name]: event.target.value }));
  }

  const lockedRetailFields = new Set(['customerName', 'customerNumber', 'customerAddress', 'orderDate', 'dueDate', 'orderedFrom']);

  function onSelectImage(type, file) {
    setImageEdits((prev) => {
      const nextPreviews = { ...prev.previews };
      if (nextPreviews[type]) {
        try { URL.revokeObjectURL(nextPreviews[type]); } catch (_e) {}
      }
      if (file) {
        nextPreviews[type] = URL.createObjectURL(file);
      } else {
        delete nextPreviews[type];
      }

      return {
        ...prev,
        removeTypes: { ...prev.removeTypes, [type]: false },
        files: { ...prev.files, [type]: file || null },
        previews: nextPreviews,
      };
    });
  }

  function toggleRemove(type) {
    setImageEdits((prev) => {
      const next = !prev.removeTypes[type];
      return {
        ...prev,
        removeTypes: { ...prev.removeTypes, [type]: next },
        files: next ? { ...prev.files, [type]: null } : prev.files,
      };
    });
  }

  async function saveImageChanges() {
    try {
      setMessage('');
      const targetId = selectedHeldId || selectedId;
      if (!targetId) return;
      const fd = new FormData();
      const removed = Object.keys(imageEdits.removeTypes).filter((t) => imageEdits.removeTypes[t]);
      fd.append('removeTypes', removed.join(','));

      REF_SLOTS.forEach((slot) => {
        const f = imageEdits.files[slot.type];
        if (f) fd.append(slot.field, f);
      });

      await api.put(`/orders/${targetId}/images`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      await loadDetails(targetId);
      setImageEdits({ removeTypes: {}, files: {}, previews: {} });
      setMessage('Reference images updated');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update images');
    }
  }

  async function saveChanges() {
    try {
      setMessage('');
      const targetId = selectedHeldId || selectedId;
      if (!targetId) return;
      await api.put(`/orders/${targetId}`, form);
      setMessage('Changes saved');
      await loadDetails(targetId);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save changes');
    }
  }

  async function downloadIotPdf() {
    try {
      const targetId = selectedHeldId || selectedId;
      if (!targetId) return;
      const { data } = await api.get(`/orders/${targetId}/pdf`, { responseType: 'blob' });
      const blob = new Blob([data], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `iot-${viewingMeta?.production_order_no || targetId}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to generate IOT PDF');
    }
  }

  async function moveToModelRoom() {
    try {
      setMessage('');
      if (!selectedId) {
        setMessage('No priority order available');
        return;
      }
      const { data } = await api.post('/production/advance', { orderId: Number(selectedId) });
      setMessage(`Order moved to ${data.toStageName || 'next stage'}`);
      setSelectedId('');
      setForm(null);
      setSelectedOrder(null);
      await loadAssigned();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to move order to next stage');
    }
  }

  async function setHold(holdType) {
    try {
      setMessage('');
      const targetId = selectedHeldId || selectedId;
      if (!targetId) return;
      if (!holdReason.trim()) {
        setMessage('Hold reason is required');
        return;
      }
      await api.post('/production/verification/hold', {
        orderId: Number(targetId),
        holdType,
        reason: holdReason,
      });
      setMessage(`Order marked on hold (${holdType})`);
      setHoldReason('');
      await loadAssigned();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to set hold');
    }
  }

  async function releaseHold() {
    try {
      setMessage('');
      const targetId = selectedHeldId || selectedId;
      if (!targetId) return;
      await api.post('/production/verification/release-hold', {
        orderId: Number(targetId),
      });
      setMessage('Hold released');
      setSelectedHeldId('');
      await loadAssigned();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to release hold');
    }
  }

  return (
    <section>
      <h2>Verification Console</h2>

      <div className="card">
        <h3>Delivery Date Priority Order</h3>
        {selectedMeta ? (
          <div>
            <p style={{ margin: 0 }}>
              {selectedMeta.production_order_no} | {selectedMeta.customer_name} | Delivery Date: {selectedMeta.due_date?.slice(0, 10)} | Status: {selectedMeta.status}
            </p>
            {Number(selectedMeta.open_replacements || 0) > 0 && (
              <p style={{ margin: '0.4rem 0 0', fontWeight: 600, color: '#9a3412' }}>
                Replacement active: {selectedMeta.active_replacement_reason_code || 'Issue logged'} | Level {selectedMeta.max_replacement_sequence || 1} | {selectedMeta.active_replacement_workflow_status || 'Open'}
              </p>
            )}
          </div>
        ) : (
          <p style={{ margin: 0 }}>No orders pending in Verification.</p>
        )}
      </div>
      <div className="card">
        <h3>Held IOT Selection</h3>
        <div className="actions-cell">
          <select value={selectedHeldId} onChange={(e) => setSelectedHeldId(e.target.value)}>
            <option value="">Open Priority Order</option>
            {heldItems.map((item) => (
              <option key={item.order_id} value={item.order_id}>
                {item.production_order_no} | {item.customer_name} | {item.status}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        <h3>Verification Queue With Replacement Visibility</h3>
        <div className="verification-fields three-col">
          {items.map((item) => (
            <label
              key={item.order_id}
              className="verification-field"
              style={{ cursor: 'pointer' }}
              onClick={() => {
                if (['HOLD_CUSTOMER', 'HOLD_SALES'].includes(item.status)) {
                  setSelectedHeldId(String(item.order_id));
                } else {
                  setSelectedHeldId('');
                  setSelectedId(String(item.order_id));
                }
              }}
            >
              <span>{item.production_order_no}</span>
              <textarea
                rows={6}
                disabled
                value={[
                  `Customer: ${item.customer_name || '-'}`,
                  `Due: ${formatDateOnly(item.due_date)}`,
                  `Status: ${item.status || '-'}`,
                  `Replacements: ${item.total_replacements || 0}`,
                  `Open Replacement: ${item.open_replacements || 0}`,
                  `Problem: ${item.active_replacement_reason_code || '-'}`,
                  `Root Cause: ${item.active_replacement_root_cause_bucket || '-'}`,
                  `Workflow: ${item.active_replacement_workflow_status || '-'}`,
                ].join('\n')}
              />
            </label>
          ))}
        </div>
      </div>

      {form && (
        <div className="card">
          {replacementSummary.has_replacements && (
            <div className="card" style={{ marginBottom: '1rem', border: '1px solid #f59e0b', background: '#fff7ed' }}>
              <h3>Replacement Brief For Verification</h3>
              <div className="verification-form-grid">
                <section className="verification-form-section">
                  <h4>Exact Problem</h4>
                  <div className="verification-fields two-col">
                    <label className="verification-field"><span>Replacement Level</span><input value={`Replacement ${replacementSummary.max_replacement_sequence || 1}`} disabled /></label>
                    <label className="verification-field"><span>Case Type</span><input value={replacementSummary.latest_case_type || '-'} disabled /></label>
                    <label className="verification-field"><span>Reason Code</span><input value={replacementSummary.latest_reason_code || '-'} disabled /></label>
                    <label className="verification-field"><span>Root Cause</span><input value={replacementSummary.latest_root_cause_bucket || '-'} disabled /></label>
                    <label className="verification-field"><span>Workflow Status</span><input value={replacementSummary.latest_workflow_status || '-'} disabled /></label>
                    <label className="verification-field"><span>Priority</span><input value={replacementSummary.latest_priority_level || '-'} disabled /></label>
                  </div>
                  <label className="mto-comments-field verification-field">
                    <span>Problem / Action Brief</span>
                    <textarea value={replacementSummary.resolution_brief || replacementSummary.latest_notes || '-'} rows={4} disabled />
                  </label>
                </section>

                <section className="verification-form-section">
                  <h4>Expected Resolution</h4>
                  <div className="verification-fields two-col">
                    <label className="verification-field"><span>Owner</span><input value={replacementSummary.latest_owner_name || '-'} disabled /></label>
                    <label className="verification-field"><span>Promised Resolution</span><input value={formatDateOnly(replacementSummary.latest_promised_resolution_date)} disabled /></label>
                    <label className="verification-field"><span>Resolution Path</span><input value={replacementSummary.latest_financial_resolution_type || '-'} disabled /></label>
                    <label className="verification-field"><span>Customer Status</span><input value={replacementSummary.latest_customer_satisfaction_status || '-'} disabled /></label>
                    <label className="verification-field"><span>Open Replacements</span><input value={String(replacementSummary.open_replacements || 0)} disabled /></label>
                    <label className="verification-field"><span>Attachments</span><input value={String(replacementSummary.attachment_count || 0)} disabled /></label>
                  </div>
                  <label className="mto-comments-field verification-field">
                    <span>Latest Replacement Note</span>
                    <textarea
                      value={replacementSummary.latest_note_text || activeReplacementCase?.notes || 'No replacement note recorded.'}
                      rows={4}
                      disabled
                    />
                  </label>
                </section>
              </div>

              <div className="verification-form-grid" style={{ marginTop: '1rem' }}>
                <section className="verification-form-section">
                  <h4>Verification Resolution Checklist</h4>
                  <div className="verification-fields two-col">
                    {verificationChecklist.map((item) => (
                      <label key={item.label} className="verification-field">
                        <span>{item.label}</span>
                        <input value={item.done ? 'Yes' : 'No'} disabled />
                      </label>
                    ))}
                  </div>
                </section>

                <section className="verification-form-section">
                  <h4>Latest Resolution Timeline</h4>
                  <div className="verification-fields one-col">
                    {replacementTimeline.map((item) => (
                      <label key={item.id} className="verification-field">
                        <span>{item.type} | Case #{item.caseId} | {formatDateOnly(item.when)}</span>
                        <textarea
                          rows={3}
                          disabled
                          value={[
                            `Actor: ${item.actor}`,
                            `Detail: ${item.detail || '-'}`,
                          ].join('\n')}
                        />
                      </label>
                    ))}
                    {replacementTimeline.length === 0 && (
                      <label className="verification-field">
                        <span>No replacement timeline yet</span>
                        <textarea rows={3} disabled value="No replacement notes or audit events are recorded for this order yet." />
                      </label>
                    )}
                  </div>
                </section>
              </div>

              <div className="verification-form-section" style={{ marginTop: '1rem' }}>
                <h4>Replacement Chain Visibility</h4>
              <div className="verification-fields three-col">
                  {replacementCases.map((item) => (
                    <label key={item.id} className="verification-field">
                      <span>{item.case_type} {item.replacement_sequence || 1}</span>
                      <textarea
                        rows={5}
                        disabled
                        value={[
                          `Reason: ${item.reason_code || '-'}`,
                          `Root Cause: ${item.root_cause_bucket || '-'}`,
                          `Status: ${item.workflow_status || '-'}`,
                          `Owner: ${item.owner_name || '-'}`,
                          `Promise: ${formatDateOnly(item.promised_resolution_date)}`,
                          `Resolution: ${item.financial_resolution_type || '-'}`,
                          `Note: ${item.latest_note_text || item.notes || '-'}`,
                        ].join('\n')}
                      />
                    </label>
                  ))}
                </div>
              </div>

              {activeReplacementCase?.attachments?.length > 0 && (
                <div className="verification-form-section" style={{ marginTop: '1rem' }}>
                  <h4>Replacement Evidence</h4>
                  <div className="verification-fields three-col">
                    {activeReplacementCase.attachments.map((attachment) => (
                      <label key={attachment.id} className="verification-field">
                        <span>{attachment.file_name}</span>
                        <textarea
                          rows={4}
                          disabled
                          value={[
                            `Added: ${formatDateOnly(attachment.created_at)}`,
                            `Note: ${attachment.note || '-'}`,
                            `File: ${attachment.file_url || '-'}`,
                          ].join('\n')}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <h3>Edit Order Before IOT Print</h3>
          <div className="verification-form-grid">
            <section className="verification-form-section">
              <h4>Customer Details</h4>
              <div className="verification-fields two-col">
                {Object.entries({
                  customerName: 'Customer Name',
                  customerNumber: 'Customer Number',
                  customerAddress: 'Customer Address',
                }).map(([key, label]) => (
                  <label key={key} className="verification-field">
                    <span>{label}</span>
                    <input
                      name={key}
                      value={form[key]}
                      onChange={updateField}
                      type="text"
                      disabled={lockedRetailFields.has(key)}
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="verification-form-section">
              <h4>Order Details</h4>
              <div className="verification-fields two-col">
                {Object.entries({
                  orderDate: 'Order Date',
                  dueDate: 'Due Date',
                  orderedFrom: 'Ordered From',
                }).map(([key, label]) => (
                  <label key={key} className="verification-field">
                    <span>{label}</span>
                    <input
                      name={key}
                      value={form[key]}
                      onChange={updateField}
                      type={key.toLowerCase().includes('date') ? 'date' : 'text'}
                      disabled={lockedRetailFields.has(key)}
                    />
                  </label>
                ))}
                <label className="verification-field">
                  <span>Flow Type</span>
                  <select name="productionFlow" value={form.productionFlow} onChange={updateField}>
                    <option value="BESPOKE">Bespoke</option>
                    <option value="EMBROIDERY">Embroidery</option>
                    <option value="LASER">Laser</option>
                    <option value="MTO">MTO</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="verification-form-section">
              <h4>Product Details</h4>
              <div className="verification-fields three-col">
                {Object.entries({
                  productName: 'Product Name',
                  size: 'Size',
                  colour: 'Colour',
                  lastNumber: 'Last Number',
                  sole: 'Sole',
                  upperMaterial: 'Upper Material',
                  liningMaterial: 'Lining Material',
                  edgeColour: 'Edge Colour',
                  socks: 'Socks',
                  welt: 'Welt',
                  stamp: 'Stamp',
                }).map(([key, label]) => (
                  <label key={key} className="verification-field">
                    <span>{label}</span>
                    <input
                      name={key}
                      value={form[key]}
                      onChange={updateField}
                      type="text"
                      disabled={lockedRetailFields.has(key)}
                    />
                  </label>
                ))}
              </div>
            </section>
          </div>
          <label className="mto-comments-field verification-field">
            <span>Comments</span>
            <textarea name="comments" value={form.comments} onChange={updateField} rows={4} />
          </label>

          <div className="actions-cell" style={{ marginTop: '0.75rem' }}>
            <button type="button" onClick={saveChanges}>Save Changes</button>
            <button type="button" onClick={downloadIotPdf}>Print IOT PDF</button>
            <button type="button" onClick={moveToModelRoom} disabled={!selectedId || Boolean(selectedHeldId)}>Move To Model Room</button>
          </div>
          <div className="actions-cell" style={{ marginTop: '0.5rem' }}>
            <input
              placeholder="Hold reason"
              value={holdReason}
              onChange={(e) => setHoldReason(e.target.value)}
              style={{ minWidth: 240 }}
            />
            <button type="button" className="button-secondary" onClick={() => setHold('CUSTOMER')}>Hold (Customer)</button>
            <button type="button" className="button-secondary" onClick={() => setHold('SALES')}>Hold (Sales)</button>
            {['HOLD_CUSTOMER', 'HOLD_SALES'].includes(viewingMeta?.status) && (
              <button type="button" onClick={releaseHold}>Release Hold</button>
            )}
          </div>
          {message && <p>{message}</p>}
        </div>
      )}

      {selectedOrder && (
        <div className="card">
          <h3>Reference Images For Verification</h3>
          <div className="verification-ref-grid">
            {REF_SLOTS.map((slot) => {
              const image = refsByType[slot.type];
              const preview = imageEdits.previews[slot.type];
              const markedRemoved = Boolean(imageEdits.removeTypes[slot.type]);
              const src = preview || (!markedRemoved && image ? `${image.url}${image.url.includes('?') ? '&' : '?'}v=${selectedOrder.updated_at || selectedOrder.id}` : null);

              return (
                <figure key={slot.type} className="reference-slot">
                  <figcaption>{slot.title}</figcaption>
                  {src ? (
                    <div className="verification-image-frame">
                      <img
                        className="verification-image"
                        src={src}
                        alt={slot.title}
                        loading="eager"
                        decoding="sync"
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div className="reference-empty">Not provided</div>
                  )}

                  <div className="actions-cell" style={{ marginTop: '0.35rem' }}>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => onSelectImage(slot.type, e.target.files?.[0] || null)}
                    />
                    <button type="button" className="button-secondary" onClick={() => toggleRemove(slot.type)}>
                      {markedRemoved ? 'Undo Remove' : 'Remove'}
                    </button>
                  </div>
                </figure>
              );
            })}
          </div>

          <div className="actions-cell" style={{ marginTop: '0.75rem' }}>
            <button type="button" onClick={saveImageChanges}>Save Image Changes</button>
          </div>
        </div>
      )}

      <StageScanner stageAccess={1} stageName="Verification" onScanned={() => loadAssigned()} />
    </section>
  );
}
