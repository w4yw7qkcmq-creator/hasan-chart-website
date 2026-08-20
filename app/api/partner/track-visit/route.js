import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/auth-session";
import {
  applyReferralCaptureCookies,
  capturePartnerReferral,
  readReferralCookies,
} from "../../../../lib/partner-referral-capture";
import { enforcePartnerReferralRateLimits } from "../../../../lib/partner-security";
import { partnerTrackVisitIpLimiter } from "../../../../lib/rate-limit";
import { sanitizeReferralCode } from "../../../../lib/partner-shared";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const rateCheck = await enforcePartnerReferralRateLimits(
      request,
      partnerTrackVisitIpLimiter
    );
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { success: false, tracked: false, error: "RATE_LIMITED" },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const code = sanitizeReferralCode(body?.code);
    const visitorId = String(body?.visitorId || "").trim() || null;

    if (!code) {
      return NextResponse.json({ success: false, tracked: false, error: "INVALID_CODE" }, { status: 400 });
    }

    const { referralCode: existingReferralCode, visitorId: cookieVisitorId } =
      readReferralCookies(request);
    const supabase = getSupabaseAdmin();
    const captureResult = await capturePartnerReferral(supabase, {
      code,
      existingReferralCode,
      visitorId: visitorId || cookieVisitorId,
    });

    const response = NextResponse.json({
      success: true,
      tracked: Boolean(captureResult.uniqueVisitRecorded),
      captured: captureResult.captured,
    });

    applyReferralCaptureCookies(response, captureResult);

    return response;
  } catch (error) {
    console.error("Partner track visit error");
    return NextResponse.json({ success: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
