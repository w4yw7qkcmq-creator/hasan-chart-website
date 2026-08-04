import crypto from "crypto";

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

export async function recordSecurityEvent(supabase, payload) {
  const eventType = String(payload.eventType || "").trim();
  if (!eventType) return { ok: false };

  const meta = extractRequestMeta(payload.request);
  const row = {
    user_id: payload.userId || null,
    service_account_id: payload.serviceAccountId || null,
    event_type: eventType,
    severity: String(payload.severity || "info").trim(),
    details: payload.details || {},
    ip_address: meta.ip_address,
    user_agent: meta.user_agent,
    request_id: meta.request_id,
    organization_id: payload.organizationId || null,
  };

  try {
    const { error } = await supabase.from("iam_security_events").insert(row);
    if (error && !/relation .* does not exist/i.test(error.message || "")) {
      console.warn("iam_security_events insert warning:", error.message);
    }
  } catch (err) {
    console.warn("iam_security_events skipped:", err?.message || err);
  }

  return { ok: true };
}

export function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex").slice(0, 32);
}
