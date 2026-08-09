import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/auth-session";
import {
  applyReferralCaptureCookies,
  capturePartnerReferral,
  readReferralCookies,
} from "../../../../lib/partner-referral-capture";
import { sanitizeReferralCode, getPartnerSiteUrl } from "../../../../lib/partner-shared";
import {
  resolveSmartLink,
  resolveSmartLinkByShortCode,
  sanitizeLandingPath,
} from "../../../../lib/partner-center/smart-link-service.js";
import { isSmartLinkShortCode } from "../../../../lib/partner-center/smart-link-short-code.js";

export const dynamic = "force-dynamic";

function attachSecurityHeaders(response) {
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

function resolvePublicOrigin(request) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = (forwardedHost || request.headers.get("host") || "").split(",")[0].trim();
  const proto = (request.headers.get("x-forwarded-proto") || "https").split(",")[0].trim();

  if (host && !/localhost|127\.0\.0\.1/i.test(host)) {
    return `${proto}://${host}`;
  }

  return getPartnerSiteUrl();
}

function readAttributionFromRequest(request) {
  const url = new URL(request.url);
  return {
    link: url.searchParams.get("link") || url.searchParams.get("sl"),
    campaign: url.searchParams.get("campaign") || url.searchParams.get("utm_campaign"),
    source: url.searchParams.get("source") || url.searchParams.get("utm_source"),
    medium: url.searchParams.get("medium") || url.searchParams.get("utm_medium"),
    landingPath: url.searchParams.get("landing") || "/",
  };
}

function buildAuthoritativeAttribution(resolved) {
  return {
    link: resolved.internalToken,
    smartLinkToken: resolved.internalToken,
    smartLinkId: resolved.smartLinkId,
    source: resolved.source,
    medium: resolved.medium,
    campaign: resolved.campaignCode,
    landingPath: resolved.destinationPath,
    trustDb: true,
  };
}

export async function GET(request, { params }) {
  const rawCode = String(params?.code || "").trim();
  const queryAttribution = readAttributionFromRequest(request);
  let redirectPath = "/";
  let referralCode = null;
  let captureAttribution = queryAttribution;

  try {
    const supabase = getSupabaseAdmin();

    if (isSmartLinkShortCode(rawCode)) {
      const shortResolved = await resolveSmartLinkByShortCode(supabase, rawCode);
      if (shortResolved.ok) {
        redirectPath = shortResolved.destinationPath || "/";
        referralCode = shortResolved.referralCode;
        captureAttribution = buildAuthoritativeAttribution(shortResolved);
      }
    } else if (queryAttribution.link) {
      const sanitizedReferral = sanitizeReferralCode(rawCode);
      const resolved = await resolveSmartLink(supabase, queryAttribution.link);
      if (resolved.ok && resolved.referralCode === sanitizedReferral) {
        redirectPath = resolved.destinationPath || "/";
        referralCode = sanitizedReferral;
        captureAttribution = {
          ...queryAttribution,
          link: queryAttribution.link,
          smartLinkToken: queryAttribution.link,
          smartLinkId: resolved.smartLinkId,
          source: resolved.source || queryAttribution.source,
          medium: resolved.medium || queryAttribution.medium,
          campaign: resolved.campaignCode || queryAttribution.campaign,
          landingPath: resolved.destinationPath || queryAttribution.landingPath,
        };
      }
    }
  } catch {
    /* safe fallback to home */
  }

  const safePath = sanitizeLandingPath(redirectPath) || "/";
  const redirectUrl = new URL(safePath, resolvePublicOrigin(request));
  const response = attachSecurityHeaders(NextResponse.redirect(redirectUrl, 302));

  const code = referralCode || sanitizeReferralCode(rawCode);
  if (!code) {
    return response;
  }

  try {
    const { referralCode: existingReferralCode, visitorId } = readReferralCookies(request);
    const supabase = getSupabaseAdmin();
    const captureResult = await capturePartnerReferral(supabase, {
      code,
      existingReferralCode,
      visitorId,
      attribution: captureAttribution,
    });

    applyReferralCaptureCookies(response, captureResult);
  } catch (error) {
    console.error("Partner short referral route error");
  }

  return response;
}
