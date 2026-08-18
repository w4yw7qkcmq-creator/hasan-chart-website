import { validateMissionDefinition } from "./mission-engine.js";
import { validateCampaignProgramInput, computeMaximumExposure } from "./campaign-engine.js";
import { assertTransition, normalizeStatus } from "./campaign-lifecycle.js";
import { CAMPAIGN_AUDIT_ACTIONS } from "./phase2-constants.js";
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

const CAMPAIGN_LIFECYCLE_AUDIT_ACTION = Object.freeze({
  schedule: CAMPAIGN_AUDIT_ACTIONS.SCHEDULE,
  activate: CAMPAIGN_AUDIT_ACTIONS.ACTIVATE,
  pause: CAMPAIGN_AUDIT_ACTIONS.PAUSE,
  resume: CAMPAIGN_AUDIT_ACTIONS.RESUME,
  complete: CAMPAIGN_AUDIT_ACTIONS.COMPLETE,
  cancel: CAMPAIGN_AUDIT_ACTIONS.CANCEL,
});

export async function adminTransitionCampaign(
  supabase,
  campaignId,
  action,
  actorUserId,
  { reason, expectedUpdatedAt = null } = {}
) {
  const { data: before } = await supabase
    .from("partner_campaign_programs")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!before?.id) throw new Error("campaign_not_found");

  if (expectedUpdatedAt) {
    const expected = new Date(expectedUpdatedAt).getTime();
    const actual = new Date(before.updated_at).getTime();
    if (expected !== actual) {
      const err = new Error("optimistic_concurrency_conflict");
      err.code = "CONCURRENCY";
      err.details = { expectedUpdatedAt: before.updated_at };
      throw err;
    }
  }

  const transition = assertTransition(before.status, action);
  if (!transition.ok) {
    const err = new Error(transition.error);
    err.code = "INVALID_TRANSITION";
    err.details = transition;
    throw err;
  }

  if (transition.toStatus === "active") {
    assertGrowthEngineForActivation("active");
  }

  const { data, error } = await supabase
    .from("partner_campaign_programs")
    .update({ status: transition.toStatus, updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .eq("updated_at", before.updated_at)
    .select("*")
    .single();
  if (error) {
    if (error.code === "PGRST116") {
      const err = new Error("optimistic_concurrency_conflict");
      err.code = "CONCURRENCY";
      throw err;
    }
    throw error;
  }

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: CAMPAIGN_LIFECYCLE_AUDIT_ACTION[action] || CAMPAIGN_AUDIT_ACTIONS.UPDATE,
    entityType: "campaign_program",
    entityId: campaignId,
    beforeState: { ...before, status: normalizeStatus(before.status) },
    afterState: data,
    reason,
  });
  return data;
}

export async function adminDeleteDraftCampaign(supabase, campaignId, actorUserId, { reason } = {}) {
  const { data: campaign } = await supabase
    .from("partner_campaign_programs")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!campaign?.id) throw new Error("campaign_not_found");
  if (normalizeStatus(campaign.status) !== "draft") {
    throw new Error("only_draft_campaigns_deletable");
  }

  const referenceChecks = await Promise.all([
    supabase
      .from("partner_campaign_participants")
      .select("id", { count: "exact", head: true })
      .eq("campaign_program_id", campaignId),
    supabase
      .from("partner_attribution_sessions")
      .select("id", { count: "exact", head: true })
      .eq("campaign_program_id", campaignId),
    supabase
      .from("partner_referral_attributions")
      .select("id", { count: "exact", head: true })
      .eq("campaign_program_id", campaignId),
    supabase
      .from("partner_mission_definitions")
      .select("id", { count: "exact", head: true })
      .eq("campaign_program_id", campaignId),
    supabase
      .from("partner_smart_links")
      .select("id", { count: "exact", head: true })
      .eq("campaign_program_id", campaignId),
  ]);

  const hasReferences = referenceChecks.some((r) => (r.count || 0) > 0);
  if (hasReferences) {
    throw new Error("campaign_has_references");
  }

  const { error } = await supabase.from("partner_campaign_programs").delete().eq("id", campaignId);
  if (error) throw error;

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: CAMPAIGN_AUDIT_ACTIONS.DELETE,
    entityType: "campaign_program",
    entityId: campaignId,
    beforeState: campaign,
    reason,
  });

  return { deleted: true, campaignId };
}

export async function adminComputeCampaignExposure(campaign, context = {}) {
  return computeMaximumExposure(campaign, context);
}

export async function adminSetCampaignStatus(supabase, campaignId, status, actorUserId, { reason } = {}) {
  const normalized = normalizeStatus(status);
  const actionMap = {
    active: "activate",
    paused: "pause",
    scheduled: "schedule",
    completed: "complete",
    cancelled: "cancel",
  };
  const action = actionMap[normalized];
  if (action) {
    return adminTransitionCampaign(supabase, campaignId, action, actorUserId, { reason });
  }

  const allowed = ["draft", "active", "paused", "scheduled", "completed", "cancelled"];
  if (!allowed.includes(normalized)) throw new Error("invalid_status");

  const { data: before } = await supabase
    .from("partner_campaign_programs")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!before?.id) throw new Error("campaign_not_found");

  const { data, error } = await supabase
    .from("partner_campaign_programs")
    .update({ status: normalized, updated_at: new Date().toISOString() })
    .eq("id", campaignId)
    .select("*")
    .single();
  if (error) throw error;

  await recordPartnerAdminAudit(supabase, {
    actorUserId,
    action: CAMPAIGN_AUDIT_ACTIONS.UPDATE,
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
        "id, partner_id, referred_user_id, amount, status, payout_hold, reward_type, source_type, created_at, updated_at, rule_version",
        { count: "exact" }
      )
      .eq("status", "risk_hold")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from("partner_fraud_assessments")
      .select("id, partner_id, referral_id, risk_level, decision, signals, created_at, updated_at, resolved_at, context_type")
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
  const referredUserIds = [
    ...new Set((heldRewards || []).map((r) => r.referred_user_id).filter(Boolean)),
  ];
  const referralIds = [
    ...new Set((openAssessments || []).map((a) => a.referral_id).filter(Boolean)),
  ];

  const [{ data: partners }, { data: profiles }, { data: referrals }] = await Promise.all([
    partnerIds.length
      ? supabase.from("partners").select("id, user_id, referral_code, tier_key, status").in("id", partnerIds)
      : Promise.resolve({ data: [] }),
    referredUserIds.length
      ? supabase
          .from("profiles")
          .select(
            "id, email, username, user_classification, effective_user_classification, human_verification_status, partner_reward_eligibility_status, partner_reward_risk_level"
          )
          .in("id", referredUserIds)
      : Promise.resolve({ data: [] }),
    referralIds.length
      ? supabase.from("partner_referrals").select("id, partner_id, referred_user_id").in("id", referralIds)
      : Promise.resolve({ data: [] }),
  ]);

  const partnerMap = new Map((partners || []).map((p) => [p.id, p]));
  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
  const referralMap = new Map((referrals || []).map((r) => [r.id, r]));

  const clusterUserIds = referredUserIds.length ? referredUserIds : [];
  let deviceClusterByUser = new Map();
  let networkClusterByUser = new Map();
  if (clusterUserIds.length) {
    const { data: signalRows } = await supabase
      .from("account_risk_signals")
      .select("user_id, signal_type, metadata")
      .in("user_id", clusterUserIds);
    for (const row of signalRows || []) {
      const meta = row.metadata || {};
      const deviceCount = Number(meta.device_cluster_count ?? meta.deviceClusterCount ?? 0);
      const networkCount = Number(meta.network_cluster_count ?? meta.networkClusterCount ?? 0);
      if (deviceCount > 0) deviceClusterByUser.set(row.user_id, Math.max(deviceClusterByUser.get(row.user_id) || 0, deviceCount));
      if (networkCount > 0) networkClusterByUser.set(row.user_id, Math.max(networkClusterByUser.get(row.user_id) || 0, networkCount));
    }
  }

  const rows = (heldRewards || []).map((ent) => {
    const partner = partnerMap.get(ent.partner_id);
    const assessment = (openAssessments || []).find((a) => a.partner_id === ent.partner_id);
    const referredProfile = ent.referred_user_id ? profileMap.get(ent.referred_user_id) : null;
    const referral = assessment?.referral_id ? referralMap.get(assessment.referral_id) : null;
    const userName =
      referredProfile?.username ||
      (referredProfile?.email ? String(referredProfile.email).split("@")[0] : null) ||
      "—";
    const userEmail = referredProfile?.email
      ? `${String(referredProfile.email).slice(0, 3)}***@${String(referredProfile.email).split("@")[1] || ""}`
      : "—";
    return {
      entitlementId: ent.id,
      partnerId: ent.partner_id,
      partnerLabel: partner?.referral_code ? `Partner ${String(partner.referral_code).slice(0, 4)}***` : "Partner",
      partnerReferralCode: partner?.referral_code || null,
      referredUserId: ent.referred_user_id || referral?.referred_user_id || null,
      userName,
      userEmail,
      effectiveClassification:
        referredProfile?.effective_user_classification || referredProfile?.user_classification || null,
      humanVerificationStatus: referredProfile?.human_verification_status || null,
      rewardEligibilityStatus: referredProfile?.partner_reward_eligibility_status || null,
      riskLevel: assessment?.risk_level || referredProfile?.partner_reward_risk_level || "HIGH",
      riskStatus: ent.status,
      heldAmount: Number(ent.amount),
      holdDate: ent.created_at,
      updatedAt: ent.updated_at || assessment?.updated_at || ent.created_at,
      detectedAt: assessment?.created_at || ent.created_at,
      rewardType: ent.reward_type,
      sourceType: ent.source_type,
      ruleVersion: ent.rule_version,
      signals: (assessment?.signals || []).slice(0, 8),
      assessmentId: assessment?.id || null,
      deviceClusterCount: ent.referred_user_id ? deviceClusterByUser.get(ent.referred_user_id) || 0 : 0,
      networkClusterCount: ent.referred_user_id ? networkClusterByUser.get(ent.referred_user_id) || 0 : 0,
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

export async function adminRejectFraudReward(supabase, { entitlementId, reviewerUserId, reason }) {
  if (!reason?.trim()) throw new Error("reason_required");

  const { data: ent } = await supabase
    .from("partner_reward_entitlements")
    .select("*")
    .eq("id", entitlementId)
    .single();
  if (!ent?.id) throw new Error("entitlement_not_found");
  if (ent.status === "reward_credited" || ent.status === "paid") {
    throw new Error("entitlement_already_credited");
  }

  await supabase
    .from("partner_reward_entitlements")
    .update({
      payout_hold: false,
      status: "reversed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", entitlementId);

  await recordPartnerAdminAudit(supabase, {
    actorUserId: reviewerUserId,
    action: "reject_hold",
    entityType: "reward_entitlement",
    entityId: entitlementId,
    reason,
    beforeState: { status: ent.status },
    afterState: { status: "reversed" },
  });

  return { rejected: true, entitlementId };
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

const CAMPAIGN_ACTIONS = Object.freeze({
  schedule: "schedule",
  activate: "activate",
  pause: "pause",
  resume: "resume",
  complete: "complete",
  cancel: "cancel",
  delete_draft: "delete_draft",
});

function assertCampaignOptimisticConcurrency(before, expectedUpdatedAt) {
  if (!expectedUpdatedAt) return;
  const expected = new Date(expectedUpdatedAt).toISOString();
  const actual = new Date(before.updated_at).toISOString();
  if (expected !== actual) {
    const err = new Error("conflict_updated_at");
    err.code = "CONFLICT";
    throw err;
  }
}

export function resolveCampaignDashboardBucket(campaign) {
  const status = normalizeStatus(campaign?.status);
  if (status === "active") return "active";
  if (status === "paused") return "paused";
  if (status === "scheduled") return "scheduled";
  if (status === "completed" || status === "cancelled") return "completed";
  const lifecycle = campaign?.tracking_metadata?.lifecycle;
  if (
    status === "draft" &&
    (lifecycle === "scheduled" || campaign.tracking_metadata?.scheduled === true)
  ) {
    return "scheduled";
  }
  return "draft";
}

export function mapWizardPayloadToCampaignInput(wizard = {}) {
  const audienceMode = wizard.audience_mode || wizard.audienceMode || "all";
  const partnerEligibility =
    audienceMode === "tier_min"
      ? { mode: "tier_min", tier_key: wizard.min_tier_key || wizard.minTierKey || null }
      : audienceMode === "selected_partners"
        ? { mode: "selected_partners", partner_ids: wizard.partner_ids || wizard.partnerIds || [] }
        : { mode: "all" };

  const reward = wizard.reward || {};
  const commissionOverride =
    reward.mode === "fixed_percent" && reward.percent != null
      ? { mode: "fixed_percent", percent: Number(reward.percent), stacking_allowed: Boolean(reward.stacking_allowed) }
      : wizard.commission_override_metadata || {};

  const missions = wizard.missions || [];
  const maxExposure = wizard.max_exposure_usd ?? wizard.maxExposureUsd ?? null;

  return {
    code: wizard.code,
    name: wizard.name_ar || wizard.name || wizard.code,
    description: wizard.description || "",
    landing_path: wizard.landing_path || wizard.landingPath || "/",
    start_at: wizard.start_at || wizard.startAt || null,
    end_at: wizard.end_at || wizard.endAt || null,
    allowed_sources: wizard.allowed_sources || wizard.allowedSources || [],
    allowed_mediums: wizard.allowed_mediums || wizard.allowedMediums || [],
    min_tier_key: audienceMode === "tier_min" ? wizard.min_tier_key || wizard.minTierKey : null,
    partner_eligibility: partnerEligibility,
    commission_override_metadata: commissionOverride,
    creative_metadata: {
      name_ar: wizard.name_ar || wizard.name || "",
      description_ar: wizard.description_ar || wizard.description || "",
    },
    tracking_metadata: {
      missions,
      max_exposure_usd: maxExposure != null ? Number(maxExposure) : null,
      lifecycle: wizard.lifecycle || "draft",
      scheduled: Boolean(wizard.scheduled),
    },
    status: "draft",
  };
}

export async function adminCreateCampaignWithMissions(supabase, wizardInput, actorUserId) {
  const input = mapWizardPayloadToCampaignInput(wizardInput);
  const campaign = await adminCreateCampaign(supabase, input, actorUserId);
  const missions = wizardInput.missions || [];
  const createdMissions = [];

  for (const m of missions) {
    const missionInput = {
      code: m.code || `${campaign.code}_${createdMissions.length + 1}`,
      name: m.name_ar || m.name || m.code,
      description: m.description || "",
      mission_type: m.mission_type || "qualified_referrals_count",
      target_metric: m.target_metric || "qualified_referrals",
      target_value: Number(m.target_value || 1),
      reward_amount: Number(m.reward_amount || 0),
      reward_currency: m.reward_currency || "USD",
      period_type: m.period_type || "once",
      minimum_sample_size: Number(m.minimum_sample_size || 0),
      status: "draft",
      campaign_program_id: campaign.id,
      start_at: input.start_at,
      end_at: input.end_at,
      min_tier_key: input.min_tier_key,
      eligibility_rules: m.eligibility_rules || {},
    };
    const mission = await adminCreateMission(supabase, missionInput, actorUserId);
    createdMissions.push(mission);
  }

  return { campaign, missions: createdMissions };
}

export async function enrichCampaignsForAdmin(supabase, campaigns = []) {
  if (!campaigns.length) return [];

  const ids = campaigns.map((c) => c.id);
  const [{ data: links }, { data: missionDefs }] = await Promise.all([
    supabase.from("partner_smart_links").select("id, partner_id, campaign_program_id").in("campaign_program_id", ids),
    supabase.from("partner_mission_definitions").select("id, campaign_program_id, reward_amount").in("campaign_program_id", ids),
  ]);

  const missionIds = (missionDefs || []).map((m) => m.id);
  let progressRows = [];
  let rewardRows = [];
  if (missionIds.length) {
    const { data: progress } = await supabase
      .from("partner_mission_progress")
      .select("id, mission_id, status, partner_id")
      .in("mission_id", missionIds);
    progressRows = progress || [];
    const progressIds = progressRows.map((p) => p.id);
    if (progressIds.length) {
      const { data: rewards } = await supabase
        .from("partner_reward_entitlements")
        .select("id, source_id, amount, status")
        .eq("source_type", "mission")
        .in("source_id", progressIds);
      rewardRows = rewards || [];
    }
  }

  const linksByCampaign = new Map();
  for (const link of links || []) {
    const bucket = linksByCampaign.get(link.campaign_program_id) || { partners: new Set(), count: 0 };
    bucket.count += 1;
    if (link.partner_id) bucket.partners.add(link.partner_id);
    linksByCampaign.set(link.campaign_program_id, bucket);
  }

  const missionsByCampaign = new Map();
  for (const m of missionDefs || []) {
    const bucket = missionsByCampaign.get(m.campaign_program_id) || [];
    bucket.push(m);
    missionsByCampaign.set(m.campaign_program_id, bucket);
  }

  const progressByMission = new Map();
  for (const p of progressRows) {
    const bucket = progressByMission.get(p.mission_id) || [];
    bucket.push(p);
    progressByMission.set(p.mission_id, bucket);
  }

  const rewardsBySource = new Map((rewardRows || []).map((r) => [r.source_id, r]));

  return campaigns.map((campaign) => {
    const linkMeta = linksByCampaign.get(campaign.id) || { partners: new Set(), count: 0 };
    const campaignMissions = missionsByCampaign.get(campaign.id) || [];
    let missionsCompleted = 0;
    let rewardsPending = 0;
    let rewardsCredited = 0;

    for (const m of campaignMissions) {
      for (const p of progressByMission.get(m.id) || []) {
        if (["completed", "reward_credited", "reward_pending"].includes(p.status)) missionsCompleted += 1;
        const ent = rewardsBySource.get(p.id);
        if (!ent) continue;
        const amt = Number(ent.amount || 0);
        if (["pending", "risk_hold", "earned"].includes(ent.status)) rewardsPending += amt;
        if (["reward_credited", "approved", "payable", "paid"].includes(ent.status)) rewardsCredited += amt;
      }
    }

    const maxExposure = campaign.tracking_metadata?.max_exposure_usd;
    const estimatedMissionCost = campaignMissions.reduce((s, m) => s + Number(m.reward_amount || 0), 0);

    return {
      ...campaign,
      dashboardBucket: resolveCampaignDashboardBucket(campaign),
      displayNameAr: campaign.creative_metadata?.name_ar || campaign.name,
      metrics: {
        participants: linkMeta.partners.size,
        smartLinks: linkMeta.count,
        missionsCount: campaignMissions.length,
        missionsCompleted,
        rewardsPending: roundMoney(rewardsPending),
        rewardsCredited: roundMoney(rewardsCredited),
        estimatedMissionCost: roundMoney(estimatedMissionCost),
        maxExposureUsd: maxExposure != null ? Number(maxExposure) : null,
      },
    };
  });
}

export async function adminCampaignAction(
  supabase,
  campaignId,
  action,
  actorUserId,
  { expected_updated_at, reason, patch = {} } = {}
) {
  if (!CAMPAIGN_ACTIONS[action]) throw new Error("invalid_action");

  const { data: before } = await supabase
    .from("partner_campaign_programs")
    .select("*")
    .eq("id", campaignId)
    .single();
  if (!before?.id) throw new Error("campaign_not_found");
  assertCampaignOptimisticConcurrency(before, expected_updated_at);

  if (action === "delete_draft") {
    if (before.status !== "draft") throw new Error("only_draft_deletable");
    const { error } = await supabase.from("partner_campaign_programs").delete().eq("id", campaignId);
    if (error) throw error;
    await recordPartnerAdminAudit(supabase, {
      actorUserId,
      action: "delete",
      entityType: "campaign_program",
      entityId: campaignId,
      beforeState: before,
      reason,
    });
    return { deleted: true, id: campaignId };
  }

  if (["schedule", "activate", "pause", "resume", "complete", "cancel"].includes(action)) {
    let row = await adminTransitionCampaign(supabase, campaignId, action, actorUserId, {
      reason,
      expectedUpdatedAt: expected_updated_at,
    });

    const patchFields = { ...(patch || {}) };
    delete patchFields.tracking_metadata;
    const tracking = {
      ...(before.tracking_metadata || {}),
      ...(patch.tracking_metadata || {}),
      lifecycle:
        action === "schedule"
          ? "scheduled"
          : action === "activate" || action === "resume"
            ? "active"
            : action === "pause"
              ? "paused"
              : action === "complete"
                ? "completed"
                : action === "cancel"
                  ? "cancelled"
                  : before.tracking_metadata?.lifecycle,
      scheduled: action === "schedule",
      ...(action === "schedule"
        ? { scheduled_at: patch.start_at || before.start_at || new Date().toISOString() }
        : {}),
      ...(action === "cancel" ? { cancelled_at: new Date().toISOString() } : {}),
    };

    const hasPatch =
      Object.keys(patchFields).length > 0 ||
      JSON.stringify(tracking) !== JSON.stringify(before.tracking_metadata || {});

    if (hasPatch) {
      const { data, error } = await supabase
        .from("partner_campaign_programs")
        .update({
          ...patchFields,
          tracking_metadata: tracking,
          updated_at: new Date().toISOString(),
        })
        .eq("id", campaignId)
        .select("*")
        .single();
      if (error) throw error;
      row = data;
    }

    return row;
  }

  throw new Error("invalid_action");
}
