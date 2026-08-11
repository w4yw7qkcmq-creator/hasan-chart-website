/** Lifecycle action → IAM permission mapping (no Next.js deps). */
export const LIFECYCLE_ACTION_PERMISSIONS = Object.freeze({
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
  update_user_classification: "users.manage",
});

export function permissionForLifecycleAction(action) {
  return LIFECYCLE_ACTION_PERMISSIONS[String(action || "").trim()] || "users.manage";
}
