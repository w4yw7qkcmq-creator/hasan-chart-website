import { QUALIFICATION_STATES } from "./constants.js";
import { roundMoney } from "./money.js";

export async function computePartnerMetrics(supabase, partnerId) {
  const [quals, customers, revenue, missions, milestones, partner] = await Promise.all([
    supabase
      .from("partner_referral_qualifications")
      .select("state", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .eq("state", QUALIFICATION_STATES.QUALIFIED),
    supabase
      .from("partner_referral_qualifications")
      .select("state", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .eq("state", QUALIFICATION_STATES.CUSTOMER),
    supabase
      .from("partner_financial_ledger_entries")
      .select("amount")
      .eq("partner_id", partnerId)
      .eq("entry_type", "commission")
      .eq("entry_direction", "credit")
      .neq("lifecycle_status", "reversed"),
    supabase
      .from("partner_mission_progress")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .in("status", ["completed", "reward_credited"]),
    supabase
      .from("partner_milestone_grants")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .in("status", ["earned", "reward_credited"]),
    supabase.from("partners").select("tier_key, signup_count").eq("id", partnerId).maybeSingle(),
  ]);

  const qualifiedReferrals = quals.count || 0;
  const customerCount = customers.count || 0;
  const confirmedRevenue = roundMoney(
    (revenue.data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0)
  );
  const signups = Number(partner.data?.signup_count || 0);
  const conversionRate =
    signups > 0 ? roundMoney((customerCount / signups) * 100) : 0;

  return {
    partnerId,
    clicks: null,
    signups,
    qualifiedReferrals,
    customers: customerCount,
    confirmedRevenue,
    conversionRate,
    missionsCompleted: missions.count || 0,
    milestonesCompleted: milestones.count || 0,
    currentLevel: partner.data?.tier_key || "partner",
  };
}

export async function upsertDailyMetricsCache(supabase, partnerId, metricDate, patch = {}) {
  const { error } = await supabase.from("partner_metrics_daily").upsert({
    partner_id: partnerId,
    metric_date: metricDate,
    ...patch,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function reconcileMetricsCache(supabase, partnerId) {
  const derived = await computePartnerMetrics(supabase, partnerId);
  return { partnerId, status: "DERIVED", metrics: derived };
}
