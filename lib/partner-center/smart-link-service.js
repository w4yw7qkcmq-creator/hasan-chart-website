import crypto from "node:crypto";
import { ALLOWED_LANDING_PATHS } from "./phase2-constants.js";
import { sanitizeText } from "../partner-security.js";
import { getPartnerSiteUrl, normalizePartnerSiteOrigin } from "../partner-shared.js";
import {
  validatePartnerCampaignEligibility,
} from "./campaign-engine.js";
import { isWithinWindow } from "./timezone.js";
import { normalizeSmartLinkSource } from "./smart-link-sources.js";
import {
  generateSmartLinkShortCode,
  sanitizeSmartLinkShortCode,
} from "./smart-link-short-code.js";

const MAX_TOKEN_LENGTH = 48;
const MAX_SHORT_CODE_INSERT_ATTEMPTS = 8;
const UNIQUE_VIOLATION = "23505";

export function sanitizeLandingPath(path = "/") {
  const cleaned = sanitizeText(path, 256);
  const normalized = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  if (!ALLOWED_LANDING_PATHS.includes(normalized)) return null;
  return normalized;
}

export function sanitizeSourceMedium(value, max = 64) {
  return sanitizeText(value, max)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, max);
}

export function generateSmartLinkToken() {
  return crypto.randomBytes(16).toString("hex");
}

/** Legacy long URL — kept for backwards-compatible display of historical links. */
export function buildSmartLinkUrl(baseUrl, { referralCode, token, campaignCode, source, medium }) {
  const origin = normalizePartnerSiteOrigin(baseUrl || getPartnerSiteUrl());
  const url = new URL(`/r/${encodeURIComponent(referralCode)}`, origin);
  if (token) url.searchParams.set("link", token);
  if (campaignCode) url.searchParams.set("campaign", campaignCode);
  if (source) url.searchParams.set("source", source);
  if (medium) url.searchParams.set("medium", medium);
  return url.toString();
}

/** Canonical public smart link — short token only, no query metadata. */
export function buildCanonicalSmartLinkUrl(baseUrl, shortCode) {
  const clean = sanitizeSmartLinkShortCode(shortCode);
  if (!clean) {
    throw new Error("invalid_short_code");
  }
  const origin = normalizePartnerSiteOrigin(baseUrl || getPartnerSiteUrl());
  return `${origin}/r/${encodeURIComponent(clean)}`;
}

export function resolveSmartLinkPublicUrl(baseUrl, linkRow, referralCode) {
  if (linkRow?.short_code) {
    return buildCanonicalSmartLinkUrl(baseUrl, linkRow.short_code);
  }
  return buildSmartLinkUrl(baseUrl, {
    referralCode,
    token: linkRow?.token,
    campaignCode: linkRow?.campaignCode,
    source: linkRow?.source,
    medium: linkRow?.medium,
  });
}

export function validateSmartLinkInput(input = {}) {
  const destinationPath = sanitizeLandingPath(input.destinationPath || input.destination_path || "/");
  if (!destinationPath) {
    return { ok: false, error: "invalid_destination", code: "OPEN_REDIRECT_BLOCKED" };
  }

  const rawSource = input.source;
  const source = rawSource ? normalizeSmartLinkSource(rawSource) : null;
  if (rawSource && !source) {
    return { ok: false, error: "invalid_source", code: "INVALID_SOURCE" };
  }

  return {
    ok: true,
    destinationPath,
    source,
    medium: sanitizeSourceMedium(input.medium) || null,
    label: sanitizeText(input.label || "", 120) || null,
  };
}

async function loadCampaignCodeForProgram(supabase, campaignProgramId) {
  if (!campaignProgramId) return null;
  const { data, error } = await supabase
    .from("partner_campaign_programs")
    .select("code")
    .eq("id", campaignProgramId)
    .maybeSingle();
  if (error) throw error;
  return data?.code || null;
}

async function finalizeSmartLinkResolution(supabase, row) {
  if (!row?.id || row.status !== "active") {
    return { ok: false, error: "link_not_found" };
  }

  const { data: partner, error: pErr } = await supabase
    .from("partners")
    .select("referral_code, status")
    .eq("id", row.partner_id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (partner?.status !== "active") {
    return { ok: false, error: "link_not_found" };
  }

  const destinationPath = sanitizeLandingPath(row.destination_path);
  if (!destinationPath) {
    return { ok: false, error: "invalid_destination", code: "OPEN_REDIRECT_BLOCKED" };
  }

  const campaignCode = await loadCampaignCodeForProgram(supabase, row.campaign_program_id);

  return {
    ok: true,
    smartLinkId: row.id,
    partnerId: row.partner_id,
    referralCode: partner.referral_code,
    destinationPath,
    source: row.source,
    medium: row.medium,
    campaignProgramId: row.campaign_program_id,
    campaignCode,
    internalToken: row.token,
    shortCode: row.short_code || null,
  };
}

export async function resolveSmartLink(supabase, token) {
  const clean = sanitizeSourceMedium(token, MAX_TOKEN_LENGTH);
  if (!clean) return { ok: false, error: "invalid_token" };

  const { data, error } = await supabase
    .from("partner_smart_links")
    .select("id, partner_id, token, short_code, destination_path, source, medium, campaign_program_id, status")
    .eq("token", clean)
    .maybeSingle();
  if (error) throw error;

  return finalizeSmartLinkResolution(supabase, data);
}

export async function resolveSmartLinkByShortCode(supabase, shortCode) {
  const clean = sanitizeSmartLinkShortCode(shortCode);
  if (!clean) return { ok: false, error: "invalid_token" };

  const { data, error } = await supabase
    .from("partner_smart_links")
    .select("id, partner_id, token, short_code, destination_path, source, medium, campaign_program_id, status")
    .eq("short_code", clean)
    .maybeSingle();
  if (error) throw error;

  return finalizeSmartLinkResolution(supabase, data);
}

function isShortCodeCollision(error) {
  if (error?.code !== UNIQUE_VIOLATION) return false;
  const message = String(error?.message || error?.details || "").toLowerCase();
  return message.includes("short_code");
}

export async function createSmartLink(supabase, { partnerId, referralCode, tierKey = "partner", input = {} }) {
  const validated = validateSmartLinkInput(input);
  if (!validated.ok) return validated;

  const { data: partnerRow, error: partnerErr } = await supabase
    .from("partners")
    .select("referral_code, status")
    .eq("id", partnerId)
    .maybeSingle();
  if (partnerErr) throw partnerErr;
  if (partnerRow?.status !== "active") {
    return { ok: false, error: "inactive_partner", code: "PARTNER_INACTIVE" };
  }
  const expectedCode = String(partnerRow?.referral_code || "").trim();
  if (!expectedCode || expectedCode !== String(referralCode || "").trim()) {
    return { ok: false, error: "referral_code_mismatch", code: "OWNERSHIP_BLOCKED" };
  }

  let campaignProgramId = null;
  const rawCampaignCode = String(input.campaignCode || input.campaign_code || "").trim();
  const code = rawCampaignCode ? sanitizeSourceMedium(rawCampaignCode) : "";

  if (rawCampaignCode && !code) {
    return { ok: false, error: "invalid_campaign", code: "CAMPAIGN_NOT_FOUND" };
  }

  if (code) {
    const { data: campaignRow, error: campaignLookupErr } = await supabase
      .from("partner_campaign_programs")
      .select("id, status, allowed_sources, allowed_mediums, start_at, end_at, partner_eligibility, min_tier_key, code")
      .eq("code", code)
      .maybeSingle();
    if (campaignLookupErr) throw campaignLookupErr;

    if (!campaignRow?.id) {
      return { ok: false, error: "invalid_campaign", code: "CAMPAIGN_NOT_FOUND" };
    }

    if (campaignRow.status !== "active") {
      return { ok: false, error: "campaign_inactive", code: "CAMPAIGN_INACTIVE" };
    }

    if (!isWithinWindow(campaignRow.start_at, campaignRow.end_at)) {
      const ended =
        campaignRow.end_at && new Date(campaignRow.end_at).getTime() < Date.now();
      return {
        ok: false,
        error: ended ? "campaign_expired" : "campaign_inactive",
        code: ended ? "CAMPAIGN_EXPIRED" : "CAMPAIGN_NOT_STARTED",
      };
    }

    const eligibility = await validatePartnerCampaignEligibility(supabase, {
      campaign: campaignRow,
      partnerId,
      tierKey,
    });
    if (!eligibility.eligible) {
      return { ok: false, error: "campaign_not_eligible", code: "CAMPAIGN_NOT_ELIGIBLE" };
    }

    if (
      validated.source &&
      campaignRow.allowed_sources?.length &&
      !campaignRow.allowed_sources.includes(validated.source)
    ) {
      return { ok: false, error: "source_not_allowed", code: "SOURCE_NOT_ALLOWED" };
    }

    if (
      validated.medium &&
      campaignRow.allowed_mediums?.length &&
      !campaignRow.allowed_mediums.includes(validated.medium)
    ) {
      return { ok: false, error: "medium_not_allowed", code: "MEDIUM_NOT_ALLOWED" };
    }

    campaignProgramId = campaignRow.id;
  }

  const token = generateSmartLinkToken();
  let data = null;

  for (let attempt = 0; attempt < MAX_SHORT_CODE_INSERT_ATTEMPTS; attempt += 1) {
    const shortCode = generateSmartLinkShortCode();
    const { data: inserted, error } = await supabase
      .from("partner_smart_links")
      .insert({
        partner_id: partnerId,
        token,
        short_code: shortCode,
        label: validated.label,
        campaign_program_id: campaignProgramId,
        source: validated.source,
        medium: validated.medium,
        destination_path: validated.destinationPath,
      })
      .select("id, token, short_code, destination_path, source, medium, campaign_program_id")
      .single();

    if (!error) {
      data = inserted;
      break;
    }

    if (isShortCodeCollision(error)) {
      continue;
    }

    throw error;
  }

  if (!data) {
    return { ok: false, error: "internal_error", code: "SHORT_CODE_EXHAUSTED" };
  }

  const siteOrigin = getPartnerSiteUrl();

  return {
    ok: true,
    smartLink: data,
    shortCode: data.short_code,
    url: buildCanonicalSmartLinkUrl(siteOrigin, data.short_code),
  };
}

export async function archiveSmartLink(supabase, { partnerId, smartLinkId }) {
  const normalizedPartnerId = String(partnerId || "").trim();
  const normalizedLinkId = String(smartLinkId || "").trim();

  if (!normalizedPartnerId || !normalizedLinkId) {
    return { ok: false, error: "invalid_link_id", code: "INVALID_LINK_ID" };
  }

  const { data: row, error: fetchErr } = await supabase
    .from("partner_smart_links")
    .select("id, partner_id, status")
    .eq("id", normalizedLinkId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!row?.id) {
    return { ok: false, error: "link_not_found", code: "NOT_FOUND" };
  }
  if (row.partner_id !== normalizedPartnerId) {
    return { ok: false, error: "ownership_blocked", code: "IDOR" };
  }
  if (row.status === "disabled") {
    return { ok: true, alreadyArchived: true, smartLinkId: row.id };
  }

  const archivedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("partner_smart_links")
    .update({
      status: "disabled",
      archived_at: archivedAt,
      updated_at: archivedAt,
    })
    .eq("id", normalizedLinkId)
    .eq("partner_id", normalizedPartnerId)
    .eq("status", "active")
    .select("id, status, archived_at, short_code")
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return { ok: true, alreadyArchived: true, smartLinkId: row.id };
  }

  return { ok: true, smartLink: data, alreadyArchived: false };
}
