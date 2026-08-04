#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  extractRuntimeIamApi,
  extractRuntimeFlags,
  detectMixedGenerations,
  evaluateStability,
  classifyPollingState,
  shouldStartBehavioralMatrix,
  legacyBearerExpectation,
  classifyLegacyBearerResult,
  sanitizeArtifact,
  POLL_STATES,
} from "./iam/production-iam-api-canary.mjs";
import { buildIamRuntimeProbe } from "../lib/iam/runtime-probe.js";
import { getIamFeatureFlags } from "../lib/iam/feature-flags.js";

function testRuntimeHealthReflectsFeatureFlags() {
  const prev = {
    IAM_DB: process.env.IAM_DB,
    IAM_API: process.env.IAM_API,
    IAM_UI: process.env.IAM_UI,
    IAM_RLS: process.env.IAM_RLS,
  };
  process.env.IAM_DB = "true";
  process.env.IAM_API = "false";
  process.env.IAM_UI = "false";
  process.env.IAM_RLS = "false";

  const probe = buildIamRuntimeProbe();
  const flags = getIamFeatureFlags();
  assert.equal(probe.effective.IAM_DB, flags.IAM_DB);
  assert.equal(probe.effective.IAM_API, flags.IAM_API);
  assert.equal(probe.effective.IAM_UI, flags.IAM_UI);
  assert.equal(probe.effective.IAM_RLS, flags.IAM_RLS);
  assert.equal(typeof probe.effective.IAM_API, "boolean");
  assert.equal(typeof probe.validation.ok, "boolean");
  assert.ok(probe.probeTimestamp);

  for (const k of Object.keys(prev)) {
    if (prev[k] === undefined) delete process.env[k];
    else process.env[k] = prev[k];
  }
}

function testExtractRuntimeFromHealthJson() {
  const health = {
    iam: {
      effective: { IAM_DB: true, IAM_API: true, IAM_UI: false, IAM_RLS: false },
      validation: { ok: true },
    },
  };
  assert.equal(extractRuntimeIamApi(health), true);
  assert.deepEqual(extractRuntimeFlags(health), {
    IAM_DB: true,
    IAM_API: true,
    IAM_UI: false,
    IAM_RLS: false,
    validationOk: true,
  });
}

function testNoRawEnvInProbe() {
  const probe = buildIamRuntimeProbe();
  const serialized = JSON.stringify(probe);
  assert.doesNotMatch(serialized, /process\.env/);
  assert.doesNotMatch(serialized, /CRON_SECRET/);
  assert.doesNotMatch(serialized, /SUPABASE_SERVICE_ROLE/);
}

function testRailwayTrueRuntimeFalseIsWaitNotFail() {
  const probes = [
    { runtimeIamApi: false, healthOk: true, healthReady: true, commitOk: true, uptimeSeconds: 10 },
    { runtimeIamApi: false, healthOk: true, healthReady: true, commitOk: true, uptimeSeconds: 12 },
  ];
  const state = classifyPollingState({ probes, desiredIamApi: true, timedOut: false });
  assert.equal(state, POLL_STATES.WAITING);
  assert.equal(shouldStartBehavioralMatrix({ runtimeIamApi: false, desiredIamApi: true, stable: false }), false);
}

function testMixedGenerationsWaiting() {
  const probes = [
    { runtimeIamApi: true, uptimeSeconds: 30 },
    { runtimeIamApi: false, uptimeSeconds: 400 },
  ];
  assert.equal(detectMixedGenerations(probes), true);
  const state = classifyPollingState({ probes, desiredIamApi: true, timedOut: false });
  assert.equal(state, POLL_STATES.MIXED_GENERATIONS);
}

function testRuntimeTrueLegacy403Pass() {
  const r = classifyLegacyBearerResult({ runtimeIamApi: true, stable: true, statusCode: 403 });
  assert.equal(r.pass, true);
  assert.equal(r.expected, 403);
}

function testRuntimeTrueLegacy410P1() {
  const r = classifyLegacyBearerResult({ runtimeIamApi: true, stable: true, statusCode: 410 });
  assert.equal(r.pass, false);
  assert.equal(r.p1, true);
}

function testRuntimeFalseLegacy410AfterStable() {
  const r = classifyLegacyBearerResult({ runtimeIamApi: false, stable: true, statusCode: 410 });
  assert.equal(r.pass, true);
  assert.equal(legacyBearerExpectation(false), 410);
}

function testStabilityRequiresThreeMatchingProbes() {
  const mk = (api, up) => ({
    runtimeIamApi: api,
    healthOk: true,
    healthReady: true,
    commitOk: true,
    uptimeSeconds: up,
  });
  const unstable = [mk(false, 1), mk(false, 2), mk(true, 3)];
  assert.equal(evaluateStability(unstable, true).stable, false);

  const stable = [mk(true, 50), mk(true, 57), mk(true, 64)];
  assert.equal(evaluateStability(stable, true).stable, true);
}

function testRollbackWaitsForRuntimeFalse() {
  const probes = [
    { runtimeIamApi: true, healthOk: true, healthReady: true, commitOk: true },
    { runtimeIamApi: true, healthOk: true, healthReady: true, commitOk: true },
  ];
  assert.equal(evaluateStability(probes, false).stable, false);
}

function testArtifactsSanitizeSecrets() {
  const dirty = {
    CRON_SECRET: "abc",
    machine: { token: "x", status: 401 },
    nested: { password: "p", pass: true },
  };
  const clean = sanitizeArtifact(dirty);
  assert.equal(clean.CRON_SECRET, "[redacted]");
  assert.equal(clean.machine.token, "[redacted]");
  assert.equal(clean.nested.password, "[redacted]");
  assert.equal(clean.machine.status, 401);
}

const tests = [
  ["runtime health reflects getIamFeatureFlags", testRuntimeHealthReflectsFeatureFlags],
  ["extract runtime IAM from health json", testExtractRuntimeFromHealthJson],
  ["probe has booleans only no raw env", testNoRawEnvInProbe],
  ["railway true + runtime false = WAIT", testRailwayTrueRuntimeFalseIsWaitNotFail],
  ["mixed generations = WAIT", testMixedGenerationsWaiting],
  ["runtime true + legacy 403 = PASS", testRuntimeTrueLegacy403Pass],
  ["runtime true + legacy 410 = P1", testRuntimeTrueLegacy410P1],
  ["runtime false + legacy 410 stable = PASS", testRuntimeFalseLegacy410AfterStable],
  ["stability requires 3 matching probes", testStabilityRequiresThreeMatchingProbes],
  ["rollback waits for runtime false", testRollbackWaitsForRuntimeFalse],
  ["artifacts sanitize secret fields", testArtifactsSanitizeSecrets],
];

for (const [name, run] of tests) {
  run();
  console.log(`✓ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} canary runtime tests passed`);
