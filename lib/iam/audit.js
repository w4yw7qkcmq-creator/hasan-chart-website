import { redactObject } from "../admin-audit-log.js";

const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "api_key",
]);

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

/**
 * Unified IAM audit writer. Dual-writes to admin_logs during migration.
 */
export async function recordIamAudit(supabase, payload) {
  const action = String(payload.action || "").trim();
  if (!action) return { ok: false, skipped: true };

  const meta = extractRequestMeta(payload.request);
  const row = {
    actor_id: payload.actorId || null,
    actor_email: payload.actorEmail || null,
    actor_type: payload.actorType || "user",
    service_account_id: payload.serviceAccountId || null,
    action,
    target_type: payload.targetType || null,
    target_id: payload.targetId != null ? String(payload.targetId) : null,
    before_data: payload.beforeData ? redactObject(payload.beforeData) : null,
    after_data: payload.afterData ? redactObject(payload.afterData) : null,
    metadata: redactObject({
      ...(payload.metadata || {}),
      organization_id: payload.organizationId || null,
    }),
    ip_address: meta.ip_address,
    user_agent: meta.user_agent,
    request_id: meta.request_id,
  };

  let iamOk = false;
  let iamError = null;
  try {
    const { error } = await supabase.from("iam_audit_logs").insert(row);
    if (!error) iamOk = true;
    else iamError = error.message;
  } catch (err) {
    iamError = err?.message || String(err);
    console.warn("iam_audit_logs insert skipped:", iamError);
  }

  if (payload.requireSuccess && !iamOk) {
    return { ok: false, error: iamError || "audit_write_failed" };
  }

  // Dual-write legacy admin_logs for compatibility
  try {
    await supabase.from("admin_logs").insert({
      admin_id: row.actor_id,
      admin_email: row.actor_email,
      action: row.action,
      target_table: row.target_type || "iam",
      target_id: row.target_id || "",
      details: row.metadata,
    });
  } catch {
    // non-blocking
  }

  // Dual-write admin_audit_logs if table exists
  try {
    await supabase.from("admin_audit_logs").insert({
      admin_user_id: row.actor_id,
      admin_email: row.actor_email,
      target_user_id: payload.targetUserId || null,
      action: row.action,
      entity_type: row.target_type,
      entity_id: row.target_id,
      before_data: row.before_data,
      after_data: row.after_data,
      metadata: row.metadata,
    });
  } catch {
    // non-blocking
  }

  return { ok: iamOk || true };
}

export async function recordGrantAudit(supabase, params) {
  return recordIamAudit(supabase, {
    action: "iam.grant_role",
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    targetType: "user",
    targetId: params.targetUserId,
    targetUserId: params.targetUserId,
    beforeData: params.beforeData,
    afterData: params.afterData,
    metadata: { role_id: params.roleId, reason: params.reason },
    organizationId: params.organizationId,
    request: params.request,
  });
}

export async function recordRevokeAudit(supabase, params) {
  return recordIamAudit(supabase, {
    action: "iam.revoke_role",
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    targetType: "user",
    targetId: params.targetUserId,
    targetUserId: params.targetUserId,
    beforeData: params.beforeData,
    afterData: params.afterData,
    metadata: { role_id: params.roleId, reason: params.reason },
    organizationId: params.organizationId,
    request: params.request,
  });
}

export async function recordBootstrapAudit(supabase, params) {
  return recordIamAudit(supabase, {
    action: "iam.bootstrap",
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    targetType: "system",
    targetId: "bootstrap",
    afterData: { role_id: "super_admin" },
    metadata: params.metadata || {},
    request: params.request,
  });
}

export async function recordDeniedAudit(supabase, params) {
  return recordIamAudit(supabase, {
    action: "iam.denied",
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    targetType: "permission",
    targetId: params.permission,
    metadata: params.metadata || {},
    request: params.request,
  });
}
