import { getProfileAccountStatus } from "../account-lifecycle.js";

const BLOCKED_STATUSES = new Set(["banned", "deleted", "suspended"]);

/**
 * Application-level account access gate (profiles.account_status).
 * Fail-closed when status cannot be verified under IAM_API enforcement.
 */
export async function assertUserAccountAccessAllowed(supabase, userId, options = {}) {
  const uid = String(userId || "").trim();
  if (!uid) {
    return { ok: false, status: 401, error: "جلسة غير صالحة", code: "UNAUTHORIZED" };
  }

  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, account_status, role")
      .eq("id", uid)
      .maybeSingle();

    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return { ok: true };
      }
      if (options.failClosed) {
        return {
          ok: false,
          status: 503,
          error: "تعذر التحقق من حالة الحساب",
          code: "ACCOUNT_STATUS_UNAVAILABLE",
        };
      }
      return { ok: true };
    }

    const accountStatus = getProfileAccountStatus(data);
    if (BLOCKED_STATUSES.has(accountStatus)) {
      return {
        ok: false,
        status: 403,
        error: "تم تقييد الوصول إلى هذا الحساب",
        code: "ACCOUNT_ACCESS_BLOCKED",
        accountStatus,
      };
    }

    return { ok: true, accountStatus: accountStatus || "active" };
  } catch (err) {
    if (options.failClosed) {
      return {
        ok: false,
        status: 503,
        error: "تعذر التحقق من حالة الحساب",
        code: "ACCOUNT_STATUS_UNAVAILABLE",
      };
    }
    console.warn("account access check skipped:", err?.message || err);
    return { ok: true };
  }
}
