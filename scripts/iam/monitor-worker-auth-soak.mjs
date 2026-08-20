#!/usr/bin/env node
/**
 * Read-only worker auth soak monitor (Production).
 *
 * Usage:
 *   node scripts/iam/monitor-worker-auth-soak.mjs --once
 *   node scripts/iam/monitor-worker-auth-soak.mjs --checkpoint=t1h
 *   node scripts/iam/monitor-worker-auth-soak.mjs --evaluate [--json]
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  parseArgs,
  verifyBaseline,
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
  fetchProductionReadOnly,
  CHECKPOINT_ORDER,
} from "./worker-auth-soak-core.mjs";

const ROOT = process.cwd();
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const BASELINE_PATH = join(ARTIFACT_DIR, "worker-auth-soak-baseline-latest.json");
const REGISTRY_PATH = join(ARTIFACT_DIR, "worker-auth-soak-registry.json");
const WEB_BASE = process.env.PRODUCTION_WEB_URL || "https://www.hasanchartworld.com";
const WORKER_BASE = process.env.PRODUCTION_AI_WORKER_URL || "https://ai-worker-production-a6ea.up.railway.app";

function loadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function saveRegistry(registry) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(REGISTRY_PATH, `${JSON.stringify(registry, null, 2)}\n`);
}

function ensureRegistry(baseline) {
  let registry = loadJson(REGISTRY_PATH);
  if (registry?.baselineAt) return registry;
  registry = initRegistry(baseline);
  saveRegistry(registry);
  return registry;
}

function artifactName(checkpoint, capturedAt) {
  const ts = capturedAt.replace(/[-:TZ.]/g, "").slice(0, 14);
  return join(ARTIFACT_DIR, `worker-auth-soak-${checkpoint}-${ts}.json`);
}

async function captureSnapshot({ checkpoint, registry, baseline, now = new Date() }) {
  const { web, worker } = await fetchProductionReadOnly(WEB_BASE, WORKER_BASE);
  const production = extractProductionState(web, worker);

  const restart = detectRestart(
    {
      rawMetrics: registry.lastRawMetrics,
      workerUptimeSeconds: registry.lastWorkerUptimeSeconds,
      deployedCommit: registry.lastDeployedCommit,
    },
    production
  );

  const restartKnownDeploy =
    restart.restartDetected && restart.reasons.includes("deploy_commit_changed");

  if (restart.restartDetected) {
    registry.restartEvents.push({
      at: now.toISOString(),
      checkpoint,
      reasons: restart.reasons,
      knownDeploy: restartKnownDeploy,
    });
  }

  const { cumulative } = updateCumulativeMetrics(
    registry,
    production.rawMetrics,
    restart.restartDetected
  );

  registry.lastWorkerUptimeSeconds = production.workerUptimeSeconds;
  registry.lastDeployedCommit = production.deployedCommit;

  const restartLoop = detectRestartLoop(registry.restartEvents, now);

  const { verdict, issues } = evaluateCheckpointVerdict({
    production,
    cumulativeDeltas: cumulative,
    restartDetected: restart.restartDetected,
    restartLoop,
    restartKnownDeploy,
    manualKnownLegacyProbe: false,
  });

  const capturedAt = now.toISOString();
  const snapshot = buildSnapshot({
    checkpoint,
    capturedAt,
    baselineAt: registry.baselineAt,
    production,
    cumulativeDeltas: cumulative,
    priceAlerts: {
      workerActive: production.priceAlertsWorker,
      checkIntervalMs: production.checkIntervalMs,
      restartDetected: restart.restartDetected,
    },
    issues,
    verdict,
  });

  const secretHits = scanForSecrets(snapshot);
  if (secretHits.length) {
    snapshot.verdict = "FAIL";
    snapshot.issues.push({ code: "secret_leak_detected", severity: "FAIL" });
  }

  const path = artifactName(checkpoint, capturedAt);
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);

  registry.snapshots.push({
    checkpoint,
    capturedAt,
    verdict: snapshot.verdict,
    artifact: path.replace(`${ROOT}/`, ""),
  });

  if (CHECKPOINT_ORDER.includes(checkpoint)) {
    const dueAt = registry.checkpoints[checkpoint]?.dueAt;
    registry.checkpoints[checkpoint] = {
      ...registry.checkpoints[checkpoint],
      capturedAt,
      verdict: snapshot.verdict,
      artifact: path.replace(`${ROOT}/`, ""),
      late: dueAt ? now.getTime() > new Date(dueAt).getTime() + 600000 : false,
    };
  }

  saveRegistry(registry);

  return { snapshot, path, registry, restart, cumulative };
}

async function main() {
  const args = parseArgs();
  const baseline = loadJson(BASELINE_PATH);
  const verified = verifyBaseline(baseline);
  if (!verified.ok) {
    const out = { error: verified.error, verdict: "BASELINE_INVALID" };
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }

  let registry = ensureRegistry(baseline);
  const now = new Date();

  if (args.evaluate) {
    const decision = evaluateSoakDecision(registry, now);
    const output = { ...decision, registryPath: REGISTRY_PATH.replace(`${ROOT}/`, "") };
    console.log(JSON.stringify(output, null, 2));
    process.exit(decision.decision === "ROLLBACK_RECOMMENDED" ? 1 : 0);
  }

  const toRun = [];
  if (args.once) toRun.push("manual");
  if (args.checkpoint && args.checkpoint !== "manual") toRun.push(args.checkpoint);

  const due = dueCheckpoints(registry.baselineAt, now, registry.checkpoints);
  for (const cp of due) {
    if (!toRun.includes(cp)) toRun.push(cp);
  }

  if (toRun.length === 0 && !args.once) {
    toRun.push("manual");
  }

  const results = [];
  for (const checkpoint of [...new Set(toRun)]) {
    const result = await captureSnapshot({ checkpoint, registry, baseline, now });
    registry = result.registry;
    results.push({
      checkpoint,
      verdict: result.snapshot.verdict,
      artifact: result.path.replace(`${ROOT}/`, ""),
      restartDetected: result.restart.restartDetected,
      cumulativeDeltas: result.cumulative,
    });
  }

  const decision = evaluateSoakDecision(registry, now);
  const output = {
    mode: args.once ? "once" : "checkpoint",
    results,
    decision: decision.decision,
    completedCheckpoints: decision.completedCheckpoints,
    remainingCheckpoints: decision.remainingCheckpoints,
    earliestDecisionAt: decision.earliestDecisionAt,
    registryPath: REGISTRY_PATH.replace(`${ROOT}/`, ""),
  };

  console.log(JSON.stringify(output, null, 2));
  const hasFail = results.some((r) => r.verdict === "FAIL");
  process.exit(hasFail ? 1 : 0);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
