import { IAM_PERMISSIONS } from "./constants.js";

/**
 * Static route → permission (method + pathname exact match).
 * Dynamic segments use [param] placeholders.
 */
export const ROUTE_PERMISSIONS = Object.freeze({
  // Dashboard
  "GET /api/admin/dashboard": IAM_PERMISSIONS.DASHBOARD_READ,
  "POST /api/admin/dashboard": IAM_PERMISSIONS.DASHBOARD_MUTATIONS,
  "GET /api/admin/vip-recommendations/recent": IAM_PERMISSIONS.RECOMMENDATIONS_STATUS_READ,
  "GET /api/admin/vip-recommendations/completed": IAM_PERMISSIONS.RECOMMENDATIONS_STATUS_READ,
  "POST /api/admin/vip-recommendations/[id]/status-update": IAM_PERMISSIONS.RECOMMENDATIONS_STATUS_UPDATE,
  "POST /api/admin/vip-recommendations/[id]/status-update/retry": IAM_PERMISSIONS.RECOMMENDATIONS_STATUS_UPDATE,
  "POST /api/admin/account-keys": IAM_PERMISSIONS.ACCOUNTS_SECRETS_MANAGE,

  // User management
  "GET /api/admin/user-management": IAM_PERMISSIONS.USERS_READ,
  "GET /api/admin/user-management/stats": IAM_PERMISSIONS.USERS_READ,
  "GET /api/admin/user-management/[userId]": IAM_PERMISSIONS.USERS_READ,
  "POST /api/admin/user-management/[userId]/actions": IAM_PERMISSIONS.USERS_MANAGE,
  "GET /api/admin/user-management/[userId]/notes": IAM_PERMISSIONS.USERS_READ,
  "POST /api/admin/user-management/[userId]/notes": IAM_PERMISSIONS.USERS_NOTES_MANAGE,
  "PATCH /api/admin/user-management/[userId]/notes": IAM_PERMISSIONS.USERS_NOTES_MANAGE,
  "DELETE /api/admin/user-management/[userId]/notes": IAM_PERMISSIONS.USERS_NOTES_MANAGE,

  // Financial
  "GET /api/admin/financial-center": IAM_PERMISSIONS.FINANCE_READ,
  "GET /api/admin/financial-center/payment-proof/[requestId]": IAM_PERMISSIONS.FINANCE_PROOFS_READ,

  // Subscriptions
  "POST /api/admin/subscription-requests/[requestId]/reject": IAM_PERMISSIONS.SUBSCRIPTIONS_MANAGE,
  "POST /api/admin/subscription-requests/[requestId]/remove": IAM_PERMISSIONS.SUBSCRIPTIONS_MANAGE,

  // Partners
  "GET /api/admin/partners": IAM_PERMISSIONS.PARTNERS_READ,
  "GET /api/admin/partners/[id]": IAM_PERMISSIONS.PARTNERS_READ,
  "GET /api/admin/partners/commission-rules": IAM_PERMISSIONS.PARTNERS_SETTINGS_READ,
  "GET /api/admin/partner-settings": IAM_PERMISSIONS.PARTNERS_SETTINGS_READ,
  "POST /api/admin/partner-settings": IAM_PERMISSIONS.PARTNERS_SETTINGS_MANAGE,
  "GET /api/admin/partner-analytics": IAM_PERMISSIONS.PARTNERS_ANALYTICS_READ,
  "GET /api/admin/partner-health": IAM_PERMISSIONS.PARTNERS_READ,
  "GET /api/admin/partner-tiers": IAM_PERMISSIONS.PARTNERS_READ,
  "GET /api/admin/partner-timeline": IAM_PERMISSIONS.PARTNERS_READ,
  "GET /api/admin/top-partners": IAM_PERMISSIONS.PARTNERS_ANALYTICS_READ,
  "GET /api/admin/partner-wallet-ledger": IAM_PERMISSIONS.PARTNERS_FINANCE_READ,
  "GET /api/admin/partner-withdrawals": IAM_PERMISSIONS.PARTNERS_WITHDRAWALS_READ,
  "POST /api/admin/partner-withdrawals/[id]/approve": IAM_PERMISSIONS.PARTNERS_WITHDRAWALS_MANAGE,
  "POST /api/admin/partner-withdrawals/[id]/reject": IAM_PERMISSIONS.PARTNERS_WITHDRAWALS_MANAGE,
  "POST /api/admin/partner-withdrawals/[id]/mark-paid": IAM_PERMISSIONS.PARTNERS_WITHDRAWALS_MANAGE,
  "POST /api/admin/run-partner-bonus": IAM_PERMISSIONS.PARTNERS_JOBS_RUN,
  "POST /api/admin/run-partner-upgrade": IAM_PERMISSIONS.PARTNERS_JOBS_RUN,

  // Email analytics
  "GET /api/admin/email-analytics": IAM_PERMISSIONS.EMAIL_ANALYTICS_READ,
  "GET /api/admin/email-analytics/[id]": IAM_PERMISSIONS.EMAIL_ANALYTICS_READ,

  // Notifications test
  "GET /api/admin/notification-test": IAM_PERMISSIONS.SYSTEM_NOTIFICATIONS_TEST,
  "POST /api/admin/notification-test": IAM_PERMISSIONS.SYSTEM_NOTIFICATIONS_TEST,

  // Analysis / news (human admin path)
  "POST /api/admin-reply": IAM_PERMISSIONS.ANALYSIS_MANAGE,
  "POST /api/daily-analysis": IAM_PERMISSIONS.ANALYSIS_PUBLISH,
  "GET /api/daily-analysis/admin-access": IAM_PERMISSIONS.ANALYSIS_READ,
  "POST /api/send-news": IAM_PERMISSIONS.NEWS_PUBLISH,
  "GET /api/admin/news/system-status": IAM_PERMISSIONS.NEWS_READ,

  // Content posts (Academy + Result)
  "GET /api/admin/content-posts": IAM_PERMISSIONS.CONTENT_READ,
  "POST /api/admin/content-posts": IAM_PERMISSIONS.CONTENT_MANAGE,
  "GET /api/admin/content-posts/[id]": IAM_PERMISSIONS.CONTENT_READ,
  "PATCH /api/admin/content-posts/[id]": IAM_PERMISSIONS.CONTENT_MANAGE,
  "DELETE /api/admin/content-posts/[id]": IAM_PERMISSIONS.CONTENT_MANAGE,
  "POST /api/admin/content-posts/[id]/publish": IAM_PERMISSIONS.CONTENT_PUBLISH,
  "POST /api/admin/content-posts/[id]/archive": IAM_PERMISSIONS.CONTENT_MANAGE,
  "POST /api/admin/content-posts/upload/authorize": IAM_PERMISSIONS.CONTENT_MANAGE,
  "POST /api/admin/content-posts/upload/complete": IAM_PERMISSIONS.CONTENT_MANAGE,

  // Partner hooks (human admin path)
  "POST /api/partner/hooks/service-activated": IAM_PERMISSIONS.PARTNERS_JOBS_RUN,

  // IAM — static
  "GET /api/iam/me": null,
  "GET /api/iam/roles": IAM_PERMISSIONS.IAM_READ,
  "GET /api/iam/permissions": IAM_PERMISSIONS.IAM_READ,
  "GET /api/iam/assignments": IAM_PERMISSIONS.IAM_READ,
  "GET /api/iam/audit": IAM_PERMISSIONS.IAM_AUDIT_READ,
  "GET /api/iam/sessions": IAM_PERMISSIONS.IAM_SESSIONS_READ,
  "GET /api/iam/security-events": IAM_PERMISSIONS.IAM_SECURITY_READ,
  "GET /api/iam/overrides": IAM_PERMISSIONS.IAM_READ,
  "POST /api/iam/overrides": IAM_PERMISSIONS.IAM_MANAGE,
  "GET /api/iam/health": IAM_PERMISSIONS.IAM_MANAGE,
  "POST /api/iam/bootstrap": IAM_PERMISSIONS.IAM_MANAGE,

  // Cron (machine auth only — mapped for coverage)
  "GET /api/check-subscription-expiry": IAM_PERMISSIONS.SYSTEM_CRON_READ,
  "GET /api/check-price-alerts": IAM_PERMISSIONS.SYSTEM_CRON_READ,
});

/**
 * Action-based routes: permission resolved from JSON body `action` field.
 */
export const ACTION_ROUTE_PERMISSIONS = Object.freeze({
  "POST /api/iam/assignments": Object.freeze({
    grant: IAM_PERMISSIONS.IAM_ASSIGNMENTS_GRANT,
    revoke: IAM_PERMISSIONS.IAM_ASSIGNMENTS_REVOKE,
  }),
  "POST /api/iam/sessions": Object.freeze({
    force_logout: IAM_PERMISSIONS.IAM_SESSIONS_FORCE_LOGOUT,
    default: IAM_PERMISSIONS.IAM_SESSIONS_FORCE_LOGOUT,
  }),
  "POST /api/iam/health": Object.freeze({
    backfill_legacy: IAM_PERMISSIONS.IAM_MANAGE,
    dry_run_backfill: IAM_PERMISSIONS.IAM_MANAGE,
    execute_backfill: IAM_PERMISSIONS.IAM_MANAGE,
  }),
});

/** Machine-only routes — human admin uses separate permission via machine-auth helper */
export const MACHINE_AUTH_ROUTES = Object.freeze([
  "GET /api/check-subscription-expiry",
  "GET /api/check-price-alerts",
]);

/** UI section → minimum permission */
export const UI_SECTION_PERMISSIONS = Object.freeze({
  "admin.hub": IAM_PERMISSIONS.DASHBOARD_READ,
  "admin.users": IAM_PERMISSIONS.USERS_READ,
  "admin.financial-center": IAM_PERMISSIONS.FINANCE_READ,
  "admin.partners": IAM_PERMISSIONS.PARTNERS_READ,
  "admin.email-analytics": IAM_PERMISSIONS.EMAIL_ANALYTICS_READ,
  "admin.notification-test": IAM_PERMISSIONS.SYSTEM_NOTIFICATIONS_TEST,
  "admin.analysis": IAM_PERMISSIONS.ANALYSIS_READ,
  "admin.accounts": IAM_PERMISSIONS.ACCOUNTS_READ,
  "admin.iam": IAM_PERMISSIONS.IAM_READ,
  "admin.news": IAM_PERMISSIONS.NEWS_READ,
  "admin.academy": IAM_PERMISSIONS.CONTENT_READ,
  "admin.results": IAM_PERMISSIONS.CONTENT_READ,
  "admin.subscriptions": IAM_PERMISSIONS.SUBSCRIPTIONS_MANAGE,
});

const UUID_PATTERN =
  /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi;
const NUMERIC_ID_PATTERN = /\/\d+(?=\/|$)/g;

export function normalizeRoutePath(pathname) {
  let normalized = String(pathname || "")
    .replace(UUID_PATTERN, "/[id]")
    .replace(NUMERIC_ID_PATTERN, "/[id]");

  if (normalized.includes("/user-management/")) {
    normalized = normalized.replace(/\/\[id\]/g, "/[userId]");
  }
  if (normalized.includes("/financial-center/payment-proof/")) {
    normalized = normalized.replace(/\/\[id\](?=\/|$)/, "/[requestId]");
  }
  if (normalized.includes("/partner-withdrawals/")) {
    normalized = normalized.replace(/\/\[id\](?=\/|$)/, "/[id]");
  }

  return normalized;
}

export function routeKey(method, pathname) {
  return `${String(method || "GET").toUpperCase()} ${normalizeRoutePath(pathname)}`;
}

export function permissionForRoute(method, pathname, action = null) {
  const key = routeKey(method, pathname);

  if (action && ACTION_ROUTE_PERMISSIONS[key]) {
    const map = ACTION_ROUTE_PERMISSIONS[key];
    const normalizedAction = String(action || "").trim();
    return map[normalizedAction] || map.default || null;
  }

  if (ROUTE_PERMISSIONS[key] !== undefined) {
    return ROUTE_PERMISSIONS[key];
  }

  const generic = normalizeRoutePath(pathname);
  const genericKey = `${String(method || "GET").toUpperCase()} ${generic}`;
  if (ROUTE_PERMISSIONS[genericKey] !== undefined) {
    return ROUTE_PERMISSIONS[genericKey];
  }

  return null;
}

export function getAllRoutePermissions() {
  return { ...ROUTE_PERMISSIONS };
}

export function getAllActionRoutePermissions() {
  return { ...ACTION_ROUTE_PERMISSIONS };
}

export function getAllUiSectionPermissions() {
  return { ...UI_SECTION_PERMISSIONS };
}

export function isProtectedAdminRoute(method, pathname) {
  const key = routeKey(method, pathname);
  if (MACHINE_AUTH_ROUTES.map((k) => canonicalizeKey(k)).includes(key)) return true;
  if (ACTION_ROUTE_PERMISSIONS[key]) return true;
  if (ROUTE_PERMISSIONS[key] !== undefined) return true;
  return false;
}

function canonicalizeKey(key) {
  const [method, ...rest] = key.split(" ");
  return routeKey(method, rest.join(" "));
}

/** @deprecated use isProtectedAdminRoute(method, pathname) */
export function isAdminIamRoute(pathname) {
  const path = String(pathname || "");
  return path.startsWith("/api/admin") || path.startsWith("/api/iam") || path === "/api/admin-reply";
}
