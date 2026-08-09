import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/auth-session";
import {
  applyReferralCaptureCookies,
  capturePartnerReferral,
  readReferralCookies,
} from "../../../../lib/partner-referral-capture";
import { sanitizeReferralCode } from "../../../../lib/partner-shared";
import { resolveSmartLink, sanitizeLandingPath } from "../../../../lib/partner-center/smart-link-service.js";

export const dynamic = "force-dynamic";

function attachSecurityHeaders(response) {
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
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

export async function GET(request, { params }) {
  const code = sanitizeReferralCode(params?.code);
  const attribution = readAttributionFromRequest(request);
  let redirectPath = "/";

  if (attribution.link) {
    try {
      const supabase = getSupabaseAdmin();
      const resolved = await resolveSmartLink(supabase, attribution.link);
      if (resolved.ok && resolved.referralCode === code) {
        redirectPath = resolved.destinationPath || "/";
      }
    } catch {
      /* safe fallback to home */
    }
  }

  const safePath = sanitizeLandingPath(redirectPath) || "/";
  const redirectUrl = new URL(safePath, request.url);
  const response = attachSecurityHeaders(NextResponse.redirect(redirectUrl, 302));

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
      attribution,
    });

    applyReferralCaptureCookies(response, captureResult);
  } catch (error) {
    console.error("Partner short referral route error");
  }

  return response;
}
