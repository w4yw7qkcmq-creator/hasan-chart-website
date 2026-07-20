export const ADMIN_ROLES = new Set([
  "super_admin",
  "admin",
  "analyst",
  "support",
  "accountant",
  "news_editor",
]);

export const ADMIN_PERMISSIONS = {
  "users.read": new Set(["super_admin", "admin", "analyst", "support", "accountant"]),
  "users.manage": new Set(["super_admin", "admin", "support"]),
  "users.ban": new Set(["super_admin", "admin"]),
  "subscriptions.read": new Set(["super_admin", "admin", "analyst", "support", "accountant"]),
  "subscriptions.manage": new Set(["super_admin", "admin", "support"]),
  "payments.read": new Set(["super_admin", "admin", "accountant"]),
  "news.manage": new Set(["super_admin", "admin", "news_editor"]),
  "analysis.manage": new Set(["super_admin", "admin", "analyst"]),
  "support.manage": new Set(["super_admin", "admin", "support"]),
  "admin.manage": new Set(["super_admin"]),
};

const ACTION_PERMISSIONS = {
  suspend_user: "users.manage",
  unsuspend_user: "users.manage",
  ban_user: "users.ban",
  unban_user: "users.ban",
  soft_delete_user: "users.ban",
  restore_user: "users.manage",
  force_logout: "users.manage",
  force_sign_out: "users.manage",
  password_reset_requested: "users.manage",
  password_reset: "users.manage",
  activate_service: "subscriptions.manage",
  deactivate_service: "subscriptions.manage",
  extend_subscription: "subscriptions.manage",
  activate_subscription: "subscriptions.manage",
  deactivate_subscription: "subscriptions.manage",
  reactivate_subscription: "subscriptions.manage",
  cancel_subscription: "subscriptions.manage",
  change_plan: "subscriptions.manage",
  send_user_notification: "support.manage",
};

export function getAdminRole(profile) {
  const explicitRole = String(profile?.admin_role || "").trim().toLowerCase();
  if (ADMIN_ROLES.has(explicitRole)) {
    return explicitRole;
  }

  if (String(profile?.role || "").trim() === "admin") {
    return "admin";
  }

  return null;
}

export function hasAdminPermission(role, permission) {
  const normalizedRole = String(role || "").trim().toLowerCase();
  const allowedRoles = ADMIN_PERMISSIONS[String(permission || "").trim()];
  if (!allowedRoles) return false;
  return allowedRoles.has(normalizedRole);
}

export function requireAdminPermission(profile, permission) {
  const role = getAdminRole(profile);
  if (!role) {
    const error = new Error("غير مصرح لك بالدخول");
    error.status = 403;
    throw error;
  }

  if (!hasAdminPermission(role, permission)) {
    const error = new Error("ليس لديك صلاحية لتنفيذ هذا الإجراء");
    error.status = 403;
    throw error;
  }

  return role;
}

export function getPermissionForAction(action) {
  return ACTION_PERMISSIONS[String(action || "").trim()] || "users.manage";
}

export function requirePermissionForAction(profile, action) {
  return requireAdminPermission(profile, getPermissionForAction(action));
}
