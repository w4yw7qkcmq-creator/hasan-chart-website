import { MISSION_TYPES } from "./phase2-constants.js";
import { PARTNER_EVENT_TYPES } from "./constants.js";

/** Maps trusted partner event types to mission types they may advance. */
export const EVENT_MISSION_MAP = Object.freeze({
  qualified_referral: [
    MISSION_TYPES.QUALIFIED_REFERRALS_COUNT,
    MISSION_TYPES.QUALIFIED_REFERRALS_IN_PERIOD,
  ],
  customer: [MISSION_TYPES.CUSTOMERS_COUNT, MISSION_TYPES.FIRST_CUSTOMER],
  revenue_confirmed: [MISSION_TYPES.REVENUE_AMOUNT],
  subscription_activated: [MISSION_TYPES.SUBSCRIPTIONS_COUNT],
  signup: [MISSION_TYPES.SMART_LINK_CONVERSIONS],
  verified_signup: [MISSION_TYPES.SMART_LINK_CONVERSIONS],
});

/** Event types that are authoritative for mission progress (never client-reported). */
export const TRUSTED_MISSION_EVENT_TYPES = Object.freeze([
  PARTNER_EVENT_TYPES.QUALIFIED_REFERRAL,
  PARTNER_EVENT_TYPES.SUBSCRIPTION_ACTIVATED,
  PARTNER_EVENT_TYPES.REVENUE_CONFIRMED,
  PARTNER_EVENT_TYPES.SIGNUP,
  PARTNER_EVENT_TYPES.VERIFIED_SIGNUP,
]);

/** Events that must NOT advance smart_link_conversions (clicks are metadata only). */
export const NON_CONVERSION_EVENT_TYPES = Object.freeze([
  PARTNER_EVENT_TYPES.REFERRAL_CLICK,
]);

export function mapEventToMissionTypes(eventType) {
  const key = String(eventType || "").toLowerCase();
  if (NON_CONVERSION_EVENT_TYPES.includes(key)) return [];
  return EVENT_MISSION_MAP[key] || [];
}

export function isTrustedMissionEvent(eventType) {
  return TRUSTED_MISSION_EVENT_TYPES.includes(String(eventType || "").toLowerCase());
}
