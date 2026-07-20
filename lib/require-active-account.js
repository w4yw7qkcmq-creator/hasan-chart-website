import { ACCOUNT_STATUSES, getProfileAccountStatus } from "./account-lifecycle.js";

const BLOCKED_STATUSES = new Set(["suspended", "banned", "deleted"]);

export async function fetchProfileAccountStatus(supabase, userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) {
    const error = new Error("معرّف المستخدم مطلوب");
    error.status = 400;
    throw error;
  }

  const profileSelect =
    "id,email,account_status,status_reason,suspended_at,banned_at,deleted_at,account_status_reason";

  let result = await supabase
    .from("profiles")
    .select(profileSelect)
    .eq("id", normalizedUserId)
    .maybeSingle();

  if (result.error && /column .* does not exist/i.test(result.error.message || "")) {
    result = await supabase
      .from("profiles")
      .select("id,email,role,created_at")
      .eq("id", normalizedUserId)
      .maybeSingle();
  }

  if (result.error) throw result.error;

  if (!result.data) {
    const error = new Error("المستخدم غير موجود");
    error.status = 404;
    throw error;
  }

  return {
    profile: result.data,
    accountStatus: getProfileAccountStatus(result.data),
  };
}

export async function requireActiveAccount(supabase, userId) {
  const { profile, accountStatus } = await fetchProfileAccountStatus(supabase, userId);

  if (!ACCOUNT_STATUSES.has(accountStatus)) {
    return { profile, accountStatus: "active" };
  }

  if (BLOCKED_STATUSES.has(accountStatus)) {
    const messages = {
      suspended: "الحساب معلّق",
      banned: "الحساب محظور",
      deleted: "الحساب محذوف",
    };

    const error = new Error(messages[accountStatus] || "الحساب غير نشط");
    error.status = 403;
    error.code = "ACCOUNT_NOT_ACTIVE";
    error.accountStatus = accountStatus;
    throw error;
  }

  return { profile, accountStatus };
}

/**
 * Recommended integration points (Phase 3B+):
 * - lib/auth-session.js → requireSessionUser / buildAppUser
 * - lib/notification-delivery-gate-server.js → skip blocked accounts
 * - Email queue worker → skip suspended/banned/deleted recipients
 * - Protected service APIs (VIP, alerts, account-management)
 * - Middleware.js for authenticated app routes (optional, after migration)
 */
