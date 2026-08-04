#!/usr/bin/env node
/**
 * Production IAM_API canary — runtime-effective flags, status codes only.
 *
 * Phases:
 *   probe     — runtime + railway desired state snapshot
 *   baseline  — pre-enable validation (runtime IAM_API=false stable)
 *   retry     — full runtime-aware canary (baseline → enable → poll → matrix)
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const BASE = "https://www.hasanchartworld.com";
const ROOT = process.cwd();
const POLL_INTERVAL_MS = 7000;
const POLL_TIMEOUT_MS = 600000;
const STABILITY_REQUIRED = 3;
const ARTIFACT_DIR = join(ROOT, "artifacts", "iam-canary");

export const POLL_STATES = {
  CONVERGED: "CONVERGED",
  WAITING: "WAITING",
  MIXED_GENERATIONS: "RUNTIME GENERATIONS MIXED — WAITING",
  TIMEOUT: "TIMEOUT",
};

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
  return `${local.slice(0, 3)}***@${domain}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseBoolDesired(value) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return false;
}

export function extractRuntimeIamApi(healthJson) {
  return Boolean(healthJson?.iam?.effective?.IAM_API);
}

export function extractRuntimeFlags(healthJson) {
  const eff = healthJson?.iam?.effective || {};
  return {
    IAM_DB: Boolean(eff.IAM_DB),
    IAM_API: Boolean(eff.IAM_API),
    IAM_UI: Boolean(eff.IAM_UI),
    IAM_RLS: Boolean(eff.IAM_RLS),
    validationOk: Boolean(healthJson?.iam?.validation?.ok),
  };
}

export function isHealthReady(healthJson) {
  return healthJson?.status === "ok" && healthJson?.readiness === "ready";
}

export function commitMatches(healthJson, expectedCommit) {
  if (!expectedCommit) return true;
  const commit = String(healthJson?.build?.commit || "");
  return commit.startsWith(String(expectedCommit).slice(0, 7));
}

export function detectMixedGenerations(probes) {
  if (probes.length < 2) return false;
  const apiValues = new Set(probes.map((p) => Boolean(p.runtimeIamApi)));
  if (apiValues.size > 1) return true;
  const uptimes = probes.map((p) => p.uptimeSeconds).filter((u) => typeof u === "number");
  if (uptimes.length >= 2) {
    const min = Math.min(...uptimes);
    const max = Math.max(...uptimes);
    if (max - min > 120) return true;
  }
  return false;
}

export function evaluateStability(probes, desiredIamApi) {
  if (probes.length < STABILITY_REQUIRED) {
    return { stable: false, reason: "insufficient_probes" };
  }
  const tail = probes.slice(-STABILITY_REQUIRED);
  const allMatch = tail.every(
    (p) =>
      p.runtimeIamApi === desiredIamApi &&
      p.healthOk &&
      p.healthReady &&
      p.commitOk !== false
  );
  return { stable: allMatch, tail };
}

export function classifyPollingState({ probes, desiredIamApi, timedOut }) {
  if (timedOut) return POLL_STATES.TIMEOUT;
  const mixed = detectMixedGenerations(probes);
  const { stable } = evaluateStability(probes, desiredIamApi);
  if (stable) return POLL_STATES.CONVERGED;
  if (mixed) return POLL_STATES.MIXED_GENERATIONS;
  return POLL_STATES.WAITING;
}

export function shouldStartBehavioralMatrix({ runtimeIamApi, desiredIamApi, stable }) {
  return stable && runtimeIamApi === desiredIamApi && desiredIamApi === true;
}

export function legacyBearerExpectation(runtimeIamApi) {
  return runtimeIamApi ? 403 : 410;
}

export function classifyLegacyBearerResult({ runtimeIamApi, stable, statusCode }) {
  const expected = legacyBearerExpectation(runtimeIamApi);
  if (!stable && runtimeIamApi !== true) {
    return { pass: null, wait: true, expected, statusCode };
  }
  if (runtimeIamApi && stable && statusCode === 410) {
    return { pass: false, p1: true, expected: 403, statusCode };
  }
  return { pass: statusCode === expected, expected, statusCode };
}

export function sanitizeArtifact(obj) {
  const forbidden = /secret|password|token|cookie|bearer|authorization|pepper|hash/i;
  const walk = (value, key = "") => {
    if (value == null) return value;
    if (typeof value === "string" && forbidden.test(key)) return "[redacted]";
    if (Array.isArray(value)) return value.map((v) => walk(v));
    if (typeof value === "object") {
      const out = {};
      for (const [k, v] of Object.entries(value)) {
        if (forbidden.test(k)) {
          out[k] = "[redacted]";
        } else {
          out[k] = walk(v, k);
        }
      }
      return out;
    }
    return value;
  };
  return walk(obj);
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
  return {
    httpStatus: res.status,
    healthOk: json.status === "ok",
    healthReady: json.readiness === "ready",
    runtimeIamApi: extractRuntimeIamApi(json),
    runtimeFlags: extractRuntimeFlags(json),
    uptimeSeconds: json.checks?.app?.uptimeSeconds ?? null,
    buildCommit: json.build?.commit ? String(json.build.commit).slice(0, 12) : null,
    probeTimestamp: json.iam?.probeTimestamp || json.timestamp || null,
    raw: json,
  };
}

async function loginSession(email, password, env) {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    return { ok: false, status: error?.status || 401, error: error?.message || "login_failed" };
  }
  const cookie = `hc_access_token=${data.session.access_token}; hc_refresh_token=${data.session.refresh_token}`;
  return { ok: true, cookie, userId: data.user?.id };
}

async function fetchMe(cookie) {
  return httpJson(`${BASE}/api/iam/me`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });
}

async function fetchRoute(cookie, path) {
  return httpJson(`${BASE}${path}`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });
}

async function fetchIamHealth(cookie) {
  return httpJson(`${BASE}/api/iam/health`, {
    headers: { Cookie: cookie, Accept: "application/json" },
  });
}

function loadRailwayVars() {
  const raw = execSync("npx @railway/cli variables --json -s hasan-chart-website", {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(raw);
}

function railwayDesiredIamApi(railway) {
  return parseBoolDesired(railway.IAM_API);
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

function resolveExpectedCommit() {
  const arg = process.argv.find((a) => a.startsWith("--commit="));
  if (arg) return arg.split("=")[1];
  try {
    return execSync("git rev-parse --short HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

async function pollRuntimeUntilStable(desiredIamApi, expectedCommit, log = []) {
  const started = Date.now();
  const probes = [];

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const probe = await fetchPublicHealth();
    probe.desiredIamApi = desiredIamApi;
    probe.commitOk = commitMatches(probe.raw, expectedCommit);
    probe.elapsedMs = Date.now() - started;
    probes.push(probe);

    const state = classifyPollingState({ probes, desiredIamApi, timedOut: false });
    log.push({
      attempt: probes.length,
      state,
      desiredIamApi,
      runtimeIamApi: probe.runtimeIamApi,
      uptimeSeconds: probe.uptimeSeconds,
      buildCommit: probe.buildCommit,
      healthOk: probe.healthOk,
      healthReady: probe.healthReady,
      commitOk: probe.commitOk,
      elapsedMs: probe.elapsedMs,
    });

    const { stable } = evaluateStability(probes, desiredIamApi);
    if (stable && probe.healthOk && probe.healthReady) {
      return { ok: true, state: POLL_STATES.CONVERGED, probes, log };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  const state = classifyPollingState({ probes, desiredIamApi, timedOut: true });
  return { ok: false, state, probes, log };
}

async function legacyBearerProbe() {
  const railway = loadRailwayVars();
  const cronLegacy = railway.CRON_SECRET;
  if (!cronLegacy) return { skipped: true, reason: "CRON_SECRET unavailable locally" };
  const res = await httpJson(`${BASE}/api/check-price-alerts`, {
    headers: { Authorization: `Bearer ${cronLegacy}`, Accept: "application/json" },
  });
  return { status: res.status };
}

async function runMachineTests(railway, runtimeIamApi, stable) {
  const cronId = railway.IAM_CRON_SERVICE_ACCOUNT_ID || "cron";
  const cronSecret = railway.IAM_CRON_SERVICE_SECRET;
  const cases = [];

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
  }

  if (cronSecret) {
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

  const legacy = await legacyBearerProbe();
  if (!legacy.skipped) {
    const verdict = classifyLegacyBearerResult({
      runtimeIamApi,
      stable,
      statusCode: legacy.status,
    });
    cases.push({
      case: "legacy_cron_bearer_only",
      status: legacy.status,
      expected: verdict.expected,
      pass: verdict.pass,
      wait: verdict.wait || false,
      p1: verdict.p1 || false,
    });
  }

  if (cronSecret) {
    const iamDeny = await httpJson(`${BASE}/api/iam/assignments`, {
      method: "POST",
      headers: {
        "x-service-account-id": cronId,
        "x-service-account-secret": cronSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "grant",
        userId: "00000000-0000-0000-0000-000000000001",
        roleId: "admin",
      }),
    });
    cases.push({
      case: "machine_iam_assignments_denied",
      status: iamDeny.status,
      pass: iamDeny.status === 401 || iamDeny.status === 403,
    });
  }

  return { cases };
}

async function runHumanTests(env) {
  const out = { cases: [] };
  const ownerEmail = env.IAM_OWNER_EMAIL;
  const ownerPassword = env.PRODUCTION_OWNER_PASSWORD;

  const login = await loginSession(ownerEmail, ownerPassword, env);
  out.cases.push({
    case: "super_admin_login",
    maskedEmail: maskEmail(ownerEmail),
    pass: login.ok,
    status: login.ok ? 200 : login.status,
  });

  if (login.ok) {
    const me = await fetchMe(login.cookie);
    const roles = me.json?.roles || me.json?.roleIds || [];
    out.cases.push({
      case: "super_admin_me",
      status: me.status,
      hasActiveAssignment: me.json?.hasActiveAssignment,
      roles,
      pass:
        me.status === 200 &&
        me.json?.hasActiveAssignment === true &&
        (roles.includes("super_admin") || me.json?.isSuperAdmin === true),
    });

    const dash = await fetchRoute(login.cookie, "/api/admin/dashboard");
    out.cases.push({
      case: "super_admin_dashboard",
      status: dash.status,
      pass: dash.status === 200,
    });

    const iamRoles = await fetchRoute(login.cookie, "/api/iam/roles");
    out.cases.push({
      case: "super_admin_iam_roles",
      status: iamRoles.status,
      pass: iamRoles.status === 200,
    });

    const iamHealth = await fetchIamHealth(login.cookie);
    out.cases.push({
      case: "iam_health_runtime_flags",
      status: iamHealth.status,
      runtimeIamApi: Boolean(iamHealth.json?.health?.flags?.IAM_API),
      pass: iamHealth.status === 200 && typeof iamHealth.json?.health?.flags?.IAM_API === "boolean",
    });
  }

  const unauth = await fetchMe("");
  out.cases.push({ case: "unauthenticated_me", status: unauth.status, pass: unauth.status === 401 });

  return out;
}

async function verifyCronDbState(env) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: cron } = await sb
    .from("iam_service_accounts")
    .select("id, enabled, secret_hash, revoked_at")
    .eq("id", "cron")
    .maybeSingle();
  const { data: perms } = await sb
    .from("iam_service_account_permissions")
    .select("permission_id")
    .eq("service_account_id", "cron");
  const { count: assignments } = await sb
    .from("iam_user_assignments")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null);

  return {
    cronEnabled: Boolean(cron?.enabled),
    cronSecretHashSet: Boolean(cron?.secret_hash),
    cronPermissions: (perms || []).map((p) => p.permission_id).sort(),
    activeAssignments: assignments,
  };
}

async function runBaseline(env, expectedCommit) {
  const railway = loadRailwayVars();
  const desired = railwayDesiredIamApi(railway);
  const poll = await pollRuntimeUntilStable(false, expectedCommit);
  const runtimeIamApi = poll.probes.at(-1)?.runtimeIamApi ?? false;
  const stable = poll.ok;

  const readiness = await legacyBearerProbe();
  const legacyVerdict = classifyLegacyBearerResult({
    runtimeIamApi,
    stable,
    statusCode: readiness.status,
  });

  const machine = await runMachineTests(railway, runtimeIamApi, stable);
  const human = await runHumanTests(env);
  const db = await verifyCronDbState(env);

  const ok =
    desired === false &&
    stable &&
    runtimeIamApi === false &&
    legacyVerdict.pass === true &&
    machine.cases.every((c) => c.pass !== false) &&
    human.cases.every((c) => c.pass !== false) &&
    db.cronEnabled &&
    db.cronSecretHashSet &&
    JSON.stringify(db.cronPermissions) === JSON.stringify(["system.cron.read"]);

  return {
    phase: "baseline",
    ok,
    desiredIamApi: desired,
    runtimeIamApi,
    stable,
    poll,
    legacyVerdict,
    machine,
    human,
    db,
  };
}

async function railwaySetIamApi(value) {
  execSync(`npx @railway/cli variable set IAM_API=${value} -s hasan-chart-website`, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function runRetry(env, expectedCommit) {
  const report = {
    phase: "retry",
    timestamp: new Date().toISOString(),
    expectedCommit,
    timeline: [],
  };

  report.baseline = await runBaseline(env, expectedCommit);
  report.timeline.push({ step: "baseline", ok: report.baseline.ok, at: new Date().toISOString() });
  if (!report.baseline.ok) {
    report.verdict = "STOPPED — BASELINE FAILED";
    return report;
  }

  await railwaySetIamApi("true");
  report.timeline.push({ step: "railway_set_iam_api_true", at: new Date().toISOString() });

  const converge = await pollRuntimeUntilStable(true, expectedCommit);
  report.convergence = converge;
  report.timeline.push({
    step: "poll_runtime_true",
    state: converge.state,
    ok: converge.ok,
    attempts: converge.probes.length,
    at: new Date().toISOString(),
  });

  if (!converge.ok) {
    await railwaySetIamApi("false");
    const rollbackPoll = await pollRuntimeUntilStable(false, expectedCommit);
    report.rollback = { poll: rollbackPoll };
    report.verdict = "STOPPED — RUNTIME DID NOT CONVERGE";
    return report;
  }

  const runtimeIamApi = true;
  const stable = true;

  const legacy = await legacyBearerProbe();
  const legacyVerdict = classifyLegacyBearerResult({
    runtimeIamApi,
    stable,
    statusCode: legacy.status,
  });
  report.legacyReadiness = legacyVerdict;

  if (legacyVerdict.p1) {
    await railwaySetIamApi("false");
    report.rollback = { reason: "legacy_bearer_410_with_runtime_true", poll: await pollRuntimeUntilStable(false, expectedCommit) };
    report.verdict = "ROLLED BACK TO IAM_API=false — legacy bearer 410 with runtime IAM_API=true";
    return report;
  }

  const railway = loadRailwayVars();
  report.machine = await runMachineTests(railway, runtimeIamApi, stable);
  report.human = await runHumanTests(env);

  const machineFail = report.machine.cases.some((c) => c.pass === false);
  const humanFail = report.human.cases.some((c) => c.pass === false);
  const legacyFail = legacyVerdict.pass === false;

  if (machineFail || humanFail || legacyFail) {
    await railwaySetIamApi("false");
    report.rollback = {
      reason: "behavioral_matrix_failure",
      poll: await pollRuntimeUntilStable(false, expectedCommit),
    };
    report.verdict = "ROLLED BACK TO IAM_API=false — behavioral matrix failure";
    return report;
  }

  report.verdict = "IAM_API ENABLED ON PRODUCTION — RUNTIME-AWARE CANARY PASS";
  return report;
}

function writeArtifact(report) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const path = join(ARTIFACT_DIR, `canary-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(sanitizeArtifact(report), null, 2));
  return path;
}

async function runProbe(expectedCommit) {
  const railway = loadRailwayVars();
  const health = await fetchPublicHealth();
  const desired = railwayDesiredIamApi(railway);
  return {
    phase: "probe",
    desiredIamApi: desired,
    runtimeIamApi: health.runtimeIamApi,
    runtimeFlags: health.runtimeFlags,
    uptimeSeconds: health.uptimeSeconds,
    buildCommit: health.buildCommit,
    expectedCommit,
    commitOk: commitMatches(health.raw, expectedCommit),
    healthOk: health.healthOk,
    healthReady: health.healthReady,
    httpStatus: health.httpStatus,
  };
}

async function main() {
  const phase = process.argv[2] || "probe";
  const env = loadEnv();
  const expectedCommit = resolveExpectedCommit();

  let report;
  if (phase === "probe") {
    report = await runProbe(expectedCommit);
    report.ok = report.healthOk && report.healthReady && report.httpStatus === 200;
  } else if (phase === "baseline") {
    report = await runBaseline(env, expectedCommit);
  } else if (phase === "retry") {
    report = await runRetry(env, expectedCommit);
    report.ok = report.verdict?.includes("CANARY PASS");
  } else {
    console.error(JSON.stringify({ error: `unknown phase: ${phase}` }));
    process.exit(1);
  }

  const artifactPath = writeArtifact(report);
  report.artifactPath = artifactPath;

  const summary = {
    phase: report.phase,
    verdict: report.verdict,
    ok: report.ok,
    desiredIamApi: report.desiredIamApi ?? report.baseline?.desiredIamApi,
    runtimeIamApi: report.runtimeIamApi ?? report.baseline?.runtimeIamApi,
    artifactPath,
  };

  console.log(JSON.stringify(sanitizeArtifact({ ...report, summary }), null, 2));
  process.exit(report.ok ? 0 : 1);
}

const isMain =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch((e) => {
    console.error(JSON.stringify({ error: e.message }));
    process.exit(1);
  });
}
