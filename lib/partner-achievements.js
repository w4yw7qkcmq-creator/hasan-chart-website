import { computePartnerApprovedSales } from "./partner-tiers";
import {
  countUnreadPartnerNotifications,
  createPartnerNotification,
  listPartnerNotifications,
  PARTNER_NOTIFICATION_TYPES,
} from "./partner-notifications";
import { loadPartnerProgramSettings } from "./partner-settings";
import { partnerLogger } from "./partner-logger";
import { writePartnerAuditLog } from "./partner-monitoring";

const MILESTONE_PERCENTS = [25, 50, 75, 100];

const ACHIEVEMENT_CHECKS = {
  first_referral: async (supabase, partnerId) => {
    const { count } = await supabase
      .from("partner_referrals")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId);

    return Number(count || 0) >= 1;
  },
  ten_referrals: async (supabase, partnerId) => {
    const { count } = await supabase
      .from("partner_referrals")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId);

    return Number(count || 0) >= 10;
  },
  thousand_usdt_sales: async (supabase, partnerId) => {
    const totalSales = await computePartnerApprovedSales(supabase, partnerId);
    return totalSales >= 1000;
  },
  first_withdrawal: async (supabase, partnerId) => {
    const { count } = await supabase
      .from("partner_withdrawals")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", partnerId)
      .in("status", ["paid", "approved", "pending"]);

    return Number(count || 0) >= 1;
  },
  top_partner: async (supabase, partnerId) => {
    const { data } = await supabase.rpc("partner_leaderboard", {
      p_metric: "sales",
      p_limit: 10,
    });

    return (data || []).some((row) => String(row.partnerId) === String(partnerId));
  },
  diamond_partner: async (supabase, partnerId) => {
    const { data: partner } = await supabase
      .from("partners")
      .select("tier_key")
      .eq("id", partnerId)
      .maybeSingle();

    return String(partner?.tier_key || "").toLowerCase() === "diamond";
  },
};

export async function listPartnerAchievementDefinitions(supabase) {
  const { data, error } = await supabase
    .from("partner_achievement_definitions")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw error;
  }

  return data || [];
}

export async function listPartnerUserAchievements(supabase, partnerId) {
  const [definitions, unlockedResult] = await Promise.all([
    listPartnerAchievementDefinitions(supabase),
    supabase
      .from("partner_user_achievements")
      .select("achievement_key, unlocked_at, metadata")
      .eq("partner_id", partnerId),
  ]);

  if (unlockedResult.error) {
    throw unlockedResult.error;
  }

  const unlockedMap = new Map(
    (unlockedResult.data || []).map((row) => [row.achievement_key, row])
  );

  return definitions.map((definition) => {
    const unlocked = unlockedMap.get(definition.achievement_key);

    return {
      key: definition.achievement_key,
      title: definition.title,
      description: definition.description,
      badgeLabel: definition.badge_label,
      badgeIcon: definition.badge_icon,
      unlocked: Boolean(unlocked),
      unlockedAt: unlocked?.unlocked_at || null,
    };
  });
}

async function unlockAchievement(supabase, partnerId, achievementKey, metadata = {}) {
  const { data, error } = await supabase
    .from("partner_user_achievements")
    .insert({
      partner_id: partnerId,
      achievement_key: achievementKey,
      metadata,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { unlocked: false, reason: "already_unlocked" };
    }

    throw error;
  }

  return { unlocked: true, achievement: data };
}

export async function evaluatePartnerAchievements(supabase, partnerId, { userId = null } = {}) {
  const settings = await loadPartnerProgramSettings(supabase);

  if (!settings.enableAchievements) {
    return { evaluated: false, reason: "disabled", unlocked: [] };
  }

  const definitions = await listPartnerAchievementDefinitions(supabase);
  const { data: existingRows } = await supabase
    .from("partner_user_achievements")
    .select("achievement_key")
    .eq("partner_id", partnerId);

  const existing = new Set((existingRows || []).map((row) => row.achievement_key));
  const unlocked = [];

  for (const definition of definitions) {
    if (existing.has(definition.achievement_key)) {
      continue;
    }

    const checker = ACHIEVEMENT_CHECKS[definition.achievement_key];

    if (!checker) {
      continue;
    }

    const qualified = await checker(supabase, partnerId);

    if (!qualified) {
      continue;
    }

    const result = await unlockAchievement(supabase, partnerId, definition.achievement_key);

    if (!result.unlocked) {
      continue;
    }

    unlocked.push(definition.achievement_key);

    partnerLogger.achievement("unlocked", {
      partnerId,
      achievementKey: definition.achievement_key,
    });

    await writePartnerAuditLog("achievement.unlocked", {
      partnerId,
      achievementKey: definition.achievement_key,
    });

    await createPartnerNotification(supabase, {
      partnerId,
      userId,
      type: PARTNER_NOTIFICATION_TYPES.ACHIEVEMENT_UNLOCKED,
      title: `إنجاز جديد: ${definition.badge_label}`,
      body: definition.description,
      payload: {
        achievementKey: definition.achievement_key,
      },
    });

    if (definition.achievement_key === "top_partner") {
      await createPartnerNotification(supabase, {
        partnerId,
        userId,
        type: PARTNER_NOTIFICATION_TYPES.LEADERBOARD_CHANGED,
        title: "دخول قائمة أفضل الشركاء",
        body: "تم تصنيفك ضمن أفضل الشركاء في لوحة الترتيب.",
        payload: {
          achievementKey: definition.achievement_key,
        },
      });
    }
  }

  return { evaluated: true, unlocked };
}

export async function evaluatePartnerMilestones(supabase, partnerId, tierProgress) {
  if (!tierProgress?.tierKey) {
    return { reached: [] };
  }

  const tierKey = tierProgress.tierKey;
  const nextTier = tierProgress.nextTier;

  const referralsProgress = nextTier
    ? Math.min(100, nextTier.activeReferralsProgress)
    : 100;
  const salesProgress = nextTier ? Math.min(100, nextTier.totalSalesProgress) : 100;
  const combinedProgress = Math.round((referralsProgress + salesProgress) / 2);

  const reached = [];

  for (const percent of MILESTONE_PERCENTS) {
    if (combinedProgress < percent) {
      continue;
    }

    const { error } = await supabase.from("partner_user_milestones").insert({
      partner_id: partnerId,
      tier_key: tierKey,
      milestone_percent: percent,
      metadata: {
        referralsProgress,
        salesProgress,
        combinedProgress,
      },
    });

    if (error) {
      if (error.code !== "23505") {
        throw error;
      }

      continue;
    }

    reached.push({ tierKey, milestonePercent: percent });
  }

  return { reached };
}

export async function listPartnerUserMilestones(supabase, partnerId) {
  const { data, error } = await supabase
    .from("partner_user_milestones")
    .select("tier_key, milestone_percent, reached_at, metadata")
    .eq("partner_id", partnerId)
    .order("reached_at", { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((row) => ({
    tierKey: row.tier_key,
    milestonePercent: row.milestone_percent,
    reachedAt: row.reached_at,
    metadata: row.metadata || {},
  }));
}

export async function getPartnerRewardsSummary(supabase, partnerId, { userId = null, tierProgress = null } = {}) {
  if (tierProgress) {
    await evaluatePartnerMilestones(supabase, partnerId, tierProgress);
  }

  const [achievements, milestones, notifications, unreadCount] = await Promise.all([
    listPartnerUserAchievements(supabase, partnerId),
    listPartnerUserMilestones(supabase, partnerId),
    listPartnerNotifications(supabase, partnerId, { limit: 20 }),
    countUnreadPartnerNotifications(supabase, partnerId),
  ]);

  return {
    achievements,
    milestones,
    notifications,
    unreadNotifications: unreadCount,
  };
}
