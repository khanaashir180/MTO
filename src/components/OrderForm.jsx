import { useEffect, useState } from 'react';
import Barcode from 'react-barcode';
import api from '../api/client';
import { useOutlets } from '../context/OutletsContext';
import { useAuth } from '../context/AuthContext';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate, days) {
  const baseDate = new Date(`${isoDate}T00:00:00`);
  baseDate.setDate(baseDate.getDate() + days);
  return baseDate.toISOString().slice(0, 10);
}

function buildFallbackCapacityWindow(startIso, days) {
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(startIso, index);
    return {
      date,
      order_type: 'MTO',
      capacity_limit: null,
      booked_count: 0,
      remaining_capacity: null,
      is_full: false,
      notes: null,
    };
  });
}

const base = {
  orderType: 'MTO',
  customerName: '',
  customerNumber: '',
  customerCountryCode: '+92',
  customerAddress: '',
  deliveryAddress: '',
  deliveryAddressMatchesCustomer: 'true',
  orderDate: todayIso(),
  dueDate: '',
  orderedFrom: '',
  productPrice: '',
  advancePaid: '',
  advancePaymentAccountId: '',
  splitPaymentEnabled: 'false',
  splitAdvancePaidPrimary: '',
  splitAdvancePaidSecondary: '',
  splitAdvancePaymentAccountIdSecondary: '',
  productName: '',
  size: '',
  colour: '',
  lastNumber: '',
  sole: '',
  upperMaterial: '',
  liningMaterial: '',
  edgeColour: '',
  socks: '',
  welt: '',
  stamp: '',
  itemCondition: '',
  refurbishmentType: '',
  issueDescription: '',
  workRequested: '',
  accessoriesReceived: '',
  returnCondition: '',
  returnReason: '',
  returnRequest: '',
  returnAccessoriesReceived: '',
  comments: '',
};

const COUNTRY_OPTIONS = [
  { code: '+92', label: 'Pakistan (+92)' },
  { code: '+971', label: 'UAE (+971)' },
  { code: '+966', label: 'Saudi Arabia (+966)' },
  { code: '+1', label: 'United States (+1)' },
  { code: '+44', label: 'United Kingdom (+44)' },
  { code: '+61', label: 'Australia (+61)' },
  { code: '+91', label: 'India (+91)' },
  { code: '+974', label: 'Qatar (+974)' },
  { code: '+965', label: 'Kuwait (+965)' },
  { code: '+968', label: 'Oman (+968)' },
  { code: '+973', label: 'Bahrain (+973)' },
  { code: '+880', label: 'Bangladesh (+880)' },
  { code: '+94', label: 'Sri Lanka (+94)' },
  { code: '+60', label: 'Malaysia (+60)' },
  { code: '+65', label: 'Singapore (+65)' },
];

function sanitizeCountryCode(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
  return digits ? `+${digits}` : '+';
}

function sanitizeLocalNumber(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 15);
}

function buildCanonicalCustomerNumber(countryCode, localNumber) {
  const countryDigits = sanitizeCountryCode(countryCode).replace(/\D/g, '');
  let localDigits = sanitizeLocalNumber(localNumber);
  if (localDigits.startsWith('0')) localDigits = localDigits.slice(1);
  if (!countryDigits || !localDigits) return '';
  return `+${countryDigits}${localDigits}`;
}

function splitCustomerNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return { customerCountryCode: '+92', customerNumber: '' };
  const sortedCountryCodes = COUNTRY_OPTIONS
    .map((entry) => entry.code.replace(/\D/g, ''))
    .sort((left, right) => right.length - left.length);
  const matchedCountry = sortedCountryCodes.find((entry) => digits.startsWith(entry) && digits.length > entry.length);
  if (matchedCountry) {
    return { customerCountryCode: `+${matchedCountry}`, customerNumber: digits.slice(matchedCountry.length) };
  }
  if (digits.startsWith('0')) {
    return { customerCountryCode: '+92', customerNumber: digits.slice(1) };
  }
  return { customerCountryCode: '+92', customerNumber: digits };
}

export default function OrderForm({ onCreated, onCancel, initialOrderType = 'MTO' }) {
  const { user } = useAuth();
  const lockedOutlet = user?.outlet_name || '';
  const { outlets } = useOutlets();
  const normalizedInitialOrderType = ['MTO', 'REFURBISHMENT', 'RETURN'].includes(String(initialOrderType || '').toUpperCase())
    ? String(initialOrderType || '').toUpperCase()
    : 'MTO';
  const [form, setForm] = useState({ ...base, orderType: normalizedInitialOrderType, orderedFrom: lockedOutlet || outlets[0] || 'Online' });
  const [files, setFiles] = useState({});
  const [message, setMessage] = useState('');
  const [lastCreated, setLastCreated] = useState({ productionOrderNo: '', barcode: '' });
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [capacityInfo, setCapacityInfo] = useState(null);
  const [capacityWindow, setCapacityWindow] = useState([]);
  const [customerLookup, setCustomerLookup] = useState({ status: 'idle', customer: null, message: '' });
  const isMtoOrder = form.orderType === 'MTO';
  const isRefurbishmentOrder = form.orderType === 'REFURBISHMENT';
  const isReturnOrder = form.orderType === 'RETURN';
  const isExistingCustomer = customerLookup.status === 'existing';
  const customerNameLocked = isExistingCustomer && Boolean(String(form.customerName || '').trim());
  const customerAddressLocked = isExistingCustomer && Boolean(String(form.customerAddress || '').trim());

  async function openReferenceIot(orderId, productionOrderNo) {
    try {
      const response = await api.get(`/orders/${orderId}/pdf`, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (_error) {
      setMessage(`Unable to open IOT for ${productionOrderNo || `order ${orderId}`}.`);
    }
  }

  function updateField(event) {
    const { name, type, checked, value } = event.target;
    const nextValue = type === 'checkbox' ? (checked ? 'true' : 'false') : value;
    setForm((prev) => {
      const next = { ...prev, [name]: nextValue };
      if (name === 'customerCountryCode') next.customerCountryCode = sanitizeCountryCode(nextValue);
      if (name === 'customerNumber') next.customerNumber = sanitizeLocalNumber(nextValue);
      if (name === 'deliveryAddressMatchesCustomer' && nextValue === 'true') {
        next.deliveryAddress = prev.customerAddress || '';
      }
      if (name === 'customerAddress' && prev.deliveryAddressMatchesCustomer === 'true') {
        next.deliveryAddress = nextValue;
      }
      return next;
    });
  }

  useEffect(() => {
    if (!outlets.length) return;
    setForm((prev) => {
      if (lockedOutlet) return { ...prev, orderedFrom: lockedOutlet };
      if (prev.orderedFrom && outlets.includes(prev.orderedFrom)) return prev;
      return { ...prev, orderedFrom: outlets[0] };
    });
  }, [outlets, lockedOutlet]);

  useEffect(() => {
    api.get('/finance/payment-accounts?active=1').then(({ data }) => {
      const accounts = data.accounts || [];
      setPaymentAccounts(accounts);
      const defaultAccount = accounts.find((a) => a.is_default) || accounts[0];
      setForm((prev) => ({
        ...prev,
        advancePaymentAccountId: prev.advancePaymentAccountId || (defaultAccount ? String(defaultAccount.id) : ''),
      }));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const customerNumber = buildCanonicalCustomerNumber(form.customerCountryCode, form.customerNumber);
    if (!customerNumber) {
      setCustomerLookup({ status: 'idle', customer: null, message: '' });
      return undefined;
    }

    let active = true;
    setCustomerLookup((prev) => ({ ...prev, status: 'loading', message: 'Checking CRM customer registry...' }));
    const timeoutId = window.setTimeout(async () => {
      try {
        const { data } = await api.get('/orders/customer-lookup', { params: { customerNumber, customerCountryCode: form.customerCountryCode } });
        if (!active) return;

        if (data.exists && data.customer) {
          const parsedNumber = splitCustomerNumber(data.customer.customer_number);
          setForm((prev) => (
            buildCanonicalCustomerNumber(prev.customerCountryCode, prev.customerNumber) === customerNumber
              ? {
                ...prev,
                customerCountryCode: parsedNumber.customerCountryCode,
                customerNumber: parsedNumber.customerNumber,
                customerName: data.customer.customer_name || '',
                customerAddress: data.customer.customer_address || '',
                deliveryAddress: prev.deliveryAddressMatchesCustomer === 'true'
                  ? (data.customer.customer_address || '')
                  : prev.deliveryAddress,
              }
              : prev
          ));
          setCustomerLookup({
            status: 'existing',
            customer: data.customer,
            history: data.history || null,
            criticality: data.criticality || null,
            recentOrders: data.recentOrders || [],
            message: `Existing CRM customer loaded from ${data.customer.outlet_name || 'saved branch'}.`,
          });
          return;
        }

        setCustomerLookup({
          status: 'new',
          customer: null,
          history: null,
          criticality: null,
          recentOrders: [],
          message: 'New customer number. This branch will create a new CRM customer profile on order submit.',
        });
      } catch (_error) {
        if (!active) return;
        setCustomerLookup({ status: 'error', customer: null, history: null, criticality: null, recentOrders: [], message: 'Unable to verify customer number right now.' });
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [form.customerCountryCode, form.customerNumber]);

  useEffect(() => {
    if (form.deliveryAddressMatchesCustomer !== 'true') return;
    setForm((prev) => ({ ...prev, deliveryAddress: prev.customerAddress }));
  }, [form.customerAddress, form.deliveryAddressMatchesCustomer]);

  useEffect(() => {
    if (form.orderType !== 'MTO' || !form.dueDate) {
      setCapacityInfo(null);
    }
    if (form.orderType !== 'MTO') {
      setCapacityWindow([]);
      return;
    }
    const windowStart = form.orderDate || todayIso();
    const windowEnd = addDays(windowStart, 29);
    const fallbackRows = buildFallbackCapacityWindow(windowStart, 30);
    api.get('/orders/capacity', {
      params: {
        dateFrom: windowStart,
        dateTo: windowEnd,
        orderType: form.orderType,
      },
    }).then(({ data }) => {
      const rows = (data.capacities && data.capacities.length) ? data.capacities : fallbackRows;
      setCapacityWindow(rows);
      setCapacityInfo(rows.find((row) => row.date === form.dueDate) || null);
    }).catch(() => {
      setCapacityWindow(fallbackRows);
      setCapacityInfo(fallbackRows.find((row) => row.date === form.dueDate) || null);
    });
  }, [form.dueDate, form.orderDate, form.orderType]);

  async function submit(event) {
    event.preventDefault();
    const splitEnabled = form.orderType === 'MTO' && form.splitPaymentEnabled === 'true';
    const splitPrimary = Number(form.splitAdvancePaidPrimary || 0);
    const splitSecondary = Number(form.splitAdvancePaidSecondary || 0);
    const computedAdvance = splitEnabled ? (splitPrimary + splitSecondary) : Number(form.advancePaid || 0);

    if (form.orderDate < todayIso()) {
      setMessage('Order date cannot be before today');
      return;
    }

    if (splitEnabled && (splitPrimary < 0 || splitSecondary < 0)) {
      setMessage('Split payment amounts cannot be negative');
      return;
    }
    if (computedAdvance > Number(form.productPrice || 0)) {
      setMessage('Advance cannot exceed product price');
      return;
    }
    if (form.orderType === 'MTO' && capacityInfo?.capacity_limit !== null && capacityInfo?.is_full) {
      setMessage(`Selected due date is full. Capacity ${capacityInfo.capacity_limit}, booked ${capacityInfo.booked_count}.`);
      return;
    }
    if (computedAdvance > 0 && !form.advancePaymentAccountId) {
      setMessage('Select advance payment account');
      return;
    }
    if (splitEnabled && splitSecondary > 0 && !form.splitAdvancePaymentAccountIdSecondary) {
      setMessage('Select second payment account for split payment');
      return;
    }

    const canonicalCustomerNumber = buildCanonicalCustomerNumber(form.customerCountryCode, form.customerNumber);
    if (!canonicalCustomerNumber) {
      setMessage('Enter a valid customer country code and phone number');
      return;
    }
    if (!/[A-Za-z]/.test(form.customerName) || (form.customerName.match(/\d/g) || []).length > 3 || /\d{4,}/.test(form.customerName)) {
      setMessage('Customer name must be a real name, not a numeric string');
      return;
    }
    if (!String(form.deliveryAddress || '').trim()) {
      setMessage('Delivery address is required');
      return;
    }

    const payload = new FormData();
    const payloadObject = {
      ...form,
      customerNumber: canonicalCustomerNumber,
      advancePaid: String(computedAdvance),
      splitAdvancePaidPrimary: splitEnabled ? String(splitPrimary) : '',
      splitAdvancePaidSecondary: splitEnabled ? String(splitSecondary) : '',
      splitPaymentEnabled: splitEnabled ? 'true' : 'false',
    };
    Object.entries(payloadObject).forEach(([key, value]) => payload.append(key, value));
    if (files.designReference) payload.append('designReference', files.designReference);
    if (files.colourReference) payload.append('colourReference', files.colourReference);
    if (files.soleReference) payload.append('soleReference', files.soleReference);
    if (files.additionalReference) payload.append('additionalReference', files.additionalReference);

    try {
      const { data } = await api.post('/orders', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setLastCreated({
        productionOrderNo: data.order.production_order_no,
        barcode: data.product.barcode,
      });
      setMessage(`Order created: ${data.order.production_order_no}`);
      const defaultAccount = paymentAccounts.find((a) => a.is_default) || paymentAccounts[0];
      setForm({
        ...base,
        orderType: normalizedInitialOrderType,
        orderedFrom: lockedOutlet || outlets[0] || 'Online',
        advancePaymentAccountId: defaultAccount ? String(defaultAccount.id) : '',
      });
      setCustomerLookup({ status: 'idle', customer: null, message: '' });
      setFiles({});
      if (onCreated) onCreated();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Order creation failed');
    }
  }

  return (
    <form className="card mto-form" onSubmit={submit}>
      <div className="mto-form-head">
        <div>
          <h3>
            {form.orderType === 'REFURBISHMENT'
              ? 'IOT (Refurbishment Tracker)'
              : form.orderType === 'RETURN'
                ? 'IOT (Return Tracker)'
                : 'IOT (Internal Order Tracker)'}
          </h3>
          <p>
            {form.orderType === 'REFURBISHMENT'
              ? 'Capture refurbishment request details, item condition, and customer references.'
              : form.orderType === 'RETURN'
                ? 'Capture return reason, item condition, and resolution request.'
              : 'Capture customer profile, product specifications, and design references.'}
          </p>
        </div>
        <div className="mto-auto-box">
          <label>Production Order No. (Auto)</label>
          <input value={lastCreated.productionOrderNo || 'Generated on submit'} readOnly />
        </div>
      </div>

      <section className="mto-section">
        <div className="mto-customer-banner">
          <div>
            <span className="mto-customer-banner-label">Customer Number</span>
            <strong>Primary customer key</strong>
          </div>
          <span className={`mto-customer-status ${customerLookup.status || 'idle'}`}>
            {customerLookup.status === 'loading' && 'Checking CRM'}
            {customerLookup.status === 'existing' && 'Locked To CRM'}
            {customerLookup.status === 'new' && 'New Customer'}
            {customerLookup.status === 'error' && 'Lookup Error'}
            {customerLookup.status === 'idle' && 'Awaiting Number'}
          </span>
        </div>
        <div className="grid two">
          <label>
            Customer Name
            <input
              name="customerName"
              value={form.customerName}
              onChange={updateField}
              placeholder="Full customer name"
              readOnly={customerNameLocked}
              required
            />
          </label>
          <label>
            Country
            <select name="customerCountryCode" value={form.customerCountryCode} onChange={updateField} required>
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country.code} value={country.code}>{country.label}</option>
              ))}
            </select>
          </label>
          <label>
            Customer Number (Primary Key)
            <input
              name="customerNumber"
              value={form.customerNumber}
              onChange={updateField}
              placeholder="3001234567"
              inputMode="numeric"
              required
            />
          </label>
          <label>
            CRM Address
            <input
              name="customerAddress"
              value={form.customerAddress}
              onChange={updateField}
              placeholder="Permanent customer address"
              readOnly={customerAddressLocked}
              required
            />
          </label>
        </div>
        {customerLookup.message ? (
          <p className={`mto-customer-message ${customerLookup.status}`}>
            {customerLookup.message}
          </p>
        ) : null}
        {isExistingCustomer && customerLookup.history ? (
          <section className="mto-customer-intelligence">
            <div className="mto-customer-intelligence-head">
              <div>
                <span className="mto-customer-banner-label">Customer Intelligence</span>
                <strong>Order history and criticality</strong>
              </div>
              <span className={`mto-criticality-pill ${(customerLookup.criticality?.level || 'STANDARD').toLowerCase()}`}>
                {customerLookup.criticality?.level || 'STANDARD'}
              </span>
            </div>
            <p className="mto-customer-intelligence-note">
              {customerLookup.criticality?.note || 'Review history before committing delivery promises.'}
            </p>
            <div className="mto-customer-kpi-grid">
              <article className="mto-customer-kpi"><span>Total Orders</span><strong>{Number(customerLookup.history.total_orders || 0)}</strong></article>
              <article className="mto-customer-kpi"><span>MTO</span><strong>{Number(customerLookup.history.mto_orders || 0)}</strong></article>
              <article className="mto-customer-kpi"><span>Refinishes</span><strong>{Number(customerLookup.history.refurbishment_orders || 0)}</strong></article>
              <article className="mto-customer-kpi"><span>Returns</span><strong>{Number(customerLookup.history.return_orders || 0)}</strong></article>
              <article className="mto-customer-kpi"><span>Open Orders</span><strong>{Number(customerLookup.history.open_orders || 0)}</strong></article>
              <article className="mto-customer-kpi"><span>Late Orders</span><strong>{Number(customerLookup.history.late_orders || 0)}</strong></article>
              <article className="mto-customer-kpi"><span>Recovery Cases</span><strong>{Number(customerLookup.history.active_recovery_cases || 0)}</strong></article>
              <article className="mto-customer-kpi"><span>Total Value</span><strong>{Number(customerLookup.history.total_spend || 0).toFixed(0)}</strong></article>
            </div>
            <div className="mto-customer-meta-row">
              <span>Outstanding Balance: {Number(customerLookup.history.outstanding_balance || 0).toFixed(2)}</span>
              <span>Last Order: {customerLookup.history.last_order_date ? String(customerLookup.history.last_order_date).slice(0, 10) : '-'}</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Branch</th>
                    <th>Date</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(customerLookup.recentOrders || []).map((row) => (
                    <tr key={row.id}>
                      <td>
                        <button
                          type="button"
                          className="mto-history-order-link"
                          onClick={() => openReferenceIot(row.id, row.production_order_no)}
                          title="Open this order's IOT PDF as a reference"
                        >
                          {row.production_order_no}
                        </button>
                      </td>
                      <td>{row.order_type}</td>
                      <td>{row.status}</td>
                      <td>{row.ordered_from}</td>
                      <td>{String(row.order_date || '').slice(0, 10)}</td>
                      <td>{Number(row.product_price || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
        <div className="grid two">
          <label>
            Delivery Address
            <input
              name="deliveryAddress"
              value={form.deliveryAddress}
              onChange={updateField}
              placeholder="Where this order should be delivered"
              readOnly={form.deliveryAddressMatchesCustomer === 'true'}
              required
            />
          </label>
          <label>
            Same As CRM Address
            <input
              type="checkbox"
              name="deliveryAddressMatchesCustomer"
              checked={form.deliveryAddressMatchesCustomer === 'true'}
              onChange={updateField}
            />
          </label>
        </div>
      </section>

      <section className="mto-section">
        <h4>Order Details</h4>
        <div className="grid two">
          <label>
            Order Type
            <select name="orderType" value={form.orderType} onChange={updateField}>
              <option value="MTO">MTO</option>
              <option value="REFURBISHMENT">REFURBISHMENT</option>
              <option value="RETURN">RETURN</option>
            </select>
          </label>
          <label>
            Ordered From
            <select name="orderedFrom" value={form.orderedFrom} onChange={updateField} disabled={Boolean(lockedOutlet)}>
              {outlets.map((outlet) => (
                <option key={outlet} value={outlet}>{outlet}</option>
              ))}
            </select>
          </label>
          <label>
            {isRefurbishmentOrder ? 'Intake Date' : isReturnOrder ? 'Return Intake Date' : 'Order Date'}
            <input
              name="orderDate"
              type="date"
              value={form.orderDate}
              onChange={updateField}
              min={todayIso()}
              required
            />
          </label>
          <label>
            {isRefurbishmentOrder ? 'Promised Completion Date' : isReturnOrder ? 'Resolution Date' : 'Due Date'}
            {isMtoOrder ? (
              <select
                name="dueDate"
                value={form.dueDate}
                onChange={updateField}
                required
              >
                <option value="">Select due date with capacity</option>
                {capacityWindow.map((row) => (
                  <option
                    key={row.date}
                    value={row.date}
                    disabled={row.is_full}
                  >
                    {row.date} | {row.capacity_limit === null || row.capacity_limit === undefined
                      ? 'Open'
                      : row.is_full
                        ? `Full (${row.booked_count}/${row.capacity_limit})`
                        : `${row.remaining_capacity} left (${row.booked_count}/${row.capacity_limit})`}
                  </option>
                ))}
              </select>
            ) : (
              <input
                name="dueDate"
                type="date"
                value={form.dueDate}
                onChange={updateField}
                min={form.orderDate || todayIso()}
                required
              />
            )}
          </label>
          <label>
            {isRefurbishmentOrder ? 'Service Price' : isReturnOrder ? 'Order Value' : 'Product Price'}
            <input name="productPrice" type="number" min="0" step="0.01" value={form.productPrice} onChange={updateField} required />
          </label>
          {isMtoOrder && (
            <label>
              Split Payment
              <input
                type="checkbox"
                name="splitPaymentEnabled"
                checked={form.splitPaymentEnabled === 'true'}
                onChange={updateField}
              />
            </label>
          )}
          <label>
            {isMtoOrder && form.splitPaymentEnabled === 'true' ? 'Advance Split 1' : 'Advance Paid'}
            <input
              name={isMtoOrder && form.splitPaymentEnabled === 'true' ? 'splitAdvancePaidPrimary' : 'advancePaid'}
              type="number"
              min="0"
              step="0.01"
              value={isMtoOrder && form.splitPaymentEnabled === 'true' ? form.splitAdvancePaidPrimary : form.advancePaid}
              onChange={updateField}
            />
          </label>
          {isMtoOrder && form.splitPaymentEnabled === 'true' && (
            <label>
              Advance Split 2
              <input name="splitAdvancePaidSecondary" type="number" min="0" step="0.01" value={form.splitAdvancePaidSecondary} onChange={updateField} />
            </label>
          )}
          <label>
            Advance Payment Account
            <select name="advancePaymentAccountId" value={form.advancePaymentAccountId} onChange={updateField}>
              <option value="">Select account</option>
              {paymentAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>
              ))}
            </select>
          </label>
          {isMtoOrder && form.splitPaymentEnabled === 'true' && (
            <label>
              Second Payment Account
              <select name="splitAdvancePaymentAccountIdSecondary" value={form.splitAdvancePaymentAccountIdSecondary} onChange={updateField}>
                <option value="">Select account</option>
                {paymentAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.account_type})</option>
                ))}
              </select>
            </label>
          )}
          {isMtoOrder && form.splitPaymentEnabled === 'true' && (
            <label>
              Total Advance
              <input
                value={(
                  Number(form.splitAdvancePaidPrimary || 0)
                  + Number(form.splitAdvancePaidSecondary || 0)
                ).toFixed(2)}
                readOnly
              />
            </label>
          )}
        </div>
        {isMtoOrder && (
          <div className="order-capacity-section">
            <div className="order-capacity-section-head">
              <div>
                <span>Booking Capacity</span>
                <strong>MTO due-date availability</strong>
              </div>
              <p>
                {form.dueDate
                  ? `Selected date ${form.dueDate}`
                  : 'Select a due date from the capacity-aware list.'}
              </p>
            </div>
            <article className={`order-capacity-card ${capacityInfo?.is_full ? 'full' : ''}`}>
              <span>Selected Date Capacity</span>
              <strong>
                {!form.dueDate
                  ? 'Choose due date'
                  : capacityInfo?.capacity_limit === null || capacityInfo?.capacity_limit === undefined
                    ? 'No limit set'
                    : `${capacityInfo.remaining_capacity} remaining`}
              </strong>
              <p>
                {!form.dueDate
                  ? 'Pick the customer promise date and we will show booked vs available capacity.'
                  : capacityInfo?.capacity_limit === null || capacityInfo?.capacity_limit === undefined
                    ? 'Admin has not set a booking cap for this date yet.'
                    : `Booked ${capacityInfo.booked_count} of ${capacityInfo.capacity_limit} for ${form.dueDate}.`}
              </p>
              {capacityInfo?.notes ? <small>{capacityInfo.notes}</small> : null}
            </article>
            <div className="order-capacity-window">
              {capacityWindow.map((row) => (
                <button
                  key={row.date}
                  type="button"
                  className={`order-capacity-day ${row.is_full ? 'full' : ''} ${form.dueDate === row.date ? 'selected' : ''}`}
                  onClick={() => setForm((prev) => ({ ...prev, dueDate: row.date }))}
                >
                  <span>{row.date}</span>
                  <strong>
                    {row.capacity_limit === null || row.capacity_limit === undefined
                      ? 'Open'
                      : `${row.remaining_capacity} left`}
                  </strong>
                  <small>
                    {row.capacity_limit === null || row.capacity_limit === undefined
                      ? 'No cap'
                      : `${row.booked_count}/${row.capacity_limit}`}
                  </small>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="mto-section">
        <h4>
          {isMtoOrder ? 'Product Specification' : isRefurbishmentOrder ? 'Refurbishment Intake' : 'Return Intake'}
        </h4>
        {isMtoOrder && (
          <div className="grid three">
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
              <label key={key}>
                {label}
                <input
                  name={key}
                  value={form[key]}
                  onChange={updateField}
                  required={key === 'productName'}
                />
              </label>
            ))}
          </div>
        )}
        {isRefurbishmentOrder && (
          <>
            <div className="grid three">
              <label>
                Item Name
                <input name="productName" value={form.productName} onChange={updateField} placeholder="Loafer, oxford, sandal..." required />
              </label>
              <label>
                Size
                <input name="size" value={form.size} onChange={updateField} placeholder="Customer shoe size" />
              </label>
              <label>
                Colour
                <input name="colour" value={form.colour} onChange={updateField} placeholder="Black, tan, burgundy..." />
              </label>
              <label>
                Sole Type
                <input name="sole" value={form.sole} onChange={updateField} placeholder="Leather, rubber, crepe..." />
              </label>
              <label>
                Last Number
                <input name="lastNumber" value={form.lastNumber} onChange={updateField} placeholder="If known" />
              </label>
            </div>
            <div className="grid two">
              <label>
                Item Condition
                <input name="itemCondition" value={form.itemCondition} onChange={updateField} placeholder="Used / damaged / worn / excellent" />
              </label>
              <label>
                Refurbishment Type
                <input name="refurbishmentType" value={form.refurbishmentType} onChange={updateField} placeholder="Polish, sole change, stitching repair..." />
              </label>
              <label>
                Issue Description
                <textarea name="issueDescription" value={form.issueDescription} onChange={updateField} rows={3} required />
              </label>
              <label>
                Work Requested
                <textarea name="workRequested" value={form.workRequested} onChange={updateField} rows={3} required />
              </label>
              <label className="mto-span-two">
                Accessories Received
                <input name="accessoriesReceived" value={form.accessoriesReceived} onChange={updateField} placeholder="Box, dust bag, laces, extra sole, receipt..." />
              </label>
            </div>
          </>
        )}
        {isReturnOrder && (
          <>
            <div className="grid three">
              <label>
                Item Name
                <input name="productName" value={form.productName} onChange={updateField} placeholder="Returned item name" required />
              </label>
              <label>
                Size
                <input name="size" value={form.size} onChange={updateField} />
              </label>
              <label>
                Colour
                <input name="colour" value={form.colour} onChange={updateField} />
              </label>
            </div>
          </>
        )}
        {isRefurbishmentOrder && (
          <div className="grid two">
            <label className="mto-span-two">
              Service Notes
              <textarea
                name="comments"
                value={form.comments}
                onChange={updateField}
                placeholder="Internal repair instructions, customer commitments, caution points."
                rows={4}
              />
            </label>
          </div>
        )}
        {isReturnOrder && (
          <div className="grid two">
            <label>
              Return Condition
              <input name="returnCondition" value={form.returnCondition || ''} onChange={updateField} placeholder="Unused / Worn / Damaged" />
            </label>
            <label>
              Return Reason
              <textarea name="returnReason" value={form.returnReason || ''} onChange={updateField} rows={3} required />
            </label>
            <label>
              Return Request
              <textarea name="returnRequest" value={form.returnRequest || ''} onChange={updateField} rows={3} required />
            </label>
            <label className="mto-span-two">
              Accessories Received
              <input name="returnAccessoriesReceived" value={form.returnAccessoriesReceived || ''} onChange={updateField} placeholder="Box, bag, invoice, etc." />
            </label>
          </div>
        )}
        {!isRefurbishmentOrder && (
          <label className="mto-comments-field">
            Comments
            <textarea
              name="comments"
              value={form.comments}
              onChange={updateField}
              placeholder="Add internal comments (supports 30+ words)."
              rows={4}
            />
          </label>
        )}
      </section>

      <section className="mto-section">
        <h4>Reference Uploads</h4>
        <div className="grid two">
          <label>{isRefurbishmentOrder ? 'Item Overview Photo' : 'Design Reference'}<input type="file" accept="image/*" onChange={(e) => setFiles((p) => ({ ...p, designReference: e.target.files?.[0] }))} /></label>
          <label>{isRefurbishmentOrder ? 'Condition / Colour Photo' : 'Colour Reference'}<input type="file" accept="image/*" onChange={(e) => setFiles((p) => ({ ...p, colourReference: e.target.files?.[0] }))} /></label>
          <label>{isRefurbishmentOrder ? 'Sole / Bottom Photo' : 'Sole Reference'}<input type="file" accept="image/*" onChange={(e) => setFiles((p) => ({ ...p, soleReference: e.target.files?.[0] }))} /></label>
          <label>{isRefurbishmentOrder ? 'Damage Detail Photo' : 'Additional Reference'}<input type="file" accept="image/*" onChange={(e) => setFiles((p) => ({ ...p, additionalReference: e.target.files?.[0] }))} /></label>
        </div>
      </section>

      <div className="actions-cell">
        <button type="submit">Create Order</button>
        <button type="button" className="button-secondary" onClick={onCancel}>Cancel</button>
      </div>

      {message && <p>{message}</p>}
      {lastCreated.barcode && (
        <div className="card">
          <h4>Scannable Barcode</h4>
          <Barcode value={lastCreated.barcode} format="CODE128" width={1.5} height={50} displayValue />
        </div>
      )}
    </form>
  );
}
