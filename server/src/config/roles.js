const ROLE_CATALOG = {
  SUPER_USER: {
    label: 'Super User',
    scope: 'platform',
    requiresDepartment: true,
  },
  RETAIL_HEAD: {
    label: 'Retail Head',
    scope: 'department',
    requiresDepartment: true,
  },
  SHOP_MANAGER: {
    label: 'Shop Manager',
    scope: 'outlet',
    requiresOutlet: true,
  },
  RETAIL_STAFF: {
    label: 'Retail Staff',
    scope: 'outlet',
    requiresOutlet: true,
  },
  PRODUCTION_MANAGER: {
    label: 'Production Manager',
    scope: 'department',
    requiresDepartment: true,
  },
  PRODUCTION_SUPERVISOR: {
    label: 'Production Supervisor',
    scope: 'stage',
    requiresStage: true,
  },
  FINANCE: {
    label: 'Finance',
    scope: 'department',
    requiresDepartment: true,
  },
  CUSTOMER_SERVICE: {
    label: 'Customer Service',
    scope: 'department',
    requiresDepartment: true,
  },
  RETAIL: {
    label: 'Retail Legacy',
    scope: 'legacy',
    requiresOutlet: true,
    hiddenInUi: true,
  },
};

function normalizeRoleName(roleName) {
  return String(roleName || '').trim().toUpperCase();
}

function getRoleMeta(roleName) {
  return ROLE_CATALOG[normalizeRoleName(roleName)] || null;
}

function listAssignableRoles() {
  return Object.entries(ROLE_CATALOG)
    .filter(([, meta]) => !meta.hiddenInUi)
    .map(([key, meta]) => ({ key, ...meta }));
}

module.exports = {
  ROLE_CATALOG,
  normalizeRoleName,
  getRoleMeta,
  listAssignableRoles,
};
