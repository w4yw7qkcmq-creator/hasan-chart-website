const SENSITIVE_KEYS = new Set([
  "password",
  "api_key",
  "secret_key",
  "token",
  "access_token",
  "refresh_token",
  "trading_password",
  "api_key_encrypted",
  "secret_key_encrypted",
  "trading_password_encrypted",
  "payment_proof",
]);

function redactValue(key, value) {
  const normalizedKey = String(key || "").toLowerCase();
  if (SENSITIVE_KEYS.has(normalizedKey) || normalizedKey.includes("password") || normalizedKey.includes("token")) {
    return "[redacted]";
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return redactObject(value);
  }
  return value;
}

export function redactObject(input) {
  if (!input || typeof input !== "object") return input;
  if (Array.isArray(input)) {
    return input.map((item) => (typeof item === "object" ? redactObject(item) : item));
  }

  const output = {};
  for (const [key, value] of Object.entries(input)) {
    output[key] = redactValue(key, value);
  }
  return output;
}

/**
 * Central audit writer — uses existing admin_logs table.
 * Audit failure must NOT fail the primary operation.
 */
export async function recordAdminAction(
  supabase,
  {
    adminId = null,
    adminEmail = null,
    action,
    targetTable = null,
    targetId = null,
    details = {},
  }
) {
  const normalizedAction = String(action || "").trim();
  if (!normalizedAction) {
    console.warn("recordAdminAction skipped: missing action");
    return { ok: false, skipped: true };
  }

  const row = {
    admin_id: adminId || null,
    admin_email: adminEmail || null,
    action: normalizedAction,
    target_table: targetTable || "profiles",
    target_id: targetId != null ? String(targetId) : "",
    details: redactObject(details || {}),
  };

  try {
    const { error } = await supabase.from("admin_logs").insert(row);
    if (error) throw error;
    return { ok: true };
  } catch (error) {
    console.warn("recordAdminAction warning:", error?.message || error);
    return { ok: false, error };
  }
}

/** @deprecated Use recordAdminAction — kept for backward compatibility */
export async function writeAdminAuditLog(
  supabase,
  {
    adminUserId = null,
    adminEmail = null,
    targetUserId = null,
    action,
    entityType = null,
    entityId = null,
    beforeData = null,
    afterData = null,
    metadata = {},
  }
) {
  return recordAdminAction(supabase, {
    adminId: adminUserId,
    adminEmail,
    action,
    targetTable: entityType || "admin_user_management",
    targetId: entityId != null ? String(entityId) : String(targetUserId || ""),
    details: {
      target_user_id: targetUserId,
      before: beforeData ? redactObject(beforeData) : null,
      after: afterData ? redactObject(afterData) : null,
      metadata: redactObject(metadata || {}),
    },
  });
}
