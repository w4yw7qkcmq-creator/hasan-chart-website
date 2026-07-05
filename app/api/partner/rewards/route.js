import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/auth-session";
import { ensurePartner } from "../../../../lib/partner-server";
import { getPartnerTierProgress } from "../../../../lib/partner-tiers";
import { getPartnerRewardsSummary } from "../../../../lib/partner-achievements";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return NextResponse.json(
        { success: false, error: "يجب تسجيل الدخول أولاً" },
        { status: 401 }
      );
    }

    const partner = await ensurePartner(session.supabase, {
      userId: session.id,
      username: session.username,
    });

    const tierProgress = await getPartnerTierProgress(session.supabase, partner.id);
    const rewards = await getPartnerRewardsSummary(session.supabase, partner.id, {
      userId: partner.user_id,
      tierProgress,
    });

    return NextResponse.json({ success: true, rewards });
  } catch (error) {
    console.error("Partner rewards API error");
    return NextResponse.json(
      { success: false, error: "تعذر تحميل المكافآت والإنجازات" },
      { status: 500 }
    );
  }
}
