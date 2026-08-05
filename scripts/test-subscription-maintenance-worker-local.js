#!/usr/bin/env node
/**
 * Local smoke — subscription maintenance worker HTTP server (always-on mode).
 * Verifies /health and /run route wiring without printing secrets.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const ROOT = process.cwd();
const WORKER_DIR = resolve(ROOT, "worker");
const PORT = 3197;

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function waitForHealth(url, timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolvePromise, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolvePromise(res);
      } catch {
        // retry
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error(`timeout waiting for ${url}`));
      }
      setTimeout(tick, 250);
    };
    tick();
  });
}

async function main() {
  const local = parseEnvFile(resolve(ROOT, ".env.local"));
  const workerAuth = parseEnvFile(resolve(ROOT, ".env.production.worker-auth.local"));
  const pepper = workerAuth.IAM_SERVICE_SECRET_PEPPER;
  const secret = workerAuth.IAM_SUBSCRIPTION_MAINTENANCE_SECRET;

  assert.ok(pepper && pepper.length >= 32, "IAM_SERVICE_SECRET_PEPPER missing in .env.production.worker-auth.local");
  assert.ok(secret, "IAM_SUBSCRIPTION_MAINTENANCE_SECRET missing in .env.production.worker-auth.local");
  assert.ok(local.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL missing in .env.local");
  assert.ok(local.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY missing in .env.local");
  assert.ok(local.RESEND_API_KEY || workerAuth.RESEND_API_KEY, "RESEND_API_KEY missing");
  const resendKey = local.RESEND_API_KEY || workerAuth.RESEND_API_KEY || `re_${"k".repeat(24)}`;
  const emailFrom = local.EMAIL_FROM || "HasaN CharT World <support@example.com>";
  const emailReplyTo = local.EMAIL_REPLY_TO || "support@example.com";
  const siteUrl = local.NEXT_PUBLIC_SITE_URL || "https://www.hasanchartworld.com";

  const child = spawn("node", ["subscription-maintenance-worker.js"], {
    cwd: WORKER_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: "development",
      SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED: "true",
      IAM_WORKER_AUTH: "true",
      IAM_WORKER_LEGACY_FALLBACK: "true",
      IAM_SERVICE_SECRET_PEPPER: pepper,
      IAM_SUBSCRIPTION_MAINTENANCE_SECRET: secret,
      IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID: "subscription-maintenance-worker",
      NEXT_PUBLIC_SUPABASE_URL: local.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: local.SUPABASE_SERVICE_ROLE_KEY,
      RESEND_API_KEY: resendKey,
      EMAIL_FROM: emailFrom,
      EMAIL_REPLY_TO: emailReplyTo,
      NEXT_PUBLIC_SITE_URL: siteUrl,
      SUBSCRIPTION_WORKER_ONESHOT: "",
    },
    stdio: "ignore",
  });

  const base = `http://127.0.0.1:${PORT}`;

  try {
    const healthRes = await waitForHealth(`${base}/health`);
    const health = await healthRes.json();
    assert.equal(health.service, "hasan-chart-subscription-maintenance-worker");
    assert.equal(health.status, "online");
    assert.equal(health.workerEnabled, true);
    assert.equal(health.environmentValidation?.ok, true);

    const noAuth = await fetch(`${base}/run?dryRun=true`, { method: "POST" });
    assert.equal(noAuth.status, 401);

    const wrongSecret = await fetch(`${base}/run?dryRun=true`, {
      method: "POST",
      headers: {
        "x-service-account-id": "subscription-maintenance-worker",
        "x-service-account-secret": "invalid-secret",
      },
    });
    assert.equal(wrongSecret.status, 401);

    const ok = await fetch(`${base}/run?dryRun=true`, {
      method: "POST",
      headers: {
        "x-service-account-id": "subscription-maintenance-worker",
        "x-service-account-secret": secret,
      },
    });
    assert.notEqual(ok.status, 404, "/run must be registered (not 404)");
    assert.notEqual(ok.status, 401, "machine auth should succeed locally");
    assert.notEqual(ok.status, 403, "machine auth should succeed locally");

    console.log(
      JSON.stringify(
        {
          verdict: "PASS",
          health: health.service,
          runStatus: ok.status,
          mode: "always-on-server",
        },
        null,
        2
      )
    );
  } finally {
    child.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ verdict: "FAIL", error: error.message }));
  process.exit(1);
});
