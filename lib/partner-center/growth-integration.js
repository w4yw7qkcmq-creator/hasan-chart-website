import { evaluateMissionsForPartnerEvent } from "./mission-engine.js";
import { evaluateMilestonesForPartner } from "./milestone-engine.js";
import { evaluatePartnerLevelUpgrade } from "./level-engine.js";
import { evaluatePerformanceBonusesForPartner } from "./performance-bonus-engine.js";
import { logPartnerCenterEvent } from "./observability.js";
import { requireGrowthRuntimeOrSkip } from "./growth-runtime-gate.js";

const GROWTH_EVENT_MAP = Object.freeze({
  qualified_referral: "qualified_referral",
  customer: "customer",
  revenue_confirmed: "revenue_confirmed",
  subscription_activated: "subscription_activated",
});

export async function onPartnerGrowthEvent(supabase, {
  partnerId,
  eventType,
  tierKey,
  occurredAt = new Date(),
}) {
  const gate = requireGrowthRuntimeOrSkip();
  if (gate) return gate;

  const mapped = GROWTH_EVENT_MAP[eventType];
  if (!mapped) return { processed: false, reason: "unsupported_event" };

  const missions = await evaluateMissionsForPartnerEvent(supabase, {
    partnerId,
    eventType: mapped,
    tierKey,
    occurredAt,
  });

  const milestones = await evaluateMilestonesForPartner(supabase, partnerId, { tierKey });
  const level = await evaluatePartnerLevelUpgrade(supabase, partnerId);
  const performance = await evaluatePerformanceBonusesForPartner(supabase, partnerId, { tierKey, at: occurredAt });

  logPartnerCenterEvent("growth.event_processed", {
    partnerId,
    eventType: mapped,
    missionCompletions: missions.completions?.length || 0,
    milestoneGrants: milestones.grants?.length || 0,
    levelUpgraded: level.upgraded,
  });

  return { processed: true, missions, milestones, level, performance };
}

export async function onPartnerQualifiedReferral(supabase, { partnerId, tierKey }) {
  return onPartnerGrowthEvent(supabase, { partnerId, eventType: "qualified_referral", tierKey });
}

export async function onPartnerCustomerConversion(supabase, { partnerId, tierKey }) {
  return onPartnerGrowthEvent(supabase, { partnerId, eventType: "customer", tierKey });
}

export async function onPartnerRevenueConfirmed(supabase, { partnerId, tierKey, amount }) {
  const result = await onPartnerGrowthEvent(supabase, {
    partnerId,
    eventType: "revenue_confirmed",
    tierKey,
  });
  return { ...result, amount };
}
