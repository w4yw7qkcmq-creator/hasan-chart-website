import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/auth-session";
import { ensurePartner } from "../../../../lib/partner-server";
import { getPartnerTierProgress } from "../../../../lib/partner-tiers";
import { getPartnerGrowthBundle } from "../../../../lib/partner-center/partner-ui-service.js";
import { isPartnerGrowthEngineEnabled } from "../../../../lib/partner-center/feature-flags.js";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (!isPartnerGrowthEngineEnabled()) {
      return NextResponse.json({ success: false, error: "growth_engine_disabled" }, { status: 404 });
    }
    const session = await requireSessionUser();
    if (session.error) {
      return NextResponse.json({ success: false, error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
    }

    const partner = await ensurePartner(session.supabase, {
      userId: session.id,
      username: session.username,
    });

    const tierProgress = await getPartnerTierProgress(session.supabase, partner.id);
    const tierKey = tierProgress?.tierKey || partner.tier_key || "partner";

    const growth = await getPartnerGrowthBundle(session.supabase, partner.id, {
      tierKey,
      referralCode: partner.referral_code,
    });

    return NextResponse.json({
      success: true,
      tierKey,
      tierName: tierProgress?.tierName,
      growth,
    });
  } catch (error) {
    console.error("Partner growth API error");
    return NextResponse.json({ success: false, error: "تعذر تحميل بيانات النمو" }, { status: 500 });
  }
}
