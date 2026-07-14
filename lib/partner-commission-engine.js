import {
  COMMISSION_MODES,
  getPartnerCommissionRule,
} from "./partner-commission-rules";
import {
  resolvePartnerCommissionPercent,
} from "./partner-tiers";
import { recordCommissionReleaseLedger } from "./partner-wallet";
import { runPartnerAutomationAfterCommission } from "./partner-automation";
import { partnerLogger } from "./partner-logger";
import { writePartnerAuditLog } from "./partner-monitoring";
import { PARTNER_COMMISSION_COLUMNS } from "./supabase-query-columns";

function buildCommissionIdempotencyKey(partnerId, referredUserId, serviceType, sourceId) {
  return [
    String(partnerId || "").trim(),
    String(referredUserId || "").trim(),
    String(serviceType || "").trim().toLowerCase(),
    String(sourceId || "").trim(),
  ].join(":");
}

const PENDING_BALANCE_STATUSES = new Set(["pending", "pending_activation", "approved"]);

export function calculateCommissionAmount({ baseAmount = 0, percent = 10, mode = "percent", fixedAmount = null }) {
  const normalizedMode = String(mode || COMMISSION_MODES.PERCENT).toLowerCase();

  if (normalizedMode === COMMISSION_MODES.FIXED) {
    const fixed = Number(fixedAmount || 0);
    return Number.isFinite(fixed) && fixed > 0 ? Number(fixed.toFixed(2)) : 0;
  }

  if (normalizedMode === COMMISSION_MODES.PROFIT_SHARE) {
    const normalizedBase = Number(baseAmount || 0);

    if (!Number.isFinite(normalizedBase) || normalizedBase <= 0) {
      return 0;
    }

    return Number(((normalizedBase * Number(percent || 0)) / 100).toFixed(2));
  }

  const normalizedBase = Number(baseAmount || 0);
  const normalizedPercent = Number(percent || 0);

  if (!Number.isFinite(normalizedBase) || normalizedBase <= 0) {
    return 0;
  }

  return Number(((normalizedBase * normalizedPercent) / 100).toFixed(2));
}

export async function getPartnerForReferredUser(supabase, referredUserId) {
  const normalizedUserId = String(referredUserId || "").trim();

  if (!normalizedUserId) {
    return { found: false, reason: "missing_user" };
  }

  const { data: referral, error: referralError } = await supabase
    .from("partner_referrals")
    .select("id, partner_id, referral_code, referred_username, referred_user_id, status")
    .eq("referred_user_id", normalizedUserId)
    .maybeSingle();

  if (referralError) {
    throw referralError;
  }

  if (!referral?.partner_id) {
    return { found: false, reason: "no_partner_referral" };
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("id, user_id, referral_code, status, tier_key")
    .eq("id", referral.partner_id)
    .maybeSingle();

  if (partnerError) {
    throw partnerError;
  }

  if (!partner?.id || partner.status !== "active") {
    return { found: false, reason: "inactive_partner" };
  }

  if (String(partner.user_id) === normalizedUserId) {
    return { found: false, reason: "self_referral" };
  }

  return {
    found: true,
    partner,
    referral,
  };
}

export async function preventDuplicateCommission(
  supabase,
  { partnerId, referredUserId, serviceType, sourceId }
) {
  const normalizedPartnerId = String(partnerId || "").trim();
  const normalizedUserId = String(referredUserId || "").trim();
  const normalizedServiceType = String(serviceType || "").trim().toLowerCase();
  const normalizedSourceId = String(sourceId || "").trim();

  if (!normalizedPartnerId || !normalizedUserId || !normalizedServiceType || !normalizedSourceId) {
    return { duplicate: false };
  }

  const { data, error } = await supabase
    .from("partner_commissions")
    .select("id, status, amount")
    .eq("partner_id", normalizedPartnerId)
    .eq("user_id", normalizedUserId)
    .eq("service_type", normalizedServiceType)
    .eq("source_id", normalizedSourceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data?.id) {
    return {
      duplicate: true,
      commissionId: data.id,
      status: data.status,
      amount: Number(data.amount || 0),
    };
  }

  return { duplicate: false };
}

async function resolveUserIdByEmail(supabase, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function incrementPartnerServiceCounter(supabase, partnerId, counterField) {
  if (!counterField) {
    return;
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select(counterField)
    .eq("id", partnerId)
    .single();

  if (partnerError) {
    throw partnerError;
  }

  const currentValue = Number(partner?.[counterField] || 0);

  const { error: updateError } = await supabase
    .from("partners")
    .update({
      [counterField]: currentValue + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partnerId);

  if (updateError) {
    throw updateError;
  }
}

async function addPendingBalance(supabase, partnerId, amount) {
  const commissionAmount = Number(amount || 0);

  if (!Number.isFinite(commissionAmount) || commissionAmount <= 0) {
    return;
  }

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("balance_pending, total_earnings")
    .eq("id", partnerId)
    .single();

  if (partnerError) {
    throw partnerError;
  }

  const { error: updateError } = await supabase
    .from("partners")
    .update({
      balance_pending: Number(partner.balance_pending || 0) + commissionAmount,
      total_earnings: Number(partner.total_earnings || 0) + commissionAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", partnerId);

  if (updateError) {
    throw updateError;
  }
}

async function activateReferralIfNeeded(supabase, referralId) {
  if (!referralId) {
    return;
  }

  await supabase
    .from("partner_referrals")
    .update({
      status: "active",
      activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", referralId)
    .in("status", ["registered", "pending_activation"]);
}

export async function createPartnerCommissionForService(
  supabase,
  {
    referredUserId,
    serviceType,
    sourceId,
    baseAmount = 0,
    reason,
    metadata = {},
    invitedUsername,
    initialStatus,
  }
) {
  const normalizedUserId = String(referredUserId || "").trim();
  const normalizedServiceType = String(serviceType || "").trim().toLowerCase();
  const normalizedSourceId = String(sourceId || "").trim();

  if (!normalizedUserId || !normalizedServiceType || !normalizedSourceId) {
    return { created: false, reason: "missing_fields" };
  }

  const rule = await getPartnerCommissionRule(supabase, normalizedServiceType);

  if (!rule?.is_active) {
    return { created: false, reason: "inactive_rule" };
  }

  const partnerContext = await getPartnerForReferredUser(supabase, normalizedUserId);

  if (!partnerContext.found) {
    return { created: false, reason: partnerContext.reason || "no_partner" };
  }

  const { partner, referral } = partnerContext;

  const duplicate = await preventDuplicateCommission(supabase, {
    partnerId: partner.id,
    referredUserId: normalizedUserId,
    serviceType: normalizedServiceType,
    sourceId: normalizedSourceId,
  });

  if (duplicate.duplicate) {
    return {
      created: false,
      reason: "duplicate",
      commissionId: duplicate.commissionId,
    };
  }

  const commissionPercent = await resolvePartnerCommissionPercent(supabase, partner.id);

  const amount = calculateCommissionAmount({
    baseAmount,
    percent: commissionPercent,
    mode: rule.commission_mode,
    fixedAmount: rule.fixed_amount,
  });

  const commissionReason =
    String(reason || "").trim() || rule.notes || `${normalizedServiceType} commission`;
  const status = initialStatus || rule.initial_status || "pending_activation";
  const cleanUsername =
    String(invitedUsername || referral.referred_username || "").trim() || "مستخدم";
  const idempotencyKey = buildCommissionIdempotencyKey(
    partner.id,
    normalizedUserId,
    normalizedServiceType,
    normalizedSourceId
  );

  const { data: commission, error: insertError } = await supabase
    .from("partner_commissions")
    .insert({
      partner_id: partner.id,
      referral_id: referral.id,
      user_id: normalizedUserId,
      subscription_id: normalizedSourceId,
      source_id: normalizedSourceId,
      source_type: rule.source_type,
      source_ref: normalizedSourceId,
      service_type: normalizedServiceType,
      reason: commissionReason,
      description: commissionReason,
      invited_username: cleanUsername,
      commission_percent: commissionPercent,
      base_amount: Number(baseAmount || 0),
      amount,
      currency: "USD",
      status,
      is_withdrawable: false,
      idempotency_key: idempotencyKey,
    })
    .select(PARTNER_COMMISSION_COLUMNS)
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return { created: false, reason: "duplicate" };
    }

    throw insertError;
  }

  await addPendingBalance(supabase, partner.id, amount);
  await incrementPartnerServiceCounter(supabase, partner.id, rule.partner_counter);

  if (rule.increment_active_accounts) {
    const { data: currentPartner } = await supabase
      .from("partners")
      .select("active_account_count")
      .eq("id", partner.id)
      .single();

    await supabase
      .from("partners")
      .update({
        active_account_count: Number(currentPartner?.active_account_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partner.id);
  }

  await activateReferralIfNeeded(supabase, referral.id);

  await runPartnerAutomationAfterCommission(supabase, {
    partnerId: partner.id,
    commissionId: commission.id,
    releasePolicy: rule.release_policy,
    userId: partner.user_id,
  });

  partnerLogger.commission("created", {
    partnerId: partner.id,
    commissionId: commission.id,
    amount,
    serviceType: normalizedServiceType,
  });

  await writePartnerAuditLog("commission.created", {
    partnerId: partner.id,
    commissionId: commission.id,
    amount,
    serviceType: normalizedServiceType,
  });

  return {
    created: true,
    commissionId: commission.id,
    partnerId: partner.id,
    amount,
    status,
    serviceType: normalizedServiceType,
    commissionPercent,
    metadata,
  };
}

export async function releaseCommissionToWithdrawable(supabase, commissionId) {
  const normalizedCommissionId = String(commissionId || "").trim();

  if (!normalizedCommissionId) {
    throw new Error("MISSING_COMMISSION_ID");
  }

  const { data: commission, error: commissionError } = await supabase
    .from("partner_commissions")
    .select("id, partner_id, amount, status, is_withdrawable")
    .eq("id", normalizedCommissionId)
    .maybeSingle();

  if (commissionError) {
    throw commissionError;
  }

  if (!commission?.id) {
    throw new Error("NOT_FOUND");
  }

  if (commission.status === "withdrawable") {
    return commission;
  }

  if (!["approved", "pending_activation"].includes(commission.status)) {
    throw new Error("INVALID_STATUS");
  }

  const amount = Number(commission.amount || 0);

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("balance_pending, balance_withdrawable")
    .eq("id", commission.partner_id)
    .single();

  if (partnerError) {
    throw partnerError;
  }

  const nextPending = Math.max(0, Number(partner.balance_pending || 0) - amount);
  const nextWithdrawable = Number(partner.balance_withdrawable || 0) + amount;

  const { data: updatedCommission, error: updateCommissionError } = await supabase
    .from("partner_commissions")
    .update({
      status: "withdrawable",
      is_withdrawable: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commission.id)
    .in("status", ["approved", "pending_activation"])
    .select(PARTNER_COMMISSION_COLUMNS)
    .maybeSingle();

  if (updateCommissionError) {
    throw updateCommissionError;
  }

  if (!updatedCommission?.id) {
    throw new Error("INVALID_STATUS");
  }

  const { error: partnerUpdateError } = await supabase
    .from("partners")
    .update({
      balance_pending: nextPending,
      balance_withdrawable: nextWithdrawable,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commission.partner_id);

  if (partnerUpdateError) {
    throw partnerUpdateError;
  }

  await recordCommissionReleaseLedger(supabase, {
    partnerId: commission.partner_id,
    commissionId: updatedCommission.id,
    amount,
    balanceBefore: Number(partner.balance_withdrawable || 0),
    balanceAfter: nextWithdrawable,
    note: `Commission ${updatedCommission.id} released to withdrawable balance`,
  });

  partnerLogger.commission("released", {
    partnerId: commission.partner_id,
    commissionId: updatedCommission.id,
    amount,
  });

  return updatedCommission;
}

export async function rejectCommission(supabase, commissionId, { reason } = {}) {
  const normalizedCommissionId = String(commissionId || "").trim();
  const rejectionReason = String(reason || "").trim() || "Commission rejected";

  if (!normalizedCommissionId) {
    throw new Error("MISSING_COMMISSION_ID");
  }

  const { data: commission, error: commissionError } = await supabase
    .from("partner_commissions")
    .select("id, partner_id, amount, status, is_withdrawable")
    .eq("id", normalizedCommissionId)
    .maybeSingle();

  if (commissionError) {
    throw commissionError;
  }

  if (!commission?.id) {
    throw new Error("NOT_FOUND");
  }

  if (["rejected", "paid"].includes(commission.status)) {
    throw new Error("INVALID_STATUS");
  }

  const amount = Number(commission.amount || 0);
  const wasWithdrawable = commission.status === "withdrawable" || commission.is_withdrawable;

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("balance_pending, balance_withdrawable, total_earnings")
    .eq("id", commission.partner_id)
    .single();

  if (partnerError) {
    throw partnerError;
  }

  const updates = {
    updated_at: new Date().toISOString(),
  };

  if (wasWithdrawable) {
    updates.balance_withdrawable = Math.max(0, Number(partner.balance_withdrawable || 0) - amount);
  } else if (PENDING_BALANCE_STATUSES.has(commission.status)) {
    updates.balance_pending = Math.max(0, Number(partner.balance_pending || 0) - amount);
  }

  if (amount > 0) {
    updates.total_earnings = Math.max(0, Number(partner.total_earnings || 0) - amount);
  }

  const { data: rejectedCommission, error: rejectError } = await supabase
    .from("partner_commissions")
    .update({
      status: "rejected",
      is_withdrawable: false,
      reason: rejectionReason,
      description: rejectionReason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commission.id)
    .in("status", ["pending", "pending_activation", "approved", "withdrawable"])
    .select(PARTNER_COMMISSION_COLUMNS)
    .maybeSingle();

  if (rejectError) {
    throw rejectError;
  }

  if (!rejectedCommission?.id) {
    throw new Error("INVALID_STATUS");
  }

  if (Object.keys(updates).length > 1) {
    const { error: partnerUpdateError } = await supabase
      .from("partners")
      .update(updates)
      .eq("id", commission.partner_id);

    if (partnerUpdateError) {
      throw partnerUpdateError;
    }
  }

  return rejectedCommission;
}

export async function markCommissionPaidIfNeeded(supabase, commissionId) {
  const normalizedCommissionId = String(commissionId || "").trim();

  if (!normalizedCommissionId) {
    return { updated: false, reason: "missing_commission_id" };
  }

  const { data: commission, error: commissionError } = await supabase
    .from("partner_commissions")
    .select("id, status, is_withdrawable, amount, partner_id")
    .eq("id", normalizedCommissionId)
    .maybeSingle();

  if (commissionError) {
    throw commissionError;
  }

  if (!commission?.id) {
    return { updated: false, reason: "not_found" };
  }

  if (commission.status === "paid") {
    return { updated: false, reason: "already_paid", commission };
  }

  if (commission.status !== "withdrawable" && !commission.is_withdrawable) {
    return { updated: false, reason: "not_withdrawable", commission };
  }

  const amount = Number(commission.amount || 0);

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .select("balance_withdrawable")
    .eq("id", commission.partner_id)
    .single();

  if (partnerError) {
    throw partnerError;
  }

  const { data: paidCommission, error: paidError } = await supabase
    .from("partner_commissions")
    .update({
      status: "paid",
      is_withdrawable: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commission.id)
    .eq("status", "withdrawable")
    .select(PARTNER_COMMISSION_COLUMNS)
    .maybeSingle();

  if (paidError) {
    throw paidError;
  }

  if (!paidCommission?.id) {
    return { updated: false, reason: "invalid_status", commission };
  }

  const { error: partnerUpdateError } = await supabase
    .from("partners")
    .update({
      balance_withdrawable: Math.max(0, Number(partner.balance_withdrawable || 0) - amount),
      updated_at: new Date().toISOString(),
    })
    .eq("id", commission.partner_id);

  if (partnerUpdateError) {
    throw partnerUpdateError;
  }

  return { updated: true, commission: paidCommission };
}

export async function createPartnerServiceCommission(
  supabase,
  {
    userId,
    subscriptionId,
    serviceType,
    subscriptionPrice = 0,
    reason,
    invitedUsername,
    metadata = {},
  }
) {
  const baseAmount = Number(String(subscriptionPrice || "").replace(/[^0-9.]/g, "")) || 0;

  return createPartnerCommissionForService(supabase, {
    referredUserId: userId,
    serviceType,
    sourceId: subscriptionId,
    baseAmount,
    reason,
    invitedUsername,
    metadata,
  });
}

export async function createPartnerServiceCommissionByEmail(
  supabase,
  {
    userEmail,
    subscriptionId,
    serviceType,
    subscriptionPrice,
    reason,
    invitedUsername,
    metadata,
  }
) {
  const profile = await resolveUserIdByEmail(supabase, userEmail);

  if (!profile?.id) {
    return { created: false, reason: "user_not_found" };
  }

  return createPartnerServiceCommission(supabase, {
    userId: profile.id,
    subscriptionId,
    serviceType,
    subscriptionPrice,
    reason,
    invitedUsername: invitedUsername || profile.username,
    metadata,
  });
}
