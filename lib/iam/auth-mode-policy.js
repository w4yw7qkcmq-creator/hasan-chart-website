/** Server-side auth verification modes — never derived from client input. */

export const AUTH_MODES = Object.freeze({
  /** Writes, sensitive reads, unclassified routes — getUser mandatory. */
  AUTHORITATIVE_GETUSER: "authoritative_getuser",
  /** getUser authoritative; getClaims runs for parity logging only. */
  SHADOW_GETCLAIMS: "shadow_getclaims",
  /** getClaims authoritative on approved read routes (when flag enabled). */
  READ_ONLY_GETCLAIMS: "read_only_getclaims",
});

/**
 * Explicit read-safe admin GET routes (default-deny: unlisted → getUser).
 * Patterns use [param] for dynamic segments.
 */
export const READ_SAFE_ADMIN_ROUTES = Object.freeze([
  { method: "GET", pattern: "/api/admin/email-campaigns" },
  { method: "GET", pattern: "/api/admin/email-campaigns/audience-counts" },
  { method: "GET", pattern: "/api/admin/email-campaigns/audience-search" },
  { method: "GET", pattern: "/api/admin/email-campaigns/[id]" },
  { method: "GET", pattern: "/api/admin/email-campaigns/[id]/preview" },
  { method: "GET", pattern: "/api/admin/email-outbox" },
  { method: "GET", pattern: "/api/admin/email-analytics" },
  { method: "GET", pattern: "/api/admin/email-analytics/[id]" },
  { method: "GET", pattern: "/api/admin/email-analytics/marketing-metrics" },
  { method: "GET", pattern: "/api/admin/user-management" },
  { method: "GET", pattern: "/api/admin/user-management/stats" },
  { method: "GET", pattern: "/api/admin/user-management/[userId]" },
  { method: "GET", pattern: "/api/admin/user-management/[userId]/notes" },
  { method: "GET", pattern: "/api/admin/dashboard" },
  { method: "GET", pattern: "/api/admin/email-analytics/monitoring" },
]);

/** Always getUser — overrides read-safe if matched first. */
export const SENSITIVE_ADMIN_ROUTE_SNIPPETS = Object.freeze([
  "/api/iam/",
  "/actions",
  "/launch",
  "/test-send",
  "/account-keys",
  "/financial-center",
  "/partner-withdrawals",
  "/subscription-requests",
  "/vip-recommendations/",
  "/cron/",
]);

function normalizePath(pathname) {
  return String(pathname || "")
    .split("?")[0]
    .replace(/\/+$/, "") || "/";
}

function patternToRegex(pattern) {
  const escaped = pattern
    .split("/")
    .map((segment) => {
      if (segment === "[id]" || segment === "[userId]") return "[^/]+";
      if (segment.startsWith("[") && segment.endsWith("]")) return "[^/]+";
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${escaped}$`);
}

const READ_SAFE_REGEX = READ_SAFE_ADMIN_ROUTES.map((entry) => ({
  method: entry.method.toUpperCase(),
  regex: patternToRegex(entry.pattern),
  pattern: entry.pattern,
}));

export function isSensitiveAdminRoute(pathname, method = "GET") {
  const path = normalizePath(pathname);
  const verb = String(method || "GET").toUpperCase();

  if (verb !== "GET" && verb !== "HEAD") {
    return true;
  }

  for (const snippet of SENSITIVE_ADMIN_ROUTE_SNIPPETS) {
    if (path.includes(snippet)) {
      return true;
    }
  }

  return false;
}

export function isReadSafeAdminRoute(pathname, method = "GET") {
  const path = normalizePath(pathname);
  const verb = String(method || "GET").toUpperCase();

  if (verb !== "GET" && verb !== "HEAD") {
    return false;
  }

  if (isSensitiveAdminRoute(path, verb)) {
    return false;
  }

  return READ_SAFE_REGEX.some((entry) => entry.method === verb && entry.regex.test(path));
}

/**
 * Resolve auth mode for an incoming admin API request.
 */
export function resolveAuthModeForRequest(request, flags = {}) {
  const readsEnabled = Boolean(flags.localAuthReadsEnabled);
  const shadowEnabled = Boolean(flags.localAuthShadowEnabled);

  if (!request?.url) {
    return AUTH_MODES.AUTHORITATIVE_GETUSER;
  }

  let pathname;
  let method;
  try {
    const url = new URL(request.url);
    pathname = url.pathname;
    method = request.method;
  } catch {
    return AUTH_MODES.AUTHORITATIVE_GETUSER;
  }

  if (isSensitiveAdminRoute(pathname, method)) {
    return AUTH_MODES.AUTHORITATIVE_GETUSER;
  }

  if (!isReadSafeAdminRoute(pathname, method)) {
    return AUTH_MODES.AUTHORITATIVE_GETUSER;
  }

  if (readsEnabled) {
    return AUTH_MODES.READ_ONLY_GETCLAIMS;
  }

  if (shadowEnabled) {
    return AUTH_MODES.SHADOW_GETCLAIMS;
  }

  return AUTH_MODES.AUTHORITATIVE_GETUSER;
}

/** @internal tests */
export function __matchReadSafeRoute(pathname, method = "GET") {
  return isReadSafeAdminRoute(pathname, method);
}
