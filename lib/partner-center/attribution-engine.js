import { sanitizeText } from "../partner-security.js";
import {
  ATTRIBUTION_POLICY,
  DEFAULT_ATTRIBUTION_WINDOW_SECONDS,
  PARTNER_EVENT_TYPES,
} from "./constants.js";
import { buildPartnerEventIdempotencyKey, recordPartnerEvent } from "./event-model.js";
import { logPartnerCenterEvent } from "./observability.js";

const MAX_UTM_LENGTH = 64;
const MAX_LANDING_PATH_LENGTH = 256;

function sanitizeAttributionToken(value, maxLength = MAX_UTM_LENGTH) {
  return sanitizeText(value, maxLength)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, maxLength);
}

function sanitizeLandingPath(value) {
  const path = sanitizeText(value, MAX_LANDING_PATH_LENGTH);
  if (!path.startsWith("/")) {
    return `/${path}`.slice(0, MAX_LANDING_PATH_LENGTH);
  }
  return path;
}

export function normalizeAttributionQuery(input = {}) {
  return {
    campaign: sanitizeAttributionToken(input.campaign || input.utm_campaign || input.campaignSlug),
    source: sanitizeAttributionToken(input.source || input.utm_source),
    medium: sanitizeAttributionToken(input.medium || input.utm_medium),
    landingPath: sanitizeLandingPath(input.landingPath || input.landing_path || "/"),
  };
}

export async function validateCampaignForPartner(supabase, { partnerId, campaignSlug }) {
  const slug = sanitizeAttributionToken(campaignSlug);
  if (!slug) {
    return { valid: true, campaignSlug: null };
  }

  const { data, error } = await supabase
    .from("partner_campaigns")
    .select("id, slug, is_active")
    .eq("partner_id", partnerId)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id || data.is_active === false) {
    return { valid: false, reason: "invalid_campaign", campaignSlug: null };
  }

  return { valid: true, campaignSlug: slug, campaignId: data.id };
}

export async function recordAttributionClick(
  supabase,
  {
    partnerId,
    referralCode,
    visitorKey,
    attribution = {},
    smartLinkId = null,
    attributionWindowSeconds = DEFAULT_ATTRIBUTION_WINDOW_SECONDS,
  }
) {
  const normalizedVisitor = sanitizeAttributionToken(visitorKey, 64);
  const normalizedCode = sanitizeText(referralCode, 64);

  if (!partnerId || !normalizedVisitor || !normalizedCode) {
    return { recorded: false, reason: "missing_fields" };
  }

  const normalizedAttribution = normalizeAttributionQuery(attribution);
  const campaignCheck = await validateCampaignForPartner(supabase, {
    partnerId,
    campaignSlug: normalizedAttribution.campaign,
  });

  if (!campaignCheck.valid) {
    logPartnerCenterEvent("attribution.invalid_campaign_ignored", {
      partnerId,
      campaign: normalizedAttribution.campaign,
    });
    normalizedAttribution.campaign = null;
  } else {
    normalizedAttribution.campaign = campaignCheck.campaignSlug;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + attributionWindowSeconds * 1000).toISOString();
  const idempotencyKey = buildPartnerEventIdempotencyKey("attribution_click", [
    partnerId,
    normalizedVisitor,
  ]);

  const { data: session, error } = await supabase
    .from("partner_attribution_sessions")
    .insert({
      partner_id: partnerId,
      referral_code: normalizedCode,
      visitor_key: normalizedVisitor,
      campaign_slug: normalizedAttribution.campaign || null,
      utm_source: normalizedAttribution.source || null,
      utm_medium: normalizedAttribution.medium || null,
      utm_campaign: normalizedAttribution.campaign || null,
      landing_path: normalizedAttribution.landingPath,
      smart_link_id: smartLinkId || null,
      expires_at: expiresAt,
      status: "open",
      idempotency_key: idempotencyKey,
    })
    .select("id, partner_id, visitor_key, expires_at, status")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { recorded: false, duplicate: true, reason: "duplicate_visitor" };
    }
    throw error;
  }

  await recordPartnerEvent(supabase, {
    eventType: PARTNER_EVENT_TYPES.REFERRAL_CLICK,
    idempotencyKey: buildPartnerEventIdempotencyKey(PARTNER_EVENT_TYPES.REFERRAL_CLICK, [
      partnerId,
      normalizedVisitor,
    ]),
    partnerId,
    payload: {
      visitorKey: normalizedVisitor,
      referralCode: normalizedCode,
      ...normalizedAttribution,
      sessionId: session.id,
    },
  });

  return { recorded: true, sessionId: session.id, session };
}

export async function finalizeReferralAttribution(
  supabase,
  {
    partnerId,
    referralId,
    referredUserId,
    referralCode,
    visitorKey = null,
    attribution = {},
  }
) {
  const normalizedAttribution = normalizeAttributionQuery(attribution);
  let sessionId = null;
  let smartLinkIdFromSession = null;

  if (visitorKey) {
    const normalizedVisitor = sanitizeAttributionToken(visitorKey, 64);
    const { data: session } = await supabase
      .from("partner_attribution_sessions")
      .select("id, campaign_slug, utm_source, utm_medium, utm_campaign, landing_path, smart_link_id")
      .eq("partner_id", partnerId)
      .eq("visitor_key", normalizedVisitor)
      .maybeSingle();

    if (session?.id) {
      sessionId = session.id;
      smartLinkIdFromSession = session.smart_link_id || null;
      normalizedAttribution.campaign = session.campaign_slug || normalizedAttribution.campaign;
      normalizedAttribution.source = session.utm_source || normalizedAttribution.source;
      normalizedAttribution.medium = session.utm_medium || normalizedAttribution.medium;
      normalizedAttribution.landingPath = session.landing_path || normalizedAttribution.landingPath;

      await supabase
        .from("partner_attribution_sessions")
        .update({
          linked_referral_id: referralId,
          linked_user_id: referredUserId,
          status: "converted",
        })
        .eq("id", session.id);
    }
  }

  const smartLinkId = smartLinkIdFromSession || attribution.smartLinkId || null;

  const { data, error } = await supabase
    .from("partner_referral_attributions")
    .insert({
      partner_id: partnerId,
      referral_id: referralId,
      referred_user_id: referredUserId,
      referral_code: referralCode,
      attribution_session_id: sessionId,
      campaign_slug: normalizedAttribution.campaign || null,
      utm_source: normalizedAttribution.source || null,
      utm_medium: normalizedAttribution.medium || null,
      utm_campaign: normalizedAttribution.campaign || null,
      landing_path: normalizedAttribution.landingPath,
      smart_link_id: smartLinkId,
      policy: ATTRIBUTION_POLICY.FIRST_TOUCH,
    })
    .select("id, referral_id, partner_id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { recorded: false, duplicate: true, reason: "already_attributed" };
    }
    throw error;
  }

  return { recorded: true, attributionId: data.id, attribution: data };
}

export const ATTRIBUTION_POLICY_SUMMARY = Object.freeze({
  policy: ATTRIBUTION_POLICY.FIRST_TOUCH,
  windowSeconds: DEFAULT_ATTRIBUTION_WINDOW_SECONDS,
  invalidReferralCode: "ignored — no attribution row created",
  existingReferralCookie: "first touch preserved — no overwrite",
  campaignValidation: "campaign slug must match active partner_campaigns row or is stripped",
  clientTrust: "campaign/source/medium never trusted for payout amounts — metadata only",
});
