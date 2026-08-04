#!/usr/bin/env node
/**
 * Production IAM_UI canary — runtime-effective flags, API + page guard validation.
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
} from "./production-iam-api-canary.mjs";
import { ADMIN_PAGE_PERMISSIONS } from "../../lib/iam/page-permissions.js";
import { IAM_PERMISSIONS } from "../../lib/iam/constants.js";

const BASE = "https://www.hasanchartworld.com";
const ROOT = process.cwd();
const POLL_INTERVAL_MS = 7000;
const POLL_TIMEOUT_MS = 600000;
const STABILITY_REQUIRED = 3;
const ARTIFACT_DIR = join(ROOT, "artifacts", "iam-ui-canary");

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
  return { status: res.status, json, location: res.headers.get("location") || null };
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
    runtimeIamUi: flags.IAM_UI,
    runtimeIamApi: flags.IAM_API,
    runtimeIamRls: flags.IAM_RLS,
    uptimeSeconds: json.checks?.app?.uptimeSeconds ?? null,
    buildCommit: json.build?.commit ? String(json.build.commit).slice(0, 12) : null,
    commitOk: commitMatches(json, resolveExpectedCommit()),
  };
}

export function evaluateUiStability(probes, desiredIamUi) {
  if (probes.length < STABILITY_REQUIRED) return { stable: false };
  const tail = probes.slice(-STABILITY_REQUIRED);
  const stable = tail.every(
    (p) =>
      p.runtimeIamUi === desiredIamUi &&
      p.runtimeIamApi === true &&
      p.runtimeIamRls === false &&
      p.healthOk &&
      p.healthReady &&
      p.commitOk !== false
  );
  return { stable, tail };
}

export function classifyUiPollingState({ probes, desiredIamUi, timedOut }) {
  if (timedOut) return POLL_STATES.TIMEOUT;
  if (detectMixedGenerations(probes.map((p) => ({ runtimeIamApi: p.runtimeIamUi, uptimeSeconds: p.uptimeSeconds })))) {
    return POLL_STATES.MIXED_GENERATIONS;
  }
  const { stable } = evaluateUiStability(probes, desiredIamUi);
  if (stable) return POLL_STATES.CONVERGED;
  return POLL_STATES.WAITING;
}

async function pollRuntimeUi(desiredIamUi, expectedCommit) {
  const started = Date.now();
  const probes = [];
  const log = [];

  while (Date.now() - started < POLL_TIMEOUT_MS) {
    const probe = await fetchPublicHealth();
    probe.desiredIamUi = desiredIamUi;
    probe.elapsedMs = Date.now() - started;
    probes.push(probe);

    const state = classifyUiPollingState({ probes, desiredIamUi, timedOut: false });
    log.push({
      attempt: probes.length,
      state,
      desiredIamUi,
      runtimeIamUi: probe.runtimeIamUi,
      runtimeIamApi: probe.runtimeIamApi,
      runtimeIamRls: probe.runtimeIamRls,
      uptimeSeconds: probe.uptimeSeconds,
      buildCommit: probe.buildCommit,
      healthOk: probe.healthOk,
      healthReady: probe.healthReady,
      elapsedMs: probe.elapsedMs,
    });

    const { stable } = evaluateUiStability(probes, desiredIamUi);
    if (stable) return { ok: true, state: POLL_STATES.CONVERGED, probes, log };
    await sleep(POLL_INTERVAL_MS);
  }

  return {
    ok: false,
    state: classifyUiPollingState({ probes, desiredIamUi, timedOut: true }),
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
  return { ok: true, cookie };
}

async function runPublicSmoke() {
  const cases = [];
  for (const path of ["/", "/login"]) {
    const res = await httpJson(`${BASE}${path}`);
    cases.push({ case: `public${path}`, status: res.status, pass: res.status === 200 });
  }
  const admin = await httpJson(`${BASE}/admin`);
  cases.push({
    case: "unauth_admin",
    status: admin.status,
    pass: admin.status === 200 || admin.status === 307 || admin.status === 302,
  });
  const me = await httpJson(`${BASE}/api/iam/me`);
  cases.push({ case: "unauth_me", status: me.status, pass: me.status === 401 });
  return cases;
}

async function runSuperAdminApi(env) {
  const cases = [];
  const login = await loginSession(env.IAM_OWNER_EMAIL, env.PRODUCTION_OWNER_PASSWORD, env);
  cases.push({ case: "super_admin_login", pass: login.ok, status: login.ok ? 200 : login.status });

  if (!login.ok) return { cases, cookie: null };

  const headers = { Cookie: login.cookie, Accept: "application/json" };
  const me = await httpJson(`${BASE}/api/iam/me`, { headers });
  const roles = me.json?.roles || [];
  cases.push({
    case: "super_admin_me",
    status: me.status,
    featureFlags: me.json?.featureFlags,
    pass:
      me.status === 200 &&
      me.json?.hasActiveAssignment === true &&
      (roles.includes("super_admin") || me.json?.isSuperAdmin),
  });

  for (const path of ["/api/admin/dashboard", "/api/iam/roles", "/api/iam/health"]) {
    const res = await httpJson(`${BASE}${path}`, { headers });
    cases.push({ case: `super_admin_api${path}`, status: res.status, pass: res.status === 200 });
  }

  return { cases, cookie: login.cookie };
}

async function runPageGuardMatrix(cookie, iamUiEnabled) {
  const headers = { Cookie: cookie, Accept: "text/html,application/json" };
  const pages = Object.keys(ADMIN_PAGE_PERMISSIONS);
  const cases = [];

  for (const path of pages) {
    const res = await httpJson(`${BASE}${path}`, { headers });
    const pass =
      res.status === 200 ||
      (res.status >= 300 && res.status < 400 && /login|forbidden/.test(res.location || ""));
    cases.push({
      case: `page${path}`,
      status: res.status,
      location: res.location ? res.location.split("?")[0] : null,
      permission: ADMIN_PAGE_PERMISSIONS[path],
      pass: iamUiEnabled ? res.status === 200 : pass,
    });
  }

  return cases;
}

async function verifyCronDbState(env) {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: cron } = await sb
    .from("iam_service_accounts")
    .select("enabled, secret_hash")
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
  const { count: superCount } = await sb
    .from("iam_user_assignments")
    .select("id", { count: "exact", head: true })
    .eq("role_id", "super_admin")
    .is("revoked_at", null);

  return {
    cronEnabled: Boolean(cron?.enabled),
    cronSecretHashSet: Boolean(cron?.secret_hash),
    cronPermissions: (perms || []).map((p) => p.permission_id).sort(),
    activeAssignments: assignments,
    superAdminCount: superCount,
  };
}

function buildIamUiBehaviorMap() {
  return Object.entries(ADMIN_PAGE_PERMISSIONS).map(([path, permission]) => ({
    route: path,
    guard: "requireIamPageAccess / checkAdminPageAccess",
    behaviorIamUiFalse: "admin with assignment allowed; nav not permission-filtered",
    behaviorIamUiTrue: `page permission required: ${permission}`,
    requiredPermission: permission,
    dependsOnRls: false,
  }));
}

async function railwaySetIamUi(value) {
  execSync(`npx @railway/cli variable set IAM_UI=${value} -s hasan-chart-website`, {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function runBaseline(env, expectedCommit) {
  const railway = loadRailwayVars();
  const poll = await pollRuntimeUi(false, expectedCommit);
  const publicSmoke = await runPublicSmoke();
  const superAdmin = await runSuperAdminApi(env);
  const db = await verifyCronDbState(env);

  const runtime = poll.probes.at(-1)?.runtimeFlags || {};
  const ok =
    poll.ok &&
    !parseBoolDesired(railway.IAM_UI) &&
    runtime.IAM_API === true &&
    runtime.IAM_UI === false &&
    runtime.IAM_RLS === false &&
    publicSmoke.every((c) => c.pass) &&
    superAdmin.cases.every((c) => c.pass) &&
    db.cronEnabled &&
    db.cronSecretHashSet &&
    JSON.stringify(db.cronPermissions) === JSON.stringify(["system.cron.read"]) &&
    db.activeAssignments === 3 &&
    db.superAdminCount === 1;

  return {
    phase: "baseline",
    ok,
    poll,
    publicSmoke,
    superAdmin: superAdmin.cases,
    db,
    behaviorMap: buildIamUiBehaviorMap(),
  };
}

async function runCanary(env, expectedCommit) {
  const report = {
    phase: "canary",
    timestamp: new Date().toISOString(),
    expectedCommit,
    timeline: [],
    behaviorMap: buildIamUiBehaviorMap(),
  };

  report.baseline = await runBaseline(env, expectedCommit);
  report.timeline.push({ step: "baseline", ok: report.baseline.ok });
  if (!report.baseline.ok) {
    report.verdict = "STOPPED — BASELINE FAILED";
    report.ok = false;
    return report;
  }

  await railwaySetIamUi("true");
  report.timeline.push({ step: "railway_set_iam_ui_true", at: new Date().toISOString() });

  const converge = await pollRuntimeUi(true, expectedCommit);
  report.convergence = { state: converge.state, ok: converge.ok, log: converge.log };
  report.timeline.push({
    step: "poll_runtime_ui_true",
    ok: converge.ok,
    attempts: converge.probes.length,
    state: converge.state,
  });

  if (!converge.ok) {
    await railwaySetIamUi("false");
    report.rollback = { reason: "runtime_non_convergence", poll: await pollRuntimeUi(false, expectedCommit) };
    report.verdict = "STOPPED — RUNTIME DID NOT CONVERGE";
    report.ok = false;
    return report;
  }

  const superAdmin = await runSuperAdminApi(env);
  report.superAdminApi = superAdmin.cases;
  report.pageGuards = await runPageGuardMatrix(superAdmin.cookie, true);

  const meFlags = superAdmin.cases.find((c) => c.case === "super_admin_me")?.featureFlags || {};
  report.runtimeFlagsFromMe = {
    IAM_UI: Boolean(meFlags.IAM_UI),
    IAM_API: Boolean(meFlags.IAM_API),
    IAM_RLS: Boolean(meFlags.IAM_RLS),
  };

  const apiFail = superAdmin.cases.some((c) => c.pass === false);
  const pageFail = report.pageGuards.some((c) => c.pass === false);
  const flagsMismatch = !report.runtimeFlagsFromMe.IAM_UI || !report.runtimeFlagsFromMe.IAM_API;

  if (apiFail || pageFail || flagsMismatch) {
    await railwaySetIamUi("false");
    report.rollback = {
      reason: "super_admin_or_page_guard_failure",
      poll: await pollRuntimeUi(false, expectedCommit),
    };
    report.verdict = "ROLLED BACK TO IAM_UI=false — behavioral failure";
    report.ok = false;
    return report;
  }

  report.verdict = "IAM_UI ENABLED ON PRODUCTION — CANARY PASS";
  report.ok = true;
  return report;
}

function writeArtifact(report) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const path = join(ARTIFACT_DIR, `ui-canary-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(sanitizeArtifact(report), null, 2));
  return path;
}

async function main() {
  const phase = process.argv[2] || "baseline";
  const env = loadEnv();
  const expectedCommit = resolveExpectedCommit();

  let report;
  if (phase === "baseline") {
    report = await runBaseline(env, expectedCommit);
  } else if (phase === "canary") {
    report = await runCanary(env, expectedCommit);
  } else if (phase === "probe") {
    const health = await fetchPublicHealth();
    const railway = loadRailwayVars();
    report = {
      phase: "probe",
      ok: health.healthOk && health.healthReady,
      desiredIamUi: parseBoolDesired(railway.IAM_UI),
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
