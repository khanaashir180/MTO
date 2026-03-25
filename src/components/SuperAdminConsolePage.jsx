import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useOutlets } from '../context/OutletsContext';

const WORKSPACES = [
  { key: 'command', label: 'One View' },
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'roles', label: 'Roles' },
  { key: 'governance', label: 'Governance' },
  { key: 'security', label: 'Security' },
  { key: 'audit', label: 'Audit' },
  { key: 'email', label: 'Email' },
];

const ROLE_OPTIONS = [
  { key: 'SHOP_MANAGER', label: 'Shop Manager' },
  { key: 'RETAIL_STAFF', label: 'Retail Staff' },
  { key: 'RETAIL_HEAD', label: 'Retail Head' },
  { key: 'PRODUCTION_SUPERVISOR', label: 'Production Supervisor' },
  { key: 'PRODUCTION_MANAGER', label: 'Production Manager' },
  { key: 'FINANCE', label: 'Finance' },
  { key: 'CUSTOMER_SERVICE', label: 'Customer Service' },
  { key: 'SUPER_USER', label: 'Super User' },
];
const RIGHT_LABELS = {
  admin_access: 'Admin Access',
  admin_manage_users: 'Manage Users',
  admin_manage_roles: 'Manage Role Templates',
  admin_clone_roles: 'Clone And Reset Roles',
  admin_manage_scope_rules: 'Manage Scope Rules',
  admin_manage_permission_requests: 'Permission Change Requests',
  admin_view_effective_permissions: 'Effective Permission Preview',
  admin_manage_order_capacity: 'Retail Order Capacity',
  admin_manage_outlets: 'Manage Outlets',
  admin_view_audit: 'View Audit Logs',
  retail_view_dashboard: 'Retail Dashboard',
  retail_create_order: 'Create Retail Orders',
  retail_edit_order: 'Edit Retail Orders',
  retail_view_sales_report: 'Retail Sales Reports',
  retail_manage_delivery: 'Retail Delivery Controls',
  retail_view_customer_docs: 'Retail Customer Documents',
  retail_manage_replacements: 'Manage Replacements',
  retail_view_head_reports: 'Retail Head Replacement Reports',
  production_view_dashboard: 'Production Dashboard',
  production_view_stage_detail: 'Production Stage Detail',
  production_run_verification: 'Verification Console',
  production_manage_stage_actions: 'Production Stage Actions',
  production_manage_targets: 'Production Targets',
  production_approve_targets: 'Approve Targets',
  production_manage_notifications: 'Production Notifications',
  finance_view_module: 'Finance Module',
  finance_view_trial_balance: 'Trial Balance',
  finance_manage_settings: 'Finance Settings',
  crm_view_module: 'CRM Module',
  crm_manage_records: 'CRM Records',
  crm_manage_approvals: 'CRM Approvals',
  mrp_view_module: 'MRP Module',
  mrp_manage_planning: 'MRP Planning',
  mrp_manage_integrations: 'MRP Integrations',
  raw_store_view_module: 'Raw Store Module',
  raw_store_manage_transactions: 'Raw Store Transactions',
  raw_store_manage_rules: 'Raw Store Rules',
};

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function normalizeUserStatus(user) {
  if (user.invite_revoked_at) return 'REVOKED';
  if (user.suspended_at && user.is_active === false) return 'SUSPENDED';
  if (!user.invite_accepted_at) {
    if (user.invite_expires_at && new Date(user.invite_expires_at) < new Date()) return 'EXPIRED';
    return 'INVITED';
  }
  if (user.locked_until && new Date(user.locked_until) > new Date()) return 'LOCKED';
  if (user.force_password_reset) return 'FORCE_RESET';
  return user.is_active ? 'ACTIVE' : 'INACTIVE';
}

function JsonEditor({ label, value, onChange }) {
  return (
    <label className="admin-form-block">
      <span>{label}</span>
      <textarea value={value} rows={7} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ScopeRuleEditor({ scopes, onChange, targetLabel }) {
  function updateScope(index, field, value) {
    onChange(scopes.map((entry, currentIndex) => (currentIndex === index ? { ...entry, [field]: value } : entry)));
  }

  function addScope() {
    onChange([...(scopes || []), { scopeType: 'OUTLET', scopeValue: '' }]);
  }

  function removeScope(index) {
    onChange(scopes.filter((_, currentIndex) => currentIndex !== index));
  }

  return (
    <section className="admin-console-panel">
      <div className="admin-panel-head">
        <div>
          <p className="admin-kicker">Scope Rules</p>
          <h3>{targetLabel}</h3>
        </div>
        <button type="button" className="button-secondary" onClick={addScope}>Add Scope Rule</button>
      </div>
      <div className="admin-form-stack">
        {(scopes || []).length ? scopes.map((entry, index) => (
          <div key={`${entry.scopeType}-${index}`} className="admin-filter-grid">
            <select value={entry.scopeType} onChange={(event) => updateScope(index, 'scopeType', event.target.value)}>
              <option value="OUTLET">Outlet</option>
              <option value="STAGE">Stage</option>
              <option value="DEPARTMENT">Department</option>
            </select>
            <input value={entry.scopeValue} onChange={(event) => updateScope(index, 'scopeValue', event.target.value)} placeholder="Scope value" />
            <button type="button" className="button-secondary" onClick={() => removeScope(index)}>Remove</button>
          </div>
        )) : <p>No scope rules configured.</p>}
      </div>
    </section>
  );
}

export default function SuperAdminConsolePage() {
  const { user } = useAuth();
  const { outletRecords } = useOutlets();
  const [workspace, setWorkspace] = useState(new URLSearchParams(window.location.search).get('workspace') || 'overview');
  const [users, setUsers] = useState([]);
  const [stages, setStages] = useState([]);
  const [securityDashboard, setSecurityDashboard] = useState({ audits: [], settings: [], emailLogs: [], summary: {} });
  const [roleRights, setRoleRights] = useState([]);
  const [permissionCatalog, setPermissionCatalog] = useState([]);
  const [userOverrides, setUserOverrides] = useState([]);
  const [permissionRequests, setPermissionRequests] = useState([]);
  const [scopeRules, setScopeRules] = useState([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [selectedRights, setSelectedRights] = useState({});
  const [selectedRoleScopes, setSelectedRoleScopes] = useState([]);
  const [effectiveRolePreview, setEffectiveRolePreview] = useState(null);
  const [roleCompare, setRoleCompare] = useState({ leftRole: '', rightRole: '', result: null });
  const [roleClone, setRoleClone] = useState({ sourceRole: '', targetRole: '', copyScopes: true });
  const [selectedOverrideUserId, setSelectedOverrideUserId] = useState('');
  const [selectedOverrideRights, setSelectedOverrideRights] = useState({});
  const [selectedUserScopes, setSelectedUserScopes] = useState([]);
  const [effectiveUserPreview, setEffectiveUserPreview] = useState(null);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [message, setMessage] = useState('');
  const [inviteLink, setInviteLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ search: '', status: 'ALL', role: 'ALL', emailStatus: 'ALL' });
  const [form, setForm] = useState({ fullName: '', email: '', role: 'SHOP_MANAGER', stageAccess: '', outletId: '', department: '' });
  const [settingsDraft, setSettingsDraft] = useState({
    PASSWORD_POLICY: '{\n  "min_length": 10,\n  "history_count": 5\n}',
    LOCKOUT_POLICY: '{\n  "max_failed_attempts": 5,\n  "lockout_minutes": 30\n}',
    TWO_FACTOR_POLICY: '{\n  "enabled_roles": ["SUPER_USER", "FINANCE", "PRODUCTION_MANAGER"]\n}',
  });
  const [orderCapacityRows, setOrderCapacityRows] = useState([]);
  const [capacityForm, setCapacityForm] = useState({ capacityDate: '', orderType: 'MTO', capacityLimit: 500, notes: '' });

  useEffect(() => {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('page', 'admin');
    nextUrl.searchParams.set('workspace', workspace);
    window.history.replaceState({}, '', nextUrl.toString());
  }, [workspace]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const [usersRes, stagesRes, securityRes, rightsRes, overridesRes, requestsRes, scopeRulesRes, capacityRes] = await Promise.all([
        api.get('/auth/users'),
        api.get('/auth/stages'),
        api.get('/auth/security-dashboard'),
        api.get('/auth/role-rights'),
        api.get('/auth/user-permission-overrides'),
        api.get('/auth/permission-change-requests'),
        api.get('/auth/scope-rules'),
        api.get('/orders/capacity', { params: { dateFrom: new Date().toISOString().slice(0, 10), dateTo: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10), orderType: 'MTO' } }),
      ]);
      const nextUsers = usersRes.data.users || [];
      const nextStages = stagesRes.data.stages || [];
      const nextSecurity = securityRes.data || { audits: [], settings: [], emailLogs: [], summary: {} };
      const nextRights = rightsRes.data.roles || [];
      const nextCatalog = rightsRes.data.permissionCatalog || [];
      const nextOverrides = overridesRes.data.users || [];
      const nextRequests = requestsRes.data.requests || [];
      const nextScopeRules = scopeRulesRes.data.scopeRules || [];
      const nextCapacityRows = capacityRes.data.capacities || [];
      setUsers(nextUsers);
      setStages(nextStages);
      setSecurityDashboard(nextSecurity);
      setRoleRights(nextRights);
      setPermissionCatalog(nextCatalog);
      setUserOverrides(nextOverrides);
      setPermissionRequests(nextRequests);
      setScopeRules(nextScopeRules);
      setOrderCapacityRows(nextCapacityRows);
      if (nextRights.length) {
        const initialRole = nextRights.find((row) => row.role === selectedRole)?.role || nextRights[0].role;
        setSelectedRole(initialRole);
        setSelectedRights(nextRights.find((row) => row.role === initialRole)?.permissions || {});
        setSelectedRoleScopes((nextRights.find((row) => row.role === initialRole)?.scope_rules || []).map((entry) => ({ scopeType: entry.scope_type, scopeValue: entry.scope_value })));
        setRoleCompare((prev) => ({ ...prev, leftRole: prev.leftRole || initialRole, rightRole: prev.rightRole || (nextRights[1]?.role || initialRole) }));
        setRoleClone((prev) => ({ ...prev, sourceRole: prev.sourceRole || initialRole, targetRole: prev.targetRole || (nextRights[1]?.role || initialRole) }));
      }
      if (nextOverrides.length) {
        const initialUserId = nextOverrides.find((row) => row.id === Number(selectedOverrideUserId))?.id || nextOverrides[0].id;
        setSelectedOverrideUserId(String(initialUserId));
        setSelectedOverrideRights(nextOverrides.find((row) => row.id === initialUserId)?.permissions || {});
        setSelectedUserScopes((nextOverrides.find((row) => row.id === initialUserId)?.scope_rules || []).map((entry) => ({ scopeType: entry.scope_type, scopeValue: entry.scope_value })));
      }
      const settingsMap = Object.fromEntries((nextSecurity.settings || []).map((row) => [row.setting_key, row.setting_value]));
      setSettingsDraft({
        PASSWORD_POLICY: JSON.stringify(settingsMap.PASSWORD_POLICY || { min_length: 10, history_count: 5 }, null, 2),
        LOCKOUT_POLICY: JSON.stringify(settingsMap.LOCKOUT_POLICY || { max_failed_attempts: 5, lockout_minutes: 30 }, null, 2),
        TWO_FACTOR_POLICY: JSON.stringify(settingsMap.TWO_FACTOR_POLICY || { enabled_roles: ['SUPER_USER', 'FINANCE', 'PRODUCTION_MANAGER'] }, null, 2),
      });
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to load admin console');
    } finally {
      setLoading(false);
    }
  }, [selectedOverrideUserId, selectedRole]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    async function loadEffectiveRolePreview() {
      if (!selectedRole) return;
      try {
        const { data } = await api.get(`/auth/role-rights/${selectedRole}/effective`);
        setEffectiveRolePreview(data);
      } catch (_error) {
        setEffectiveRolePreview(null);
      }
    }
    loadEffectiveRolePreview();
  }, [selectedRole]);

  useEffect(() => {
    async function loadEffectiveUserPreview() {
      if (!selectedOverrideUserId) return;
      try {
        const { data } = await api.get(`/auth/user-permission-overrides/${selectedOverrideUserId}/effective`);
        setEffectiveUserPreview(data);
      } catch (_error) {
        setEffectiveUserPreview(null);
      }
    }
    loadEffectiveUserPreview();
  }, [selectedOverrideUserId]);

  const statusCounts = useMemo(() => users.reduce((acc, current) => {
    const key = normalizeUserStatus(current);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {}), [users]);

  const roleCounts = useMemo(() => users.reduce((acc, current) => {
    acc[current.role] = (acc[current.role] || 0) + 1;
    return acc;
  }, {}), [users]);

  const filteredUsers = useMemo(() => users.filter((entry) => {
    const query = filters.search.trim().toLowerCase();
    const status = normalizeUserStatus(entry);
    const searchMatches = !query || [entry.full_name, entry.email, entry.role, entry.outlet_name, entry.stage_name, entry.department].filter(Boolean).join(' ').toLowerCase().includes(query);
    const statusMatches = filters.status === 'ALL' || status === filters.status;
    const roleMatches = filters.role === 'ALL' || entry.role === filters.role;
    return searchMatches && statusMatches && roleMatches;
  }), [users, filters]);

  const pendingInvites = useMemo(() => users.filter((entry) => normalizeUserStatus(entry) === 'INVITED').slice(0, 8), [users]);
  const lockedUsers = useMemo(() => users.filter((entry) => normalizeUserStatus(entry) === 'LOCKED').slice(0, 8), [users]);
  const suspendedUsers = useMemo(() => users.filter((entry) => normalizeUserStatus(entry) === 'SUSPENDED').slice(0, 8), [users]);
  const resetUsers = useMemo(() => users.filter((entry) => entry.force_password_reset).slice(0, 8), [users]);
  const filteredEmailLogs = useMemo(() => (securityDashboard.emailLogs || []).filter((entry) => filters.emailStatus === 'ALL' || entry.delivery_status === filters.emailStatus), [securityDashboard.emailLogs, filters.emailStatus]);
  const pendingPermissionRequests = useMemo(() => permissionRequests.filter((entry) => entry.status === 'PENDING'), [permissionRequests]);

  function onRoleSelect(roleName) {
    setSelectedRole(roleName);
    setSelectedRights(roleRights.find((row) => row.role === roleName)?.permissions || {});
    setSelectedRoleScopes((roleRights.find((row) => row.role === roleName)?.scope_rules || []).map((entry) => ({ scopeType: entry.scope_type, scopeValue: entry.scope_value })));
  }

  function onOverrideUserSelect(userId) {
    setSelectedOverrideUserId(String(userId));
    setSelectedOverrideRights(userOverrides.find((row) => row.id === Number(userId))?.permissions || {});
    setSelectedUserScopes((userOverrides.find((row) => row.id === Number(userId))?.scope_rules || []).map((entry) => ({ scopeType: entry.scope_type, scopeValue: entry.scope_value })));
  }

  function toggleUserSelection(userId) {
    setSelectedUsers((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);
  }

  function toggleAllVisible() {
    const visibleIds = filteredUsers.map((entry) => entry.id);
    const allSelected = visibleIds.every((id) => selectedUsers.includes(id));
    if (allSelected) {
      setSelectedUsers((prev) => prev.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedUsers((prev) => Array.from(new Set([...prev, ...visibleIds])));
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    try {
      setMessage('');
      const payload = {
        ...form,
        stageAccess: form.role === 'PRODUCTION_SUPERVISOR' ? Number(form.stageAccess) : null,
        outletId: ['SHOP_MANAGER', 'RETAIL_STAFF'].includes(form.role) ? Number(form.outletId) : null,
        department: form.department || null,
      };
      const { data } = await api.post('/auth/register', payload);
      setInviteLink(data.inviteLink || '');
      setMessage(`Invite created for ${data.user?.full_name || form.fullName}`);
      setForm({ fullName: '', email: '', role: 'SHOP_MANAGER', stageAccess: '', outletId: '', department: '' });
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create user');
    }
  }

  async function runUserAction(userId, action) {
    try {
      setMessage('');
      const route = action === 'resend-invite' ? `/auth/users/${userId}/resend-invite` : action === 'revoke-invite' ? `/auth/users/${userId}/revoke-invite` : `/auth/users/${userId}/status`;
      const payload = action.includes('invite') ? {} : { action };
      const { data } = await api.post(route, payload);
      if (data.inviteLink) setInviteLink(data.inviteLink);
      setMessage(`Action completed: ${action}`);
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || `Unable to ${action}`);
    }
  }

  async function runBulkAction(action) {
    if (!selectedUsers.length) {
      setMessage('Select users first');
      return;
    }
    try {
      setMessage('');
      await api.post('/auth/users/bulk-action', { userIds: selectedUsers, action });
      setMessage(`Bulk action completed: ${action}`);
      setSelectedUsers([]);
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to apply bulk action');
    }
  }

  async function saveRoleRights() {
    try {
      setMessage('');
      await api.put(`/auth/role-rights/${selectedRole}`, { permissions: selectedRights });
      setMessage(`Role rights updated for ${selectedRole}`);
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save role rights');
    }
  }

  async function saveRoleScopes() {
    try {
      setMessage('');
      await api.post('/auth/scope-rules', { targetType: 'ROLE', targetKey: selectedRole, scopes: selectedRoleScopes });
      setMessage(`Role scope rules updated for ${selectedRole}`);
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save role scopes');
    }
  }

  async function saveUserOverrideRights() {
    try {
      setMessage('');
      await api.put(`/auth/user-permission-overrides/${selectedOverrideUserId}`, { permissions: selectedOverrideRights });
      setMessage('User rights override updated');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save user override rights');
    }
  }

  async function saveUserScopes() {
    try {
      setMessage('');
      await api.post('/auth/scope-rules', { targetType: 'USER', targetKey: selectedOverrideUserId, scopes: selectedUserScopes });
      setMessage('User scope rules updated');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save user scopes');
    }
  }

  async function resetRoleToTemplate() {
    try {
      setMessage('');
      await api.post(`/auth/role-rights/${selectedRole}/reset`);
      setMessage(`Role reset to template: ${selectedRole}`);
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to reset role');
    }
  }

  async function cloneRoleMatrix() {
    try {
      setMessage('');
      await api.post('/auth/role-rights/clone', roleClone);
      setMessage(`Cloned ${roleClone.sourceRole} into ${roleClone.targetRole}`);
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to clone role rights');
    }
  }

  async function compareRoleMatrix() {
    try {
      setMessage('');
      const { data } = await api.get('/auth/role-rights/compare', { params: { leftRole: roleCompare.leftRole, rightRole: roleCompare.rightRole } });
      setRoleCompare((prev) => ({ ...prev, result: data }));
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to compare roles');
    }
  }

  async function resetUserOverrides() {
    try {
      setMessage('');
      await api.post(`/auth/user-permission-overrides/${selectedOverrideUserId}/reset`);
      setMessage('User overrides reset to role defaults');
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to reset user overrides');
    }
  }

  async function createPermissionRequest(targetType, targetKey, requestedPermissions, requestedScopes, reason) {
    try {
      setMessage('');
      await api.post('/auth/permission-change-requests', {
        targetType,
        targetKey,
        requestType: 'UPDATE',
        requestedPermissions,
        requestedScopes,
        reason,
      });
      setMessage(`Permission change request submitted for ${targetType} ${targetKey}`);
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create permission change request');
    }
  }

  async function reviewPermissionRequest(requestId, action) {
    try {
      setMessage('');
      await api.post(`/auth/permission-change-requests/${requestId}/review`, { action });
      setMessage(`Permission request ${action.toLowerCase()}d`);
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to review permission request');
    }
  }

  async function saveSecuritySetting(key) {
    try {
      setMessage('');
      const parsed = JSON.parse(settingsDraft[key] || '{}');
      await api.post('/auth/security-settings', { settingKey: key, settingValue: parsed });
      setMessage(`${key} updated`);
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || `Unable to save ${key}`);
    }
  }

  async function saveOrderCapacity(event) {
    event.preventDefault();
    try {
      setMessage('');
      await api.post('/orders/capacity', {
        capacityDate: capacityForm.capacityDate,
        orderType: capacityForm.orderType,
        capacityLimit: Number(capacityForm.capacityLimit || 0),
        notes: capacityForm.notes,
      });
      setMessage(`Order capacity saved for ${capacityForm.capacityDate}`);
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to save order capacity');
    }
  }

  const summary = securityDashboard.summary || {};
  const adminHighlights = [
    { label: 'Users', value: summary.total_users || users.length || 0, note: 'All accounts across the platform' },
    { label: 'Pending Invites', value: summary.pending_invites || 0, note: 'Accounts waiting for acceptance' },
    { label: 'Permission Requests', value: pendingPermissionRequests.length, note: 'Rights changes awaiting approval' },
    { label: 'Locked Users', value: summary.locked_users || 0, note: 'Immediate security friction' },
    { label: 'Suspended', value: summary.suspended_users || 0, note: 'Lifecycle-controlled accounts' },
    { label: 'Scope Rules', value: scopeRules.length, note: 'Outlet, stage, and department record rules' },
    { label: 'Force Reset', value: summary.force_reset_users || 0, note: 'Users who must change passwords' },
    { label: 'Email Events', value: (securityDashboard.emailLogs || []).length, note: 'Invite and account-email delivery log' },
  ];
  const firstPendingRequest = pendingPermissionRequests[0] || null;
  const oneViewFeatures = [
    { title: 'Refresh Console', value: 'Live', note: 'Reload users, roles, security, audit, and email state', actionLabel: 'Refresh', onClick: loadAll },
    { title: 'Open User Desk', value: `${users.length}`, note: 'Create users, search directory, and govern lifecycle', actionLabel: 'Open', onClick: () => setWorkspace('users') },
    { title: 'Open Role Desk', value: `${roleRights.length}`, note: 'Tune role templates and effective rights', actionLabel: 'Open', onClick: () => setWorkspace('roles') },
    { title: 'Open Governance Desk', value: `${pendingPermissionRequests.length}`, note: 'Compare roles, clone matrices, and review requests', actionLabel: 'Open', onClick: () => setWorkspace('governance') },
    { title: 'Open Security Desk', value: `${summary.locked_users || 0}`, note: 'Inspect lockouts, resets, and security posture', actionLabel: 'Open', onClick: () => setWorkspace('security') },
    { title: 'Open Audit Desk', value: `${(securityDashboard.audits || []).length}`, note: 'Review account and authority activity', actionLabel: 'Open', onClick: () => setWorkspace('audit') },
    { title: 'Open Email Desk', value: `${(securityDashboard.emailLogs || []).length}`, note: 'Track invite and confirmation delivery', actionLabel: 'Open', onClick: () => setWorkspace('email') },
    { title: 'Create Invite', value: form.fullName ? 'Ready' : 'Draft', note: 'Jump to account provisioning for a new operator', actionLabel: 'Provision', onClick: () => setWorkspace('users') },
    { title: 'Save User Rights', value: selectedOverrideUserId || '-', note: 'Commit per-user exception rights for the selected account', actionLabel: 'Save', onClick: saveUserOverrideRights, disabled: !selectedOverrideUserId },
    { title: 'Save User Scopes', value: `${selectedUserScopes.length}`, note: 'Write outlet, stage, and department restrictions for the selected user', actionLabel: 'Save', onClick: saveUserScopes, disabled: !selectedOverrideUserId },
    { title: 'Reset User Overrides', value: selectedOverrideUserId || '-', note: 'Revert the selected user back to role defaults', actionLabel: 'Reset', onClick: resetUserOverrides, disabled: !selectedOverrideUserId },
    { title: 'Save Role Rights', value: selectedRole || '-', note: 'Commit the default permission matrix for the selected role', actionLabel: 'Save', onClick: saveRoleRights, disabled: !selectedRole },
    { title: 'Save Role Scopes', value: `${selectedRoleScopes.length}`, note: 'Write default scope rules for the selected role', actionLabel: 'Save', onClick: saveRoleScopes, disabled: !selectedRole },
    { title: 'Reset Role Template', value: selectedRole || '-', note: 'Restore the selected role to its template baseline', actionLabel: 'Reset', onClick: resetRoleToTemplate, disabled: !selectedRole },
    { title: 'Compare Roles', value: `${roleCompare.leftRole || '-'} / ${roleCompare.rightRole || '-'}`, note: 'Load a side-by-side diff of two role matrices', actionLabel: 'Compare', onClick: compareRoleMatrix, disabled: !roleCompare.leftRole || !roleCompare.rightRole },
    { title: 'Clone Role Matrix', value: `${roleClone.sourceRole || '-'} -> ${roleClone.targetRole || '-'}`, note: 'Copy a role matrix and optional scopes into another role', actionLabel: 'Clone', onClick: cloneRoleMatrix, disabled: !roleClone.sourceRole || !roleClone.targetRole },
    { title: 'Save Password Policy', value: 'Policy', note: 'Persist password length and history requirements', actionLabel: 'Save', onClick: () => saveSecuritySetting('PASSWORD_POLICY') },
    { title: 'Save Lockout Policy', value: 'Policy', note: 'Persist login failure thresholds and lockout timing', actionLabel: 'Save', onClick: () => saveSecuritySetting('LOCKOUT_POLICY') },
    { title: 'Save 2FA Policy', value: 'Policy', note: 'Persist roles that must use two-factor authentication', actionLabel: 'Save', onClick: () => saveSecuritySetting('TWO_FACTOR_POLICY') },
    { title: 'Approve Next Request', value: firstPendingRequest ? `#${firstPendingRequest.id}` : '0', note: 'Approve the oldest pending permission-change request', actionLabel: 'Approve', onClick: () => reviewPermissionRequest(firstPendingRequest.id, 'APPROVE'), disabled: !firstPendingRequest },
    { title: 'Review Queue', value: `${pendingPermissionRequests.length}`, note: 'Open the governance queue for full approval review', actionLabel: 'Review', onClick: () => setWorkspace('governance') },
    { title: 'Bulk Suspend', value: `${selectedUsers.length}`, note: 'Suspend all currently selected user records', actionLabel: 'Run', onClick: () => runBulkAction('suspend'), disabled: selectedUsers.length === 0 },
    { title: 'Bulk Reactivate', value: `${selectedUsers.length}`, note: 'Reactivate all currently selected user records', actionLabel: 'Run', onClick: () => runBulkAction('reactivate'), disabled: selectedUsers.length === 0 },
    { title: 'Bulk Force Reset', value: `${selectedUsers.length}`, note: 'Force password reset for all selected users', actionLabel: 'Run', onClick: () => runBulkAction('force_password_reset'), disabled: selectedUsers.length === 0 },
    { title: 'Scope Inventory', value: `${scopeRules.length}`, note: 'Open the full record-rule inventory across roles and users', actionLabel: 'Inspect', onClick: () => setWorkspace('governance') },
  ];

  if (loading) {
    return (
      <section className="admin-console-page">
        <section className="admin-console-panel">
          <h2>Super Admin Console</h2>
          <p>Loading control center...</p>
        </section>
      </section>
    );
  }

  return (
    <section className="admin-console-page">
      <div className="admin-console-shell">
        <aside className="admin-console-sidebar">
          <div className="admin-console-brand">
            <p className="admin-kicker">Platform Control</p>
            <h2>Super Admin Console</h2>
            <p>{user?.full_name} manages access, security, audit, and platform authority from one surface.</p>
          </div>
          <div className="admin-console-nav">
            {WORKSPACES.map((item) => (
              <button key={item.key} type="button" className={workspace === item.key ? '' : 'button-secondary'} onClick={() => setWorkspace(item.key)}>
                {item.label}
              </button>
            ))}
          </div>
          <section className="admin-console-rail-card">
            <strong>Quick Pressure</strong>
            <div className="admin-chip-grid">
              <span>Invited {summary.pending_invites || 0}</span>
              <span>Locked {summary.locked_users || 0}</span>
              <span>Suspended {summary.suspended_users || 0}</span>
              <span>Resets {summary.force_reset_users || 0}</span>
            </div>
          </section>
          <section className="admin-console-rail-card">
            <strong>Quick Links</strong>
            <div className="admin-link-stack">
              <a href="/?page=profile">My profile</a>
              <a href="/?page=accept-invite">Invite acceptance page</a>
              <a href="/?page=confirm-email-change">Email confirmation page</a>
            </div>
          </section>
        </aside>

        <div className="admin-console-main">
          <section className="admin-console-hero">
            <div>
              <p className="admin-kicker">Identity, Governance, Security</p>
              <h3>One operating surface for the highest-access role</h3>
              <p>Separated from general settings so the super-user can manage users, role rights, security posture, email delivery, and audit events without digging through mixed module controls.</p>
            </div>
            <div className="admin-console-hero-actions">
              <button type="button" onClick={loadAll}>Refresh Console</button>
              <button type="button" className="button-secondary" onClick={() => setWorkspace('users')}>Open User Desk</button>
              <button type="button" className="button-secondary" onClick={() => setWorkspace('security')}>Open Security Desk</button>
            </div>
          </section>

          {message ? <p className="admin-console-message">{message}</p> : null}
          {inviteLink ? <p className="admin-console-message">Invite link: <a href={inviteLink} target="_blank" rel="noreferrer">{inviteLink}</a></p> : null}

          {workspace === 'command' && (
            <>
              <section className="admin-console-panel admin-console-panel-spotlight">
                <div className="admin-panel-head admin-panel-head-wrap">
                  <div>
                    <p className="admin-kicker">25 Features In One</p>
                    <h3>Unified operating deck</h3>
                  </div>
                  <div className="actions-cell">
                    <button type="button" onClick={loadAll}>Refresh</button>
                    <button type="button" className="button-secondary" onClick={() => setWorkspace('overview')}>Deep-Dive Overview</button>
                  </div>
                </div>
                <p>This single screen brings together twenty-five real platform controls and decision points so you can operate users, roles, governance, security, audit, and delivery from one place.</p>
                <div className="admin-metric-grid">
                  {adminHighlights.map((item) => (
                    <article key={`command-${item.label}`} className="admin-metric-card">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <p>{item.note}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="admin-console-panel">
                <div className="admin-panel-head">
                  <div>
                    <p className="admin-kicker">Action Grid</p>
                    <h3>Twenty-five controls in one surface</h3>
                  </div>
                </div>
                <div className="admin-role-grid">
                  {oneViewFeatures.map((item) => (
                    <article key={item.title} className="admin-role-card">
                      <strong>{item.title}</strong>
                      <span>{item.value}</span>
                      <p>{item.note}</p>
                      <button type="button" className="button-secondary" onClick={item.onClick} disabled={Boolean(item.disabled)}>
                        {item.actionLabel}
                      </button>
                    </article>
                  ))}
                </div>
              </section>

              <section className="admin-overview-grid">
                <section className="admin-console-panel">
                  <div className="admin-panel-head">
                    <div>
                      <p className="admin-kicker">Immediate Queue</p>
                      <h3>Pending permission requests</h3>
                    </div>
                    <button type="button" className="button-secondary" onClick={() => setWorkspace('governance')}>Open governance</button>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>When</th><th>Target</th><th>Requested By</th><th>Status</th></tr></thead>
                      <tbody>
                        {pendingPermissionRequests.slice(0, 6).map((entry) => (
                          <tr key={`command-request-${entry.id}`}>
                            <td>{formatDate(entry.created_at)}</td>
                            <td>{entry.target_type} {entry.target_key}</td>
                            <td>{entry.requested_by_name || '-'}</td>
                            <td>{entry.status}</td>
                          </tr>
                        ))}
                        {!pendingPermissionRequests.length ? <tr><td colSpan={4}>No pending requests.</td></tr> : null}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section className="admin-console-panel">
                  <div className="admin-panel-head">
                    <div>
                      <p className="admin-kicker">Current Scope</p>
                      <h3>Selected role and user context</h3>
                    </div>
                  </div>
                  <div className="admin-watch-grid">
                    <article className="admin-watch-card"><span>Selected Role</span><strong>{selectedRole || '-'}</strong><p>{selectedRoleScopes.length} scope rules staged</p></article>
                    <article className="admin-watch-card"><span>Selected User</span><strong>{selectedOverrideUserId || '-'}</strong><p>{selectedUserScopes.length} scope rules staged</p></article>
                    <article className="admin-watch-card"><span>Bulk Selection</span><strong>{selectedUsers.length}</strong><p>Users selected for lifecycle operations</p></article>
                  </div>
                </section>
              </section>
            </>
          )}

          {workspace === 'overview' && (
            <>
              <section className="admin-metric-grid">
                {adminHighlights.map((item) => (
                  <article key={item.label} className="admin-metric-card">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <p>{item.note}</p>
                  </article>
                ))}
              </section>

              <section className="admin-overview-grid">
                <section className="admin-console-panel admin-console-panel-spotlight">
                  <div className="admin-panel-head">
                    <div>
                      <p className="admin-kicker">Lifecycle Control</p>
                      <h3>Pending invite queue</h3>
                    </div>
                    <button type="button" className="button-secondary" onClick={() => setWorkspace('users')}>Manage users</button>
                  </div>
                  <div className="admin-queue-list">
                    {pendingInvites.length ? pendingInvites.map((entry) => (
                      <article key={entry.id} className="admin-queue-card">
                        <strong>{entry.full_name}</strong>
                        <p>{entry.email}</p>
                        <div className="admin-meta-row">
                          <span>{entry.role}</span>
                          <span>Expires {formatDate(entry.invite_expires_at)}</span>
                        </div>
                      </article>
                    )) : <p>No pending invites.</p>}
                  </div>
                </section>

                <section className="admin-console-panel">
                  <div className="admin-panel-head">
                    <div>
                      <p className="admin-kicker">Risk Watch</p>
                      <h3>Security pressure queues</h3>
                    </div>
                    <button type="button" className="button-secondary" onClick={() => setWorkspace('security')}>Open security</button>
                  </div>
                  <div className="admin-watch-grid">
                    <article className="admin-watch-card"><span>Locked Users</span><strong>{lockedUsers.length}</strong><p>{lockedUsers.map((entry) => entry.full_name).join(', ') || 'No locked accounts'}</p></article>
                    <article className="admin-watch-card"><span>Suspended Users</span><strong>{suspendedUsers.length}</strong><p>{suspendedUsers.map((entry) => entry.full_name).join(', ') || 'No suspended users'}</p></article>
                    <article className="admin-watch-card"><span>Forced Resets</span><strong>{resetUsers.length}</strong><p>{resetUsers.map((entry) => entry.full_name).join(', ') || 'No password reset pressure'}</p></article>
                  </div>
                </section>
              </section>

              <section className="admin-console-panel">
                <div className="admin-panel-head"><div><p className="admin-kicker">Platform Shape</p><h3>Role distribution</h3></div></div>
                <div className="admin-role-grid">
                  {Object.entries(roleCounts).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
                    <article key={role} className="admin-role-card"><strong>{role}</strong><span>{count} users</span></article>
                  ))}
                </div>
              </section>

              <section className="admin-console-panel">
                <div className="admin-panel-head">
                  <div>
                    <p className="admin-kicker">Recent Authority Activity</p>
                    <h3>Latest audit events</h3>
                  </div>
                  <button type="button" className="button-secondary" onClick={() => setWorkspace('audit')}>Open audit log</button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>When</th><th>Action</th><th>User</th><th>Actor</th></tr></thead>
                    <tbody>
                      {(securityDashboard.audits || []).slice(0, 12).map((entry) => (
                        <tr key={entry.id}><td>{formatDate(entry.created_at)}</td><td>{entry.action_type}</td><td>{entry.user_name || '-'}</td><td>{entry.actor_name || '-'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {workspace === 'users' && (
            <>
              <section className="admin-console-panel">
                <div className="admin-panel-head"><div><p className="admin-kicker">Account Provisioning</p><h3>Create user and send secure invite</h3></div></div>
                <form onSubmit={handleCreateUser} className="admin-form-grid">
                  <label className="admin-form-block"><span>Full Name</span><input value={form.fullName} onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))} required /></label>
                  <label className="admin-form-block"><span>Email</span><input type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} required /></label>
                  <label className="admin-form-block"><span>Role</span><select value={form.role} onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value, outletId: '', stageAccess: '' }))}>{ROLE_OPTIONS.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}</select></label>
                  <label className="admin-form-block"><span>Department</span><input value={form.department} onChange={(event) => setForm((prev) => ({ ...prev, department: event.target.value }))} placeholder="Retail, Production, Finance, Platform" /></label>
                  {['SHOP_MANAGER', 'RETAIL_STAFF'].includes(form.role) && <label className="admin-form-block"><span>Outlet</span><select value={form.outletId} onChange={(event) => setForm((prev) => ({ ...prev, outletId: event.target.value }))} required><option value="">Select outlet</option>{outletRecords.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select></label>}
                  {form.role === 'PRODUCTION_SUPERVISOR' && <label className="admin-form-block"><span>Stage Access</span><select value={form.stageAccess} onChange={(event) => setForm((prev) => ({ ...prev, stageAccess: event.target.value }))} required><option value="">Select stage</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>}
                  <div className="admin-form-actions"><button type="submit">Create Invite</button></div>
                </form>
              </section>

              <section className="admin-console-panel">
                <div className="admin-panel-head admin-panel-head-wrap">
                  <div><p className="admin-kicker">User Rights Override</p><h3>ERP-style exception rights for one user</h3></div>
                  <div className="actions-cell">
                    <select value={selectedOverrideUserId} onChange={(event) => onOverrideUserSelect(event.target.value)}>
                      {userOverrides.map((entry) => <option key={entry.id} value={entry.id}>{entry.full_name} ({entry.role})</option>)}
                    </select>
                    <button type="button" onClick={saveUserOverrideRights}>Save User Rights</button>
                    <button type="button" className="button-secondary" onClick={resetUserOverrides}>Reset User</button>
                    <button type="button" className="button-secondary" onClick={() => createPermissionRequest('USER', selectedOverrideUserId, selectedOverrideRights, selectedUserScopes, 'User exception-right update')}>Submit Request</button>
                  </div>
                </div>
                {permissionCatalog.map((group) => (
                  <section key={`${group.key}-override`} className="admin-console-panel">
                    <div className="admin-panel-head"><div><p className="admin-kicker">{group.label}</p><h3>{group.label} User Rights</h3></div></div>
                    <div className="admin-rights-grid">
                      {(group.permissions || []).map((item) => (
                        <label key={item.key} className="admin-right-card">
                          <input type="checkbox" checked={Boolean(selectedOverrideRights[item.key])} onChange={() => setSelectedOverrideRights((prev) => ({ ...prev, [item.key]: !prev[item.key] }))} />
                          <div><strong>{item.label || RIGHT_LABELS[item.key] || item.key}</strong><span>{item.key}</span></div>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
                <ScopeRuleEditor scopes={selectedUserScopes} onChange={setSelectedUserScopes} targetLabel="User scope restrictions" />
                <div className="actions-cell">
                  <button type="button" onClick={saveUserScopes}>Save User Scopes</button>
                </div>
                {effectiveUserPreview ? (
                  <section className="admin-console-panel">
                    <div className="admin-panel-head"><div><p className="admin-kicker">Resolved Access</p><h3>Effective rights preview</h3></div></div>
                    <div className="admin-watch-grid">
                      <article className="admin-watch-card"><span>Outlet Scope</span><strong>{effectiveUserPreview.scope_summary?.outlets?.length || 0}</strong><p>{effectiveUserPreview.scope_summary?.outlets?.join(', ') || 'No outlet restrictions'}</p></article>
                      <article className="admin-watch-card"><span>Stage Scope</span><strong>{effectiveUserPreview.scope_summary?.stages?.length || 0}</strong><p>{effectiveUserPreview.scope_summary?.stages?.join(', ') || 'No stage restrictions'}</p></article>
                      <article className="admin-watch-card"><span>Department Scope</span><strong>{effectiveUserPreview.scope_summary?.departments?.length || 0}</strong><p>{effectiveUserPreview.scope_summary?.departments?.join(', ') || 'No department restrictions'}</p></article>
                    </div>
                    <pre className="log-json">{JSON.stringify(effectiveUserPreview.effective_permissions, null, 2)}</pre>
                  </section>
                ) : null}
              </section>

              <section className="admin-console-panel">
                <div className="admin-panel-head admin-panel-head-wrap">
                  <div><p className="admin-kicker">User Directory</p><h3>Search, filter, bulk action, and govern account lifecycle</h3></div>
                  <div className="actions-cell">
                    <button type="button" className="button-secondary" onClick={toggleAllVisible}>Select Visible</button>
                    <button type="button" className="button-secondary" onClick={() => runBulkAction('suspend')}>Bulk Suspend</button>
                    <button type="button" className="button-secondary" onClick={() => runBulkAction('reactivate')}>Bulk Reactivate</button>
                    <button type="button" className="button-secondary" onClick={() => runBulkAction('force_password_reset')}>Bulk Force Reset</button>
                  </div>
                </div>
                <div className="admin-filter-grid">
                  <input placeholder="Search name, email, role, outlet, department" value={filters.search} onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))} />
                  <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}><option value="ALL">All Statuses</option><option value="ACTIVE">Active</option><option value="INVITED">Invited</option><option value="EXPIRED">Expired</option><option value="REVOKED">Revoked</option><option value="LOCKED">Locked</option><option value="SUSPENDED">Suspended</option><option value="FORCE_RESET">Force Reset</option></select>
                  <select value={filters.role} onChange={(event) => setFilters((prev) => ({ ...prev, role: event.target.value }))}><option value="ALL">All Roles</option>{Object.keys(roleCounts).sort().map((role) => <option key={role} value={role}>{role}</option>)}</select>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Select</th><th>Name</th><th>Role</th><th>Scope</th><th>Status</th><th>Last Login</th><th>Failures</th><th>Actions</th></tr></thead>
                    <tbody>
                      {filteredUsers.map((entry) => (
                        <tr key={entry.id}>
                          <td><input type="checkbox" checked={selectedUsers.includes(entry.id)} onChange={() => toggleUserSelection(entry.id)} /></td>
                          <td><strong>{entry.full_name}</strong><div className="admin-table-subtext">{entry.email}</div></td>
                          <td>{entry.role}</td>
                          <td>{[entry.outlet_name, entry.stage_name, entry.department].filter(Boolean).join(' / ') || '-'}</td>
                          <td><span className={`admin-status-pill ${normalizeUserStatus(entry).toLowerCase()}`}>{normalizeUserStatus(entry)}</span></td>
                          <td>{formatDate(entry.last_login_at)}</td>
                          <td>{entry.failed_login_attempts || 0}</td>
                          <td className="actions-cell">
                            <button type="button" className="button-secondary" onClick={() => runUserAction(entry.id, 'resend-invite')}>Resend</button>
                            <button type="button" className="button-secondary" onClick={() => runUserAction(entry.id, 'revoke-invite')}>Revoke</button>
                            <button type="button" className="button-secondary" onClick={() => runUserAction(entry.id, 'suspend')}>Suspend</button>
                            <button type="button" className="button-secondary" onClick={() => runUserAction(entry.id, 'reactivate')}>Reactivate</button>
                            <button type="button" className="button-secondary" onClick={() => runUserAction(entry.id, 'force_password_reset')}>Force Reset</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {workspace === 'roles' && (
            <section className="admin-console-panel">
              <div className="admin-panel-head"><div><p className="admin-kicker">Role Matrix</p><h3>Control default rights by role</h3></div></div>
              <div className="admin-filter-grid">
                <select value={selectedRole} onChange={(event) => onRoleSelect(event.target.value)}>{roleRights.map((entry) => <option key={entry.role} value={entry.role}>{entry.role}</option>)}</select>
                <button type="button" onClick={saveRoleRights}>Save Role Rights</button>
                <button type="button" className="button-secondary" onClick={resetRoleToTemplate}>Reset To Template</button>
                <button type="button" className="button-secondary" onClick={() => createPermissionRequest('ROLE', selectedRole, selectedRights, selectedRoleScopes, 'Role rights change proposal')}>Submit Request</button>
              </div>
              {permissionCatalog.map((group) => (
                <section key={group.key} className="admin-console-panel">
                  <div className="admin-panel-head"><div><p className="admin-kicker">{group.label}</p><h3>{group.label} Rights</h3></div></div>
                  <div className="admin-rights-grid">
                    {(group.permissions || []).map((item) => (
                      <label key={item.key} className="admin-right-card">
                        <input type="checkbox" checked={Boolean(selectedRights[item.key])} onChange={() => setSelectedRights((prev) => ({ ...prev, [item.key]: !prev[item.key] }))} />
                        <div><strong>{item.label || RIGHT_LABELS[item.key] || item.key}</strong><span>{item.key}</span></div>
                      </label>
                    ))}
                  </div>
                </section>
              ))}
              <ScopeRuleEditor scopes={selectedRoleScopes} onChange={setSelectedRoleScopes} targetLabel="Role scope restrictions" />
              <div className="actions-cell">
                <button type="button" onClick={saveRoleScopes}>Save Role Scopes</button>
              </div>
              {effectiveRolePreview ? (
                <section className="admin-console-panel">
                  <div className="admin-panel-head"><div><p className="admin-kicker">Resolved Access</p><h3>Effective role preview</h3></div></div>
                  <div className="admin-watch-grid">
                    <article className="admin-watch-card"><span>Outlet Scope</span><strong>{effectiveRolePreview.scope_summary?.outlets?.length || 0}</strong><p>{effectiveRolePreview.scope_summary?.outlets?.join(', ') || 'No outlet restrictions'}</p></article>
                    <article className="admin-watch-card"><span>Stage Scope</span><strong>{effectiveRolePreview.scope_summary?.stages?.length || 0}</strong><p>{effectiveRolePreview.scope_summary?.stages?.join(', ') || 'No stage restrictions'}</p></article>
                    <article className="admin-watch-card"><span>Department Scope</span><strong>{effectiveRolePreview.scope_summary?.departments?.length || 0}</strong><p>{effectiveRolePreview.scope_summary?.departments?.join(', ') || 'No department restrictions'}</p></article>
                  </div>
                  <pre className="log-json">{JSON.stringify(effectiveRolePreview.effective_permissions, null, 2)}</pre>
                </section>
              ) : null}
            </section>
          )}

          {workspace === 'governance' && (
            <>
              <section className="admin-console-panel">
                <div className="admin-panel-head"><div><p className="admin-kicker">Role Governance</p><h3>Compare, clone, and restore role matrices</h3></div></div>
                <div className="admin-filter-grid">
                  <select value={roleCompare.leftRole} onChange={(event) => setRoleCompare((prev) => ({ ...prev, leftRole: event.target.value }))}>{roleRights.map((entry) => <option key={`left-${entry.role}`} value={entry.role}>{entry.role}</option>)}</select>
                  <select value={roleCompare.rightRole} onChange={(event) => setRoleCompare((prev) => ({ ...prev, rightRole: event.target.value }))}>{roleRights.map((entry) => <option key={`right-${entry.role}`} value={entry.role}>{entry.role}</option>)}</select>
                  <button type="button" onClick={compareRoleMatrix}>Compare Roles</button>
                </div>
                {roleCompare.result ? (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Permission</th><th>{roleCompare.result.leftRole}</th><th>{roleCompare.result.rightRole}</th></tr></thead>
                      <tbody>
                        {roleCompare.result.differences.map((entry) => (
                          <tr key={entry.permission}><td>{RIGHT_LABELS[entry.permission] || entry.permission}</td><td>{entry.left ? 'Yes' : 'No'}</td><td>{entry.right ? 'Yes' : 'No'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p>No comparison loaded.</p>}
                <div className="admin-filter-grid">
                  <select value={roleClone.sourceRole} onChange={(event) => setRoleClone((prev) => ({ ...prev, sourceRole: event.target.value }))}>{roleRights.map((entry) => <option key={`source-${entry.role}`} value={entry.role}>{entry.role}</option>)}</select>
                  <select value={roleClone.targetRole} onChange={(event) => setRoleClone((prev) => ({ ...prev, targetRole: event.target.value }))}>{roleRights.map((entry) => <option key={`target-${entry.role}`} value={entry.role}>{entry.role}</option>)}</select>
                  <label className="admin-right-card"><input type="checkbox" checked={roleClone.copyScopes} onChange={(event) => setRoleClone((prev) => ({ ...prev, copyScopes: event.target.checked }))} /><div><strong>Copy scopes</strong><span>Also copy outlet, stage, and department rules</span></div></label>
                  <button type="button" onClick={cloneRoleMatrix}>Clone Role Matrix</button>
                </div>
              </section>

              <section className="admin-console-panel">
                <div className="admin-panel-head"><div><p className="admin-kicker">Approval Queue</p><h3>Permission change requests</h3></div></div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>When</th><th>Target</th><th>Requested By</th><th>Status</th><th>Reason</th><th>Actions</th></tr></thead>
                    <tbody>
                      {permissionRequests.map((entry) => (
                        <tr key={entry.id}>
                          <td>{formatDate(entry.created_at)}</td>
                          <td>{entry.target_type} {entry.target_key}</td>
                          <td>{entry.requested_by_name || '-'}</td>
                          <td>{entry.status}</td>
                          <td>{entry.reason || '-'}</td>
                          <td className="actions-cell">
                            {entry.status === 'PENDING' ? (
                              <>
                                <button type="button" onClick={() => reviewPermissionRequest(entry.id, 'APPROVE')}>Approve</button>
                                <button type="button" className="button-secondary" onClick={() => reviewPermissionRequest(entry.id, 'REJECT')}>Reject</button>
                              </>
                            ) : <span>{entry.reviewed_by_name || '-'}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="admin-console-panel">
                <div className="admin-panel-head"><div><p className="admin-kicker">Scope Inventory</p><h3>All outlet, stage, and department rules</h3></div></div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Target</th><th>Scope Type</th><th>Scope Value</th><th>Created By</th><th>Created At</th></tr></thead>
                    <tbody>
                      {scopeRules.map((entry) => (
                        <tr key={entry.id}>
                          <td>{entry.target_type} {entry.target_key}</td>
                          <td>{entry.scope_type}</td>
                          <td>{entry.scope_value}</td>
                          <td>{entry.created_by_name || '-'}</td>
                          <td>{formatDate(entry.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {workspace === 'security' && (
            <section className="admin-security-grid">
              <section className="admin-console-panel">
                <div className="admin-panel-head"><div><p className="admin-kicker">Security Settings</p><h3>Password and lockout policy</h3></div></div>
                <div className="admin-editor-grid">
                  <JsonEditor label="Password Policy" value={settingsDraft.PASSWORD_POLICY} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, PASSWORD_POLICY: value }))} />
                  <JsonEditor label="Lockout Policy" value={settingsDraft.LOCKOUT_POLICY} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, LOCKOUT_POLICY: value }))} />
                  <JsonEditor label="Two Factor Policy" value={settingsDraft.TWO_FACTOR_POLICY} onChange={(value) => setSettingsDraft((prev) => ({ ...prev, TWO_FACTOR_POLICY: value }))} />
                </div>
                <div className="actions-cell">
                  <button type="button" onClick={() => saveSecuritySetting('PASSWORD_POLICY')}>Save Password Policy</button>
                  <button type="button" onClick={() => saveSecuritySetting('LOCKOUT_POLICY')}>Save Lockout Policy</button>
                  <button type="button" onClick={() => saveSecuritySetting('TWO_FACTOR_POLICY')}>Save 2FA Policy</button>
                </div>
              </section>

              <section className="admin-console-panel">
                <div className="admin-panel-head"><div><p className="admin-kicker">Current Pressure</p><h3>Locked, suspended, and reset queues</h3></div></div>
                <div className="admin-watch-grid">
                  <article className="admin-watch-card"><span>Locked</span><strong>{statusCounts.LOCKED || 0}</strong><p>{lockedUsers.length ? lockedUsers.map((entry) => entry.email).join(', ') : 'No locked users'}</p></article>
                  <article className="admin-watch-card"><span>Suspended</span><strong>{statusCounts.SUSPENDED || 0}</strong><p>{suspendedUsers.length ? suspendedUsers.map((entry) => entry.email).join(', ') : 'No suspended users'}</p></article>
                  <article className="admin-watch-card"><span>Forced Password Reset</span><strong>{statusCounts.FORCE_RESET || 0}</strong><p>{resetUsers.length ? resetUsers.map((entry) => entry.email).join(', ') : 'No forced reset users'}</p></article>
                </div>
              </section>

              <section className="admin-console-panel">
                <div className="admin-panel-head">
                  <div>
                    <p className="admin-kicker">Retail Booking Control</p>
                    <h3>MTO order capacity by due date</h3>
                  </div>
                </div>
                <form className="admin-form-grid" onSubmit={saveOrderCapacity}>
                  <label className="admin-form-block"><span>Date</span><input type="date" value={capacityForm.capacityDate} onChange={(event) => setCapacityForm((prev) => ({ ...prev, capacityDate: event.target.value }))} required /></label>
                  <label className="admin-form-block"><span>Order Type</span><select value={capacityForm.orderType} onChange={(event) => setCapacityForm((prev) => ({ ...prev, orderType: event.target.value }))}><option value="MTO">MTO</option></select></label>
                  <label className="admin-form-block"><span>Capacity Limit</span><input type="number" min="0" value={capacityForm.capacityLimit} onChange={(event) => setCapacityForm((prev) => ({ ...prev, capacityLimit: event.target.value }))} required /></label>
                  <label className="admin-form-block"><span>Notes</span><input value={capacityForm.notes} onChange={(event) => setCapacityForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Optional note for planners" /></label>
                  <div className="admin-form-actions"><button type="submit">Save Capacity</button></div>
                </form>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Date</th><th>Type</th><th>Capacity</th><th>Booked</th><th>Remaining</th><th>Notes</th></tr></thead>
                    <tbody>
                      {orderCapacityRows.map((row) => (
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
            </section>
          )}

          {workspace === 'audit' && (
            <section className="admin-console-panel">
              <div className="admin-panel-head"><div><p className="admin-kicker">Audit Trail</p><h3>Account, invite, and security activity</h3></div></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>When</th><th>Action</th><th>User</th><th>Actor</th><th>After</th></tr></thead>
                  <tbody>
                    {(securityDashboard.audits || []).map((entry) => (
                      <tr key={entry.id}><td>{formatDate(entry.created_at)}</td><td>{entry.action_type}</td><td>{entry.user_name || '-'}</td><td>{entry.actor_name || '-'}</td><td><pre className="log-json">{JSON.stringify(entry.after_data, null, 2)}</pre></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {workspace === 'email' && (
            <section className="admin-console-panel">
              <div className="admin-panel-head admin-panel-head-wrap">
                <div><p className="admin-kicker">Email Delivery</p><h3>Invite and confirmation delivery log</h3></div>
                <div className="actions-cell">
                  <select value={filters.emailStatus} onChange={(event) => setFilters((prev) => ({ ...prev, emailStatus: event.target.value }))}>
                    <option value="ALL">All delivery states</option>
                    {Array.from(new Set((securityDashboard.emailLogs || []).map((entry) => entry.delivery_status).filter(Boolean))).map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>When</th><th>Recipient</th><th>User</th><th>Subject</th><th>Status</th><th>Transport</th></tr></thead>
                  <tbody>
                    {filteredEmailLogs.map((entry) => (
                      <tr key={entry.id}><td>{formatDate(entry.created_at)}</td><td>{entry.email_to}</td><td>{entry.user_name || '-'}</td><td>{entry.subject}</td><td>{entry.delivery_status}</td><td><pre className="log-json">{entry.transport_response || '-'}</pre></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </div>
    </section>
  );
}




