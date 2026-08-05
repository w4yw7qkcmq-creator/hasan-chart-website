#!/usr/bin/env node
/**
 * B2 Production closure canary — machine auth matrix (no secrets in output).
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
  assertProductionSupabaseConfig,
} from "../../lib/production-env-guard.js";
import { verifyServiceSecret } from "../../lib/iam/service-accounts.js";

const ROOT = process.cwd();
const PROD_ENV = resolve(ROOT, ".env.local");
const WORKER_AUTH_ENV = resolve(ROOT, ".env.production.worker-auth.local");
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const WORKER_BASE = process.env.B2_SUBSCRIPTION_WORKER_URL || "https://comfortable-passion-production-2ca2.up.railway.app";
const WEB_BASE = process.env.B2_WEB_URL || "https://www.hasanchartworld.com";
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

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

function headers(id, sec, extra = {}) {
  return {
    "x-service-account-id": id,
    "x-service-account-secret": sec,
    ...extra,
  };
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const local = parseEnvFile(PROD_ENV);
  const workerAuth = parseEnvFile(WORKER_AUTH_ENV);
  const env = { ...local, ...workerAuth };

  const urlRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL || "");
  if (urlRef === STAGING_SUPABASE_PROJECT_REF) throw new Error("Staging ref rejected");
  assertProductionSupabaseConfig({ projectRef: urlRef, url: env.NEXT_PUBLIC_SUPABASE_URL });

  const pepper = env.IAM_SERVICE_SECRET_PEPPER;
  const secret = env.IAM_SUBSCRIPTION_MAINTENANCE_SECRET;
  const cronSecret = env.IAM_CRON_SERVICE_SECRET || env.CRON_SECRET;
  if (!pepper || !secret) throw new Error("Production worker auth env incomplete");

  process.env.IAM_SERVICE_SECRET_PEPPER = pepper;

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: account } = await sb
    .from("iam_service_accounts")
    .select("id, enabled, secret_hash, revoked_at")
    .eq("id", ACCOUNT_ID)
    .maybeSingle();

  const hashMatch = verifyServiceSecret(secret, account?.secret_hash, ACCOUNT_ID);

  const health = await httpJson(`${WORKER_BASE}/health`);
  const matrix = {};

  matrix.workerHealth = health;
  matrix.correctMachineDryRun = await httpJson(`${WORKER_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: headers(ACCOUNT_ID, secret),
  });
  matrix.wrongSecret = await httpJson(`${WORKER_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: headers(ACCOUNT_ID, "invalid-secret"),
  });
  matrix.crossService = await httpJson(`${WORKER_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: headers("cron", cronSecret || "invalid"),
  });
  matrix.incompleteHeaders = await httpJson(`${WORKER_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: { "x-service-account-id": ACCOUNT_ID },
  });
  matrix.legacyOnly = await httpJson(`${WORKER_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  });

  const webHealth = await httpJson(`${WEB_BASE}/api/health?detail=1`);
  matrix.webHealth = { status: webHealth.status, machineAuth: webHealth.body?.iam?.machineAuth || null };
  matrix.webCronMachine = await httpJson(`${WEB_BASE}/api/check-subscription-expiry`, {
    headers: headers("cron", cronSecret || ""),
  });
  matrix.webCronLegacy = await httpJson(`${WEB_BASE}/api/check-subscription-expiry`, {
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  });

  const pass =
    hashMatch &&
    account?.enabled === true &&
    health.status === 200 &&
    matrix.correctMachineDryRun.status === 200 &&
    matrix.wrongSecret.status === 401 &&
    matrix.crossService.status === 403 &&
    matrix.incompleteHeaders.status === 401 &&
    matrix.webCronLegacy.status === 403 &&
    [200, 503].includes(matrix.webCronMachine.status);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z";
  const artifact = {
    timestamp,
    phase: "b2-production-closure",
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    deployedCommit: webHealth.body?.commit?.sha?.slice(0, 7) || null,
    hashCheck: { hashMatch, enabled: account?.enabled === true },
    matrix: Object.fromEntries(
      Object.entries(matrix).map(([k, v]) => [
        k,
        v.status !== undefined
          ? { status: v.status, success: v.body?.success, machineAuth: v.machineAuth || undefined }
          : v,
      ])
    ),
    machineAuthMetrics: matrix.webHealth?.machineAuth || null,
    verdict: pass ? "PRODUCTION_CANARY_PASS" : "PRODUCTION_CANARY_FAIL",
  };

  writeFileSync(join(ARTIFACT_DIR, `b2-cron-production-post-${timestamp}.json`), JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ verdict: artifact.verdict, hashMatch, workerHealth: health.status }, null, 2));
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
