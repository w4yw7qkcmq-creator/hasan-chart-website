import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/auth-session";
import {
  applyReferralCaptureCookies,
  capturePartnerReferral,
  readReferralCookies,
} from "../../../../lib/partner-referral-capture";
import { sanitizeReferralCode } from "../../../../lib/partner-shared";
export const dynamic = "force-dynamic";
function attachSecurityHeaders(response) {
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}
export async function GET(request, { params }) {
  const code = sanitizeReferralCode(params?.code);
  const redirectUrl = new URL("/", request.url);
  const response = attachSecurityHeaders(
    NextResponse.redirect(redirectUrl, 302),
  );
  if (!code) {
    return response;
  }
  try {
    const { referralCode: existingReferralCode, visitorId } =
      readReferralCookies(request);
    const supabase = getSupabaseAdmin();
    const captureResult = await capturePartnerReferral(supabase, {
      code,
      existingReferralCode,
      visitorId,
    });
    applyReferralCaptureCookies(response, captureResult);
  } catch (error) {
    console.error("Partner short referral route error");
  }
  return response;
}
