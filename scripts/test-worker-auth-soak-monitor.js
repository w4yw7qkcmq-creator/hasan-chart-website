#!/usr/bin/env node
/**
 * Tests for worker auth soak monitor (pure logic, no network).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  verifyBaseline,
  buildKnownCanaryBaseline,
  checkpointDueAt,
  isCheckpointDue,
  dueCheckpoints,
  scanForSecrets,
  extractProductionState,
  detectRestart,
  updateCumulativeMetrics,
  detectRestartLoop,
  evaluateCheckpointVerdict,
  buildSnapshot,
  initRegistry,
  evaluateSoakDecision,
  SCHEMA_VERSION,
} from "./iam/worker-auth-soak-core.mjs";

const VALID_BASELINE = {
  startedAt: "2026-08-04T22:16:44.000Z",
  deployedCommit: "bc4e03b",
  e2eVerdict: "OWNER_WEB_E2E_VALIDATED",
  authModeConfirmed: true,
  metrics: {
    machine: 6,
    legacy: 2,
    denied: 14,
    originRejected: 4,
    machineHeaderRejected: 8,
    humanSessionRejected: 2,
  },
  metricsDeltaFromE2e: {
    machine: 2,
    legacy: 0,
    denied: 0,
    originRejected: 0,
    machineHeaderRejected: 0,
    humanSessionRejected: 0,
  },
};

function healthyProduction(overrides = {}) {
  return {
    webReady: true,
    workerReady: true,
    deployedCommit: "bc4e03b",
    databaseStatus: "ok",
    databaseLatencyMs: 12,
    workerUptimeSeconds: 5000,
    machineAuthConfigured: true,
    legacyFallbackEnabled: true,
    priceAlertsWorker: true,
    checkIntervalMs: 30000,
    rawMetrics: {
      machine: 8,
      legacy: 2,
      denied: 14,
      originRejected: 4,
      machineHeaderRejected: 8,
      humanSessionRejected: 2,
    },
    ...overrides,
  };
}

describe("baseline verification", () => {
  it("valid baseline passes", () => {
    const r = verifyBaseline(VALID_BASELINE);
    assert.equal(r.ok, true);
    assert.equal(r.baselineAt, VALID_BASELINE.startedAt);
  });

  it("corrupted baseline fails safely", () => {
    assert.equal(verifyBaseline(null).ok, false);
    assert.equal(verifyBaseline({ ...VALID_BASELINE, authModeConfirmed: false }).ok, false);
    assert.equal(verifyBaseline({ ...VALID_BASELINE, e2eVerdict: "FAIL" }).ok, false);
    assert.equal(
      verifyBaseline({ ...VALID_BASELINE, metricsDeltaFromE2e: { machine: 0 } }).ok,
      false
    );
  });
});

describe("checkpoint scheduling", () => {
  it("t1h due after one hour", () => {
    const due = checkpointDueAt(VALID_BASELINE.startedAt, "t1h");
    assert.equal(due, "2026-08-04T23:16:44.000Z");
    assert.equal(isCheckpointDue(VALID_BASELINE.startedAt, "t1h", new Date("2026-08-04T22:30:00Z")), false);
    assert.equal(isCheckpointDue(VALID_BASELINE.startedAt, "t1h", new Date("2026-08-04T23:20:00Z")), true);
  });

  it("dueCheckpoints excludes captured", () => {
    const due = dueCheckpoints(
      VALID_BASELINE.startedAt,
      new Date("2026-08-05T05:00:00Z"),
      { t1h: { capturedAt: "x" } }
    );
    assert.ok(!due.includes("t1h"));
    assert.ok(due.includes("t6h"));
  });
});

describe("production state extraction", () => {
  it("healthy web and worker", () => {
    const state = extractProductionState(
      { status: "ok", readiness: "ready", build: { commit: "bc4e03babc" }, database: { status: "ok", latencyMs: 20 } },
      {
        success: true,
        alertsWorker: true,
        checkIntervalMs: 30000,
        workerHttpAuth: { machine: 6, legacy: 2, machineAuthConfigured: true, legacyFallbackEnabled: true },
      }
    );
    assert.equal(state.webReady, true);
    assert.equal(state.workerReady, true);
    assert.equal(state.deployedCommit, "bc4e03b");
  });

  it("web down fails readiness", () => {
    const state = extractProductionState({ status: "degraded", readiness: "not_ready" }, { success: true });
    assert.equal(state.webReady, false);
  });
});

describe("restart and segment handling", () => {
  it("detects counter reset after restart", () => {
    const r = detectRestart(
      { rawMetrics: { machine: 10, legacy: 2, denied: 14, originRejected: 4, machineHeaderRejected: 8, humanSessionRejected: 2 }, workerUptimeSeconds: 9000 },
      { rawMetrics: { machine: 1, legacy: 0, denied: 0, originRejected: 0, machineHeaderRejected: 0, humanSessionRejected: 0 }, workerUptimeSeconds: 120 }
    );
    assert.equal(r.restartDetected, true);
  });

  it("cumulative metrics ignore negative delta after restart", () => {
    const registry = initRegistry(VALID_BASELINE);
    updateCumulativeMetrics(registry, { machine: 8, legacy: 2, denied: 14, originRejected: 4, machineHeaderRejected: 8, humanSessionRejected: 2 }, false);
    const after = updateCumulativeMetrics(
      registry,
      { machine: 1, legacy: 0, denied: 0, originRejected: 0, machineHeaderRejected: 0, humanSessionRejected: 0 },
      true
    );
    assert.equal(after.cumulative.machine, 2);
    assert.equal(after.segmentRestart, true);
  });

  it("known restart → WARN not FAIL alone", () => {
    const { verdict } = evaluateCheckpointVerdict({
      production: healthyProduction(),
      cumulativeDeltas: { machine: 2, legacy: 0, denied: 0, originRejected: 0, machineHeaderRejected: 0, humanSessionRejected: 0 },
      restartDetected: true,
      restartLoop: false,
      restartKnownDeploy: true,
    });
    assert.equal(verdict, "WARN");
  });

  it("restart loop → FAIL", () => {
    const loop = detectRestartLoop(
      [
        { at: "2026-08-05T01:00:00Z", knownDeploy: false },
        { at: "2026-08-05T01:20:00Z", knownDeploy: false },
        { at: "2026-08-05T01:40:00Z", knownDeploy: false },
      ],
      new Date("2026-08-05T02:00:00Z")
    );
    assert.equal(loop, true);
    const { verdict } = evaluateCheckpointVerdict({
      production: healthyProduction(),
      cumulativeDeltas: { machine: 0, legacy: 0, denied: 0, originRejected: 0, machineHeaderRejected: 0, humanSessionRejected: 0 },
      restartLoop: true,
    });
    assert.equal(verdict, "FAIL");
  });
});

describe("decision rules", () => {
  it("healthy snapshot → PASS", () => {
    const { verdict } = evaluateCheckpointVerdict({
      production: healthyProduction(),
      cumulativeDeltas: { machine: 2, legacy: 0, denied: 0, originRejected: 0, machineHeaderRejected: 0, humanSessionRejected: 0 },
    });
    assert.equal(verdict, "PASS");
  });

  it("machineAuthConfigured=false → FAIL", () => {
    const { verdict } = evaluateCheckpointVerdict({
      production: healthyProduction({ machineAuthConfigured: false }),
      cumulativeDeltas: { machine: 0, legacy: 0, denied: 0, originRejected: 0, machineHeaderRejected: 0, humanSessionRejected: 0 },
    });
    assert.equal(verdict, "FAIL");
  });

  it("legacy fallback unexpectedly false → FAIL", () => {
    const { verdict } = evaluateCheckpointVerdict({
      production: healthyProduction({ legacyFallbackEnabled: false }),
      cumulativeDeltas: { machine: 0, legacy: 0, denied: 0, originRejected: 0, machineHeaderRejected: 0, humanSessionRejected: 0 },
    });
    assert.equal(verdict, "FAIL");
  });

  it("priceAlertsWorker=false → FAIL", () => {
    const { verdict } = evaluateCheckpointVerdict({
      production: healthyProduction({ priceAlertsWorker: false }),
      cumulativeDeltas: { machine: 0, legacy: 0, denied: 0, originRejected: 0, machineHeaderRejected: 0, humanSessionRejected: 0 },
    });
    assert.equal(verdict, "FAIL");
  });

  it("known legacy probe → WARN", () => {
    const { verdict } = evaluateCheckpointVerdict({
      production: healthyProduction(),
      cumulativeDeltas: { machine: 2, legacy: 1, denied: 0, originRejected: 0, machineHeaderRejected: 0, humanSessionRejected: 0 },
      manualKnownLegacyProbe: true,
    });
    assert.equal(verdict, "WARN");
  });

  it("unknown legacy increase → WARN", () => {
    const { verdict } = evaluateCheckpointVerdict({
      production: healthyProduction(),
      cumulativeDeltas: { machine: 2, legacy: 1, denied: 0, originRejected: 0, machineHeaderRejected: 0, humanSessionRejected: 0 },
    });
    assert.equal(verdict, "WARN");
  });

  it("machineHeaderRejected increase → FAIL", () => {
    const { verdict } = evaluateCheckpointVerdict({
      production: healthyProduction(),
      cumulativeDeltas: { machine: 2, legacy: 0, denied: 0, originRejected: 0, machineHeaderRejected: 1, humanSessionRejected: 0 },
    });
    assert.equal(verdict, "FAIL");
  });
});

describe("soak evaluation", () => {
  it("pre-T72 → SOAK_IN_PROGRESS", () => {
    const registry = initRegistry(VALID_BASELINE);
    const decision = evaluateSoakDecision(registry, new Date("2026-08-05T10:00:00Z"));
    assert.equal(decision.decision, "SOAK_IN_PROGRESS");
    assert.ok(decision.remainingCheckpoints.length > 0);
  });

  it("complete healthy T72 → READY_FOR_B2_4_REVIEW", () => {
    const registry = initRegistry(VALID_BASELINE);
    for (const cp of ["t1h", "t6h", "t24h", "t48h", "t72h"]) {
      registry.checkpoints[cp].capturedAt = "x";
      registry.checkpoints[cp].verdict = "PASS";
    }
    const decision = evaluateSoakDecision(registry, new Date("2026-08-08T00:00:00Z"));
    assert.equal(decision.decision, "READY_FOR_B2_4_REVIEW");
  });

  it("missing checkpoint → EXTEND_SOAK", () => {
    const registry = initRegistry(VALID_BASELINE);
    registry.checkpoints.t1h.capturedAt = "x";
    registry.checkpoints.t1h.verdict = "PASS";
    const decision = evaluateSoakDecision(registry, new Date("2026-08-08T00:00:00Z"));
    assert.equal(decision.decision, "EXTEND_SOAK");
  });
});

describe("snapshot schema and secrets", () => {
  it("schema validation", () => {
    const snap = buildSnapshot({
      checkpoint: "t1h",
      capturedAt: "2026-08-04T23:16:44Z",
      baselineAt: VALID_BASELINE.startedAt,
      production: healthyProduction(),
      cumulativeDeltas: { machine: 2, legacy: 0, denied: 0, originRejected: 0, machineHeaderRejected: 0, humanSessionRejected: 0 },
      priceAlerts: { workerActive: true, checkIntervalMs: 30000, restartDetected: false },
      issues: [],
      verdict: "PASS",
    });
    assert.equal(snap.schemaVersion, SCHEMA_VERSION);
    assert.equal(snap.checkpoint, "t1h");
    assert.equal(snap.production.webReady, true);
    assert.equal(snap.workerAuth.machineTotal, 8);
  });

  it("artifact secret scanner", () => {
    assert.deepEqual(scanForSecrets({ ok: true }), []);
    assert.ok(scanForSecrets({ token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.extra" }).includes("jwt_like"));
    assert.ok(scanForSecrets({ h: "Bearer abcdefghijklmnop" }).includes("bearer"));
  });

  it("known canary baseline metadata", () => {
    const k = buildKnownCanaryBaseline(VALID_BASELINE);
    assert.equal(k.legacy, 2);
    assert.equal(k.denied, 14);
  });
});

describe("monitor source safety", () => {
  it("no POST in monitor source", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("scripts/iam/monitor-worker-auth-soak.mjs", "utf8");
    assert.doesNotMatch(src, /method:\s*["']POST["']/i);
    assert.doesNotMatch(src, /\.post\(/i);
  });
});

console.log("worker-auth-soak-monitor tests loaded");
