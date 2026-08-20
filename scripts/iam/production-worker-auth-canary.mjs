#!/usr/bin/env node
/**
 * Production worker auth canary — masked output, no secrets printed.
 * Reads credentials from .env.production.worker-auth.local + Railway AI Worker CRON.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";

const WORKER_BASE = process.env.PRODUCTION_AI_WORKER_URL || "https://ai-worker-production-a6ea.up.railway.app";
const ROOT = process.cwd();
const AUTH_ENV = resolve(ROOT, ".env.production.worker-auth.local");
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

async function getRailwayCronSecret() {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("npx", ["@railway/cli@latest", "variables", "--service", "AI Worker", "--json"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (c) => (out += c));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error("railway vars failed"));
      try {
        const data = JSON.parse(out);
        resolvePromise(String(data.CRON_SECRET || ""));
      } catch (e) {
        reject(e);
      }
    });
  });
}

async function probe(path, headers = {}, method = "POST", body = {}) {
  const res = await fetch(`${WORKER_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, textLen: text.length };
}

function authPass(status) {
  return status !== 401 && status !== 403 && status !== 503;
}

async function main() {
  const auth = parseEnvFile(AUTH_ENV);
  const machineSecret = auth.IAM_INSTANT_ANALYSIS_WORKER_SECRET;
  const cronSecret = await getRailwayCronSecret();
  const legacySecret = cronSecret;

  if (!machineSecret) throw new Error("Missing local machine secret file");

  const results = [];

  results.push({
    name: "machine_correct",
    pass: authPass(
      (await probe("/api/instant-analysis", {
        "x-service-account-id": "instant-analysis-worker",
        "x-service-account-secret": machineSecret,
      })).status
    ),
    status: (await probe("/api/instant-analysis", {
      "x-service-account-id": "instant-analysis-worker",
      "x-service-account-secret": machineSecret,
    })).status,
  });

  results.push({
    name: "machine_wrong",
    pass: (await probe("/api/instant-analysis", {
      "x-service-account-id": "instant-analysis-worker",
      "x-service-account-secret": "wrong-secret",
    })).status === 401,
  });

  results.push({
    name: "machine_wrong_plus_legacy",
    pass:
      (await probe("/api/instant-analysis", {
        "x-service-account-id": "instant-analysis-worker",
        "x-service-account-secret": "wrong-secret",
        authorization: `Bearer ${legacySecret}`,
      })).status === 401,
  });

  results.push({
    name: "cron_account_denied",
    pass:
      (await probe("/api/instant-analysis", {
        "x-service-account-id": "cron",
        "x-service-account-secret": cronSecret,
      })).status === 403,
  });

  results.push({
    name: "origin_only_denied",
    pass: (await probe("/api/instant-analysis", { origin: "https://www.hasanchartworld.com" })).status === 403,
  });

  results.push({
    name: "referer_only_denied",
    pass:
      (await probe("/api/instant-analysis", { referer: "https://www.hasanchartworld.com/admin" })).status === 403,
  });

  results.push({
    name: "cookie_only_denied",
    pass: (await probe("/api/instant-analysis", { cookie: "hc_access_token=fake" })).status === 403,
  });

  results.push({
    name: "legacy_valid_no_machine",
    pass: authPass((await probe("/api/instant-analysis", { authorization: `Bearer ${legacySecret}` })).status),
  });

  const healthRes = await fetch(`${WORKER_BASE}/health`);
  const health = await healthRes.json();
  const metrics = health.workerHttpAuth || {};
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
    workerBase: WORKER_BASE.replace(/https:\/\/[^.]+/, "https://ai-worker-***"),
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
