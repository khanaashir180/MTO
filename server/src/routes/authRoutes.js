const express = require('express');
const {
  login,
  refreshSessionToken,
  logoutSession,
  register,
  acceptInvite,
  resendInvite,
  revokeInvite,
  updateUserStatus,
  bulkUserAction,
  getUserSecurityDashboard,
  updateSecuritySetting,
  updateOwnProfile,
  changeOwnPassword,
  requestEmailChange,
  confirmEmailChange,
  listUsers,
  listStages,
  listAssignableRoles,
  listRoleRights,
  updateRoleRights,
  getRoleComparison,
  cloneRoleRights,
  resetRoleRights,
  getEffectiveRolePermissions,
  listUserPermissionOverrides,
  updateUserPermissionOverrides,
  resetUserPermissionOverrides,
  getEffectiveUserPermissions,
  listPermissionChangeRequests,
  createPermissionChangeRequest,
  reviewPermissionChangeRequest,
  listScopeRules,
  upsertScopeRules,
} = require('../controllers/authController');
const { authRequired, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.post('/login', login);
router.post('/refresh', refreshSessionToken);
router.post('/logout', logoutSession);
router.post('/accept-invite', acceptInvite);
router.post('/confirm-email-change', confirmEmailChange);
router.post('/register', authRequired, requirePermission('admin_manage_users'), register);
router.post('/users/:id/resend-invite', authRequired, requirePermission('admin_manage_users'), resendInvite);
router.post('/users/:id/revoke-invite', authRequired, requirePermission('admin_manage_users'), revokeInvite);
router.post('/users/:id/status', authRequired, requirePermission('admin_manage_users'), updateUserStatus);
router.post('/users/bulk-action', authRequired, requirePermission('admin_manage_users'), bulkUserAction);
router.get('/users', authRequired, requirePermission('admin_manage_users'), listUsers);
router.get('/stages', authRequired, requirePermission('admin_manage_users'), listStages);
router.get('/assignable-roles', authRequired, requirePermission('admin_manage_users'), listAssignableRoles);
router.get('/security-dashboard', authRequired, requirePermission('admin_view_audit'), getUserSecurityDashboard);
router.post('/security-settings', authRequired, requirePermission('admin_manage_roles'), updateSecuritySetting);
router.put('/me/profile', authRequired, updateOwnProfile);
router.post('/me/change-password', authRequired, changeOwnPassword);
router.post('/me/request-email-change', authRequired, requestEmailChange);
router.get('/role-rights', authRequired, requirePermission('admin_manage_roles'), listRoleRights);
router.put('/role-rights/:role', authRequired, requirePermission('admin_manage_roles'), updateRoleRights);
router.get('/role-rights/compare', authRequired, requirePermission('admin_clone_roles'), getRoleComparison);
router.post('/role-rights/clone', authRequired, requirePermission('admin_clone_roles'), cloneRoleRights);
router.post('/role-rights/:role/reset', authRequired, requirePermission('admin_clone_roles'), resetRoleRights);
router.get('/role-rights/:role/effective', authRequired, requirePermission('admin_view_effective_permissions'), getEffectiveRolePermissions);
router.get('/user-permission-overrides', authRequired, requirePermission('admin_manage_roles'), listUserPermissionOverrides);
router.put('/user-permission-overrides/:id', authRequired, requirePermission('admin_manage_roles'), updateUserPermissionOverrides);
router.post('/user-permission-overrides/:id/reset', authRequired, requirePermission('admin_manage_roles'), resetUserPermissionOverrides);
router.get('/user-permission-overrides/:id/effective', authRequired, requirePermission('admin_view_effective_permissions'), getEffectiveUserPermissions);
router.get('/permission-change-requests', authRequired, requirePermission('admin_manage_permission_requests'), listPermissionChangeRequests);
router.post('/permission-change-requests', authRequired, requirePermission('admin_manage_permission_requests'), createPermissionChangeRequest);
router.post('/permission-change-requests/:id/review', authRequired, requirePermission('admin_manage_permission_requests'), reviewPermissionChangeRequest);
router.get('/scope-rules', authRequired, requirePermission('admin_manage_scope_rules'), listScopeRules);
router.post('/scope-rules', authRequired, requirePermission('admin_manage_scope_rules'), upsertScopeRules);

module.exports = router;
