import { LEADERBOARD_METRICS } from "./phase2-constants.js";
import { buildPeriodKey } from "./timezone.js";
import { computePartnerMetrics } from "./partner-metrics.js";

function metricValue(metrics, metric) {
  switch (metric) {
    case LEADERBOARD_METRICS.CONFIRMED_REVENUE:
      return metrics.confirmedRevenue;
    case LEADERBOARD_METRICS.CUSTOMERS:
      return metrics.customers;
    case LEADERBOARD_METRICS.QUALIFIED_REFERRALS:
      return metrics.qualifiedReferrals;
    default:
      return 0;
  }
}

function tieBreak(a, b) {
  if (b.metricValue !== a.metricValue) return b.metricValue - a.metricValue;
  const aTs = a.tieBreakAt ? new Date(a.tieBreakAt).getTime() : 0;
  const bTs = b.tieBreakAt ? new Date(b.tieBreakAt).getTime() : 0;
  if (aTs !== bTs) return aTs - bTs;
  return String(a.partnerId).localeCompare(String(b.partnerId));
}

export async function buildLeaderboardSnapshot(supabase, {
  rankingMetric = LEADERBOARD_METRICS.QUALIFIED_REFERRALS,
  periodType = "monthly",
  at = new Date(),
  limit = 50,
}) {
  const periodKey = buildPeriodKey(periodType, at);
  const { data: partners, error } = await supabase.from("partners").select("id, referral_code, tier_key").eq("status", "active");
  if (error) throw error;

  const rows = [];
  for (const p of partners || []) {
    const metrics = await computePartnerMetrics(supabase, p.id);
    rows.push({
      partnerId: p.id,
      metricValue: metricValue(metrics, rankingMetric),
      displayLabel: `Partner ${String(p.referral_code || "").slice(0, 4)}***`,
      tieBreakAt: new Date().toISOString(),
    });
  }

  rows.sort(tieBreak);
  const top = rows.slice(0, limit).map((row, idx) => ({
    period_key: periodKey,
    ranking_metric: rankingMetric,
    partner_id: row.partnerId,
    rank: idx + 1,
    metric_value: row.metricValue,
    display_label: row.displayLabel,
    tie_break_at: row.tieBreakAt,
    metadata: { tierKey: null },
  }));

  if (top.length) {
    for (const row of top) {
      await supabase.from("partner_leaderboard_snapshots").upsert(row, {
        onConflict: "period_key,ranking_metric,partner_id",
      });
    }
  }

  return { periodKey, rankingMetric, entries: top };
}

export async function getLeaderboard(supabase, { periodKey, rankingMetric, limit = 50 }) {
  const { data, error } = await supabase
    .from("partner_leaderboard_snapshots")
    .select("rank, metric_value, display_label, partner_id")
    .eq("period_key", periodKey)
    .eq("ranking_metric", rankingMetric)
    .order("rank", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
