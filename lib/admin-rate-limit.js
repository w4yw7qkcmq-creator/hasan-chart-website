import {
  createRateLimit,
  getClientIp,
  hashNetworkKey,
  ONE_HOUR_MS,
  TEN_MINUTES_MS,
} from "./rate-limit.js";

function readPositiveInt(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

export const ADMIN_RATE_LIMITED_CODE = "ADMIN_RATE_LIMITED";
export const ADMIN_RATE_LIMIT_MESSAGE_AR =
  "تم إرسال عدد كبير من الطلبات خلال وقت قصير. سنعيد المحاولة بعد لحظات.";

/** Authenticated admin GET/HEAD — per admin user, generous burst for dashboard loads. */
export const adminReadLimiter = createRateLimit({
  prefix: "admin-read-v2",
  windowMs: readPositiveInt("ADMIN_READ_WINDOW_MS", ONE_HOUR_MS),
  max: readPositiveInt("ADMIN_READ_MAX", 900),
  useRedis: true,
});

/** Authenticated admin mutations — per admin user. */
export const adminWriteLimiter = createRateLimit({
  prefix: "admin-write-v2",
  windowMs: readPositiveInt("ADMIN_WRITE_WINDOW_MS", TEN_MINUTES_MS),
  max: readPositiveInt("ADMIN_WRITE_MAX", 120),
  useRedis: true,
});

/** Financial / commission / payout class mutations — stricter per admin user. */
export const adminSensitiveWriteLimiter = createRateLimit({
  prefix: "admin-sensitive-v2",
  windowMs: readPositiveInt("ADMIN_SENSITIVE_WINDOW_MS", TEN_MINUTES_MS),
  max: readPositiveInt("ADMIN_SENSITIVE_MAX", 40),
  useRedis: true,
});

/** Secondary IP abuse guard — high ceiling, not used for normal dashboard navigation. */
export const adminIpGuardLimiter = createRateLimit({
  prefix: "admin-ip-guard-v2",
  windowMs: readPositiveInt("ADMIN_IP_GUARD_WINDOW_MS", ONE_HOUR_MS),
  max: readPositiveInt("ADMIN_IP_GUARD_MAX", 4000),
  useRedis: true,
});

const SENSITIVE_WRITE_PATH_SNIPPETS = [
  "/partner-marketing/qualified-referral-reward",
  "/partner-marketing/service-commissions",
  "/partner-withdrawals/",
  "/financial-center",
  "/subscription-requests/",
  "/user-management/",
  "/partner-marketing/fraud-review",
];

export function shouldApplyAdminRateLimit(request) {
  if (!request?.url) return false;
  const pathname = new URL(request.url).pathname;
  return (
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/iam") ||
    pathname === "/api/admin-reply"
  );
}

export function classifyAdminRequestKind(request) {
  const method = String(request?.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return "read";

  const pathname = new URL(request.url).pathname;
  if (SENSITIVE_WRITE_PATH_SNIPPETS.some((snippet) => pathname.includes(snippet))) {
    return "sensitive";
  }

  return "write";
}

export function adminRateLimitUserKey(session) {
  const stableId = session?.user?.id || session?.user?.email;
  return String(stableId || "admin").trim().toLowerCase();
}

function pickLimiter(kind) {
  if (kind === "read") return adminReadLimiter;
  if (kind === "sensitive") return adminSensitiveWriteLimiter;
  return adminWriteLimiter;
}

export async function guardAdminApiRateLimit(request, session, kind = null) {
  const resolvedKind = kind || classifyAdminRequestKind(request);
  const userKey = adminRateLimitUserKey(session);
  const ipKey = hashNetworkKey(getClientIp(request));

  const primary = await pickLimiter(resolvedKind)(`user:${userKey}`);
  if (!primary.success) {
    return {
      ...primary,
      kind: resolvedKind,
      layer: resolvedKind,
      scope: "user",
    };
  }

  const ipGuard = await adminIpGuardLimiter(`ip:${ipKey}`);
  if (!ipGuard.success) {
    return {
      ...ipGuard,
      kind: resolvedKind,
      layer: "ip-guard",
      scope: "ip",
    };
  }

  return { success: true, kind: resolvedKind };
}

export function adminRateLimitDeniedResult(rateResult) {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((Number(rateResult?.resetTime || Date.now() + 60_000) - Date.now()) / 1000)
  );

  return {
    ok: false,
    status: 429,
    error: ADMIN_RATE_LIMIT_MESSAGE_AR,
    code: ADMIN_RATE_LIMITED_CODE,
    retryAfterSeconds,
    layer: rateResult?.layer || rateResult?.kind || "read",
    kind: rateResult?.kind || "read",
  };
}

export function jsonAdminRateLimited(rateResult) {
  const denied = adminRateLimitDeniedResult(rateResult);

  console.info("ADMIN_RATE_LIMITED", {
    code: denied.code,
    layer: denied.layer,
    kind: denied.kind,
    retryAfterSeconds: denied.retryAfterSeconds,
  });

  return Response.json(
    {
      success: false,
      error: denied.error,
      code: denied.code,
      retryAfterSeconds: denied.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store, max-age=0",
        "Retry-After": String(denied.retryAfterSeconds),
      },
    }
  );
}

export function adminPermissionDeniedResponse(adminCheck) {
  const body = {
    success: false,
    error: adminCheck.error,
  };

  if (adminCheck.code) body.code = adminCheck.code;
  if (adminCheck.retryAfterSeconds) body.retryAfterSeconds = adminCheck.retryAfterSeconds;

  const headers = {};
  if (adminCheck.status === 429 && adminCheck.retryAfterSeconds) {
    headers["Retry-After"] = String(adminCheck.retryAfterSeconds);
  }

  return Response.json(body, { status: adminCheck.status, headers });
}
