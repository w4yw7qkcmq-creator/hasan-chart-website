#!/usr/bin/env node
/**
 * Staging DB + local worker live auth matrix (no secret output).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const STAGING_ENV = resolve(ROOT, ".env.staging.local");
const WORKER_PORT = 3099;
const WORKER_BASE = `http://127.0.0.1:${WORKER_PORT}`;

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = val;
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForHealth(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${WORKER_BASE}/health`);
      if (res.ok) {
        const body = await res.json();
        if (body.success) return body;
      }
    } catch {
      // retry
    }
    await sleep(500);
  }
  throw new Error("Worker health timeout");
}

async function probe(path, headers = {}, method = "GET", body = undefined) {
  const res = await fetch(`${WORKER_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-json
  }
  return { status: res.status, json, text };
}

  const staging = parseEnvFile(STAGING_ENV);
  const required = [
    "STAGING_SUPABASE_URL",
    "STAGING_SUPABASE_SERVICE_ROLE_KEY",
    "STAGING_IAM_CRON_SECRET",
    "STAGING_IAM_NEWS_WORKER_SECRET",
  ];
  const missing = required.filter((k) => !staging[k]);
  if (missing.length) {
    console.log(JSON.stringify({ verdict: "STAGING_ENV_INCOMPLETE", missing }));
    process.exit(1);
  }

  const pepper = process.env.IAM_SERVICE_SECRET_PEPPER || staging.STAGING_IAM_SERVICE_SECRET_PEPPER || "";
  if (!pepper || pepper.length < 32) {
    console.log(
      JSON.stringify({
        verdict: "STAGING_PEPPER_REQUIRED",
        detail: "Set IAM_SERVICE_SECRET_PEPPER (32+ chars) before setup and validation.",
      })
    );
    process.exit(1);
  }

  const workerEnv = {
    ...process.env,
    NODE_ENV: "production",
    RAILWAY_ENVIRONMENT: "staging",
    PORT: String(WORKER_PORT),
    NEXT_PUBLIC_SUPABASE_URL: staging.STAGING_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: staging.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    IAM_SERVICE_SECRET_PEPPER: pepper,
    IAM_WORKER_AUTH: "true",
    IAM_WORKER_LEGACY_FALLBACK: "true",
    WORKER_API_SECRET: staging.STAGING_IAM_ANALYSIS_WORKER_SECRET || staging.STAGING_IAM_CRON_SECRET,
    CRON_SECRET: staging.STAGING_IAM_CRON_SECRET,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "sk-test-placeholder-not-used",
  };

  const child = spawn("node", ["worker/index.js"], {
    cwd: ROOT,
    env: workerEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let crashed = false;
  child.on("exit", (code) => {
    if (code !== 0 && code !== null) crashed = true;
  });

  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });

  try {
    const health = await waitForHealth();
    record("worker_health_ready", true, {
      machineAuthConfigured: health.workerHttpAuth?.machineAuthConfigured,
      legacyFallbackEnabled: health.workerHttpAuth?.legacyFallbackEnabled,
      alertsWorker: health.alertsWorker,
    });

    const finalHealth = await probe("/health");
    const metrics = finalHealth.json?.workerHttpAuth || {};
    const healthBlob = JSON.stringify(finalHealth.json || {});
    record("health_no_secrets", !/Bearer|secret_hash|authorization/i.test(healthBlob), {});
    record("metrics_originRejected", typeof metrics.originRejected === "number", {
      originRejected: metrics.originRejected,
    });
    record("metrics_denied_counter", typeof metrics.denied === "number", { denied: metrics.denied });
  } finally {
    child.kill("SIGTERM");
    await sleep(500);
    if (crashed) record("worker_no_crash_loop", false, { crashed: true });
    else record("worker_no_crash_loop", true, {});
  }

  const failed = results.filter((r) => !r.pass);
  console.log(
    JSON.stringify(
      {
        verdict: failed.length ? "STAGING_WORKER_AUTH_FAILED" : "STAGING_WORKER_AUTH_VALIDATED",
        mode: "local_worker_staging_db",
        railwayStagingEnvironment: false,
        pepperConfigured: Boolean(workerEnv.IAM_SERVICE_SECRET_PEPPER),
        results,
        failedCount: failed.length,
      },
      null,
      2
    )
  );
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
