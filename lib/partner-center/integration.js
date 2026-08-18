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
    recentNetworkSignupCount = 0,
    deviceAccountCount24h = 0,
    partnerNetworkSignup24h = 0,
    partnerUserId = null,
    deviceToken = null,
    clientIp = null,
    email = null,
    duplicateIdentity = false,
    selfReferralDevice = false,
    classificationBlocked = false,
    classification = null,
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

  let identityRisk = { duplicateIdentity, selfReferralDevice, reasons: [] };
  if (!duplicateIdentity && (deviceToken || clientIp)) {
    const { evaluateDuplicateIdentityRisk } = await import("./identity-risk-evaluator.js");
    identityRisk = await evaluateDuplicateIdentityRisk(supabase, {
      referredUserId,
      partnerUserId,
      email,
      deviceToken,
      clientIp,
    });
  }

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
    recentNetworkSignupCount,
    deviceAccountCount24h,
    partnerNetworkSignup24h,
    duplicateIdentity: identityRisk.duplicateIdentity,
    selfReferralDevice: identityRisk.selfReferralDevice,
    classificationBlocked,
    classification,
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
