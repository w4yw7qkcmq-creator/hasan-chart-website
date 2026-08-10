import { roundMoney } from "./money.js";
import { logPartnerCenterEvent } from "./observability.js";

export const QUALIFIED_REFERRAL_REWARD_CODE = "qualified_referral_reward";
export const QUALIFIED_REFERRAL_REWARD_MIN = 0.01;
export const QUALIFIED_REFERRAL_REWARD_MAX = 100;

export function validateQualifiedReferralRewardAmount(raw) {
  if (raw == null || raw === "") {
    return { ok: false, code: "missing_amount", error: "amount_required" };
  }
  const str = String(raw).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    return { ok: false, code: "invalid_format", error: "invalid_amount_format" };
  }
  const amount = roundMoney(str);
  if (!Number.isFinite(amount)) {
    return { ok: false, code: "invalid_amount", error: "invalid_amount" };
  }
  if (amount < QUALIFIED_REFERRAL_REWARD_MIN) {
    return { ok: false, code: "below_min", error: "amount_below_minimum" };
  }
  if (amount > QUALIFIED_REFERRAL_REWARD_MAX) {
    return { ok: false, code: "above_max", error: "amount_above_maximum" };
  }
  return { ok: true, amount };
}

export async function getActiveQualifiedReferralRewardRule(supabase) {
  const { data, error } = await supabase
    .from("partner_qualified_referral_reward_rules")
    .select("*")
    .eq("status", "active")
    .order("rule_version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function getPartnerQualifiedReferralRewardOffer(supabase) {
  const rule = await getActiveQualifiedReferralRewardRule(supabase);
  if (!rule?.is_enabled || Number(rule.amount) <= 0) {
    return {
      active: false,
      amount: null,
      currency: rule?.currency || "USD",
      ruleVersion: rule?.rule_version || null,
    };
  }
  return {
    active: true,
    amount: roundMoney(rule.amount),
    currency: rule.currency || "USD",
    ruleVersion: rule.rule_version,
    effectiveFrom: rule.effective_from,
  };
}

export async function adminGetQualifiedReferralRewardPolicy(supabase) {
  const rule = await getActiveQualifiedReferralRewardRule(supabase);
  const { count: creditedCount } = await supabase
    .from("partner_qualified_referral_reward_credits")
    .select("id", { count: "exact", head: true })
    .eq("status", "credited");

  const { data: paidRows } = await supabase
    .from("partner_qualified_referral_reward_credits")
    .select("amount")
    .eq("status", "credited");

  const totalPaid = roundMoney((paidRows || []).reduce((s, r) => s + Number(r.amount || 0), 0));

  return {
    current: rule
      ? {
          id: rule.id,
          amount: roundMoney(rule.amount),
          currency: rule.currency || "USD",
          isEnabled: Boolean(rule.is_enabled),
          status: rule.status,
          ruleVersion: rule.rule_version,
          effectiveFrom: rule.effective_from,
          updatedAt: rule.updated_at,
          createdAt: rule.created_at,
        }
      : null,
    stats: {
      creditedCount: creditedCount || 0,
      totalPaid,
    },
    constraints: {
      min: QUALIFIED_REFERRAL_REWARD_MIN,
      max: QUALIFIED_REFERRAL_REWARD_MAX,
      currency: "USD",
      step: 0.01,
    },
  };
}

export async function adminUpdateQualifiedReferralRewardPolicy(
  supabase,
  { amount, isEnabled, actorUserId, reason = null }
) {
  const validation = validateQualifiedReferralRewardAmount(amount);
  if (!validation.ok) {
    const err = new Error(validation.error);
    err.code = validation.code;
    throw err;
  }

  const current = await getActiveQualifiedReferralRewardRule(supabase);
  const nextVersion = Number(current?.rule_version || 0) + 1;
  const nowIso = new Date().toISOString();

  if (current?.id) {
    const { error: supersedeError } = await supabase
      .from("partner_qualified_referral_reward_rules")
      .update({
        status: "superseded",
        effective_to: nowIso,
        updated_at: nowIso,
      })
      .eq("id", current.id)
      .eq("status", "active");

    if (supersedeError) throw supersedeError;
  }

  const { data: created, error: insertError } = await supabase
    .from("partner_qualified_referral_reward_rules")
    .insert({
      code: QUALIFIED_REFERRAL_REWARD_CODE,
      amount: validation.amount,
      currency: "USD",
      is_enabled: Boolean(isEnabled),
      status: "active",
      rule_version: nextVersion,
      effective_from: nowIso,
      created_by: actorUserId,
    })
    .select("*")
    .single();

  if (insertError) throw insertError;

  logPartnerCenterEvent("admin.qualified_referral_reward_updated", {
    ruleVersion: created.rule_version,
    amount: created.amount,
    isEnabled: created.is_enabled,
  });

  return { created, previous: current };
}
