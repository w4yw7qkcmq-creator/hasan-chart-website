import { validateMissionDefinition } from "./mission-engine.js";
import { validateCampaignProgramInput } from "./campaign-engine.js";
import { validateSmartLinkInput } from "./smart-link-service.js";
import { buildMissionPreview, buildCampaignPreview } from "./mission-preview.js";
import { recordPartnerAdminAudit, createMissionDefinition, createCampaignProgram } from "./admin-audit.js";
import {
  adminGetQualifiedReferralRewardPolicy,
  adminUpdateQualifiedReferralRewardPolicy,
} from "./qualified-referral-reward-policy.js";
import { computePartnerMetrics } from "./partner-metrics.js";
import { roundMoney } from "./money.js";
import { releasePartnerPayoutHoldAtomic } from "./financial-gateway.js";
import { assertGrowthEngineForActivation } from "./growth-runtime-gate.js";

export async function getAdminMarketingOverview(supabase, { periodDays = 30 } = {}) {
  const [
    { count: activePartners },
    { count: activeMissions },
    { count: activeCampaigns },
    { data: pendingRewards },
    { data: heldRewards },
  ] = await Promise.all([
    supabase.from("partners").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("partner_mission_definitions").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("partner_campaign_programs").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase
      .from("partner_reward_entitlements")
      .select("amount")
      .in("status", ["earned", "pending", "reward_credited"]),
    supabase.from("partner_reward_entitlements").select("amount").eq("status", "risk_hold"),
  ]);

  const pendingTotal = roundMoney((pendingRewards || []).reduce((s, r) => s + Number(r.amount || 0), 0));
  const heldTotal = roundMoney((heldRewards || []).reduce((s, r) => s + Number(r.amount || 0), 0));

  return {
    activePartners: activePartners || 0,
    activeMissions: activeMissions || 0,
    activeCampaigns: activeCampaigns || 0,
    pendingRewardsTotal: pendingTotal,
    heldRewardsTotal: heldTotal,
    periodDays,
  };
}

export async function adminPreviewMission(input, context = {}) {
  return buildMissionPreview(input, context);
}

export async function adminPreviewCampaign(input, context = {}) {
  return buildCampaignPreview(input, context);
}

export async function adminCreateMissionVersion(supabase, missionId, patch, actorUserId) {
  const { data: before } = await supabase
    .from("partner_mission_definitions")
    .select("*")
    .eq("id", missionId)
    .single();
  if (!before?.id) throw new Error("mission_not_found");

  const nextVersion = Number(before.rule_version || 1) + 1;
  const merged = {
    ...before,
    ...patch,
    id: undefined,
    rule_version: nextVersion,
    status: "draft",
    created_at: undefined,
    updated_at: undefined,
  };
  delete merged.id;
  delete merged.created_at;
  delete merged.updated_at;

  const validation = validateMissionDefinition(merged);
  if (!validation.ok) {
    const err = new Error(validation.error || "invalid_mission");
    err.code = validation.code || "VALIDATION";
    throw err;
  }

  const { data, error } = await supabase
    .from("partner_mission_definitions")
    .insert({ ...merged, created_by: actorUserId })
    .select("*")
    .single();
  if (error) throw error;

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: "create_version",
    entityType: "mission",
    entityId: data.id,
    beforeState: { priorId: missionId, priorVersion: before.rule_version },
    afterState: data,
  });
  return data;
}

export async function adminSetMissionStatus(supabase, missionId, status, actorUserId, { reason } = {}) {
  const allowed = ["draft", "active", "paused", "ended"];
  if (!allowed.includes(status)) throw new Error("invalid_status");

  const { data: before } = await supabase
    .from("partner_mission_definitions")
    .select("*")
    .eq("id", missionId)
    .single();
  if (!before?.id) throw new Error("mission_not_found");

  if (status === "active") {
    assertGrowthEngineForActivation(status);
    const validation = validateMissionDefinition(before);
    if (!validation.ok) {
      const err = new Error(validation.error || "invalid_mission");
      err.code = "VALIDATION";
      throw err;
    }
  }

  const { data, error } = await supabase
    .from("partner_mission_definitions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", missionId)
    .select("*")
    .single();
  if (error) throw error;

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: status === "active" ? "activate" : status === "paused" ? "pause" : "update",
    entityType: "mission",
    entityId: missionId,
    beforeState: before,
    afterState: data,
    reason,
  });
  return data;
}

export async function adminSetCampaignStatus(supabase, campaignId, status, actorUserId, { reason } = {}) {
  const allowed = ["draft", "active", "paused", "ended"];
  if (!allowed.includes(status)) throw new Error("invalid_status");

  const { data: before } = await supabase
    .from("partner_campaign_programs")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!before?.id) throw new Error("campaign_not_found");

  if (status === "active") {
    assertGrowthEngineForActivation(status);
  }

  const { data, error } = await supabase
    .from("partner_campaign_programs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .select("*")
    .single();
  if (error) throw error;

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: status === "active" ? "activate" : status === "paused" ? "pause" : "update",
    entityType: "campaign_program",
    entityId: campaignId,
    beforeState: before,
    afterState: data,
    reason,
  });
  return data;
}

export async function adminCreateCampaignVersion(supabase, campaignId, patch, actorUserId) {
  const { data: before } = await supabase
    .from("partner_campaign_programs")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!before?.id) throw new Error("campaign_not_found");

  const nextVersion = Number(before.rule_version || 1) + 1;
  const merged = { ...before, ...patch, rule_version: nextVersion, status: "draft" };
  delete merged.id;
  delete merged.created_at;
  delete merged.updated_at;

  const validation = validateCampaignProgramInput(merged);
  if (!validation.ok) throw new Error(validation.error || "invalid_campaign");
  merged.landing_path = validation.landing_path;

  const { data, error } = await supabase
    .from("partner_campaign_programs")
    .insert({ ...merged, created_by: actorUserId })
    .select("*")
    .single();
  if (error) throw error;

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: "create_version",
    entityType: "campaign_program",
    entityId: data.id,
    beforeState: { priorId: campaignId, priorVersion: before.rule_version },
    afterState: data,
  });
  return data;
}

export async function adminCreateMission(supabase, input, actorUserId) {
  const validation = validateMissionDefinition(input);
  if (!validation.ok) {
    const err = new Error(validation.error || "invalid_mission");
    err.code = validation.code || "VALIDATION";
    throw err;
  }
  assertGrowthEngineForActivation(input?.status);
  return createMissionDefinition(supabase, input, actorUserId);
}

export async function adminUpdateMission(supabase, missionId, patch, actorUserId) {
  const { data: before } = await supabase
    .from("partner_mission_definitions")
    .select("*")
    .eq("id", missionId)
    .single();
  if (!before?.id) throw new Error("mission_not_found");

  const merged = { ...before, ...patch };
  const validation = validateMissionDefinition(merged);
  if (!validation.ok) {
    const err = new Error(validation.error || "invalid_mission");
    err.code = validation.code || "VALIDATION";
    throw err;
  }

  const nextVersion =
    patch.reward_amount != null && Number(patch.reward_amount) !== Number(before.reward_amount)
      ? Number(before.rule_version || 1) + 1
      : before.rule_version;

  const { data, error } = await supabase
    .from("partner_mission_definitions")
    .update({ ...patch, rule_version: nextVersion, updated_at: new Date().toISOString() })
    .eq("id", missionId)
    .select("*")
    .single();
  if (error) throw error;

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: "update",
    entityType: "mission",
    entityId: missionId,
    beforeState: before,
    afterState: data,
  });
  return data;
}

export async function adminCreateCampaign(supabase, input, actorUserId) {
  const validation = validateCampaignProgramInput(input);
  if (!validation.ok) throw new Error(validation.error || "invalid_campaign");
  return createCampaignProgram(
    supabase,
    { ...input, landing_path: validation.landing_path },
    actorUserId
  );
}

export async function adminUpdateCampaign(supabase, campaignId, patch, actorUserId) {
  const { data: before } = await supabase
    .from("partner_campaign_programs")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!before?.id) throw new Error("campaign_not_found");

  if (patch.landing_path) {
    const validation = validateCampaignProgramInput({ ...before, ...patch });
    if (!validation.ok) throw new Error(validation.error || "invalid_campaign");
    patch.landing_path = validation.landing_path;
  }

  const nextVersion =
    patch.commission_override_metadata &&
    JSON.stringify(patch.commission_override_metadata) !== JSON.stringify(before.commission_override_metadata)
      ? Number(before.rule_version || 1) + 1
      : before.rule_version;

  const { data, error } = await supabase
    .from("partner_campaign_programs")
    .update({ ...patch, rule_version: nextVersion, updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .select("*")
    .single();
  if (error) throw error;

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: "update",
    entityType: "campaign_program",
    entityId: campaignId,
    beforeState: before,
    afterState: data,
  });
  return data;
}

export async function adminCreateMilestone(supabase, input, actorUserId) {
  const { data, error } = await supabase
    .from("partner_milestone_definitions")
    .insert({ ...input, created_by: actorUserId })
    .select("*")
    .single();
  if (error) throw error;
  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: "create",
    entityType: "milestone",
    entityId: data.id,
    afterState: data,
  });
  return data;
}

export async function adminCreatePerformanceBonusRule(supabase, input, actorUserId) {
  const { data, error } = await supabase
    .from("partner_performance_bonus_rules")
    .insert({ ...input, created_by: actorUserId })
    .select("*")
    .single();
  if (error) throw error;
  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: "create",
    entityType: "performance_bonus_rule",
    entityId: data.id,
    afterState: data,
  });
  return data;
}

export async function adminListRewards(supabase, { status, limit = 50, offset = 0 } = {}) {
  let q = supabase
    .from("partner_reward_entitlements")
    .select("id, partner_id, reward_type, source_type, source_id, amount, status, payout_hold, created_at, rule_version", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) q = q.eq("status", status);
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data || [], total: count || 0, limit, offset };
}

export async function adminListAuditLog(supabase, { limit = 50, offset = 0 } = {}) {
  const { data, error, count } = await supabase
    .from("partner_admin_audit_log")
    .select("id, actor_user_id, action, entity_type, entity_id, before_state, after_state, reason, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { rows: data || [], total: count || 0, limit, offset };
}

export async function adminReleaseGrowthRewardHold(supabase, { entitlementId, reviewerUserId, note }) {
  const { data: ent } = await supabase
    .from("partner_reward_entitlements")
    .select("*")
    .eq("id", entitlementId)
    .single();
  if (!ent?.id) throw new Error("entitlement_not_found");

  if (ent.commission_id) {
    return releasePartnerPayoutHoldAtomic(supabase, {
      commissionId: ent.commission_id,
      reviewerUserId,
      note,
    });
  }

  await supabase
    .from("partner_reward_entitlements")
    .update({ payout_hold: false, status: "reward_credited", updated_at: new Date().toISOString() })
    .eq("id", entitlementId);

  await recordPartnerAdminAudit(supabase, {
    actorUserId: reviewerUserId,
    action: "release_hold",
    entityType: "reward_entitlement",
    entityId: entitlementId,
    reason: note,
    afterState: { status: "reward_credited" },
  });

  return { released: true, entitlementId };
}

export async function getAdminPartnerAnalytics(supabase, { partnerId = null } = {}) {
  if (partnerId) {
    const metrics = await computePartnerMetrics(supabase, partnerId);
    return { partnerId, metrics };
  }

  const { data: partners } = await supabase.from("partners").select("id").eq("status", "active").limit(100);
  let totalRevenue = 0;
  let totalRewards = 0;
  for (const p of partners || []) {
    const m = await computePartnerMetrics(supabase, p.id);
    totalRevenue += m.confirmedRevenue;
  }
  const { data: rewards } = await supabase
    .from("partner_reward_entitlements")
    .select("amount")
    .neq("status", "reversed");
  totalRewards = roundMoney((rewards || []).reduce((s, r) => s + Number(r.amount || 0), 0));

  return {
    partnerCount: (partners || []).length,
    aggregateRevenue: roundMoney(totalRevenue),
    aggregateRewardCost: totalRewards,
    roiNote: "Partner-generated confirmed revenue vs reward/commission cost (not full profit)",
  };
}

export async function adminUpdateTierDefinition(supabase, tierKey, patch, actorUserId) {
  const { data: before } = await supabase.from("partner_tiers").select("*").eq("tier_key", tierKey).single();
  if (!before?.tier_key) throw new Error("tier_not_found");

  const nextVersion = Number(before.rule_version || 1) + 1;
  const { data, error } = await supabase
    .from("partner_tiers")
    .update({ ...patch, rule_version: nextVersion, updated_at: new Date().toISOString() })
    .eq("tier_key", tierKey)
    .select("*")
    .single();
  if (error) throw error;

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: "update",
    entityType: "tier",
    entityId: tierKey,
    beforeState: before,
    afterState: data,
  });
  return data;
}

export async function adminListFraudReviewQueue(supabase, { limit = 50, offset = 0 } = {}) {
  const [{ data: heldRewards, count: heldCount }, { data: openAssessments }] = await Promise.all([
    supabase
      .from("partner_reward_entitlements")
      .select(
        "id, partner_id, amount, status, payout_hold, reward_type, source_type, created_at, rule_version",
        { count: "exact" }
      )
      .eq("status", "risk_hold")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("partner_fraud_assessments")
      .select("id, partner_id, risk_level, decision, signals, created_at, resolved_at, context_type")
      .is("resolved_at", null)
      .in("risk_level", ["HIGH", "BLOCKED"])
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const partnerIds = [
    ...new Set([
      ...(heldRewards || []).map((r) => r.partner_id),
      ...(openAssessments || []).map((a) => a.partner_id),
    ]),
  ];

  const { data: partners } = partnerIds.length
    ? await supabase.from("partners").select("id, referral_code, tier_key, status").in("id", partnerIds)
    : { data: [] };

  const partnerMap = new Map((partners || []).map((p) => [p.id, p]));

  const rows = (heldRewards || []).map((ent) => {
    const partner = partnerMap.get(ent.partner_id);
    const assessment = (openAssessments || []).find((a) => a.partner_id === ent.partner_id);
    return {
      entitlementId: ent.id,
      partnerId: ent.partner_id,
      partnerLabel: partner?.referral_code ? `Partner ${String(partner.referral_code).slice(0, 4)}***` : "Partner",
      riskLevel: assessment?.risk_level || "HIGH",
      riskStatus: ent.status,
      heldAmount: Number(ent.amount),
      holdDate: ent.created_at,
      rewardType: ent.reward_type,
      ruleVersion: ent.rule_version,
      signals: (assessment?.signals || []).slice(0, 5),
      assessmentId: assessment?.id || null,
    };
  });

  return { rows, total: heldCount || rows.length, limit, offset };
}

export async function adminKeepFraudHold(supabase, { entitlementId, reviewerUserId, reason }) {
  if (!reason?.trim()) throw new Error("reason_required");

  await recordPartnerAdminAudit(supabase, {
    actorUserId: reviewerUserId,
    action: "keep_hold",
    entityType: "reward_entitlement",
    entityId: entitlementId,
    reason,
    afterState: { status: "risk_hold" },
  });

  return { kept: true, entitlementId };
}

export async function adminUpdateMilestone(supabase, milestoneId, patch, actorUserId) {
  const { data: before } = await supabase
    .from("partner_milestone_definitions")
    .select("*")
    .eq("id", milestoneId)
    .single();
  if (!before?.id) throw new Error("milestone_not_found");
  if (before.status === "active" && patch.reward_amount != null) {
    throw new Error("active_milestone_immutable_use_new_version");
  }

  const nextVersion =
    patch.threshold_value != null && Number(patch.threshold_value) !== Number(before.threshold_value)
      ? Number(before.rule_version || 1) + 1
      : before.rule_version;

  const { data, error } = await supabase
    .from("partner_milestone_definitions")
    .update({ ...patch, rule_version: nextVersion, updated_at: new Date().toISOString() })
    .eq("id", milestoneId)
    .select("*")
    .single();
  if (error) throw error;

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: "update",
    entityType: "milestone",
    entityId: milestoneId,
    beforeState: before,
    afterState: data,
  });
  return data;
}

export async function adminSetMilestoneStatus(supabase, milestoneId, status, actorUserId) {
  const { data: before } = await supabase
    .from("partner_milestone_definitions")
    .select("*")
    .eq("id", milestoneId)
    .single();
  if (!before?.id) throw new Error("milestone_not_found");

  const { data, error } = await supabase
    .from("partner_milestone_definitions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", milestoneId)
    .select("*")
    .single();
  if (error) throw error;

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: status === "active" ? "activate" : "update",
    entityType: "milestone",
    entityId: milestoneId,
    beforeState: before,
    afterState: data,
  });
  return data;
}

export async function adminUpdatePerformanceBonusRule(supabase, ruleId, patch, actorUserId) {
  const { data: before } = await supabase
    .from("partner_performance_bonus_rules")
    .select("*")
    .eq("id", ruleId)
    .single();
  if (!before?.id) throw new Error("bonus_rule_not_found");

  if (Number(patch.minimum_sample_size || before.minimum_sample_size) <= 0 && (patch.metric || before.metric) === "conversion_rate") {
    throw new Error("minimum_sample_required");
  }

  const nextVersion = Number(before.rule_version || 1) + 1;
  const { data, error } = await supabase
    .from("partner_performance_bonus_rules")
    .update({ ...patch, rule_version: nextVersion, updated_at: new Date().toISOString() })
    .eq("id", ruleId)
    .select("*")
    .single();
  if (error) throw error;

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: "update",
    entityType: "performance_bonus_rule",
    entityId: ruleId,
    beforeState: before,
    afterState: data,
  });
  return data;
}

export async function adminListTiers(supabase) {
  const { data, error } = await supabase
    .from("partner_tiers")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function adminListMilestones(supabase) {
  const { data, error } = await supabase
    .from("partner_milestone_definitions")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function adminListPerformanceBonusRules(supabase) {
  const { data, error } = await supabase
    .from("partner_performance_bonus_rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export {
  adminGetQualifiedReferralRewardPolicy,
  adminUpdateQualifiedReferralRewardPolicy,
} from "./qualified-referral-reward-policy.js";

export async function adminSaveQualifiedReferralRewardPolicy(
  supabase,
  { amount, isEnabled, actorUserId, reason = null }
) {
  const before = await adminGetQualifiedReferralRewardPolicy(supabase);
  const { created, previous } = await adminUpdateQualifiedReferralRewardPolicy(supabase, {
    amount,
    isEnabled,
    actorUserId,
    reason,
  });

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: "update",
    entityType: "qualified_referral_reward_rule",
    entityId: created.id,
    beforeState: {
      amount: previous?.amount ?? before.current?.amount ?? null,
      isEnabled: previous?.is_enabled ?? before.current?.isEnabled ?? false,
      ruleVersion: previous?.rule_version ?? before.current?.ruleVersion ?? null,
    },
    afterState: {
      amount: created.amount,
      isEnabled: created.is_enabled,
      ruleVersion: created.rule_version,
      effectiveFrom: created.effective_from,
    },
    reason,
  });

  return created;
}
