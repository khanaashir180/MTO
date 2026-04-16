const PERMISSION_GROUPS = [
  {
    key: 'admin',
    label: 'Administration',
    permissions: [
      { key: 'admin_access', label: 'Access admin and settings surfaces' },
      { key: 'admin_manage_users', label: 'Create, suspend, invite, and reactivate users' },
      { key: 'admin_manage_roles', label: 'Edit role templates and permission models' },
      { key: 'admin_clone_roles', label: 'Clone roles, compare matrices, and restore templates' },
      { key: 'admin_manage_scope_rules', label: 'Manage scoped access rules by outlet, stage, and department' },
      { key: 'admin_manage_permission_requests', label: 'Submit, approve, and reject permission change requests' },
      { key: 'admin_view_effective_permissions', label: 'Preview resolved rights and scope outcomes' },
      { key: 'admin_manage_order_capacity', label: 'Manage retail order booking capacity by date' },
      { key: 'admin_manage_outlets', label: 'Create and manage outlets' },
      { key: 'admin_view_audit', label: 'View platform and audit logs' },
    ],
  },
  {
    key: 'retail',
    label: 'Retail',
    permissions: [
      { key: 'retail_view_dashboard', label: 'View retail dashboard' },
      { key: 'retail_create_order', label: 'Create retail orders' },
      { key: 'retail_edit_order', label: 'Edit booked retail orders' },
      { key: 'retail_view_sales_report', label: 'View sales reports' },
      { key: 'retail_manage_delivery', label: 'Manage store receipt and customer delivery' },
      { key: 'retail_view_customer_docs', label: 'View and print customer-facing documents' },
      { key: 'retail_manage_replacements', label: 'Create and manage replacements against booked orders' },
      { key: 'retail_view_head_reports', label: 'Access retail-head reports and replacement analytics' },
    ],
  },
  {
    key: 'production',
    label: 'Production',
    permissions: [
      { key: 'production_view_dashboard', label: 'View production dashboard' },
      { key: 'production_view_stage_detail', label: 'View stage cockpits and detail pages' },
      { key: 'production_run_verification', label: 'Use verification console' },
      { key: 'production_manage_stage_actions', label: 'Advance, move back, hold, and reject stage actions' },
      { key: 'production_manage_targets', label: 'Manage production targets and variances' },
      { key: 'production_approve_targets', label: 'Approve target changes and target settings' },
      { key: 'production_manage_notifications', label: 'Manage production notifications and workflows' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    permissions: [
      { key: 'finance_view_module', label: 'View finance module' },
      { key: 'finance_view_trial_balance', label: 'View trial balance and finance reports' },
      { key: 'finance_manage_settings', label: 'Manage finance settings and approval rules' },
    ],
  },
  {
    key: 'crm',
    label: 'CRM',
    permissions: [
      { key: 'crm_view_module', label: 'View CRM module' },
      { key: 'crm_manage_records', label: 'Create and update CRM records' },
      { key: 'crm_manage_approvals', label: 'Manage CRM approvals and sharing' },
    ],
  },
  {
    key: 'mrp',
    label: 'MRP',
    permissions: [
      { key: 'mrp_view_module', label: 'View MRP module' },
      { key: 'mrp_manage_planning', label: 'Manage planning, BOM, and work orders' },
      { key: 'mrp_manage_integrations', label: 'Run MRP integrations and purchase suggestions' },
    ],
  },
  {
    key: 'raw_store',
    label: 'Raw Material Store',
    permissions: [
      { key: 'raw_store_view_module', label: 'View raw material store' },
      { key: 'raw_store_manage_transactions', label: 'Manage issues, transfers, GRNs, and adjustments' },
      { key: 'raw_store_manage_rules', label: 'Manage min-max, routing, replenishment, and count rules' },
    ],
  },
];

const ROLE_DEFAULT_TEMPLATES = {
  SUPER_USER: Object.fromEntries(
    PERMISSION_GROUPS.flatMap((group) => group.permissions.map((permission) => [permission.key, true]))
  ),
  RETAIL_HEAD: {
    retail_view_dashboard: true,
    retail_view_sales_report: true,
    retail_manage_delivery: true,
    retail_view_customer_docs: true,
    retail_manage_replacements: true,
    retail_view_head_reports: true,
    admin_manage_permission_requests: true,
    admin_view_audit: true,
  },
  SHOP_MANAGER: {
    retail_view_dashboard: true,
    retail_create_order: true,
    retail_edit_order: true,
    retail_view_sales_report: true,
    retail_manage_delivery: true,
    retail_view_customer_docs: true,
    retail_manage_replacements: true,
  },
  RETAIL_STAFF: {
    retail_view_dashboard: true,
    retail_create_order: true,
    retail_edit_order: true,
    retail_manage_delivery: true,
    retail_view_customer_docs: true,
  },
  PRODUCTION_MANAGER: {
    production_view_dashboard: true,
    production_view_stage_detail: true,
    production_run_verification: true,
    production_manage_stage_actions: true,
    production_manage_targets: true,
    production_manage_notifications: true,
    mrp_view_module: true,
    mrp_manage_planning: true,
    mrp_manage_integrations: true,
    raw_store_view_module: true,
    raw_store_manage_transactions: true,
    raw_store_manage_rules: true,
    admin_manage_permission_requests: true,
  },
  PRODUCTION_SUPERVISOR: {
    production_view_dashboard: true,
    production_view_stage_detail: true,
    production_run_verification: true,
    production_manage_stage_actions: true,
    mrp_view_module: true,
    raw_store_view_module: true,
  },
  FINANCE: {
    finance_view_module: true,
    finance_view_trial_balance: true,
    finance_manage_settings: true,
    mrp_view_module: true,
    mrp_manage_planning: true,
    mrp_manage_integrations: true,
    raw_store_view_module: true,
    raw_store_manage_transactions: true,
    raw_store_manage_rules: true,
    crm_view_module: true,
    admin_manage_permission_requests: true,
  },
  CUSTOMER_SERVICE: {
    crm_view_module: true,
    crm_manage_records: true,
  },
  RETAIL: {
    retail_view_dashboard: true,
    retail_create_order: true,
    retail_edit_order: true,
    retail_view_sales_report: true,
    retail_manage_delivery: true,
    retail_view_customer_docs: true,
    retail_manage_replacements: true,
    raw_store_view_module: true,
  },
};

function getPermissionCatalog() {
  return PERMISSION_GROUPS;
}

function getRoleTemplate(roleName) {
  return { ...(ROLE_DEFAULT_TEMPLATES[String(roleName || '').toUpperCase()] || {}) };
}

function buildEffectivePermissions(roleName, roleOverrides = {}, userOverrides = {}) {
  if (String(roleName || '').toUpperCase() === 'SUPER_USER') {
    return { ...getRoleTemplate('SUPER_USER'), ...(userOverrides || {}) };
  }
  return {
    ...getRoleTemplate(roleName),
    ...(roleOverrides || {}),
    ...(userOverrides || {}),
  };
}

module.exports = {
  getPermissionCatalog,
  getRoleTemplate,
  buildEffectivePermissions,
};
