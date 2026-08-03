import crypto from "crypto";
import { IAM_DEFAULT_ORGANIZATION_ID, IAM_ROLES } from "./constants.js";
import { invalidateUserPermissions } from "./cache.js";
import { recordBootstrapAudit } from "./audit.js";
import { recordSecurityEvent } from "./security-events.js";
import { normalizeEmail } from "../admin-emails.js";

const bootstrapAttempts = new Map();

function secureCompare(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(expected));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function getClientIp(request) {
  if (!request) return null;
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    null
  );
}

function ipAllowed(request) {
  const raw = String(process.env.IAM_BOOTSTRAP_ALLOWED_IPS || "").trim();
  if (!raw) return true;

  const clientIp = getClientIp(request);
  if (!clientIp) return false;

  const allowed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return allowed.some((entry) => {
    if (entry.includes("/")) {
      return clientIp.startsWith(entry.split("/")[0].slice(0, -1));
    }
    return clientIp === entry;
  });
}

function originAllowed(request) {
  if (!request) return true;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin) return true;
  if (!host) return true;
  try {
    const originHost = new URL(origin).host;
    return originHost === host;
  } catch {
    return false;
  }
}

function tokenExpired() {
  const expiresAt = String(process.env.IAM_BOOTSTRAP_EXPIRES_AT || "").trim();
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) return false;
  return Date.now() > ms;
}

export function checkBootstrapRateLimit(request) {
  const ip = getClientIp(request) || "unknown";
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const maxAttempts = 5;

  const entry = bootstrapAttempts.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }

  entry.count += 1;
  bootstrapAttempts.set(ip, entry);

  if (entry.count > maxAttempts) {
    return { ok: false, status: 429, error: "Too many bootstrap attempts" };
  }

  return { ok: true };
}

export function clearBootstrapRateLimits() {
  bootstrapAttempts.clear();
}

export async function getBootstrapState(supabase) {
  if (!supabase) {
    return { available: false, completed: false, tableMissing: true };
  }
  try {
    const { data, error } = await supabase
      .from("iam_bootstrap_state")
      .select("id, completed_at, completed_by")
      .eq("id", true)
      .maybeSingle();
    if (error) {
      if (/relation .* does not exist/i.test(error.message || "")) {
        return { available: false, completed: false, tableMissing: true };
      }
      throw error;
    }
    return {
      available: true,
      completed: Boolean(data?.completed_at),
      completedAt: data?.completed_at || null,
      completedBy: data?.completed_by || null,
      tableMissing: false,
    };
  } catch (err) {
    return { available: false, completed: false, error: err?.message };
  }
}

async function countActiveAssignments(supabase) {
  const { count, error } = await supabase
    .from("iam_user_assignments")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null);
  if (error) {
    if (/relation .* does not exist/i.test(error.message || "")) return -1;
    throw error;
  }
  return count ?? 0;
}

async function failBootstrap(supabase, params) {
  await recordSecurityEvent(supabase, {
    eventType: "iam.bootstrap.failed",
    severity: "critical",
    userId: params.userId,
    details: { reason: params.reason },
    request: params.request,
  });
  return { ok: false, status: params.status, error: params.error };
}

/**
 * One-time bootstrap: authenticated user + IAM_BOOTSTRAP_SECRET → super_admin.
 */
export async function executeBootstrap(supabase, params) {
  const { user, token, confirmEmail, request } = params;
  const bootstrapSecret = process.env.IAM_BOOTSTRAP_SECRET?.trim();

  if (!bootstrapSecret) {
    return failBootstrap(supabase, {
      userId: user?.id,
      reason: "secret_not_configured",
      status: 503,
      error: "Bootstrap secret is not configured",
      request,
    });
  }

  if (tokenExpired()) {
    return failBootstrap(supabase, {
      userId: user?.id,
      reason: "token_expired",
      status: 410,
      error: "Bootstrap window has expired",
      request,
    });
  }

  if (!ipAllowed(request)) {
    return failBootstrap(supabase, {
      userId: user?.id,
      reason: "ip_not_allowed",
      status: 403,
      error: "Bootstrap not allowed from this IP",
      request,
    });
  }

  if (!originAllowed(request)) {
    return failBootstrap(supabase, {
      userId: user?.id,
      reason: "origin_not_allowed",
      status: 403,
      error: "Bootstrap origin not allowed",
      request,
    });
  }

  const rate = checkBootstrapRateLimit(request);
  if (!rate.ok) return rate;

  if (!secureCompare(token, bootstrapSecret)) {
    return failBootstrap(supabase, {
      userId: user?.id,
      reason: "invalid_token",
      status: 401,
      error: "Invalid bootstrap token",
      request,
    });
  }

  const state = await getBootstrapState(supabase);
  if (state.completed) {
    return { ok: false, status: 410, error: "Bootstrap already completed" };
  }

  const assignmentCount = await countActiveAssignments(supabase);
  if (assignmentCount > 0) {
    return { ok: false, status: 409, error: "Active IAM assignments already exist" };
  }

  const normalizedConfirm = normalizeEmail(confirmEmail);
  const normalizedUser = normalizeEmail(user?.email);
  if (!normalizedConfirm || normalizedConfirm !== normalizedUser) {
    return { ok: false, status: 400, error: "Email confirmation does not match authenticated user" };
  }

  const organizationId = IAM_DEFAULT_ORGANIZATION_ID;
  const now = new Date().toISOString();

  const { error: assignError } = await supabase.from("iam_user_assignments").insert({
    user_id: user.id,
    role_id: IAM_ROLES.SUPER_ADMIN,
    organization_id: organizationId,
    granted_by: user.id,
    granted_at: now,
    grant_reason: "bootstrap_ceremony",
  });

  if (assignError) {
    if (/duplicate|unique/i.test(assignError.message || "")) {
      return { ok: false, status: 409, error: "Bootstrap already completed by concurrent request" };
    }
    return failBootstrap(supabase, {
      userId: user.id,
      reason: assignError.message,
      status: 500,
      error: "Bootstrap failed",
      request,
    });
  }

  await supabase
    .from("iam_bootstrap_state")
    .update({ completed_at: now, completed_by: user.id })
    .eq("id", true);

  invalidateUserPermissions(user.id, organizationId);

  await recordBootstrapAudit(supabase, {
    actorId: user.id,
    actorEmail: user.email,
    metadata: { ceremony: "IAM_BOOTSTRAP_SECRET" },
    request,
  });

  await recordSecurityEvent(supabase, {
    eventType: "iam.bootstrap.completed",
    severity: "info",
    userId: user.id,
    details: { role_id: IAM_ROLES.SUPER_ADMIN },
    request,
  });

  return {
    ok: true,
    roleId: IAM_ROLES.SUPER_ADMIN,
    userId: user.id,
  };
}

export function getBootstrapTokenFromRequest(request) {
  return request.headers.get("x-iam-bootstrap-token")?.trim() || "";
}
