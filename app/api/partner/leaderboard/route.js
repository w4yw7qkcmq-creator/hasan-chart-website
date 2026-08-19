import { NextResponse } from "next/server";
import { getSupabaseAdmin, requireSessionUser } from "../../../../lib/auth-session";
import { getPublicPartnerLeaderboard } from "../../../../lib/partner-center/leaderboard-engine.js";
import { LEADERBOARD_METRICS } from "../../../../lib/partner-center/phase2-constants.js";
import { assertPublicLeaderboardPayload } from "../../../../lib/partner-center/leaderboard-dto.js";

export const dynamic = "force-dynamic";

const METRIC_ALIASES = Object.freeze({
  sales: LEADERBOARD_METRICS.CONFIRMED_REVENUE,
  referrals: LEADERBOARD_METRICS.QUALIFIED_REFERRALS,
  commissions: LEADERBOARD_METRICS.CONFIRMED_REVENUE,
});

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
    const rawMetric = searchParams.get("metric") || LEADERBOARD_METRICS.QUALIFIED_REFERRALS;
    const metric = METRIC_ALIASES[rawMetric] || rawMetric;
    const periodType = searchParams.get("period") || searchParams.get("periodType") || "monthly";
    const limit = Number(searchParams.get("limit") || 20);

    const result = await getPublicPartnerLeaderboard(getSupabaseAdmin(), {
      metric,
      periodType,
      limit,
    });

    assertPublicLeaderboardPayload(result.entries);

    return NextResponse.json({
      success: true,
      leaderboard: result.entries,
      metric: result.rankingMetric,
      periodKey: result.periodKey,
      periodType: result.periodType,
    });
  } catch (error) {
    console.error("Partner leaderboard API error");
    return NextResponse.json(
      { success: false, error: "تعذر تحميل لوحة الترتيب" },
      { status: 500 }
    );
  }
}
