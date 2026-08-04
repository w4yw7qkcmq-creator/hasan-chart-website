#!/usr/bin/env node
/**
 * Staging IAM API enforcement + role isolation validation.
 * Staging-only. Never loads .env.local. Does not print secrets.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
  assertStagingSupabaseConfig,
} from "../../lib/staging-env-guard.js";
import { validateRouteMatrix } from "../../lib/iam/route-matrix-validator.js";
import { IAM_PERMISSIONS } from "../../lib/iam/constants.js";

const ROOT = process.cwd();
const DEV_PORT = 3012;
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const TEST_DOMAIN = "staging-hcw.test";
let testPassword = "";

function initTestPassword(staging, bootstrap) {
  testPassword =
    staging.STAGING_IAM_TEST_PASSWORD ||
    bootstrap.STAGING_IAM_TEST_PASSWORD ||
    crypto.randomBytes(24).toString("base64url");
}

async function resolveSuperAdminCookie(env) {
  if (env.IAM_OWNER_EMAIL && env.STAGING_OWNER_PASSWORD) {
    const owner = await loginDirect(env, env.IAM_OWNER_EMAIL, env.STAGING_OWNER_PASSWORD);
    if (owner.cookie) return { cookie: owner.cookie, source: "bootstrap_owner" };
  }
  const email = `iam-super-admin@${TEST_DOMAIN}`;
  const direct = await loginDirect(env, email, testPassword);
  if (direct.cookie) return { cookie: direct.cookie, source: "test_super_admin" };
  return { cookie: "", source: "none" };
}

const TEST_ACCOUNTS = [
  { key: "admin", role: "admin", local: "iam-test-admin" },
  { key: "support", role: "support", local: "iam-test-support" },
  { key: "accountant", role: "accountant", local: "iam-test-accountant" },
  { key: "analyst", role: "analyst", local: "iam-test-analyst" },
  { key: "news_editor", role: "news_editor", local: "iam-test-news-editor" },
  { key: "subscription_manager", role: "subscription_manager", local: "iam-test-subscription-manager" },
  { key: "normal", role: null, local: "iam-test-normal-user" },
];

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function loadIsolatedEnv(iamApi = true) {
  const staging = parseEnvFile(resolve(ROOT, ".env.staging.local"));
  const bootstrap = parseEnvFile(resolve(ROOT, ".env.staging.bootstrap.local"));
  const env = { ...process.env, NODE_ENV: "development" };
  Object.assign(env, staging, bootstrap);
  env.NEXT_PUBLIC_SUPABASE_URL = staging.STAGING_SUPABASE_URL;
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = staging.STAGING_SUPABASE_ANON_KEY;
  env.SUPABASE_SERVICE_ROLE_KEY = staging.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  env.IAM_DB = "true";
  env.IAM_API = iamApi ? "true" : "false";
  env.IAM_UI = "false";
  env.IAM_RLS = "false";
  return env;
}

function maskEmail(email = "") {
  const [l, d = ""] = String(email).split("@");
  return `${l.slice(0, 6)}***@${d}`;
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, { ...options, redirect: "manual" });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 120) };
  }
  return { status: res.status, body, headers: res.headers };
}

async function loginHttp(base, email, password) {
  const res = await httpJson(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { ...res, cookie: cookieFromLogin(res), success: res.body?.success === true };
}

function cookieFromLogin(res) {
  const cookies = res.headers.getSetCookie?.() || [];
  for (const c of cookies) {
    const m = c.match(/hc_access_token=([^;]+)/);
    if (m) return `hc_access_token=${m[1]}`;
  }
  return "";
}

async function loginDirect(env, email, password) {
  const anon = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    return { status: 401, success: false, cookie: "" };
  }
  return {
    status: 200,
    success: true,
    cookie: `hc_access_token=${data.session.access_token}`,
  };
}

async function waitForServer(port) {
  const start = Date.now();
  while (Date.now() - start < 120000) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (r.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("Server startup timeout");
}

async function ensureSubscriptionManagerRole(sb) {
  await sb.from("iam_roles").upsert({
    id: "subscription_manager",
    label: "Staging Subscription Manager",
    description: "Staging test role — subscriptions only",
    is_system: false,
    sort_order: 65,
  });
  const perms = [
    "dashboard.read",
    "subscriptions.read",
    "subscriptions.manage",
    "finance.proofs.read",
  ];
  for (const permission_id of perms) {
    await sb.from("iam_role_permissions").upsert(
      { role_id: "subscription_manager", permission_id, effect: "allow" },
      { onConflict: "role_id,permission_id" }
    );
  }
}

async function ensureTestUsers(sb, report) {
  report.cleanup = { users: [], assignments: [] };
  const meta = { e2e: true, iam_test: true, staging_only: true };

  for (const acc of TEST_ACCOUNTS) {
    const email = `${acc.local}@${TEST_DOMAIN}`;
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) {
      const created = await sb.auth.admin.createUser({
        email,
        password: testPassword,
        email_confirm: true,
        user_metadata: meta,
      });
      if (created.error) throw created.error;
      user = created.data.user;
    } else {
      await sb.auth.admin.updateUserById(user.id, { password: testPassword, email_confirm: true, user_metadata: meta });
    }
    await sb.from("profiles").upsert({
      id: user.id,
      email,
      username: acc.local,
      role: acc.role ? "user" : "user",
    });
    report.cleanup.users.push({
      key: acc.key,
      id: user.id,
      emailMasked: maskEmail(email),
      role: acc.role,
    });
    acc.userId = user.id;
    acc.email = email;
  }
}

const ROUTE_CHECKS = {
  dashboard: { method: "GET", path: "/api/admin/dashboard", perm: "dashboard.read" },
  finance: { method: "GET", path: "/api/admin/financial-center", perm: "finance.read" },
  finance_proof: { method: "GET", path: "/api/admin/financial-center/payment-proof/11111111-1111-4111-8111-111111111111", perm: "finance.proofs.read" },
  subscriptions_manage: { method: "POST", path: "/api/admin/subscription-requests/00000000-0000-0000-0000-000000000001/reject", perm: "subscriptions.manage", body: { reason: "staging-verify-only" } },
  partners: { method: "GET", path: "/api/admin/partners", perm: "partners.read" },
  partner_withdrawals: { method: "GET", path: "/api/admin/partner-withdrawals", perm: "partners.withdrawals.read" },
  account_keys: { method: "POST", path: "/api/admin/account-keys", perm: "accounts.secrets.manage", body: {} },
  iam_roles: { method: "GET", path: "/api/iam/roles", perm: "iam.read" },
  iam_audit: { method: "GET", path: "/api/iam/audit", perm: "iam.audit.read" },
  news_publish_route: { method: "POST", path: "/api/send-news", perm: "news.publish", body: { title: "t", actual: "a", forecast: "f", previous: "p", analysis: "x" } },
  analysis_admin: { method: "GET", path: "/api/daily-analysis/admin-access", perm: "analysis.read" },
  email_analytics: { method: "GET", path: "/api/admin/email-analytics", perm: "email.analytics.read" },
  users_mgmt: { method: "GET", path: "/api/admin/user-management", perm: "users.read" },
};

const ROLE_EXPECTATIONS = {
  super_admin: {
    allow: Object.keys(ROUTE_CHECKS),
    deny: [],
  },
  admin: {
    allow: ["dashboard", "finance", "subscriptions_manage", "partners", "partner_withdrawals", "users_mgmt", "analysis_admin", "email_analytics", "iam_roles", "account_keys"],
    deny: ["iam_audit"],
  },
  support: {
    allow: ["dashboard", "users_mgmt"],
    deny: ["finance", "partner_withdrawals", "iam_roles", "account_keys", "news_publish_route"],
  },
  accountant: {
    allow: ["dashboard", "finance", "users_mgmt"],
    deny: ["iam_roles", "account_keys", "news_publish_route", "partner_withdrawals"],
  },
  analyst: {
    allow: ["dashboard", "analysis_admin", "users_mgmt"],
    deny: ["finance", "iam_roles", "subscriptions_manage", "partner_withdrawals", "account_keys"],
  },
  news_editor: {
    allow: ["dashboard", "news_publish_route"],
    deny: ["finance", "iam_roles", "users_mgmt", "partner_withdrawals", "account_keys"],
  },
  subscription_manager: {
    allow: ["dashboard", "subscriptions_manage", "finance_proof"],
    deny: ["finance", "iam_roles", "users_mgmt", "partner_withdrawals", "account_keys", "news_publish_route"],
  },
  normal: {
    allow: [],
    deny: Object.keys(ROUTE_CHECKS),
  },
};

async function probeRoute(base, cookie, check) {
  const opts = {
    method: check.method,
    headers: { Cookie: cookie, "Content-Type": "application/json" },
  };
  if (check.body) opts.body = JSON.stringify(check.body);
  const res = await httpJson(`${base}${check.path}`, opts);
  const denied = res.status === 403;
  const authBlocked = res.status === 401;
  const allowedField = check.path.includes("admin-access") ? res.body?.allowed === true : null;
  const ok =
    allowedField === null
      ? !denied && !authBlocked
      : allowedField === true;
  return { status: res.status, denied, authBlocked, allowed: allowedField, ok };
}

async function runRoleMatrix(base, sessions, report) {
  report.roleMatrix = {};
  for (const [roleKey, exp] of Object.entries(ROLE_EXPECTATIONS)) {
    const cookie = sessions[roleKey];
    const row = { allow: {}, deny: {}, pass: true };
    for (const k of exp.allow) {
      const r = await probeRoute(base, cookie, ROUTE_CHECKS[k]);
      row.allow[k] = { status: r.status, pass: r.ok || r.status === 404 || r.status === 400 };
      if (!row.allow[k].pass) row.pass = false;
    }
    for (const k of exp.deny) {
      const r = await probeRoute(base, cookie, ROUTE_CHECKS[k]);
      const pass =
        r.denied ||
        r.authBlocked ||
        (ROUTE_CHECKS[k].path.includes("admin-access") && r.allowed === false);
      row.deny[k] = { status: r.status, pass };
      if (!pass) row.pass = false;
    }
    report.roleMatrix[roleKey] = row;
  }
}

async function preActivationCheck(env, sb) {
  const linked = JSON.parse(readFileSync(join(ROOT, "supabase/.temp/linked-project.json"), "utf8"));
  const staging = assertStagingSupabaseConfig({
    projectRef: env.STAGING_SUPABASE_PROJECT_REF,
    url: env.STAGING_SUPABASE_URL,
  });
  const matrix = validateRouteMatrix();
  const { data: bootstrap } = await sb.from("iam_bootstrap_state").select("completed_at").eq("id", true).maybeSingle();
  const { count: superAdminCount } = await sb
    .from("iam_user_assignments")
    .select("id", { count: "exact", head: true })
    .eq("role_id", "super_admin")
    .is("revoked_at", null);
  let migrationVersions = [];
  try {
    const { data } = await sb
      .from("supabase_migrations.schema_migrations")
      .select("version")
      .like("version", "20260804%");
    migrationVersions = (data || []).map((m) => m.version);
  } catch {
    migrationVersions = ["applied_via_cli"];
  }

  return {
    linkedRefMasked: maskProjectRef(linked.ref),
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    different: linked.ref !== PRODUCTION_SUPABASE_PROJECT_REF,
    bootstrapCompleted: Boolean(bootstrap?.completed_at),
    superAdminCount: superAdminCount ?? 0,
    routeMatrixOk: matrix.ok,
    routeMatrixIssues: matrix.stats.issueCount,
    IAM_DB: env.IAM_DB === "true",
    IAM_API: env.IAM_API === "true",
    IAM_UI: env.IAM_UI === "false",
    IAM_RLS: env.IAM_RLS === "false",
    usedRefMasked: maskProjectRef(extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL)),
    migrationVersions,
    safeToEnableIamApi:
      linked.ref === staging.projectRef &&
      linked.ref !== PRODUCTION_SUPABASE_PROJECT_REF &&
      Boolean(bootstrap?.completed_at) &&
      (superAdminCount ?? 0) >= 1 &&
      matrix.ok &&
      env.IAM_DB === "true" &&
      env.IAM_UI === "false" &&
      env.IAM_RLS === "false",
  };
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const report = { verdict: "API ENFORCEMENT FAILED", ok: false, phases: {} };

  const envApi = loadIsolatedEnv(true);
  initTestPassword(
    parseEnvFile(resolve(ROOT, ".env.staging.local")),
    parseEnvFile(resolve(ROOT, ".env.staging.bootstrap.local"))
  );
  const sb = createClient(envApi.STAGING_SUPABASE_URL, envApi.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  report.phases.preActivation = await preActivationCheck(envApi, sb);
  if (!report.phases.preActivation.safeToEnableIamApi) {
    report.error = "safeToEnableIamApi=false";
    return finish(report);
  }

  await ensureSubscriptionManagerRole(sb);
  await ensureTestUsers(sb, report);

  const dev = spawn("npm", ["run", "dev", "--", "-p", String(DEV_PORT)], {
    cwd: ROOT,
    env: envApi,
    stdio: ["ignore", "pipe", "pipe"],
  });
  dev.stdout?.on("data", () => {});
  dev.stderr?.on("data", () => {});

  try {
    await waitForServer(DEV_PORT);
    const base = `http://127.0.0.1:${DEV_PORT}`;

    const superAdmin = await resolveSuperAdminCookie(envApi);
    report.phases.ownerLogin = { success: Boolean(superAdmin.cookie), source: superAdmin.source };
    if (!superAdmin.cookie) throw new Error("Owner login failed");
    const ownerLogin = { cookie: superAdmin.cookie };

    const ownerMe = await httpJson(`${base}/api/iam/me`, { headers: { Cookie: ownerLogin.cookie } });
    report.phases.superAdminBaseline = {
      isAdmin: ownerMe.body?.isAdmin,
      roles: ownerMe.body?.roles,
      hasIamManage: (ownerMe.body?.permissions || []).includes("iam.manage"),
      hasSecrets: JSON.stringify(ownerMe.body || {}).match(/password|Bearer|secret_hash/i) !== null,
    };

    const grants = [];
    for (const acc of TEST_ACCOUNTS) {
      if (!acc.role) continue;
      const g = await httpJson(`${base}/api/iam/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: ownerLogin.cookie },
        body: JSON.stringify({
          userId: acc.userId,
          roleId: acc.role,
          reason: "staging role isolation validation",
        }),
      });
      grants.push({ key: acc.key, role: acc.role, status: g.status, success: g.body?.success || g.status === 409, assignmentId: g.body?.assignment?.id });
      if (g.body?.assignment?.id) {
        report.cleanup.assignments.push({ id: g.body.assignment.id, userKey: acc.key, role: acc.role });
      }
    }
    report.phases.grants = grants;

    const sessions = { super_admin: ownerLogin.cookie };
    for (const acc of TEST_ACCOUNTS) {
      const lg = await loginDirect(envApi, acc.email, testPassword);
      sessions[acc.key] = lg.cookie;
      if (!lg.cookie) {
        report.loginFailures = report.loginFailures || [];
        report.loginFailures.push({ key: acc.key, status: lg.status });
      }
    }

    await runRoleMatrix(base, sessions, report);

    const normalMe = await httpJson(`${base}/api/iam/me`, { headers: { Cookie: sessions.normal || "" } });
    report.phases.meNormal = {
      status: normalMe.status,
      isAdmin: normalMe.body?.isAdmin,
      roles: normalMe.body?.roles,
      permissions: normalMe.body?.permissions,
    };

    report.phases.actionLevel = {};
    const grantDenied = await httpJson(`${base}/api/iam/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessions.support },
      body: JSON.stringify({ action: "grant", userId: TEST_ACCOUNTS[0].userId, roleId: "admin", reason: "x" }),
    });
    report.phases.actionLevel.supportGrantDenied = grantDenied.status === 403;

    const adminGrantSuper = await httpJson(`${base}/api/iam/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessions.admin },
      body: JSON.stringify({
        userId: TEST_ACCOUNTS.find((a) => a.key === "normal").userId,
        roleId: "super_admin",
        reason: "escalation test",
      }),
    });
    report.phases.actionLevel.adminGrantSuperDenied = adminGrantSuper.status === 403;

    const healthDry = await httpJson(`${base}/api/iam/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerLogin.cookie },
      body: JSON.stringify({ action: "dry_run_backfill", confirm: "DRY_RUN_BACKFILL" }),
    });
    report.phases.actionLevel.healthDryRun = { status: healthDry.status, dryRun: healthDry.body?.dryRun };

    const healthExec = await httpJson(`${base}/api/iam/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerLogin.cookie },
      body: JSON.stringify({ action: "backfill_legacy", execute: true }),
    });
    report.phases.actionLevel.healthExecuteBlocked = healthExec.status === 403;

    report.phases.machineAuth = {};
    const cronSecret = envApi.CRON_SECRET || "";
    if (cronSecret) {
      const cronNews = await httpJson(`${base}/api/send-news`, {
        method: "POST",
        headers: { Authorization: `Bearer ${cronSecret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: "t", actual: "a", forecast: "f", previous: "p", analysis: "x" }),
      });
      report.phases.machineAuth.cronOnlyRejected = cronNews.status === 403;
    } else {
      report.phases.machineAuth.cronOnlyRejected = "skipped_no_cron_secret";
    }

    const newsAdmin = await httpJson(`${base}/api/send-news`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessions.news_editor },
      body: JSON.stringify({ title: "t", actual: "a", forecast: "f", previous: "p", analysis: "x" }),
    });
    report.phases.machineAuth.newsEditorAllowed = newsAdmin.status !== 403;

    const newsSupport = await httpJson(`${base}/api/send-news`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: sessions.support },
      body: JSON.stringify({ title: "t", actual: "a", forecast: "f", previous: "p", analysis: "x" }),
    });
    report.phases.machineAuth.supportNewsDenied = newsSupport.status === 403;

    report.phases.failClosed = {};
    const revokeRes = await httpJson(`${base}/api/iam/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerLogin.cookie },
      body: JSON.stringify({
        action: "revoke",
        userId: TEST_ACCOUNTS.find((a) => a.key === "analyst").userId,
        roleId: "analyst",
        reason: "staging fail-closed cache test",
      }),
    });
    report.phases.failClosed.revokeOk = revokeRes.status === 200;
    const analystDenied = await probeRoute(base, sessions.analyst, ROUTE_CHECKS.analysis_admin);
    report.phases.failClosed.revokedAnalystDenied =
      analystDenied.denied || analystDenied.authBlocked || analystDenied.allowed === false;

    await httpJson(`${base}/api/iam/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: ownerLogin.cookie },
      body: JSON.stringify({
        userId: TEST_ACCOUNTS.find((a) => a.key === "analyst").userId,
        roleId: "analyst",
        reason: "re-grant after fail-closed test",
      }),
    });

    const health = await httpJson(`${base}/api/iam/health`, { headers: { Cookie: ownerLogin.cookie } });
    report.phases.health = {
      status: health.status,
      schemaConfigured: health.body?.health?.schemaConfigured,
      bootstrapCompleted: health.body?.health?.bootstrapCompleted,
      assignmentsCount: health.body?.health?.assignmentsCount,
      superAdminCount: health.body?.health?.superAdminCount,
      iamStatus: health.body?.health?.status,
      flags: health.body?.health?.flags,
      misconfigured: health.body?.health?.flagValidation?.misconfigured,
    };

    const { data: auditSample } = await sb
      .from("iam_audit_logs")
      .select("action, metadata")
      .order("created_at", { ascending: false })
      .limit(20);
    const auditStr = JSON.stringify(auditSample || []);
    report.phases.auditSecurity = {
      recentGrant: auditSample?.some((a) => a.action?.includes("grant")) ?? false,
      secretLeakage: /password|Bearer|secret_hash|hc_access/i.test(auditStr),
    };

    report.phases.rollback = { note: "assignments preserved — verified post-run via DB count" };
    const { count: assignmentCount } = await sb
      .from("iam_user_assignments")
      .select("id", { count: "exact", head: true })
      .is("revoked_at", null);
    report.phases.rollback.activeAssignmentsAfter = assignmentCount;

    const matrixPass = Object.values(report.roleMatrix || {}).every((r) => r.pass);
    report.ok =
      matrixPass &&
      report.phases.superAdminBaseline.hasIamManage &&
      report.phases.meNormal.isAdmin === false &&
      (report.phases.meNormal.roles || []).length === 0 &&
      report.phases.actionLevel.supportGrantDenied &&
      report.phases.actionLevel.adminGrantSuperDenied &&
      report.phases.machineAuth.supportNewsDenied === true &&
      report.phases.failClosed.revokedAnalystDenied === true &&
      !report.phases.auditSecurity.secretLeakage &&
      report.phases.health.flags?.IAM_API === true &&
      !(report.loginFailures || []).length;

    report.verdict = report.ok ? "API ENFORCEMENT VALIDATED" : "API ENFORCEMENT FAILED";
    return finish(report, dev);
  } catch (e) {
    report.error = e.message;
    return finish(report, dev);
  }
}

function finish(report, dev) {
  if (dev && !dev.killed) dev.kill("SIGTERM");
  const path = join(ARTIFACT_DIR, `staging-api-enforcement-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, ok: report.ok, artifact: path }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main();
