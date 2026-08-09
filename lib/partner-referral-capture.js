import {
  REFERRAL_COOKIE_MAX_AGE_SECONDS,
  REFERRAL_COOKIE_NAME,
  VISITOR_COOKIE_MAX_AGE_SECONDS,
  VISITOR_COOKIE_NAME,
  sanitizeReferralCode,
} from "./partner-shared";
import { findActivePartnerByCode, recordUniquePartnerVisit } from "./partner-server";
import { onPartnerReferralClick } from "./partner-center/integration.js";
import { resolveSmartLink } from "./partner-center/smart-link-service.js";
import { logPartnerCenterFailure } from "./partner-center/observability.js";

function generateVisitorId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function readReferralCookies(request) {
  const referralCode = request.cookies.get(REFERRAL_COOKIE_NAME)?.value || null;
  const visitorId = request.cookies.get(VISITOR_COOKIE_NAME)?.value || null;

  return { referralCode, visitorId };
}

export function applyReferralCaptureCookies(response, captureResult) {
  if (!captureResult?.captured || !captureResult?.code) {
    return response;
  }

  response.cookies.set(REFERRAL_COOKIE_NAME, captureResult.code, {
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
  });

  if (captureResult.setVisitorCookie && captureResult.visitorId) {
    response.cookies.set(VISITOR_COOKIE_NAME, captureResult.visitorId, {
      maxAge: VISITOR_COOKIE_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
    });
  }

  return response;
}

export async function capturePartnerReferral(supabase, { code, existingReferralCode, visitorId, attribution = {} }) {
  if (existingReferralCode) {
    return {
      captured: false,
      reason: "first_touch_exists",
      code: sanitizeReferralCode(existingReferralCode),
    };
  }

  const sanitizedCode = sanitizeReferralCode(code);

  if (!sanitizedCode) {
    return { captured: false, reason: "invalid_format" };
  }

  const partner = await findActivePartnerByCode(supabase, sanitizedCode);

  if (!partner) {
    return { captured: false, reason: "not_found" };
  }

  const nextVisitorId =
    String(visitorId || "")
      .trim()
      .replace(/[^a-f0-9]/gi, "")
      .slice(0, 64) || generateVisitorId();

  const visitResult = await recordUniquePartnerVisit(supabase, {
    partnerId: partner.id,
    visitorKey: nextVisitorId,
  });

  let smartLinkId = null;
  let resolvedAttribution = { ...attribution };
  const linkToken = attribution.link || attribution.smartLinkToken;
  if (linkToken) {
    const resolved = await resolveSmartLink(supabase, linkToken);
    if (resolved.ok && resolved.partnerId === partner.id) {
      smartLinkId = resolved.smartLinkId || null;
      resolvedAttribution = {
        ...resolvedAttribution,
        source: resolved.source || resolvedAttribution.source,
        medium: resolved.medium || resolvedAttribution.medium,
        landingPath: resolved.destinationPath || resolvedAttribution.landingPath,
        smartLinkId,
      };
    }
  }

  try {
    await onPartnerReferralClick(supabase, {
      partnerId: partner.id,
      referralCode: sanitizedCode,
      visitorKey: nextVisitorId,
      smartLinkId,
      attribution: resolvedAttribution,
    });
  } catch (error) {
    if (error?.code !== "42P01") {
      logPartnerCenterFailure("integration.referral_click_failed", {
        partnerId: partner.id,
        reason: error.message,
      });
    }
  }

  return {
    captured: true,
    code: sanitizedCode,
    partnerId: partner.id,
    visitorId: nextVisitorId,
    setVisitorCookie: !visitorId,
    uniqueVisitRecorded: visitResult.recorded,
  };
}
