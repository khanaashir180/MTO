import { useCallback, useEffect, useState } from 'react';
import api from '../api/client';
import { useOutlets } from '../context/OutletsContext';
import { useAuth } from '../context/AuthContext';

const FRONTEND_RIGHTS = [
  { key: 'admin_access', label: 'Admin Access' },
  { key: 'admin_manage_users', label: 'Manage Users' },
  { key: 'admin_manage_roles', label: 'Manage Role Templates' },
  { key: 'admin_manage_order_capacity', label: 'Manage Order Capacity' },
  { key: 'admin_manage_outlets', label: 'Manage Outlets' },
  { key: 'admin_view_audit', label: 'View Audit Logs' },
  { key: 'retail_view_dashboard', label: 'Retail Dashboard' },
  { key: 'retail_create_order', label: 'Create Retail Orders' },
  { key: 'retail_edit_order', label: 'Edit Retail Orders' },
  { key: 'retail_view_sales_report', label: 'Retail Sales Report' },
  { key: 'retail_manage_delivery', label: 'Retail Delivery Controls' },
  { key: 'retail_view_customer_docs', label: 'Retail Customer Documents' },
  { key: 'retail_manage_replacements', label: 'Manage Replacements' },
  { key: 'retail_view_head_reports', label: 'Retail Head Replacement Reports' },
  { key: 'production_view_dashboard', label: 'Production Dashboard' },
  { key: 'production_view_stage_detail', label: 'Production Stage Detail' },
  { key: 'production_run_verification', label: 'Verification Console' },
  { key: 'production_manage_stage_actions', label: 'Production Stage Actions' },
  { key: 'production_manage_targets', label: 'Production Targets' },
  { key: 'production_approve_targets', label: 'Approve Production Targets' },
  { key: 'production_manage_notifications', label: 'Production Notifications' },
  { key: 'finance_view_module', label: 'Finance Module' },
  { key: 'finance_view_trial_balance', label: 'Trial Balance' },
  { key: 'finance_manage_settings', label: 'Finance Settings' },
  { key: 'crm_view_module', label: 'CRM Module' },
  { key: 'crm_manage_records', label: 'CRM Records' },
  { key: 'crm_manage_approvals', label: 'CRM Approvals' },
  { key: 'mrp_view_module', label: 'MRP Module' },
  { key: 'mrp_manage_planning', label: 'MRP Planning' },
  { key: 'mrp_manage_integrations', label: 'MRP Integrations' },
  { key: 'raw_store_view_module', label: 'Raw Store Module' },
  { key: 'raw_store_manage_transactions', label: 'Raw Store Transactions' },
  { key: 'raw_store_manage_rules', label: 'Raw Store Rules' },
];

const ASSIGNABLE_ROLES = [
  { key: 'SHOP_MANAGER', label: 'Shop Manager' },
  { key: 'RETAIL_STAFF', label: 'Retail Staff' },
  { key: 'RETAIL_HEAD', label: 'Retail Head' },
  { key: 'PRODUCTION_SUPERVISOR', label: 'Production Supervisor' },
  { key: 'PRODUCTION_MANAGER', label: 'Production Manager' },
  { key: 'FINANCE', label: 'Finance' },
  { key: 'CUSTOMER_SERVICE', label: 'Customer Service' },
  { key: 'SUPER_USER', label: 'Super User' },
];

function OutletSettings() {
  const {
    outlets,
    outletRecords,
    addOutlet,
    removeOutlet,
    loading,
    error,
  } = useOutlets();
  const [name, setName] = useState('');
  const [outletQuery, setOutletQuery] = useState('');
  const [selectedOutletId, setSelectedOutletId] = useState(null);
  const [credentialLoading, setCredentialLoading] = useState(false);
  const [credentialSaving, setCredentialSaving] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [message, setMessage] = useState('');

  const filteredOutlets = outletRecords.filter((o) =>
    o.name.toLowerCase().includes(outletQuery.trim().toLowerCase())
  );
  const visibleOutlets = outletQuery.trim() ? filteredOutlets : outletRecords;

  async function onAdd(event) {
    event.preventDefault();
    const result = await addOutlet(name);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setName('');
    setMessage('Outlet added');
  }

  async function onRemove(outletId) {
    const result = await removeOutlet(outletId);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setMessage('Outlet deleted');
    if (selectedOutletId === outletId) {
      setSelectedOutletId(null);
      setCredentials(null);
      setOutletQuery('');
    }
  }

  async function onSelectOutlet(outlet) {
    setSelectedOutletId(outlet.id);
    setCredentialLoading(true);
    setMessage('');
    try {
      const { data } = await api.get(`/outlets/${outlet.id}/credentials`);
      setCredentials(data.credentials || { username: '', password: '' });
    } catch (error) {
      setCredentials(null);
      setMessage(error.response?.data?.message || 'Unable to load outlet credentials');
    } finally {
      setCredentialLoading(false);
    }
  }

  return (
    <section className="card">
      <h3>Outlet Settings</h3>
      <form onSubmit={onAdd} className="actions-cell">
        <input placeholder="Add new outlet" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <button type="submit" disabled={loading || outlets.length >= 50}>Add Outlet</button>
      </form>
      <p>Active outlets: {outlets.length}/50</p>
      <p>Saved outlet credentials are valid login accounts for booking MTO orders.</p>
      {error && <p>{error}</p>}
      {outlets.length >= 50 && <p>Maximum 50 active outlets reached. Remove one to add another.</p>}
      <label>
        Active Outlets
        <input
          list="active-outlet-options"
          placeholder="Type or select active outlet"
          value={outletQuery}
          onChange={(e) => {
            const value = e.target.value;
            setOutletQuery(value);
            const outlet = outletRecords.find((x) => x.name.toLowerCase() === value.trim().toLowerCase());
            if (outlet) {
              onSelectOutlet(outlet);
            } else {
              setSelectedOutletId(null);
              setCredentials(null);
            }
          }}
        />
        <datalist id="active-outlet-options">
          {visibleOutlets.map((outlet) => (
            <option key={outlet.id} value={outlet.name} />
          ))}
        </datalist>
      </label>
      {message && <p>{message}</p>}

      <div className="actions-cell">
        {selectedOutletId && (
          <button type="button" className="button-secondary" disabled={loading} onClick={() => onRemove(selectedOutletId)}>
            Remove Selected
          </button>
        )}
      </div>
      {!outletQuery.trim() && <p>Type to filter or choose from suggestions.</p>}
      {outletQuery.trim() && filteredOutlets.length === 0 && <p>No outlets found.</p>}

      {selectedOutletId && (
        <div className="card">
          <h4>Outlet Login Credentials</h4>
          {credentialLoading && <p>Loading...</p>}
          {!credentialLoading && !credentials && <p>No credentials available for this outlet.</p>}
          {!credentialLoading && credentials && (
            <>
              <div className="grid two">
                <label>
                  Username
                  <input
                    value={credentials.username || ''}
                    onChange={(e) => setCredentials((p) => ({ ...(p || {}), username: e.target.value }))}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={credentials.password || ''}
                    placeholder="Enter new password (leave blank to keep current)"
                    onChange={(e) => setCredentials((p) => ({ ...(p || {}), password: e.target.value }))}
                  />
                </label>
              </div>
              <p className="form-hint">For security, current outlet passwords are never displayed.</p>
              <div className="actions-cell">
                <button
                  type="button"
                  disabled={credentialSaving || !selectedOutletId}
                  onClick={async () => {
                    try {
                      setCredentialSaving(true);
                      setMessage('');
                      const payload = {
                        username: String(credentials.username || '').trim(),
                        password: String(credentials.password || '').trim(),
                      };
                      const { data } = await api.put(`/outlets/${selectedOutletId}/credentials`, payload);
                      setCredentials(data.credentials || payload);
                      setMessage('Credentials updated');
                    } catch (error) {
                      setMessage(error.response?.data?.message || 'Unable to update credentials');
                    } finally {
                      setCredentialSaving(false);
                    }
                  }}
                >
                  {credentialSaving ? 'Saving...' : 'Save Credentials'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function UsersSettings({ canManageUsers }) {
  const [users, setUsers] = useState([]);
  const [stages, setStages] = useState([]);
  const [securityDashboard, setSecurityDashboard] = useState({ audits: [], settings: [] });
  const [message, setMessage] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [filter, setFilter] = useState({ search: '', status: 'ALL' });
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    role: 'SHOP_MANAGER',
    stageAccess: '',
    outletId: '',
    department: '',
  });
  const { outletRecords } = useOutlets();

  useEffect(() => {
    async function load() {
      if (!canManageUsers) return;
      const [usersRes, stagesRes, securityRes] = await Promise.all([
        api.get('/auth/users'),
        api.get('/auth/stages'),
        api.get('/auth/security-dashboard'),
      ]);
      setUsers(usersRes.data.users || []);
      setStages(stagesRes.data.stages || []);
      setSecurityDashboard(securityRes.data || { audits: [], settings: [] });
    }

    load().catch(() => setMessage('Unable to load users/settings data'));
  }, [canManageUsers]);

  async function reload() {
    if (!canManageUsers) return;
    const [usersRes, stagesRes, securityRes] = await Promise.all([
      api.get('/auth/users'),
      api.get('/auth/stages'),
      api.get('/auth/security-dashboard'),
    ]);
    setUsers(usersRes.data.users || []);
    setStages(stagesRes.data.stages || []);
    setSecurityDashboard(securityRes.data || { audits: [], settings: [] });
  }

  async function onSubmit(event) {
    event.preventDefault();
    try {
      setMessage('');
      setInviteLink('');
      const { data } = await api.post('/auth/register', {
        ...form,
        stageAccess: form.role === 'PRODUCTION_SUPERVISOR' ? Number(form.stageAccess) : null,
        outletId: ['SHOP_MANAGER', 'RETAIL_STAFF'].includes(form.role) && form.outletId ? Number(form.outletId) : null,
        department: form.department || null,
      });
      setMessage(`Invite created (${data.emailStatus || 'logged'})`);
      setInviteLink(data.inviteLink || '');
      setForm({ fullName: '', email: '', role: 'SHOP_MANAGER', stageAccess: '', outletId: '', department: '' });
      await reload();
    } catch (error) {
      setMessage(error.response?.data?.message || 'User creation failed');
    }
  }

  if (!canManageUsers) {
    return (
      <section className="card">
        <h3>User Management</h3>
        <p>You do not have rights to manage users.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h3>User Management</h3>
      <form onSubmit={onSubmit} className="grid two">
        <label>Full Name<input value={form.fullName} onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))} required /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required /></label>
        <label>Department<input value={form.department} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} /></label>
        <label>
          Role
          <select value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}>
            {ASSIGNABLE_ROLES.map((roleOption) => (
              <option key={roleOption.key} value={roleOption.key}>{roleOption.label}</option>
            ))}
          </select>
        </label>
        {['SHOP_MANAGER', 'RETAIL_STAFF'].includes(form.role) && (
          <label>
            Outlet
            <select value={form.outletId} onChange={(e) => setForm((p) => ({ ...p, outletId: e.target.value }))} required>
              <option value="">Select outlet</option>
              {outletRecords.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
            </select>
          </label>
        )}
        {form.role === 'PRODUCTION_SUPERVISOR' && (
          <label>
            Stage Access
            <select value={form.stageAccess} onChange={(e) => setForm((p) => ({ ...p, stageAccess: e.target.value }))} required>
              <option value="">Select stage</option>
              {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
          </label>
        )}
        <div className="actions-cell"><button type="submit">Send Invite</button></div>
      </form>
      {message && <p>{message}</p>}
      {inviteLink ? <p>Invite link: <a href={inviteLink} target="_blank" rel="noreferrer">{inviteLink}</a></p> : null}

      <div className="actions-cell">
        <input placeholder="Search users" value={filter.search} onChange={(e) => setFilter((p) => ({ ...p, search: e.target.value }))} />
        <select value={filter.status} onChange={(e) => setFilter((p) => ({ ...p, status: e.target.value }))}>
          <option value="ALL">All</option>
          <option value="INVITED">Invited</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
          <option value="REVOKED">Revoked</option>
          <option value="LOCKED">Locked</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Outlet</th>
              <th>Stage</th>
              <th>Status</th>
              <th>Last Login</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users
              .filter((u) => {
                const query = filter.search.trim().toLowerCase();
                const matchesSearch = !query || `${u.full_name} ${u.email} ${u.role}`.toLowerCase().includes(query);
                let status = 'ACTIVE';
                if (u.invite_revoked_at) status = 'REVOKED';
                else if (!u.invite_accepted_at) status = new Date(u.invite_expires_at || 0) < new Date() ? 'EXPIRED' : 'INVITED';
                else if (u.locked_until && new Date(u.locked_until) > new Date()) status = 'LOCKED';
                return matchesSearch && (filter.status === 'ALL' || filter.status === status);
              })
              .map((u) => (
              <tr key={u.id}>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{u.outlet_name || '-'}</td>
                <td>{u.stage_name || '-'}</td>
                <td>{u.invite_revoked_at ? 'Revoked' : u.invite_accepted_at ? 'Active' : (new Date(u.invite_expires_at || 0) < new Date() ? 'Expired' : 'Invited')}</td>
                <td>{u.last_login_at ? String(u.last_login_at).slice(0, 19).replace('T', ' ') : '-'}</td>
                <td className="actions-cell">
                  <button type="button" className="button-secondary" onClick={async () => { const { data } = await api.post(`/auth/users/${u.id}/resend-invite`); setInviteLink(data.inviteLink || ''); await reload(); }}>Resend</button>
                  <button type="button" className="button-secondary" onClick={async () => { await api.post(`/auth/users/${u.id}/revoke-invite`); await reload(); }}>Revoke</button>
                  <button type="button" className="button-secondary" onClick={async () => { await api.post(`/auth/users/${u.id}/status`, { action: 'suspend' }); await reload(); }}>Suspend</button>
                  <button type="button" className="button-secondary" onClick={async () => { await api.post(`/auth/users/${u.id}/status`, { action: 'reactivate' }); await reload(); }}>Reactivate</button>
                  <button type="button" className="button-secondary" onClick={async () => { await api.post(`/auth/users/${u.id}/status`, { action: 'force_password_reset' }); await reload(); }}>Force Reset</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid two">
        <section className="card">
          <h4>Security Settings</h4>
          <div className="actions-cell">
            <button type="button" onClick={async () => { await api.post('/auth/security-settings', { settingKey: 'PASSWORD_POLICY', settingValue: { min_length: 10, history_count: 5 } }); await reload(); }}>Password Policy</button>
            <button type="button" onClick={async () => { await api.post('/auth/security-settings', { settingKey: 'LOCKOUT_POLICY', settingValue: { max_failed_attempts: 5, lockout_minutes: 30 } }); await reload(); }}>Lockout Policy</button>
            <button type="button" onClick={async () => { await api.post('/auth/security-settings', { settingKey: 'TWO_FACTOR_POLICY', settingValue: { enabled_roles: ['SUPER_USER', 'FINANCE', 'PRODUCTION_MANAGER'] } }); await reload(); }}>2FA Policy</button>
          </div>
          <pre className="log-json">{JSON.stringify(securityDashboard.settings || [], null, 2)}</pre>
        </section>
        <section className="card">
          <h4>User Audit</h4>
          <div className="table-wrap">
            <table>
              <thead><tr><th>When</th><th>Action</th><th>User</th><th>Actor</th></tr></thead>
              <tbody>
                {(securityDashboard.audits || []).slice(0, 20).map((log) => (
                  <tr key={log.id}>
                    <td>{String(log.created_at).slice(0, 19).replace('T', ' ')}</td>
                    <td>{log.action_type}</td>
                    <td>{log.user_name || '-'}</td>
                    <td>{log.actor_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </section>
  );
}

function ChangeLogsSettings({ canManageUsers }) {
  const [logs, setLogs] = useState([]);
  const [orderId, setOrderId] = useState('');
  const [message, setMessage] = useState('');

  const loadLogs = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (orderId) qs.set('orderId', orderId);
      qs.set('limit', '100');
      const { data } = await api.get(`/orders/change-logs?${qs.toString()}`);
      setLogs(data.logs || []);
      setMessage('');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to load change logs');
    }
  }, [orderId]);

  useEffect(() => {
    if (canManageUsers) loadLogs();
  }, [canManageUsers, loadLogs]);

  if (!canManageUsers) return null;

  return (
    <section className="card">
      <h3>Change Logs</h3>
      <div className="actions-cell">
        <input placeholder="Filter by Order ID" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
        <button type="button" onClick={loadLogs}>Load Logs</button>
      </div>
      {message && <p>{message}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Order</th>
              <th>Source</th>
              <th>By</th>
              <th>Before / After</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{String(log.changed_at).slice(0, 19).replace('T', ' ')}</td>
                <td>{log.order_id}</td>
                <td>{log.change_source}</td>
                <td>{log.changed_by_name || log.changed_by_email || '-'}</td>
                <td>
                  <details>
                    <summary>View</summary>
                    <pre className="log-json">Before: {JSON.stringify(log.before_data, null, 2)}</pre>
                    <pre className="log-json">After: {JSON.stringify(log.after_data, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function RoleRightsSettings({ canManageRoleRights }) {
  const [roles, setRoles] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [rights, setRights] = useState({});
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      if (!canManageRoleRights) return;
      const { data } = await api.get('/auth/role-rights');
      const rows = data.roles || [];
      setRoles(rows);
      if (rows.length) {
        const first = rows[0];
        setSelectedRole(first.role);
        setRights(first.permissions || {});
      }
    }
    load().catch(() => setMessage('Unable to load role rights'));
  }, [canManageRoleRights]);

  function onRoleChange(roleName) {
    setSelectedRole(roleName);
    const target = roles.find((r) => r.role === roleName);
    setRights(target?.permissions || {});
    setMessage('');
  }

  function toggleRight(key) {
    setRights((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function onSave() {
    try {
      setMessage('');
      await api.put(`/auth/role-rights/${selectedRole}`, { permissions: rights });
      setMessage(`Rights saved for ${selectedRole}`);
      const { data } = await api.get('/auth/role-rights');
      const rows = data.roles || [];
      setRoles(rows);
      const target = rows.find((r) => r.role === selectedRole);
      if (target) setRights(target.permissions || {});
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save role rights');
    }
  }

  if (!canManageRoleRights) {
    return null;
  }

  return (
    <section className="card">
      <h3>Role Rights (ERP)</h3>
      <div className="actions-cell">
        <label>
          Role
          <select value={selectedRole} onChange={(e) => onRoleChange(e.target.value)}>
            {roles.map((r) => (
              <option key={r.role} value={r.role}>{r.role}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onSave} disabled={!selectedRole}>Save Rights</button>
      </div>
      <div className="grid two">
        {FRONTEND_RIGHTS.map((item) => (
          <label key={item.key}>
            <input
              type="checkbox"
              checked={Boolean(rights[item.key])}
              onChange={() => toggleRight(item.key)}
            />{' '}
            {item.label}
          </label>
        ))}
      </div>
      {message && <p>{message}</p>}
    </section>
  );
}

function OrderCapacitySettings({ canManageOrderCapacity }) {
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('');
  const [form, setForm] = useState({
    capacityDate: new Date().toISOString().slice(0, 10),
    orderType: 'MTO',
    capacityLimit: 500,
    notes: '',
  });

  const loadRows = useCallback(async () => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const nextMonth = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
      const { data } = await api.get('/orders/capacity', {
        params: {
          dateFrom: today,
          dateTo: nextMonth,
          orderType: 'MTO',
        },
      });
      setRows(data.capacities || []);
      setMessage('');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to load order capacity');
    }
  }, []);

  useEffect(() => {
    if (!canManageOrderCapacity) return;
    loadRows();
  }, [canManageOrderCapacity, loadRows]);

  async function onSubmit(event) {
    event.preventDefault();
    try {
      await api.post('/orders/capacity', {
        capacityDate: form.capacityDate,
        orderType: form.orderType,
        capacityLimit: Number(form.capacityLimit || 0),
        notes: form.notes,
      });
      setMessage(`Capacity saved for ${form.capacityDate}`);
      await loadRows();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save order capacity');
    }
  }

  if (!canManageOrderCapacity) return null;

  return (
    <section className="card">
      <h3>Order Capacity Settings</h3>
      <p>Manage how many MTO bookings can be promised on each due date.</p>
      <form onSubmit={onSubmit} className="grid two">
        <label>
          Capacity Date
          <input type="date" value={form.capacityDate} onChange={(e) => setForm((prev) => ({ ...prev, capacityDate: e.target.value }))} required />
        </label>
        <label>
          Order Type
          <select value={form.orderType} onChange={(e) => setForm((prev) => ({ ...prev, orderType: e.target.value }))}>
            <option value="MTO">MTO</option>
          </select>
        </label>
        <label>
          Capacity Limit
          <input type="number" min="0" value={form.capacityLimit} onChange={(e) => setForm((prev) => ({ ...prev, capacityLimit: e.target.value }))} required />
        </label>
        <label>
          Notes
          <input value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Optional note for booking team" />
        </label>
        <div className="actions-cell">
          <button type="submit">Save Capacity</button>
          <button type="button" className="button-secondary" onClick={loadRows}>Refresh</button>
        </div>
      </form>
      {message && <p>{message}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Capacity</th>
              <th>Booked</th>
              <th>Remaining</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.date}-${row.order_type}`}>
                <td>{row.date}</td>
                <td>{row.order_type}</td>
                <td>{row.capacity_limit ?? '-'}</td>
                <td>{row.booked_count}</td>
                <td>{row.remaining_capacity ?? '-'}</td>
                <td>{row.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function SettingsPage({ user }) {
  const { user: authUser } = useAuth();
  const rights = authUser?.permissions || {};
  const canManageUsers = rights.admin_manage_users ?? (user?.role === 'SUPER_USER');
  const canManageOutlets = rights.admin_manage_outlets ?? (user?.role === 'SUPER_USER');
  const canViewChangeLogs = rights.admin_view_audit ?? (user?.role === 'SUPER_USER');
  const canManageRoleRights = rights.admin_manage_roles ?? (user?.role === 'SUPER_USER');
  const canManageOrderCapacity = rights.admin_manage_order_capacity ?? (user?.role === 'SUPER_USER');

  return (
    <section>
      <h2>Settings</h2>
      {canManageOutlets && <OutletSettings />}
      {!canManageOutlets && (
        <section className="card">
          <h3>Outlet Settings</h3>
          <p>You do not have rights to manage outlets.</p>
        </section>
      )}
      <UsersSettings canManageUsers={canManageUsers} />
      <ChangeLogsSettings canManageUsers={canViewChangeLogs} />
      <RoleRightsSettings canManageRoleRights={canManageRoleRights} />
      <OrderCapacitySettings canManageOrderCapacity={canManageOrderCapacity} />
    </section>
  );
}
