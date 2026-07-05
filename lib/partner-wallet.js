import { MIN_PARTNER_WITHDRAWAL_USDT, WITHDRAWAL_NETWORKS } from "./partner-shared";
import { notifyPartnerWithdrawalEvent } from "./partner-withdrawal-notifications";
import { createPartnerNotification, PARTNER_NOTIFICATION_TYPES } from "./partner-notifications";
import { partnerLogger } from "./partner-logger";
import { writePartnerAuditLog } from "./partner-monitoring";
import { parseMoneyAmount, sanitizeText, sanitizeWalletAddress } from "./partner-security";

export { MIN_PARTNER_WITHDRAWAL_USDT };

export const PARTNER_WALLET_LEDGER_TYPES = {
  COMMISSION_RELEASE: "commission_release",
  WITHDRAWAL_REQUEST: "withdrawal_request",
  WITHDRAWAL_PAID: "withdrawal_paid",
  WITHDRAWAL_REJECTED: "withdrawal_rejected",
  ADJUSTMENT: "adjustment",
};

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export async function recordPartnerWalletLedger(
  supabase,
  {
    partnerId,
    type,
    amount,
    balanceBefore,
    balanceAfter,
    referenceType = null,
    referenceId = null,
    note = null,
  }
) {
  const normalizedPartnerId = String(partnerId || "").trim();
  const normalizedType = String(type || "").trim();

  if (!normalizedPartnerId || !normalizedType) {
    throw new Error("INVALID_LEDGER_ENTRY");
  }

  const { data, error } = await supabase
    .from("partner_wallet_ledger")
    .insert({
      partner_id: normalizedPartnerId,
      type: normalizedType,
      amount: roundMoney(amount),
      balance_before: roundMoney(balanceBefore),
      balance_after: roundMoney(balanceAfter),
      reference_type: referenceType,
      reference_id: referenceId,
      note: note || null,
    })
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

export async function hasWithdrawalPaidLedger(supabase, withdrawalId) {
  const { data, error } = await supabase
    .from("partner_wallet_ledger")
    .select("id")
    .eq("reference_type", "withdrawal")
    .eq("reference_id", withdrawalId)
    .eq("type", PARTNER_WALLET_LEDGER_TYPES.WITHDRAWAL_PAID)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
}

async function loadPartnerBalances(supabase, partnerId) {
  const { data: partner, error } = await supabase
    .from("partners")
    .select(
      "id, balance_withdrawable, balance_pending, balance_bonus_pending, total_earnings, total_withdrawn"
    )
    .eq("id", partnerId)
    .single();

  if (error) {
    throw error;
  }

  return partner;
}

async function loadLatestWithdrawal(supabase, partnerId) {
  const { data, error } = await supabase
    .from("partner_withdrawals")
    .select("id, amount, currency, network, wallet_address, status, created_at, paid_at, admin_note, partner_note")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function hasActiveWithdrawalRequest(supabase, partnerId) {
  const { data, error } = await supabase
    .from("partner_withdrawals")
    .select("id")
    .eq("partner_id", partnerId)
    .in("status", ["pending", "approved"])
    .limit(1);

  if (error) {
    throw error;
  }

  return Boolean(data?.length);
}

export async function getPartnerWalletSummary(supabase, partnerId) {
  const partner = await loadPartnerBalances(supabase, partnerId);
  const latestWithdrawal = await loadLatestWithdrawal(supabase, partnerId);
  const hasActiveRequest = await hasActiveWithdrawalRequest(supabase, partnerId);

  const balanceWithdrawable = Number(partner.balance_withdrawable || 0);
  const meetsMinimum = balanceWithdrawable >= MIN_PARTNER_WITHDRAWAL_USDT;

  return {
    balanceWithdrawable,
    balancePending: Number(partner.balance_pending || 0),
    balanceBonusPending: Number(partner.balance_bonus_pending || 0),
    totalEarnings: Number(partner.total_earnings || 0),
    totalWithdrawn: Number(partner.total_withdrawn || 0),
    minWithdrawalAmount: MIN_PARTNER_WITHDRAWAL_USDT,
    canWithdraw: meetsMinimum && !hasActiveRequest,
    hasActiveWithdrawalRequest: hasActiveRequest,
    lastWithdrawal: latestWithdrawal
      ? {
          id: latestWithdrawal.id,
          amount: Number(latestWithdrawal.amount || 0),
          currency: latestWithdrawal.currency,
          network: latestWithdrawal.network,
          walletAddress: latestWithdrawal.wallet_address,
          status: latestWithdrawal.status,
          createdAt: latestWithdrawal.created_at,
          paidAt: latestWithdrawal.paid_at,
          adminNote: latestWithdrawal.admin_note,
          partnerNote: latestWithdrawal.partner_note,
        }
      : null,
    lastWithdrawalStatus: latestWithdrawal?.status || null,
  };
}

export async function listPartnerWalletLedger(supabase, partnerId, { limit = 100 } = {}) {
  const { data, error } = await supabase
    .from("partner_wallet_ledger")
    .select("*")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || []).map((row) => ({
    id: row.id,
    type: row.type,
    amount: Number(row.amount || 0),
    balanceBefore: Number(row.balance_before || 0),
    balanceAfter: Number(row.balance_after || 0),
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    note: row.note,
    createdAt: row.created_at,
  }));
}

export async function listPartnerWithdrawalsForPartner(supabase, partnerId, { limit = 50 } = {}) {
  const { data, error } = await supabase
    .from("partner_withdrawals")
    .select("*")
    .eq("partner_id", partnerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return data || [];
}

export async function createPartnerWithdrawal(
  supabase,
  { partnerId, amount, network, walletAddress, partnerNote }
) {
  const normalizedAmount = parseMoneyAmount(amount);

  if (normalizedAmount == null) {
    throw new Error("INVALID_AMOUNT");
  }

  if (normalizedAmount < MIN_PARTNER_WITHDRAWAL_USDT) {
    throw new Error("BELOW_MINIMUM");
  }

  const allowedNetworks = new Set(WITHDRAWAL_NETWORKS);
  const cleanNetwork = String(network || "").trim().toUpperCase();
  const cleanWallet = sanitizeWalletAddress(walletAddress);
  const cleanNote = sanitizeText(partnerNote, 500);

  if (!allowedNetworks.has(cleanNetwork)) {
    throw new Error("INVALID_NETWORK");
  }

  if (cleanWallet.length < 8 || cleanWallet.length > 128) {
    throw new Error("INVALID_WALLET");
  }

  const partner = await loadPartnerBalances(supabase, partnerId);
  const available = Number(partner.balance_withdrawable || 0);

  if (normalizedAmount > available) {
    throw new Error("INSUFFICIENT_BALANCE");
  }

  const { data: activeRows, error: activeError } = await supabase
    .from("partner_withdrawals")
    .select("id")
    .eq("partner_id", partnerId)
    .in("status", ["pending", "approved"]);

  if (activeError) {
    throw activeError;
  }

  if (activeRows?.length) {
    throw new Error("PENDING_WITHDRAWAL_EXISTS");
  }

  const { data: withdrawal, error: insertError } = await supabase
    .from("partner_withdrawals")
    .insert({
      partner_id: partnerId,
      amount: normalizedAmount,
      currency: "USDT",
      network: cleanNetwork,
      wallet_address: cleanWallet,
      partner_note: cleanNote || null,
      status: "pending",
    })
    .select("*")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      throw new Error("PENDING_WITHDRAWAL_EXISTS");
    }

    throw insertError;
  }

  partnerLogger.withdrawal("requested", {
    partnerId,
    withdrawalId: withdrawal.id,
    amount: normalizedAmount,
    network: cleanNetwork,
  });

  await writePartnerAuditLog("withdrawal.requested", {
    partnerId,
    withdrawalId: withdrawal.id,
    amount: normalizedAmount,
  });

  await recordPartnerWalletLedger(supabase, {
    partnerId,
    type: PARTNER_WALLET_LEDGER_TYPES.WITHDRAWAL_REQUEST,
    amount: normalizedAmount,
    balanceBefore: available,
    balanceAfter: available,
    referenceType: "withdrawal",
    referenceId: withdrawal.id,
    note: cleanNote || "Withdrawal request created",
  });

  await notifyPartnerWithdrawalEvent({
    type: "withdrawal_created",
    partnerId,
    withdrawalId: withdrawal.id,
    amount: normalizedAmount,
    currency: withdrawal.currency,
    network: cleanNetwork,
    walletAddress: cleanWallet,
    status: withdrawal.status,
    partnerNote: cleanNote || null,
  });

  await createPartnerNotification(supabase, {
    partnerId,
    type: PARTNER_NOTIFICATION_TYPES.WITHDRAWAL_CREATED,
    title: "تم إرسال طلب السحب",
    body: `طلب سحب ${normalizedAmount} USDT قيد المراجعة.`,
    payload: { withdrawalId: withdrawal.id, amount: normalizedAmount },
  });

  return withdrawal;
}

export async function recordCommissionReleaseLedger(
  supabase,
  { partnerId, commissionId, amount, balanceBefore, balanceAfter, note }
) {
  return recordPartnerWalletLedger(supabase, {
    partnerId,
    type: PARTNER_WALLET_LEDGER_TYPES.COMMISSION_RELEASE,
    amount,
    balanceBefore,
    balanceAfter,
    referenceType: "commission",
    referenceId: commissionId,
    note: note || "Commission released to withdrawable balance",
  });
}
