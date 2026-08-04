#!/usr/bin/env node
/**
 * Production IAM_RLS canary — runtime-effective flag + DB readiness + behavioral matrix.
 * Requires Production DB migrations applied (enforcePoliciesPresent=true) before enable.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  extractRuntimeFlags,
  isHealthReady,
  commitMatches,
  detectMixedGenerations,
  sanitizeArtifact,
  POLL_STATES,
  legacyBearerExpectation,
  classifyLegacyBearerResult,
} from "./production-iam-api-canary.mjs";

const BASE = "https://www.hasanchartworld.com";
const ROOT = process.cwd();
const POLL_INTERVAL_MS = 7000;
const POLL_TIMEOUT_MS = 600000;
const STABILITY_REQUIRED = 3;
const ARTIFACT_DIR = join(ROOT, "artifacts", "iam-rls-canary");

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseBoolDesired(value) {
  return value === true || value === "true";
}

function loadEnv() {
  const local = parseEnvFile(resolve(ROOT, ".env.local"));
  const bootstrap = parseEnvFile(resolve(ROOT, ".env.production.bootstrap.local"));
  return {
    ...process.env,
    ...local,
    ...bootstrap,
    SUPABASE_SERVICE_ROLE_KEY: local.SUPABASE_SERVICE_ROLE_KEY || bootstrap.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_SUPABASE_URL: local.NEXT_PUBLIC_SUPABASE_URL || bootstrap.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: local.NEXT_PUBLIC_SUPABASE_ANON_KEY || bootstrap.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };
}

function loadRailwayVars() {
  const raw = execSync("npx @railway/cli variables --json -s hasan-chart-website", {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(raw);
}

function resolveExpectedCommit() {
  const arg = process.argv.find((a) => a.startsWith("--commit="));
  if (arg) return arg.split("=")[1];
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "a2f98c4";
  }
}

async function httpJson(url, opts = {}) {
  const res = await fetch(url, { ...opts, redirect: "manual" });
  const body = await res.text();
  let json = {};
  try {
    json = JSON.parse(body);
  } catch {
    /* text */
  }
  return { status: res.status, json, headers: res.headers };
}

async function fetchPublicHealth() {
  const res = await httpJson(`${BASE}/api/health`);
  const json = res.json || {};
  const flags = extractRuntimeFlags(json);
  return {
    httpStatus: res.status,
    healthOk: isHealthReady(json),
    healthReady: json.readiness === "ready",
    runtimeFlags: flags,
    rlsMode: json.iam?.rlsMode ?? json.checks?.iam?.rlsMode ?? null,
    uptimeSeconds: json.checks?.app?.uptimeSeconds ?? null,
    buildCommit: json.build?.commit ? String(json.build.commit).slice(0, 12) : null,
    commitOk: commitMatches(json, resolveExpectedCommit()),
    raw: json,
  };
}

export function evaluateRlsStability(probes, desiredIamRls) {
  if (probes.length < STABILITY_REQUIRED) return { stable: false };
  const tail = probes.slice(-STABILITY_REQUIRED);
  const stable = tail.every(
    (p) =>
      p.runtimeFlags.IAM_RLS === desiredIamRls &&
      p.runtimeFlags.IAM_DB === true &&
      p.runtimeFlags.IAM_API === true &&
      p.runtimeFlags.IAM_UI === true &&
      p.healthOk &&
      p.healthReady &&
      p.commitOk !== false
  );
  return { stable, tail };
}

export function classifyRlsPollingState({ probes, desiredIamRls, timedOut }) {
  if (timedOut) return POLL_STATES.TIMEOUT;
  const mixed = detectMixedGenerations(
    probes.map((p) => ({ runtimeIamApi: p.runtimeFlags.IAM_RLS, uptimeSeconds: p.uptimeSeconds }))
  );
  if (mixed) return POLL_STATES.MIXED_GENERATIONS;
  const { stable } = evaluateRlsStability(probes, desiredIamRls);
  if (stable) return POLL_STATES.CONVERGED;
  return POLL_STATES.WAITING;
}

async function pollRuntimeRls(desiredIamRls, expectedCommit) {
  const started = Date.now();
  const probes = [];
  const log = [];

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const probe = await fetchPublicHealth();
    probe.desiredIamRls = desiredIamRls;
    probe.elapsedMs = Date.now() - started;
    probes.push(probe);

    const state = classifyRlsPollingState({ probes, desiredIamRls, timedOut: false });
    log.push({
      attempt: probes.length,
      state,
      desiredIamRls,
      runtimeIamRls: probe.runtimeFlags.IAM_RLS,
      runtimeIamDb: probe.runtimeFlags.IAM_DB,
      runtimeIamApi: probe.runtimeFlags.IAM_API,
      runtimeIamUi: probe.runtimeFlags.IAM_UI,
      rlsMode: probe.rlsMode,
      uptimeSeconds: probe.uptimeSeconds,
      buildCommit: probe.buildCommit,
      healthOk: probe.healthOk,
      elapsedMs: probe.elapsedMs,
    });

    const { stable } = evaluateRlsStability(probes, desiredIamRls);
    if (stable) return { ok: true, state: POLL_STATES.CONVERGED, probes, log };
    await sleep(POLL_INTERVAL_MS);
  }

  return {
    ok: false,
    state: classifyRlsPollingState({ probes, desiredIamRls, timedOut: true }),
    probes,
    log,
  };
}

async function loginSession(email, password, env) {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    return { ok: false, status: error?.status || 401 };
  }
  const cookie = `hc_access_token=${data.session.access_token}; hc_refresh_token=${data.session.refresh_token}`;
  return {
    ok: true,
    cookie,
    userId: data.user?.id,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
  };
}

async function probeDbRlsHealth(env) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.rpc("iam_rls_health_probe");
  return { ok: !error && Boolean(data), data: data || null, error: error?.message || null };
}

async function runBrowserRlsMatrix(env, superAdminUserId) {
  const cases = [];
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });

  const anonProfiles = await anon.from("profiles").select("id").limit(5);
  cases.push({
    case: "anon_profiles_select",
    pass: Boolean(anonProfiles.error) || (anonProfiles.data || []).length === 0,
    error: anonProfiles.error?.code || null,
    count: (anonProfiles.data || []).length,
  });

  const login = await loginSession(env.IAM_OWNER_EMAIL, env.PRODUCTION_OWNER_PASSWORD, env);
  if (!login.ok) {
    cases.push({ case: "super_admin_browser_login", pass: false });
    return cases;
  }

  const authed = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  await authed.auth.setSession({
    access_token: login.accessToken,
    refresh_token: login.refreshToken,
  });

  const ownProfiles = await authed.from("profiles").select("id").limit(10);
  const ownIds = (ownProfiles.data || []).map((r) => r.id);
  cases.push({
    case: "super_admin_profiles_select",
    pass: !ownProfiles.error && ownProfiles.data !== null,
    count: ownIds.length,
    includesSelf: superAdminUserId ? ownIds.includes(superAdminUserId) : null,
  });

  const news = await authed.from("news_posts").select("id").limit(1);
  cases.push({
    case: "authenticated_news_posts_select",
    pass: !news.error,
    status: news.error?.code || "ok",
  });

  return cases;
}

async function runSuperAdminIamHealth(env) {
  const login = await loginSession(env.IAM_OWNER_EMAIL, env.PRODUCTION_OWNER_PASSWORD, env);
  if (!login.ok) return { pass: false, cases: [{ case: "login", pass: false }] };

  const res = await httpJson(`${BASE}/api/iam/health`, {
    headers: { Cookie: login.cookie, Accept: "application/json" },
  });
  const report = res.json?.health || res.json?.report || res.json;
  const rlsMode = report?.rlsMode;
  const readinessStatus = report?.status;
  const requireEnforcing = Boolean(process.env.IAM_RLS_CANARY_REQUIRE_ENFORCING);

  const passEnforcing = requireEnforcing
    ? rlsMode === "enforcing" || readinessStatus === "enforcing"
    : rlsMode === "enforcing" ||
      rlsMode === "enforce_ready" ||
      readinessStatus === "ready_for_staging_rls" ||
      readinessStatus === "enforcing";

  return {
    pass: res.status === 200 && passEnforcing,
    status: res.status,
    rlsMode,
    readinessStatus,
    criticalCount: report?.rlsHealth?.criticalCount,
    enforceReady: rlsMode === "enforce_ready" || rlsMode === "enforcing",
  };
}

async function legacyBearerProbe(railway) {
  const cronLegacy = railway.CRON_SECRET;
  if (!cronLegacy) return { skipped: true, reason: "CRON_SECRET unavailable locally" };
  const res = await httpJson(`${BASE}/api/check-price-alerts`, {
    headers: { Authorization: `Bearer ${cronLegacy}`, Accept: "application/json" },
  });
  return { status: res.status };
}

async function runCronMachine(railway) {
  const cases = [];
  const cronSecret = railway.IAM_CRON_SERVICE_SECRET;
  const cronId = railway.IAM_CRON_SERVICE_ACCOUNT_ID || "cron";

  if (cronSecret) {
    const ok = await httpJson(`${BASE}/api/check-price-alerts`, {
      headers: {
        "x-service-account-id": cronId,
        "x-service-account-secret": cronSecret,
        Accept: "application/json",
      },
    });
    cases.push({
      case: "machine_cron_price_alerts",
      status: ok.status,
      pass: ok.status === 410,
    });

    const bad = await httpJson(`${BASE}/api/check-price-alerts`, {
      headers: {
        "x-service-account-id": cronId,
        "x-service-account-secret": "wrong-secret-value",
        Accept: "application/json",
      },
    });
    cases.push({
      case: "machine_wrong_secret",
      status: bad.status,
      pass: bad.status === 401 || bad.status === 403,
    });
  }

  const missing = await httpJson(`${BASE}/api/check-price-alerts`, {
    headers: { Accept: "application/json" },
  });
  cases.push({
    case: "machine_missing_headers",
    status: missing.status,
    pass: missing.status === 401 || missing.status === 403,
  });

  const legacy = await legacyBearerProbe(railway);
  if (!legacy.skipped) {
    const verdict = classifyLegacyBearerResult({
      runtimeIamApi: true,
      stable: true,
      statusCode: legacy.status,
    });
    cases.push({
      case: "legacy_cron_bearer_only",
      status: legacy.status,
      expected: verdict.expected,
      pass: verdict.pass,
    });
  }

  return cases;
}

function railwaySetIamRls(value) {
  execSync(`npx @railway/cli variable set IAM_RLS=${value} -s hasan-chart-website`, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function runPreFlagDbValidation(env) {
  const db = await probeDbRlsHealth(env);
  const health = await fetchPublicHealth();
  const browser = await runBrowserRlsMatrix(env);
  const iamHealth = await runSuperAdminIamHealth(env);

  const ok =
    db.ok &&
    db.data?.enforcePoliciesPresent === true &&
    (db.data?.missingOwnPolicy || []).length === 0 &&
    health.runtimeFlags.IAM_RLS === false &&
    health.healthOk &&
    browser.every((c) => c.pass !== false) &&
    iamHealth.pass;

  return { ok, db, browser, iamHealth, health: health.runtimeFlags };
}

async function runCanary(env, expectedCommit) {
  const report = {
    phase: "canary",
    timestamp: new Date().toISOString(),
    expectedCommit,
    timeline: [],
  };

  report.preFlag = await runPreFlagDbValidation(env);
  report.timeline.push({ step: "pre_flag_db_validation", ok: report.preFlag.ok });
  if (!report.preFlag.ok) {
    report.verdict = "STOPPED — PRE-FLAG DB VALIDATION FAILED";
    report.ok = false;
    return report;
  }

  const baseline = await pollRuntimeRls(false, expectedCommit);
  report.baselinePoll = { ok: baseline.ok, state: baseline.state };
  if (!baseline.ok) {
    report.verdict = "STOPPED — BASELINE RUNTIME UNSTABLE";
    report.ok = false;
    return report;
  }

  railwaySetIamRls("true");
  report.timeline.push({ step: "railway_set_iam_rls_true", at: new Date().toISOString() });

  const converge = await pollRuntimeRls(true, expectedCommit);
  report.convergence = { state: converge.state, ok: converge.ok, log: converge.log };
  if (!converge.ok) {
    railwaySetIamRls("false");
    report.rollback = { reason: "runtime_non_convergence", poll: await pollRuntimeRls(false, expectedCommit) };
    report.verdict = "STOPPED — RUNTIME DID NOT CONVERGE";
    report.ok = false;
    return report;
  }

  const db = await probeDbRlsHealth(env);
  const iamHealth = await runSuperAdminIamHealth(env);
  process.env.IAM_RLS_CANARY_REQUIRE_ENFORCING = "1";
  const iamHealthEnforcing = await runSuperAdminIamHealth(env);
  delete process.env.IAM_RLS_CANARY_REQUIRE_ENFORCING;
  const browser = await runBrowserRlsMatrix(env);
  const railway = loadRailwayVars();
  const machine = await runCronMachine(railway);
  const publicHealth = await fetchPublicHealth();

  report.postEnable = {
    db,
    iamHealth,
    iamHealthEnforcing,
    browser,
    machine,
    publicHealth: publicHealth.runtimeFlags,
    rlsMode: publicHealth.rlsMode,
  };

  const legacy = await legacyBearerProbe(railway);
  const legacyVerdict =
    legacy.skipped
      ? { pass: true, skipped: true }
      : classifyLegacyBearerResult({
          runtimeIamApi: true,
          stable: true,
          statusCode: legacy.status,
        });

  const fail =
    !db.ok ||
    db.data?.enforcePoliciesPresent !== true ||
    (db.data?.missingOwnPolicy || []).length > 0 ||
    !iamHealth.pass ||
    !iamHealthEnforcing.pass ||
    browser.some((c) => c.pass === false) ||
    machine.some((c) => c.pass === false) ||
    !publicHealth.runtimeFlags.IAM_RLS ||
    legacyVerdict.pass === false;

  if (fail) {
    railwaySetIamRls("false");
    report.rollback = { reason: "behavioral_matrix_failure", poll: await pollRuntimeRls(false, expectedCommit) };
    report.verdict = "ROLLED BACK TO IAM_RLS=false — behavioral failure";
    report.ok = false;
    return report;
  }

  report.verdict = "ENTERPRISE IAM FULLY ENABLED ON PRODUCTION";
  report.ok = true;
  return report;
}

function writeArtifact(report) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const path = join(ARTIFACT_DIR, `rls-canary-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(sanitizeArtifact(report), null, 2));
  return path;
}

async function main() {
  const phase = process.argv[2] || "preflight";
  const env = loadEnv();
  const expectedCommit = resolveExpectedCommit();

  let report;
  if (phase === "preflight") {
    report = { phase: "preflight", ...(await runPreFlagDbValidation(env)) };
    report.ok = report.ok;
  } else if (phase === "canary") {
    report = await runCanary(env, expectedCommit);
  } else if (phase === "probe") {
    const health = await fetchPublicHealth();
    const railway = loadRailwayVars();
    report = {
      phase: "probe",
      ok: health.healthOk,
      desiredIamRls: parseBoolDesired(railway.IAM_RLS),
      ...health,
    };
  } else {
    console.error(JSON.stringify({ error: `unknown phase: ${phase}` }));
    process.exit(1);
  }

  report.artifactPath = writeArtifact(report);
  console.log(JSON.stringify(sanitizeArtifact(report), null, 2));
  process.exit(report.ok ? 0 : 1);
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((e) => {
    console.error(JSON.stringify({ error: e.message }));
    process.exit(1);
  });
}
