#!/usr/bin/env node
/**
 * Staging live validation for IAM_API hardening branch.
 * Staging-only — never loads .env.local.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
  assertStagingSupabaseConfig,
} from "../../lib/staging-env-guard.js";
import { generateServiceSecret } from "../../lib/iam/service-accounts.js";
import { IAM_PERMISSIONS } from "../../lib/iam/constants.js";
import { clearPermissionCache } from "../../lib/iam/cache.js";

const ROOT = process.cwd();
const STAGING_ENV = resolve(ROOT, ".env.staging.local");
const BOOTSTRAP_ENV = resolve(ROOT, ".env.staging.bootstrap.local");
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const DEV_PORT = 3020;
const DEV_PORT_ROLLBACK = 3021;
const TEST_DOMAIN = "staging-hcw.test";
let testPassword = "";

function initTestPassword(stagingParsed) {
  const key = "STAGING_IAM_TEST_PASSWORD";
  if (stagingParsed[key]) {
    testPassword = stagingParsed[key];
    return;
  }
  testPassword = crypto.randomBytes(24).toString("base64url");
  appendFileSync(STAGING_ENV, `\n${key}=${testPassword}\n`);
  stagingParsed[key] = testPassword;
}

function assertEnvRefs(stagingParsed) {
  assertStagingSupabaseConfig({
    projectRef: stagingParsed.STAGING_SUPABASE_PROJECT_REF,
    url: stagingParsed.STAGING_SUPABASE_URL,
  });
  const urlRef = extractSupabaseProjectRef(stagingParsed.STAGING_SUPABASE_URL || "");
  if (urlRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("staging_url_points_to_production");
  }
  if (urlRef && urlRef !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error("staging_url_ref_mismatch");
  }
  const blob = JSON.stringify(stagingParsed);
  if (blob.includes(PRODUCTION_SUPABASE_PROJECT_REF)) {
    throw new Error("production_ref_in_staging_env");
  }
}

function maskArtifact(value) {
  if (value == null) return value;
  const text = String(value);
  if (text.includes("@")) {
    const [local, domain] = text.split("@");
    return `${local.slice(0, 6)}***@${domain}`;
  }
  return text.length > 12 ? `${text.slice(0, 4)}***` : "***";
}

const LEGACY_ACCOUNTS = [
  { key: "legacy_role_admin", local: "iam-legacy-role", profile: { role: "admin", admin_role: null } },
  { key: "legacy_admin_role", local: "iam-legacy-adminrole", profile: { role: "user", admin_role: "admin" } },
  { key: "legacy_fallback", local: "iam-legacy-fallback", profile: { role: "user", admin_role: null }, email: `admin@hasanchartworld.com.staging-hcw.test` },
  { key: "normal_user", local: "iam-normal-user", profile: { role: "user", admin_role: null } },
];

function ts() {
  return new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
}

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

function loadStagingEnv(flags = {}) {
  const staging = parseEnvFile(STAGING_ENV);
  const bootstrap = parseEnvFile(BOOTSTRAP_ENV);
  assertStagingSupabaseConfig({
    projectRef: staging.STAGING_SUPABASE_PROJECT_REF,
    url: staging.STAGING_SUPABASE_URL,
  });
  return {
    ...process.env,
    NODE_ENV: "development",
    ...staging,
    ...bootstrap,
    NEXT_PUBLIC_SUPABASE_URL: staging.STAGING_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: staging.STAGING_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: staging.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    IAM_DB: "true",
    IAM_API: flags.iamApi ?? "true",
    IAM_UI: flags.iamUi ?? "true",
    IAM_RLS: flags.iamRls ?? "true",
  };
}

function ensureStagingServiceSecrets() {
  const secretKeys = [
    "STAGING_IAM_CRON_SECRET",
    "STAGING_IAM_NEWS_WORKER_SECRET",
    "STAGING_IAM_PRICE_ALERT_WORKER_SECRET",
    "STAGING_IAM_INSTANT_ANALYSIS_WORKER_SECRET",
    "STAGING_IAM_TELEGRAM_BOT_SECRET",
  ];
  const env = parseEnvFile(STAGING_ENV);
  const generated = [];
  let append = "";
  for (const key of secretKeys) {
    if (!env[key]) {
      const val = generateServiceSecret();
      append += `\n${key}=${val}\n`;
      env[key] = val;
      generated.push(key);
    }
  }
  if (append) appendFileSync(STAGING_ENV, append);
  return { generated, env: { ...env } };
}

async function httpJson(url, options = {}) {
  const res = await fetch(url, { ...options, redirect: "manual" });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: res.status, body, headers: res.headers };
}

function cookieFromLogin(res) {
  for (const c of res.headers.getSetCookie?.() || []) {
    const m = String(c).match(/hc_access_token=([^;]+)/);
    if (m) return `hc_access_token=${m[1]}`;
  }
  return "";
}

async function login(base, email, password) {
  const res = await httpJson(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  return { status: res.status, ok: res.body?.success === true, cookie: cookieFromLogin(res) };
}

async function loginDirect(env, email, password) {
  const anon = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    return { status: 401, ok: false, cookie: "", error: error?.message || "no_session" };
  }
  return {
    status: 200,
    ok: true,
    cookie: `hc_access_token=${data.session.access_token}`,
  };
}

async function loginSession(base, env, email, password) {
  const direct = await loginDirect(env, email, password);
  if (direct.ok && direct.cookie) return { ...direct, via: "direct" };
  const http = await login(base, email, password);
  if (http.ok && http.cookie) return { ...http, via: "http" };
  return { ...direct, via: "failed", error: direct.error || null };
}

async function ensureAssignedAdminAccount(sb, adminTestEmail) {
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email === adminTestEmail);
  if (!user) {
    const created = await sb.auth.admin.createUser({
      email: adminTestEmail,
      password: testPassword,
      email_confirm: true,
      user_metadata: { e2e: true, iam_test: true, staging_only: true },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  }
  await sb.auth.admin.updateUserById(user.id, {
    password: testPassword,
    email_confirm: true,
    user_metadata: { e2e: true, iam_test: true, staging_only: true },
  });
  await sb.from("profiles").upsert(
    { id: user.id, email: adminTestEmail, username: "iam-assigned-admin", role: "user" },
    { onConflict: "id" }
  );
  return user.id;
}

async function runAdminAssignmentStability(base, env, sb, superAdminCookie, report) {
  const adminTestEmail = `iam-assigned-admin@${TEST_DOMAIN}`;
  const iterations = [];
  for (let i = 0; i < 3; i += 1) {
    const adminUserId = await ensureAssignedAdminAccount(sb, adminTestEmail);
    const grantRes = await httpJson(`${base}/api/iam/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superAdminCookie },
      body: JSON.stringify({ userId: adminUserId, roleId: "admin", reason: "staging admin assignment validation" }),
    });
    await new Promise((r) => setTimeout(r, 300));
    const { data: assignmentRow } = await sb
      .from("iam_user_assignments")
      .select("id")
      .eq("user_id", adminUserId)
      .eq("role_id", "admin")
      .is("revoked_at", null)
      .maybeSingle();
    const adminLogin = await loginSession(base, env, adminTestEmail, testPassword);
    const adminMe = await httpJson(`${base}/api/iam/me`, { headers: { Cookie: adminLogin.cookie } });
    const adminDash = await httpJson(`${base}/api/admin/dashboard`, { headers: { Cookie: adminLogin.cookie } });
    const adminIamGrant = await httpJson(`${base}/api/iam/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminLogin.cookie },
      body: JSON.stringify({
        userId: LEGACY_ACCOUNTS.find((a) => a.key === "normal_user").userId,
        roleId: "super_admin",
      }),
    });
    const pass =
      adminLogin.ok &&
      (grantRes.status === 200 || grantRes.status === 409 || assignmentRow?.id) &&
      adminMe.status === 200 &&
      adminMe.body?.hasActiveAssignment === true &&
      adminMe.body?.roles?.includes("admin") &&
      adminDash.status === 200 &&
      adminIamGrant.status === 403;
    iterations.push({
      iteration: i + 1,
      grantStatus: grantRes.status,
      loginOk: adminLogin.ok,
      meStatus: adminMe.status,
      dashboard: adminDash.status,
      superGrantDenied: adminIamGrant.status === 403,
      pass,
    });
    if (!pass) break;
  }
  report.adminAssignment = {
    maskedEmail: maskArtifact(adminTestEmail),
    iterations,
    pass: iterations.length === 3 && iterations.every((row) => row.pass),
  };
}

async function runFallbackIntegrationTest(report) {
  const prev = {
    IAM_DB: process.env.IAM_DB,
    IAM_API: process.env.IAM_API,
    IAM_UI: process.env.IAM_UI,
    IAM_RLS: process.env.IAM_RLS,
  };
  process.env.IAM_DB = "true";
  process.env.IAM_API = "true";
  process.env.IAM_UI = "true";
  process.env.IAM_RLS = "true";
  clearPermissionCache();
  try {
    const { resolveIamContext } = await import("../../lib/iam/resolve-permissions.js");
    const mockSb = {
      from(table) {
        if (table === "iam_user_assignments") {
          return {
            select: () => ({
              eq: () => ({
                is: () => ({
                  or: async () => ({ data: [], error: null }),
                }),
              }),
            }),
          };
        }
        if (table === "profiles") {
          return {
            select: () => ({
              or: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            in: async () => ({ data: [], error: null }),
            eq: () => ({ is: () => ({ or: async () => ({ data: [], error: null }) }) }),
          }),
        };
      },
    };
    const ctx = await resolveIamContext(mockSb, {
      id: "00000000-0000-4000-8000-000000009999",
      email: "admin@hasanchartworld.com",
    });
    report.fallbackIntegration = {
      executable: true,
      source: ctx.source,
      legacyIsFallback: ctx.legacyIsFallback === true,
      isAdminFalse: ctx.isAdmin === false,
      hasActiveAssignmentFalse: ctx.hasActiveAssignment === false,
      pass:
        ctx.source === "legacy_blocked" &&
        ctx.legacyIsFallback === true &&
        ctx.isAdmin === false &&
        ctx.hasActiveAssignment === false,
    };
  } finally {
    Object.assign(process.env, prev);
    clearPermissionCache();
  }
}

async function ensureSuperAdminTestAccount(sb, report) {
  const email = `iam-super-admin@${TEST_DOMAIN}`;
  const meta = { e2e: true, iam_test: true, staging_only: true };
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
    await sb.auth.admin.updateUserById(user.id, { password: testPassword, user_metadata: meta });
  }
  await sb.from("profiles").upsert({
    id: user.id,
    email,
    username: "iam-super-admin",
    role: "user",
    admin_role: null,
  });
  const { data: active } = await sb
    .from("iam_user_assignments")
    .select("id")
    .eq("user_id", user.id)
    .eq("role_id", "super_admin")
    .is("revoked_at", null)
    .maybeSingle();
  if (!active) {
    await sb.from("iam_user_assignments").insert({
      user_id: user.id,
      role_id: "super_admin",
      granted_by: user.id,
      grant_reason: "staging iam api hardening validation",
    });
  }
  report.superAdminTestAccount = {
    maskedEmail: email.slice(0, 6) + "***@" + email.split("@")[1],
    hasAssignment: true,
  };
  return { email, userId: user.id };
}

async function resolveSuperAdminSession(base, env, sb, report) {
  const attempts = [];
  if (env.IAM_OWNER_EMAIL && env.STAGING_OWNER_PASSWORD) {
    const ownerTry = await loginSession(base, env, env.IAM_OWNER_EMAIL, env.STAGING_OWNER_PASSWORD);
    attempts.push({
      kind: "bootstrap_owner",
      ok: ownerTry.ok,
      status: ownerTry.status,
      via: ownerTry.via,
      error: ownerTry.error,
    });
    if (ownerTry.ok && ownerTry.cookie) {
      report.superAdminActor = { source: "bootstrap_owner", loginOk: true, attempts };
      return ownerTry;
    }
  }
  const testAcct = await ensureSuperAdminTestAccount(sb, report);
  const testLogin = await loginSession(base, env, testAcct.email, testPassword);
  attempts.push({ kind: "test_super_admin", ok: testLogin.ok, status: testLogin.status, via: testLogin.via });
  report.superAdminActor = { source: "test_super_admin", loginOk: testLogin.ok, attempts };
  if (!testLogin.ok) throw new Error("super_admin_login_failed");
  return testLogin;
}

async function waitForServer(port) {
  const start = Date.now();
  while (Date.now() - start < 180000) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (r.status < 500) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("server_timeout");
}

function startDev(env, port) {
  return spawn("npm", ["run", "dev", "--", "-p", String(port)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function ensureLegacyAccounts(sb, report) {
  const meta = { e2e: true, iam_test: true, staging_only: true };
  report.legacyAccounts = [];
  for (const acc of LEGACY_ACCOUNTS) {
    const email = acc.email || `${acc.local}@${TEST_DOMAIN}`;
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!user) {
      const created = await sb.auth.admin.createUser({
        email,
        password: testPassword,
        email_confirm: true,
        user_metadata: meta,
      });
      if (created.error) {
        if (/already been registered|already exists/i.test(created.error.message || "")) {
          const { data: retryList } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
          user = retryList?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        }
        if (!user) throw created.error;
      } else {
        user = created.data.user;
      }
    } else {
      await sb.auth.admin.updateUserById(user.id, { password: testPassword, user_metadata: meta });
    }
    const { error: upsertError } = await sb.from("profiles").upsert(
      {
        id: user.id,
        email,
        username: acc.local,
        role: acc.profile.role,
        admin_role: acc.profile.admin_role,
      },
      { onConflict: "id" }
    );
    if (upsertError) throw upsertError;
    let { data: verified, error: verifyError } = await sb
      .from("profiles")
      .select("role, admin_role")
      .eq("id", user.id)
      .single();
    if (verifyError) throw verifyError;
    if (verified.role !== acc.profile.role || verified.admin_role !== acc.profile.admin_role) {
      await sb.from("profiles").delete().eq("id", user.id);
      const { error: insertError } = await sb.from("profiles").insert({
        id: user.id,
        email,
        username: acc.local,
        role: acc.profile.role,
        admin_role: acc.profile.admin_role,
      });
      if (insertError) throw insertError;
      ({ data: verified, error: verifyError } = await sb
        .from("profiles")
        .select("role, admin_role")
        .eq("id", user.id)
        .single());
      if (verifyError) throw verifyError;
    }
    if (verified.role !== acc.profile.role || verified.admin_role !== acc.profile.admin_role) {
      throw new Error(`profile_role_not_persisted:${acc.key}`);
    }
    const { data: assignments } = await sb
      .from("iam_user_assignments")
      .select("id, role_id, revoked_at")
      .eq("user_id", user.id)
      .is("revoked_at", null);
    report.legacyAccounts.push({
      key: acc.key,
      maskedEmail: email.slice(0, 6) + "***@" + email.split("@")[1],
      activeAssignments: (assignments || []).length,
      profileRole: acc.profile.role,
      adminRole: acc.profile.admin_role,
    });
    acc.userId = user.id;
    acc.email = email;
  }
}

async function runHumanTests(base, env, sb, report) {
  const superAdmin = await resolveSuperAdminSession(base, env, sb, report);
  report.owner = { loginOk: superAdmin.ok, status: superAdmin.status, via: superAdmin.via };
  if (!superAdmin.ok) throw new Error("super_admin_login_failed");

  const ownerMe = await httpJson(`${base}/api/iam/me`, { headers: { Cookie: superAdmin.cookie } });
  report.ownerMe = {
    isAdmin: ownerMe.body?.isAdmin,
    hasActiveAssignment: ownerMe.body?.hasActiveAssignment,
    roles: ownerMe.body?.roles,
    hasIamManage: (ownerMe.body?.permissions || []).includes(IAM_PERMISSIONS.IAM_MANAGE),
    source: ownerMe.body?.source,
  };
  const ownerDash = await httpJson(`${base}/api/admin/dashboard`, { headers: { Cookie: superAdmin.cookie } });
  const ownerRoles = await httpJson(`${base}/api/iam/roles`, { headers: { Cookie: superAdmin.cookie } });
  report.ownerMe.dashboard = ownerDash.status;
  report.ownerMe.iamRoles = ownerRoles.status;

  for (const key of ["legacy_role_admin", "legacy_admin_role", "legacy_fallback", "normal_user"]) {
    const acc = LEGACY_ACCOUNTS.find((a) => a.key === key);
    const lg = await loginSession(base, env, acc.email, testPassword);
    const me = await httpJson(`${base}/api/iam/me`, { headers: { Cookie: lg.cookie } });
    const dash = await httpJson(`${base}/api/admin/dashboard`, { headers: { Cookie: lg.cookie } });
    const roles = await httpJson(`${base}/api/iam/roles`, { headers: { Cookie: lg.cookie } });
    report.humanDenial = report.humanDenial || {};
    const isLegacyOnly = key !== "normal_user";
    const isFallbackCase = key === "legacy_fallback";
    const legacyPass = isFallbackCase
      ? me.body?.isAdmin === false && me.body?.hasActiveAssignment === false && dash.status === 403 && roles.status === 403
      : key === "normal_user"
        ? me.body?.isAdmin === false &&
          me.body?.hasActiveAssignment === false &&
          (me.body?.permissions || []).length === 0 &&
          dash.status === 403 &&
          roles.status === 403
        : me.body?.isAdmin === false &&
          me.body?.hasActiveAssignment === false &&
          (me.body?.permissions || []).length === 0 &&
          me.body?.legacyDetected === true &&
          me.body?.source === "legacy_blocked" &&
          dash.status === 403 &&
          roles.status === 403;
    report.humanDenial[key] = {
      skipped: isFallbackCase ? "production_fallback_email_not_used_on_staging" : false,
      me: {
        isAdmin: me.body?.isAdmin,
        hasActiveAssignment: me.body?.hasActiveAssignment,
        permissionsCount: (me.body?.permissions || []).length,
        legacyDetected: me.body?.legacyDetected,
        source: me.body?.source,
      },
      dashboard: dash.status,
      iamRoles: roles.status,
      pass: legacyPass,
    };
  }

  await runAdminAssignmentStability(base, env, sb, superAdmin.cookie, report);

  const revokedEmail = `iam-revoked-admin@${TEST_DOMAIN}`;
  let revokedUserId;
  {
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    let user = list?.users?.find((u) => u.email === revokedEmail);
    if (!user) {
      const created = await sb.auth.admin.createUser({
        email: revokedEmail,
        password: testPassword,
        email_confirm: true,
        user_metadata: { e2e: true, iam_test: true, staging_only: true },
      });
      user = created.data.user;
    } else {
      await sb.auth.admin.updateUserById(user.id, { password: testPassword });
    }
    revokedUserId = user.id;
    await sb.from("profiles").upsert({ id: user.id, email: revokedEmail, username: "iam-revoked-admin", role: "user" });
  }
  const grantRevoked = await httpJson(`${base}/api/iam/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdmin.cookie },
    body: JSON.stringify({ userId: revokedUserId, roleId: "admin", reason: "staging revoked assignment validation" }),
  });
  const { data: revokedRow } = await sb
    .from("iam_user_assignments")
    .select("id")
    .eq("user_id", revokedUserId)
    .eq("role_id", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  const revokeRes = await httpJson(`${base}/api/iam/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: superAdmin.cookie },
    body: JSON.stringify({
      action: "revoke",
      userId: revokedUserId,
      roleId: "admin",
      assignmentId: revokedRow?.id,
      reason: "staging revoked assignment validation",
    }),
  });
  const revokedLogin = await loginSession(base, env, revokedEmail, testPassword);
  const revokedMe = await httpJson(`${base}/api/iam/me`, { headers: { Cookie: revokedLogin.cookie } });
  const revokedDash = await httpJson(`${base}/api/admin/dashboard`, { headers: { Cookie: revokedLogin.cookie } });
  report.revokedAssignment = {
    grantStatus: grantRevoked.status,
    revokeStatus: revokeRes.status,
    me: {
      isAdmin: revokedMe.body?.isAdmin,
      hasActiveAssignment: revokedMe.body?.hasActiveAssignment,
    },
    dashboard: revokedDash.status,
    pass:
      revokedMe.body?.hasActiveAssignment === false &&
      revokedMe.body?.isAdmin === false &&
      revokedDash.status === 403,
  };

  const { data: secEvents } = await sb
    .from("iam_security_events")
    .select("event_type, details, user_id")
    .eq("event_type", "iam.assignment_required")
    .order("created_at", { ascending: false })
    .limit(5);
  report.securityEvents = {
    assignmentRequiredCount: (secEvents || []).length,
    secretLeak: JSON.stringify(secEvents || []).match(/@|Bearer|secret|password/i) !== null,
  };
}

async function runRollbackTest(env, report) {
  const rollbackEnv = loadStagingEnv({ iamApi: "false", iamUi: "false", iamRls: "false" });
  const dev = startDev(rollbackEnv, DEV_PORT_ROLLBACK);
  try {
    await waitForServer(DEV_PORT_ROLLBACK);
    const base = `http://127.0.0.1:${DEV_PORT_ROLLBACK}`;
    const acc = LEGACY_ACCOUNTS.find((a) => a.key === "legacy_role_admin");
    const lg = await loginSession(base, rollbackEnv, acc.email, testPassword);
    const me = await httpJson(`${base}/api/iam/me`, { headers: { Cookie: lg.cookie } });
    const dash = await httpJson(`${base}/api/admin/dashboard`, { headers: { Cookie: lg.cookie } });
    report.rollback = {
      flags: { IAM_API: false, IAM_UI: false, IAM_RLS: false },
      legacyRoleAdmin: {
        isAdmin: me.body?.isAdmin,
        dashboard: dash.status,
        pass: me.body?.isAdmin === true && dash.status !== 403,
      },
    };
  } finally {
    dev.kill("SIGTERM");
  }
}

async function runMachineTests(base, env, report) {
  report.machine = {};
  const cronSecret = env.STAGING_IAM_CRON_SECRET || env.CRON_SECRET || "";
  const serviceHeaders = (id, secret) => ({
    "x-service-account-id": id,
    "x-service-account-secret": secret,
    "Content-Type": "application/json",
  });

  if (cronSecret) {
    const legacyCronNews = await httpJson(`${base}/api/send-news`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cronSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "t", actual: "a", forecast: "f", previous: "p", analysis: "x", dryRun: true }),
    });
    const legacyCronExpiry = await httpJson(`${base}/api/check-subscription-expiry`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const legacyCronIam = await httpJson(`${base}/api/iam/roles`, {
      method: "GET",
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    report.machine.legacyCronBearerOnly = {
      sendNews: legacyCronNews.status,
      subscriptionExpiry: legacyCronExpiry.status,
      iamRoles: legacyCronIam.status,
      pass:
        (legacyCronNews.status === 401 || legacyCronNews.status === 403 || legacyCronNews.status === 503) &&
        (legacyCronExpiry.status === 401 || legacyCronExpiry.status === 403 || legacyCronExpiry.status === 503) &&
        (legacyCronIam.status === 401 || legacyCronIam.status === 403),
    };
  }

  const svcPairs = [
    {
      id: "cron",
      secret: env.STAGING_IAM_CRON_SECRET,
      allows: [
        { path: "/api/check-subscription-expiry", method: "GET" },
        { path: "/api/check-price-alerts", method: "GET", expectStatus: [410] },
      ],
      denies: [
        { path: "/api/iam/roles", method: "GET" },
        { path: "/api/send-news", method: "POST", body: { title: "t", actual: "a", forecast: "f", previous: "p", analysis: "x", dryRun: true } },
      ],
    },
    {
      id: "news-worker",
      secret: env.STAGING_IAM_NEWS_WORKER_SECRET,
      allows: [
        {
          path: "/api/send-news",
          method: "POST",
          body: { title: "t", actual: "a", forecast: "f", previous: "p", analysis: "x", dryRun: true },
        },
      ],
      denies: [
        { path: "/api/iam/assignments", method: "GET" },
        { path: "/api/admin/financial-center", method: "GET" },
      ],
    },
    {
      id: "price-alert-worker",
      secret: env.STAGING_IAM_PRICE_ALERT_WORKER_SECRET || env.STAGING_IAM_PRICE_ALERT_SECRET,
      allows: [{ path: "/api/check-price-alerts", method: "GET", expectStatus: [410] }],
      denies: [
        { path: "/api/iam/roles", method: "GET" },
        { path: "/api/send-news", method: "POST", body: { title: "t", actual: "a", forecast: "f", previous: "p", analysis: "x", dryRun: true } },
      ],
    },
  ];

  for (const svc of svcPairs) {
    if (!svc.secret) {
      report.machine[svc.id] = { skipped: "no_secret" };
      continue;
    }
    const headers = serviceHeaders(svc.id, svc.secret);
    const allowResults = [];
    for (const route of svc.allows) {
      const res = await httpJson(`${base}${route.path}`, {
        method: route.method,
        headers,
        body: route.body ? JSON.stringify(route.body) : undefined,
      });
      const expected = route.expectStatus || null;
      const ok = expected ? expected.includes(res.status) : res.status !== 401 && res.status !== 403;
      allowResults.push({ path: route.path, status: res.status, ok });
    }
    const denyResults = [];
    for (const route of svc.denies) {
      const res = await httpJson(`${base}${route.path}`, {
        method: route.method,
        headers,
        body: route.body ? JSON.stringify(route.body) : undefined,
      });
      denyResults.push({ path: route.path, status: res.status, ok: res.status === 401 || res.status === 403 || res.status === 503 });
    }
    const wrong = await httpJson(`${base}${svc.allows[0].path}`, {
      method: svc.allows[0].method,
      headers: serviceHeaders(svc.id, "wrong-secret-value"),
      body: svc.allows[0].body ? JSON.stringify(svc.allows[0].body) : undefined,
    });
    const cross = svcPairs.find((x) => x.id !== svc.id && x.secret);
    let crossStatus = null;
    if (cross?.secret) {
      crossStatus = (
        await httpJson(`${base}${svc.allows[0].path}`, {
          method: svc.allows[0].method,
          headers: serviceHeaders(svc.id, cross.secret),
          body: svc.allows[0].body ? JSON.stringify(svc.allows[0].body) : undefined,
        })
      ).status;
    }
    report.machine[svc.id] = {
      allowResults,
      denyResults,
      wrongSecretStatus: wrong.status,
      crossServiceStatus: crossStatus,
      pass:
        allowResults.every((r) => r.ok) &&
        denyResults.every((r) => r.ok) &&
        (wrong.status === 401 || wrong.status === 403 || wrong.status === 503) &&
        (crossStatus == null || crossStatus === 401 || crossStatus === 403 || crossStatus === 503),
    };
  }

  report.machine.documentation = {
    "instant-analysis-worker": "Retired Aug 2026 — historical IAM account; no active web route",
    "telegram-bot": "No standalone telegram web route; uses send-news/support integrations",
  };
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const timestamp = ts();
  const preArtifact = {
    phase: "staging-iam-api-hardening-pre",
    timestamp,
    branch: "fix/iam-api-assignment-enforcement",
    gitRef: process.env.GIT_REF || "local",
  };

  const staging = parseEnvFile(STAGING_ENV);
  const bootstrap = parseEnvFile(BOOTSTRAP_ENV);
  initTestPassword(staging);
  assertEnvRefs({ ...staging, ...bootstrap });
  const stagingRef = extractSupabaseProjectRef(staging.STAGING_SUPABASE_URL);
  if (stagingRef === PRODUCTION_SUPABASE_PROJECT_REF || stagingRef !== STAGING_SUPABASE_PROJECT_REF) {
    console.error(JSON.stringify({ verdict: "STAGING HARDENING FAILED", error: "staging_ref_invalid" }));
    process.exit(1);
  }

  let linkedRef = "";
  try {
    linkedRef = JSON.parse(readFileSync(join(ROOT, "supabase/.temp/linked-project.json"), "utf8")).ref;
  } catch {
    linkedRef = readFileSync(join(ROOT, "supabase/.temp/project-ref"), "utf8").trim();
  }

  preArtifact.isolation = {
    stagingRefMasked: maskProjectRef(stagingRef),
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    linkedRefMasked: maskProjectRef(linkedRef),
    linkedMatchesStaging: linkedRef === STAGING_SUPABASE_PROJECT_REF,
    envLocalNotUsed: true,
  };
  writeFileSync(join(ARTIFACT_DIR, `staging-iam-api-hardening-pre-${timestamp}.json`), JSON.stringify(preArtifact, null, 2));

  if (linkedRef === PRODUCTION_SUPABASE_PROJECT_REF) {
    console.error(JSON.stringify({ verdict: "STAGING HARDENING FAILED", error: "cli_linked_to_production" }));
    process.exit(1);
  }

  const secrets = ensureStagingServiceSecrets();
  const env = loadStagingEnv({ iamApi: "true", iamUi: "true", iamRls: "true" });
  Object.assign(env, secrets.env);
  env.STAGING_IAM_TEST_PASSWORD = testPassword;

  const sb = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { count: superAdminCount } = await sb
    .from("iam_user_assignments")
    .select("id", { count: "exact", head: true })
    .eq("role_id", "super_admin")
    .is("revoked_at", null);
  const { data: bootstrapState } = await sb.from("iam_bootstrap_state").select("completed_at").eq("id", true).maybeSingle();

  const report = {
    phase: "staging-iam-api-hardening-live",
    timestamp,
    schema: {
      bootstrapCompleted: Boolean(bootstrapState?.completed_at),
      superAdminCount: superAdminCount ?? 0,
      flags: { IAM_DB: true, IAM_API: true, IAM_UI: true, IAM_RLS: true },
    },
    secretsGenerated: secrets.generated.map((k) => k.replace("STAGING_IAM_", "").replace("_SECRET", "")),
  };

  await ensureLegacyAccounts(sb, report);
  await runFallbackIntegrationTest(report);

  const setup = spawnSync("node", ["scripts/iam/staging-service-accounts-setup.mjs"], {
    cwd: ROOT,
    stdio: "pipe",
    env,
  });
  report.serviceAccountSetup = { exitCode: setup.status, ok: setup.status === 0 };

  const dev = startDev(env, DEV_PORT);
  try {
    await waitForServer(DEV_PORT);
    const base = `http://127.0.0.1:${DEV_PORT}`;

    await runHumanTests(base, env, sb, report);
    await runMachineTests(base, env, report);

    const roleMatrix = spawnSync("node", ["scripts/iam/staging-api-enforcement.mjs"], {
      cwd: ROOT,
      stdio: "pipe",
      env,
    });
    report.roleMatrix = { exitCode: roleMatrix.status, ok: roleMatrix.status === 0 };
  } finally {
    dev.kill("SIGTERM");
  }

  await runRollbackTest(env, report);

  const humanPass = Object.entries(report.humanDenial || {}).every(([key, r]) => {
    if (r.skipped) return true;
    return r.pass;
  });
  const ownerPass =
    report.ownerMe?.hasActiveAssignment === true &&
    report.ownerMe?.hasIamManage === true &&
    report.ownerMe?.dashboard === 200 &&
    report.adminAssignment?.pass === true &&
    report.revokedAssignment?.pass === true;
  const machinePass =
    report.machine?.legacyCronBearerOnly?.pass === true &&
    Object.values(report.machine || {})
      .filter((v) => v && typeof v === "object" && "pass" in v)
      .every((v) => v.pass);
  const rollbackPass = report.rollback?.legacyRoleAdmin?.pass === true;
  const fallbackPass = report.fallbackIntegration?.pass === true;
  const roleMatrixPass = report.roleMatrix?.ok === true;

  report.ok =
    humanPass &&
    ownerPass &&
    machinePass &&
    rollbackPass &&
    fallbackPass &&
    roleMatrixPass &&
    !report.securityEvents?.secretLeak;
  report.verdict = report.ok ? "STAGING HARDENING VALIDATED" : "STAGING HARDENING FAILED";

  const outPath = join(ARTIFACT_DIR, `staging-iam-api-hardening-live-${timestamp}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, ok: report.ok, artifact: outPath }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  const failPath = join(ARTIFACT_DIR, `staging-iam-api-hardening-live-${ts()}-failed.json`);
  try {
    mkdirSync(ARTIFACT_DIR, { recursive: true });
    writeFileSync(failPath, JSON.stringify({ verdict: "STAGING HARDENING FAILED", error: e.message }, null, 2));
  } catch {
    /* ignore */
  }
  console.error(JSON.stringify({ verdict: "STAGING HARDENING FAILED", error: e.message, artifact: failPath }));
  process.exit(1);
});
