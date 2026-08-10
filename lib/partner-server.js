import {
  SIGNUP_BONUS_AMOUNT,
  generateReferralCode,
  sanitizeReferralCode,
} from "./partner-shared";
import { DEFAULT_PARTNER_TIER_KEY, getPartnerTierProgress } from "./partner-tiers";
import { runAutoTierUpgrade } from "./partner-automation";
import { getPartnerRewardsSummary } from "./partner-achievements";
import {
  createPartnerWithdrawal,
  getPartnerWalletSummary,
  listPartnerWithdrawalsForPartner,
} from "./partner-wallet";
import { PARTNER_DASHBOARD_COLUMNS } from "./supabase-query-columns";
import { onPartnerSignupLinked } from "./partner-center/integration.js";
import { createPartnerSignupBonusAtomic, isFinancialRpcAvailable } from "./partner-center/financial-gateway.js";
import { logPartnerCenterFailure } from "./partner-center/observability.js";

export { createPartnerWithdrawal, getPartnerWalletSummary, listPartnerWithdrawalsForPartner };

async function runPartnerCenterBridge(operation, fn) {
  try {
    return await fn();
  } catch (error) {
    if (
      error?.code === "42P01" ||
      error?.code === "42883" ||
      error?.code === "PGRST202" ||
      String(error?.message || "").includes("Could not find the function")
    ) {
      return null;
    }
    logPartnerCenterFailure(`bridge.${operation}_failed`, { reason: error.message });
    throw error;
  }
}

async function createLegacySignupBonus(supabase, { referrer, referralRow, normalizedUserId, cleanUsername }) {
  const commissionReason = `تسجيل المستخدم ${cleanUsername} عبر رابط الإحالة`;

  const { error: commissionError } = await supabase.from("partner_commissions").insert({
    partner_id: referrer.id,
    referral_id: referralRow.id,
    source_type: "signup_bonus",
    source_ref: referralRow.id,
    amount: SIGNUP_BONUS_AMOUNT,
    currency: "USD",
    status: "pending",
    is_withdrawable: false,
    invited_username: cleanUsername,
    service_type: "registration",
    reason: commissionReason,
    description: commissionReason,
  });

  if (commissionError) {
    throw commissionError;
  }

  const { data: freshReferrer, error: freshReferrerError } = await supabase
    .from("partners")
    .select("signup_count, balance_bonus_pending, total_earnings")
    .eq("id", referrer.id)
    .single();

  if (freshReferrerError) {
    throw freshReferrerError;
  }

  const { error: referrerUpdateError } = await supabase
    .from("partners")
    .update({
      signup_count: Number(freshReferrer.signup_count || 0) + 1,
      balance_bonus_pending:
        Number(freshReferrer.balance_bonus_pending || 0) + SIGNUP_BONUS_AMOUNT,
      total_earnings: Number(freshReferrer.total_earnings || 0) + SIGNUP_BONUS_AMOUNT,
      updated_at: new Date().toISOString(),
    })
    .eq("id", referrer.id);

  if (referrerUpdateError) {
    throw referrerUpdateError;
  }

  return { legacy: true };
}

export { generateReferralCode } from "./partner-shared";

export function buildReferralCodeSeed(username) {
  const base = String(username || "")
    .trim()
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8);

  return base || "HASAN";
}

export async function findActivePartnerByCode(supabase, referralCode) {
  const code = sanitizeReferralCode(referralCode);

  if (!code) {
    return null;
  }

  const { data, error } = await supabase
    .from("partners")
    .select("id, user_id, referral_code, status")
    .eq("referral_code", code)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id || data.status !== "active") {
    return null;
  }

  return data;
}

export async function ensurePartner(supabase, { userId, username }) {
  const normalizedUserId = String(userId || "").trim();

  if (!normalizedUserId) {
    throw new Error("Missing user id for partner record");
  }

  const { data: existing, error: existingError } = await supabase
    .from("partners")
    .select(PARTNER_DASHBOARD_COLUMNS)
    .eq("user_id", normalizedUserId)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const referralCode = generateReferralCode(username);

    const { data: created, error: createError } = await supabase
      .from("partners")
      .insert({
        user_id: normalizedUserId,
        referral_code: referralCode,
        status: "active",
        tier_key: DEFAULT_PARTNER_TIER_KEY,
      })
      .select(PARTNER_DASHBOARD_COLUMNS)
      .single();

    if (!createError && created) {
      return created;
    }

    if (createError?.code !== "23505") {
      throw createError;
    }
  }

  throw new Error("Unable to generate unique referral code");
}

export async function recordUniquePartnerVisit(supabase, { partnerId, visitorKey }) {
  const normalizedPartnerId = String(partnerId || "").trim();
  const normalizedVisitorKey = String(visitorKey || "").trim();

  if (!normalizedPartnerId || !normalizedVisitorKey) {
    return { recorded: false };
  }

  const { data: insertedRow, error: insertError } = await supabase
    .from("partner_unique_visits")
    .insert({
      partner_id: normalizedPartnerId,
      visitor_key: normalizedVisitorKey,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    if (insertError.code === "23505") {
      return { recorded: false };
    }

    throw insertError;
  }

  if (!insertedRow?.id) {
    return { recorded: false };
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("visit_count")
    .eq("id", normalizedPartnerId)
    .single();

  if (partnerError) {
    throw partnerError;
  }

  const { error: updateError } = await supabase
    .from("partners")
    .update({
      visit_count: Number(partner.visit_count || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", normalizedPartnerId);

  if (updateError) {
    throw updateError;
  }

  return { recorded: true };
}

export async function linkPartnerRegistration(
  supabase,
  { newUserId, newUsername, referralCode }
) {
  const normalizedUserId = String(newUserId || "").trim();
  const code = sanitizeReferralCode(referralCode);

  if (!code) {
    return { linked: false, reason: "missing_code" };
  }

  const referrer = await findActivePartnerByCode(supabase, code);

  if (!referrer?.id) {
    return { linked: false, reason: "invalid_code" };
  }

  if (String(referrer.user_id) === normalizedUserId) {
    return { linked: false, reason: "self_referral" };
  }

  const { data: existingReferral } = await supabase
    .from("partner_referrals")
    .select("id")
    .eq("referred_user_id", normalizedUserId)
    .maybeSingle();

  if (existingReferral?.id) {
    return { linked: false, reason: "already_linked" };
  }

  const cleanUsername = String(newUsername || "").trim() || "مستخدم";

  const { data: referralRow, error: referralError } = await supabase
    .from("partner_referrals")
    .insert({
      partner_id: referrer.id,
      referred_user_id: normalizedUserId,
      referral_code: code,
      referred_username: cleanUsername,
      status: "registered",
    })
    .select("id")
    .single();

  if (referralError) {
    throw referralError;
  }

  let bonusResult;
  let usedLegacyBonus = false;

  try {
    bonusResult = await createPartnerSignupBonusAtomic(supabase, {
      partnerId: referrer.id,
      referralId: referralRow.id,
      referredUserId: normalizedUserId,
      referralCode: code,
      invitedUsername: cleanUsername,
    });
  } catch (error) {
    if (!isFinancialRpcAvailable(error)) {
      await createLegacySignupBonus(supabase, {
        referrer,
        referralRow,
        normalizedUserId,
        cleanUsername,
      });
      usedLegacyBonus = true;
      bonusResult = { created: true, duplicate: false, commissionId: null, payoutHold: false };
    } else {
      throw error;
    }
  }

  if (bonusResult.duplicate) {
    return { linked: false, reason: "bonus_already_created" };
  }

  if (!usedLegacyBonus) {
    if (bonusResult.commissionId) {
      await supabase
        .from("partner_commissions")
        .update({
          payout_hold: true,
          payout_hold_reason: "pending_qualification",
          payout_hold_risk_level: "LOW",
          updated_at: new Date().toISOString(),
        })
        .eq("id", bonusResult.commissionId);
    }

    await runPartnerCenterBridge("signup_linked", () =>
      onPartnerSignupLinked(supabase, {
        partnerId: referrer.id,
        referralId: referralRow.id,
        referredUserId: normalizedUserId,
        referralCode: code,
        selfReferral: false,
        duplicateAttribution: false,
      })
    );
  }

  return {
    linked: true,
    partnerId: referrer.id,
    referralId: referralRow.id,
    signupBonusCommissionId: bonusResult.commissionId,
    payoutHold: bonusResult.payoutHold,
    legacyFinancialPath: usedLegacyBonus,
  };
}

export async function getPartnerDashboard(supabase, userId, username) {
  const partner = await ensurePartner(supabase, { userId, username });

  const [referralsResult, commissionsResult, withdrawalsResult] = await Promise.all([
    supabase
      .from("partner_referrals")
      .select(
        "id, referral_code, referred_username, status, registered_at, activated_at, referred_user_id"
      )
      .eq("partner_id", partner.id)
      .order("registered_at", { ascending: false })
      .limit(50),
    supabase
      .from("partner_commissions")
      .select(
        "id, partner_id, user_id, subscription_id, source_id, source_type, source_ref, amount, currency, status, is_withdrawable, description, reason, invited_username, service_type, commission_percent, base_amount, created_at"
      )
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("partner_withdrawals")
      .select("id, amount, currency, network, wallet_address, status, created_at")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (referralsResult.error) throw referralsResult.error;
  if (commissionsResult.error) throw commissionsResult.error;
  if (withdrawalsResult.error) throw withdrawalsResult.error;

  const commissions = commissionsResult.data || [];
  const pendingCommissionStatuses = new Set([
    "pending",
    "pending_activation",
    "approved",
  ]);
  const pendingCommissionsAmount = commissions
    .filter((row) => pendingCommissionStatuses.has(row.status))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const withdrawableCommissionsAmount = commissions
    .filter((row) => row.status === "withdrawable" || (row.is_withdrawable && row.status === "approved"))
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);

  await runAutoTierUpgrade(supabase, partner.id, { userId: partner.user_id });

  const tierProgress = await getPartnerTierProgress(supabase, partner.id);
  const rewards = await getPartnerRewardsSummary(supabase, partner.id, {
    userId: partner.user_id,
    tierProgress,
  });

  return {
    partner,
    referrals: referralsResult.data || [],
    commissions,
    withdrawals: withdrawalsResult.data || [],
    tierProgress,
    rewards,
    stats: {
      vipSignalCount: Number(partner.vip_signal_count || 0),
      vipSpotCount: Number(partner.vip_spot_count || 0),
      accountManagementCount: Number(partner.account_management_service_count || 0),
      academyCount: Number(partner.academy_count || 0),
      totalCommissionsCount: commissions.length,
      pendingCommissionsAmount,
      withdrawableCommissionsAmount,
    },
  };
}

// Backward-compatible alias for any internal imports.
export const processPartnerRegistration = linkPartnerRegistration;

// Legacy export kept for older API route imports.
export async function trackPartnerVisit(supabase, referralCode, visitorId) {
  const partner = await findActivePartnerByCode(supabase, referralCode);

  if (!partner?.id) {
    return { tracked: false };
  }

  if (!visitorId) {
    return { tracked: false, reason: "missing_visitor" };
  }

  const result = await recordUniquePartnerVisit(supabase, {
    partnerId: partner.id,
    visitorKey: visitorId,
  });

  return {
    tracked: result.recorded,
    partnerId: partner.id,
  };
}
