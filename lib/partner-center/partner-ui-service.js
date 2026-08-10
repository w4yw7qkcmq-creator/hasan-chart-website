import { computePartnerMetrics } from "./partner-metrics.js";
import { listActiveMissionsForPartner } from "./mission-engine.js";
import { getActiveCampaignProgram, validatePartnerCampaignEligibility } from "./campaign-engine.js";
import { resolveSmartLinkPublicUrl } from "./smart-link-service.js";
import { computeSmartLinkMetricsForPartner } from "./smart-link-analytics.js";
import { getLeaderboard } from "./leaderboard-engine.js";
import { buildPeriodKey, isWithinWindow } from "./timezone.js";
import { LEADERBOARD_METRICS } from "./phase2-constants.js";
import {
  missionStatusLabel,
  rewardStatusLabel,
  ledgerTypeLabel,
  campaignStatusLabel,
  safePercent,
  maskPartnerDisplay,
} from "./ui-labels.js";
import { roundMoney } from "./money.js";
import { getPartnerQualifiedReferralRewardOffer } from "./qualified-referral-reward-policy.js";
import { getPartnerSiteUrl } from "../partner-shared.js";

function resolveMissionUiStatus(mission, progress, eligible) {
  if (!eligible) return { key: "ineligible", label: missionStatusLabel("ineligible", { eligible: false }) };
  if (!isWithinWindow(mission.start_at, mission.end_at)) {
    return { key: "expired", label: missionStatusLabel("expired") };
  }
  if (progress?.status === "reward_credited" || progress?.status === "reward_pending") {
    return {
      key: progress.status,
      label: missionStatusLabel(progress.status === "reward_pending" ? "reward_pending" : "reward_credited"),
    };
  }
  if (progress?.status === "completed") {
    return { key: "completed", label: missionStatusLabel("completed") };
  }
  if (progress && Number(progress.current_value) > 0) {
    return { key: "in_progress", label: missionStatusLabel("in_progress") };
  }
  return { key: "available", label: missionStatusLabel("available") };
}

export async function getPartnerGrowthOverview(supabase, partnerId, { tierKey = "partner" } = {}) {
  const [{ data: partner }, metrics, missions, milestones, qualifiedReferralReward] = await Promise.all([
    supabase
      .from("partners")
      .select(
        "id, referral_code, tier_key, balance_withdrawable, balance_pending, balance_bonus_pending, total_earnings, total_withdrawn, signup_count, visit_count"
      )
      .eq("id", partnerId)
      .single(),
    computePartnerMetrics(supabase, partnerId),
    listActiveMissionsForPartner(supabase, partnerId, { tierKey }),
    supabase.from("partner_milestone_definitions").select("*").eq("status", "active"),
    getPartnerQualifiedReferralRewardOffer(supabase),
  ]);

  const heldRewards = await supabase
    .from("partner_reward_entitlements")
    .select("amount")
    .eq("partner_id", partnerId)
    .in("status", ["risk_hold", "reward_pending"]);

  const riskHeld = roundMoney((heldRewards.data || []).reduce((s, r) => s + Number(r.amount || 0), 0));

  const { data: tiers } = await supabase
    .from("partner_tiers")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  const currentTier = (tiers || []).find((t) => t.tier_key === partner?.tier_key) || tiers?.[0];
  const nextTier = (tiers || []).find((t) => t.sort_order > (currentTier?.sort_order || 0));

  return {
    metrics: {
      withdrawable: Number(partner?.balance_withdrawable || 0),
      pending: Number(partner?.balance_pending || 0),
      bonusPending: Number(partner?.balance_bonus_pending || 0),
      lifetimeEarnings: Number(partner?.total_earnings || 0),
      paidTotal: Number(partner?.total_withdrawn || 0),
      riskHeld,
      qualifiedReferrals: metrics.qualifiedReferrals,
      customers: metrics.customers,
      revenue: metrics.confirmedRevenue,
      conversionRate: metrics.conversionRate,
      signups: metrics.signups,
      clicks: Number(partner?.visit_count || 0),
    },
    level: {
      currentKey: partner?.tier_key,
      currentName: currentTier?.tier_name || partner?.tier_key,
      nextKey: nextTier?.tier_key || null,
      nextName: nextTier?.tier_name || null,
      benefits: currentTier?.benefits || null,
      progress: nextTier
        ? {
            qualifiedReferrals: {
              current: metrics.qualifiedReferrals,
              target: Number(nextTier.min_qualified_referrals || nextTier.min_active_referrals || 0),
            },
            customers: {
              current: metrics.customers,
              target: Number(nextTier.min_customers || 0),
            },
            revenue: {
              current: metrics.confirmedRevenue,
              target: Number(nextTier.min_confirmed_revenue || nextTier.min_total_sales || 0),
            },
          }
        : null,
    },
    activeMissionsCount: missions.length,
    activeMilestonesCount: (milestones.data || []).length,
    qualifiedReferralReward,
  };
}

export function computeNextBestAction({ overview, missions = [], entitlements = [] }) {
  const held = entitlements.filter((e) => e.status === "risk_hold" || e.payoutHold);
  if (held.length) {
    return {
      type: "risk_review",
      message: `لديك ${held.length} مكافأة قيد المراجعة`,
      priority: 1,
    };
  }

  const inProgress = missions.filter((m) => m.uiStatus?.key === "in_progress" || m.uiStatus?.key === "available");
  if (inProgress.length) {
    const top = inProgress.sort((a, b) => a.remaining - b.remaining)[0];
    if (top?.remaining > 0) {
      return {
        type: "mission",
        message: `بقي ${top.remaining} ${top.targetLabel || ""} لإكمال "${top.title}"`,
        missionId: top.id,
        priority: 2,
      };
    }
  }

  const { level } = overview || {};
  if (level?.nextKey && level.progress) {
    const gaps = [];
    const p = level.progress;
    if (p.qualifiedReferrals.target > p.qualifiedReferrals.current) {
      gaps.push(`${p.qualifiedReferrals.target - p.qualifiedReferrals.current} إحالة مؤهلة`);
    }
    if (p.customers.target > p.customers.current) {
      gaps.push(`${p.customers.target - p.customers.current} عميل`);
    }
    if (gaps.length) {
      return {
        type: "level",
        message: `بقي ${gaps[0]} للوصول إلى ${level.nextName}`,
        priority: 3,
      };
    }
  }

  return {
    type: "explore",
    message: "استكشف الحملات وأنشئ رابطًا تسويقيًا جديدًا",
    priority: 99,
  };
}

export async function getPartnerMissionsView(supabase, partnerId, { tierKey = "partner" } = {}) {
  const missions = await listActiveMissionsForPartner(supabase, partnerId, { tierKey });
  const metrics = await computePartnerMetrics(supabase, partnerId);

  const { data: progressRows } = await supabase
    .from("partner_mission_progress")
    .select("*")
    .eq("partner_id", partnerId);

  const progressByMission = new Map((progressRows || []).map((p) => [p.mission_id, p]));

  const { data: entitlements } = await supabase
    .from("partner_reward_entitlements")
    .select("id, source_id, status, payout_hold, amount")
    .eq("partner_id", partnerId)
    .eq("source_type", "mission");

  const entByProgress = new Map((entitlements || []).map((e) => [e.source_id, e]));

  return missions.map((mission) => {
    const progress = progressByMission.get(mission.id);
    const current =
      progress?.current_value ??
      (mission.mission_type === "qualified_referrals_count"
        ? metrics.qualifiedReferrals
        : mission.mission_type === "customers_count"
          ? metrics.customers
          : 0);
    const target = Number(mission.target_value);
    const eligible = !mission.min_tier_key || mission.min_tier_key === tierKey;
    const uiStatus = resolveMissionUiStatus(mission, progress, eligible);
    const entitlement = progress?.id ? entByProgress.get(progress.id) : null;

    return {
      id: mission.id,
      code: mission.code,
      title: mission.name,
      description: mission.description || "",
      rewardAmount: Number(mission.reward_amount),
      rewardCurrency: mission.reward_currency || "USD",
      currentValue: Number(current),
      targetValue: target,
      progressPercent: safePercent(current, target),
      remaining: Math.max(0, target - Number(current)),
      targetLabel: mission.target_metric,
      startAt: mission.start_at,
      endAt: mission.end_at,
      uiStatus,
      rewardState: entitlement
        ? {
            status: entitlement.status,
            label: rewardStatusLabel(entitlement.status, { payoutHold: entitlement.payout_hold }),
            amount: Number(entitlement.amount),
          }
        : null,
      ruleVersion: mission.rule_version,
    };
  });
}

export async function getPartnerCampaignsView(supabase, partnerId, { tierKey = "partner" } = {}) {
  const { data: campaigns } = await supabase
    .from("partner_campaign_programs")
    .select("*")
    .in("status", ["active", "paused"])
    .order("created_at", { ascending: false });

  const results = [];
  for (const campaign of campaigns || []) {
    const within = isWithinWindow(campaign.start_at, campaign.end_at);
    const eligibility = await validatePartnerCampaignEligibility(supabase, {
      campaign,
      partnerId,
      tierKey,
    });
    results.push({
      id: campaign.id,
      code: campaign.code,
      name: campaign.name,
      description: campaign.description || "",
      status: campaign.status,
      statusLabel: campaignStatusLabel(campaign.status, { withinWindow: within }),
      landingPath: campaign.landing_path,
      startAt: campaign.start_at,
      endAt: campaign.end_at,
      eligible: eligibility.eligible && within && campaign.status === "active",
      commissionOverride: campaign.commission_override_metadata || null,
      ruleVersion: campaign.rule_version,
    });
  }
  return results;
}

export async function getPartnerSmartLinksView(supabase, partnerId, referralCode) {
  const { data: links } = await supabase
    .from("partner_smart_links")
    .select("id, token, short_code, label, source, medium, destination_path, status, created_at, campaign_program_id")
    .eq("partner_id", partnerId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(50);

  const siteOrigin = getPartnerSiteUrl();
  const { data: campaigns } = await supabase.from("partner_campaign_programs").select("id, code, name");
  const campaignMap = new Map((campaigns || []).map((c) => [c.id, c]));

  const linkIds = (links || []).map((l) => l.id);
  const metricsMap = await computeSmartLinkMetricsForPartner(supabase, partnerId, linkIds);

  return (links || []).map((link) => {
    const campaign = link.campaign_program_id ? campaignMap.get(link.campaign_program_id) : null;
    const url = resolveSmartLinkPublicUrl(siteOrigin, {
      ...link,
      campaignCode: campaign?.code,
    }, referralCode);
    const metrics = metricsMap.get(link.id) || { clicks: 0, signups: 0, qualified: 0, customers: 0, confirmedRevenue: 0, conversionRate: 0, funnel: null };
    return {
      id: link.id,
      label: link.label || link.source || "رابط",
      url,
      shortCode: link.short_code || null,
      token: link.token,
      source: link.source,
      medium: link.medium,
      destinationPath: link.destination_path,
      campaignCode: campaign?.code || null,
      campaignName: campaign?.name || null,
      clicks: metrics.clicks,
      signups: metrics.signups,
      qualifiedReferrals: metrics.qualified,
      customers: metrics.customers,
      confirmedRevenue: metrics.confirmedRevenue,
      conversionRate: metrics.conversionRate,
      funnel: metrics.funnel,
      createdAt: link.created_at,
      status: link.status,
    };
  });
}

export async function getPartnerWalletDetail(supabase, partnerId, { limit = 30, offset = 0 } = {}) {
  const { data: partner } = await supabase
    .from("partners")
    .select("balance_withdrawable, balance_pending, balance_bonus_pending, total_earnings, total_withdrawn")
    .eq("id", partnerId)
    .single();

  const { data: entries, count } = await supabase
    .from("partner_financial_ledger_entries")
    .select("id, entry_type, entry_direction, amount, lifecycle_status, balance_bucket, created_at, metadata", {
      count: "exact",
    })
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const { data: heldEntitlements } = await supabase
    .from("partner_reward_entitlements")
    .select("amount")
    .eq("partner_id", partnerId)
    .in("status", ["risk_hold"]);

  const riskHeld = roundMoney((heldEntitlements || []).reduce((s, e) => s + Number(e.amount || 0), 0));

  return {
    balances: {
      withdrawable: Number(partner?.balance_withdrawable || 0),
      pending: Number(partner?.balance_pending || 0),
      bonusPending: Number(partner?.balance_bonus_pending || 0),
      lifetimeEarnings: Number(partner?.total_earnings || 0),
      paidTotal: Number(partner?.total_withdrawn || 0),
      riskHeld,
    },
    transactions: (entries || []).map((row) => ({
      id: row.id,
      type: row.entry_type,
      typeLabel: ledgerTypeLabel(row.entry_type),
      direction: row.entry_direction,
      amount: Number(row.amount),
      status: row.lifecycle_status,
      bucket: row.balance_bucket,
      createdAt: row.created_at,
      description: row.metadata?.source || row.entry_type,
    })),
    pagination: { limit, offset, total: count || 0 },
  };
}

export async function getPartnerAnalyticsView(supabase, partnerId, { periodDays = 30 } = {}) {
  const metrics = await computePartnerMetrics(supabase, partnerId);
  const { data: partner } = await supabase.from("partners").select("visit_count, signup_count").eq("id", partnerId).single();

  const clicks = Number(partner?.visit_count || 0);
  const signups = Number(partner?.signup_count || 0);

  const funnel = {
    clicks,
    signups,
    qualified: metrics.qualifiedReferrals,
    customers: metrics.customers,
    revenue: metrics.confirmedRevenue,
    conversionRates: {
      clickToSignup: safePercent(signups, clicks),
      signupToQualified: safePercent(metrics.qualifiedReferrals, signups),
      qualifiedToCustomer: safePercent(metrics.customers, metrics.qualifiedReferrals),
    },
  };

  const { data: links } = await supabase
    .from("partner_smart_links")
    .select("id, source, medium, campaign_program_id")
    .eq("partner_id", partnerId);

  const linkIds = (links || []).map((l) => l.id);
  const perLinkMetrics = await computeSmartLinkMetricsForPartner(supabase, partnerId, linkIds);

  const channels = (links || []).map((link) => {
    const m = perLinkMetrics.get(link.id) || { clicks: 0, signups: 0, qualified: 0, customers: 0, conversionRate: 0 };
    return {
      linkId: link.id,
      source: link.source,
      medium: link.medium,
      clicks: m.clicks,
      signups: m.signups,
      qualified: m.qualified,
      customers: m.customers,
      conversionRate: m.conversionRate,
      funnel: m.funnel,
    };
  });

  return { periodDays, funnel, channels };
}

export async function getPartnerMilestonesView(supabase, partnerId) {
  const { data: definitions } = await supabase
    .from("partner_milestone_definitions")
    .select("*")
    .eq("status", "active")
    .order("threshold_value", { ascending: true });

  const { data: grants } = await supabase
    .from("partner_milestone_grants")
    .select("*")
    .eq("partner_id", partnerId);

  const grantMap = new Map((grants || []).map((g) => [g.milestone_id, g]));
  const metrics = await computePartnerMetrics(supabase, partnerId);

  return (definitions || []).map((def) => {
    const grant = grantMap.get(def.id);
    const current =
      def.metric === "qualified_referrals"
        ? metrics.qualifiedReferrals
        : def.metric === "customers"
          ? metrics.customers
          : 0;
    const threshold = Number(def.threshold_value);
    const achieved = Boolean(grant);
    const inProgress = !achieved && current > 0 && current < threshold;

    return {
      id: def.id,
      code: def.code,
      title: def.name,
      metric: def.metric,
      threshold,
      current,
      rewardAmount: Number(def.reward_amount || 0),
      section: achieved ? "achieved" : inProgress ? "in_progress" : "locked",
      achievementDate: grant?.achieved_at || null,
      rewardState: grant
        ? {
            status: grant.status,
            label: rewardStatusLabel(grant.status),
          }
        : null,
      historyPreserved: achieved,
    };
  });
}

export async function getPartnerLeaderboardView(supabase, {
  rankingMetric = LEADERBOARD_METRICS.CONFIRMED_REVENUE,
  periodType = "monthly",
} = {}) {
  const periodKey = buildPeriodKey(periodType);
  const entries = await getLeaderboard(supabase, { periodKey, rankingMetric, limit: 50 });
  return {
    periodKey,
    rankingMetric,
    entries: entries.map((row) => ({
      rank: row.rank,
      displayLabel: row.display_label || maskPartnerDisplay(null),
      metricValue: Number(row.metric_value),
      levelBadge: null,
    })),
  };
}

export async function getPartnerGrowthBundle(supabase, partnerId, { tierKey, referralCode } = {}) {
  const overview = await getPartnerGrowthOverview(supabase, partnerId, { tierKey });
  const missions = await getPartnerMissionsView(supabase, partnerId, { tierKey });
  const { data: entitlements } = await supabase
    .from("partner_reward_entitlements")
    .select("id, status, payout_hold, amount, reward_type")
    .eq("partner_id", partnerId);

  const nextBestAction = computeNextBestAction({
    overview,
    missions,
    entitlements: entitlements || [],
  });

  const [campaigns, smartLinks, wallet, analytics, milestones, leaderboard] = await Promise.all([
    getPartnerCampaignsView(supabase, partnerId, { tierKey }),
    getPartnerSmartLinksView(supabase, partnerId, referralCode),
    getPartnerWalletDetail(supabase, partnerId, { limit: 20 }),
    getPartnerAnalyticsView(supabase, partnerId),
    getPartnerMilestonesView(supabase, partnerId),
    getPartnerLeaderboardView(supabase),
  ]);

  return {
    overview: { ...overview, nextBestAction },
    missions,
    campaigns,
    smartLinks,
    wallet,
    analytics,
    milestones,
    leaderboard,
    level: overview.level,
  };
}
