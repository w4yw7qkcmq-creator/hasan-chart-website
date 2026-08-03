import fs from "node:fs";
import path from "node:path";
import { CHECKPOINTS, CV_VERSION } from "./config.mjs";
import { loadCvEnv } from "./env.mjs";
import { loadOperationalArtifacts } from "./freshness.mjs";
import { createIncident, loadIncidents, mergeIncidents, saveIncidents } from "./incidents.mjs";
import { createCvPaths } from "./paths.mjs";
import { assessLatency, deriveCheckpointVerdict, deriveFinalVerdict, sanitizeForReport } from "./report-engine.mjs";
import { writeCvReport } from "./report.mjs";
import { getCheckpoint, getSchedulerPlan } from "./scheduler.mjs";
import { createTimeline } from "./timeline.mjs";
import { PROBE_REGISTRY } from "./probes/index.mjs";
import { createFetch } from "./probes/web-health.mjs";

/**
 * Build probe context with injectable fetch (for mocks / dry-run).
 */
export function buildProbeContext(env, paths, overrides = {}) {
  const fetchJson = overrides.fetchJson || (env.dryRun ? null : createFetch(env.baseUrl, overrides.fetchImpl));
  const fetchRaw = overrides.fetchRaw || (fetchJson
    ? async (p) => {
        const r = await fetchJson(p);
        return { status: r.res.status, text: JSON.stringify(r.data) };
      }
    : null);

  return {
    baseUrl: env.baseUrl,
    environment: env.environment,
    expectedCommit: env.expectedCommit || overrides.expectedCommit || "",
    dryRun: env.dryRun || overrides.dryRun,
    fetchJson: fetchJson || overrides.fetchJson,
    fetchRaw: fetchRaw || overrides.fetchRaw,
    operationalArtifacts: overrides.operationalArtifacts || loadOperationalArtifacts(paths.opsArtifacts || path.join(env.root, "scripts/ops/.artifacts"), env.expectedCommit),
  };
}

export async function runCheckpoint(checkpointId, options = {}) {
  const env = options.env || loadCvEnv();
  if (options.dryRun) env.dryRun = true;
  const paths = options.paths || createCvPaths(options.runId);
  const checkpoint = getCheckpoint(checkpointId);
  const startedAt = new Date().toISOString();
  const ctx = buildProbeContext(env, paths, options);

  const probeResults = [];
  for (const probeId of checkpoint.probes) {
    const def = PROBE_REGISTRY[probeId];
    if (!def) continue;
    const t0 = Date.now();
    let result;
    if (env.dryRun && !options.ctxOverrides) {
      result = { status: "SKIPPED", note: "dry-run — no network", latencyMs: 0, probe: probeId };
    } else if (!def.network) {
      result = { ...(await Promise.resolve(def.run(ctx))), probe: probeId };
    } else if (!ctx.fetchJson) {
      result = { status: "SKIPPED", note: "no fetch impl", probe: probeId };
    } else {
      result = { ...(await def.run(ctx)), probe: probeId };
    }
    const latency = assessLatency(probeId, result.latencyMs ?? Date.now() - t0);
    if (latency.priority && result.status === "PASS") {
      result.status = "WARN";
      result.priority = latency.priority;
      result.note = (result.note ? `${result.note}; ` : "") + `latency ${latency.level}`;
    }
    result.latencyPriority = latency.priority;
    result.finishedAt = new Date().toISOString();
    result.attempts = result.attempts || 1;
    result.retryStatus = result.retryStatus || "none";
    probeResults.push(result);
  }

  const verdict = deriveCheckpointVerdict(probeResults);
  const finishedAt = new Date().toISOString();
  const failed = probeResults.filter((r) => r.status === "FAIL");

  let existing = loadIncidents(paths.files.incidentsDir);
  let created = null;
  if (failed.length) {
    created = createIncident({
      checkpoint,
      environment: env.environment,
      commit: env.expectedCommit,
      failedProbes: failed.map((r) => ({ id: r.probe })),
      probeResults,
    });
  }
  const incidents = mergeIncidents(existing, created, probeResults);
  saveIncidents(paths.files.incidentsDir, incidents);

  return {
    id: checkpoint.id,
    label: checkpoint.label,
    startedAt,
    finishedAt,
    verdict,
    probes: probeResults,
  };
}

export async function runCv(options = {}) {
  const env = options.env || loadCvEnv();
  const paths = options.paths || createCvPaths();
  const deployDetectedAt = options.deployDetectedAt || new Date().toISOString();
  const schedulerPlan = getSchedulerPlan({ deployDetectedAt, backend: options.backend || "manual" });
  const checkpointIds = options.checkpointIds || (options.singleCheckpoint ? [options.singleCheckpoint] : []);
  const startedAt = new Date().toISOString();

  const checkpoints = [];
  for (const id of checkpointIds) {
    checkpoints.push(await runCheckpoint(id, { ...options, env, paths }));
  }

  const incidents = loadIncidents(paths.files.incidentsDir);
  const completedIds = checkpoints.map((c) => c.id);
  const expectedIds = CHECKPOINTS.map((c) => c.id);
  const finalVerdict = deriveFinalVerdict({
    checkpoints,
    incidents,
    completedCheckpointIds: completedIds,
    expectedCheckpointIds: options.fullSequence ? expectedIds : completedIds,
  });

  const payload = sanitizeForReport({
    version: CV_VERSION,
    generatedAt: new Date().toISOString(),
    environment: env.environment,
    baseUrl: env.baseUrl,
    commit: env.expectedCommit || "unknown",
    startedAt,
    completedAt: new Date().toISOString(),
    dryRun: env.dryRun,
    schedulerPlan,
    checkpoints,
    incidents: { open: incidents.filter((i) => i.status === "open"), all: incidents },
    timeline: createTimeline({ deployDetectedAt, checkpoints, incidents }),
    freshness: buildProbeContext(env, paths).operationalArtifacts,
    finalVerdict,
    productionGate: evaluateProductionGate(finalVerdict, incidents),
  });

  writeCvReport(payload, paths);
  return payload;
}

export function evaluateProductionGate(finalVerdict, incidents) {
  const open = incidents.filter((i) => i.status === "open");
  const p0 = open.filter((i) => i.severity === "P0");
  const p1 = open.filter((i) => i.severity === "P1");
  return {
    verdict: finalVerdict,
    rollbackRecommended: p0.length > 0 || (p1.length > 0 && finalVerdict === "UNHEALTHY"),
    openIncidents: open.length,
    note:
      p0.length > 0
        ? "P0 open — rollback recommended"
        : p1.length > 0
          ? "P1 open — degraded; monitor next checkpoint"
          : finalVerdict === "HEALTHY"
            ? "All checkpoints healthy"
            : "See continuous-verification.json",
  };
}
