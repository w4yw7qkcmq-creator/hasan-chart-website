/**
 * Notification hook for partner withdrawal lifecycle events.
 * Wire email/push/in-app delivery here later — no external sends in Phase 7.
 */

const WITHDRAWAL_NOTIFICATION_TYPES = new Set([
  "withdrawal_created",
  "withdrawal_approved",
  "withdrawal_rejected",
  "withdrawal_paid",
]);

export async function notifyPartnerWithdrawalEvent({
  type,
  partnerId,
  withdrawalId,
  amount,
  currency = "USDT",
  network,
  walletAddress,
  status,
  adminNote,
  partnerNote,
} = {}) {
  const normalizedType = String(type || "").trim();

  if (!WITHDRAWAL_NOTIFICATION_TYPES.has(normalizedType)) {
    return { hookReady: true, skipped: true, reason: "unknown_type" };
  }

  const payload = {
    type: normalizedType,
    partnerId: String(partnerId || ""),
    withdrawalId: String(withdrawalId || ""),
    amount: Number(amount || 0),
    currency,
    network: network || null,
    walletAddress: walletAddress || null,
    status: status || null,
    adminNote: adminNote || null,
    partnerNote: partnerNote || null,
    createdAt: new Date().toISOString(),
  };

  if (process.env.NODE_ENV !== "production") {
    console.info("[PARTNER_WITHDRAWAL_NOTIFICATION]", payload);
  }

  return {
    hookReady: true,
    queued: false,
    delivered: false,
    payload,
  };
}
