import { buildReferralLink, buildShortReferralLink, formatPartnerMoney } from "./partner-shared";
import { loadPartnerCommissionRules } from "./partner-commission-rules";
import { loadPartnerTiers, tierNameLabel } from "./partner-tiers";
import {
  hasWithdrawalPaidLedger,
  listPartnerWalletLedger,
  PARTNER_WALLET_LEDGER_TYPES,
  recordPartnerWalletLedger,
} from "./partner-wallet";
import { notifyPartnerWithdrawalEvent } from "./partner-withdrawal-notifications";
import { evaluatePartnerAchievements } from "./partner-achievements";
import { partnerLogger } from "./partner-logger";
import { writePartnerAuditLog } from "./partner-monitoring";
import { requireValidUuid } from "./partner-security";
import { validateDataUrlImage } from "./upload-validation";
import {
  PARTNER_ADMIN_DETAIL_COLUMNS,
  PARTNER_CAMPAIGN_COLUMNS,
  PARTNER_COMMISSION_COLUMNS,
  PARTNER_LEDGER_COLUMNS,
  PARTNER_REFERRAL_COLUMNS,
  PARTNER_WITHDRAWAL_COLUMNS,
  PARTNER_WITHDRAWAL_LIST_COLUMNS,
} from "./supabase-query-columns";

export const PARTNER_DEFAULT_PAGE_SIZE = 25;
export const PARTNER_MAX_PAGE_SIZE = 100;

function clampPartnerLimit(value, fallback = PARTNER_DEFAULT_PAGE_SIZE) {
  const parsed = Number(value) || fallback;
  return Math.min(Math.max(parsed, 1), PARTNER_MAX_PAGE_SIZE);
}

async function loadProfilesByUserIds(supabase, userIds) {
  const ids = [...new Set(userIds.filter(Boolean))];

  if (!ids.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, username")
    .in("id", ids);

  if (error) {
    throw error;
  }

  const map = new Map();

  for (const profile of data || []) {
    map.set(String(profile.id), profile);
  }

  return map;
}

function mapPartnerRow(partner, profile, siteOrigin, tierMap = new Map()) {
  const username =
    profile?.username ||
    String(profile?.email || "")
      .split("@")[0] ||
    "—";

  const tierKey = String(partner.tier_key || partner.tier || "partner").toLowerCase();
  const tier = tierMap.get(tierKey);

  return {
    id: partner.id,
    userId: partner.user_id,
    username,
    email: profile?.email || "—",
    referralCode: partner.referral_code,
    tierKey,
    tierName: tier?.tier_name || tierNameLabel(tierKey),
    commissionPercent: Number(tier?.commission_percent || 10),
    status: partner.status,
    visitCount: Number(partner.visit_count || 0),
    signupCount: Number(partner.signup_count || 0),
    activeAccountCount: Number(partner.active_account_count || 0),
    balanceWithdrawable: Number(partner.balance_withdrawable || 0),
    balancePending: Number(partner.balance_pending || 0),
    balanceBonusPending: Number(partner.balance_bonus_pending || 0),
    totalEarnings: Number(partner.total_earnings || 0),
    totalWithdrawn: Number(partner.total_withdrawn || 0),
    referralLink: buildReferralLink(partner.referral_code, siteOrigin),
    shortReferralLink: buildShortReferralLink(partner.referral_code, siteOrigin),
    createdAt: partner.created_at,
    updatedAt: partner.updated_at,
  };
}

export async function getAdminPartnersOverview(supabase, { siteOrigin } = {}) {
  const [
    partnersResult,
    uniqueVisitsResult,
    pendingCommissionsResult,
    paidWithdrawalsResult,
  ] = await Promise.all([
    supabase
      .from("partners")
      .select(
        "id, user_id, referral_code, tier_key, tier_updated_at, status, visit_count, signup_count, active_account_count, balance_withdrawable, balance_pending, balance_bonus_pending, total_earnings, total_withdrawn, created_at, updated_at"
      )
      .order("created_at", { ascending: false }),
    supabase.from("partner_unique_visits").select("id", { count: "exact", head: true }),
    supabase
      .from("partner_commissions")
      .select("amount")
      .eq("status", "pending"),
    supabase
      .from("partner_withdrawals")
      .select("amount")
      .eq("status", "paid"),
  ]);

  if (partnersResult.error) throw partnersResult.error;
  if (uniqueVisitsResult.error) throw uniqueVisitsResult.error;
  if (pendingCommissionsResult.error) throw pendingCommissionsResult.error;
  if (paidWithdrawalsResult.error) throw paidWithdrawalsResult.error;

  const partners = partnersResult.data || [];
  const profileMap = await loadProfilesByUserIds(
    supabase,
    partners.map((partner) => partner.user_id)
  );
  const tiers = await loadPartnerTiers(supabase);
  const tierMap = new Map(tiers.map((tier) => [tier.tier_key, tier]));

  const mappedPartners = partners.map((partner) =>
    mapPartnerRow(partner, profileMap.get(String(partner.user_id)), siteOrigin, tierMap)
  );

  const totalUniqueVisits = Number(uniqueVisitsResult.count || 0);
  const totalSignups = partners.reduce(
    (sum, partner) => sum + Number(partner.signup_count || 0),
    0
  );
  const totalWithdrawableBalance = partners.reduce(
    (sum, partner) => sum + Number(partner.balance_withdrawable || 0),
    0
  );
  const totalPendingCommissions = (pendingCommissionsResult.data || []).reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  );
  const totalPaidWithdrawals = (paidWithdrawalsResult.data || []).reduce(
    (sum, row) => sum + Number(row.amount || 0),
    0
  );

  const topBySignups = [...mappedPartners]
    .sort((a, b) => b.signupCount - a.signupCount)
    .slice(0, 5);
  const topByEarnings = [...mappedPartners]
    .sort((a, b) => b.totalEarnings - a.totalEarnings)
    .slice(0, 5);

  return {
    summary: {
      totalPartners: partners.length,
      totalUniqueVisits,
      totalSignups,
      totalPendingCommissions,
      totalWithdrawableBalance,
      totalPaidWithdrawals,
      totalPendingCommissionsLabel: formatPartnerMoney(totalPendingCommissions),
      totalWithdrawableBalanceLabel: formatPartnerMoney(totalWithdrawableBalance),
      totalPaidWithdrawalsLabel: formatPartnerMoney(totalPaidWithdrawals),
      topBySignups,
      topByEarnings,
    },
    tiers,
    partners: mappedPartners,
  };
}

function buildActivityFeed({ referrals = [], commissions = [], withdrawals = [] }) {
  const items = [];

  for (const referral of referrals) {
    items.push({
      id: `referral-${referral.id}`,
      type: "referral",
      title: `إحالة جديدة: ${referral.referred_username || "مستخدم"}`,
      meta: referral.status,
      createdAt: referral.registered_at || referral.created_at,
    });
  }

  for (const commission of commissions) {
    items.push({
      id: `commission-${commission.id}`,
      type: "commission",
      title: `عمولة: ${formatPartnerMoney(commission.amount)}`,
      meta: commission.reason || commission.description || commission.source_type,
      createdAt: commission.created_at,
    });
  }

  for (const withdrawal of withdrawals) {
    items.push({
      id: `withdrawal-${withdrawal.id}`,
      type: "withdrawal",
      title: `طلب سحب: ${formatPartnerMoney(withdrawal.amount)} ${withdrawal.currency}`,
      meta: withdrawal.status,
      createdAt: withdrawal.created_at,
    });
  }

  return items
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    )
    .slice(0, 30);
}

export async function getAdminPartnerDetails(supabase, partnerId, { siteOrigin } = {}) {
  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select(PARTNER_ADMIN_DETAIL_COLUMNS)
    .eq("id", partnerId)
    .maybeSingle();

  if (partnerError) {
    throw partnerError;
  }

  if (!partner?.id) {
    return null;
  }

  const profileMap = await loadProfilesByUserIds(supabase, [partner.user_id]);
  const tiers = await loadPartnerTiers(supabase);
  const tierMap = new Map(tiers.map((tier) => [tier.tier_key, tier]));
  const mappedPartner = mapPartnerRow(
    partner,
    profileMap.get(String(partner.user_id)),
    siteOrigin,
    tierMap
  );

  const [referralsResult, commissionsResult, withdrawalsResult, campaignsResult] =
    await Promise.all([
      supabase
        .from("partner_referrals")
        .select(PARTNER_REFERRAL_COLUMNS)
        .eq("partner_id", partner.id)
        .order("registered_at", { ascending: false })
        .limit(100),
      supabase
        .from("partner_commissions")
        .select(PARTNER_COMMISSION_COLUMNS)
        .eq("partner_id", partner.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("partner_withdrawals")
        .select(PARTNER_WITHDRAWAL_COLUMNS)
        .eq("partner_id", partner.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("partner_campaigns")
        .select(PARTNER_CAMPAIGN_COLUMNS)
        .eq("partner_id", partner.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  if (referralsResult.error) throw referralsResult.error;
  if (commissionsResult.error) throw commissionsResult.error;
  if (withdrawalsResult.error) throw withdrawalsResult.error;
  if (campaignsResult.error) throw campaignsResult.error;

  const activity = buildActivityFeed({
    referrals: referralsResult.data || [],
    commissions: commissionsResult.data || [],
    withdrawals: withdrawalsResult.data || [],
  });

  const wallet = {
    balanceWithdrawable: Number(partner.balance_withdrawable || 0),
    balancePending: Number(partner.balance_pending || 0),
    balanceBonusPending: Number(partner.balance_bonus_pending || 0),
    totalEarnings: Number(partner.total_earnings || 0),
    totalWithdrawn: Number(partner.total_withdrawn || 0),
  };

  const ledger = await listPartnerWalletLedger(supabase, partner.id, { limit: 100 });

  const recentlyWithdrawableCommissions = (commissionsResult.data || [])
    .filter((row) => row.status === "withdrawable" || row.is_withdrawable)
    .slice(0, 20);

  return {
    partner: mappedPartner,
    wallet,
    ledger,
    recentlyWithdrawableCommissions,
    referrals: referralsResult.data || [],
    commissions: commissionsResult.data || [],
    withdrawals: withdrawalsResult.data || [],
    campaigns: campaignsResult.data || [],
    activity,
  };
}

export async function listAdminPartnerWalletLedger(supabase, { partnerId, limit = PARTNER_DEFAULT_PAGE_SIZE, page = 1 } = {}) {
  const resolvedLimit = clampPartnerLimit(limit);
  const pageNumber = Math.max(Number(page) || 1, 1);

  if (partnerId) {
    return listPartnerWalletLedger(supabase, partnerId, { limit: resolvedLimit });
  }

  const from = (pageNumber - 1) * resolvedLimit;
  const to = from + resolvedLimit - 1;

  const { data, error } = await supabase
    .from("partner_wallet_ledger")
    .select(PARTNER_LEDGER_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error) {
    throw error;
  }

  const partnerIds = [...new Set((data || []).map((row) => row.partner_id))];
  const { data: partners, error: partnersError } = partnerIds.length
    ? await supabase.from("partners").select("id, user_id, referral_code").in("id", partnerIds)
    : { data: [], error: null };

  if (partnersError) {
    throw partnersError;
  }

  const profileMap = await loadProfilesByUserIds(
    supabase,
    (partners || []).map((partner) => partner.user_id)
  );

  const partnerMap = new Map(
    (partners || []).map((partner) => {
      const profile = profileMap.get(String(partner.user_id));

      return [
        partner.id,
        {
          partnerId: partner.id,
          referralCode: partner.referral_code,
          username: profile?.username || "—",
          email: profile?.email || "—",
        },
      ];
    })
  );

  return (data || []).map((row) => ({
    id: row.id,
    partnerId: row.partner_id,
    type: row.type,
    amount: Number(row.amount || 0),
    balanceBefore: Number(row.balance_before || 0),
    balanceAfter: Number(row.balance_after || 0),
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    note: row.note,
    createdAt: row.created_at,
    partner: partnerMap.get(row.partner_id) || null,
  }));
}

export async function listAdminPartnerWithdrawals(
  supabase,
  { status, network, search, limit = PARTNER_DEFAULT_PAGE_SIZE, page = 1 } = {}
) {
  const resolvedLimit = clampPartnerLimit(limit);
  const pageNumber = Math.max(Number(page) || 1, 1);
  const from = (pageNumber - 1) * resolvedLimit;
  const to = from + resolvedLimit - 1;

  let query = supabase
    .from("partner_withdrawals")
    .select(PARTNER_WITHDRAWAL_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (status && status !== "all") {
    query = query.eq("status", status);
  }

  if (network && network !== "all") {
    query = query.eq("network", network);
  }

  const { data: withdrawals, error } = await query;

  if (error) {
    throw error;
  }

  const partnerIds = [...new Set((withdrawals || []).map((row) => row.partner_id))];
  const { data: partners, error: partnersError } = partnerIds.length
    ? await supabase.from("partners").select("id, user_id, referral_code").in("id", partnerIds)
    : { data: [], error: null };

  if (partnersError) {
    throw partnersError;
  }

  const profileMap = await loadProfilesByUserIds(
    supabase,
    (partners || []).map((partner) => partner.user_id)
  );

  const partnerMap = new Map(
    (partners || []).map((partner) => {
      const profile = profileMap.get(String(partner.user_id));

      return [
        partner.id,
        {
          partnerId: partner.id,
          referralCode: partner.referral_code,
          username: profile?.username || "—",
          email: profile?.email || "—",
        },
      ];
    })
  );

  const mapped = (withdrawals || []).map((withdrawal) => ({
    id: withdrawal.id,
    partnerId: withdrawal.partner_id,
    amount: Number(withdrawal.amount || 0),
    currency: withdrawal.currency,
    network: withdrawal.network,
    walletAddress: withdrawal.wallet_address,
    status: withdrawal.status,
    createdAt: withdrawal.created_at,
    approvedAt: withdrawal.approved_at,
    rejectedAt: withdrawal.rejected_at,
    paidAt: withdrawal.paid_at,
    partner: partnerMap.get(withdrawal.partner_id) || null,
  }));

  const normalizedSearch = String(search || "").trim().toLowerCase();

  if (!normalizedSearch) {
    return mapped;
  }

  return mapped.filter((withdrawal) => {
    const partner = withdrawal.partner || {};

    return (
      String(partner.username || "").toLowerCase().includes(normalizedSearch) ||
      String(partner.email || "").toLowerCase().includes(normalizedSearch) ||
      String(partner.referralCode || "").toLowerCase().includes(normalizedSearch)
    );
  });
}

async function getWithdrawalById(supabase, withdrawalId) {
  const { data, error } = await supabase
    .from("partner_withdrawals")
    .select(PARTNER_WITHDRAWAL_COLUMNS)
    .eq("id", withdrawalId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function approvePartnerWithdrawal(supabase, withdrawalId, { adminNote } = {}) {
  const withdrawal = await getWithdrawalById(supabase, withdrawalId);

  if (!withdrawal?.id) {
    throw new Error("NOT_FOUND");
  }

  if (withdrawal.status !== "pending") {
    throw new Error("INVALID_STATUS");
  }

  const { data, error } = await supabase
    .from("partner_withdrawals")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      admin_note: adminNote || withdrawal.admin_note || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", withdrawal.id)
    .eq("status", "pending")
    .select(PARTNER_WITHDRAWAL_COLUMNS)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    throw new Error("INVALID_STATUS");
  }

  await notifyPartnerWithdrawalEvent(supabase, {
    type: "withdrawal_approved",
    partnerId: data.partner_id,
    withdrawalId: data.id,
    amount: data.amount,
    currency: data.currency,
    network: data.network,
    walletAddress: data.wallet_address,
    status: data.status,
    adminNote: data.admin_note,
    partnerNote: data.partner_note,
  });

  return data;
}

export async function rejectPartnerWithdrawal(
  supabase,
  withdrawalId,
  { adminNote } = {}
) {
  const cleanNote = String(adminNote || "").trim();

  if (!cleanNote) {
    throw new Error("NOTE_REQUIRED");
  }

  const withdrawal = await getWithdrawalById(supabase, withdrawalId);

  if (!withdrawal?.id) {
    throw new Error("NOT_FOUND");
  }

  if (!["pending", "approved"].includes(withdrawal.status)) {
    throw new Error("INVALID_STATUS");
  }

  const { data, error } = await supabase
    .from("partner_withdrawals")
    .update({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      admin_note: cleanNote,
      updated_at: new Date().toISOString(),
    })
    .eq("id", withdrawal.id)
    .in("status", ["pending", "approved"])
    .select(PARTNER_WITHDRAWAL_COLUMNS)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    throw new Error("INVALID_STATUS");
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("balance_withdrawable")
    .eq("id", data.partner_id)
    .single();

  if (partnerError) {
    throw partnerError;
  }

  const balance = Number(partner.balance_withdrawable || 0);

  await recordPartnerWalletLedger(supabase, {
    partnerId: data.partner_id,
    type: PARTNER_WALLET_LEDGER_TYPES.WITHDRAWAL_REJECTED,
    amount: Number(data.amount || 0),
    balanceBefore: balance,
    balanceAfter: balance,
    referenceType: "withdrawal",
    referenceId: data.id,
    note: cleanNote,
  });

  await notifyPartnerWithdrawalEvent(supabase, {
    type: "withdrawal_rejected",
    partnerId: data.partner_id,
    withdrawalId: data.id,
    amount: data.amount,
    currency: data.currency,
    network: data.network,
    walletAddress: data.wallet_address,
    status: data.status,
    adminNote: cleanNote,
    partnerNote: data.partner_note,
  });

  return data;
}

export async function markPartnerWithdrawalPaid(
  supabase,
  withdrawalId,
  { adminNote, paymentProof } = {}
) {
  const normalizedWithdrawalId = requireValidUuid(withdrawalId, "withdrawal_id");
  const withdrawal = await getWithdrawalById(supabase, normalizedWithdrawalId);

  if (!withdrawal?.id) {
    throw new Error("NOT_FOUND");
  }

  if (withdrawal.status === "paid") {
    throw new Error("ALREADY_PAID");
  }

  if (await hasWithdrawalPaidLedger(supabase, withdrawal.id)) {
    throw new Error("ALREADY_PAID");
  }

  if (withdrawal.status !== "approved") {
    throw new Error("INVALID_STATUS");
  }

  if (paymentProof) {
    const proofCheck = validateDataUrlImage(paymentProof);

    if (!proofCheck.ok) {
      throw new Error("INVALID_PAYMENT_PROOF");
    }
  }

  const amount = Number(withdrawal.amount || 0);
  const paidAt = new Date().toISOString();

  const { data: partnerBefore, error: partnerError } = await supabase
    .from("partners")
    .select("id, balance_withdrawable, total_withdrawn")
    .eq("id", withdrawal.partner_id)
    .single();

  if (partnerError) {
    throw partnerError;
  }

  const available = Number(partnerBefore?.balance_withdrawable || 0);

  if (amount > available) {
    throw new Error("INSUFFICIENT_BALANCE");
  }

  const nextBalance = Math.max(0, available - amount);
  const nextTotalWithdrawn = Number(partnerBefore?.total_withdrawn || 0) + amount;

  const { data: updatedPartner, error: balanceError } = await supabase
    .from("partners")
    .update({
      balance_withdrawable: nextBalance,
      total_withdrawn: nextTotalWithdrawn,
      updated_at: paidAt,
    })
    .eq("id", withdrawal.partner_id)
    .gte("balance_withdrawable", amount)
    .select("id, balance_withdrawable, total_withdrawn")
    .maybeSingle();

  if (balanceError) {
    throw balanceError;
  }

  if (!updatedPartner?.id) {
    throw new Error("INSUFFICIENT_BALANCE");
  }

  const { data: paidRow, error: paidError } = await supabase
    .from("partner_withdrawals")
    .update({
      status: "paid",
      paid_at: paidAt,
      admin_note: adminNote || withdrawal.admin_note || null,
      payment_proof: paymentProof || null,
      updated_at: paidAt,
    })
    .eq("id", withdrawal.id)
    .eq("status", "approved")
    .select(PARTNER_WITHDRAWAL_COLUMNS)
    .maybeSingle();

  if (paidError) {
    await supabase
      .from("partners")
      .update({
        balance_withdrawable: available,
        total_withdrawn: Number(partnerBefore?.total_withdrawn || 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawal.partner_id);

    throw paidError;
  }

  if (!paidRow?.id) {
    await supabase
      .from("partners")
      .update({
        balance_withdrawable: available,
        total_withdrawn: Number(partnerBefore?.total_withdrawn || 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", withdrawal.partner_id);

    throw new Error("ALREADY_PAID");
  }

  await recordPartnerWalletLedger(supabase, {
    partnerId: withdrawal.partner_id,
    type: PARTNER_WALLET_LEDGER_TYPES.WITHDRAWAL_PAID,
    amount,
    balanceBefore: available,
    balanceAfter: nextBalance,
    referenceType: "withdrawal",
    referenceId: paidRow.id,
    note: adminNote || withdrawal.admin_note || "Withdrawal marked as paid",
  });

  partnerLogger.withdrawal("paid", {
    partnerId: withdrawal.partner_id,
    withdrawalId: paidRow.id,
    amount,
  });

  await writePartnerAuditLog("withdrawal.paid", {
    partnerId: withdrawal.partner_id,
    withdrawalId: paidRow.id,
    amount,
  });

  await notifyPartnerWithdrawalEvent(supabase, {
    type: "withdrawal_paid",
    partnerId: withdrawal.partner_id,
    withdrawalId: paidRow.id,
    amount: paidRow.amount,
    currency: paidRow.currency,
    network: paidRow.network,
    walletAddress: paidRow.wallet_address,
    status: paidRow.status,
    adminNote: paidRow.admin_note,
    partnerNote: paidRow.partner_note,
    paymentProof: paidRow.payment_proof || paymentProof || null,
  });

  await evaluatePartnerAchievements(supabase, withdrawal.partner_id);

  return paidRow;
}

export async function listPartnerCommissionRules(supabase) {
  return loadPartnerCommissionRules(supabase);
}

export async function listPartnerTiers(supabase) {
  return loadPartnerTiers(supabase);
}

export {
  loadPartnerProgramSettings,
  savePartnerProgramSettings,
} from "./partner-settings";
