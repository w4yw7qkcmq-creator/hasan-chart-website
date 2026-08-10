import { evaluatePartnerAchievements } from "./partner-achievements.js";
import { RELEASE_POLICIES } from "./partner-commission-rules.js";
import { releaseCommissionToWithdrawable } from "./partner-commission-engine.js";
import { computePartnerApprovedSales } from "./partner-tiers.js";
import { createPartnerNotification, PARTNER_NOTIFICATION_TYPES } from "./partner-notifications.js";
import { loadPartnerProgramSettings } from "./partner-settings.js";
import { evaluatePartnerTier, getPartnerTierProgress } from "./partner-tiers.js";
import {
  PARTNER_WALLET_LEDGER_TYPES,
  recordPartnerWalletLedger,
} from "./partner-wallet.js";
import { partnerLogger } from "./partner-logger.js";
import { writePartnerAuditLog } from "./partner-monitoring.js";

function currentBonusPeriod(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export async function runAutoTierUpgrade(supabase, partnerId, { userId = null, force = false } = {}) {
  const settings = await loadPartnerProgramSettings(supabase);

  if (!force && !settings.enableAutoUpgrade) {
    return { ran: false, reason: "disabled" };
  }

  const result = await evaluatePartnerTier(supabase, partnerId);

  if (!result.upgraded) {
    return { ran: true, upgraded: false, result };
  }

  await createPartnerNotification(supabase, {
    partnerId,
    userId,
    type: PARTNER_NOTIFICATION_TYPES.TIER_UPGRADED,
    title: `ترقية مستوى — ${result.tierName}`,
    body: `تمت ترقيتك من ${result.fromTierKey} إلى ${result.toTierKey}. نسبة العمولة الآن ${result.commissionPercent}%.`,
    payload: {
      fromTierKey: result.fromTierKey,
      toTierKey: result.toTierKey,
      commissionPercent: result.commissionPercent,
    },
  });

  const tierProgress = await getPartnerTierProgress(supabase, partnerId);
  await evaluatePartnerAchievements(supabase, partnerId, { userId });

  return { ran: true, upgraded: true, result, tierProgress };
}

export async function runAutoCommissionRelease(
  supabase,
  { partnerId, commissionId, releasePolicy, userId = null, force = false }
) {
  const settings = await loadPartnerProgramSettings(supabase);

  if (!force && !settings.enableAutoRelease) {
    return { ran: false, reason: "disabled" };
  }

  if (!force && releasePolicy !== RELEASE_POLICIES.ON_SERVICE_ACTIVATION) {
    return { ran: false, reason: "policy_not_auto" };
  }

  try {
    const released = await releaseCommissionToWithdrawable(supabase, commissionId);

    await createPartnerNotification(supabase, {
      partnerId,
      userId,
      type: PARTNER_NOTIFICATION_TYPES.COMMISSION_RELEASED,
      title: "عمولة متاحة للسحب",
      body: `تم تحويل عمولة بقيمة ${released.amount} USD إلى رصيدك القابل للسحب.`,
      payload: {
        commissionId: released.id,
        amount: released.amount,
      },
    });

    partnerLogger.commission("auto_released", { partnerId, commissionId: released.id, amount: released.amount });

    return { ran: true, released: true, commission: released };
  } catch (error) {
    if (error?.message === "INVALID_STATUS") {
      return { ran: true, released: false, reason: "already_released_or_invalid" };
    }

    throw error;
  }
}

export async function runPartnerAutomationAfterCommission(
  supabase,
  { partnerId, commissionId, releasePolicy, userId = null }
) {
  const settings = await loadPartnerProgramSettings(supabase);
  const results = {
    autoRelease: null,
    autoUpgrade: null,
    achievements: null,
  };

  if (settings.enableAutoRelease) {
    results.autoRelease = await runAutoCommissionRelease(supabase, {
      partnerId,
      commissionId,
      releasePolicy,
      userId,
    });
  }

  if (settings.enableAutoUpgrade) {
    results.autoUpgrade = await runAutoTierUpgrade(supabase, partnerId, { userId });
  }

  if (settings.enableAchievements) {
    results.achievements = await evaluatePartnerAchievements(supabase, partnerId, { userId });
  }

  const tierProgress = await getPartnerTierProgress(supabase, partnerId);

  return { ...results, tierProgress };
}

export async function runMonthlyPartnerBonuses(
  supabase,
  { period = null, partnerId = null, force = false } = {}
) {
  const settings = await loadPartnerProgramSettings(supabase);

  if (!force && !settings.enableMonthlyBonus) {
    return { ran: false, reason: "disabled", grants: [] };
  }

  const bonusPeriod = period || currentBonusPeriod();

  let partnersQuery = supabase
    .from("partners")
    .select("id, user_id, tier_key, signup_count, balance_withdrawable, total_earnings")
    .eq("status", "active");

  if (partnerId) {
    partnersQuery = partnersQuery.eq("id", partnerId);
  }

  const { data: partners, error: partnersError } = await partnersQuery;

  if (partnersError) {
    throw partnersError;
  }

  const grants = [];

  for (const partner of partners || []) {
    const tierKey = String(partner.tier_key || "partner").toLowerCase();
    const bonusAmount = Number(settings.monthlyBonusValues?.[tierKey] || 0);

    if (bonusAmount <= 0) {
      continue;
    }

    if (Number(partner.signup_count || 0) < settings.minimumReferralsForBonus) {
      continue;
    }

    const totalSales = await computePartnerApprovedSales(supabase, partner.id);

    if (totalSales < settings.minimumSalesForBonus) {
      continue;
    }

    const { data: existingGrant } = await supabase
      .from("partner_monthly_bonus_grants")
      .select("id")
      .eq("partner_id", partner.id)
      .eq("bonus_period", bonusPeriod)
      .maybeSingle();

    if (existingGrant?.id) {
      continue;
    }

    const balanceBefore = Number(partner.balance_withdrawable || 0);
    const balanceAfter = balanceBefore + bonusAmount;
    const totalEarnings = Number(partner.total_earnings || 0) + bonusAmount;

    const { error: grantError } = await supabase.from("partner_monthly_bonus_grants").insert({
      partner_id: partner.id,
      bonus_period: bonusPeriod,
      tier_key: tierKey,
      amount: bonusAmount,
      currency: "USDT",
    });

    if (grantError) {
      if (grantError.code === "23505") {
        continue;
      }

      throw grantError;
    }

    const { error: balanceError } = await supabase
      .from("partners")
      .update({
        balance_withdrawable: balanceAfter,
        total_earnings: totalEarnings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partner.id);

    if (balanceError) {
      throw balanceError;
    }

    await recordPartnerWalletLedger(supabase, {
      partnerId: partner.id,
      type: PARTNER_WALLET_LEDGER_TYPES.ADJUSTMENT,
      amount: bonusAmount,
      balanceBefore,
      balanceAfter,
      referenceType: "monthly_bonus",
      referenceId: null,
      note: `Monthly bonus ${bonusPeriod} — ${tierKey}`,
    });

    await createPartnerNotification(supabase, {
      partnerId: partner.id,
      userId: partner.user_id,
      type: PARTNER_NOTIFICATION_TYPES.BONUS_RECEIVED,
      title: `مكافأة شهرية — ${bonusAmount} USDT`,
      body: `تمت إضافة مكافأة شهرية لمستوى ${tierKey} عن فترة ${bonusPeriod}.`,
      payload: {
        bonusPeriod,
        tierKey,
        amount: bonusAmount,
      },
    });

    grants.push({
      partnerId: partner.id,
      tierKey,
      amount: bonusAmount,
      bonusPeriod,
    });

    partnerLogger.bonus("granted", {
      partnerId: partner.id,
      tierKey,
      amount: bonusAmount,
      bonusPeriod,
    });

    await writePartnerAuditLog("bonus.granted", {
      partnerId: partner.id,
      tierKey,
      amount: bonusAmount,
      bonusPeriod,
    });
  }

  return { ran: true, grants, bonusPeriod };
}

export async function runPartnerUpgradeBatch(supabase, { partnerId = null, force = false } = {}) {
  const settings = await loadPartnerProgramSettings(supabase);

  if (!force && !settings.enableAutoUpgrade) {
    return { ran: false, reason: "disabled", upgraded: [] };
  }

  let query = supabase.from("partners").select("id, user_id").eq("status", "active");

  if (partnerId) {
    query = query.eq("id", partnerId);
  }

  const { data: partners, error } = await query;

  if (error) {
    throw error;
  }

  const upgraded = [];

  for (const partner of partners || []) {
    const result = await runAutoTierUpgrade(supabase, partner.id, {
      userId: partner.user_id,
      force,
    });

    if (result.upgraded) {
      upgraded.push({
        partnerId: partner.id,
        toTierKey: result.result?.toTierKey,
      });
    }
  }

  return { ran: true, upgraded, count: upgraded.length };
}
