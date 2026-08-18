import { logPartnerCenterEvent, logPartnerCenterFailure } from "./observability.js";
import { roundMoney } from "./money.js";

export const FINANCIAL_GATEWAY_RPC = Object.freeze({
  CREATE_COMMISSION: "create_partner_commission_atomic",
  CREATE_SIGNUP_BONUS: "create_partner_signup_bonus_atomic",
  RELEASE_COMMISSION: "release_partner_commission_atomic",
  REVERSE_LEDGER_ENTRY: "reverse_partner_ledger_entry_atomic",
  RELEASE_PAYOUT_HOLD: "release_partner_commission_payout_hold",
  CREATE_GROWTH_REWARD: "create_partner_growth_reward_atomic",
  QUALIFIED_REFERRAL_REWARD: "credit_partner_qualified_referral_reward_atomic",
  REVERSE_SERVICE_COMMISSION: "reverse_partner_service_commission_atomic",
});

function parseRpcResult(data, error) {
  if (error) {
    if (error.code === "23505" || error.message?.includes("duplicate")) {
      return { ok: false, duplicate: true, reason: "duplicate", error };
    }
    throw error;
  }
  return { ok: true, result: data || {} };
}

export async function createPartnerCommissionAtomic(
  supabase,
  {
    partnerId,
    referralId,
    referredUserId,
    serviceType,
    sourceId,
    baseAmount,
    commissionPercent,
    reason,
    initialStatus,
    invitedUsername,
    idempotencyKey,
    sourceType = "service",
    entitlementId = null,
  }
) {
  const rpcArgs = {
    p_partner_id: partnerId,
    p_referral_id: referralId,
    p_referred_user_id: referredUserId,
    p_service_type: serviceType,
    p_source_id: String(sourceId),
    p_base_amount: Number(baseAmount || 0),
    p_commission_percent: Number(commissionPercent || 0),
    p_reason: reason || null,
    p_initial_status: initialStatus || "pending_activation",
    p_invited_username: invitedUsername || null,
    p_idempotency_key: idempotencyKey,
    p_source_type: sourceType,
    p_entitlement_id: entitlementId ?? null,
  };
  const { data, error } = await supabase.rpc(FINANCIAL_GATEWAY_RPC.CREATE_COMMISSION, rpcArgs);

  const parsed = parseRpcResult(data, error);

  if (!parsed.ok) {
    return {
      created: false,
      duplicate: true,
      reason: "duplicate",
      commissionId: parsed.error?.details || null,
    };
  }

  const result = parsed.result;

  if (result.duplicate) {
    return {
      created: false,
      duplicate: true,
      reason: "duplicate",
      commissionId: result.commission_id,
      status: result.status,
    };
  }

  logPartnerCenterEvent("gateway.commission_created", {
    partnerId,
    commissionId: result.commission_id,
    amount: result.amount,
    payoutHold: result.payout_hold,
  });

  return {
    created: Boolean(result.created),
    duplicate: false,
    commissionId: result.commission_id,
    partnerId,
    amount: Number(result.amount || 0),
    status: result.status,
    ledgerEntryId: result.ledger_entry_id,
    eventId: result.event_id,
    payoutHold: Boolean(result.payout_hold),
    fraudRisk: result.fraud_risk || "LOW",
  };
}

export async function createPartnerSignupBonusAtomic(
  supabase,
  { partnerId, referralId, referredUserId, referralCode, invitedUsername }
) {
  const { data, error } = await supabase.rpc(FINANCIAL_GATEWAY_RPC.CREATE_SIGNUP_BONUS, {
    p_partner_id: partnerId,
    p_referral_id: referralId,
    p_referred_user_id: referredUserId,
    p_referral_code: referralCode,
    p_invited_username: invitedUsername,
  });

  const parsed = parseRpcResult(data, error);

  if (!parsed.ok) {
    return { created: false, duplicate: true, reason: "duplicate" };
  }

  const result = parsed.result;

  if (result.duplicate) {
    return {
      created: false,
      duplicate: true,
      commissionId: result.commission_id,
    };
  }

  logPartnerCenterEvent("gateway.signup_bonus_created", {
    partnerId,
    referralId,
    commissionId: result.commission_id,
    amount: result.amount,
    payoutHold: result.payout_hold,
  });

  return {
    created: Boolean(result.created),
    duplicate: false,
    commissionId: result.commission_id,
    amount: Number(result.amount || 0),
    ledgerEntryId: result.ledger_entry_id,
    eventId: result.event_id,
    payoutHold: Boolean(result.payout_hold),
  };
}

export async function releasePartnerCommissionAtomic(supabase, commissionId) {
  const { data, error } = await supabase.rpc(FINANCIAL_GATEWAY_RPC.RELEASE_COMMISSION, {
    p_commission_id: commissionId,
  });

  if (error) {
    if (
      error.message?.includes("payout_hold_active") ||
      error.message?.includes("fraud_blocks_payable")
    ) {
      return {
        released: false,
        blocked: true,
        reason: error.message,
      };
    }
    throw error;
  }

  if (data?.released === false) {
    return {
      released: false,
      blocked: Boolean(data.blocked),
      reason: data.reason || "not_released",
      commission: data,
    };
  }

  logPartnerCenterEvent("gateway.commission_released", {
    commissionId,
    amount: data?.amount,
  });

  return { released: true, ...data };
}

export async function reversePartnerLedgerEntryAtomic(supabase, originalEntryId, reason) {
  const { data, error } = await supabase.rpc(FINANCIAL_GATEWAY_RPC.REVERSE_LEDGER_ENTRY, {
    p_original_entry_id: originalEntryId,
    p_reason: reason || "reversal",
  });

  const parsed = parseRpcResult(data, error);
  if (!parsed.ok) {
    return { reversed: false, duplicate: true };
  }

  return {
    reversed: Boolean(parsed.result.reversed),
    duplicate: Boolean(parsed.result.duplicate),
    reversalId: parsed.result.reversal_id,
  };
}

export async function releasePartnerPayoutHoldAtomic(
  supabase,
  { commissionId, reviewerUserId, note }
) {
  if (!reviewerUserId) {
    const err = new Error("reviewer_user_id_required");
    err.code = "22023";
    throw err;
  }

  const { data: allowed, error: permErr } = await supabase.rpc("iam_has_permission", {
    p_permission: "partners.fraud.review",
    p_user_id: reviewerUserId,
  });
  if (permErr) throw permErr;
  if (!allowed) {
    const err = new Error("permission_denied");
    err.code = "42501";
    throw err;
  }

  const { data, error } = await supabase.rpc(FINANCIAL_GATEWAY_RPC.RELEASE_PAYOUT_HOLD, {
    p_commission_id: commissionId,
    p_reviewer_user_id: reviewerUserId,
    p_note: note || null,
  });

  if (error) {
    throw error;
  }

  return { releasedHold: Boolean(data?.released_hold), commissionId };
}

export async function reversePartnerServiceCommissionAtomic(
  supabase,
  {
    commissionId,
    reason,
    refundEventId,
    approvedRefundAmount = null,
    originalPurchaseAmount = null,
  }
) {
  if (!commissionId) {
    throw Object.assign(new Error("missing_commission_id"), { status: 400 });
  }

  const { data, error } = await supabase.rpc(FINANCIAL_GATEWAY_RPC.REVERSE_SERVICE_COMMISSION, {
    p_commission_id: commissionId,
    p_reason: reason || "refund_reversal",
    p_refund_event_id: refundEventId || null,
    p_approved_refund_amount: approvedRefundAmount != null ? Number(approvedRefundAmount) : null,
    p_original_purchase_amount:
      originalPurchaseAmount != null ? Number(originalPurchaseAmount) : null,
  });

  if (error) {
    const msg = String(error.message || error.details || "");
    if (msg.includes("reverse_test_fail_injected") || msg.includes("commission_test_fail_injected")) {
      throw error;
    }
  }

  const parsed = parseRpcResult(data, error);
  if (!parsed.ok) {
    return { reversed: false, duplicate: true, reason: "duplicate" };
  }

  const result = parsed.result;
  if (result?.error === "reverse_test_fail_injected") {
    throw Object.assign(new Error("reverse_test_fail_injected"), { code: "P0001" });
  }
  logPartnerCenterEvent("gateway.service_commission_reversed", {
    commissionId,
    reversed: result.reversed,
    amount: result.amount,
  });

  return {
    reversed: Boolean(result.reversed),
    duplicate: Boolean(result.duplicate),
    commissionId: result.commission_id,
    amount: Number(result.amount || 0),
    ledgerEntryId: result.ledger_entry_id,
    bucket: result.bucket || null,
  };
}

async function loadPartnerBalanceRow(supabase, partnerId) {
  const { data, error } = await supabase
    .from("partners")
    .select("balance_pending, balance_bonus_pending, balance_withdrawable, total_earnings, signup_count")
    .eq("id", partnerId)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Restores partner balance columns after a ledger credit was reversed.
 * Mirrors growth-refund-integration reversal policy for bonus_pending / pending buckets.
 */
export async function restorePartnerBalancesAfterLedgerCreditReversal(
  supabase,
  { partnerId, amount, balanceBucket, decrementSignupCount = false }
) {
  const amt = roundMoney(amount);
  if (!partnerId || amt <= 0) return { restored: false, reason: "nothing_to_restore" };

  const partner = await loadPartnerBalanceRow(supabase, partnerId);
  const updates = { updated_at: new Date().toISOString() };

  if (balanceBucket === "withdrawable") {
    updates.balance_withdrawable = roundMoney(Math.max(0, Number(partner.balance_withdrawable || 0) - amt));
  } else if (balanceBucket === "bonus_pending") {
    updates.balance_bonus_pending = roundMoney(Math.max(0, Number(partner.balance_bonus_pending || 0) - amt));
    if (decrementSignupCount) {
      updates.signup_count = Math.max(0, Number(partner.signup_count || 0) - 1);
    }
  } else {
    updates.balance_pending = roundMoney(Math.max(0, Number(partner.balance_pending || 0) - amt));
  }
  updates.total_earnings = roundMoney(Math.max(0, Number(partner.total_earnings || 0) - amt));

  const { error } = await supabase.from("partners").update(updates).eq("id", partnerId);
  if (error) throw error;
  return { restored: true, amount: amt, balanceBucket };
}

export const BALANCE_RESTORE_IDEMPOTENCY_PREFIX = "balance_restore_only";

export async function computeCommissionLedgerNet(supabase, commissionId) {
  const credit = await findLedgerCreditForCommission(supabase, commissionId);
  const { data, error } = await supabase
    .from("partner_financial_ledger_entries")
    .select("amount, entry_direction")
    .eq("legacy_commission_id", commissionId);
  if (error) throw error;
  let net = 0;
  for (const row of data || []) {
    const amt = roundMoney(row.amount);
    net += row.entry_direction === "debit" ? -amt : amt;
  }
  if (credit?.id) {
    const { data: linkedReversals, error: revErr } = await supabase
      .from("partner_financial_ledger_entries")
      .select("amount, entry_direction")
      .or(`idempotency_key.eq.ledger:reversal:${credit.id},reverses_entry_id.eq.${credit.id}`);
    if (revErr) throw revErr;
    for (const row of linkedReversals || []) {
      const amt = roundMoney(row.amount);
      net += row.entry_direction === "debit" ? -amt : amt;
    }
  }
  return roundMoney(net);
}

async function balanceRestoreMarkerExists(supabase, commissionId, { prefix = BALANCE_RESTORE_IDEMPOTENCY_PREFIX } = {}) {
  const idempotencyKey = `${prefix}:${commissionId}`;
  const { count, error } = await supabase
    .from("partner_service_commission_reversals")
    .select("id", { count: "exact", head: true })
    .eq("idempotency_key", idempotencyKey);
  if (error) throw error;
  return (count || 0) > 0;
}

/**
 * Restores partner balances when commission is already reversed and ledger net is zero.
 * Does not create a second ledger debit. Idempotent via partner_service_commission_reversals marker row.
 */
export async function restorePartnerServiceCommissionBalanceAfterLedgerNetZero(
  supabase,
  commissionId,
  { reason = "balance_restore_after_ledger_reversal", idempotencyPrefix = BALANCE_RESTORE_IDEMPOTENCY_PREFIX } = {}
) {
  const idempotencyKey = `${idempotencyPrefix}:${commissionId}`;
  if (await balanceRestoreMarkerExists(supabase, commissionId, { prefix: idempotencyPrefix })) {
    return { outcome: "already_restored", commissionId, duplicate: true, idempotencyKey };
  }

  const { data: commission, error } = await supabase
    .from("partner_commissions")
    .select("id, partner_id, amount, amount_reversed, status, source_type, is_withdrawable, idempotency_key")
    .eq("id", commissionId)
    .maybeSingle();
  if (error) throw error;
  if (!commission?.id) return { outcome: "already_clean", commissionId };
  if (commission.source_type === "signup_bonus") {
    return { outcome: "skipped", reason: "signup_bonus", commissionId };
  }

  const amount = roundMoney(commission.amount);
  const amountReversed = roundMoney(commission.amount_reversed);
  const fullyReversed =
    commission.status === "reversed" ||
    commission.status === "rejected" ||
    (amount > 0 && amountReversed >= amount);
  if (!fullyReversed) {
    return { outcome: "not_reversed", commissionId, status: commission.status, amountReversed };
  }

  const ledgerNet = await computeCommissionLedgerNet(supabase, commissionId);
  if (Math.abs(ledgerNet) > 0.001) {
    return { outcome: "ledger_not_net_zero", commissionId, ledgerNet };
  }

  const { count: commissionReversalDebits, error: debitErr } = await supabase
    .from("partner_financial_ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("legacy_commission_id", commissionId)
    .eq("entry_direction", "debit");
  if (debitErr) throw debitErr;
  if ((commissionReversalDebits || 0) > 0) {
    return {
      outcome: "already_restored",
      commissionId,
      duplicate: true,
      via: "ledger_reversal_debit_on_commission",
    };
  }

  const { data: canonicalReversal, error: revErr } = await supabase
    .from("partner_service_commission_reversals")
    .select("id, ledger_entry_id, refund_event_id, idempotency_key")
    .eq("commission_id", commissionId)
    .neq("refund_event_id", "balance_restore_only")
    .like("idempotency_key", "service_commission_refund:%")
    .limit(1)
    .maybeSingle();
  if (revErr) throw revErr;
  if (canonicalReversal?.id) {
    const markerExists = await balanceRestoreMarkerExists(supabase, commissionId, { prefix: idempotencyPrefix });
    if (markerExists) {
      return {
        outcome: "already_restored",
        commissionId,
        duplicate: true,
        via: "canonical_service_reversal",
        reversalId: canonicalReversal.id,
      };
    }
  }

  const restoreAmount = roundMoney(amount);
  if (restoreAmount <= 0) {
    return { outcome: "nothing_to_restore", commissionId };
  }

  const ledger = await findLedgerCreditForCommission(supabase, commissionId);
  const bucket =
    commission.status === "withdrawable" || commission.is_withdrawable
      ? "withdrawable"
      : ledger?.balance_bucket || "pending";

  const partner = await loadPartnerBalanceRow(supabase, commission.partner_id);
  const bucketBalance =
    bucket === "withdrawable"
      ? Number(partner.balance_withdrawable || 0)
      : bucket === "bonus_pending"
        ? Number(partner.balance_bonus_pending || 0)
        : Number(partner.balance_pending || 0);
  if (roundMoney(bucketBalance) < restoreAmount) {
    return {
      outcome: "no_balance_exposure",
      commissionId,
      restoreAmount,
      bucketBalance: roundMoney(bucketBalance),
      bucket,
    };
  }

  await restorePartnerBalancesAfterLedgerCreditReversal(supabase, {
    partnerId: commission.partner_id,
    amount: restoreAmount,
    balanceBucket: bucket,
  });

  const { error: markerError } = await supabase.from("partner_service_commission_reversals").insert({
    commission_id: commissionId,
    refund_event_id: "balance_restore_only",
    reversal_amount: restoreAmount,
    original_commission_amount: amount,
    reason,
    ledger_entry_id: null,
    idempotency_key: idempotencyKey,
  });
  if (markerError) {
    if (markerError.code === "23505") {
      return { outcome: "already_restored", commissionId, duplicate: true, idempotencyKey };
    }
    throw markerError;
  }

  logPartnerCenterEvent("gateway.service_commission_balance_restored", {
    commissionId,
    partnerId: commission.partner_id,
    amount: restoreAmount,
    bucket,
    reason,
  });

  return {
    outcome: "restored",
    commissionId,
    partnerId: commission.partner_id,
    amount: restoreAmount,
    bucket,
    idempotencyKey,
    ledgerNet,
  };
}

export async function findLedgerCreditForCommission(supabase, commissionId) {
  const { data, error } = await supabase
    .from("partner_financial_ledger_entries")
    .select("id, amount, balance_bucket, entry_direction, idempotency_key")
    .eq("legacy_commission_id", commissionId)
    .eq("entry_direction", "credit")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function ledgerCreditAlreadyReversed(supabase, ledgerEntryId) {
  const revKey = `ledger:reversal:${ledgerEntryId}`;
  const { count, error } = await supabase
    .from("partner_financial_ledger_entries")
    .select("id", { count: "exact", head: true })
    .eq("idempotency_key", revKey);
  if (error) throw error;
  return (count || 0) > 0;
}

/**
 * Signup bonus economic contract (canonical product semantics):
 * - create_partner_signup_bonus_atomic: bonus_pending += amount, total_earnings += amount, one ledger credit
 * - release_partner_signup_bonus_on_qualification (when qualification_credited_at set):
 *   bonus_pending += amount, total_earnings += amount, no additional ledger row
 */
export function computeSignupBonusEconomicExposure(commission = {}) {
  const amount = roundMoney(commission.amount);
  const releaseApplied = Boolean(commission.qualification_credited_at);
  const balanceMultiplier = releaseApplied ? 2 : 1;
  return {
    amount,
    releaseApplied,
    qualificationCreditedAt: commission.qualification_credited_at || null,
    bonusPendingExposure: roundMoney(amount * balanceMultiplier),
    totalEarningsExposure: roundMoney(amount * balanceMultiplier),
    ledgerCreditAmount: amount,
    balanceRestoreAmount: roundMoney(amount * balanceMultiplier),
  };
}

export async function sumPartnerLedgerSigned(supabase, partnerId) {
  const { data, error } = await supabase
    .from("partner_financial_ledger_entries")
    .select("amount, entry_direction")
    .eq("partner_id", partnerId);
  if (error) throw error;
  let net = 0;
  for (const row of data || []) {
    const amt = roundMoney(row.amount);
    net += row.entry_direction === "debit" ? -amt : amt;
  }
  return roundMoney(net);
}

/**
 * Economically reverse signup_bonus commission: ledger reversal + balance restore.
 * Idempotent when commission is already reversed or ledger reversal is duplicate.
 */
export async function reversePartnerSignupBonusCommissionEconomically(
  supabase,
  commissionId,
  { reason = "fixture_cleanup" } = {}
) {
  const { data: commission, error } = await supabase
    .from("partner_commissions")
    .select("id, partner_id, amount, status, source_type, qualification_credited_at")
    .eq("id", commissionId)
    .maybeSingle();
  if (error) throw error;
  if (!commission?.id) return { outcome: "already_clean", commissionId };
  if (commission.source_type !== "signup_bonus") {
    return { outcome: "skipped", reason: "not_signup_bonus", commissionId };
  }
  if (commission.status === "reversed" || commission.status === "rejected") {
    return { outcome: "already_reversed", commissionId };
  }

  const ledger = await findLedgerCreditForCommission(supabase, commissionId);
  const exposure = computeSignupBonusEconomicExposure(commission);
  const balanceRestoreAmount = exposure.balanceRestoreAmount;
  let ledgerReversed = false;
  let ledgerDuplicate = false;

  if (ledger?.id) {
    const already = await ledgerCreditAlreadyReversed(supabase, ledger.id);
    if (already) {
      ledgerDuplicate = true;
    } else {
      const rev = await reversePartnerLedgerEntryAtomic(supabase, ledger.id, reason);
      ledgerReversed = Boolean(rev.reversed);
      ledgerDuplicate = Boolean(rev.duplicate);
    }
  }

  // Restore balances only when this call reversed the ledger — not when ledger was already reversed.
  if (ledgerReversed || (!ledger?.id && !ledgerDuplicate)) {
    await restorePartnerBalancesAfterLedgerCreditReversal(supabase, {
      partnerId: commission.partner_id,
      amount: balanceRestoreAmount,
      balanceBucket: ledger?.balance_bucket || "bonus_pending",
      decrementSignupCount: true,
    });
  }

  await supabase
    .from("partner_commissions")
    .update({
      status: "reversed",
      amount_reversed: exposure.amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commissionId)
    .in("status", ["pending", "pending_activation", "approved", "withdrawable"]);

  return {
    outcome: ledgerDuplicate && !ledgerReversed ? "already_reversed" : "reversed",
    commissionId,
    amount: exposure.amount,
    exposure,
    balanceRestoreAmount,
    ledgerReversed,
    ledgerDuplicate,
  };
}

/**
 * Economically reverse QRR credit row: ledger reversal + balance restore.
 */
export async function reversePartnerQualifiedReferralRewardEconomically(
  supabase,
  creditId,
  { reason = "fixture_cleanup" } = {}
) {
  const { data: credit, error } = await supabase
    .from("partner_qualified_referral_reward_credits")
    .select("id, partner_id, amount, status, ledger_entry_id")
    .eq("id", creditId)
    .maybeSingle();
  if (error) throw error;
  if (!credit?.id) return { outcome: "already_clean", creditId };
  if (credit.status !== "credited") {
    return { outcome: "already_reversed", creditId, status: credit.status };
  }

  const amount = roundMoney(credit.amount);
  let ledgerReversed = false;
  let ledgerDuplicate = false;

  if (credit.ledger_entry_id) {
    const already = await ledgerCreditAlreadyReversed(supabase, credit.ledger_entry_id);
    if (already) {
      ledgerDuplicate = true;
    } else {
      const rev = await reversePartnerLedgerEntryAtomic(supabase, credit.ledger_entry_id, reason);
      ledgerReversed = Boolean(rev.reversed);
      ledgerDuplicate = Boolean(rev.duplicate);
    }
  }

  if (ledgerReversed || (!credit.ledger_entry_id && !ledgerDuplicate)) {
    await restorePartnerBalancesAfterLedgerCreditReversal(supabase, {
      partnerId: credit.partner_id,
      amount,
      balanceBucket: "bonus_pending",
    });
  }

  return {
    outcome: ledgerDuplicate && !ledgerReversed ? "already_reversed" : "reversed",
    creditId,
    amount,
    ledgerReversed,
    ledgerDuplicate,
  };
}

/**
 * Reverse service commission when ledger credit was already reversed (pregate path).
 * Restores balances without creating a second ledger debit.
 */
export async function reversePartnerServiceCommissionLedgerAlreadyReversed(
  supabase,
  commissionId,
  { reason = "fixture_cleanup", ledgerEntryId = null } = {}
) {
  const { data: commission, error } = await supabase
    .from("partner_commissions")
    .select("id, partner_id, amount, status, source_type, is_withdrawable")
    .eq("id", commissionId)
    .maybeSingle();
  if (error) throw error;
  if (!commission?.id) return { outcome: "already_clean", commissionId };
  if (commission.source_type === "signup_bonus") {
    return { outcome: "skipped", reason: "signup_bonus", commissionId };
  }
  if (commission.status === "reversed" || commission.status === "rejected") {
    const restored = await restorePartnerServiceCommissionBalanceAfterLedgerNetZero(supabase, commissionId, {
      reason,
    });
    if (restored.outcome === "restored" || restored.outcome === "already_restored") {
      return { ...restored, via: "ledger_already_reversed_path" };
    }
    return { outcome: "already_reversed", commissionId, detail: restored };
  }

  const ledger =
    ledgerEntryId != null
      ? { id: ledgerEntryId, balance_bucket: commission.is_withdrawable ? "withdrawable" : "pending" }
      : await findLedgerCreditForCommission(supabase, commissionId);

  const amount = roundMoney(commission.amount);
  const bucket =
    commission.status === "withdrawable" || commission.is_withdrawable
      ? "withdrawable"
      : ledger?.balance_bucket || "pending";

  await restorePartnerBalancesAfterLedgerCreditReversal(supabase, {
    partnerId: commission.partner_id,
    amount,
    balanceBucket: bucket,
  });

  await supabase
    .from("partner_commissions")
    .update({
      status: "reversed",
      amount_reversed: amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", commissionId)
    .in("status", ["pending", "pending_activation", "approved", "withdrawable"]);

  return { outcome: "reversed", commissionId, amount, reason, bucket };
}

export function isFinancialRpcAvailable(error) {
  if (!error) return true;
  return !(
    error.code === "42883" ||
    error.code === "PGRST202" ||
    String(error.message || "").includes("Could not find the function")
  );
}

export async function assertFinancialGatewayReady(supabase) {
  const { error } = await supabase.rpc(FINANCIAL_GATEWAY_RPC.CREATE_COMMISSION, {});
  if (error && (error.code === "42883" || error.message?.includes("Could not find"))) {
    throw new Error("PARTNER_FINANCIAL_GATEWAY_NOT_DEPLOYED");
  }
}
