import { IAM_PERMISSIONS } from "./constants.js";

/**
 * Admin UI page → minimum IAM permission.
 * Paths use Next.js dynamic segments ([id], [userId]).
 */
export const ADMIN_PAGE_PERMISSIONS = Object.freeze({
  "/admin": IAM_PERMISSIONS.DASHBOARD_READ,
  "/admin/users": IAM_PERMISSIONS.USERS_READ,
  "/admin/users/[userId]": IAM_PERMISSIONS.USERS_READ,
  "/admin/financial-center": IAM_PERMISSIONS.FINANCE_READ,
  "/admin/partners": IAM_PERMISSIONS.PARTNERS_READ,
  "/admin/partners/[id]": IAM_PERMISSIONS.PARTNERS_READ,
  "/admin/partners/settings": IAM_PERMISSIONS.PARTNERS_SETTINGS_READ,
  "/admin/partner-marketing": IAM_PERMISSIONS.PARTNERS_MISSIONS_READ,
  "/admin/email-analytics": IAM_PERMISSIONS.EMAIL_ANALYTICS_READ,
  "/admin/email-analytics/[id]": IAM_PERMISSIONS.EMAIL_ANALYTICS_READ,
  "/admin/notification-test": IAM_PERMISSIONS.SYSTEM_NOTIFICATIONS_TEST,
  "/admin/iam": IAM_PERMISSIONS.IAM_READ,
  "/admin/news": IAM_PERMISSIONS.NEWS_READ,
  "/admin/academy": IAM_PERMISSIONS.CONTENT_READ,
  "/admin/results": IAM_PERMISSIONS.CONTENT_READ,
});

const UUID_SEGMENT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATIC_ADMIN_SEGMENTS = new Set([
  "users",
  "financial-center",
  "partners",
  "email-analytics",
  "notification-test",
  "iam",
  "news",
  "academy",
  "results",
  "settings",
]);

export function normalizeAdminPagePath(pathname) {
  const path = String(pathname || "")
    .split("?")[0]
    .replace(/\/+$/, "") || "/admin";

  if (!path.startsWith("/admin")) return path;

  const segments = path.split("/").filter(Boolean);
  const normalized = segments.map((segment, index) => {
    if (index === 0) return segment;
    const parent = segments[index - 1];
    if (UUID_SEGMENT.test(segment)) {
      if (parent === "users") return "[userId]";
      return "[id]";
    }
    if (/^\d+$/.test(segment)) return "[id]";
    if (
      parent &&
      !STATIC_ADMIN_SEGMENTS.has(segment) &&
      (parent === "users" || parent === "partners" || parent === "email-analytics")
    ) {
      return parent === "users" ? "[userId]" : "[id]";
    }
    return segment;
  });

  return `/${normalized.join("/")}`;
}

export function permissionForAdminPage(pathname) {
  const normalized = normalizeAdminPagePath(pathname);
  if (ADMIN_PAGE_PERMISSIONS[normalized] !== undefined) {
    return ADMIN_PAGE_PERMISSIONS[normalized];
  }

  // Longest-prefix fallback for nested admin routes under known parents.
  const entries = Object.entries(ADMIN_PAGE_PERMISSIONS).sort(
    (a, b) => b[0].length - a[0].length
  );
  for (const [pattern, permission] of entries) {
    if (normalized === pattern || normalized.startsWith(`${pattern}/`)) {
      return permission;
    }
  }

  return null;
}

export function getAllAdminPagePermissions() {
  return { ...ADMIN_PAGE_PERMISSIONS };
}
