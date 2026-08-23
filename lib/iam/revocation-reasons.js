/** Central taxonomy for IAM session revocation reasons. */
export const REVOCATION_REASONS = Object.freeze({
  USER_LOGOUT: "user_logout",
  ADMIN_FORCE_LOGOUT: "admin_force_logout",
  MANUAL_SESSION_REVOKE: "manual_session_revoke",
  ACCOUNT_SUSPENDED: "account_suspended",
  ACCOUNT_BANNED: "account_banned",
  ACCOUNT_DELETED: "account_deleted",
  ACCOUNT_DISABLED: "account_disabled",
  PASSWORD_SECURITY_RESET: "password_security_reset",
});

export function reasonForAccountStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "banned") return REVOCATION_REASONS.ACCOUNT_BANNED;
  if (normalized === "deleted") return REVOCATION_REASONS.ACCOUNT_DELETED;
  if (normalized === "suspended") return REVOCATION_REASONS.ACCOUNT_SUSPENDED;
  return REVOCATION_REASONS.ACCOUNT_DISABLED;
}
