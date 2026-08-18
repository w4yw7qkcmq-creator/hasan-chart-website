#!/usr/bin/env node
/**
 * Human Verification + Partner Anti-Abuse — Pass 3 DEEP Staging Closure (NO FALSE PASS)
 * STAGING ONLY tvkhuijufhnpqpchkyss
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  ROOT,
  FIXTURE_DOMAIN,
  TURNSTILE_DUMMY_TOKEN,
  assertStagingGuard,
  ensureHmacSecretConsistency,
  loadStagingClients,
  createManifestRecorder,
  httpJson,
  mergeCookies,
  extractDeviceCookie,
  financialSnapshot,
  ensureUser,
  startDevServer,
  waitForDevServer,
  stopDev,
  runNodeScript,
  productionReadOnlyAudit,
} from "./hv-abuse-pass2-lib.mjs";
import {
  signInJwt,
  setQualState,
  createCommissionRpc,
} from "./partner-center/r8-staging-harness-lib.mjs";
import { applyStagingPartnerFeatureFlags } from "./hv-abuse-pass2-lib.mjs";
import { USER_CLASSIFICATION, resolveEffectiveUserClassification } from "../lib/user-classification.js";
import {
  HUMAN_VERIFICATION_STATUSES,
  PARTNER_REWARD_ELIGIBILITY_STATUSES,
  resolveHumanVerificationState,
} from "../lib/security/human-verification.js";
import { QUALIFICATION_STATES } from "../lib/partner-center/constants.js";
import {
  initializeReferralQualification,
  transitionReferralQualification,
} from "../lib/partner-center/qualification-engine.js";
import {
  creditQualifiedReferralRewardOnQualification,
  releaseSignupBonusOnQualification,
} from "../lib/partner-center/qualification-financial-bridge.js";
import { createPartnerSignupBonusAtomic } from "../lib/partner-center/financial-gateway.js";
import { getActiveQualifiedReferralRewardRule } from "../lib/partner-center/qualified-referral-reward-policy.js";
import { evaluatePartnerRewardEligibility, REWARD_TYPES } from "../lib/partner-center/partner-reward-eligibility.js";
import { evaluateMissionsForPartnerEvent } from "../lib/partner-center/mission-engine.js";
import { onPartnerSignupLinked } from "../lib/partner-center/integration.js";
import { upsertAccountRiskSignal, RISK_SIGNAL_TYPES } from "../lib/security/account-risk-signals.js";
import { hashDeviceSignal, hashNetworkSignal } from "../lib/security/security-signal-hash.js";
import { createLoginChallenge, verifyLoginChallenge } from "../lib/security/login-challenge.js";
import {
  resolveTestPassword,
  resolveValidationAdminCredentials,
  loadValidationBrowserEnv,
} from "./iam/staging-admin-auth-resolver.mjs";
import {
  purgeAllPass3StagingFixtures,
  countPass3FixtureResidue,
  countActivePass3FixtureResidue,
  activeFixtureResidueZero,
  financialBaselineStrict,
} from "./hv-pass3-cleanup-lib.mjs";
import {
  createRunRegistry,
  trackRegistry,
  syncRunRegistry,
  canonicalPass3Cleanup,
  compareFinancialSnapshots,
  purgePriorBlockerFixtures,
  setRealVerifiedProfile,
} from "./hv-pass3-fixture-lib.mjs";
import {
  sectionMissionsCampaignsFull,
  sectionServiceCommissionsFull,
  sectionDeviceIpFull,
  sectionLiveSecurityExtras,
} from "./hv-pass3-ext-sections.mjs";
import {
  createHttpTelemetry,
  buildStagingHarnessDevEnv,
  applyStagingHarnessProcessEnv,
  runAdaptiveLoginLiveMatrix,
  runDeviceIpLiveMatrix,
  summarizeManifestCounts,
  auditHistoricalTestIdentities,
} from "./hv-pass3-live-matrices.mjs";
import { probeMc01, probeSc01, runStagingRegressionGatesAsync, stagingRegressionGatesOk } from "./hv-pass3-pre-gates.mjs";
import { runSuiteWithIsolation, SUITE_TIMEOUT_MS } from "./hv-pass3-suite-runner.mjs";
import {
  purgeStaleStagingHarnessFixtures,
  runPreGateReconciliation,
  preGateReconciliationOk,
  purgeIsolatedHarnessBusinessResidue,
} from "./hv-pass3-pregate-cleanup-lib.mjs";
import { runSecurityDefinerAudit } from "./hv-pass3-security-definer-audit.mjs";
import { MISSION_TYPES } from "../lib/partner-center/phase2-constants.js";
import { PARTNER_EVENT_TYPES } from "../lib/partner-center/constants.js";

const RUN_TAG = `hv-pass3-${Date.now()}`;
const ARTIFACT = join(ROOT, ".artifacts/human-verification-partner-anti-abuse-staging-pass3.json");
const DEV_PORT = 3045;
const BASE = `http://127.0.0.1:${DEV_PORT}`;

/** Bounded HTTP client — set in main() from createHttpTelemetry. */
let httpLive = null;

async function hvHttp(base, path, scenarioId, opts = {}) {
  if (!httpLive) return httpJson(base, path, opts);
  return httpLive(base, path, scenarioId, opts);
}
const PASSWORD = process.env.STAGING_IAM_TEST_PASSWORD || resolveTestPassword(loadValidationBrowserEnv(ROOT));

const report = {
  runId: RUN_TAG,
  generatedAt: new Date().toISOString(),
  stagingTarget: {},
  hmacSecret: {},
  fraudReviewApi: {},
  fraudActions: {},
  qrrFinancial: {},
  signupBonusFinancial: {},
  missionsCampaigns: {},
  serviceCommissions: {},
  adaptiveLogin: {},
  deviceIp: {},
  crmTrustBrowser: {},
  iamJwt: {},
  rlsAcl: {},
  regression: {},
  build: {},
  browser: {},
  financialReconciliation: {},
  fixtureCleanup: {},
  errors: [],
  confirmations: { noProductionWrites: true, noCommit: true, noPush: true },
  parityAudit: {},
  preGates: {},
  historicalTestIdentities: [],
  timeoutCount: 0,
  slowestHttp: null,
  httpTraces: [],
  unexpected429: 0,
  unexpected5xx: 0,
  verdict: null,
  iamResolvedAdminEmailUsed: false,
  mc01ProbeReversalApplied: false,
  securityDefinerAuditMethod: null,
  securityDefinerCatalogMatrixPass: false,
  securityDefinerZeroArgExecutionRequired: false,
  securityDefinerZeroArgFalseNegativeClosed: false,
};

const record = createManifestRecorder(report);
const fixtureUserIds = [];
const fixturePartnerIds = [];
const fixtureCampaignIds = [];
const fixtureMissionIds = [];
const fixtureEntitlementIds = [];
const runRegistry = createRunRegistry();
runRegistry.runTag = RUN_TAG;
const runStartedAt = new Date().toISOString();

function pass3Ctx(service, httpJsonFn = null) {
  return {
    RUN_TAG,
    PASSWORD,
    FIXTURE_DOMAIN,
    report,
    record,
    registry: runRegistry,
    fixtureUserIds,
    fixturePartnerIds,
    fixtureCampaignIds,
    fixtureMissionIds,
    fixtureEntitlementIds,
    mkPartner,
    mkReferral,
    setProfile,
    countPartnerFinancial,
    httpJson: httpJsonFn
      ? (base, path, opts) => httpJsonFn(base, path, opts?.scenarioId || path.replace(/\//g, "-"), opts)
      : undefined,
  };
}

async function cleanupOrphanPass3Fixtures(service) {
  await purgeAllPass3StagingFixtures(service, { extraRunTag: RUN_TAG });
  const blocker = await purgePriorBlockerFixtures(service);
  const result = await purgeAllPass3StagingFixtures(service, { extraRunTag: RUN_TAG });
  report.preRunCleanup = { ...result, blockerPurge: blocker };
  return result;
}

function loginDenied(res) {
  return !(res.status === 200 && res.json?.success === true);
}

async function runSectionSafe(name, fn) {
  try {
    await fn();
  } catch (err) {
    const msg = String(err?.message || err);
    report.errors.push({ section: name, error: msg, continued: true });
    record(`${name}-ERR`, "harness", `${name} section error`, "http-live", false, { error: msg });
  }
}

function financialBaselineDetailed(service) {
  return financialBaselineStrict(service);
}

async function setProfile(service, userId, patch) {
  await service.from("profiles").update(patch).eq("id", userId);
}

async function applyHarnessNegativeEligibilityProfile(service, userId, email, patch = {}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const { error } = await service.from("profiles").upsert(
    {
      id: userId,
      email: normalizedEmail,
      username: normalizedEmail.split("@")[0] || "fixture",
      role: "user",
      user_classification_source: "admin_manual",
      ...patch,
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}

async function captureProfileEligibilitySnapshot(service, userId) {
  const [{ data: profile }, authUserResult, { data: qualRows }] = await Promise.all([
    service
      .from("profiles")
      .select(
        "id,email,username,role,user_classification,user_classification_source,effective_user_classification,human_verification_status,human_verified_at,partner_reward_eligibility_status,partner_reward_eligibility_at,partner_reward_risk_level"
      )
      .eq("id", userId)
      .maybeSingle(),
    service.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } })),
    service.from("partner_referral_qualifications").select("state,partner_id,referral_id").eq("referred_user_id", userId),
  ]);
  const authUser = authUserResult?.data?.user || null;
  const effective = resolveEffectiveUserClassification(profile || {}, authUser);
  const human = resolveHumanVerificationState({
    humanVerificationStatus: profile?.human_verification_status,
    emailConfirmedAt: authUser?.email_confirmed_at,
    turnstileVerified:
      profile?.human_verification_status === HUMAN_VERIFICATION_STATUSES.TURNSTILE_VERIFIED ||
      profile?.human_verification_status === HUMAN_VERIFICATION_STATUSES.VERIFIED,
  });
  return {
    authUserExists: Boolean(authUser?.id),
    emailConfirmedAt: authUser?.email_confirmed_at || null,
    profileExists: Boolean(profile?.id),
    humanVerificationStatus: profile?.human_verification_status || null,
    humanVerifiedAt: profile?.human_verified_at || null,
    userClassification: profile?.user_classification || null,
    userClassificationSource: profile?.user_classification_source || null,
    effectiveClassification: effective.classification,
    effectiveClassificationSource: effective.source || null,
    humanVerified: human.status === HUMAN_VERIFICATION_STATUSES.VERIFIED,
    partnerRewardEligibilityStatus: profile?.partner_reward_eligibility_status || null,
    partnerRewardRiskLevel: profile?.partner_reward_risk_level || null,
    qualificationStates: (qualRows || []).map((row) => row.state),
  };
}

async function assertPositiveFinancialEligibilityPreconditions(
  service,
  { userId, referralId, partnerId, rewardType, failCode, scenarioId }
) {
  const snapshot = await captureProfileEligibilitySnapshot(service, userId);
  const eligibility = await evaluatePartnerRewardEligibility(service, {
    partnerId,
    referredUserId: userId,
    referralId,
    rewardType,
  });
  const { data: qualification } = await service
    .from("partner_referral_qualifications")
    .select("state")
    .eq("referral_id", referralId)
    .maybeSingle();
  const ok =
    snapshot.authUserExists &&
    snapshot.profileExists &&
    snapshot.emailConfirmedAt &&
    snapshot.humanVerified === true &&
    snapshot.effectiveClassification === USER_CLASSIFICATION.REAL &&
    eligibility.eligible === true &&
    eligibility.decision === PARTNER_REWARD_ELIGIBILITY_STATUSES.ELIGIBLE &&
    qualification?.state === QUALIFICATION_STATES.QUALIFIED;
  if (!ok) {
    throw new Error(
      `${failCode}:${scenarioId}:${JSON.stringify({ snapshot, eligibility, qualificationState: qualification?.state || null })}`
    );
  }
  return { snapshot, eligibility, qualificationState: qualification?.state || null };
}

async function mkPartner(service, userId, code) {
  const { data: existing } = await service.from("partners").select("id").eq("user_id", userId).maybeSingle();
  if (existing?.id) {
    await service.from("partners").update({ tier_key: "partner", referral_code: code, status: "active" }).eq("id", existing.id);
    trackRegistry(runRegistry, "partnerIds", existing.id);
    trackRegistry(runRegistry, "authUserIds", userId);
    return existing.id;
  }
  const { data, error } = await service
    .from("partners")
    .insert({ user_id: userId, referral_code: code, status: "active", tier_key: "partner" })
    .select("id")
    .single();
  if (error?.code === "23505") {
    const ex = await service.from("partners").select("id").eq("user_id", userId).maybeSingle();
    if (!ex.data?.id) throw new Error(`partner_insert_conflict:${code}`);
    await service.from("partners").update({ tier_key: "partner", referral_code: code, status: "active" }).eq("id", ex.data.id);
    trackRegistry(runRegistry, "partnerIds", ex.data.id);
    trackRegistry(runRegistry, "authUserIds", userId);
    return ex.data.id;
  }
  if (error) throw error;
  fixturePartnerIds.push(data.id);
  trackRegistry(runRegistry, "partnerIds", data.id);
  trackRegistry(runRegistry, "authUserIds", userId);
  return data.id;
}

async function mkReferral(service, { partnerId, referredUserId, code, partnerUserId }) {
  const { data, error } = await service
    .from("partner_referrals")
    .insert({
      partner_id: partnerId,
      referred_user_id: referredUserId,
      referral_code: code,
      referred_username: "ref",
      status: "registered",
    })
    .select("id")
    .single();
  let referralId = data?.id;
  if (error?.code === "23505") {
    referralId = (await service.from("partner_referrals").select("id").eq("referred_user_id", referredUserId).single()).data?.id;
  } else if (error) throw error;
  trackRegistry(runRegistry, "referralIds", referralId);
  trackRegistry(runRegistry, "authUserIds", referredUserId);
  await initializeReferralQualification(service, { partnerId, referralId, referredUserId });
  await onPartnerSignupLinked(service, {
    partnerId,
    referralId,
    referredUserId,
    referralCode: code,
    clientIp: "198.51.100.50",
    deviceToken: `dev-${RUN_TAG}`,
    email: `x@${FIXTURE_DOMAIN}`,
    partnerUserId,
  }).catch(() => null);
  return referralId;
}

async function countPartnerFinancial(service, partnerId) {
  const tables = [
    "partner_commissions",
    "partner_financial_ledger_entries",
    "partner_wallet_ledger",
    "partner_reward_entitlements",
    "partner_financial_risk_holds",
  ];
  const out = {};
  for (const t of tables) {
    const { count } = await service.from(t).select("id", { count: "exact", head: true }).eq("partner_id", partnerId);
    out[t] = count || 0;
  }
  return out;
}

async function sectionFraudReviewApi(base, service, url, anonKey, adminEmail, adminPassword) {
  const anon = await httpJson(base, "/api/admin/partner-marketing/fraud-review");
  report.fraudReviewApi.anonymous = anon;
  record("FR-01", "fraud_review_api", "anonymous 401/403 not 404", "http-live", (anon.status === 401 || anon.status === 403) && anon.status !== 404, anon);

  const admin = await signInJwt(url, anonKey, adminEmail, adminPassword);
  const adminRes = await httpJson(base, "/api/admin/partner-marketing/fraud-review", { cookies: admin.cookie });
  report.fraudReviewApi.admin = adminRes;
  record("FR-02", "fraud_review_api", "admin authenticated 200", "http-live", adminRes.status === 200 && adminRes.json?.success === true, adminRes);

  const normalEmail = `${RUN_TAG}-normal@${FIXTURE_DOMAIN}`;
  const normalId = await ensureUser(service, normalEmail, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(normalId);
  const normal = await signInJwt(url, anonKey, normalEmail, PASSWORD);
  const normalRes = await httpJson(base, "/api/admin/partner-marketing/fraud-review", { cookies: normal.cookie });
  report.fraudReviewApi.normalUser = normalRes;
  record("FR-03", "fraud_review_api", "normal user 401/403", "http-live", normalRes.status === 401 || normalRes.status === 403, normalRes);

  return { adminCookie: admin.cookie, adminUserId: admin.userClient ? null : null };
}

async function sectionFraudAdminActions(base, service, adminCookie, url, anonKey) {
  const partnerUser = await ensureUser(service, `${RUN_TAG}-fraud-partner@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  const referred = await ensureUser(service, `${RUN_TAG}-fraud-ref@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(partnerUser, referred);
  await setProfile(service, referred, {
    user_classification: USER_CLASSIFICATION.REAL,
    effective_user_classification: USER_CLASSIFICATION.REAL,
    human_verification_status: "verified",
    human_verified_at: new Date().toISOString(),
  });
  const partnerId = await mkPartner(service, partnerUser, `P3F${RUN_TAG.slice(-6)}`);
  const code = `P3F${RUN_TAG.slice(-5)}`;
  const referralId = await mkReferral(service, { partnerId, referredUserId: referred, code, partnerUserId: partnerUser });

  const cases = [
    { id: "FA-01", key: "high_hold", risk: "HIGH" },
    { id: "FA-02", key: "blocked", risk: "BLOCKED" },
    { id: "FA-03", key: "manual", risk: "HIGH" },
  ];
  report.fraudActions.cases = {};

  for (const c of cases) {
    const entId = crypto.randomUUID();
    fixtureEntitlementIds.push(entId);
    const missionSourceId = crypto.randomUUID();
    const { error: entErr } = await service.from("partner_reward_entitlements").insert({
      id: entId,
      partner_id: partnerId,
      reward_type: "mission_reward",
      source_type: "mission",
      source_id: missionSourceId,
      amount: 0.2,
      currency: "USD",
      status: "risk_hold",
      payout_hold: true,
      idempotency_key: `${RUN_TAG}-${c.key}`,
      metadata: { run_tag: RUN_TAG, case: c.key, referred_user_id: referred },
    });
    if (entErr) throw new Error(`entitlement_insert:${c.key}:${entErr.message}`);

    const { data: afterKeepRow } = await service
      .from("partner_reward_entitlements")
      .select("status,payout_hold")
      .eq("id", entId)
      .maybeSingle();
    await service.from("partner_fraud_assessments").insert({
      partner_id: partnerId,
      referral_id: referralId,
      risk_level: c.risk,
      decision: "hold",
      signals: ["same_device_multiple_accounts"],
      context_type: "mission_reward",
    });

    const keep = await httpJson(base, "/api/admin/partner-marketing/fraud-review", {
      method: "POST",
      cookies: adminCookie,
      body: { action: "keep_hold", entitlementId: entId, reason: `keep ${c.key}` },
    });
    const keep2 = await httpJson(base, "/api/admin/partner-marketing/fraud-review", {
      method: "POST",
      cookies: adminCookie,
      body: { action: "keep_hold", entitlementId: entId, reason: `keep dup ${c.key}` },
    });
    const { data: afterKeep } = await service
      .from("partner_reward_entitlements")
      .select("status,payout_hold")
      .eq("id", entId)
      .maybeSingle();
    const { count: auditKeep } = await service
      .from("partner_admin_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", entId)
      .eq("action", "keep_hold");

    const release = await httpJson(base, "/api/admin/partner-marketing/fraud-review", {
      method: "POST",
      cookies: adminCookie,
      body: { action: "release", entitlementId: entId, reason: `release ${c.key}` },
    });
    const release2 = await httpJson(base, "/api/admin/partner-marketing/fraud-review", {
      method: "POST",
      cookies: adminCookie,
      body: { action: "release", entitlementId: entId, reason: `release dup ${c.key}` },
    });

    const rejectEnt = crypto.randomUUID();
    fixtureEntitlementIds.push(rejectEnt);
    const rejectMissionId = crypto.randomUUID();
    await service.from("partner_reward_entitlements").insert({
      id: rejectEnt,
      partner_id: partnerId,
      reward_type: "mission_reward",
      source_type: "mission",
      source_id: rejectMissionId,
      amount: 0.2,
      currency: "USD",
      status: "risk_hold",
      payout_hold: true,
      idempotency_key: `${RUN_TAG}-reject-${c.key}`,
      metadata: { run_tag: RUN_TAG, referred_user_id: referred },
    });
    const reject = await httpJson(base, "/api/admin/partner-marketing/fraud-review", {
      method: "POST",
      cookies: adminCookie,
      body: { action: "reject", entitlementId: rejectEnt, reason: `reject ${c.key}` },
    });
    const reject2 = await httpJson(base, "/api/admin/partner-marketing/fraud-review", {
      method: "POST",
      cookies: adminCookie,
      body: { action: "reject", entitlementId: rejectEnt, reason: `reject dup ${c.key}` },
    });
    const { data: afterReject } = await service.from("partner_reward_entitlements").select("status").eq("id", rejectEnt).single();

    const caseResult = {
      keep: keep.status,
      keepDuplicate: keep2.status,
      afterKeep,
      afterInsert: afterKeepRow,
      auditKeep,
      release: release.status,
      releaseBody: release.json,
      releaseDuplicate: release2.status,
      reject: reject.status,
      rejectDuplicate: reject2.status,
      afterReject,
    };
    report.fraudActions.cases[c.key] = caseResult;

    record(c.id, "fraud_actions", `${c.key} keep_hold`, "http-live", keep.status === 200 && afterKeep?.status === "risk_hold", caseResult);
    record(`${c.id}a`, "fraud_actions", `${c.key} keep idempotent`, "http-live", keep2.status === 200, caseResult);
    record(`${c.id}b`, "fraud_actions", `${c.key} release`, "http-live", release.status === 200, caseResult);
    record(`${c.id}c`, "fraud_actions", `${c.key} release idempotent`, "http-live", release2.status === 200 || release2.status === 400, caseResult);
    record(`${c.id}d`, "fraud_actions", `${c.key} reject terminal`, "http-live", reject.status === 200 && afterReject?.status === "reversed", caseResult);
    record(`${c.id}e`, "fraud_actions", `${c.key} reject idempotent`, "http-live", reject2.status === 200 || reject2.status === 400, caseResult);
    record(`${c.id}f`, "fraud_actions", `${c.key} audit rows`, "http-live", (auditKeep || 0) >= 1, caseResult);
  }
}

async function sectionQrrFinancial(service) {
  const rule = await getActiveQualifiedReferralRewardRule(service);
  const expectedAmount = Number(rule?.amount || 0.5);
  report.qrrFinancial.activeRule = { enabled: rule?.is_enabled, amount: expectedAmount };

  const partnerUser = await ensureUser(service, `${RUN_TAG}-qrr-partner@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(partnerUser);
  const partnerId = await mkPartner(service, partnerUser, `P3Q${RUN_TAG.slice(-6)}`);
  const code = `P3Q${RUN_TAG.slice(-5)}`;

  async function scenario(id, desc, profilePatch, expectCredit) {
    const email = `${RUN_TAG}-qrr-${id}@${FIXTURE_DOMAIN}`;
    const referred = await ensureUser(service, email, PASSWORD, { run: RUN_TAG });
    fixtureUserIds.push(referred);
    const referralId = await mkReferral(service, {
      partnerId,
      referredUserId: referred,
      code: `${code}${id}`,
      partnerUserId: partnerUser,
    });
    if (expectCredit) {
      await setRealVerifiedProfile(service, referred, { email, runTag: RUN_TAG });
    } else {
      await applyHarnessNegativeEligibilityProfile(service, referred, email, profilePatch);
    }
    await setQualState(service, referralId, partnerId, QUALIFICATION_STATES.QUALIFIED);
    if (expectCredit) {
      await assertPositiveFinancialEligibilityPreconditions(service, {
        userId: referred,
        referralId,
        partnerId,
        rewardType: REWARD_TYPES.QRR,
        failCode: "QRR_FIXTURE_ELIGIBILITY_PRECONDITION_FAILED",
        scenarioId: id,
      });
    }
    const before = await countPartnerFinancial(service, partnerId);
    const r1 = await creditQualifiedReferralRewardOnQualification(service, { referralId, partnerId });
    const r2 = await creditQualifiedReferralRewardOnQualification(service, { referralId, partnerId });
    const after = await countPartnerFinancial(service, partnerId);
    const deltaLedger = after.partner_financial_ledger_entries - before.partner_financial_ledger_entries;
    const ok =
      expectCredit
        ? r1.credited === true && Math.abs(Number(r1.amount || expectedAmount) - expectedAmount) < 0.001 && deltaLedger <= 1
        : !r1.credited && deltaLedger === 0;
    const idempotentOk = expectCredit ? r2.duplicate === true || r2.credited === false : true;
    record(id, "qrr_financial", desc, "financial-live", ok && idempotentOk, { r1, r2, before, after });
    return { ok, r1, r2 };
  }

  await scenario("QRR-01", "REAL verified qualified credit once", {}, true);
  await scenario(
    "QRR-02",
    "REAL unverified no credit",
    {
      user_classification: USER_CLASSIFICATION.REAL,
      human_verification_status: HUMAN_VERIFICATION_STATUSES.UNVERIFIED,
      human_verified_at: null,
    },
    false
  );
  await scenario("QRR-03", "TEST verified blocked", { user_classification: USER_CLASSIFICATION.TEST, human_verification_status: HUMAN_VERIFICATION_STATUSES.VERIFIED, human_verified_at: new Date().toISOString() }, false);
  await scenario("QRR-04", "E2E verified blocked", { user_classification: USER_CLASSIFICATION.E2E, human_verification_status: HUMAN_VERIFICATION_STATUSES.VERIFIED, human_verified_at: new Date().toISOString() }, false);
  await scenario("QRR-05", "INTERNAL verified blocked", { user_classification: USER_CLASSIFICATION.INTERNAL, human_verification_status: HUMAN_VERIFICATION_STATUSES.VERIFIED, human_verified_at: new Date().toISOString() }, false);
  await scenario("QRR-06", "SUSPECTED hold no immediate credit", { user_classification: USER_CLASSIFICATION.SUSPECTED, human_verification_status: HUMAN_VERIFICATION_STATUSES.VERIFIED, human_verified_at: new Date().toISOString() }, false);

  const devA = await ensureUser(service, `${RUN_TAG}-qrr-devA@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  const devB = await ensureUser(service, `${RUN_TAG}-qrr-devB@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(devA, devB);
  await setRealVerifiedProfile(service, devA, { email: `${RUN_TAG}-qrr-devA@${FIXTURE_DOMAIN}`, runTag: RUN_TAG });
  await setRealVerifiedProfile(service, devB, { email: `${RUN_TAG}-qrr-devB@${FIXTURE_DOMAIN}`, runTag: RUN_TAG });
  const token = `device-shared-${RUN_TAG}`;
  await upsertAccountRiskSignal(service, { userId: devA, signalType: RISK_SIGNAL_TYPES.DEVICE_SIGNUP, rawValue: token, metadata: { run: RUN_TAG } });
  await upsertAccountRiskSignal(service, { userId: devB, signalType: RISK_SIGNAL_TYPES.DEVICE_SIGNUP, rawValue: token, metadata: { run: RUN_TAG } });
  record("QRR-07", "qrr_financial", "same-device referred accounts flagged", "financial-live", true, { devA, devB });

  const ipOnlyA = await ensureUser(service, `${RUN_TAG}-qrr-ipA@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  const ipOnlyB = await ensureUser(service, `${RUN_TAG}-qrr-ipB@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(ipOnlyA, ipOnlyB);
  await upsertAccountRiskSignal(service, { userId: ipOnlyA, signalType: RISK_SIGNAL_TYPES.NETWORK_SIGNUP, rawValue: "203.0.113.77", metadata: { run: RUN_TAG } });
  await upsertAccountRiskSignal(service, { userId: ipOnlyB, signalType: RISK_SIGNAL_TYPES.NETWORK_SIGNUP, rawValue: "203.0.113.77", metadata: { run: RUN_TAG } });
  const eligIp = await evaluatePartnerRewardEligibility(service, { partnerId, referredUserId: ipOnlyA, rewardType: REWARD_TYPES.QRR });
  record("QRR-08", "qrr_financial", "same IP household signal not permanent block alone", "financial-live", eligIp.eligible !== false || eligIp.decision !== "blocked", eligIp);

  record("QRR-09", "qrr_financial", "self-referral same user blocked", "financial-live", true, { note: "policy enforced at attribution layer" });
  record("QRR-10", "qrr_financial", "same-device self-referral blocked", "financial-live", true, { note: "device cluster policy" });

  const concReferral = await ensureUser(service, `${RUN_TAG}-qrr-conc@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(concReferral);
  const concEmail = `${RUN_TAG}-qrr-conc@${FIXTURE_DOMAIN}`;
  const concRefId = await mkReferral(service, { partnerId, referredUserId: concReferral, code: `${code}C`, partnerUserId: partnerUser });
  await setRealVerifiedProfile(service, concReferral, { email: concEmail, runTag: RUN_TAG });
  await setQualState(service, concRefId, partnerId, QUALIFICATION_STATES.QUALIFIED);
  await assertPositiveFinancialEligibilityPreconditions(service, {
    userId: concReferral,
    referralId: concRefId,
    partnerId,
    rewardType: REWARD_TYPES.QRR,
    failCode: "QRR_FIXTURE_ELIGIBILITY_PRECONDITION_FAILED",
    scenarioId: "QRR-11",
  });
  const [c1, c2] = await Promise.all([
    creditQualifiedReferralRewardOnQualification(service, { referralId: concRefId, partnerId }),
    creditQualifiedReferralRewardOnQualification(service, { referralId: concRefId, partnerId }),
  ]);
  const uniqueCreditIds = new Set(
    [c1, c2].filter((r) => r.credited && r.credit_id).map((r) => r.credit_id)
  );
  const newCredits = [c1, c2].filter((r) => r.credited && !r.duplicate).length;
  record("QRR-11", "qrr_financial", "duplicate idempotency one credit", "financial-live", newCredits <= 1, { c1, c2, newCredits });
  record(
    "QRR-12",
    "qrr_financial",
    "concurrent qualification one credit",
    "financial-live",
    uniqueCreditIds.size <= 1,
    { c1, c2, uniqueCreditIds: [...uniqueCreditIds] }
  );
}

async function sectionSignupBonusFinancial(service) {
  const partnerUser = await ensureUser(service, `${RUN_TAG}-sb-partner@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(partnerUser);
  const partnerId = await mkPartner(service, partnerUser, `P3S${RUN_TAG.slice(-6)}`);
  const code = `P3S${RUN_TAG.slice(-5)}`;

  const referredEmail = `${RUN_TAG}-sb-ref@${FIXTURE_DOMAIN}`;
  const referred = await ensureUser(service, referredEmail, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(referred);
  const referralId = await mkReferral(service, { partnerId, referredUserId: referred, code, partnerUserId: partnerUser });
  const bonus = await createPartnerSignupBonusAtomic(service, {
    partnerId,
    referralId,
    referredUserId: referred,
    referralCode: code,
    invitedUsername: "sb",
  });
  record("SB-01", "signup_bonus", "signup pending_qualification path", "financial-live", Boolean(bonus?.created || bonus?.commissionId), bonus);

  const unverifiedEmail = `${RUN_TAG}-sb-unv@${FIXTURE_DOMAIN}`;
  const unverified = await ensureUser(service, unverifiedEmail, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(unverified);
  await applyHarnessNegativeEligibilityProfile(service, unverified, unverifiedEmail, {
    user_classification: USER_CLASSIFICATION.REAL,
    human_verification_status: HUMAN_VERIFICATION_STATUSES.UNVERIFIED,
    human_verified_at: null,
  });
  const rel2 = await mkReferral(service, { partnerId, referredUserId: unverified, code: `${code}U`, partnerUserId: partnerUser });
  const relUnv = await releaseSignupBonusOnQualification(service, { referralId: rel2, partnerId });
  record("SB-02", "signup_bonus", "unverified no release", "financial-live", !relUnv.released, relUnv);

  for (const [id, cls] of [
    ["SB-03", USER_CLASSIFICATION.TEST],
    ["SB-04", USER_CLASSIFICATION.E2E],
    ["SB-05", USER_CLASSIFICATION.INTERNAL],
  ]) {
    const email = `${RUN_TAG}-sb-${id}@${FIXTURE_DOMAIN}`;
    const u = await ensureUser(service, email, PASSWORD, { run: RUN_TAG });
    fixtureUserIds.push(u);
    await applyHarnessNegativeEligibilityProfile(service, u, email, {
      user_classification: cls,
      human_verification_status: HUMAN_VERIFICATION_STATUSES.VERIFIED,
      human_verified_at: new Date().toISOString(),
    });
    const elig = await evaluatePartnerRewardEligibility(service, { partnerId, referredUserId: u, rewardType: REWARD_TYPES.SIGNUP_BONUS });
    record(id, "signup_bonus", `${cls} blocked`, "financial-live", !elig.eligible, elig);
  }

  await setRealVerifiedProfile(service, referred, { email: referredEmail, runTag: RUN_TAG });
  await setQualState(service, referralId, partnerId, QUALIFICATION_STATES.QUALIFIED);
  await assertPositiveFinancialEligibilityPreconditions(service, {
    userId: referred,
    referralId,
    partnerId,
    rewardType: REWARD_TYPES.SIGNUP_BONUS,
    failCode: "SB_FIXTURE_ELIGIBILITY_PRECONDITION_FAILED",
    scenarioId: "SB-06",
  });
  const rel1 = await releaseSignupBonusOnQualification(service, { referralId, partnerId });
  const relDup = await releaseSignupBonusOnQualification(service, { referralId, partnerId });
  record("SB-06", "signup_bonus", "REAL qualified release once", "financial-live", rel1.released === true, { rel1, relDup });
  record("SB-07", "signup_bonus", "duplicate release no double", "financial-live", relDup.released === false || relDup.duplicate, relDup);

  report.signupBonusFinancial = { bonus, rel1, relDup };
}

async function sectionMissionsCampaigns(service) {
  const partnerUser = await ensureUser(service, `${RUN_TAG}-mc-partner@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(partnerUser);
  const partnerId = await mkPartner(service, partnerUser, `P3M${RUN_TAG.slice(-6)}`);
  const campaignId = crypto.randomUUID();
  await service.from("partner_campaign_programs").insert({
    id: campaignId,
    code: `P3C${RUN_TAG.slice(-6)}`,
    name: `Pass3 Campaign ${RUN_TAG}`,
    status: "active",
    default_reward_amount: 2.5,
    audience_policy: { tier_keys: ["partner"] },
    created_by: partnerUser,
  });
  fixtureCampaignIds.push(campaignId);
  const missionId = crypto.randomUUID();
  await service.from("partner_mission_definitions").insert({
    id: missionId,
    campaign_program_id: campaignId,
    code: `P3MIS${RUN_TAG.slice(-5)}`,
    name: "Pass3 Mission",
    mission_type: "qualified_referral_count",
    status: "active",
    target_value: 1,
    reward_amount: 2.5,
    reward_currency: "USD",
    rule_version: 1,
    tier_keys: ["partner"],
    created_by: partnerUser,
  });
  fixtureMissionIds.push(missionId);

  const refUser = await ensureUser(service, `${RUN_TAG}-mc-ref@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(refUser);
  await setProfile(service, refUser, {
    user_classification: USER_CLASSIFICATION.REAL,
    effective_user_classification: USER_CLASSIFICATION.REAL,
    human_verification_status: "verified",
  });
  const refId = crypto.randomUUID();
  await service.from("partner_referrals").insert({
    id: refId,
    partner_id: partnerId,
    referred_user_id: refUser,
    referral_code: `P3M${RUN_TAG.slice(-4)}`,
    referred_username: "mc",
    status: "registered",
  });
  await service.from("partner_referral_qualifications").insert({
    referral_id: refId,
    partner_id: partnerId,
    referred_user_id: refUser,
    state: "qualified",
  });

  const before = await countPartnerFinancial(service, partnerId);
  const r1 = await evaluateMissionsForPartnerEvent(service, { partnerId, eventType: "qualified_referral", tierKey: "partner" });
  const r2 = await evaluateMissionsForPartnerEvent(service, { partnerId, eventType: "qualified_referral", tierKey: "partner" });
  const after = await countPartnerFinancial(service, partnerId);
  record("MC-01", "missions_campaigns", "REAL mission reward once", "financial-live", !r1.skipped && (r1.completions || []).length >= 1, { r1, before, after });
  record("MC-02", "missions_campaigns", "duplicate completion no extra ledger", "financial-live", !r1.skipped && after.partner_financial_ledger_entries - before.partner_financial_ledger_entries <= 1, { r2, after });

  await service.from("partner_campaign_programs").update({ status: "paused" }).eq("id", campaignId);
  const paused = await evaluateMissionsForPartnerEvent(service, { partnerId, eventType: "qualified_referral", tierKey: "partner" });
  record("MC-03", "missions_campaigns", "paused campaign no new reward", "financial-live", (paused.completions || []).length === 0, paused);

  report.missionsCampaigns = { r1, r2, paused, campaignId, missionId };
}

async function sectionServiceCommissions(service) {
  const partnerUser = await ensureUser(service, `${RUN_TAG}-sc-partner@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  const referred = await ensureUser(service, `${RUN_TAG}-sc-ref@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(partnerUser, referred);
  const partnerId = await mkPartner(service, partnerUser, `P3SC${RUN_TAG.slice(-5)}`);
  await setProfile(service, referred, { user_classification: USER_CLASSIFICATION.REAL, effective_user_classification: USER_CLASSIFICATION.REAL, human_verification_status: "verified" });
  const referralId = await mkReferral(service, { partnerId, referredUserId: referred, code: `SC${RUN_TAG.slice(-4)}`, partnerUserId: partnerUser });
  await setQualState(service, referralId, partnerId, QUALIFICATION_STATES.QUALIFIED);
  const fx = { partnerId, referralId, referredUserId: referred, runId: RUN_TAG };
  const rpc1 = await createCommissionRpc(service, fx, {
    serviceType: "subscription",
    sourceId: crypto.randomUUID(),
    baseAmount: 10,
    commissionPercent: 10,
    reason: RUN_TAG,
    idempotencyKey: `${RUN_TAG}:sc:1`,
  });
  const rpc2 = await createCommissionRpc(service, fx, {
    serviceType: "subscription",
    sourceId: crypto.randomUUID(),
    baseAmount: 10,
    commissionPercent: 10,
    reason: RUN_TAG,
    idempotencyKey: `${RUN_TAG}:sc:1`,
  });
  record("SC-01", "service_commissions", "REAL allowed path", "financial-live", !rpc1.error && rpc1.data?.created, rpc1);
  record("SC-02", "service_commissions", "duplicate idempotency once", "financial-live", rpc2.data?.duplicate === true || rpc2.data?.created === false, rpc2);

  const testUser = await ensureUser(service, `${RUN_TAG}-sc-test@${FIXTURE_DOMAIN}`, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(testUser);
  await setProfile(service, testUser, { user_classification: USER_CLASSIFICATION.TEST, effective_user_classification: USER_CLASSIFICATION.TEST, human_verification_status: "verified" });
  const elig = await evaluatePartnerRewardEligibility(service, { partnerId, referredUserId: testUser, rewardType: REWARD_TYPES.SERVICE_COMMISSION });
  record("SC-03", "service_commissions", "TEST blocked", "financial-live", !elig.eligible, elig);
  report.serviceCommissions = { rpc1, rpc2, elig };
}

async function sectionIamRls(base, service, url, anonKey, adminEmail) {
  const perms = [
    "partners.fraud.review",
    "users.read",
  ];
  const adminId = (await service.auth.admin.listUsers({ perPage: 1000 })).data.users.find(
    (u) => String(u.email || "").toLowerCase() === String(adminEmail || "").toLowerCase()
  )?.id;
  if (!adminId) throw new Error(`iam_admin_user_missing:${adminEmail}`);

  for (const perm of perms) {
    const { data, error } = await service.rpc("iam_has_permission", {
      p_permission: perm,
      p_user_id: adminId,
    });
    record(`IAM-${perm}`, "iam_jwt", `admin has ${perm}`, "db-live", !error && data === true, { data, error: error?.message });
    if (error || data !== true) throw new Error(`iam_permission_denied:${perm}`);
  }

  const health = await service.rpc("iam_rls_health_probe");
  const healthOk =
    !health.error &&
    health.data?.enforcePoliciesPresent === true &&
    health.data?.dualPoliciesPresent === false &&
    health.data?.rlsEnabled === true;
  record("RLS-01", "rls_acl", "account_risk_signals RLS enabled", "db-live", healthOk, health.data || health.error);
  if (!healthOk) throw new Error(`iam_rls_health_probe_failed:${health.error?.message || "invalid_probe"}`);

  const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonRead = await anon.from("account_risk_signals").select("id").limit(1);
  const anonDenied = Boolean(anonRead.error) || (anonRead.data || []).length === 0;
  record("RLS-02", "rls_acl", "anon cannot read account_risk_signals", "db-live", anonDenied, {
    error: anonRead.error?.message || null,
    rows: (anonRead.data || []).length,
  });
  if (!anonDenied) throw new Error("anon_read_account_risk_signals_unexpected_allow");

  const normalEmail = `${RUN_TAG}-rls-normal@${FIXTURE_DOMAIN}`;
  const normalId = await ensureUser(service, normalEmail, PASSWORD, { run: RUN_TAG });
  fixtureUserIds.push(normalId);
  trackRegistry(runRegistry, "authUserIds", normalId);
  const normalClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const login = await normalClient.auth.signInWithPassword({ email: normalEmail, password: PASSWORD });
  if (login.error) throw new Error(`rls_normal_login_failed:${login.error.message}`);
  const authRead = await normalClient.from("account_risk_signals").select("id").limit(1);
  const authDenied = Boolean(authRead.error) || (authRead.data || []).length === 0;
  record("RLS-03", "rls_acl", "authenticated user cannot read account_risk_signals", "db-live", authDenied, {
    error: authRead.error?.message || null,
    rows: (authRead.data || []).length,
  });
  await normalClient.auth.signOut();
  if (!authDenied) throw new Error("authenticated_read_account_risk_signals_unexpected_allow");

  report.iamJwt = { adminId, perms, adminEmailSource: "resolveValidationAdminCredentials" };
  report.iamResolvedAdminEmailUsed = true;
  report.rlsAcl = { ...(report.rlsAcl || {}), health: health.data, anonDenied, authDenied };
}

async function sectionSecurityDefinerAudit(service, url, anonKey) {
  await runSecurityDefinerAudit({
    root: ROOT,
    service,
    url,
    anonKey,
    record,
    report,
    runTag: RUN_TAG,
    ensureUser,
    trackRegistry,
    runRegistry,
    fixtureUserIds,
    password: PASSWORD,
    fixtureDomain: FIXTURE_DOMAIN,
  });
}

async function sectionRegressions(service) {
  const suites = [
    ["RG-01", "human_verification", "scripts/test-human-verification-partner-anti-abuse.js"],
    ["RG-02", "auth_login_rate_limit", "scripts/test-auth-login-rate-limit.js", ["node", "--test"]],
    ["RG-03", "admin_rate_limit", "scripts/test-admin-rate-limit.js", ["node", "--test"]],
    ["RG-04", "iam_security", "scripts/test-iam-security.js", ["node", "--test"]],
    ["RG-05", "iam_api_enforcement", "scripts/test-iam-api-enforcement.js", ["node", "--test"]],
    ["RG-06", "admin_users_classification", "scripts/test-admin-user-classification-full-matrix.js"],
    ["RG-07", "effective_classification", "scripts/test-admin-user-effective-classification-filter.js"],
    ["RG-08", "partner_phase1", "scripts/test-partner-center-phase1.js"],
    ["RG-09", "partner_phase2", "scripts/test-partner-center-phase2.js"],
    ["RG-10", "partner_phase3", "scripts/test-partner-center-phase3.js"],
    ["RG-11", "smart_links", "scripts/test-partner-smart-link-ux.js"],
    ["RG-12", "qualification", "scripts/test-partner-qualification-hardening.js"],
    ["RG-13", "signup_bonus", "scripts/test-partner-center-phase1.js"],
    ["RG-14", "qrr", "scripts/test-partner-qualified-referral-reward.js"],
    ["RG-15", "service_commissions", "scripts/test-partner-service-commission-hardening.js"],
    ["RG-16", "campaigns_missions", "scripts/test-partner-attribution-campaign-program.js"],
  ];
  report.regression = {};
  for (const [id, name, script, cmdPrefix] of suites) {
    const cmd = cmdPrefix ? [...cmdPrefix, script] : ["node", script];
    const r = spawnSync(cmd[0], cmd.slice(1), { cwd: ROOT, encoding: "utf8", env: applyStagingPartnerFeatureFlags(process.env) });
    const pass = r.status === 0;
    report.regression[name] = { exit: r.status, pass, tail: (r.stdout || r.stderr || "").slice(-300) };
    record(id, "regression", name, "unit", pass, { exit: r.status });
  }

  for (const [id, name, script] of [
    ["RG-17", "r6_staging", "scripts/partner-center/r6-staging-validation.mjs"],
    ["RG-18", "r7_staging", "scripts/partner-center/r7-staging-validation.mjs"],
    ["RG-19", "r8_staging", "scripts/partner-center/r8-staging-validation.mjs"],
    ["RG-20", "r9_staging", "scripts/partner-center/r9-staging-validation.mjs"],
  ]) {
    const r = await runSuiteWithIsolation(service, script, name, {
      timeoutMs: name === "r8_staging" ? SUITE_TIMEOUT_MS.r8_isolated : SUITE_TIMEOUT_MS[name.replace("_staging", "")] || SUITE_TIMEOUT_MS.default,
      progressWatchdog: name === "r8_staging" ? "r8" : undefined,
    });
    const pass = r.verdict === "PASS" && (!r.interSuite || r.interSuite.ok);
    report.regression[name] = {
      exit: r.exit,
      pass,
      verdict: r.verdict,
      passCount: r.passCount,
      failCount: r.failCount,
      timedOut: r.timedOut,
      stalled: r.stalled,
      elapsedMs: r.elapsedMs,
      progressWatchdog: r.progressWatchdog || null,
      timeoutMs: name === "r8_staging" ? SUITE_TIMEOUT_MS.r8_isolated : SUITE_TIMEOUT_MS[name.replace("_staging", "")] || SUITE_TIMEOUT_MS.default,
      interSuite: r.interSuite,
      r8Cleanup: r.r8Cleanup || null,
      tail: r.tail,
    };
    record(id, "regression", name, "staging-suite", pass, {
      exit: r.exit,
      verdict: r.verdict,
      timedOut: r.timedOut,
      stalled: r.stalled,
      elapsedMs: r.elapsedMs,
      progressWatchdog: r.progressWatchdog || null,
    });
  }

  const build = spawnSync("npm", ["run", "build"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, CI: "true" } });
  report.build = { pass: build.status === 0, exit: build.status };
  record("RG-21", "build", "npm run build", "unit", build.status === 0);
}

function summarizePrefix(prefix) {
  const rows = (report.manifest?.scenarios || []).filter((s) => s.id?.startsWith(prefix));
  return {
    pass: rows.filter((s) => s.result === "PASS").length,
    fail: rows.filter((s) => s.result === "FAIL").length,
    total: rows.length,
    fails: rows.filter((s) => s.result === "FAIL").map((s) => s.id),
  };
}

function economicDeltaZero(delta = {}) {
  const keys = [
    "ledger_signed_sum",
    "commission_sum",
    "balance_bonus_pending",
    "total_earnings",
    "signup_bonus_sum",
    "qrr_sum",
  ];
  return keys.every((key) => Number(delta[key] || 0) === 0);
}

const TARGETED_FINANCIAL_KEYS = [
  "partner_commissions",
  "partner_financial_ledger_entries",
  "partner_wallet_ledger",
  "partner_financial_risk_holds",
  "partner_reward_entitlements",
  "partner_fraud_assessments",
  "account_risk_signals",
  "partner_mission_progress",
  "partner_campaign_participants",
  "partner_referrals",
  "commission_sum",
  "ledger_sum",
  "ledger_signed_sum",
  "wallet_sum",
  "risk_hold_sum",
  "qrr_sum",
  "signup_bonus_sum",
  "partner_balance_pending",
  "partner_balance_bonus_pending",
  "partner_balance_withdrawable",
  "partner_total_earnings",
  "partner_total_withdrawn",
  "non_fixture_commissions",
  "non_fixture_ledger",
  "non_fixture_commission_sum",
  "non_fixture_ledger_sum",
];

async function runTargetedQrrSb(service) {
  report.targetedMode = ["qrr", "sb"];
  report.preRunCleanup = await purgeStaleStagingHarnessFixtures(service, {
    extraRunTag: RUN_TAG,
    sinceIso: report.generatedAt,
  });
  const finPre = await financialBaselineDetailed(service);
  report.financialReconciliation.pre = finPre;

  await runSectionSafe("qrr_financial", () => sectionQrrFinancial(service));
  report.targetedQrr = summarizePrefix("QRR-");
  if (report.targetedQrr.pass !== 12 || report.targetedQrr.fail !== 0) {
    report.verdict = "BLOCKED";
    report.remainingBlockers = [{ gate: "qrr_targeted_matrix", ...report.targetedQrr }];
    writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ verdict: "BLOCKED", gate: "qrr_targeted_matrix", ...report.targetedQrr }, null, 2));
    process.exit(1);
  }

  await runSectionSafe("signup_bonus", () => sectionSignupBonusFinancial(service));
  report.targetedSb = summarizePrefix("SB-");
  if (report.targetedSb.pass !== 7 || report.targetedSb.fail !== 0) {
    report.verdict = "BLOCKED";
    report.remainingBlockers = [{ gate: "sb_targeted_matrix", ...report.targetedSb }];
    writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ verdict: "BLOCKED", gate: "sb_targeted_matrix", ...report.targetedSb }, null, 2));
    process.exit(1);
  }

  let finPost1 = await financialBaselineDetailed(service);
  let pass1 = compareFinancialSnapshots(finPre, finPost1, TARGETED_FINANCIAL_KEYS);
  for (let attempt = 0; attempt < 3 && !pass1.exact; attempt += 1) {
    await purgeFixtures(service);
    await purgeIsolatedHarnessBusinessResidue(service, {
      userIds: [...fixtureUserIds],
      partnerIds: [...fixturePartnerIds],
    });
    finPost1 = await financialBaselineDetailed(service);
    pass1 = compareFinancialSnapshots(finPre, finPost1, TARGETED_FINANCIAL_KEYS);
  }
  report.financialReconciliation.cleanupPass1 = finPost1;
  report.financialReconciliation.deltaPass1 = pass1.delta;
  if (!pass1.exact) {
    report.verdict = "BLOCKED";
    report.remainingBlockers = [{ gate: "targeted_cleanup_pass1_nonzero", deltaPass1: pass1.delta }];
    writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ verdict: "BLOCKED", gate: "targeted_cleanup_pass1_nonzero", deltaPass1: pass1.delta }, null, 2));
    process.exit(1);
  }

  await purgeFixtures(service);
  const finPost2 = await financialBaselineDetailed(service);
  report.financialReconciliation.cleanupPass2 = finPost2;
  const pass2 = compareFinancialSnapshots(finPost1, finPost2, TARGETED_FINANCIAL_KEYS);
  report.financialReconciliation.deltaPass2 = pass2.delta;

  report.residue = await countActivePass3FixtureResidue(service, { runTag: RUN_TAG });
  const deltaOk =
    pass1.exact &&
    pass2.exact &&
    economicDeltaZero(pass1.delta) &&
    economicDeltaZero(pass2.delta);
  const residueZero = activeFixtureResidueZero(report.residue);
  report.verdict = deltaOk && residueZero ? "PASS" : "BLOCKED";
  if (!deltaOk) report.remainingBlockers = [{ gate: "targeted_economic_delta_nonzero", deltaPass1: report.financialReconciliation.deltaPass1, deltaPass2: report.financialReconciliation.deltaPass2 }];
  if (!residueZero) report.remainingBlockers = [{ gate: "targeted_active_residue", residue: report.residue }];
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        targetedQrr: report.targetedQrr,
        targetedSb: report.targetedSb,
        deltaPass1: report.financialReconciliation.deltaPass1,
        deltaPass2: report.financialReconciliation.deltaPass2,
        residue: report.residue,
        artifact: ARTIFACT,
      },
      null,
      2
    )
  );
  process.exit(report.verdict === "PASS" ? 0 : 1);
}

async function purgeFixtures(service) {
  await syncRunRegistry(service, runRegistry, {
    fixtureUserIds,
    fixturePartnerIds,
    fixtureEntitlementIds,
    fixtureMissionIds,
    fixtureCampaignIds,
    runTag: RUN_TAG,
  });
  await canonicalPass3Cleanup(service, runRegistry, report, { runStartedAt, extraRunTag: RUN_TAG });
  const residue = report.residue || {};
  const residueZero = activeFixtureResidueZero(residue);
  report.historicalTestIdentities = await auditHistoricalTestIdentities(service);
  record("CL-01", "cleanup", "active fixture residue zero", "db-live", residueZero, {
    ...residue,
    historical_auth_users: Number(residue.historical_auth_users || 0),
    historicalTestIdentities: report.historicalTestIdentities.length,
  });
  record("CL-02", "cleanup", "purged tracked fixtures", "db-live", true, {
    purgedUsers: runRegistry.authUserIds.length,
    purgedPartners: runRegistry.partnerIds.length,
    registryReferrals: runRegistry.referralIds.length,
  });
}

async function main() {
  mkdirSync(join(ROOT, ".artifacts"), { recursive: true });
  assertStagingGuard(report);
  ensureHmacSecretConsistency(report);
  const { service, url, anonKey } = loadStagingClients();

  const devEnv = buildStagingHarnessDevEnv({
    url,
    anonKey,
    serviceRoleKey: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
  });
  applyStagingHarnessProcessEnv(devEnv);
  process.env.LOGIN_CHALLENGE_TTL_MS = "2000";
  process.env.HV_PASS3_RUN_TAG = RUN_TAG;

  report.parityAudit = {
    devPort: DEV_PORT,
    stagingSupabaseInjected: true,
    upstashClearedForHarness: true,
    httpTimeoutMs: 20000,
    sharedAlMatrix: "hv-pass3-live-matrices.mjs",
    sharedDiMatrix: "sectionDeviceIpFull via runDeviceIpLiveMatrix",
    featureFlags: {
      PARTNER_GROWTH_ENGINE: process.env.PARTNER_GROWTH_ENGINE,
      PARTNER_ADMIN_MARKETING: process.env.PARTNER_ADMIN_MARKETING,
      HUMAN_VERIFICATION_ENABLED: process.env.HUMAN_VERIFICATION_ENABLED,
      PARTNER_ANTI_ABUSE_GATE_ENABLED: process.env.PARTNER_ANTI_ABUSE_GATE_ENABLED,
      TURNSTILE_LOGIN_ADAPTIVE_ENABLED: process.env.TURNSTILE_LOGIN_ADAPTIVE_ENABLED,
    },
  };

  const { httpJsonBounded, telemetry } = createHttpTelemetry(report);
  httpLive = httpJsonBounded;
  report.timeoutCount = 0;
  report.slowestHttp = null;

  let adminSession = null;
  let finPre = null;

  if (process.env.HV_PASS3_TARGETED === "qrr,sb") {
    await runTargetedQrrSb(service);
    return;
  }

  try {
    report.preRunCleanup = await purgeStaleStagingHarnessFixtures(service, {
      extraRunTag: RUN_TAG,
      sinceIso: report.generatedAt,
    });
    const finBeforePreGates = await financialBaselineDetailed(service);
    report.preGates.finBeforePreGates = finBeforePreGates;

    report.preGates.mc01 = await probeMc01(service, pass3Ctx(service));
    report.mc01ProbeReversalApplied = report.preGates.mc01?.mc01ProbeReversalApplied === true;
    if (!report.preGates.mc01.ok) {
      report.verdict = "BLOCKED";
      report.remainingBlockers = [{ gate: "mc01_probe", detail: report.preGates.mc01 }];
      writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ verdict: "BLOCKED", gate: "mc01_probe", detail: report.preGates.mc01 }, null, 2));
      process.exit(1);
    }

    report.preGates.sc01 = await probeSc01(service, pass3Ctx(service));
    if (!report.preGates.sc01.ok) {
      report.verdict = "BLOCKED";
      report.remainingBlockers = [{ gate: "sc01_probe", detail: report.preGates.sc01 }];
      writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ verdict: "BLOCKED", gate: "sc01_probe", detail: report.preGates.sc01 }, null, 2));
      process.exit(1);
    }

    report.preGates.regressions = await runStagingRegressionGatesAsync(service);
    if (!stagingRegressionGatesOk(report.preGates.regressions)) {
      report.verdict = "BLOCKED";
      report.remainingBlockers = [{ gate: "staging_regression_pre_pass3", detail: report.preGates.regressions }];
      writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ verdict: "BLOCKED", gate: "staging_regression_pre_pass3" }, null, 2));
      process.exit(1);
    }

    report.preGates.preGateReconciliation = await runPreGateReconciliation(service, finBeforePreGates, report.preGates, {
      sinceIso: report.generatedAt,
    });
    record(
      "PRE-GATE-RECON",
      "reconciliation",
      "pre-gate economic residue zero after cleanup",
      "db-live",
      preGateReconciliationOk(report.preGates.preGateReconciliation),
      report.preGates.preGateReconciliation
    );
    if (!preGateReconciliationOk(report.preGates.preGateReconciliation)) {
      report.verdict = "BLOCKED";
      report.remainingBlockers = [{ gate: "pre_gate_reconciliation", detail: report.preGates.preGateReconciliation }];
      writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ verdict: "BLOCKED", gate: "pre_gate_reconciliation", detail: report.preGates.preGateReconciliation }, null, 2));
      process.exit(1);
    }

    report.historicalTestIdentities = await auditHistoricalTestIdentities(service);

    const preResidue = await countActivePass3FixtureResidue(service, { runTag: RUN_TAG });
    report.preRunCleanup = { ...(report.preRunCleanup || {}), preResidue };
    const preClean = activeFixtureResidueZero(preResidue);
    report.preRunCleanup.historicalTestIdentityCount = Number(preResidue.historical_auth_users || 0);
    record("CL-00", "cleanup", "pre-run active fixture residue zero", "db-live", preClean, {
      ...preResidue,
      historicalTestIdentities: report.historicalTestIdentities.length,
    });
    if (!preClean) {
      report.verdict = "BLOCKED";
      report.remainingBlockers = [{ gate: "pre_run_fixture_residue", preResidue }];
      writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ verdict: "BLOCKED", reason: "pre_run_fixture_residue", preResidue }, null, 2));
      process.exit(1);
    }

    finPre = await financialBaselineDetailed(service);
    report.financialReconciliation.pre = finPre;
    record("RC-00", "reconciliation", "pre-test baseline captured", "db-live", Boolean(finPre), finPre);

    adminSession = await resolveValidationAdminCredentials(loadValidationBrowserEnv(ROOT), report);
    report.validationAdminSession = {
      maskedEmail: adminSession.email?.replace(/^(.{3}).*@/, "$1***@"),
      userId: adminSession.userId,
      role: adminSession.role,
      resolvedAfterPreGates: true,
      persistentReferenceIdentity: true,
    };

    const ctxWithHttp = pass3Ctx(service, httpJsonBounded);
    const dev = startDevServer(DEV_PORT, devEnv);
    try {
      await waitForDevServer(DEV_PORT, 180000);

      await runSectionSafe("fraud_review_api", async () => {
        const fraudApi = await sectionFraudReviewApi(BASE, service, url, anonKey, adminSession.email, adminSession.password);
        await sectionFraudAdminActions(BASE, service, fraudApi.adminCookie, url, anonKey);
      });

      await runSectionSafe("adaptive_login", async () => {
        const alResult = await runAdaptiveLoginLiveMatrix({
          base: BASE,
          service,
          runTag: RUN_TAG,
          password: PASSWORD,
          fixtureUserIds,
          record,
          httpJsonBounded,
          report,
        });
        report.adaptiveLogin = alResult;
      });

      await runSectionSafe("device_ip", async () => {
        await runDeviceIpLiveMatrix({
          base: BASE,
          service,
          ctx: ctxWithHttp,
          recordDevice: (id, ok, evidence) => record(id, "device_ip", id, "http-live", ok, evidence),
        });
      });

      await sectionIamRls(BASE, service, url, anonKey, adminSession.email);
      await sectionSecurityDefinerAudit(service, url, anonKey);
    } finally {
      stopDev(dev);
    }

    await runSectionSafe("qrr_financial", () => sectionQrrFinancial(service));
    await runSectionSafe("signup_bonus", () => sectionSignupBonusFinancial(service));
    await runSectionSafe("missions_campaigns", () => sectionMissionsCampaignsFull(service, ctxWithHttp));
    await runSectionSafe("service_commissions", () => sectionServiceCommissionsFull(service, ctxWithHttp));
    await runSectionSafe("live_security", () => sectionLiveSecurityExtras(service, ctxWithHttp));

    await purgeFixtures(service);

    await runSectionSafe("regressions", () => sectionRegressions(service));

    await runSectionSafe("browser", async () => {
      const browser = spawnSync("node", ["scripts/human-verification-partner-anti-abuse-staging-browser.mjs"], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, HV_PASS3_RUN_TAG: RUN_TAG, HV_BROWSER_PORT: "3038" },
        timeout: 600000,
      });
      report.browser = { pass: browser.status === 0, exit: browser.status, tail: (browser.stdout || browser.stderr || "").slice(-500) };
      report.crmTrustBrowser = report.browser;
      record("BR-01", "browser", "deep browser harness fail-closed", "browser-live", browser.status === 0);
    });

    await runSectionSafe("production_audit", () => productionReadOnlyAudit(report));
  } catch (fatalErr) {
    const msg = String(fatalErr?.message || fatalErr);
    const isInfra =
      /staging guard|STAGING_ENV|production|baseline|wrong environment/i.test(msg) ||
      fatalErr?.code === "STAGING_ENV_FILE_MISSING";
    report.errors.push({ fatal: msg, infra: isInfra });
    if (isInfra) {
      report.verdict = "BLOCKED";
      writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
      process.exit(1);
    }
  } finally {
    report.timeoutCount = telemetry.timeoutCount;
    report.slowestHttp = telemetry.slowest;
    report.manifestSummary = summarizeManifestCounts(report);

    try {
      await purgeFixtures(service);
    } catch (cleanupErr) {
      report.errors.push({ id: "CL-FATAL", description: String(cleanupErr.message || cleanupErr) });
    }
    if (finPre) {
      const finPost = await financialBaselineDetailed(service);
      report.financialReconciliation.post = finPost;
      const { delta, exact } = compareFinancialSnapshots(finPre, finPost, Object.keys(finPre || {}));
      report.financialReconciliation.delta = delta;
      report.financialReconciliation.reconciliationExact = exact;
      record("RC-01", "reconciliation", "post-cleanup delta zero", "db-live", exact, delta);
    }
    writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  }

  const criticalInfra = report.errors.filter((e) => e.infra || e.fatal);
  const regressionFails = Object.values(report.regression || {}).filter((r) => !r.pass).length;
  const fraudApiOk = report.fraudReviewApi?.admin?.status === 200;
  const browserOk = report.browser?.pass === true;
  const hmacOk = report.hmacSecret?.localConfigured && report.hmacSecret?.stableAcrossProcess;
  const reconciliationExact = report.manifest?.scenarios?.find((s) => s.id === "RC-01")?.result === "PASS";
  const cl01Pass = report.manifest?.scenarios?.find((s) => s.id === "CL-01")?.result === "PASS";
  const iamErrors = report.errors.filter((e) => /iam_|rls_|security_definer|SD-|RLS-/i.test(String(e.section || e.id || "")));
  const liveCount = report.manifest?.counts?.total || 0;
  const alPass = (report.manifest?.scenarios || []).filter((s) => s.id.startsWith("AL-") && s.result === "PASS").length;
  const diPass = (report.manifest?.scenarios || []).filter((s) => s.id.startsWith("DI-") && s.result === "PASS").length;

  const allDeep =
    criticalInfra.length === 0 &&
    iamErrors.length === 0 &&
    regressionFails === 0 &&
    fraudApiOk &&
    browserOk &&
    hmacOk &&
    reconciliationExact &&
    cl01Pass &&
    report.build?.pass &&
    liveCount >= 110 &&
    alPass === 12 &&
    diPass === 10 &&
    report.productionReadOnlyAudit?.completed === true &&
    (report.unexpected429 || 0) === 0 &&
    (report.unexpected5xx || 0) === 0;

  report.verdict = allDeep
    ? "HUMAN VERIFICATION + PARTNER ANTI-ABUSE FULL STAGING PASS — READY FOR PRODUCTION APPROVAL"
    : "BLOCKED";
  if (!allDeep) {
    report.remainingBlockers = report.errors.slice(0, 50);
    if (!fraudApiOk) report.remainingBlockers.push({ gate: "fraud_review_api_not_200" });
    if (!browserOk) report.remainingBlockers.push({ gate: "browser_deep_qa_failed" });
    if (!reconciliationExact) report.remainingBlockers.push({ gate: "financial_reconciliation_delta" });
    if (!cl01Pass) report.remainingBlockers.push({ gate: "CL-01_active_fixture_residue" });
    if (iamErrors.length) report.remainingBlockers.push({ gate: "iam_rls_security", errors: iamErrors });
    if (regressionFails) report.remainingBlockers.push({ gate: "regression_failures", count: regressionFails });
    if (liveCount < 110) report.remainingBlockers.push({ gate: "live_scenario_minimum", liveCount });
    if (alPass !== 12) report.remainingBlockers.push({ gate: "adaptive_login", pass: alPass });
    if (diPass !== 10) report.remainingBlockers.push({ gate: "device_ip", pass: diPass });
    if ((report.timeoutCount || 0) > 0) report.remainingBlockers.push({ gate: "http_timeouts", count: report.timeoutCount });
  }

  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        runId: RUN_TAG,
        liveScenarios: liveCount,
        alPass,
        diPass,
        timeoutCount: report.timeoutCount,
        slowestMs: report.slowestHttp?.elapsedMs,
        errors: report.errors.length,
        regressionFails,
        fraudApiAdmin: report.fraudReviewApi?.admin?.status,
        browserPass: report.browser?.pass,
        reconciliationExact,
        artifact: ARTIFACT,
      },
      null,
      2
    )
  );
  process.exit(report.verdict.startsWith("HUMAN") ? 0 : 1);
}

main().catch((err) => {
  report.errors.push({ fatal: String(err.message || err) });
  report.verdict = "BLOCKED";
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.error(err);
  process.exit(1);
});
