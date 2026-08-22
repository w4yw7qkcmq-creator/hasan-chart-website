#!/usr/bin/env node
/**
 * Production price-alerts worker health canary — masked output, no secrets printed.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const WORKER_BASE =
  process.env.PRODUCTION_PRICE_ALERTS_WORKER_URL ||
  "https://hasan-chart-worker-production.up.railway.app";
const ROOT = process.cwd();
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");

async function main() {
  const results = [];

  const healthRes = await fetch(`${WORKER_BASE}/health`);
  const health = await healthRes.json().catch(() => ({}));
  const metrics = health.workerHttpAuth || {};

  results.push({
    name: "health_online",
    pass: healthRes.ok && health.success === true,
    status: healthRes.status,
  });
  results.push({
    name: "health_alertsWorker",
    pass: health.alertsWorker === true,
  });
  results.push({
    name: "health_machineAuthConfigured",
    pass: metrics.machineAuthConfigured === true,
  });
  results.push({
    name: "health_legacyFallbackEnabled",
    pass: metrics.legacyFallbackEnabled === true,
  });
  results.push({
    name: "health_no_origin_success_metric",
    pass: metrics.origin === undefined,
  });
  results.push({
    name: "health_no_secret_leak",
    pass: !/Bearer|secret_hash|authorization/i.test(JSON.stringify(health)),
  });

  const failed = results.filter((r) => !r.pass);
  const report = {
    phase: "production-worker-auth-canary",
    timestamp: new Date().toISOString(),
    workerBase: WORKER_BASE.replace(/https:\/\/[^.]+/, "https://price-alerts-worker-***"),
    results: results.map(({ name, pass, status }) => ({ name, pass, status: status ?? null })),
    metricsBaseline: {
      machine: metrics.machine,
      legacy: metrics.legacy,
      denied: metrics.denied,
      originRejected: metrics.originRejected,
      machineHeaderRejected: metrics.machineHeaderRejected,
      humanSessionRejected: metrics.humanSessionRejected,
    },
    verdict: failed.length ? "CANARY_FAILED" : "CANARY_PASS",
    failedCount: failed.length,
  };

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const path = join(
    ARTIFACT_DIR,
    `production-worker-auth-canary-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}.json`
  );
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ verdict: report.verdict, failedCount: failed.length, artifact: path }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
