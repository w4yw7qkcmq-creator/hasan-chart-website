#!/usr/bin/env node
/**
 * Owner Web Instant Analysis E2E — Production, one request, masked output.
 * Usage: node scripts/iam/owner-instant-analysis-e2e.mjs
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  extractSupabaseProjectRef,
  maskProjectRef,
} from "../../lib/production-env-guard.js";

const ROOT = process.cwd();
const WEB_BASE = "https://www.hasanchartworld.com";
const WORKER_BASE = "https://ai-worker-production-a6ea.up.railway.app";
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");

const METRIC_KEYS = [
  "machine",
  "legacy",
  "denied",
  "originRejected",
  "machineHeaderRejected",
  "humanSessionRejected",
];

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

function maskEmail(email = "") {
  const [local, domain = ""] = String(email).split("@");
  if (!domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWorkerMetrics() {
  const res = await fetch(`${WORKER_BASE}/health`, { headers: { Accept: "application/json" } });
  const json = await res.json();
  const auth = json.workerHttpAuth || {};
  return {
    metrics: Object.fromEntries(METRIC_KEYS.map((k) => [k, auth[k] ?? 0])),
    machineAuthConfigured: auth.machineAuthConfigured,
    legacyFallbackEnabled: auth.legacyFallbackEnabled,
    priceAlertsWorker: json.alertsWorker,
    checkIntervalMs: json.checkIntervalMs,
    success: json.success,
  };
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, json };
}

function metricDelta(before, after) {
  const delta = {};
  for (const key of METRIC_KEYS) {
    delta[key] = Number(after[key] || 0) - Number(before[key] || 0);
  }
  return delta;
}

function validateResultSchema(data) {
  const result = data?.result || data?.data?.result || data;
  if (!result || typeof result !== "object") return { ok: false, reason: "missing_result" };
  const checks = {
    hasDirection: Boolean(result.direction || result.bias || result.trend),
    hasRisk: Boolean(result.riskLevel || result.risk || result.riskAssessment),
    hasMarketState: Boolean(result.marketState || result.marketCondition || result.regime),
    hasTradePlan: Boolean(result.tradePlan || result.plan || result.levels),
  };
  return { ok: Object.values(checks).some(Boolean), checks };
}

async function main() {
  const local = parseEnvFile(resolve(ROOT, ".env.local"));
  const bootstrap = parseEnvFile(resolve(ROOT, ".env.production.bootstrap.local"));
  const env = { ...local, ...bootstrap };

  const urlRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL || "");
  if (urlRef === STAGING_SUPABASE_PROJECT_REF) throw new Error("Staging ref rejected");
  if (urlRef !== PRODUCTION_SUPABASE_PROJECT_REF) throw new Error("Not production Supabase ref");

  const email = env.IAM_OWNER_EMAIL;
  const password = env.PRODUCTION_OWNER_PASSWORD;
  if (!email || !password) throw new Error("Owner credentials missing in .env.local");

  const metricsBefore = await fetchWorkerMetrics();
  const startedAt = Date.now();

  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: loginData, error: loginError } = await anon.auth.signInWithPassword({ email, password });
  if (loginError || !loginData?.session?.access_token) {
    throw new Error(`Owner login failed: ${loginError?.message || "no_session"}`);
  }

  const cookie = `hc_access_token=${loginData.session.access_token}; hc_refresh_token=${loginData.session.refresh_token}`;

  const sessionCheck = await httpJson(`${WEB_BASE}/api/auth/session`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });

  const iamMe = await httpJson(`${WEB_BASE}/api/iam/me`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });

  const ownerAuth = {
    loginStatus: 200,
    sessionAuthenticated: Boolean(sessionCheck.json?.authenticated ?? sessionCheck.json?.user),
    isAdmin: Boolean(iamMe.json?.isAdmin),
    hasActiveAssignment: Boolean(iamMe.json?.hasActiveAssignment),
    roles: (iamMe.json?.roles || iamMe.json?.roleIds || []).map(String),
    maskedEmail: maskEmail(email),
  };

  if (!ownerAuth.isAdmin || !ownerAuth.hasActiveAssignment) {
    throw new Error("Owner IAM context invalid");
  }
  if (!ownerAuth.roles.some((r) => /super_admin/i.test(r))) {
    ownerAuth.rolesWarning = "super_admin not confirmed in roles array";
  }

  const availability = await httpJson(`${WEB_BASE}/api/instant-analysis/availability`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });

  const allowed = availability.json?.allowed !== false && availability.status !== 429;
  if (!allowed) {
    const report = {
      verdict: "OWNER_WEB_E2E_BLOCKED_COOLDOWN",
      ownerAuth,
      availability: {
        status: availability.status,
        allowed: availability.json?.allowed,
        retryAfterSeconds: availability.json?.retryAfterSeconds,
        code: availability.json?.code,
      },
      metricsBefore: metricsBefore.metrics,
    };
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    const path = join(
      ARTIFACT_DIR,
      `worker-auth-owner-e2e-pre-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}.json`
    );
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ verdict: report.verdict, artifact: path }, null, 2));
    process.exit(1);
  }

  const createStarted = Date.now();
  const create = await httpJson(`${WEB_BASE}/api/instant-analysis`, {
    method: "POST",
    headers: { Cookie: cookie, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: "BTC-USDT",
      executionTimeframe: "15m",
      source: "my-dashboard",
    }),
  });

  if (!create.ok || !create.json?.success) {
    throw new Error(
      `Instant analysis create failed: status=${create.status} code=${create.json?.code || "unknown"}`
    );
  }

  const jobId = String(create.json?.jobId || "").trim();
  if (!jobId) throw new Error("No jobId returned");

  let finalStatus = "processing";
  let finalPayload = null;
  let pollCount = 0;
  const maxPolls = 24;

  while (pollCount < maxPolls) {
    pollCount += 1;
    await sleep(5000);
    const statusRes = await httpJson(
      `${WEB_BASE}/api/instant-analysis/${encodeURIComponent(jobId)}`,
      { headers: { Cookie: cookie, Accept: "application/json" } }
    );
    finalStatus = String(statusRes.json?.status || statusRes.json?.job?.status || "unknown");
    finalPayload = statusRes.json;
    if (finalStatus === "completed" || finalStatus === "failed") break;
  }

  const completionMs = Date.now() - createStarted;
  const metricsAfter = await fetchWorkerMetrics();
  const delta = metricDelta(metricsBefore.metrics, metricsAfter.metrics);

  const authModeConfirmed =
    delta.machine >= 1 && delta.legacy === 0 && delta.machineHeaderRejected === 0;

  const schema = validateResultSchema(finalPayload);

  const postAvailability = await httpJson(`${WEB_BASE}/api/instant-analysis/availability`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });

  const report = {
    phase: "owner-web-instant-analysis-e2e",
    timestamp: new Date().toISOString(),
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    deployedCommit: "bc4e03b",
    ownerAuth,
    availabilityBefore: { status: availability.status, allowed: availability.json?.allowed !== false },
    request: {
      symbol: "BTC-USDT",
      executionTimeframe: "15m",
      createStatus: create.status,
      jobIdPresent: true,
      jobIdPrefix: jobId.slice(0, 8) + "***",
    },
    lifecycle: {
      pollCount,
      finalStatus,
      completionMs,
      schema,
      cooldownAfter: {
        allowed: postAvailability.json?.allowed,
        retryAfterSeconds: postAvailability.json?.retryAfterSeconds,
      },
    },
    metricsBefore: metricsBefore.metrics,
    metricsAfter: metricsAfter.metrics,
    metricsDelta: delta,
    authModeConfirmed,
    legacyIncreased: delta.legacy > 0,
    priceAlerts: {
      worker: metricsAfter.priceAlertsWorker,
      checkIntervalMs: metricsAfter.checkIntervalMs,
    },
    verdict:
      finalStatus === "completed" && authModeConfirmed
        ? "OWNER_WEB_E2E_VALIDATED"
        : finalStatus === "completed"
          ? "OWNER_WEB_E2E_PARTIAL_AUTH_UNCONFIRMED"
          : "OWNER_WEB_E2E_FAILED",
  };

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const prePath = join(ARTIFACT_DIR, `worker-auth-owner-e2e-pre-${ts}.json`);
  const soakPath = join(ARTIFACT_DIR, `worker-auth-soak-baseline-${ts}.json`);
  const latestBaseline = join(ARTIFACT_DIR, "worker-auth-soak-baseline-latest.json");

  writeFileSync(
    prePath,
    `${JSON.stringify({ ...report, artifactType: "pre" }, null, 2)}\n`
  );

  const soakBaseline = {
    startedAt: new Date(startedAt).toISOString(),
    deployedCommit: "bc4e03b",
    e2eVerdict: report.verdict,
    authModeConfirmed,
    metrics: metricsAfter.metrics,
    metricsAtE2eStart: metricsBefore.metrics,
    metricsDeltaFromE2e: delta,
    checkpoints: {
      Tplus1h: null,
      Tplus6h: null,
      Tplus24h: null,
      Tplus48h: null,
      Tplus72h: null,
    },
    rollbackReadiness: {
      legacyFallbackEnabled: metricsAfter.legacyFallbackEnabled,
      cronSecretRetained: true,
      webDeploymentId: "6f6986f7-0dda-4bd3-91ba-3296a675e9ec",
      aiWorkerDeploymentId: "c7a3ef68-0fda-4bbe-9655-b6c4b7e8b96a",
    },
  };

  writeFileSync(soakPath, `${JSON.stringify(soakBaseline, null, 2)}\n`);
  writeFileSync(latestBaseline, `${JSON.stringify(soakBaseline, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        verdict: report.verdict,
        authModeConfirmed,
        finalStatus,
        completionMs,
        metricsDelta: delta,
        preArtifact: prePath,
        soakBaseline: soakPath,
      },
      null,
      2
    )
  );

  process.exit(report.verdict === "OWNER_WEB_E2E_VALIDATED" ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
