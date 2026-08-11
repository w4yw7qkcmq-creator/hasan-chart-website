import crypto from "crypto";
import { FALLBACK_ADMIN_EMAILS } from "./admin-emails";
import { getSupabaseAdmin } from "./auth-session";
import { requireAdminSession } from "./iam/require-admin-session.js";
import { requirePermission } from "./iam/require-permission.js";

export { FALLBACK_ADMIN_EMAILS };

export { adminPermissionDeniedResponse as respondAdminAccessDenied } from "./admin-rate-limit.js";

/** @deprecated Prefer requireAdminPermission(permission) from IAM layer. */
export async function requireAdminPermission(permission, options = {}) {
  return requirePermission(permission, options);
}

function secureCompare(provided, expected) {
  if (!provided || !expected) return false;

  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(String(expected));

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

export function getCronSecretFromRequest(request) {
  const authHeader = request.headers.get("authorization") || "";
  const bearer = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const headerSecret = request.headers.get("x-cron-secret")?.trim() || "";

  return bearer || headerSecret;
}

export function verifyCronSecret(request) {
  const secret =
    process.env.CRON_SECRET?.trim() || process.env.ADMIN_CRON_SECRET?.trim();

  if (!secret) {
    return {
      ok: false,
      status: 503,
      error: "Cron secret is not configured on the server.",
    };
  }

  const provided = getCronSecretFromRequest(request);

  if (!secureCompare(provided, secret)) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized cron request.",
    };
  }

  return { ok: true };
}

export async function verifyAdminSession() {
  const session = await requireAdminSession();
  if (!session.ok) {
    return {
      ok: false,
      status: session.status,
      error: session.error,
    };
  }
  return {
    ok: true,
    user: session.user,
    supabase: session.supabase,
    iam: session.iam,
  };
}

export async function verifyAdminOrCronSecret(request) {
  const cronCheck = verifyCronSecret(request);
  if (cronCheck.ok) {
    return { ok: true, via: "cron", supabase: getSupabaseAdmin() };
  }

  const adminCheck = await verifyAdminSession();
  if (adminCheck.ok) {
    return {
      ok: true,
      via: "admin",
      user: adminCheck.user,
      supabase: adminCheck.supabase,
    };
  }

  if (process.env.CRON_SECRET?.trim()) {
    return cronCheck;
  }

  return adminCheck;
}
