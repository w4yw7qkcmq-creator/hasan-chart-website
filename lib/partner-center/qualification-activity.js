import { PARTNER_EVENT_SOURCE_SYSTEMS } from "./constants.js";
import { buildPartnerEventIdempotencyKey, recordPartnerEvent } from "./event-model.js";
import { logPartnerCenterEvent } from "./observability.js";
import { TRUSTED_QUALIFICATION_ACTIVITY_EVENT_TYPES } from "./qualification-policy.js";
import { reevaluateReferralQualificationForUser } from "./qualification-evaluator.js";

const ACTIVITY_EVENT_TYPES = Object.freeze({
  PRICE_ALERT: "qualification_activity_price_alert",
  INSTANT_ANALYSIS: "qualification_activity_instant_analysis",
  ANALYSIS_REQUEST: "qualification_activity_analysis_request",
  SERVICE_ACTIVATED: "qualification_activity_service_activated",
});

export { ACTIVITY_EVENT_TYPES, TRUSTED_QUALIFICATION_ACTIVITY_EVENT_TYPES };

/**
 * Record a server-trusted meaningful activity and reevaluate qualification.
 * Must only be called from successful server-side operations — never from a public qualification API.
 */
export async function recordTrustedQualificationActivity(
  supabase,
  {
    referredUserId,
    activityType,
    sourceEntityId,
    partnerId = null,
    referralId = null,
    payload = {},
  }
) {
  const normalizedUserId = String(referredUserId || "").trim();
  const normalizedType = String(activityType || "").trim();
  const normalizedEntityId = String(sourceEntityId || "").trim();

  if (!normalizedUserId || !normalizedType) {
    return { recorded: false, reason: "missing_fields" };
  }

  if (!TRUSTED_QUALIFICATION_ACTIVITY_EVENT_TYPES.includes(normalizedType)) {
    return { recorded: false, reason: "unsupported_activity_type" };
  }

  const idempotencyKey = buildPartnerEventIdempotencyKey(normalizedType, [
    normalizedUserId,
    normalizedEntityId || "none",
  ]);

  const event = await recordPartnerEvent(supabase, {
    eventType: normalizedType,
    idempotencyKey,
    partnerId,
    referralId,
    referredUserId: normalizedUserId,
    sourceSystem: PARTNER_EVENT_SOURCE_SYSTEMS.API,
    payload: {
      sourceEntityId: normalizedEntityId || null,
      ...payload,
    },
  });

  logPartnerCenterEvent("qualification.activity_recorded", {
    referredUserId: normalizedUserId,
    activityType: normalizedType,
    duplicate: Boolean(event.duplicate),
  });

  const evaluation = await reevaluateReferralQualificationForUser(supabase, {
    referredUserId: normalizedUserId,
    trigger: normalizedType,
    sourceEventId: event.eventId,
  });

  return { event, evaluation };
}

/** Fire-and-forget wrapper — never throws to callers. */
export function emitTrustedQualificationActivity(supabase, input) {
  void recordTrustedQualificationActivity(supabase, input).catch(() => null);
}
