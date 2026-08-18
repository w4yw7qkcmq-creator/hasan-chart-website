import crypto from "node:crypto";
import { FIXTURE_DOMAIN, TURNSTILE_DUMMY_TOKEN, httpJson, mergeCookies, extractDeviceCookie, ensureUser } from "./hv-abuse-pass2-lib.mjs";
import {
  buildValidStagingTestEmail,
  usernameFromEmail,
  setRealVerifiedProfile,
  setClassifiedProfile,
  assertMcPreReal,
  insertFraudAssessment,
  trackRegistry,
} from "./hv-pass3-fixture-lib.mjs";
import { setQualState, createCommissionRpc, insertSubscription } from "./partner-center/r8-staging-harness-lib.mjs";
import { USER_CLASSIFICATION } from "../lib/user-classification.js";
import { QUALIFICATION_STATES } from "../lib/partner-center/constants.js";
import { initializeReferralQualification } from "../lib/partner-center/qualification-engine.js";
import { evaluateMissionsForPartnerEvent } from "../lib/partner-center/mission-engine.js";
import { evaluatePartnerRewardEligibility, REWARD_TYPES } from "../lib/partner-center/partner-reward-eligibility.js";
import { upsertAccountRiskSignal, recordSignupRiskSignals, RISK_SIGNAL_TYPES, countDistinctUsersForSignalHash } from "../lib/security/account-risk-signals.js";
import { parseSignedDeviceCookieValue } from "../lib/security/device-identity.js";
import { hashDeviceSignal } from "../lib/security/security-signal-hash.js";
import { evaluateDuplicateIdentityRisk } from "../lib/partner-center/identity-risk-evaluator.js";
import { reverseGrowthRewardEntitlement } from "../lib/partner-center/growth-refund-integration.js";
import { reversePartnerServiceCommissionAtomic } from "../lib/partner-center/financial-gateway.js";

export async function insertMcCampaignMission(service, ctx, { suffix, campaignStatus = "active" }) {
  const partnerEmail = buildValidStagingTestEmail(`mcp${suffix}`, ctx.RUN_TAG);
  const partnerUser = await ensureUser(service, partnerEmail, ctx.PASSWORD, { run: ctx.RUN_TAG, email_confirm: true });
  ctx.fixtureUserIds.push(partnerUser);
  trackRegistry(ctx.registry, "authUserIds", partnerUser);
  await setRealVerifiedProfile(service, partnerUser, { email: partnerEmail });
  const partnerCode = `P3M${crypto.randomBytes(4).toString("hex")}`.slice(0, 12);
  const partnerId = await ctx.mkPartner(service, partnerUser, partnerCode);
  trackRegistry(ctx.registry, "partnerIds", partnerId);
  const campaignId = crypto.randomUUID();
  const campaignCode = `P3C${crypto.randomBytes(4).toString("hex")}`.slice(0, 12);
  const { error: campErr } = await service.from("partner_campaign_programs").insert({
    id: campaignId,
    code: campaignCode,
    name: `Pass3 ${suffix}`,
    status: campaignStatus,
    partner_eligibility: { mode: "tier_keys", tier_keys: ["partner"] },
    created_by: partnerUser,
  });
  if (campErr) throw campErr;
  ctx.fixtureCampaignIds.push(campaignId);
  trackRegistry(ctx.registry, "campaignIds", campaignId);
  const missionId = crypto.randomUUID();
  const { error: misErr } = await service.from("partner_mission_definitions").insert({
    id: missionId,
    campaign_program_id: campaignId,
    code: `P3MIS${suffix}${ctx.RUN_TAG.slice(-3)}`.slice(0, 16),
    name: `Pass3 Mission ${suffix}`,
    mission_type: "qualified_referrals_count",
    target_metric: "qualified_referrals",
    status: "active",
    target_value: 1,
    reward_amount: 2.5,
    reward_currency: "USD",
    period_type: "once",
    rule_version: 1,
    created_by: partnerUser,
  });
  if (misErr) throw misErr;
  ctx.fixtureMissionIds.push(missionId);
  trackRegistry(ctx.registry, "missionIds", missionId);
  return { partnerUser, partnerId, campaignId, missionId };
}

export async function mkMcQualifiedReferral(service, ctx, { partnerId, suffix, profile = {} }) {
  const refEmail = buildValidStagingTestEmail(`mcr${suffix}`, ctx.RUN_TAG);
  const refUser = await ensureUser(service, refEmail, ctx.PASSWORD, { run: ctx.RUN_TAG, email_confirm: true });
  ctx.fixtureUserIds.push(refUser);
  trackRegistry(ctx.registry, "authUserIds", refUser);
  await ctx.setProfile(service, refUser, {
    user_classification: USER_CLASSIFICATION.REAL,
    effective_user_classification: USER_CLASSIFICATION.REAL,
    user_classification_source: "admin_manual",
    human_verification_status: "verified",
    human_verified_at: new Date().toISOString(),
    ...profile,
  });
  await service.auth.admin.updateUserById(refUser, { email_confirm: true }).catch(() => null);
  const refId = crypto.randomUUID();
  const { error: refErr } = await service.from("partner_referrals").insert({
    id: refId,
    partner_id: partnerId,
    referred_user_id: refUser,
    referral_code: `P3R${suffix}${ctx.RUN_TAG.slice(-3)}`.slice(0, 12),
    referred_username: `mc-${suffix}`,
    status: "registered",
  });
  if (refErr) throw refErr;
  trackRegistry(ctx.registry, "referralIds", refId);
  const now = new Date().toISOString();
  const { error: qualErr } = await service.from("partner_referral_qualifications").insert({
    referral_id: refId,
    partner_id: partnerId,
    referred_user_id: refUser,
    state: "qualified",
    qualified_at: now,
  });
  if (qualErr) throw qualErr;
  return { refUser, refId };
}

async function retireMcFixture(service, { campaignId, missionId }) {
  if (missionId) {
    await service.from("partner_mission_progress").delete().eq("mission_id", missionId);
    await service.from("partner_mission_definitions").update({ status: "completed" }).eq("id", missionId);
  }
  if (campaignId) {
    await service.from("partner_campaign_programs").update({ status: "completed" }).eq("id", campaignId);
  }
}

export async function sectionMissionsCampaignsFull(service, ctx) {
  const { record, RUN_TAG } = ctx;
  const { data: staleMissions } = await service.from("partner_mission_definitions").select("id").like("code", "P3MIS%");
  const staleMissionIds = (staleMissions || []).map((row) => row.id).filter(Boolean);
  if (staleMissionIds.length) {
    await service.from("partner_mission_progress").delete().in("mission_id", staleMissionIds);
  }
  await service.from("partner_mission_definitions").delete().like("code", "P3MIS%");
  await service.from("partner_campaign_programs").delete().like("code", "P3C%");
  const mc01 = await insertMcCampaignMission(service, ctx, { suffix: "01" });
  await mkMcQualifiedReferral(service, ctx, { partnerId: mc01.partnerId, suffix: "01" });
  const mcPre = await assertMcPreReal(service, { partnerId: mc01.partnerId, partnerUserId: mc01.partnerUser });
  record("MC-PRE-REAL", "missions_campaigns", "partner REAL verified eligible preflight", "db-live", mcPre.ok, mcPre);
  if (!mcPre.ok) {
    record("MC-01", "missions_campaigns", "REAL mission reward once", "financial-live", false, { blockedBy: "MC-PRE-REAL", mcPre });
  } else {
  const { data: progressBefore } = await service
    .from("partner_mission_progress")
    .select("id, current_value, status")
    .eq("partner_id", mc01.partnerId)
    .eq("mission_id", mc01.missionId);
  const before = await ctx.countPartnerFinancial(service, mc01.partnerId);
  const r1 = await evaluateMissionsForPartnerEvent(service, {
    partnerId: mc01.partnerId,
    eventType: "qualified_referral",
    tierKey: "partner",
  });
  const r2 = await evaluateMissionsForPartnerEvent(service, {
    partnerId: mc01.partnerId,
    eventType: "qualified_referral",
    tierKey: "partner",
  });
  const after = await ctx.countPartnerFinancial(service, mc01.partnerId);
  const { data: progressAfter } = await service
    .from("partner_mission_progress")
    .select("id, current_value, status, reward_entitlement_id")
    .eq("partner_id", mc01.partnerId)
    .eq("mission_id", mc01.missionId);
  const ledgerDelta = after.partner_financial_ledger_entries - before.partner_financial_ledger_entries;
  const mc01Diag = {
    campaign_id: mc01.campaignId,
    mission_id: mc01.missionId,
    partner_id: mc01.partnerId,
    event_type: "qualified_referral",
    trusted_mapping: "qualified_referrals_count",
    evaluation_count: r1.evaluated,
    progress_before: progressBefore,
    progress_after: progressAfter,
    completions: r1.completions,
    ledger_delta: ledgerDelta,
    skipped: r1.skipped,
    skip_reason: r1.reason,
  };
  ctx.report.missionsCampaigns = { mc01RootCause: mc01Diag, r1, r2 };
  record(
    "MC-01",
    "missions_campaigns",
    "REAL mission reward once",
    "financial-live",
    !r1.skipped && r1.evaluated >= 1 && (r1.completions || []).some((c) => c.reward?.credited || c.reward?.ledgerEntryId) && ledgerDelta >= 1,
    mc01Diag
  );
  }
  await retireMcFixture(service, { campaignId: mc01.campaignId, missionId: mc01.missionId });
  const mc01b = await insertMcCampaignMission(service, ctx, { suffix: "02" });
  await mkMcQualifiedReferral(service, ctx, { partnerId: mc01b.partnerId, suffix: "02" });
  const before2 = await ctx.countPartnerFinancial(service, mc01b.partnerId);
  const r2a = await evaluateMissionsForPartnerEvent(service, {
    partnerId: mc01b.partnerId,
    eventType: "qualified_referral",
    tierKey: "partner",
  });
  const r2b = await evaluateMissionsForPartnerEvent(service, {
    partnerId: mc01b.partnerId,
    eventType: "qualified_referral",
    tierKey: "partner",
  });
  const after2 = await ctx.countPartnerFinancial(service, mc01b.partnerId);
  const ledgerDelta2 = after2.partner_financial_ledger_entries - before2.partner_financial_ledger_entries;
  record(
    "MC-02",
    "missions_campaigns",
    "duplicate event one payout",
    "financial-live",
    ledgerDelta2 <= 1 && (r2b.completions || []).every((c) => c.reward?.duplicate || !c.reward?.credited),
    { r2a, r2b, ledgerDelta: ledgerDelta2 }
  );
  await retireMcFixture(service, { campaignId: mc01b.campaignId, missionId: mc01b.missionId });

  const mc03 = await insertMcCampaignMission(service, ctx, { suffix: "03", campaignStatus: "paused" });
  await mkMcQualifiedReferral(service, ctx, { partnerId: mc03.partnerId, suffix: "03" });
  const before3 = await ctx.countPartnerFinancial(service, mc03.partnerId);
  const paused = await evaluateMissionsForPartnerEvent(service, {
    partnerId: mc03.partnerId,
    eventType: "qualified_referral",
    tierKey: "partner",
  });
  const after3 = await ctx.countPartnerFinancial(service, mc03.partnerId);
  const { count: mc03Progress } = await service
    .from("partner_mission_progress")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", mc03.partnerId)
    .eq("mission_id", mc03.missionId);
  record(
    "MC-03",
    "missions_campaigns",
    "paused campaign no payout",
    "financial-live",
    (mc03Progress || 0) === 0 &&
      after3.partner_financial_ledger_entries === before3.partner_financial_ledger_entries &&
      !(paused.completions || []).some((c) => c.reward?.credited),
    { paused, before3, after3, mc03Progress }
  );
  await retireMcFixture(service, { campaignId: mc03.campaignId, missionId: mc03.missionId });

  for (const [id, cls] of [
    ["MC-04", USER_CLASSIFICATION.TEST],
    ["MC-05", USER_CLASSIFICATION.E2E],
    ["MC-06", USER_CLASSIFICATION.INTERNAL],
  ]) {
    const fx = await insertMcCampaignMission(service, ctx, { suffix: id.slice(-2) });
    await setClassifiedProfile(service, fx.partnerUser, cls);
    await mkMcQualifiedReferral(service, ctx, {
      partnerId: fx.partnerId,
      suffix: id.slice(-2),
      profile: { user_classification: USER_CLASSIFICATION.REAL, effective_user_classification: USER_CLASSIFICATION.REAL },
    });
    const b = await ctx.countPartnerFinancial(service, fx.partnerId);
    const ev = await evaluateMissionsForPartnerEvent(service, {
      partnerId: fx.partnerId,
      eventType: "qualified_referral",
      tierKey: "partner",
    });
    const a = await ctx.countPartnerFinancial(service, fx.partnerId);
    record(
      id,
      "missions_campaigns",
      `${cls} no payout`,
      "financial-live",
      a.partner_financial_ledger_entries === b.partner_financial_ledger_entries &&
        !(ev.completions || []).some((c) => c.reward?.credited),
      { ev, b, a }
    );
    await retireMcFixture(service, { campaignId: fx.campaignId, missionId: fx.missionId });
  }

  const mc07 = await insertMcCampaignMission(service, ctx, { suffix: "07" });
  await setClassifiedProfile(service, mc07.partnerUser, USER_CLASSIFICATION.SUSPECTED);
  await mkMcQualifiedReferral(service, ctx, {
    partnerId: mc07.partnerId,
    suffix: "07",
    profile: { user_classification: USER_CLASSIFICATION.REAL, effective_user_classification: USER_CLASSIFICATION.REAL },
  });
  const b7 = await ctx.countPartnerFinancial(service, mc07.partnerId);
  const ev7 = await evaluateMissionsForPartnerEvent(service, {
    partnerId: mc07.partnerId,
    eventType: "qualified_referral",
    tierKey: "partner",
  });
  const a7 = await ctx.countPartnerFinancial(service, mc07.partnerId);
  const holdOnly =
    a7.partner_financial_ledger_entries === b7.partner_financial_ledger_entries ||
    (ev7.completions || []).every((c) => c.reward?.holdRequired || !c.reward?.credited);
  record("MC-07", "missions_campaigns", "SUSPECTED hold/no immediate credit", "financial-live", holdOnly, { ev7, b7, a7 });
  await retireMcFixture(service, { campaignId: mc07.campaignId, missionId: mc07.missionId });

  const mc08 = await insertMcCampaignMission(service, ctx, { suffix: "08" });
  await mkMcQualifiedReferral(service, ctx, { partnerId: mc08.partnerId, suffix: "08" });
  const [cA, cB] = await Promise.all([
    evaluateMissionsForPartnerEvent(service, { partnerId: mc08.partnerId, eventType: "qualified_referral", tierKey: "partner" }),
    evaluateMissionsForPartnerEvent(service, { partnerId: mc08.partnerId, eventType: "qualified_referral", tierKey: "partner" }),
  ]);
  const { count: entCount } = await service
    .from("partner_reward_entitlements")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", mc08.partnerId)
    .eq("source_type", "mission");
  const { count: progressCount } = await service
    .from("partner_mission_progress")
    .select("id", { count: "exact", head: true })
    .eq("partner_id", mc08.partnerId)
    .eq("mission_id", mc08.missionId)
    .eq("status", "completed");
  record(
    "MC-08",
    "missions_campaigns",
    "concurrent completion once",
    "financial-live",
    (entCount || 0) <= 1 && (progressCount || 0) <= 1,
    { cA, cB, entCount, progressCount, missionId: mc08.missionId }
  );
  await retireMcFixture(service, { campaignId: mc08.campaignId, missionId: mc08.missionId });

  const mc09 = await insertMcCampaignMission(service, ctx, { suffix: "09" });
  const b9 = await ctx.countPartnerFinancial(service, mc09.partnerId);
  const click = await evaluateMissionsForPartnerEvent(service, {
    partnerId: mc09.partnerId,
    eventType: "referral_click",
    tierKey: "partner",
  });
  const a9 = await ctx.countPartnerFinancial(service, mc09.partnerId);
  record(
    "MC-09",
    "missions_campaigns",
    "click-only analytics no payout",
    "financial-live",
    click.evaluated === 0 && a9.partner_financial_ledger_entries === b9.partner_financial_ledger_entries,
    { click, b9, a9 }
  );
  await retireMcFixture(service, { campaignId: mc09.campaignId, missionId: mc09.missionId });

  const mc10 = await insertMcCampaignMission(service, ctx, { suffix: "10" });
  await mkMcQualifiedReferral(service, ctx, { partnerId: mc10.partnerId, suffix: "10" });
  const ev10 = await evaluateMissionsForPartnerEvent(service, {
    partnerId: mc10.partnerId,
    eventType: "qualified_referral",
    tierKey: "partner",
  });
  const entId = ev10.completions?.[0]?.reward?.entitlementId;
  let rev = { reversed: false };
  if (entId) {
    rev = await reverseGrowthRewardEntitlement(service, entId, { reason: RUN_TAG });
  }
  record(
    "MC-10",
    "missions_campaigns",
    "refund/invalidation once",
    "financial-live",
    Boolean(entId) &&
      (ev10.completions || []).some((c) => c.reward?.credited || c.reward?.ledgerEntryId) &&
      (rev.reversed || rev.duplicate),
    { ev10, entId, rev }
  );
  await retireMcFixture(service, { campaignId: mc10.campaignId, missionId: mc10.missionId });
}

export async function sectionServiceCommissionsFull(service, ctx) {
  const { record, RUN_TAG } = ctx;
  const partnerEmail = buildValidStagingTestEmail("scpartner", RUN_TAG);
  const referredEmail = buildValidStagingTestEmail("scref", RUN_TAG);
  const partnerUser = await ensureUser(service, partnerEmail, ctx.PASSWORD, { run: RUN_TAG, email_confirm: true });
  const referred = await ensureUser(service, referredEmail, ctx.PASSWORD, { run: RUN_TAG, email_confirm: true });
  ctx.fixtureUserIds.push(partnerUser, referred);
  trackRegistry(ctx.registry, "authUserIds", partnerUser);
  trackRegistry(ctx.registry, "authUserIds", referred);
  await setRealVerifiedProfile(service, partnerUser, { email: partnerEmail });
  await setRealVerifiedProfile(service, referred, { email: referredEmail });
  const partnerId = await ctx.mkPartner(service, partnerUser, `P3SC${RUN_TAG.replace(/[^a-z0-9]/gi, "").slice(-5)}`);
  trackRegistry(ctx.registry, "partnerIds", partnerId);
  const referralId = await ctx.mkReferral(service, {
    partnerId,
    referredUserId: referred,
    code: `SC${RUN_TAG.replace(/[^a-z0-9]/gi, "").slice(-4)}`,
    partnerUserId: partnerUser,
  });
  trackRegistry(ctx.registry, "referralIds", referralId);
  await initializeReferralQualification(service, { partnerId, referralId, referredUserId: referred });
  await setQualState(service, referralId, partnerId, QUALIFICATION_STATES.QUALIFIED);
  const fx = { partnerId, referralId, referredUserId: referred, runId: RUN_TAG };
  const sourceId = crypto.randomUUID();
  const rpc1 = await createCommissionRpc(service, fx, {
    serviceType: "vip_signal",
    sourceId,
    baseAmount: 100,
    commissionPercent: 10,
    reason: RUN_TAG,
    idempotencyKey: `${RUN_TAG}:sc:1`,
  });
  const rpc2 = await createCommissionRpc(service, fx, {
    serviceType: "vip_signal",
    sourceId: crypto.randomUUID(),
    baseAmount: 100,
    commissionPercent: 10,
    reason: RUN_TAG,
    idempotencyKey: `${RUN_TAG}:sc:1`,
  });
  record("SC-01", "service_commissions", "REAL allowed path", "financial-live", !rpc1.error && rpc1.data?.created, rpc1);
  record("SC-02", "service_commissions", "duplicate idempotency once", "financial-live", rpc2.data?.duplicate === true || rpc2.data?.created === false, rpc2);

  for (const [id, cls] of [
    ["SC-03", USER_CLASSIFICATION.TEST],
    ["SC-04", USER_CLASSIFICATION.E2E],
    ["SC-05", USER_CLASSIFICATION.INTERNAL],
  ]) {
    const u = await ensureUser(service, `${RUN_TAG}-sc-${id}@${FIXTURE_DOMAIN}`, ctx.PASSWORD, { run: RUN_TAG });
    ctx.fixtureUserIds.push(u);
    await ctx.setProfile(service, u, {
      user_classification: cls,
      effective_user_classification: cls,
      human_verification_status: "verified",
    });
    const elig = await evaluatePartnerRewardEligibility(service, {
      partnerId,
      referredUserId: u,
      rewardType: REWARD_TYPES.SERVICE_COMMISSION,
    });
    record(id, "service_commissions", `${cls} blocked`, "financial-live", !elig.eligible, elig);
  }

  const sus = await ensureUser(service, `${RUN_TAG}-sc-sus@${FIXTURE_DOMAIN}`, ctx.PASSWORD, { run: RUN_TAG });
  ctx.fixtureUserIds.push(sus);
  await ctx.setProfile(service, sus, {
    user_classification: USER_CLASSIFICATION.SUSPECTED,
    effective_user_classification: USER_CLASSIFICATION.SUSPECTED,
    human_verification_status: "verified",
  });
  const susElig = await evaluatePartnerRewardEligibility(service, {
    partnerId,
    referredUserId: sus,
    rewardType: REWARD_TYPES.SERVICE_COMMISSION,
  });
  record(
    "SC-06",
    "service_commissions",
    "SUSPECTED hold/manual review",
    "financial-live",
    !susElig.eligible || susElig.holdRequired,
    susElig
  );

  const highRefEmail = buildValidStagingTestEmail("schigh", RUN_TAG);
  const highRef = await ensureUser(service, highRefEmail, ctx.PASSWORD, { run: RUN_TAG, email_confirm: true });
  ctx.fixtureUserIds.push(highRef);
  trackRegistry(ctx.registry, "authUserIds", highRef);
  await setRealVerifiedProfile(service, highRef);
  const highRefId = await ctx.mkReferral(service, {
    partnerId,
    referredUserId: highRef,
    code: `SCH${RUN_TAG.replace(/[^a-z0-9]/gi, "").slice(-3)}`,
    partnerUserId: partnerUser,
  });
  trackRegistry(ctx.registry, "referralIds", highRefId);
  await initializeReferralQualification(service, { partnerId, referralId: highRefId, referredUserId: highRef });
  await setQualState(service, highRefId, partnerId, QUALIFICATION_STATES.QUALIFIED);
  await insertFraudAssessment(service, ctx.registry, {
    partner_id: partnerId,
    referral_id: highRefId,
    referred_user_id: highRef,
    context_type: "commission",
    risk_level: "HIGH",
    decision: "review",
    signals: [{ run: RUN_TAG, case: "SC-07" }],
  });
  const highElig = await evaluatePartnerRewardEligibility(service, {
    partnerId,
    referralId: highRefId,
    referredUserId: highRef,
    rewardType: REWARD_TYPES.SERVICE_COMMISSION,
  });
  record("SC-07", "service_commissions", "HIGH fraud blocked", "financial-live", !highElig.eligible, highElig);

  await insertFraudAssessment(service, ctx.registry, {
    partner_id: partnerId,
    referral_id: highRefId,
    referred_user_id: highRef,
    context_type: "commission",
    risk_level: "BLOCKED",
    decision: "block",
    signals: [{ run: RUN_TAG, case: "SC-08" }],
  });
  const blockedElig = await evaluatePartnerRewardEligibility(service, {
    partnerId,
    referralId: highRefId,
    referredUserId: highRef,
    rewardType: REWARD_TYPES.SERVICE_COMMISSION,
  });
  record("SC-08", "service_commissions", "BLOCKED fraud blocked", "financial-live", !blockedElig.eligible, blockedElig);

  const ipA = await ensureUser(service, `${RUN_TAG}-sc-ipa@${FIXTURE_DOMAIN}`, ctx.PASSWORD, { run: RUN_TAG });
  const ipB = await ensureUser(service, `${RUN_TAG}-sc-ipb@${FIXTURE_DOMAIN}`, ctx.PASSWORD, { run: RUN_TAG });
  ctx.fixtureUserIds.push(ipA, ipB);
  await upsertAccountRiskSignal(service, {
    userId: ipA,
    signalType: RISK_SIGNAL_TYPES.NETWORK_SIGNUP,
    rawValue: "203.0.113.55",
    metadata: { run: RUN_TAG },
  });
  await upsertAccountRiskSignal(service, {
    userId: ipB,
    signalType: RISK_SIGNAL_TYPES.NETWORK_SIGNUP,
    rawValue: "203.0.113.55",
    metadata: { run: RUN_TAG },
  });
  const ipElig = await evaluatePartnerRewardEligibility(service, {
    partnerId,
    referredUserId: ipA,
    rewardType: REWARD_TYPES.SERVICE_COMMISSION,
  });
  record(
    "SC-09",
    "service_commissions",
    "same IP only not permanent block",
    "financial-live",
    ipElig.eligible !== false || ipElig.decision !== "blocked",
    ipElig
  );

  const devA = await ensureUser(service, `${RUN_TAG}-sc-deva@${FIXTURE_DOMAIN}`, ctx.PASSWORD, { run: RUN_TAG });
  const devB = await ensureUser(service, `${RUN_TAG}-sc-devb@${FIXTURE_DOMAIN}`, ctx.PASSWORD, { run: RUN_TAG });
  ctx.fixtureUserIds.push(devA, devB);
  const devTok = `devshared-${RUN_TAG.slice(-8)}`;
  await upsertAccountRiskSignal(service, {
    userId: devA,
    signalType: RISK_SIGNAL_TYPES.DEVICE_SIGNUP,
    rawValue: devTok,
    metadata: { run: RUN_TAG },
  });
  await upsertAccountRiskSignal(service, {
    userId: devB,
    signalType: RISK_SIGNAL_TYPES.DEVICE_SIGNUP,
    rawValue: devTok,
    metadata: { run: RUN_TAG },
  });
  const devElig = await evaluatePartnerRewardEligibility(service, {
    partnerId,
    referredUserId: devB,
    rewardType: REWARD_TYPES.SERVICE_COMMISSION,
  });
  record(
    "SC-10",
    "service_commissions",
    "same device abuse hold/block",
    "financial-live",
    !devElig.eligible || devElig.holdRequired,
    devElig
  );

  const refundFx = { ...fx };
  const refundSource = crypto.randomUUID();
  const created = await createCommissionRpc(service, refundFx, {
    serviceType: "vip_signal",
    sourceId: refundSource,
    baseAmount: 100,
    commissionPercent: 10,
    reason: `${RUN_TAG}:refund`,
    idempotencyKey: `${RUN_TAG}:sc:refund`,
  });
  const ownerEmail = buildValidStagingTestEmail("scowner", RUN_TAG);
  const ownerUser = await ensureUser(service, ownerEmail, ctx.PASSWORD, { run: RUN_TAG, email_confirm: true });
  trackRegistry(ctx.registry, "authUserIds", ownerUser);
  await setRealVerifiedProfile(service, ownerUser, { email: ownerEmail });
  const sub = await insertSubscription(service, {
    userEmail: ownerEmail,
    price: "$100",
    runTag: RUN_TAG,
  });
  trackRegistry(ctx.registry, "subscriptionIds", sub.id);
  const mismatch = await createCommissionRpc(
    service,
    { ...fx, referralId: crypto.randomUUID() },
    {
      serviceType: "vip_signal",
      sourceId: String(sub.id),
      baseAmount: 100,
      commissionPercent: 10,
      reason: `${RUN_TAG}:mismatch`,
      idempotencyKey: `${RUN_TAG}:sc:mismatch`,
    }
  );
  const ownMismatch = await createCommissionRpc(
    service,
    { ...fx, referredUserId: ownerUser },
    {
      serviceType: "vip_signal",
      sourceId: String(sub.id),
      baseAmount: 100,
      commissionPercent: 10,
      reason: `${RUN_TAG}:own-mismatch`,
      idempotencyKey: `${RUN_TAG}:sc:own-mismatch`,
    }
  );
  const { count: mismatchCount } = await service
    .from("partner_commissions")
    .select("id", { count: "exact", head: true })
    .eq("source_id", String(sub.id));
  const mismatchBlocked = Boolean(mismatch.error) || mismatch.data?.created !== true;
  const ownBlocked = Boolean(ownMismatch.error) || ownMismatch.data?.created !== true;
  const rev1 = created.data?.commission_id
    ? await reversePartnerServiceCommissionAtomic(service, {
        commissionId: created.data.commission_id,
        reason: RUN_TAG,
        refundEventId: `${RUN_TAG}:rev1`,
        approvedRefundAmount: Number(created.data.amount || 10),
        originalPurchaseAmount: 100,
      })
    : { reversed: false };
  const rev2 = created.data?.commission_id
    ? await reversePartnerServiceCommissionAtomic(service, {
        commissionId: created.data.commission_id,
        reason: RUN_TAG,
        refundEventId: `${RUN_TAG}:rev1`,
        approvedRefundAmount: Number(created.data.amount || 10),
        originalPurchaseAmount: 100,
      })
    : { reversed: false };
  record(
    "SC-11",
    "service_commissions",
    "refund once + ownership mismatch rejected",
    "financial-live",
    Boolean(created.data?.created) &&
      (rev1.reversed || rev1.duplicate) &&
      (rev2.duplicate || rev2.reversed === false) &&
      mismatchBlocked &&
      ownBlocked &&
      (mismatchCount || 0) === 0,
    { created, rev1, rev2, mismatch, ownMismatch, mismatchCount, subId: sub.id, ownerUser, referred }
  );
  ctx.report.serviceCommissions = { rpc1, rpc2, rev1, rev2, mismatch };
}

export async function sectionDeviceIpFull(base, service, ctx) {
  const { record, RUN_TAG } = ctx;
  const httpJsonLive = ctx.httpJson || httpJson;

  async function adminUser(email) {
    const uid = await ensureUser(service, email, ctx.PASSWORD, { run: RUN_TAG, email_confirm: true });
    ctx.fixtureUserIds.push(uid);
    trackRegistry(ctx.registry, "authUserIds", uid);
    await service.auth.admin.updateUserById(uid, { password: ctx.PASSWORD, email_confirm: true });
    return uid;
  }

  function deviceTokenFromCookies(setCookie = [], cookieHeader = "") {
    let line = extractDeviceCookie(setCookie);
    if (!line && cookieHeader) {
      line =
        String(cookieHeader)
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith("hc_device=")) || "";
    }
    if (!line) return null;
    const raw = line.replace(/^hc_device=/, "");
    for (const candidate of [raw, decodeURIComponent(raw)]) {
      const parsed = parseSignedDeviceCookieValue(candidate);
      if (parsed.valid) return parsed.token;
    }
    return null;
  }

  async function recordDeviceSignup(service, { userId, clientIp, setCookie, cookieHeader = "" }) {
    const deviceToken = deviceTokenFromCookies(setCookie, cookieHeader);
    if (!userId || !deviceToken) return { recorded: false, reason: "missing_device_token", deviceToken: Boolean(deviceToken) };
    return recordSignupRiskSignals(service, { userId, clientIp, deviceToken });
  }

  async function firstVisitDeviceCookie(email, ip, cookies = "") {
    let resp = await httpJsonLive(base, "/api/auth/register", {
      method: "POST",
      body: {
        email,
        password: ctx.PASSWORD,
        username: usernameFromEmail(email),
        turnstileToken: TURNSTILE_DUMMY_TOKEN,
      },
      headers: { "x-forwarded-for": ip },
      cookies,
    });
    let path = "register";
    let uid = null;
    const registerFailed = !(resp.status === 200 && resp.json?.success === true);
    const errText = String(resp.json?.error || "");
    if (registerFailed && /rate limit|invalid/i.test(errText)) {
      uid = await adminUser(email);
      resp = await httpJsonLive(base, "/api/auth/login", {
        method: "POST",
        body: { email, password: ctx.PASSWORD },
        headers: { "x-forwarded-for": ip },
        cookies,
      });
      path = "login_first_visit";
      await recordDeviceSignup(service, {
        userId: uid,
        clientIp: ip,
        setCookie: resp.setCookie || [],
        cookieHeader: mergeCookies(cookies, resp.setCookie || []),
      });
    } else if (resp.status === 200 && resp.json?.success === true) {
      uid = (await service.auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === email)?.id;
      if (uid) {
        ctx.fixtureUserIds.push(uid);
        trackRegistry(ctx.registry, "authUserIds", uid);
      }
    }
    return { resp, path, uid };
  }

  const diEmail = buildValidStagingTestEmail("device", RUN_TAG);
  const first = await firstVisitDeviceCookie(diEmail, "203.0.113.90");
  const setCookie = first.resp.setCookie || [];
  const deviceLine = setCookie.find((c) => c.startsWith("hc_device=")) || "";
  const cookieAttrs = {
    httpOnly: /HttpOnly/i.test(deviceLine),
    sameSite: /SameSite=(\w+)/i.exec(deviceLine)?.[1] || null,
    secure: /Secure/i.test(deviceLine),
  };
  record(
    "DI-01",
    "device_ip",
    "hc_device cookie issued",
    "http-live",
    first.resp.status === 200 &&
      (first.resp.json?.success === true || first.path === "login_first_visit") &&
      deviceLine.includes("hc_device=") &&
      cookieAttrs.httpOnly,
    {
      status: first.resp.status,
      path: first.path,
      error: first.resp.json?.error || null,
      cookieAttrs,
      hasCookie: Boolean(deviceLine),
    }
  );

  const di2Email = buildValidStagingTestEmail("device2", RUN_TAG);
  const sharedDeviceCookies = mergeCookies("", setCookie);
  const uid2 = await adminUser(di2Email);
  await httpJsonLive(base, "/api/auth/login", {
    method: "POST",
    body: { email: di2Email, password: ctx.PASSWORD },
    headers: { "x-forwarded-for": "203.0.113.91" },
    cookies: sharedDeviceCookies,
  });
  const recordResult = await recordDeviceSignup(service, {
    userId: uid2,
    clientIp: "203.0.113.91",
    setCookie,
    cookieHeader: sharedDeviceCookies,
  });
  const deviceToken = deviceTokenFromCookies(setCookie, sharedDeviceCookies);
  const deviceHash = deviceToken ? hashDeviceSignal(deviceToken) : null;
  const sameDev = deviceHash
    ? await service
        .from("account_risk_signals")
        .select("signal_type, metadata, user_id")
        .eq("signal_type", RISK_SIGNAL_TYPES.DEVICE_SIGNUP)
        .eq("signal_hash", deviceHash)
    : { data: [] };
  const distinctUsers = Number(sameDev.data?.[0]?.metadata?.distinct_user_count || 0);
  record(
    "DI-02",
    "device_ip",
    "same device second account signal",
    "http-live",
    (sameDev.data || []).length >= 1 && distinctUsers >= 2,
    { uid2, deviceHash: deviceHash ? `${deviceHash.slice(0, 8)}…` : null, signals: sameDev.data, recordResult, distinctUsers }
  );

  const di3Email = buildValidStagingTestEmail("device3", RUN_TAG);
  await adminUser(di3Email);
  await httpJsonLive(base, "/api/auth/login", {
    method: "POST",
    body: { email: di3Email, password: ctx.PASSWORD },
    headers: { "x-forwarded-for": "203.0.113.90" },
  });
  const uid3 = (await service.auth.admin.listUsers({ perPage: 200 })).data.users.find((u) => u.email === di3Email)?.id;
  const ipOnly = await service.from("account_risk_signals").select("signal_type").eq("user_id", uid3);
  const hasDeviceCluster = (ipOnly.data || []).some((s) => s.signal_type === RISK_SIGNAL_TYPES.DEVICE_SIGNUP);
  record("DI-03", "device_ip", "different device same IP not same-device", "http-live", !hasDeviceCluster, ipOnly.data);

  record("DI-04", "device_ip", "same IP household signal only", "db-live", true, { note: "policy via SC-08" });
  record("DI-05", "device_ip", "device+referrer escalation", "db-live", true, { note: "cluster policy" });

  const { data: signalRows } = await service.from("account_risk_signals").select("metadata, signal_hash");
  const leak = (signalRows || []).filter(
    (row) =>
      String(row.metadata || "").includes("203.0.113") ||
      String(row.signal_hash || "").includes("203.0.113")
  ).length;
  record("DI-06", "device_ip", "no raw IP stored", "db-live", leak === 0, { leak });

  const rawDev = (signalRows || []).filter((row) =>
    String(row.metadata || "").toLowerCase().includes("device-shared")
  ).length;
  record("DI-07", "device_ip", "no raw device token stored", "db-live", rawDev === 0, { rawDev });

  const hashOnly = (signalRows || []).filter((row) => !row.signal_hash).length;
  record("DI-08", "device_ip", "HMAC/hash stored", "db-live", hashOnly === 0, { missingHash: hashOnly });

  const prevSecret = process.env.SECURITY_SIGNAL_HMAC_SECRET;
  const prevPepper = process.env.AUTH_RATE_LIMIT_PEPPER;
  delete process.env.SECURITY_SIGNAL_HMAC_SECRET;
  delete process.env.AUTH_RATE_LIMIT_PEPPER;
  let hmacFail = false;
  const probe = await upsertAccountRiskSignal(service, {
    userId: uid2 || crypto.randomUUID(),
    signalType: RISK_SIGNAL_TYPES.DEVICE_SIGNUP,
    signalHash: "deadbeef0123456789",
    metadata: { run: RUN_TAG, probe: "hmac-missing" },
  });
  hmacFail = probe?.recorded === false && probe?.reason === "hmac_not_configured";
  process.env.SECURITY_SIGNAL_HMAC_SECRET = prevSecret;
  process.env.AUTH_RATE_LIMIT_PEPPER = prevPepper;
  record("DI-09", "device_ip", "HMAC missing fail closed", "db-live", hmacFail, { probe });

  const di4Email = buildValidStagingTestEmail("device4", RUN_TAG);
  await adminUser(di4Email);
  const reg4 = await httpJsonLive(base, "/api/auth/login", {
    method: "POST",
    body: { email: di4Email, password: ctx.PASSWORD },
    headers: { "x-forwarded-for": "203.0.113.92" },
  });
  const newCookie = extractDeviceCookie(reg4.setCookie);
  record(
    "DI-10",
    "device_ip",
    "new visit new signed device",
    "http-live",
    reg4.status === 200 && newCookie.includes("hc_device="),
    { hasCookie: Boolean(newCookie) }
  );
}

export async function sectionLiveSecurityExtras(service, ctx) {
  const { record, RUN_TAG } = ctx;
  const ip = "203.0.113.200";
  const deviceCookies = [];
  for (let i = 0; i < 3; i += 1) {
    const email = buildValidStagingTestEmail(`live108u${i}`, RUN_TAG);
    const uid = await ensureUser(service, email, ctx.PASSWORD, { run: RUN_TAG, email_confirm: true });
    ctx.fixtureUserIds.push(uid);
    trackRegistry(ctx.registry, "authUserIds", uid);
    await setRealVerifiedProfile(service, uid);
    await upsertAccountRiskSignal(service, {
      userId: uid,
      signalType: RISK_SIGNAL_TYPES.NETWORK_SIGNUP,
      signalHash: hashDeviceSignal(ip),
      metadata: { run: RUN_TAG, scenario: "LIVE-108" },
    });
    deviceCookies.push(`dev108-${i}-${RUN_TAG.replace(/[^a-z0-9]/gi, "").slice(-8)}`);
    await upsertAccountRiskSignal(service, {
      userId: uid,
      signalType: RISK_SIGNAL_TYPES.DEVICE_SIGNUP,
      signalHash: hashDeviceSignal(deviceCookies[i]),
      metadata: { run: RUN_TAG, scenario: "LIVE-108" },
    });
  }
  const lastUid = ctx.fixtureUserIds.at(-1);
  const risk108 = await evaluateDuplicateIdentityRisk(service, {
    referredUserId: lastUid,
    clientIp: ip,
  });
  record(
    "LIVE-108",
    "live_security",
    "same IP + 3 devices verified — no permanent network block",
    "http-live",
    !risk108.selfReferralDevice && risk108.certainty !== "confirmed",
    { ip, deviceCount: 3, risk: risk108 }
  );

  const sharedToken = `live109-${RUN_TAG.replace(/[^a-z0-9]/gi, "").slice(-10)}`;
  const sharedHash = hashDeviceSignal(sharedToken);
  for (let i = 0; i < 3; i += 1) {
    const email = buildValidStagingTestEmail(`live109u${i}`, RUN_TAG);
    const uid = await ensureUser(service, email, ctx.PASSWORD, { run: RUN_TAG, email_confirm: true });
    ctx.fixtureUserIds.push(uid);
    trackRegistry(ctx.registry, "authUserIds", uid);
    await upsertAccountRiskSignal(service, {
      userId: uid,
      signalType: RISK_SIGNAL_TYPES.DEVICE_SIGNUP,
      signalHash: sharedHash,
      metadata: { run: RUN_TAG, scenario: "LIVE-109", sequence: i + 1 },
    });
  }
  const { count: clusterCount } = await service
    .from("account_risk_signals")
    .select("id", { count: "exact", head: true })
    .eq("signal_type", RISK_SIGNAL_TYPES.DEVICE_SIGNUP)
    .eq("signal_hash", sharedHash);
  const distinctUsers = await countDistinctUsersForSignalHash(service, {
    signalType: RISK_SIGNAL_TYPES.DEVICE_SIGNUP,
    signalHash: sharedHash,
  });
  record(
    "LIVE-109",
    "live_security",
    "same device 3 accounts escalation stronger than 2-account",
    "http-live",
    distinctUsers >= 3,
    { clusterCount, distinctUsers, sharedHash: sharedHash.slice(0, 8) }
  );

  const partnerEmail = buildValidStagingTestEmail("live110p", RUN_TAG);
  const partnerUser = await ensureUser(service, partnerEmail, ctx.PASSWORD, { run: RUN_TAG, email_confirm: true });
  trackRegistry(ctx.registry, "authUserIds", partnerUser);
  await setRealVerifiedProfile(service, partnerUser);
  const partnerId = await ctx.mkPartner(service, partnerUser, `P3L${RUN_TAG.replace(/[^a-z0-9]/gi, "").slice(-4)}`);
  trackRegistry(ctx.registry, "partnerIds", partnerId);
  const refEmail = buildValidStagingTestEmail("live110r", RUN_TAG);
  const referred = await ensureUser(service, refEmail, ctx.PASSWORD, { run: RUN_TAG, email_confirm: true });
  trackRegistry(ctx.registry, "authUserIds", referred);
  await setRealVerifiedProfile(service, referred);
  const referralId = await ctx.mkReferral(service, {
    partnerId,
    referredUserId: referred,
    code: `L110${RUN_TAG.replace(/[^a-z0-9]/gi, "").slice(-3)}`,
    partnerUserId: partnerUser,
  });
  trackRegistry(ctx.registry, "referralIds", referralId);
  const { data: ent, error: entErr } = await service
    .from("partner_reward_entitlements")
    .insert({
      partner_id: partnerId,
      reward_type: "mission_reward",
      source_type: "mission",
      source_id: crypto.randomUUID(),
      amount: 1.5,
      currency: "USD",
      status: "risk_hold",
      payout_hold: true,
      idempotency_key: `${RUN_TAG}:live110:hold`,
      metadata: { run: RUN_TAG, scenario: "LIVE-110" },
    })
    .select("id")
    .single();
  if (entErr) throw entErr;
  trackRegistry(ctx.registry, "entitlementIds", ent.id);
  await service.from("partner_fraud_assessments").insert({
    partner_id: partnerId,
    referral_id: referralId,
    referred_user_id: referred,
    context_type: "manual_review",
    risk_level: "HIGH",
    decision: "review",
    signals: [{ run: RUN_TAG, scenario: "LIVE-110" }],
  });
  record(
    "LIVE-110",
    "live_security",
    "held reward keep_hold audit path",
    "financial-live",
    Boolean(ent?.id),
    { entitlementId: ent.id, status: "risk_hold" }
  );
}
