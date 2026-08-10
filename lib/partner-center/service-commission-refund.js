import { roundMoney } from "./money.js";
import { logPartnerCenterEvent } from "./observability.js";
import { resolveSubscriptionServiceType, parseSubscriptionPrice } from "../partner-commission-config.js";
import {
  reverseServiceCommissionBySource,
  invalidatePendingEntitlementBySource,
} from "./service-commission-bridge.js";

/** Economic invalidation types that trigger commission reversal. */
export const COMMISSION_INVALIDATION_TYPES = Object.freeze({
  FULL_REFUND: "full_refund",
  PARTIAL_REFUND: "partial_refund",
  PAYMENT_VOID: "payment_void",
  ADMIN_VOID: "admin_void",
  CHARGEBACK: "chargeback",
});

/** Subscription ended/cancelled without money return — no commission reversal. */
export const NON_REVERSAL_LIFECYCLE = new Set([
  "subscription_ended",
  "subscription_expired",
  "cancel_without_refund",
  "admin_remove_no_refund",
]);

export function deriveTrustedRefundAmounts(subscriptionRow, { refundAmount = null } = {}) {
  const purchaseAmount = roundMoney(parseSubscriptionPrice(subscriptionRow?.price));
  const approvedRefund = refundAmount != null ? roundMoney(refundAmount) : purchaseAmount;
  return {
    originalPurchaseAmount: purchaseAmount,
    approvedRefundAmount: Math.min(approvedRefund, purchaseAmount),
  };
}

/**
 * Reverse service commission when underlying commercial value is invalidated.
 * Server-trusted amounts only — never from client body directly without DB row validation.
 */
export async function invalidateServiceCommissionEconomically(
  supabase,
  {
    subscriptionRequestId,
    serviceType = null,
    refundEventId,
    reason,
    invalidationType = COMMISSION_INVALIDATION_TYPES.FULL_REFUND,
    refundAmount = null,
    subscriptionRow = null,
  }
) {
  const sourceId = String(subscriptionRequestId || "").trim();
  if (!sourceId) {
    return { reversed: false, reason: "missing_source" };
  }

  let row = subscriptionRow;
  if (!row?.id) {
    const { data, error } = await supabase
      .from("subscription_requests")
      .select("id, category, plan_name, price, status, user_email")
      .eq("id", sourceId)
      .maybeSingle();
    if (error) throw error;
    row = data;
  }

  if (!row?.id) {
    return { reversed: false, reason: "subscription_not_found" };
  }

  const resolvedServiceType =
    serviceType || resolveSubscriptionServiceType(row.category, row.plan_name);

  await invalidatePendingEntitlementBySource(supabase, {
    sourceId,
    serviceType: resolvedServiceType,
    reason: reason || invalidationType,
  });

  const isPartial = invalidationType === COMMISSION_INVALIDATION_TYPES.PARTIAL_REFUND;
  const amounts = deriveTrustedRefundAmounts(row, { refundAmount });

  if (isPartial && amounts.approvedRefundAmount <= 0) {
    return { reversed: false, reason: "zero_refund_amount" };
  }

  const result = await reverseServiceCommissionBySource(supabase, {
    sourceId,
    serviceType: resolvedServiceType,
    refundEventId: refundEventId || `${invalidationType}:${sourceId}`,
    reason: reason || invalidationType,
    approvedRefundAmount: isPartial ? amounts.approvedRefundAmount : null,
    originalPurchaseAmount: amounts.originalPurchaseAmount,
    fullReversal: !isPartial,
  });

  logPartnerCenterEvent("SERVICE_COMMISSION_INVALIDATION", {
    sourceId,
    serviceType: resolvedServiceType,
    invalidationType,
    ...result,
  });

  return result;
}
