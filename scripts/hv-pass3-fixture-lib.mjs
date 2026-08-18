/**
 * Pass3 / blocker-closure fixture helpers — staging harness only.
 */
import { FIXTURE_DOMAIN } from "./hv-abuse-pass2-lib.mjs";
import {
  purgeRunCommissionsRpc,
  purgeAllPass3StagingFixtures,
  activeFixtureResidueZero,
} from "./hv-pass3-cleanup-lib.mjs";
import { USER_CLASSIFICATION, resolveEffectiveUserClassification } from "../lib/user-classification.js";
import {
  resolveHumanVerificationState,
  HUMAN_VERIFICATION_STATUSES,
} from "../lib/security/human-verification.js";
import { evaluatePartnerRewardEligibility, REWARD_TYPES } from "../lib/partner-center/partner-reward-eligibility.js";
import { FRAUD_RISK_LEVELS } from "../lib/partner-center/constants.js";
import { reversePartnerServiceCommissionAtomic } from "../lib/partner-center/financial-gateway.js";
import { reverseGrowthRewardEntitlement } from "../lib/partner-center/growth-refund-integration.js";
import { reverseR8FixtureCommissionsEconomically } from "./partner-center/r8-staging-harness-lib.mjs";

export function buildValidStagingTestEmail(prefix, runId) {
  const safePrefix = String(prefix || "u")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 12)
    .toLowerCase() || "u";
  const safeRun = String(runId || "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(-20)
    .toLowerCase() || String(Date.now());
  return `${safePrefix}${safeRun}@${FIXTURE_DOMAIN}`;
}

export function usernameFromEmail(email) {
  const local = String(email || "").split("@")[0] || "user";
  return `u${local.replace(/[^a-z0-9]/gi, "").slice(-14)}`.slice(0, 20) || "user1";
}

export function createRunRegistry() {
  return {
    authUserIds: [],
    profileIds: [],
    partnerIds: [],
    referralIds: [],
    qualificationIds: [],
    riskSignalIds: [],
    fraudAssessmentIds: [],
    entitlementIds: [],
    commissionIds: [],
    ledgerIds: [],
    walletIds: [],
    missionIds: [],
    campaignIds: [],
    subscriptionIds: [],
    idempotencyKeys: [],
    runTag: null,
  };
}

export function trackRegistry(registry, bucket, id) {
  if (!registry || id == null || id === "") return;
  const key = bucket;
  if (!Array.isArray(registry[key])) registry[key] = [];
  if (!registry[key].includes(id)) registry[key].push(id);
}

export async function setRealVerifiedProfile(service, userId, { runTag, email } = {}) {
  const authRes = await service.auth.admin.getUserById(userId).catch(() => ({ data: { user: null } }));
  const userEmail = email || authRes?.data?.user?.email || "";
  const now = new Date().toISOString();
  const { error } = await service.from("profiles").upsert(
    {
      id: userId,
      email: userEmail,
      username: usernameFromEmail(userEmail),
      role: "user",
      user_classification: USER_CLASSIFICATION.REAL,
      effective_user_classification: USER_CLASSIFICATION.REAL,
      user_classification_source: "admin_manual",
      human_verification_status: HUMAN_VERIFICATION_STATUSES.VERIFIED,
      human_verified_at: now,
      partner_reward_eligibility_status: "eligible",
      partner_reward_eligibility_at: now,
      partner_reward_risk_level: FRAUD_RISK_LEVELS.LOW,
    },
    { onConflict: "id" }
  );
  if (error) throw error;
  await service.auth.admin.updateUserById(userId, { email_confirm: true }).catch(() => null);
}

export async function findAuthUserIdByEmailPaginated(service, email, { maxPages = 25, pageSize = 200 } = {}) {
  const normalized = String(email || "").trim().toLowerCase();
  for (let page = 1; page <= maxPages; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: pageSize });
    if (error) throw error;
    const found = (data?.users || []).find((u) => String(u.email || "").trim().toLowerCase() === normalized);
    if (found?.id) return found.id;
    if ((data?.users?.length || 0) < pageSize) break;
  }
  return null;
}

/** Provenance-only auth actor for created_by FKs on isolated/staging harness runs. */
export async function ensureValidationAdminActorFixture(service, { runTag, label = "validation-admin" } = {}) {
  const isolated = process.env.HV_VALIDATION_TARGET === "isolated";
  const domain = isolated ? "isolated-hcw.test" : FIXTURE_DOMAIN;
  const safeRun = String(runTag || Date.now())
    .replace(/[^a-z0-9]/gi, "")
    .slice(-24)
    .toLowerCase() || "run";
  const email = isolated
    ? `isolated-r7-admin-${safeRun}@${domain}`
    : `staging-validation-admin-${safeRun}@${domain}`;
  const password = process.env.STAGING_IAM_TEST_PASSWORD || "StagingTestPass!2026";

  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { validation_admin_actor: true, runTag: runTag || null, label },
  });
  let userId = data?.user?.id || null;
  if (!userId) {
    if (error && !String(error.message || "").toLowerCase().includes("already")) {
      throw new Error(`R7_CREATED_BY_FIXTURE_MISSING:create_failed:${error.message}`);
    }
    userId = await findAuthUserIdByEmailPaginated(service, email);
  }
  if (!userId) {
    throw new Error(`R7_CREATED_BY_FIXTURE_MISSING:unresolved_email:${email}`);
  }

  const { error: profileErr } = await service.from("profiles").upsert(
    {
      id: userId,
      email,
      username: usernameFromEmail(email),
      role: "user",
    },
    { onConflict: "id" }
  );
  if (profileErr) {
    throw new Error(`R7_CREATED_BY_FIXTURE_MISSING:profile:${profileErr.message}`);
  }

  return { userId, email, domain, isolated, provenanceOnly: true };
}

export async function setClassifiedProfile(service, userId, classification) {
  const now = new Date().toISOString();
  await service
    .from("profiles")
    .update({
      user_classification: classification,
      effective_user_classification: classification,
      user_classification_source: "admin_manual",
      human_verification_status: HUMAN_VERIFICATION_STATUSES.VERIFIED,
      human_verified_at: now,
    })
    .eq("id", userId);
  await service.auth.admin.updateUserById(userId, { email_confirm: true }).catch(() => null);
}

export async function assertMcPreReal(service, { partnerId, partnerUserId }) {
  const [{ data: profile }, authUserResult] = await Promise.all([
    service
      .from("profiles")
      .select(
        "id, email, user_classification, effective_user_classification, user_classification_source, human_verification_status, partner_reward_eligibility_status"
      )
      .eq("id", partnerUserId)
      .maybeSingle(),
    service.auth.admin.getUserById(partnerUserId).catch(() => ({ data: { user: null } })),
  ]);
  const authUser = authUserResult?.data?.user || null;
  const effective = resolveEffectiveUserClassification(profile || {}, authUser);
  const human = resolveHumanVerificationState({
    humanVerificationStatus: profile?.human_verification_status,
    emailConfirmedAt: authUser?.email_confirmed_at,
    turnstileVerified: profile?.human_verification_status === HUMAN_VERIFICATION_STATUSES.VERIFIED,
  });
  const elig = await evaluatePartnerRewardEligibility(service, {
    partnerId,
    referredUserId: partnerUserId,
    rewardType: REWARD_TYPES.MISSION,
  });
  return {
    ok:
      effective.classification === USER_CLASSIFICATION.REAL &&
      human.status === HUMAN_VERIFICATION_STATUSES.VERIFIED &&
      elig.eligible === true &&
      !elig.holdRequired,
    effective: effective.classification,
    human: human.status,
    eligibility: elig,
    profile,
  };
}

export async function insertFraudAssessment(service, registry, row) {
  const payload = {
    context_type: row.context_type || "manual_review",
    signals: row.signals || [],
    score: row.score ?? 90,
    ...row,
  };
  delete payload.metadata;
  if (row.metadata && !payload.signals?.length) {
    payload.signals = [{ run: row.metadata?.run, probe: row.metadata?.probe }];
  }
  const { data, error } = await service.from("partner_fraud_assessments").insert(payload).select("id").single();
  if (error) throw error;
  trackRegistry(registry, "fraudAssessmentIds", data.id);
  return data.id;
}

export async function syncRunRegistry(
  service,
  registry,
  {
    fixtureUserIds = [],
    fixturePartnerIds = [],
    fixtureEntitlementIds = [],
    fixtureMissionIds = [],
    fixtureCampaignIds = [],
    runTag = null,
  } = {}
) {
  for (const id of fixtureUserIds) trackRegistry(registry, "authUserIds", id);
  for (const id of fixturePartnerIds) trackRegistry(registry, "partnerIds", id);
  for (const id of fixtureEntitlementIds) trackRegistry(registry, "entitlementIds", id);
  for (const id of fixtureMissionIds) trackRegistry(registry, "missionIds", id);
  for (const id of fixtureCampaignIds) trackRegistry(registry, "campaignIds", id);

  if (registry?.partnerIds?.length) {
    const { data: refs } = await service
      .from("partner_referrals")
      .select("id, referred_user_id")
      .in("partner_id", registry.partnerIds);
    for (const row of refs || []) {
      trackRegistry(registry, "referralIds", row.id);
      trackRegistry(registry, "authUserIds", row.referred_user_id);
    }
  }

  if (runTag) {
    const { data: ents } = await service
      .from("partner_reward_entitlements")
      .select("id, partner_id")
      .or(`idempotency_key.ilike.%${runTag}%,metadata->>run.eq.${runTag}`);
    for (const row of ents || []) {
      trackRegistry(registry, "entitlementIds", row.id);
      trackRegistry(registry, "partnerIds", row.partner_id);
    }

    const { data: signals } = await service
      .from("account_risk_signals")
      .select("id, user_id")
      .filter("metadata->>run", "eq", runTag);
    for (const row of signals || []) {
      trackRegistry(registry, "riskSignalIds", row.id);
      trackRegistry(registry, "authUserIds", row.user_id);
    }

    const { data: fraudRows } = await service
      .from("partner_fraud_assessments")
      .select("id, partner_id")
      .filter("metadata->>run", "eq", runTag);
    for (const row of fraudRows || []) {
      trackRegistry(registry, "fraudAssessmentIds", row.id);
      trackRegistry(registry, "partnerIds", row.partner_id);
    }
  }
}

export async function canonicalPass3Cleanup(service, registry, report = {}, { runStartedAt = null, extraRunTag = null } = {}) {
  await cleanupRunRegistry(service, registry, report, { runStartedAt });
  const scoped = await purgeAllPass3StagingFixtures(service, { extraRunTag: extraRunTag || registry?.runTag });
  report.fixtureCleanup = {
    ...(report.fixtureCleanup || {}),
    ...scoped,
    registryCleanupSteps: report.cleanupSteps || [],
  };
  report.residue = scoped.residue;
  report.cl01ActiveResidueZero = activeFixtureResidueZero(scoped.residue);
  return report;
}

export async function reverseRunFinancialArtifacts(service, registry, runStartedAt) {
  const partnerIds = [...new Set(registry?.partnerIds || [])];
  const runTag = registry?.runTag || "";
  const reason = runTag || "fixture_cleanup";
  if (partnerIds.length) {
    await reverseR8FixtureCommissionsEconomically(service, {
      partnerIds,
      sinceIso: runStartedAt || null,
      reason,
    });
  }

  for (const pid of partnerIds) {
    const { data: ents } = await service
      .from("partner_reward_entitlements")
      .select("id, status")
      .eq("partner_id", pid);
    for (const e of ents || []) {
      if (e.status === "reversed") continue;
      try {
        await reverseGrowthRewardEntitlement(service, e.id, { reason });
      } catch {
        /* ignore */
      }
    }
  }
}

export async function purgePriorBlockerFixtures(service) {
  const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 });
  const users = (list?.users || []).filter((u) => {
    const email = String(u.email || "");
    return email.endsWith("@staging-hcw.test") && /blocker\d/i.test(email);
  });
  const partnerIds = [];
  for (const u of users) {
    const { data: partners } = await service.from("partners").select("id").eq("user_id", u.id);
    for (const p of partners || []) partnerIds.push(p.id);
  }
  const uniquePartnerIds = [...new Set(partnerIds)];
  if (uniquePartnerIds.length) {
    await purgeRunCommissionsRpc(service, uniquePartnerIds, null);
  }
  for (const pid of uniquePartnerIds) {
    for (const table of [
      "partner_mission_progress",
      "partner_campaign_participants",
      "partner_qualified_referral_reward_credits",
      "partner_service_commission_entitlements",
      "partner_reward_entitlements",
      "partner_financial_risk_holds",
      "partner_commissions",
      "partner_wallet_ledger",
      "partner_fraud_assessments",
      "partner_referrals",
    ]) {
      try {
        await service.from(table).delete().eq("partner_id", pid);
      } catch {
        /* ignore */
      }
    }
    try {
      await service.from("partners").delete().eq("id", pid);
    } catch {
      /* ignore */
    }
  }
  for (const u of users) {
    try {
      await service.from("account_risk_signals").delete().eq("user_id", u.id);
    } catch {
      /* ignore */
    }
    try {
      await service.from("partner_referral_qualifications").delete().eq("referred_user_id", u.id);
    } catch {
      /* ignore */
    }
    try {
      await service.from("profiles").delete().eq("id", u.id);
    } catch {
      /* ignore */
    }
    await service.auth.admin.deleteUser(u.id).catch(() => null);
  }
  try {
    await service.from("partner_mission_definitions").delete().like("code", "P3MIS%");
  } catch {
    /* ignore */
  }
  try {
    await service.from("partner_campaign_programs").delete().like("code", "P3C%");
  } catch {
    /* ignore */
  }
  return { users: users.length, partners: uniquePartnerIds.length };
}

export async function cleanupRunRegistry(service, registry, report = {}, { runStartedAt = null, skipFinancialReverse = false, skipPurgeRpc = false } = {}) {
  const steps = [];
  const partnerIds = [...new Set(registry?.partnerIds || [])];
  const authUserIds = [...new Set(registry?.authUserIds || [])];

  if (!skipFinancialReverse) {
    await reverseRunFinancialArtifacts(service, registry, runStartedAt);
  }
  if (!skipPurgeRpc) {
    const rpcPurge = await purgeRunCommissionsRpc(service, partnerIds, runStartedAt);
    steps.push({ step: "purge_run_commissions_rpc", ok: !rpcPurge.error, ...rpcPurge });
  } else {
    steps.push({ step: "purge_run_commissions_rpc", skipped: true, reason: "pregate_atomic_reversal_only" });
  }

  for (const pid of partnerIds) {
    for (const table of [
      "partner_mission_progress",
      "partner_campaign_participants",
      "partner_qualified_referral_reward_credits",
      "partner_service_commission_entitlements",
      "partner_reward_entitlements",
      "partner_financial_risk_holds",
      "partner_commissions",
      "partner_wallet_ledger",
      "partner_fraud_assessments",
      "partner_referrals",
    ]) {
      const { error } = await service.from(table).delete().eq("partner_id", pid);
      steps.push({ table, partnerId: pid, ok: !error, error: error?.message || null });
    }
    const { error: pErr } = await service.from("partners").delete().eq("id", pid);
    steps.push({ table: "partners", partnerId: pid, ok: !pErr, error: pErr?.message || null });
  }

  for (const uid of authUserIds) {
    if (runStartedAt) {
      await service.from("account_risk_signals").delete().eq("user_id", uid).gte("created_at", runStartedAt);
    }
    await service.from("partner_referral_qualifications").delete().eq("referred_user_id", uid);
    await service.from("partner_referrals").delete().eq("referred_user_id", uid);
    await service.from("profiles").delete().eq("id", uid);
    await service.auth.admin.deleteUser(uid).catch(() => null);
  }

  for (const missionId of registry?.missionIds || []) {
    await service.from("partner_mission_definitions").delete().eq("id", missionId);
  }
  for (const campaignId of registry?.campaignIds || []) {
    await service.from("partner_campaign_programs").delete().eq("id", campaignId);
  }
  for (const subId of registry?.subscriptionIds || []) {
    await service.from("subscription_requests").delete().eq("id", subId);
  }
  if (registry?.runTag) {
    await service.from("partner_commissions").delete().ilike("idempotency_key", `%${registry.runTag}%`);
    await service.from("partner_reward_entitlements").delete().ilike("idempotency_key", `%${registry.runTag}%`);
    await service.from("account_risk_signals").delete().filter("metadata->>run", "eq", registry.runTag);
    await service.from("account_risk_signals").delete().filter("metadata->>run", "like", "%hv-pass3-%");
    await service.from("account_risk_signals").delete().filter("metadata->>scenario", "eq", "LIVE-109");
    await service.from("partner_reward_entitlements").delete().filter("metadata->>run", "like", "%hv-pass3-%");
  }

  report.cleanupSteps = steps;
  report.remainingRegistry = {
    partners: partnerIds.length
      ? (
          await service.from("partners").select("id", { count: "exact", head: true }).in("id", partnerIds)
        ).count || 0
      : 0,
    commissions: partnerIds.length
      ? (
          await service
            .from("partner_commissions")
            .select("id", { count: "exact", head: true })
            .in("partner_id", partnerIds)
        ).count || 0
      : 0,
  };
  return report;
}

export async function buildLeakReport(service, registry, { sinceIso } = {}) {
  const partnerIds = new Set(registry?.partnerIds || []);
  const runTag = registry?.runTag || "";
  const leaks = { commissions: [], ledger: [], referrals: [] };

  let cq = service
    .from("partner_commissions")
    .select("id, partner_id, source_id, source_type, amount, idempotency_key, created_at, reason")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sinceIso) cq = cq.gte("created_at", sinceIso);
  const { data: commissions } = await cq;
  for (const row of commissions || []) {
    if (partnerIds.has(row.partner_id)) continue;
    if (runTag && String(row.idempotency_key || "").includes(runTag)) {
      leaks.commissions.push({ ...row, classification: "D_background_or_untracked_run" });
      continue;
    }
    leaks.commissions.push({ ...row, classification: "E_pre_existing_or_external" });
  }

  let lq = service
    .from("partner_financial_ledger_entries")
    .select("id, partner_id, amount, idempotency_key, reference_type, reference_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (sinceIso) lq = lq.gte("created_at", sinceIso);
  const { data: ledger } = await lq;
  for (const row of ledger || []) {
    if (partnerIds.has(row.partner_id)) continue;
    leaks.ledger.push({ ...row, classification: "E_pre_existing_or_external" });
  }

  return leaks;
}

export function compareFinancialSnapshots(pre, post, keys) {
  const delta = {};
  for (const k of keys) {
    delta[k] = Number(post?.[k] || 0) - Number(pre?.[k] || 0);
  }
  const exact = [
    "non_fixture_commissions",
    "non_fixture_commission_sum",
    "non_fixture_ledger_sum",
    "ledger_signed_sum",
    "partner_mission_progress",
    "partner_campaign_participants",
    "partner_fraud_assessments",
    "partner_reward_entitlements",
    "partner_balance_pending",
    "partner_balance_bonus_pending",
    "partner_total_earnings",
  ].every((k) => {
    const v = delta[k];
    if (String(k).endsWith("_sum")) return Math.abs(Number(v)) < 0.001;
    return Number(v) === 0;
  });
  const riskSignalsOk = Number(delta.account_risk_signals || 0) === 0;
  return { delta, exact: exact && riskSignalsOk };
}
