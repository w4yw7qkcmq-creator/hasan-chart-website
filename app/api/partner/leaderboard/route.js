import { NextResponse } from "next/server";
import { getSupabaseAdmin, requireSessionUser } from "../../../../lib/auth-session";
import { getPartnerLeaderboard } from "../../../../lib/partner-analytics";

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
    const metric = searchParams.get("metric") || "sales";
    const limit = Number(searchParams.get("limit") || 20);

    const leaderboard = await getPartnerLeaderboard(getSupabaseAdmin(), { metric, limit });

    return NextResponse.json({ success: true, leaderboard, metric });
  } catch (error) {
    console.error("Partner leaderboard API error");
    return NextResponse.json(
      { success: false, error: "تعذر تحميل لوحة الترتيب" },
      { status: 500 }
    );
  }
}
