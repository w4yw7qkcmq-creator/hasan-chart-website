const EMAIL_SUPPRESSIONS_TABLE = "email_suppressions";

export const SUPPRESSION_REASONS = Object.freeze({
  HARD_BOUNCE: "hard_bounce",
  COMPLAINT: "complaint",
  UNSUBSCRIBE: "unsubscribe",
  ADMIN_BLOCK: "admin_block",
  INVALID_ADDRESS: "invalid_address",
  PROVIDER_SUPPRESSED: "provider_suppressed",
});

/** Hard suppressions cannot be bypassed by marketing re-opt-in. */
const HARD_SUPPRESSION_REASONS = new Set([
  SUPPRESSION_REASONS.HARD_BOUNCE,
  SUPPRESSION_REASONS.COMPLAINT,
  SUPPRESSION_REASONS.ADMIN_BLOCK,
  SUPPRESSION_REASONS.INVALID_ADDRESS,
  SUPPRESSION_REASONS.PROVIDER_SUPPRESSED,
]);

/** Legacy/provider unsubscribe — marketing preference is authoritative for re-subscribe. */
const SOFT_SUPPRESSION_REASONS = new Set([SUPPRESSION_REASONS.UNSUBSCRIBE]);

export function isHardSuppressionReason(reason) {
  return HARD_SUPPRESSION_REASONS.has(String(reason || "").trim());
}

export function isSoftSuppressionReason(reason) {
  return SOFT_SUPPRESSION_REASONS.has(String(reason || "").trim());
}

export function normalizeSuppressionEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function mapResendEventToSuppressionReason(eventType, payload = {}) {
  switch (eventType) {
    case "email.complained":
      return SUPPRESSION_REASONS.COMPLAINT;
    case "email.bounced": {
      const bounceType = String(
        payload?.data?.bounce?.type ||
          payload?.bounce?.type ||
          payload?.data?.type ||
          ""
      )
        .trim()
        .toLowerCase();

      if (bounceType === "hard" || bounceType === "permanent") {
        return SUPPRESSION_REASONS.HARD_BOUNCE;
      }
      return null;
    }
    case "email.suppressed":
      return SUPPRESSION_REASONS.PROVIDER_SUPPRESSED;
    default:
      return null;
  }
}

export async function getActiveSuppression(supabase, email) {
  const normalizedEmail = normalizeSuppressionEmail(email);
  if (!normalizedEmail) return null;

  const { data, error } = await supabase
    .from(EMAIL_SUPPRESSIONS_TABLE)
    .select("id, normalized_email, reason, source, active, created_at, metadata")
    .eq("normalized_email", normalizedEmail)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "Failed to load email suppression");
  }

  return data || null;
}

export async function isEmailSuppressed(supabase, email) {
  const row = await getActiveSuppression(supabase, email);
  return Boolean(row);
}

export async function upsertEmailSuppression(
  supabase,
  {
    email,
    reason,
    source,
    metadata = {},
    active = true,
  } = {}
) {
  const normalizedEmail = normalizeSuppressionEmail(email);
  const normalizedReason = String(reason || "").trim();
  const normalizedSource = String(source || "system").trim();

  if (!normalizedEmail || !normalizedReason) {
    throw new Error("email and reason are required for suppression");
  }

  if (!HARD_SUPPRESSION_REASONS.has(normalizedReason) && !SOFT_SUPPRESSION_REASONS.has(normalizedReason)) {
    throw new Error(`Invalid suppression reason: ${normalizedReason}`);
  }

  const existing = await getActiveSuppression(supabase, normalizedEmail);
  const now = new Date().toISOString();

  if (existing) {
    const { data, error } = await supabase
      .from(EMAIL_SUPPRESSIONS_TABLE)
      .update({
        reason: normalizedReason,
        source: normalizedSource,
        active: active !== false,
        metadata: { ...(existing.metadata || {}), ...metadata },
        updated_at: now,
        deactivated_at: active === false ? now : null,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message || "Failed to update suppression");
    }

    return { created: false, updated: true, record: data };
  }

  const { data, error } = await supabase
    .from(EMAIL_SUPPRESSIONS_TABLE)
    .insert({
      normalized_email: normalizedEmail,
      reason: normalizedReason,
      source: normalizedSource,
      active: active !== false,
      metadata: metadata || {},
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      const row = await getActiveSuppression(supabase, normalizedEmail);
      return { created: false, updated: false, duplicate: true, record: row };
    }
    throw new Error(error.message || "Failed to create suppression");
  }

  return { created: true, updated: false, record: data };
}

export async function applySuppressionFromResendEvent(supabase, event) {
  const eventType = String(event?.type || "").trim();
  const reason = mapResendEventToSuppressionReason(eventType, event);

  if (!reason) {
    return { applied: false, reason: "not-suppressible-event" };
  }

  const data = event?.data || {};
  const recipient = Array.isArray(data.to) ? data.to[0] : data.to || null;

  if (!recipient) {
    return { applied: false, reason: "missing-recipient" };
  }

  const result = await upsertEmailSuppression(supabase, {
    email: recipient,
    reason,
    source: "resend_webhook",
    metadata: {
      eventType,
      resendId: data.email_id || data.id || null,
    },
  });

  return { applied: true, reason, result };
}
