import { roundMoney } from "./money.js";
import { recordPartnerAdminAudit } from "./admin-audit.js";
import {
  ALLOWED_COMMISSION_MODES,
  ALLOWED_RELEASE_POLICIES,
  SERVICE_COMMISSION_ARABIC_LABELS,
  TIER_POLICIES,
} from "./service-commission-constants.js";
import {
  validateCommissionPercent,
  validateFixedAmount,
} from "./service-commission-policy.js";
import { loadPartnerTiers } from "../partner-tiers.js";
import { isServiceCommissionSchemaReady, safeSelectActiveCommissionRules } from "./service-commission-schema.js";

export async function adminGetServiceCommissionPolicy(supabase) {
  const schemaReady = await isServiceCommissionSchemaReady(supabase);
  if (!schemaReady) {
    return {
      schemaReady: false,
      message: "يتطلب تحديث قاعدة البيانات (migration 20260820)",
      services: [],
      tiers: [],
      metrics: null,
      constraints: null,
    };
  }

  const rules = await safeSelectActiveCommissionRules(supabase);

  const tiers = await loadPartnerTiers(supabase);

  const { data: commissionRows } = await supabase
    .from("partner_commissions")
    .select("amount, status, service_type")
    .neq("source_type", "signup_bonus");

  const totals = {
    total: 0,
    pending: 0,
    withdrawable: 0,
    reversed: 0,
    byService: {},
  };

  for (const row of commissionRows || []) {
    const amt = Number(row.amount || 0);
    totals.total += amt;
    if (row.status === "reversed") totals.reversed += amt;
    else if (row.status === "withdrawable") totals.withdrawable += amt;
    else totals.pending += amt;
    const key = row.service_type || "unknown";
    totals.byService[key] = roundMoney((totals.byService[key] || 0) + amt);
  }

  return {
    schemaReady: true,
    services: (rules || []).map((rule) => ({
      id: rule.id,
      serviceType: rule.service_type,
      displayNameAr:
        rule.display_name_ar || SERVICE_COMMISSION_ARABIC_LABELS[rule.service_type] || rule.service_type,
      isEnabled: Boolean(rule.is_enabled ?? rule.is_active),
      commissionMode: rule.commission_mode,
      tierPolicy: rule.tier_policy || TIER_POLICIES.USE_PARTNER_TIER,
      commissionPercent: Number(rule.commission_percent ?? 0),
      fixedAmount: rule.fixed_amount != null ? Number(rule.fixed_amount) : null,
      releasePolicy: rule.release_policy,
      ruleVersion: rule.rule_version ?? 1,
      effectiveFrom: rule.effective_from,
      updatedAt: rule.updated_at,
      notes: rule.notes,
    })),
    tiers: tiers.map((t) => ({
      tierKey: t.tier_key,
      tierName: t.tier_name,
      commissionPercent: Number(t.commission_percent),
    })),
    metrics: {
      serviceCommissionsTotal: roundMoney(totals.total),
      pending: roundMoney(totals.pending),
      withdrawable: roundMoney(totals.withdrawable),
      reversed: roundMoney(totals.reversed),
      byService: totals.byService,
    },
    constraints: {
      percentMin: 0,
      percentMax: 50,
      fixedMin: 0.01,
      fixedMax: 10000,
      tierPolicies: Object.values(TIER_POLICIES),
      releasePolicies: ALLOWED_RELEASE_POLICIES,
      commissionModes: ALLOWED_COMMISSION_MODES,
    },
  };
}

export async function adminUpdateServiceCommissionRule(
  supabase,
  {
    serviceType,
    isEnabled,
    tierPolicy,
    commissionPercent,
    fixedAmount,
    releasePolicy,
    actorUserId,
    reason = null,
  }
) {
  const key = String(serviceType || "").trim().toLowerCase();
  if (!key) {
    throw Object.assign(new Error("missing_service_type"), { status: 400 });
  }

  const { data: current, error: currentError } = await supabase
    .from("partner_commission_rules")
    .select("*")
    .eq("service_type", key)
    .eq("status", "active")
    .maybeSingle();

  if (currentError) throw currentError;
  if (!current?.id) {
    throw Object.assign(new Error("rule_not_found"), { status: 404 });
  }

  const nextTierPolicy = tierPolicy || current.tier_policy || TIER_POLICIES.USE_PARTNER_TIER;
  if (!Object.values(TIER_POLICIES).includes(nextTierPolicy)) {
    throw Object.assign(new Error("invalid_tier_policy"), { status: 400 });
  }

  const nextRelease = releasePolicy || current.release_policy;
  if (!ALLOWED_RELEASE_POLICIES.includes(nextRelease)) {
    throw Object.assign(new Error("invalid_release_policy"), { status: 400 });
  }

  let nextPercent = current.commission_percent;
  if (commissionPercent != null) {
    const v = validateCommissionPercent(commissionPercent);
    if (!v.ok) throw Object.assign(new Error(v.code), { status: 400 });
    nextPercent = v.value;
  }

  let nextFixed = current.fixed_amount;
  if (fixedAmount != null) {
    const v = validateFixedAmount(fixedAmount);
    if (!v.ok) throw Object.assign(new Error(v.code), { status: 400 });
    nextFixed = v.value;
  }

  const nextVersion = Number(current.rule_version || 1) + 1;
  const nowIso = new Date().toISOString();

  const { error: supersedeError } = await supabase
    .from("partner_commission_rules")
    .update({
      status: "superseded",
      effective_to: nowIso,
      updated_at: nowIso,
    })
    .eq("id", current.id)
    .eq("status", "active");

  if (supersedeError) throw supersedeError;

  const enabled = isEnabled != null ? Boolean(isEnabled) : Boolean(current.is_enabled ?? current.is_active);

  const { data: created, error: insertError } = await supabase
    .from("partner_commission_rules")
    .insert({
      service_type: key,
      commission_percent: nextPercent,
      commission_mode: current.commission_mode,
      fixed_amount: nextFixed,
      is_active: enabled,
      is_enabled: enabled,
      release_policy: nextRelease,
      notes: current.notes,
      tier_policy: nextTierPolicy,
      display_name_ar:
        current.display_name_ar || SERVICE_COMMISSION_ARABIC_LABELS[key] || key,
      status: "active",
      rule_version: nextVersion,
      effective_from: nowIso,
      created_by: actorUserId || null,
    })
    .select("*")
    .single();

  if (insertError) throw insertError;

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: "update",
    entityType: "partner_commission_rule",
    entityId: created.id,
    beforeState: {
      id: current.id,
      isEnabled: Boolean(current.is_enabled ?? current.is_active),
      tierPolicy: current.tier_policy,
      commissionPercent: current.commission_percent,
      releasePolicy: current.release_policy,
      ruleVersion: current.rule_version,
    },
    afterState: {
      id: created.id,
      isEnabled: enabled,
      tierPolicy: nextTierPolicy,
      commissionPercent: nextPercent,
      releasePolicy: nextRelease,
      ruleVersion: nextVersion,
      effectiveFrom: created.effective_from,
    },
    reason,
  });

  return created;
}
