import { PARTNER_EVENT_TYPES, PARTNER_EVENT_SOURCE_SYSTEMS } from "./constants.js";
import { recordAttributionClick, finalizeReferralAttribution } from "./attribution-engine.js";
import { evaluateReferralSignupFraud } from "./anti-fraud.js";
import { buildPartnerEventIdempotencyKey, recordPartnerEvent } from "./event-model.js";
import {
  initializeReferralQualification,
  markReferralQualifiedOnActivation,
} from "./qualification-engine.js";
import {
  recordCommissionLedgerCredit,
  recordCommissionReleaseLedgerMove,
} from "./financial-ledger.js";
import { logPartnerCenterEvent } from "./observability.js";

export async function onPartnerReferralClick(supabase, input = {}) {
  return recordAttributionClick(supabase, input);
}

export async function onPartnerSignupLinked(
  supabase,
  {
    partnerId,
    referralId,
    referredUserId,
    referralCode,
    visitorKey = null,
    attribution = {},
    selfReferral = false,
    duplicateAttribution = false,
    recentSignupCount = 0,
  }
) {
  const signupEvent = await recordPartnerEvent(supabase, {
    eventType: PARTNER_EVENT_TYPES.SIGNUP,
    idempotencyKey: buildPartnerEventIdempotencyKey(PARTNER_EVENT_TYPES.SIGNUP, [referredUserId]),
    partnerId,
    referralId,
    referredUserId,
    sourceSystem: PARTNER_EVENT_SOURCE_SYSTEMS.API,
    payload: { referralCode },
  });

  const attributionResult = await finalizeReferralAttribution(supabase, {
    partnerId,
    referralId,
    referredUserId,
    referralCode,
    visitorKey,
    attribution,
  });

  const qualificationResult = await initializeReferralQualification(supabase, {
    partnerId,
    referralId,
    referredUserId,
    sourceEventId: signupEvent.eventId,
  });

  const fraud = await evaluateReferralSignupFraud(supabase, {
    partnerId,
    referredUserId,
    referralId,
    selfReferral,
    duplicateAttribution,
    recentSignupCount,
    sourceEventId: signupEvent.eventId,
  });

  logPartnerCenterEvent("integration.signup_linked", {
    partnerId,
    referralId,
    referredUserId,
    fraudDecision: fraud.assessment.decision,
    fraudRisk: fraud.assessment.riskLevel,
  });

  return {
    signupEvent,
    attributionResult,
    qualificationResult,
    fraud,
  };
}

export async function onPartnerCommissionCreatedBridge(
  supabase,
  { partnerId, commissionId, amount, lifecycleStatus, balanceBucket, metadata = {} }
) {
  if (!partnerId || !commissionId || !amount) {
    return { bridged: false, reason: "missing_fields" };
  }

  return recordCommissionLedgerCredit(supabase, {
    partnerId,
    commissionId,
    amount,
    lifecycleStatus,
    balanceBucket,
    metadata,
  });
}

export async function onPartnerCommissionReleasedBridge(
  supabase,
  { partnerId, commissionId, amount }
) {
  if (!partnerId || !commissionId || !amount) {
    return { bridged: false, reason: "missing_fields" };
  }

  return recordCommissionReleaseLedgerMove(supabase, {
    partnerId,
    commissionId,
    amount,
  });
}

export async function onPartnerServiceActivatedBridge(
  supabase,
  { partnerId, referralId, referredUserId, reason = "service_activated" }
) {
  if (!referralId) {
    return { qualified: false, reason: "missing_referral" };
  }

  return markReferralQualifiedOnActivation(supabase, {
    partnerId,
    referralId,
    referredUserId,
    reason,
  });
}

export {
  recordAttributionClick,
  finalizeReferralAttribution,
  initializeReferralQualification,
  markReferralQualifiedOnActivation,
  recordCommissionLedgerCredit,
  recordCommissionReleaseLedgerMove,
};
