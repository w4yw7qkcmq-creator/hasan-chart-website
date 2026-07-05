import { tierNameLabel, PARTNER_LEADERBOARD_METRICS } from "./partner-shared";

const LEADERBOARD_METRICS = new Set([
  "sales",
  "commissions",
  "referrals",
  "active_accounts",
  "conversion",
]);

function normalizeSummary(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  return {
    totalReferrals: Number(raw.totalReferrals || 0),
    activeReferrals: Number(raw.activeReferrals || 0),
    inactiveReferrals: Number(raw.inactiveReferrals || 0),
    totalSubscriptions: Number(raw.totalSubscriptions || 0),
    accountManagementCount: Number(raw.accountManagementCount || 0),
    vipSpotCount: Number(raw.vipSpotCount || 0),
    vipFuturesCount: Number(raw.vipFuturesCount || 0),
    academyCount: Number(raw.academyCount || 0),
    totalSales: Number(raw.totalSales || 0),
    totalCommissions: Number(raw.totalCommissions || 0),
    balancePending: Number(raw.balancePending || 0),
    balanceWithdrawable: Number(raw.balanceWithdrawable || 0),
    balanceBonusPending: Number(raw.balanceBonusPending || 0),
    totalEarnings: Number(raw.totalEarnings || 0),
    totalWithdrawn: Number(raw.totalWithdrawn || 0),
    visitCount: Number(raw.visitCount || 0),
    signupCount: Number(raw.signupCount || 0),
    activeAccountCount: Number(raw.activeAccountCount || 0),
    conversionRate: Number(raw.conversionRate || 0),
    averageCustomerValue: Number(raw.averageCustomerValue || 0),
    averageCommissionPerCustomer: Number(raw.averageCommissionPerCustomer || 0),
  };
}

async function callRpc(supabase, fn, params = {}) {
  const { data, error } = await supabase.rpc(fn, params);

  if (error) {
    throw error;
  }

  return data;
}

export async function getPartnerAnalyticsSummary(supabase, partnerId) {
  const data = await callRpc(supabase, "partner_analytics_summary", {
    p_partner_id: partnerId,
  });

  return normalizeSummary(data);
}

export async function getPartnerAnalyticsCharts(supabase, partnerId) {
  const data = await callRpc(supabase, "partner_analytics_charts", {
    p_partner_id: partnerId,
  });

  return {
    commissionsLast30Days: data?.commissionsLast30Days || [],
    monthlySales: data?.monthlySales || [],
    monthlyNewCustomers: data?.monthlyNewCustomers || [],
    monthlyComparison: data?.monthlyComparison || [],
    earningsByService: data?.earningsByService || [],
  };
}

export async function getPartnerTopReferrals(supabase, partnerId, { limit = 10 } = {}) {
  const data = await callRpc(supabase, "partner_top_referrals", {
    p_partner_id: partnerId,
    p_limit: limit,
  });

  return (data || []).map((row) => ({
    userId: row.userId,
    username: row.username || "—",
    email: row.email || "—",
    primaryService: row.primaryService || "registration",
    totalSales: Number(row.totalSales || 0),
    totalCommissions: Number(row.totalCommissions || 0),
    registeredAt: row.registeredAt,
    lastActivityAt: row.lastActivityAt,
    status: row.status,
  }));
}

export async function getPartnerLeaderboard(supabase, { metric = "sales", limit = 20 } = {}) {
  const normalizedMetric = LEADERBOARD_METRICS.has(metric) ? metric : "sales";

  const data = await callRpc(supabase, "partner_leaderboard", {
    p_metric: normalizedMetric,
    p_limit: limit,
  });

  return (data || []).map((row, index) => ({
    rank: index + 1,
    partnerId: row.partnerId,
    userId: row.userId,
    referralCode: row.referralCode,
    tierKey: row.tierKey,
    tierName: tierNameLabel(row.tierKey),
    username: row.username || "—",
    email: row.email || "—",
    totalSales: Number(row.totalSales || 0),
    totalCommissions: Number(row.totalCommissions || 0),
    signupCount: Number(row.signupCount || 0),
    activeAccountCount: Number(row.activeAccountCount || 0),
    conversionRate: Number(row.conversionRate || 0),
    totalEarnings: Number(row.totalEarnings || 0),
  }));
}

export async function getAdminPartnerAnalytics(supabase) {
  const data = await callRpc(supabase, "admin_partner_analytics");

  return {
    totalPartners: Number(data?.totalPartners || 0),
    activePartners: Number(data?.activePartners || 0),
    totalCommissions: Number(data?.totalCommissions || 0),
    totalWithdrawals: Number(data?.totalWithdrawals || 0),
    totalSales: Number(data?.totalSales || 0),
    topServices: data?.topServices || [],
    topTiers: (data?.topTiers || []).map((row) => ({
      tierKey: row.tierKey,
      tierName: tierNameLabel(row.tierKey),
      count: Number(row.count || 0),
    })),
    latestSignups: data?.latestSignups || [],
    latestWithdrawals: data?.latestWithdrawals || [],
  };
}

export async function getAdminTopPartners(supabase, { limit = 10 } = {}) {
  return getPartnerLeaderboard(supabase, { metric: "sales", limit });
}

export async function getAdminPartnerTimeline(supabase, partnerId, { limit = 50 } = {}) {
  const data = await callRpc(supabase, "admin_partner_timeline", {
    p_partner_id: partnerId,
    p_limit: limit,
  });

  return (data || []).map((row) => ({
    eventType: row.eventType,
    eventAt: row.eventAt,
    referenceId: row.referenceId,
    referenceType: row.referenceType,
    title: row.title,
    meta: row.meta,
  }));
}

export { PARTNER_LEADERBOARD_METRICS } from "./partner-shared";
