import { NextResponse } from "next/server";
import { requireSessionUser } from "../../../../lib/auth-session";
import { getPartnerDashboard } from "../../../../lib/partner-server";
import { buildReferralLink, buildShortReferralLink, getPartnerSiteUrl } from "../../../../lib/partner-shared";

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

    const siteOrigin = getPartnerSiteUrl();
    const dashboard = await getPartnerDashboard(
      session.supabase,
      session.id,
      session.username
    );
    const referralLink = buildReferralLink(dashboard.partner.referral_code, siteOrigin);
    const shortReferralLink = buildShortReferralLink(
      dashboard.partner.referral_code,
      siteOrigin
    );

    return NextResponse.json({
      success: true,
      partner: {
        referralCode: dashboard.partner.referral_code,
        referralLink,
        shortReferralLink,
        visitCount: Number(dashboard.partner.visit_count || 0),
        signupCount: Number(dashboard.partner.signup_count || 0),
        activeAccountCount: Number(dashboard.partner.active_account_count || 0),
        balanceWithdrawable: Number(dashboard.partner.balance_withdrawable || 0),
        balancePending: Number(dashboard.partner.balance_pending || 0),
        balanceBonusPending: Number(dashboard.partner.balance_bonus_pending || 0),
        totalEarnings: Number(dashboard.partner.total_earnings || 0),
        vipSignalCount: dashboard.stats?.vipSignalCount ?? 0,
        vipSpotCount: dashboard.stats?.vipSpotCount ?? 0,
        accountManagementCount: dashboard.stats?.accountManagementCount ?? 0,
        academyCount: dashboard.stats?.academyCount ?? 0,
        totalCommissionsCount: dashboard.stats?.totalCommissionsCount ?? 0,
        pendingCommissionsAmount: dashboard.stats?.pendingCommissionsAmount ?? 0,
        withdrawableCommissionsAmount: dashboard.stats?.withdrawableCommissionsAmount ?? 0,
        tierKey: dashboard.tierProgress?.tierKey ?? "partner",
        tierName: dashboard.tierProgress?.tierName ?? "Partner",
        commissionPercent: dashboard.tierProgress?.commissionPercent ?? 10,
      },
      tierProgress: dashboard.tierProgress,
      rewards: dashboard.rewards,
      stats: dashboard.stats,
      referrals: dashboard.referrals,
      commissions: dashboard.commissions,
      withdrawals: dashboard.withdrawals,
    });
  } catch (error) {
    console.error("Partner center API error");
    return NextResponse.json(
      { success: false, error: "تعذر تحميل مركز الشركاء" },
      { status: 500 }
    );
  }
}
