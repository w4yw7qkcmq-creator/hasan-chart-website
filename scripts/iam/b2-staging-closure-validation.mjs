#!/usr/bin/env node
/**
 * B2 Staging closure — machine auth matrix + business-safe dry-run.
 * Staging-only (.env.staging.local). Never prints secrets.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  assertStagingSupabaseConfig,
  extractSupabaseProjectRef,
  STAGING_SUPABASE_PROJECT_REF,
} from "../../lib/staging-env-guard.js";
import {
  hashServiceSecret,
  verifyServiceSecret,
} from "../../lib/iam/service-accounts.js";

const ROOT = process.cwd();
const STAGING_ENV = resolve(ROOT, ".env.staging.local");
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const WORKER_PORT = 3199;
const WEB_PORT = 3022;
const ACCOUNT_ID = "subscription-maintenance-worker";

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

function loadStagingEnv() {
  const staging = parseEnvFile(STAGING_ENV);
  assertStagingSupabaseConfig({
    projectRef: staging.STAGING_SUPABASE_PROJECT_REF,
    url: staging.STAGING_SUPABASE_URL,
  });
  if (extractSupabaseProjectRef(staging.STAGING_SUPABASE_URL) !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("Staging project ref mismatch");
  }
  const pepper = staging.STAGING_IAM_SERVICE_SECRET_PEPPER || staging.IAM_SERVICE_SECRET_PEPPER;
  const secret = staging.STAGING_IAM_SUBSCRIPTION_MAINTENANCE_SECRET;
  if (!pepper || pepper.length < 32) throw new Error("STAGING_IAM_SERVICE_SECRET_PEPPER missing/short");
  if (!secret) throw new Error("STAGING_IAM_SUBSCRIPTION_MAINTENANCE_SECRET missing");
  return { staging, pepper, secret };
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function waitForUrl(url, timeoutMs = 45000) {
  const start = Date.now();
  return new Promise((resolvePromise, reject) => {
    const tick = async () => {
      try {
        const res = await fetch(url);
        if (res.ok) return resolvePromise(true);
      } catch {
        // retry
      }
      if (Date.now() - start > timeoutMs) return reject(new Error(`timeout waiting ${url}`));
      setTimeout(tick, 500);
    };
    tick();
  });
}

function startWorker(env) {
  return spawn("node", ["worker/subscription-maintenance-worker.js"], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...env,
      PORT: String(WORKER_PORT),
      SUBSCRIPTION_MAINTENANCE_WORKER_ENABLED: "true",
      IAM_WORKER_AUTH: "true",
      IAM_WORKER_LEGACY_FALLBACK: "true",
      IAM_SERVICE_SECRET_PEPPER: env.STAGING_IAM_SERVICE_SECRET_PEPPER,
      IAM_SUBSCRIPTION_MAINTENANCE_SERVICE_ACCOUNT_ID: ACCOUNT_ID,
      IAM_SUBSCRIPTION_MAINTENANCE_SECRET: env.STAGING_IAM_SUBSCRIPTION_MAINTENANCE_SECRET,
      CRON_SECRET: env.STAGING_IAM_CRON_SECRET,
      NEXT_PUBLIC_SUPABASE_URL: env.STAGING_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    },
    stdio: "ignore",
  });
}

function startWeb(env) {
  return spawn("npm", ["run", "dev", "--", "-p", String(WEB_PORT)], {
    cwd: ROOT,
    env: {
      ...process.env,
      ...env,
      NODE_ENV: "development",
      NEXT_PUBLIC_SUPABASE_URL: env.STAGING_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.STAGING_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
      IAM_DB: "true",
      IAM_API: "true",
      IAM_UI: "true",
      IAM_RLS: "true",
      IAM_SERVICE_SECRET_PEPPER: env.STAGING_IAM_SERVICE_SECRET_PEPPER,
    },
    stdio: "ignore",
  });
}

async function verifyHash(sb, pepper, secret) {
  const { data } = await sb
    .from("iam_service_accounts")
    .select("id, enabled, secret_hash, revoked_at")
    .eq("id", ACCOUNT_ID)
    .maybeSingle();
  const expected = hashServiceSecret(secret, ACCOUNT_ID);
  return {
    exists: Boolean(data),
    enabled: data?.enabled === true,
    hashMatch: verifyServiceSecret(secret, data?.secret_hash, ACCOUNT_ID),
    hashPrefix: String(data?.secret_hash || "").slice(0, 8),
    expectedPrefix: expected.slice(0, 8),
    revoked: Boolean(data?.revoked_at),
  };
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const { staging, pepper, secret } = loadStagingEnv();
  process.env.IAM_SERVICE_SECRET_PEPPER = pepper;

  const sb = createClient(staging.STAGING_SUPABASE_URL, staging.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const hashCheck = await verifyHash(sb, pepper, secret);
  if (!hashCheck.hashMatch || !hashCheck.enabled) {
    throw new Error(`hashMatch failed: ${JSON.stringify(hashCheck)}`);
  }

  const worker = startWorker(staging);
  const workerBase = `http://127.0.0.1:${WORKER_PORT}`;
  await waitForUrl(`${workerBase}/health`);

  const headers = (id, sec, extra = {}) => ({
    "x-service-account-id": id,
    "x-service-account-secret": sec,
    ...extra,
  });

  const matrix = {};

  matrix.correctMachine = await httpJson(`${workerBase}/run?dryRun=true`, {
    method: "POST",
    headers: headers(ACCOUNT_ID, secret),
  });

  matrix.wrongSecret = await httpJson(`${workerBase}/run?dryRun=true`, {
    method: "POST",
    headers: headers(ACCOUNT_ID, "wrong-secret-value"),
  });

  matrix.crossService = await httpJson(`${workerBase}/run?dryRun=true`, {
    method: "POST",
    headers: headers("cron", staging.STAGING_IAM_CRON_SECRET),
  });

  matrix.incompleteHeaders = await httpJson(`${workerBase}/run?dryRun=true`, {
    method: "POST",
    headers: { "x-service-account-id": ACCOUNT_ID },
  });

  matrix.wrongMachinePlusLegacy = await httpJson(`${workerBase}/run?dryRun=true`, {
    method: "POST",
    headers: {
      ...headers(ACCOUNT_ID, "wrong-secret-value"),
      Authorization: `Bearer ${staging.STAGING_IAM_CRON_SECRET}`,
    },
  });

  matrix.legacyOnly = await httpJson(`${workerBase}/run?dryRun=true`, {
    method: "POST",
    headers: { Authorization: `Bearer ${staging.STAGING_IAM_CRON_SECRET}` },
  });

  matrix.noCredentials = await httpJson(`${workerBase}/run?dryRun=true`, { method: "POST" });

  // Disable account test
  await sb.from("iam_service_accounts").update({ enabled: false }).eq("id", ACCOUNT_ID);
  matrix.disabledAccount = await httpJson(`${workerBase}/run?dryRun=true`, {
    method: "POST",
    headers: headers(ACCOUNT_ID, secret),
  });
  await sb.from("iam_service_accounts").update({ enabled: true }).eq("id", ACCOUNT_ID);

  // Revoke test
  const revokedAt = new Date().toISOString();
  await sb.from("iam_service_accounts").update({ revoked_at: revokedAt }).eq("id", ACCOUNT_ID);
  matrix.revokedAccount = await httpJson(`${workerBase}/run?dryRun=true`, {
    method: "POST",
    headers: headers(ACCOUNT_ID, secret),
  });
  await sb.from("iam_service_accounts").update({ revoked_at: null }).eq("id", ACCOUNT_ID);

  // Duplicate in-flight
  const inflight1 = httpJson(`${workerBase}/run?dryRun=true`, {
    method: "POST",
    headers: headers(ACCOUNT_ID, secret),
  });
  await new Promise((r) => setTimeout(r, 50));
  const inflight2 = await httpJson(`${workerBase}/run?dryRun=true`, {
    method: "POST",
    headers: headers(ACCOUNT_ID, secret),
  });
  await inflight1;
  matrix.duplicateInflight = inflight2;

  worker.kill("SIGTERM");

  const web = startWeb(staging);
  const webBase = `http://127.0.0.1:${WEB_PORT}`;
  try {
    await waitForUrl(`${webBase}/api/health`);
    matrix.webCronMachine = await httpJson(`${webBase}/api/check-subscription-expiry`, {
      headers: headers("cron", staging.STAGING_IAM_CRON_SECRET),
    });
    matrix.webCronLegacy = await httpJson(`${webBase}/api/check-subscription-expiry`, {
      headers: { Authorization: `Bearer ${staging.STAGING_IAM_CRON_SECRET}` },
    });
    const health = await httpJson(`${webBase}/api/health?detail=1`, {
      headers: { Authorization: `Bearer ${staging.STAGING_IAM_CRON_SECRET}` },
    });
    matrix.machineAuthMetrics = health.body?.iam?.machineAuth || null;
  } finally {
    web.kill("SIGTERM");
  }

  const pass =
    matrix.correctMachine.status === 200 &&
    matrix.wrongSecret.status === 401 &&
    matrix.crossService.status === 403 &&
    matrix.incompleteHeaders.status === 401 &&
    [401, 403].includes(matrix.wrongMachinePlusLegacy.status) &&
    matrix.legacyOnly.status === 200 &&
    [401, 403].includes(matrix.noCredentials.status) &&
    matrix.disabledAccount.status === 403 &&
    matrix.revokedAccount.status === 403 &&
    matrix.webCronLegacy.status === 403 &&
    [200, 503].includes(matrix.webCronMachine.status);

  const artifact = {
    timestamp: new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z",
    phase: "b2-staging-closure",
    stagingProjectRef: STAGING_SUPABASE_PROJECT_REF,
    hashCheck,
    matrix: Object.fromEntries(
      Object.entries(matrix).map(([k, v]) => [k, { status: v.status, success: v.body?.success }])
    ),
    machineAuthMetrics: matrix.machineAuthMetrics,
    verdict: pass ? "STAGING_PASS" : "STAGING_FAIL",
  };

  writeFileSync(
    join(ARTIFACT_DIR, `b2-cron-staging-post-${artifact.timestamp}.json`),
    JSON.stringify(artifact, null, 2)
  );

  console.log(JSON.stringify({ verdict: artifact.verdict, hashMatch: hashCheck.hashMatch }, null, 2));
  if (!pass) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exit(1);
});
