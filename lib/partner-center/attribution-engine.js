import { sanitizeText } from "../partner-security.js";
import {
  ATTRIBUTION_POLICY,
  DEFAULT_ATTRIBUTION_WINDOW_SECONDS,
  PARTNER_EVENT_TYPES,
} from "./constants.js";
import { buildPartnerEventIdempotencyKey, recordPartnerEvent } from "./event-model.js";
import { logPartnerCenterEvent } from "./observability.js";
import { canCampaignAcceptAttribution } from "./campaign-lifecycle.js";
import { normalizeStatus } from "./campaign-lifecycle.js";
import { sanitizeSourceMedium } from "./smart-link-service.js";

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
    campaignProgramId: input.campaignProgramId || input.campaign_program_id || null,
  };
}

export async function validateCampaignForPartner(
  supabase,
  { partnerId, campaignSlug, campaignProgramId = null, at = new Date() }
) {
  if (campaignProgramId) {
    const { data, error } = await supabase
      .from("partner_campaign_programs")
      .select("id, code, status, start_at, end_at")
      .eq("id", campaignProgramId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) {
      return { valid: false, reason: "invalid_campaign_program_id", campaignProgramId: null };
    }
    const check = canCampaignAcceptAttribution(data, { at });
    if (!check.ok) {
      return { valid: false, reason: check.reason, campaignProgramId: null };
    }
    return {
      valid: true,
      campaignSlug: data.code,
      campaignProgramId: data.id,
      status: normalizeStatus(data.status),
    };
  }

  const slug = sanitizeAttributionToken(campaignSlug);
  if (!slug) {
    return { valid: true, campaignSlug: null, campaignProgramId: null };
  }

  const cleanCode = sanitizeSourceMedium(slug, 64);
  const { data, error } = await supabase
    .from("partner_campaign_programs")
    .select("id, code, status, start_at, end_at")
    .eq("code", cleanCode)
    .order("rule_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  if (!data?.id) {
    return { valid: false, reason: "invalid_campaign", campaignSlug: null, campaignProgramId: null };
  }

  const check = canCampaignAcceptAttribution(data, { at });
  if (!check.ok) {
    return { valid: false, reason: check.reason, campaignSlug: null, campaignProgramId: null };
  }

  return {
    valid: true,
    campaignSlug: data.code,
    campaignProgramId: data.id,
    status: normalizeStatus(data.status),
  };
}

export async function recordAttributionClick(
  supabase,
  {
    partnerId,
    referralCode,
    visitorKey,
    attribution = {},
    smartLinkId = null,
    campaignProgramId = null,
    attributionWindowSeconds = DEFAULT_ATTRIBUTION_WINDOW_SECONDS,
  }
) {
  const normalizedVisitor = sanitizeAttributionToken(visitorKey, 64);
  const normalizedCode = sanitizeText(referralCode, 64);

  if (!partnerId || !normalizedVisitor || !normalizedCode) {
    return { recorded: false, reason: "missing_fields" };
  }

  const normalizedAttribution = normalizeAttributionQuery({
    ...attribution,
    campaignProgramId: campaignProgramId || attribution.campaignProgramId || attribution.campaign_program_id,
  });

  const campaignCheck = await validateCampaignForPartner(supabase, {
    partnerId,
    campaignSlug: normalizedAttribution.campaign,
    campaignProgramId: normalizedAttribution.campaignProgramId,
  });

  if (!campaignCheck.valid) {
    logPartnerCenterEvent("attribution.invalid_campaign_ignored", {
      partnerId,
      campaign: normalizedAttribution.campaign,
      campaignProgramId: normalizedAttribution.campaignProgramId,
    });
    normalizedAttribution.campaign = null;
    normalizedAttribution.campaignProgramId = null;
  } else {
    normalizedAttribution.campaign = campaignCheck.campaignSlug;
    normalizedAttribution.campaignProgramId = campaignCheck.campaignProgramId;
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
      campaign_program_id: normalizedAttribution.campaignProgramId || null,
      utm_source: normalizedAttribution.source || null,
      utm_medium: normalizedAttribution.medium || null,
      utm_campaign: normalizedAttribution.campaign || null,
      landing_path: normalizedAttribution.landingPath,
      smart_link_id: smartLinkId || null,
      expires_at: expiresAt,
      status: "open",
      idempotency_key: idempotencyKey,
    })
    .select("id, partner_id, visitor_key, expires_at, status, campaign_program_id")
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
      campaignProgramId: normalizedAttribution.campaignProgramId,
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
    campaignProgramId = null,
  }
) {
  const normalizedAttribution = normalizeAttributionQuery({
    ...attribution,
    campaignProgramId: campaignProgramId || attribution.campaignProgramId || attribution.campaign_program_id,
  });
  let sessionId = null;
  let smartLinkIdFromSession = null;
  let campaignProgramIdFromSession = null;

  if (visitorKey) {
    const normalizedVisitor = sanitizeAttributionToken(visitorKey, 64);
    const { data: session } = await supabase
      .from("partner_attribution_sessions")
      .select(
        "id, campaign_slug, campaign_program_id, utm_source, utm_medium, utm_campaign, landing_path, smart_link_id"
      )
      .eq("partner_id", partnerId)
      .eq("visitor_key", normalizedVisitor)
      .maybeSingle();

    if (session?.id) {
      sessionId = session.id;
      smartLinkIdFromSession = session.smart_link_id || null;
      campaignProgramIdFromSession = session.campaign_program_id || null;
      normalizedAttribution.campaign = session.campaign_slug || normalizedAttribution.campaign;
      normalizedAttribution.campaignProgramId =
        campaignProgramIdFromSession || normalizedAttribution.campaignProgramId;
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

  const resolvedCampaignProgramId = normalizedAttribution.campaignProgramId || campaignProgramIdFromSession;
  if (normalizedAttribution.campaign || resolvedCampaignProgramId) {
    const campaignCheck = await validateCampaignForPartner(supabase, {
      partnerId,
      campaignSlug: normalizedAttribution.campaign,
      campaignProgramId: resolvedCampaignProgramId,
    });
    if (!campaignCheck.valid) {
      normalizedAttribution.campaign = null;
      normalizedAttribution.campaignProgramId = null;
    } else {
      normalizedAttribution.campaign = campaignCheck.campaignSlug;
      normalizedAttribution.campaignProgramId = campaignCheck.campaignProgramId;
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
      campaign_program_id: normalizedAttribution.campaignProgramId || null,
      utm_source: normalizedAttribution.source || null,
      utm_medium: normalizedAttribution.medium || null,
      utm_campaign: normalizedAttribution.campaign || null,
      landing_path: normalizedAttribution.landingPath,
      smart_link_id: smartLinkId,
      policy: ATTRIBUTION_POLICY.FIRST_TOUCH,
    })
    .select("id, referral_id, partner_id, campaign_program_id")
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
  campaignValidation:
    "campaign code must match active/scheduled partner_campaign_programs row within window, or is stripped",
  campaignProgramId: "smart link campaign_program_id resolved via partner_campaign_programs — never partner_campaigns",
  clientTrust: "campaign/source/medium never trusted for payout amounts — metadata only",
});
