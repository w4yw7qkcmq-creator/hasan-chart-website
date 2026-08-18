#!/usr/bin/env node
/**
 * Pre-gates for Pass3: MC-01 probe, SC-01 probe, R6/R7/R8-preflight/R9 verification.
 * STAGING ONLY — no production writes.
 */
import crypto from "node:crypto";
import { ROOT, FIXTURE_DOMAIN, applyStagingPartnerFeatureFlags, ensureUser } from "./hv-abuse-pass2-lib.mjs";
import { createCommissionRpc, setQualState } from "./partner-center/r8-staging-harness-lib.mjs";
import { QUALIFICATION_STATES } from "../lib/partner-center/constants.js";
import { initializeReferralQualification } from "../lib/partner-center/qualification-engine.js";
import { evaluateMissionsForPartnerEvent } from "../lib/partner-center/mission-engine.js";
import { USER_CLASSIFICATION } from "../lib/user-classification.js";
import { insertMcCampaignMission, mkMcQualifiedReferral } from "./hv-pass3-ext-sections.mjs";
import { purgeAllPass3StagingFixtures } from "./hv-pass3-cleanup-lib.mjs";
import { cleanupRunRegistry, trackRegistry } from "./hv-pass3-fixture-lib.mjs";
import { reversePartnerServiceCommissionAtomic, sumPartnerLedgerSigned } from "../lib/partner-center/financial-gateway.js";
import { roundMoney } from "../lib/partner-center/money.js";
import {
  captureRowBaseline,
  finalizeProbeZeroBaseline,
  probeLifecycleZeroOk,
  rowBaselineDelta,
  assertInterSuiteIsolationZero,
} from "./hv-pass3-pregate-cleanup-lib.mjs";
import {
  SUITE_TIMEOUT_MS,
  runSuiteWithIsolation,
  runStagingSuiteChain,
} from "./hv-pass3-suite-runner.mjs";

export async function probeMc01(service, ctx) {
  Object.assign(process.env, applyStagingPartnerFeatureFlags(process.env));
  const rowBefore = await captureRowBaseline(service);
  try {
    const probeTag = `${ctx.RUN_TAG}-mc-probe`;
    const probeCtx = {
      ...ctx,
      RUN_TAG: probeTag,
      fixtureUserIds: [],
      fixturePartnerIds: [],
      fixtureCampaignIds: [],
      fixtureMissionIds: [],
      fixtureEntitlementIds: [],
    };
    const mc01 = await insertMcCampaignMission(service, probeCtx, { suffix: "probe" });
    await mkMcQualifiedReferral(service, probeCtx, { partnerId: mc01.partnerId, suffix: "probe" });
    const before = await ctx.countPartnerFinancial(service, mc01.partnerId);
    const r1 = await evaluateMissionsForPartnerEvent(service, {
      partnerId: mc01.partnerId,
      eventType: "qualified_referral",
      tierKey: "partner",
    });
    const after = await ctx.countPartnerFinancial(service, mc01.partnerId);
    const ledgerDelta = after.partner_financial_ledger_entries - before.partner_financial_ledger_entries;
    const { count: entCount } = await service
      .from("partner_reward_entitlements")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", mc01.partnerId);
    const ok =
      !r1.skipped &&
      r1.evaluated >= 1 &&
      (r1.completions || []).length >= 1 &&
      (ledgerDelta >= 1 || (entCount || 0) >= 1);

    if (probeCtx.registry) {
      probeCtx.registry.runTag = probeTag;
      for (const pid of probeCtx.fixturePartnerIds || []) trackRegistry(probeCtx.registry, "partnerIds", pid);
      for (const uid of probeCtx.fixtureUserIds || []) trackRegistry(probeCtx.registry, "authUserIds", uid);
      for (const mid of probeCtx.fixtureMissionIds || []) trackRegistry(probeCtx.registry, "missionIds", mid);
      for (const cid of probeCtx.fixtureCampaignIds || []) trackRegistry(probeCtx.registry, "campaignIds", cid);
      trackRegistry(probeCtx.registry, "partnerIds", mc01.partnerId);
      await cleanupRunRegistry(service, probeCtx.registry, {}, { runStartedAt: new Date().toISOString() });
    }

    const cleanup = await finalizeProbeZeroBaseline(service, {
      probeTag,
      userIds: probeCtx.fixtureUserIds || [],
      partnerIds: [mc01.partnerId, ...(probeCtx.fixturePartnerIds || [])],
    });
    const rowAfter = cleanup.after;
    const lifecycleOk = probeLifecycleZeroOk(rowBefore, rowAfter);

    return {
      ok: ok && lifecycleOk,
      evaluated: r1.evaluated,
      completions: (r1.completions || []).length,
      ledgerDelta,
      skipped: r1.skipped,
      reason: r1.reason,
      mc01ProbeReversalApplied: Boolean(probeCtx.registry),
      rowDelta: rowBaselineDelta(rowBefore, rowAfter),
      lifecycleZero: lifecycleOk,
      cleanup,
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

export async function probeSc01(service, ctx) {
  const rowBefore = await captureRowBaseline(service);
  try {
    const probeTag = `${ctx.RUN_TAG}-sc-probe`;
    const probeUserIds = [];
    const partnerUser = await ensureUser(service, `${probeTag}-p@${FIXTURE_DOMAIN}`, ctx.PASSWORD, { run: probeTag });
    const referred = await ensureUser(service, `${probeTag}-r@${FIXTURE_DOMAIN}`, ctx.PASSWORD, { run: probeTag });
    probeUserIds.push(partnerUser, referred);
    const partnerId = await ctx.mkPartner(service, partnerUser, `P3P${crypto.randomBytes(4).toString("hex")}`.slice(0, 12));
    await ctx.setProfile(service, referred, {
      user_classification: USER_CLASSIFICATION.REAL,
      effective_user_classification: USER_CLASSIFICATION.REAL,
      human_verification_status: "verified",
      human_verified_at: new Date().toISOString(),
    });
    const referralId = await ctx.mkReferral(service, {
      partnerId,
      referredUserId: referred,
      code: `P3R${probeTag.slice(-4)}`,
      partnerUserId: partnerUser,
    });
    await initializeReferralQualification(service, { partnerId, referralId, referredUserId: referred });
    await setQualState(service, referralId, partnerId, QUALIFICATION_STATES.QUALIFIED);
    const fx = { partnerId, referralId, referredUserId: referred, runId: probeTag };
    const { data: partnerBaseline } = await service
      .from("partners")
      .select("balance_pending, total_earnings")
      .eq("id", partnerId)
      .single();
    const ledgerBaseline = await sumPartnerLedgerSigned(service, partnerId);
    const sourceId = crypto.randomUUID();
    const rpc1 = await createCommissionRpc(service, fx, {
      serviceType: "vip_signal",
      sourceId,
      baseAmount: 100,
      commissionPercent: 10,
      reason: probeTag,
      idempotencyKey: `${probeTag}:sc:1`,
    });
    const ok = !rpc1.error && rpc1.data?.created === true && Number(rpc1.data?.amount) === 10;
    const commissionId = rpc1.data?.commission_id;
    let reverseResult = null;
    if (commissionId) {
      reverseResult = await reversePartnerServiceCommissionAtomic(service, {
        commissionId,
        reason: `${probeTag}:sc01_probe_cleanup`,
      });
    }
    const { data: partnerAfterReverse } = await service
      .from("partners")
      .select("balance_pending, total_earnings")
      .eq("id", partnerId)
      .single();
    const ledgerAfterReverse = await sumPartnerLedgerSigned(service, partnerId);
    const sc01Cleanup = {
      commissionEconomicActiveDelta: reverseResult?.reversed || reverseResult?.duplicate ? 0 : Number(rpc1.data?.amount || 0),
      balancePendingDelta: roundMoney(Number(partnerAfterReverse?.balance_pending || 0) - Number(partnerBaseline?.balance_pending || 0)),
      totalEarningsDelta: roundMoney(Number(partnerAfterReverse?.total_earnings || 0) - Number(partnerBaseline?.total_earnings || 0)),
      ledgerSignedDelta: roundMoney(ledgerAfterReverse - ledgerBaseline),
      reversed: Boolean(reverseResult?.reversed),
      duplicate: Boolean(reverseResult?.duplicate),
    };

    const cleanup = await finalizeProbeZeroBaseline(service, {
      probeTag,
      userIds: probeUserIds,
      partnerIds: [partnerId],
    });
    const rowAfter = cleanup.after;
    const lifecycleOk = probeLifecycleZeroOk(rowBefore, rowAfter);

    return {
      ok: ok && lifecycleOk,
      rpc1: { created: rpc1.data?.created, amount: rpc1.data?.amount, error: rpc1.error?.message },
      sc01Cleanup,
      commissionDeleteAttempted: true,
      commissionDeleteError: null,
      rowDelta: rowBaselineDelta(rowBefore, rowAfter),
      lifecycleZero: lifecycleOk,
      cleanup,
    };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

/** @deprecated sync runner — use runStagingRegressionGatesAsync */
export function runSuite(script, name) {
  throw new Error("runSuite_sync_removed:use_runStagingRegressionGatesAsync");
}

export async function runR8PreflightGate(service) {
  const {
    runR8FixturePreflight,
    purgeActiveR8StagingFixturesScoped,
    clearStagingFailureFlags,
  } = await import("./partner-center/r8-staging-harness-lib.mjs");
  const { guaranteedR8OrchestrationCleanup, assertInterSuiteIsolationZero } = await import(
    "./hv-pass3-pregate-cleanup-lib.mjs"
  );
  const started = Date.now();
  const runId = `r8-pregate-${Date.now()}`;
  let result = {
    name: "r8_preflight",
    mode: "preflight",
    fullExecution: false,
    exit: 1,
    verdict: "FAIL",
    passCount: 0,
    failCount: 1,
    elapsedMs: 0,
  };
  try {
    Object.assign(process.env, applyStagingPartnerFeatureFlags(process.env));
    await clearStagingFailureFlags(service);
    const preCleanup = {};
    await purgeActiveR8StagingFixturesScoped(service, preCleanup);
    const preflight = await runR8FixturePreflight(service, runId);
    result = {
      name: "r8_preflight",
      mode: "preflight",
      fullExecution: false,
      exit: preflight?.ok ? 0 : 1,
      verdict: preflight?.ok ? "PASS" : "FAIL",
      passCount: preflight?.ok ? 1 : 0,
      failCount: preflight?.ok ? 0 : 1,
      elapsedMs: Date.now() - started,
      preflight: preflight?.structured || { ok: preflight?.ok },
      preCleanup,
    };
  } catch (err) {
    result = {
      ...result,
      exit: 1,
      verdict: "FAIL",
      error: String(err?.message || err),
      elapsedMs: Date.now() - started,
    };
  } finally {
    result.r8Cleanup = await guaranteedR8OrchestrationCleanup(service, { reason: "r8_preflight_gate" });
    result.interSuite = await assertInterSuiteIsolationZero(service, "after_r8_preflight");
    result.elapsedMs = Date.now() - started;
  }
  return result;
}

export async function runStagingRegressionGatesAsync(service) {
  Object.assign(process.env, applyStagingPartnerFeatureFlags(process.env));

  const r6 = await runSuiteWithIsolation(service, "scripts/partner-center/r6-staging-validation.mjs", "r6", {
    timeoutMs: SUITE_TIMEOUT_MS.r6,
  });
  const r7 = await runSuiteWithIsolation(service, "scripts/partner-center/r7-staging-validation.mjs", "r7", {
    timeoutMs: SUITE_TIMEOUT_MS.r7,
  });
  const r8 = await runR8PreflightGate(service);
  const r8InterSuite = await assertInterSuiteIsolationZero(service, "after_r8_preflight");
  const r9 = await runSuiteWithIsolation(service, "scripts/partner-center/r9-staging-validation.mjs", "r9", {
    timeoutMs: SUITE_TIMEOUT_MS.r9,
  });

  const interSuiteGates = [
    r6.interSuite,
    r7.interSuite,
    { suite: "r8_preflight", ...r8InterSuite },
    r9.interSuite,
  ].filter(Boolean);

  const blocked = interSuiteGates.some((g) => g && g.ok === false);

  return {
    r6,
    r7,
    r8,
    r9,
    interSuiteGates,
    blocked,
    blockedSuite: blocked
      ? interSuiteGates.find((g) => g && g.ok === false)?.label || interSuiteGates.find((g) => g && g.ok === false)?.suite
      : null,
    executionPolicy: {
      r8PreGate: "preflight_only_direct",
      r8FullExecution: "main_regression_section_once",
    },
  };
}

/** Backward-compatible sync wrapper — returns promise-like via async in callers. */
export function runStagingRegressionGates() {
  throw new Error("runStagingRegressionGates_sync_removed:await_runStagingRegressionGatesAsync(service)");
}

export async function runR8EmbeddedGate(service) {
  const {
    purgeActiveR8StagingFixturesScoped,
    ensureR8CommissionRuleBaseline,
    clearStagingFailureFlags,
  } = await import("./partner-center/r8-staging-harness-lib.mjs");
  await clearStagingFailureFlags(service);
  const preCleanup = {};
  await purgeActiveR8StagingFixturesScoped(service, preCleanup);
  await ensureR8CommissionRuleBaseline(service);
  const r8 = await runSuiteWithIsolation(service, "scripts/partner-center/r8-staging-validation.mjs", "r8", {
    timeoutMs: SUITE_TIMEOUT_MS.r8_isolated,
  });
  const postCleanup = {};
  await purgeActiveR8StagingFixturesScoped(service, postCleanup);
  return { ...r8, preCleanup, postCleanup };
}

export function stagingRegressionGatesOk(gates) {
  if (gates.blocked) return false;
  const r8Ok = gates.r8?.mode === "preflight" ? gates.r8.verdict === "PASS" : gates.r8?.verdict === "PASS";
  return (
    gates.r6?.verdict === "PASS" &&
    gates.r7?.verdict === "PASS" &&
    r8Ok &&
    gates.r9?.verdict === "PASS" &&
    (gates.interSuiteGates || []).every((g) => g.ok !== false)
  );
}

export { SUITE_TIMEOUT_MS, runSuiteWithIsolation, runStagingSuiteChain };
