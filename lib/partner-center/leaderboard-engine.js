import { LEADERBOARD_METRICS } from "./phase2-constants.js";
import { buildPeriodKey, getPeriodBounds } from "./timezone.js";
import {
  computeMilestoneMetricValue,
  resolveMilestoneMetricWindow,
} from "./partner-metrics.js";
import { USER_CLASSIFICATION } from "../user-classification.js";
import { HUMAN_VERIFICATION_STATUSES } from "../security/human-verification.js";
import { maskPartnerDisplayLabel } from "./leaderboard-public.js";
import { toPublicLeaderboardEntry } from "./leaderboard-dto.js";

const LEADERBOARD_BLOCKED_CLASSIFICATIONS = new Set([
  USER_CLASSIFICATION.TEST,
  USER_CLASSIFICATION.E2E,
  USER_CLASSIFICATION.INTERNAL,
  USER_CLASSIFICATION.SUSPECTED,
  USER_CLASSIFICATION.UNKNOWN,
]);

const LEADERBOARD_VERIFIED_HV = new Set([
  HUMAN_VERIFICATION_STATUSES.VERIFIED,
  HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED,
]);

async function countTrustedQualifiedReferralsInWindow(supabase, partnerId, { startAt, endAt } = {}) {
  const { data: partnerRow } = await supabase
    .from("partners")
    .select("user_id")
    .eq("id", partnerId)
    .maybeSingle();

  let q = supabase
    .from("partner_referral_qualifications")
    .select("referral_id, referred_user_id, qualified_at, state")
    .eq("partner_id", partnerId)
    .in("state", ["qualified", "customer"]);
  if (startAt) q = q.gte("qualified_at", startAt);
  if (endAt) q = q.lte("qualified_at", endAt);
  const { data: rows, error } = await q;
  if (error) throw error;
  if (!rows?.length) return 0;

  const referredIds = [...new Set(rows.map((r) => r.referred_user_id).filter(Boolean))];
  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, effective_user_classification, user_classification, human_verification_status")
    .in("id", referredIds);
  if (pErr) throw pErr;

  const profileMap = new Map((profiles || []).map((p) => [String(p.id), p]));
  let count = 0;
  for (const row of rows) {
    if (partnerRow?.user_id && row.referred_user_id === partnerRow.user_id) continue;
    const profile = profileMap.get(String(row.referred_user_id));
    const classification = String(
      profile?.effective_user_classification || profile?.user_classification || USER_CLASSIFICATION.UNKNOWN
    ).toLowerCase();
    if (LEADERBOARD_BLOCKED_CLASSIFICATIONS.has(classification)) continue;
    const hv = String(profile?.human_verification_status || "").trim();
    if (!LEADERBOARD_VERIFIED_HV.has(hv)) continue;
    count += 1;
  }
  return count;
}

async function computeLeaderboardMetricValue(supabase, partnerId, metric, { startAt, endAt } = {}) {
  switch (metric) {
    case LEADERBOARD_METRICS.QUALIFIED_REFERRALS:
      return countTrustedQualifiedReferralsInWindow(supabase, partnerId, { startAt, endAt });
    case LEADERBOARD_METRICS.CUSTOMERS:
      return computeMilestoneMetricValue(supabase, partnerId, "customers", { startAt, endAt });
    case LEADERBOARD_METRICS.CONFIRMED_REVENUE:
      return computeMilestoneMetricValue(supabase, partnerId, "confirmed_revenue", { startAt, endAt });
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
} = {}) {
  const periodKey = buildPeriodKey(periodType, at);
  const { startAt, endAt } = getPeriodBounds(periodType, at);
  const { data: partners, error } = await supabase
    .from("partners")
    .select("id, referral_code, tier_key")
    .eq("status", "active");
  if (error) throw error;

  const rows = [];
  for (const p of partners || []) {
    const metricValue = await computeLeaderboardMetricValue(supabase, p.id, rankingMetric, {
      startAt,
      endAt,
    });
    rows.push({
      partnerId: p.id,
      metricValue,
      displayLabel: maskPartnerDisplayLabel(p.referral_code),
      tierBadge: p.tier_key || null,
      tieBreakAt: at.toISOString(),
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
    metadata: { tierBadge: row.tierBadge, periodType, windowStart: startAt, windowEnd: endAt },
  }));

  if (top.length) {
    for (const row of top) {
      await supabase.from("partner_leaderboard_snapshots").upsert(row, {
        onConflict: "period_key,ranking_metric,partner_id",
      });
    }
  }

  return {
    periodKey,
    rankingMetric,
    periodType,
    window: { startAt, endAt },
    entries: top.map((row) =>
      toPublicLeaderboardEntry({
        rank: row.rank,
        display_label: row.display_label,
        metric_value: row.metric_value,
        ranking_metric: row.ranking_metric,
        period_key: row.period_key,
        metadata: row.metadata,
      })
    ),
  };
}

export async function getLeaderboard(supabase, { periodKey, rankingMetric, limit = 50, periodType = "monthly" } = {}) {
  const key = periodKey || buildPeriodKey(periodType);
  const { data, error } = await supabase
    .from("partner_leaderboard_snapshots")
    .select("rank, metric_value, display_label, ranking_metric, period_key, metadata")
    .eq("period_key", key)
    .eq("ranking_metric", rankingMetric)
    .order("rank", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((row) =>
    toPublicLeaderboardEntry({
      rank: row.rank,
      display_label: row.display_label,
      metric_value: row.metric_value,
      ranking_metric: row.ranking_metric,
      period_key: row.period_key,
      metadata: row.metadata,
    })
  );
}

export async function getPublicPartnerLeaderboard(
  supabase,
  { metric = LEADERBOARD_METRICS.QUALIFIED_REFERRALS, periodType = "monthly", limit = 20, at = new Date() } = {}
) {
  const rankingMetric = Object.values(LEADERBOARD_METRICS).includes(metric)
    ? metric
    : LEADERBOARD_METRICS.QUALIFIED_REFERRALS;
  const periodKey = buildPeriodKey(periodType, at);
  let entries = await getLeaderboard(supabase, { periodKey, rankingMetric, limit, periodType });
  if (!entries.length) {
    const built = await buildLeaderboardSnapshot(supabase, {
      rankingMetric,
      periodType,
      at,
      limit,
    });
    entries = built.entries;
  }
  return { periodKey, rankingMetric, periodType, entries: entries.slice(0, limit) };
}
