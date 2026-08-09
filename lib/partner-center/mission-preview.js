import { validateMissionDefinition } from "./mission-engine.js";
import { isWithinWindow } from "./timezone.js";

/**
 * Client-safe mission preview + warnings (backend remains authority).
 */
export function buildMissionPreview(input = {}, { tiers = [], campaigns = [] } = {}) {
  const validation = validateMissionDefinition(input);
  const warnings = [];

  if (!input.name?.trim()) warnings.push({ code: "missing_name", message: "اسم المهمة مطلوب" });
  if (!input.eligibility_rules?.tier_keys?.length && !input.min_tier_key) {
    warnings.push({ code: "no_eligible_tiers", message: "لم يتم تحديد مستويات مؤهلة" });
  }
  if (input.start_at && input.end_at && new Date(input.end_at) < new Date(input.start_at)) {
    warnings.push({ code: "end_before_start", message: "تاريخ الانتهاء قبل تاريخ البداية" });
  }
  if (Number(input.reward_amount) < 0) {
    warnings.push({ code: "invalid_reward", message: "مبلغ المكافأة غير صالح" });
  }
  if (input.mission_type === "streak_period") {
    warnings.push({ code: "streak_disabled", message: "نوع streak_period غير مدعوم حالياً" });
  }
  if (input.mission_type === "conversion_rate" && Number(input.minimum_sample_size || 0) <= 0) {
    warnings.push({
      code: "missing_min_sample",
      message: "قاعدة conversion_rate تتطلب minimum sample > 0",
    });
  }
  if (input.campaign_program_id) {
    const camp = campaigns.find((c) => c.id === input.campaign_program_id);
    if (!camp || camp.status !== "active") {
      warnings.push({ code: "inactive_campaign", message: "قيد حملة غير نشطة" });
    }
  }

  const tierKeys = input.eligibility_rules?.tier_keys || (input.min_tier_key ? [input.min_tier_key] : []);
  const eligibleTiers = tiers.filter((t) => tierKeys.includes(t.tier_key));

  let expectedState = "draft";
  if (input.status === "active" && isWithinWindow(input.start_at, input.end_at)) {
    expectedState = "active";
  } else if (input.status === "paused") {
    expectedState = "paused";
  } else if (input.status === "ended") {
    expectedState = "ended";
  }

  return {
    ok: validation.ok,
    validationError: validation.ok ? null : validation.error,
    warnings,
    preview: {
      name: input.name,
      target: `${input.target_metric}: ${input.target_value}`,
      reward: `${input.reward_amount} ${input.reward_currency || "USD"}`,
      period: input.period_type || "once",
      eligibility: tierKeys.length ? tierKeys.join(", ") : "الكل",
      eligibleTiers: eligibleTiers.map((t) => t.tier_name || t.tier_key),
      campaignRestriction: input.campaign_program_id || null,
      startAt: input.start_at,
      endAt: input.end_at,
      expectedState,
      ruleVersion: input.rule_version || 1,
    },
  };
}

export function buildCampaignPreview(input = {}, { tiers = [] } = {}) {
  const warnings = [];
  if (!input.name?.trim()) warnings.push({ code: "missing_name", message: "اسم الحملة مطلوب" });
  if (!input.code?.trim()) warnings.push({ code: "missing_code", message: "رمز الحملة مطلوب" });
  if (input.start_at && input.end_at && new Date(input.end_at) < new Date(input.start_at)) {
    warnings.push({ code: "end_before_start", message: "تاريخ الانتهاء قبل البداية" });
  }
  const tierKeys = input.eligibility_rules?.tier_keys || [];
  if (!tierKeys.length) {
    warnings.push({ code: "no_tiers", message: "لم يتم تحديد مستويات مؤهلة" });
  }

  return {
    warnings,
    preview: {
      name: input.name,
      code: input.code,
      landingPath: input.landing_path,
      allowedSources: input.allowed_sources || [],
      allowedMediums: input.allowed_mediums || [],
      eligibleTiers: tiers.filter((t) => tierKeys.includes(t.tier_key)).map((t) => t.tier_name),
      startAt: input.start_at,
      endAt: input.end_at,
      status: input.status || "draft",
      ruleVersion: input.rule_version || 1,
    },
  };
}
