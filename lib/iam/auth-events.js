import { recordIamAudit } from "./audit.js";
import { recordSecurityEvent } from "./security-events.js";

function extractRequestMeta(request) {
  if (!request) return {};
  try {
    return {
      ip_address:
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        request.headers.get("x-real-ip") ||
        null,
      user_agent: request.headers.get("user-agent") || null,
      request_id: request.headers.get("x-request-id") || null,
    };
  } catch {
    return {};
  }
}

export async function recordAdminLoginEvent(supabase, params) {
  const meta = extractRequestMeta(params.request);

  await recordSecurityEvent(supabase, {
    eventType: params.success ? "auth.admin.login.success" : "auth.admin.login.failure",
    severity: params.success ? "info" : "warning",
    userId: params.userId || null,
    details: {
      isAdmin: Boolean(params.isAdmin),
      emailDomain: params.email ? String(params.email).split("@")[1] : null,
    },
    request: params.request,
  });

  if (params.success && params.isAdmin) {
    await recordIamAudit(supabase, {
      action: "auth.admin.login",
      actorId: params.userId,
      actorEmail: params.email,
      targetType: "session",
      targetId: params.sessionLogId || "login",
      metadata: { ip_address: meta.ip_address },
      request: params.request,
    });
  }

  return { ok: true };
}

export async function recordAdminLogoutEvent(supabase, params) {
  await recordSecurityEvent(supabase, {
    eventType: "auth.admin.logout",
    severity: "info",
    userId: params.userId,
    details: { reason: params.reason || "logout" },
    request: params.request,
  });

  if (params.isAdmin) {
    await recordIamAudit(supabase, {
      action: "auth.admin.logout",
      actorId: params.userId,
      actorEmail: params.email,
      targetType: "session",
      targetId: "logout",
      metadata: { reason: params.reason || "logout" },
      request: params.request,
    });
  }

  return { ok: true };
}

export async function recordSessionRefreshEvent(supabase, params) {
  await recordSecurityEvent(supabase, {
    eventType: "auth.session.refresh",
    severity: "info",
    userId: params.userId,
    details: { isAdmin: Boolean(params.isAdmin) },
    request: params.request,
  });
  return { ok: true };
}

export async function recordCriticalAdminAction(supabase, params) {
  return recordIamAudit(supabase, {
    action: params.action,
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    targetType: params.targetType,
    targetId: params.targetId,
    targetUserId: params.targetUserId,
    beforeData: params.beforeData,
    afterData: params.afterData,
    metadata: params.metadata,
    request: params.request,
    requireSuccess: params.requireSuccess,
  });
}
