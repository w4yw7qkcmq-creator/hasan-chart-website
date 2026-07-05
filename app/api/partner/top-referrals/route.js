import { NextResponse } from "next/server";
import { getSupabaseAdmin, requireSessionUser } from "../../../../lib/auth-session";
import { getPartnerTopReferrals } from "../../../../lib/partner-analytics";
import { ensurePartner } from "../../../../lib/partner-server";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const session = await requireSessionUser();

    if (session.error) {
      return NextResponse.json(
        { success: false, error: "يجب تسجيل الدخول أولاً" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || 10);

    const partner = await ensurePartner(session.supabase, {
      userId: session.id,
      username: session.username,
    });

    const referrals = await getPartnerTopReferrals(getSupabaseAdmin(), partner.id, { limit });

    return NextResponse.json({ success: true, referrals });
  } catch (error) {
    console.error("Partner top referrals API error");
    return NextResponse.json(
      { success: false, error: "تعذر تحميل أفضل الإحالات" },
      { status: 500 }
    );
  }
}
