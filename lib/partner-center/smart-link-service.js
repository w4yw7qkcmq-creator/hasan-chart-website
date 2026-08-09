import crypto from "node:crypto";
import { ALLOWED_LANDING_PATHS } from "./phase2-constants.js";
import { sanitizeText } from "../partner-security.js";

const MAX_TOKEN_LENGTH = 48;

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

export function buildSmartLinkUrl(baseUrl, { referralCode, token, campaignCode, source, medium }) {
  const url = new URL(`/r/${encodeURIComponent(referralCode)}`, baseUrl);
  if (token) url.searchParams.set("link", token);
  if (campaignCode) url.searchParams.set("campaign", campaignCode);
  if (source) url.searchParams.set("source", source);
  if (medium) url.searchParams.set("medium", medium);
  return url.toString();
}

export function validateSmartLinkInput(input = {}) {
  const destinationPath = sanitizeLandingPath(input.destinationPath || input.destination_path || "/");
  if (!destinationPath) {
    return { ok: false, error: "invalid_destination", code: "OPEN_REDIRECT_BLOCKED" };
  }
  return {
    ok: true,
    destinationPath,
    source: sanitizeSourceMedium(input.source) || null,
    medium: sanitizeSourceMedium(input.medium) || null,
    label: sanitizeText(input.label || "", 120) || null,
  };
}

export async function createSmartLink(supabase, { partnerId, referralCode, input = {} }) {
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
  const code = sanitizeSourceMedium(input.campaignCode || input.campaign_code || "");
  if (code) {
    const { data: campaign } = await supabase
      .from("partner_campaign_programs")
      .select("id, status, allowed_sources, allowed_mediums")
      .eq("code", code)
      .eq("status", "active")
      .maybeSingle();
    if (!campaign?.id) return { ok: false, error: "invalid_campaign", code: "CAMPAIGN_INACTIVE" };
    if (validated.source && campaign.allowed_sources?.length && !campaign.allowed_sources.includes(validated.source)) {
      return { ok: false, error: "source_not_allowed" };
    }
    if (validated.medium && campaign.allowed_mediums?.length && !campaign.allowed_mediums.includes(validated.medium)) {
      return { ok: false, error: "medium_not_allowed" };
    }
    campaignProgramId = campaign.id;
  }

  const token = generateSmartLinkToken();
  const { data, error } = await supabase
    .from("partner_smart_links")
    .insert({
      partner_id: partnerId,
      token,
      label: validated.label,
      campaign_program_id: campaignProgramId,
      source: validated.source,
      medium: validated.medium,
      destination_path: validated.destinationPath,
    })
    .select("id, token, destination_path, source, medium, campaign_program_id")
    .single();
  if (error) throw error;

  return {
    ok: true,
    smartLink: data,
    url: buildSmartLinkUrl(process.env.NEXT_PUBLIC_SITE_URL || "https://hasan-chart.com", {
      referralCode,
      token,
      campaignCode: code,
      source: validated.source,
      medium: validated.medium,
    }),
  };
}

export async function resolveSmartLink(supabase, token) {
  const clean = sanitizeSourceMedium(token, MAX_TOKEN_LENGTH);
  if (!clean) return { ok: false, error: "invalid_token" };

  const { data, error } = await supabase
    .from("partner_smart_links")
    .select("id, partner_id, destination_path, source, medium, campaign_program_id, status")
    .eq("token", clean)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id || data.status !== "active") {
    return { ok: false, error: "link_not_found" };
  }

  const { data: partner, error: pErr } = await supabase
    .from("partners")
    .select("referral_code, status")
    .eq("id", data.partner_id)
    .maybeSingle();
  if (pErr) throw pErr;
  if (partner?.status !== "active") {
    return { ok: false, error: "link_not_found" };
  }

  const destinationPath = sanitizeLandingPath(data.destination_path);
  if (!destinationPath) return { ok: false, error: "invalid_destination", code: "OPEN_REDIRECT_BLOCKED" };

  return {
    ok: true,
    smartLinkId: data.id,
    partnerId: data.partner_id,
    referralCode: partner.referral_code,
    destinationPath,
    source: data.source,
    medium: data.medium,
    campaignProgramId: data.campaign_program_id,
  };
}
