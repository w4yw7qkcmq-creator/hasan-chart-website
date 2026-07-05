import { NextResponse } from "next/server";
import { getSupabaseAdmin, requireSessionUser } from "../../../../lib/auth-session";
import { getPartnerAnalyticsCharts } from "../../../../lib/partner-analytics";
import { ensurePartner } from "../../../../lib/partner-server";

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

    const charts = await getPartnerAnalyticsCharts(getSupabaseAdmin(), partner.id);

    return NextResponse.json({ success: true, charts });
  } catch (error) {
    console.error("Partner charts API error");
    return NextResponse.json(
      { success: false, error: "تعذر تحميل الرسوم البيانية" },
      { status: 500 }
    );
  }
}
