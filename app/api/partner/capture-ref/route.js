import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "../../../../lib/auth-session";
import {
  applyReferralCaptureCookies,
  capturePartnerReferral,
  readReferralCookies,
} from "../../../../lib/partner-referral-capture";
import { sanitizeReferralCode } from "../../../../lib/partner-shared";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const code = sanitizeReferralCode(body?.code);

    if (!code) {
      return NextResponse.json({ success: false, captured: false, reason: "invalid_format" });
    }

    const { referralCode: existingReferralCode, visitorId } = readReferralCookies(request);
    const supabase = getSupabaseAdmin();
    const captureResult = await capturePartnerReferral(supabase, {
      code,
      existingReferralCode,
      visitorId,
    });

    const response = NextResponse.json({
      success: true,
      captured: captureResult.captured,
      reason: captureResult.reason || null,
      code: captureResult.code || null,
      visitorId: captureResult.visitorId || null,
      setVisitorCookie: Boolean(captureResult.setVisitorCookie),
      uniqueVisitRecorded: Boolean(captureResult.uniqueVisitRecorded),
    });

    applyReferralCaptureCookies(response, captureResult);

    return response;
  } catch (error) {
    console.error("Partner capture-ref error");
    return NextResponse.json({ success: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}
