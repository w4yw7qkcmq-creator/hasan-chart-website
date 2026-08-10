import { createPartnerCommissionForService } from "../partner-commission-engine.js";
import { reversePartnerServiceCommissionAtomic } from "./financial-gateway.js";
import { logPartnerCenterEvent, logPartnerCenterFailure } from "./observability.js";
import { roundMoney } from "./money.js";
import { buildRuleSnapshot } from "./service-commission-policy.js";
import { isServiceCommissionSchemaReady } from "./service-commission-schema.js";

function entitlementIdempotencyKey(partnerId, referredUserId, serviceType, sourceId) {
  return [
    "entitlement",
    String(partnerId),
    String(referredUserId),
    String(serviceType).toLowerCase(),
    String(sourceId),
  ].join(":");
}

export async function upsertPendingQualificationEntitlement(
  supabase,
  {
    partnerId,
    referralId,
    referredUserId,
    serviceType,
    sourceId,
    sourceType = "service",
    baseAmount,
    rule,
    tierKey,
    tierPercent,
    commissionPercent,
    calculatedAmount,
  }
) {
  const snapshot = buildRuleSnapshot({
    rule,
    tierKey,
    tierPercent,
    baseAmount,
    calculatedAmount,
    commissionPercent,
  });

  const idempotencyKey = entitlementIdempotencyKey(
    partnerId,
    referredUserId,
    serviceType,
    sourceId
  );

  const row = {
    partner_id: partnerId,
    referral_id: referralId,
    referred_user_id: referredUserId,
    service_type: String(serviceType).toLowerCase(),
    source_id: String(sourceId),
    source_type: sourceType,
    base_amount: roundMoney(baseAmount),
    status: "pending_qualification",
    rule_id: rule?.id || null,
    rule_version: rule?.rule_version ?? 1,
    tier_key: tierKey || null,
    tier_percent: tierPercent != null ? Number(tierPercent) : null,
    calculated_amount: roundMoney(calculatedAmount),
    idempotency_key: idempotencyKey,
    commercial_snapshot: snapshot,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("partner_service_commission_entitlements")
    .upsert(row, { onConflict: "partner_id,referred_user_id,service_type,source_id" })
    .select("id, status")
    .maybeSingle();

  if (error) {
    if (error.code === "42P01") {
      return { stored: false, reason: "schema_not_ready" };
    }
    if (error.code === "23505") {
      return { stored: false, duplicate: true };
    }
    throw error;
  }

  logPartnerCenterEvent("SERVICE_COMMISSION_PENDING_QUALIFICATION", {
    partnerId,
    referralId,
    serviceType,
    sourceId,
    entitlementId: data?.id,
  });

  return { stored: true, entitlementId: data?.id, duplicate: false };
}

export async function invalidatePendingEntitlementBySource(
  supabase,
  { sourceId, serviceType, reason = "invalidated" }
) {
  const schemaReady = await isServiceCommissionSchemaReady(supabase);
  if (!schemaReady) return { invalidated: false, reason: "schema_not_ready" };

  const { data: rows } = await supabase
    .from("partner_service_commission_entitlements")
    .select("id")
    .eq("source_id", String(sourceId))
    .eq("service_type", String(serviceType).toLowerCase())
    .eq("status", "pending_qualification");

  if (!rows?.length) return { invalidated: false, reason: "none_pending" };

  await supabase
    .from("partner_service_commission_entitlements")
    .update({ status: "reversed", updated_at: new Date().toISOString() })
    .in(
      "id",
      rows.map((r) => r.id)
    );

  logPartnerCenterEvent("SERVICE_COMMISSION_ENTITLEMENT_INVALIDATED", {
    sourceId,
    serviceType,
    count: rows.length,
    reason,
  });

  return { invalidated: true, count: rows.length };
}

async function isCommercialSourceStillValid(supabase, { sourceId }) {
  const normalizedSourceId = String(sourceId || "").trim();
  if (!normalizedSourceId) return { valid: false, reason: "missing_source" };

  const { data: subscription, error } = await supabase
    .from("subscription_requests")
    .select("id, status")
    .eq("id", normalizedSourceId)
    .maybeSingle();

  if (error) throw error;
  if (!subscription?.id) return { valid: false, reason: "source_not_found" };

  const status = String(subscription.status || "").trim();
  if (status === "مرفوض") return { valid: false, reason: "payment_rejected" };
  if (["ملغى", "مؤرشف"].includes(status)) {
    return { valid: false, reason: "economically_invalidated" };
  }

  return { valid: true };
}

export async function creditPendingServiceCommissionsOnQualification(
  supabase,
  { referralId, partnerId }
) {
  if (!referralId || !partnerId) {
    return { credited: 0, skipped: 0, reason: "missing_fields" };
  }

  const schemaReady = await isServiceCommissionSchemaReady(supabase);
  if (!schemaReady) {
    return { credited: 0, skipped: 0, reason: "schema_not_ready" };
  }

  const { data: pendingRows, error } = await supabase
    .from("partner_service_commission_entitlements")
    .select("*")
    .eq("referral_id", referralId)
    .eq("status", "pending_qualification")
    .order("created_at", { ascending: true });

  if (error) throw error;

  if (!pendingRows?.length) {
    return { credited: 0, skipped: 0, reason: "none_pending" };
  }

  let credited = 0;
  let skipped = 0;

  for (const row of pendingRows) {
    const sourceCheck = await isCommercialSourceStillValid(supabase, { sourceId: row.source_id });
    if (!sourceCheck.valid) {
      await supabase
        .from("partner_service_commission_entitlements")
        .update({ status: "reversed", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      skipped += 1;
      logPartnerCenterEvent("SERVICE_COMMISSION_SKIPPED", {
        partnerId,
        referralId,
        entitlementId: row.id,
        reason: sourceCheck.reason,
      });
      continue;
    }

    const snapshot = row.commercial_snapshot || {};
    const result = await createPartnerCommissionForService(supabase, {
      referredUserId: row.referred_user_id,
      serviceType: row.service_type,
      sourceId: row.source_id,
      baseAmount: Number(snapshot.base_amount ?? row.base_amount ?? 0),
      reason: `${row.service_type} commission (post-qualification)`,
      metadata: { entitlementId: row.id, fromPendingQualification: true },
      skipQualificationGate: true,
      entitlementId: row.id,
      ruleSnapshot: snapshot,
    });

    if (result.created) {
      await supabase
        .from("partner_service_commission_entitlements")
        .update({
          status: "credited",
          commission_id: result.commissionId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("status", "pending_qualification");

      credited += 1;
      logPartnerCenterEvent("SERVICE_COMMISSION_CREATED", {
        partnerId,
        referralId,
        commissionId: result.commissionId,
        fromEntitlement: row.id,
      });
    } else if (result.reason === "duplicate" && result.commissionId) {
      await supabase
        .from("partner_service_commission_entitlements")
        .update({
          status: "credited",
          commission_id: result.commissionId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      skipped += 1;
    } else {
      skipped += 1;
      logPartnerCenterEvent("SERVICE_COMMISSION_SKIPPED", {
        partnerId,
        referralId,
        entitlementId: row.id,
        reason: result.reason,
      });
    }
  }

  return { credited, skipped };
}

export async function reverseServiceCommissionBySource(
  supabase,
  {
    sourceId,
    serviceType,
    refundEventId,
    reason = "refund_reversal",
    approvedRefundAmount = null,
    originalPurchaseAmount = null,
    fullReversal = true,
  }
) {
  const normalizedSourceId = String(sourceId || "").trim();
  const normalizedServiceType = String(serviceType || "").trim().toLowerCase();

  if (!normalizedSourceId || !normalizedServiceType) {
    return { reversed: false, reason: "missing_fields" };
  }

  const { data: commission, error } = await supabase
    .from("partner_commissions")
    .select("id, status, amount, partner_id, base_amount")
    .eq("source_id", normalizedSourceId)
    .eq("service_type", normalizedServiceType)
    .not("status", "eq", "reversed")
    .maybeSingle();

  if (error) throw error;

  if (!commission?.id) {
    const { data: entitlement } = await supabase
      .from("partner_service_commission_entitlements")
      .select("id")
      .eq("source_id", normalizedSourceId)
      .eq("service_type", normalizedServiceType)
      .eq("status", "pending_qualification")
      .maybeSingle();

    if (entitlement?.id) {
      await supabase
        .from("partner_service_commission_entitlements")
        .update({ status: "reversed", updated_at: new Date().toISOString() })
        .eq("id", entitlement.id);
      logPartnerCenterEvent("SERVICE_COMMISSION_REVERSED", {
        sourceId: normalizedSourceId,
        serviceType: normalizedServiceType,
        entitlementOnly: true,
      });
      return { reversed: true, entitlementOnly: true };
    }

    return { reversed: false, reason: "no_commission" };
  }

  try {
    const result = await reversePartnerServiceCommissionAtomic(supabase, {
      commissionId: commission.id,
      reason,
      refundEventId: refundEventId || normalizedSourceId,
      approvedRefundAmount: fullReversal ? null : approvedRefundAmount,
      originalPurchaseAmount:
        originalPurchaseAmount ?? (Number(commission.base_amount || 0) || null),
    });

    if (result.reversed || result.duplicate) {
      logPartnerCenterEvent("SERVICE_COMMISSION_REVERSED", {
        commissionId: commission.id,
        sourceId: normalizedSourceId,
        serviceType: normalizedServiceType,
        amount: result.amount,
        duplicate: Boolean(result.duplicate),
      });
    }

    return { ...result, commissionId: commission.id };
  } catch (err) {
    logPartnerCenterFailure("SERVICE_COMMISSION_FAILED", {
      commissionId: commission.id,
      reason: err?.message || "reversal_failed",
    });
    throw err;
  }
}
