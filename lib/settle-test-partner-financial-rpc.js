/**
 * RPC client helpers for settle_test_partner_financial (Postgres function).
 * Execute path uses RPC only — no non-transactional Supabase JS fallback.
 */

export const SETTLEMENT_RPC_NAME = "settle_test_partner_financial";

export function isSettlementRpcMissingError(error = null) {
  if (!error) return false;
  const code = String(error.code || "");
  const message = String(error.message || "");
  const details = String(error.details || "");
  return (
    code === "PGRST202" ||
    /could not find the function/i.test(message) ||
    /function public\.settle_test_partner_financial/i.test(details)
  );
}

export function buildSettlementRpcParams(entry = {}) {
  return {
    p_partner_id: entry.partnerId,
    p_commission_id: entry.commissionId,
    p_withdrawal_id: entry.withdrawalId,
    p_request_id: entry.requestId,
    p_idempotency_key: entry.idempotencyKey,
  };
}

/**
 * Probe RPC deployment without performing a real settlement.
 * A deployed function should reject dummy params with a business/validation error, not PGRST202.
 */
export async function assertSettlementRpcAvailable(supabase) {
  const { error } = await supabase.rpc(SETTLEMENT_RPC_NAME, {
    p_partner_id: "00000000-0000-0000-0000-000000000000",
    p_commission_id: "00000000-0000-0000-0000-000000000000",
    p_withdrawal_id: "00000000-0000-0000-0000-000000000000",
    p_request_id: 0,
    p_idempotency_key:
      "test-financial-settlement:0:00000000-0000-0000-0000-000000000000:00000000-0000-0000-0000-000000000000",
  });

  if (isSettlementRpcMissingError(error)) {
    const err = new Error(
      "settle_test_partner_financial RPC is not deployed. Apply migration before --execute."
    );
    err.code = "SETTLEMENT_RPC_NOT_DEPLOYED";
    throw err;
  }

  return true;
}

export async function executeSettlementViaRpc(supabase, entry = {}) {
  const params = buildSettlementRpcParams(entry);
  const { data, error } = await supabase.rpc(SETTLEMENT_RPC_NAME, params);
  if (error) {
    const err = new Error(error.message || "Settlement RPC failed");
    err.code = error.code || "SETTLEMENT_RPC_FAILED";
    err.details = error.details || null;
    throw err;
  }
  return data;
}

export function mapRpcResultToEntryResult(entry = {}, rpcResult = {}) {
  return {
    requestId: entry.requestId,
    partnerId: entry.partnerId,
    commissionId: entry.commissionId,
    withdrawalId: entry.withdrawalId,
    idempotencyKey: entry.idempotencyKey,
    rpcStatus: rpcResult?.status || null,
    balancesBefore: rpcResult?.balances_before || entry.currentBalances || null,
    balancesAfter: rpcResult?.balances_after || entry.expectedBalances || null,
    commissionStatusBefore: rpcResult?.commission_status_before || entry.commissionCurrentStatus,
    commissionStatusAfter: rpcResult?.commission_status_after || entry.commissionExpectedStatus,
    ledgerAdjustmentId: rpcResult?.ledger_adjustment_id || null,
    settled: rpcResult?.status === "settled" || rpcResult?.status === "already-settled",
  };
}
