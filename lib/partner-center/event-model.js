import { PARTNER_EVENT_SOURCE_SYSTEMS } from "./constants.js";
import { logPartnerCenterEvent, logPartnerCenterFailure } from "./observability.js";

export function buildPartnerEventIdempotencyKey(eventType, parts = []) {
  const normalized = [String(eventType || "").trim(), ...parts.map((part) => String(part || "").trim())].filter(Boolean);
  return normalized.join(":");
}

export async function recordPartnerEvent(
  supabase,
  {
    eventType,
    idempotencyKey,
    partnerId = null,
    referredUserId = null,
    referralId = null,
    sourceSystem = PARTNER_EVENT_SOURCE_SYSTEMS.API,
    payload = {},
    occurredAt = null,
  }
) {
  const normalizedKey = String(idempotencyKey || "").trim();
  const normalizedType = String(eventType || "").trim();

  if (!normalizedKey || !normalizedType) {
    return { recorded: false, reason: "missing_fields" };
  }

  const row = {
    event_type: normalizedType,
    idempotency_key: normalizedKey,
    partner_id: partnerId || null,
    referred_user_id: referredUserId || null,
    referral_id: referralId || null,
    source_system: sourceSystem,
    payload: payload || {},
    occurred_at: occurredAt || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("partner_events")
    .insert(row)
    .select("id, event_type, idempotency_key, occurred_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: existing, error: lookupError } = await supabase
        .from("partner_events")
        .select("id, event_type, idempotency_key, occurred_at")
        .eq("idempotency_key", normalizedKey)
        .maybeSingle();

      if (lookupError) {
        throw lookupError;
      }

      logPartnerCenterEvent("partner_event.duplicate_rejected", {
        eventType: normalizedType,
        idempotencyKey: normalizedKey,
        existingEventId: existing?.id || null,
      });

      return {
        recorded: false,
        duplicate: true,
        eventId: existing?.id || null,
        event: existing,
      };
    }

    logPartnerCenterFailure("partner_event.insert_failed", {
      eventType: normalizedType,
      reason: error.message,
    });
    throw error;
  }

  logPartnerCenterEvent("partner_event.recorded", {
    eventType: normalizedType,
    eventId: data.id,
    partnerId,
    referralId,
  });

  return { recorded: true, duplicate: false, eventId: data.id, event: data };
}
