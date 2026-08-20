#!/usr/bin/env node
/**
 * B2 Final production closure canary — machine auth matrix (no secrets in output).
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
const API_BASE =
  process.env.B2_SUBSCRIPTION_WORKER_URL ||
  process.env.SUBSCRIPTION_MAINTENANCE_API_URL ||
  "https://subscription-maintenance-api-production.up.railway.app";
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

async function loadCronSecretForWeb(local) {
  if (local.IAM_CRON_SERVICE_SECRET) return local.IAM_CRON_SERVICE_SECRET;
  try {
    const { spawnSync } = await import("node:child_process");
    const r = spawnSync("npx", ["@railway/cli", "variables", "--json", "--service", "hasan-chart-website"], {
      encoding: "utf8",
    });
    if (r.status === 0) {
      const vars = JSON.parse(r.stdout);
      return vars.IAM_CRON_SERVICE_SECRET || vars.CRON_SECRET || "";
    }
  } catch {
    // fallback to local only
  }
  return local.CRON_SECRET || "";
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: Object.fromEntries(res.headers.entries()) };
}

function machineHeaders(id, sec, extra = {}) {
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

  const secret = env.IAM_SUBSCRIPTION_MAINTENANCE_SECRET;
  if (!secret) throw new Error("IAM_SUBSCRIPTION_MAINTENANCE_SECRET missing in .env.production.worker-auth.local");

  process.env.IAM_SERVICE_SECRET_PEPPER = env.IAM_SERVICE_SECRET_PEPPER;

  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: account } = await sb
    .from("iam_service_accounts")
    .select("id, enabled, secret_hash, revoked_at")
    .eq("id", ACCOUNT_ID)
    .maybeSingle();

  const hashMatch = verifyServiceSecret(secret, account?.secret_hash, ACCOUNT_ID);
  const cronSecret = await loadCronSecretForWeb(local);

  const metricsBefore = await httpJson(`${WEB_BASE}/api/health?detail=1`, {
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  });
  const matrix = {};

  matrix.apiHealth = await httpJson(`${API_BASE}/health`);
  matrix.correctMachineDryRun = await httpJson(`${API_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: machineHeaders(ACCOUNT_ID, secret),
  });
  matrix.wrongSecret = await httpJson(`${API_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: machineHeaders(ACCOUNT_ID, "invalid-secret-value"),
  });
  matrix.crossService = await httpJson(`${API_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: machineHeaders("cron", cronSecret || "invalid"),
  });
  matrix.incompleteHeaders = await httpJson(`${API_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: { "x-service-account-id": ACCOUNT_ID },
  });
  matrix.wrongMachinePlusLegacy = await httpJson(`${API_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: {
      ...machineHeaders(ACCOUNT_ID, "invalid-secret-value"),
      Authorization: cronSecret ? `Bearer ${cronSecret}` : "Bearer legacy",
    },
  });
  matrix.legacyOnly = await httpJson(`${API_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  });
  matrix.cookieOnly = await httpJson(`${API_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: { cookie: "hc_access_token=test-token" },
  });
  matrix.noCredentials = await httpJson(`${API_BASE}/run?dryRun=true`, { method: "POST" });

  const inflight1 = httpJson(`${API_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: machineHeaders(ACCOUNT_ID, secret),
  });
  await new Promise((r) => setTimeout(r, 50));
  matrix.duplicateInflight = await httpJson(`${API_BASE}/run?dryRun=true`, {
    method: "POST",
    headers: machineHeaders(ACCOUNT_ID, secret),
  });
  await inflight1;

  matrix.webCronMachine = await httpJson(`${WEB_BASE}/api/check-subscription-expiry`, {
    headers: machineHeaders("cron", cronSecret || ""),
  });
  matrix.webCronLegacy = await httpJson(`${WEB_BASE}/api/check-subscription-expiry`, {
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  });

  const metricsAfter = await httpJson(`${WEB_BASE}/api/health?detail=1`, {
    headers: cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {},
  });

  const legacyOnlyAcceptable =
    matrix.legacyOnly.status === 200 || matrix.legacyOnly.status === 401;

  const pass =
    hashMatch &&
    account?.enabled === true &&
    matrix.apiHealth.status === 200 &&
    matrix.apiHealth.body?.service === "hasan-chart-subscription-maintenance-worker" &&
    matrix.correctMachineDryRun.status === 200 &&
    matrix.wrongSecret.status === 401 &&
    matrix.crossService.status === 403 &&
    matrix.incompleteHeaders.status === 401 &&
    [401, 403].includes(matrix.wrongMachinePlusLegacy.status) &&
    legacyOnlyAcceptable &&
    [401, 403].includes(matrix.noCredentials.status) &&
    [401, 403].includes(matrix.cookieOnly.status) &&
    [409, 200].includes(matrix.duplicateInflight.status) &&
    matrix.webCronLegacy.status === 403 &&
    [200, 503].includes(matrix.webCronMachine.status);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z";
  const artifact = {
    timestamp,
    phase: "b2-final-cron-cutover-canary",
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    apiBaseHost: new URL(API_BASE).host,
    deployedCommit: metricsAfter.body?.build?.commit?.slice(0, 7) || null,
    hashCheck: { hashMatch, enabled: account?.enabled === true },
    metricsBefore: metricsBefore.body?.iam?.machineAuth || null,
    metricsAfter: metricsAfter.body?.iam?.machineAuth || null,
    matrix: Object.fromEntries(
      Object.entries(matrix).map(([k, v]) => [
        k,
        v.status !== undefined
          ? {
              status: v.status,
              success: v.body?.success,
              service: v.body?.service,
              error: v.body?.error ? String(v.body.error).slice(0, 80) : undefined,
            }
          : v,
      ])
    ),
    verdict: pass ? "PRODUCTION_CANARY_PASS" : "PRODUCTION_CANARY_FAIL",
    legacyOnlyNote:
      matrix.legacyOnly.status === 401
        ? "API has no CRON_SECRET runtime path; legacy rollback remains on old cron caller only until soak ends"
        : "legacy fallback accepted on API",
  };

  writeFileSync(join(ARTIFACT_DIR, `b2-final-cron-cutover-canary-${timestamp}.json`), JSON.stringify(artifact, null, 2));
  console.log(JSON.stringify({ verdict: artifact.verdict, hashMatch, apiHealth: matrix.apiHealth.status }, null, 2));
  if (!pass) process.exit(1);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
