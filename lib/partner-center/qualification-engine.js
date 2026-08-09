import {
  QUALIFICATION_STATES,
  VALID_QUALIFICATION_TRANSITIONS,
  PARTNER_EVENT_TYPES,
} from "./constants.js";
import { buildPartnerEventIdempotencyKey, recordPartnerEvent } from "./event-model.js";
import { logPartnerCenterEvent, logPartnerCenterFailure } from "./observability.js";
import { isGrowthRuntimeEnabled } from "./growth-runtime-gate.js";

export function canTransitionQualification(fromState, toState) {
  const normalizedFrom = String(fromState || QUALIFICATION_STATES.SIGNUP);
  const normalizedTo = String(toState || "").trim();
  const allowed = VALID_QUALIFICATION_TRANSITIONS[normalizedFrom];
  return Boolean(allowed && allowed.has(normalizedTo));
}

export async function initializeReferralQualification(
  supabase,
  { partnerId, referralId, referredUserId, sourceEventId = null }
) {
  const { data, error } = await supabase
    .from("partner_referral_qualifications")
    .insert({
      referral_id: referralId,
      partner_id: partnerId,
      referred_user_id: referredUserId,
      state: QUALIFICATION_STATES.SIGNUP,
      last_transition_reason: "signup_attributed",
      source_event_id: sourceEventId,
    })
    .select("referral_id, state")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { created: false, duplicate: true };
    }
    throw error;
  }

  await supabase.from("partner_qualification_transitions").insert({
    referral_id: referralId,
    partner_id: partnerId,
    from_state: null,
    to_state: QUALIFICATION_STATES.SIGNUP,
    reason: "signup_attributed",
    source_event_id: sourceEventId,
  });

  return { created: true, qualification: data };
}

export async function transitionReferralQualification(
  supabase,
  {
    referralId,
    partnerId,
    toState,
    reason,
    sourceEventId = null,
    allowSameState = false,
  }
) {
  const normalizedReferralId = String(referralId || "").trim();
  const normalizedToState = String(toState || "").trim();
  const normalizedReason = String(reason || "").trim() || "unspecified";

  if (!normalizedReferralId || !normalizedToState) {
    return { transitioned: false, reason: "missing_fields" };
  }

  const { data: current, error: currentError } = await supabase
    .from("partner_referral_qualifications")
    .select("referral_id, partner_id, state")
    .eq("referral_id", normalizedReferralId)
    .maybeSingle();

  if (currentError) {
    throw currentError;
  }

  if (!current?.referral_id) {
    return { transitioned: false, reason: "not_found" };
  }

  if (String(current.partner_id) !== String(partnerId || current.partner_id)) {
    return { transitioned: false, reason: "partner_mismatch" };
  }

  if (current.state === normalizedToState) {
    return allowSameState
      ? { transitioned: false, reason: "already_in_state", state: current.state }
      : { transitioned: false, reason: "already_in_state", state: current.state };
  }

  if (!canTransitionQualification(current.state, normalizedToState)) {
    logPartnerCenterFailure("qualification.invalid_transition", {
      referralId: normalizedReferralId,
      fromState: current.state,
      toState: normalizedToState,
      reason: normalizedReason,
    });
    return {
      transitioned: false,
      reason: "invalid_transition",
      fromState: current.state,
      toState: normalizedToState,
    };
  }

  const updates = {
    state: normalizedToState,
    last_transition_reason: normalizedReason,
    source_event_id: sourceEventId,
    updated_at: new Date().toISOString(),
  };

  if (normalizedToState === QUALIFICATION_STATES.QUALIFIED) {
    updates.qualified_at = new Date().toISOString();
  }
  if (normalizedToState === QUALIFICATION_STATES.DISQUALIFIED) {
    updates.disqualified_at = new Date().toISOString();
  }

  const { data: updated, error: updateError } = await supabase
    .from("partner_referral_qualifications")
    .update(updates)
    .eq("referral_id", normalizedReferralId)
    .eq("state", current.state)
    .select("referral_id, state, qualified_at, disqualified_at")
    .maybeSingle();

  if (updateError) {
    throw updateError;
  }

  if (!updated?.referral_id) {
    return { transitioned: false, reason: "concurrent_conflict", fromState: current.state };
  }

  await supabase.from("partner_qualification_transitions").insert({
    referral_id: normalizedReferralId,
    partner_id: partnerId,
    from_state: current.state,
    to_state: normalizedToState,
    reason: normalizedReason,
    source_event_id: sourceEventId,
  });

  logPartnerCenterEvent("qualification.transitioned", {
    referralId: normalizedReferralId,
    fromState: current.state,
    toState: normalizedToState,
    reason: normalizedReason,
  });

  if (
    isGrowthRuntimeEnabled() &&
    (normalizedToState === QUALIFICATION_STATES.QUALIFIED ||
      normalizedToState === QUALIFICATION_STATES.CUSTOMER)
  ) {
    const { onPartnerGrowthEvent } = await import("./growth-integration.js");
    const { data: partnerRow } = await supabase
      .from("partners")
      .select("tier_key")
      .eq("id", partnerId)
      .maybeSingle();
    await onPartnerGrowthEvent(supabase, {
      partnerId,
      eventType:
        normalizedToState === QUALIFICATION_STATES.CUSTOMER ? "customer" : "qualified_referral",
      tierKey: partnerRow?.tier_key,
    });
  }

  return { transitioned: true, fromState: current.state, qualification: updated };
}

export async function markReferralQualifiedOnActivation(
  supabase,
  { partnerId, referralId, referredUserId, reason = "service_activated" }
) {
  const event = await recordPartnerEvent(supabase, {
    eventType: PARTNER_EVENT_TYPES.QUALIFIED_REFERRAL,
    idempotencyKey: buildPartnerEventIdempotencyKey(PARTNER_EVENT_TYPES.QUALIFIED_REFERRAL, [
      referralId,
    ]),
    partnerId,
    referralId,
    referredUserId,
    payload: { reason },
  });

  const result = await transitionReferralQualification(supabase, {
    referralId,
    partnerId,
    toState: QUALIFICATION_STATES.QUALIFIED,
    reason,
    sourceEventId: event.eventId,
  });

  return { ...result, event };
}

export const QUALIFICATION_STATE_MACHINE_SUMMARY = Object.freeze({
  states: Object.values(QUALIFICATION_STATES),
  transitions: Object.fromEntries(
    Object.entries(VALID_QUALIFICATION_TRANSITIONS).map(([from, toSet]) => [from, [...toSet]])
  ),
  note: "Money events require qualified/customer states — signup alone never pays service commissions",
});
