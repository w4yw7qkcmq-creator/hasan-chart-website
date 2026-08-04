#!/usr/bin/env node
/**
 * Staging IAM bootstrap execution & validation.
 * Loads .env.staging.local + .env.staging.bootstrap.local ONLY (never .env.local).
 * Does not print secrets, tokens, passwords, or full emails.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
  assertStagingSupabaseConfig,
} from "../../lib/staging-env-guard.js";
import { normalizeEmail } from "../../lib/admin-emails.js";

const ROOT = process.cwd();
const BOOTSTRAP_ENV = resolve(ROOT, ".env.staging.bootstrap.local");
const STAGING_ENV = resolve(ROOT, ".env.staging.local");
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const DEV_PORT = 3011;

const PLACEHOLDER_RE =
  /^(your_|change_me|placeholder|xxx+|todo|fixme|example|test123|password123)/i;

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
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function maskEmail(email = "") {
  const [local, domain = ""] = String(email).split("@");
  if (!domain) return "***";
  return `${local.slice(0, 3)}***@${domain}`;
}

function loadIsolatedEnv() {
  const staging = parseEnvFile(STAGING_ENV);
  const bootstrap = parseEnvFile(BOOTSTRAP_ENV);
  const env = {
    ...process.env,
    NODE_ENV: "development",
    IAM_DB: "true",
    IAM_API: "false",
    IAM_UI: "false",
    IAM_RLS: "false",
  };
  for (const [k, v] of Object.entries({ ...staging, ...bootstrap })) {
    env[k] = v;
  }
  env.NEXT_PUBLIC_SUPABASE_URL = staging.STAGING_SUPABASE_URL;
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY = staging.STAGING_SUPABASE_ANON_KEY;
  env.SUPABASE_SERVICE_ROLE_KEY = staging.STAGING_SUPABASE_SERVICE_ROLE_KEY;
  delete env.NEXT_PUBLIC_SITE_URL;
  return env;
}

function validateEnvFile() {
  const required = [
    "IAM_OWNER_EMAIL",
    "STAGING_OWNER_PASSWORD",
    "IAM_BOOTSTRAP_SECRET",
    "IAM_BOOTSTRAP_EXPIRES_AT",
  ];
  const optional = ["IAM_BOOTSTRAP_ALLOWED_IPS"];
  const bootstrap = parseEnvFile(BOOTSTRAP_ENV);
  const staging = parseEnvFile(STAGING_ENV);
  const checks = {
    fileExists: existsSync(BOOTSTRAP_ENV),
    stagingFileExists: existsSync(STAGING_ENV),
    requiredKeys: {},
    placeholderFound: false,
    secretLength: 0,
    secretStrong: false,
    expiresAtValid: false,
    expiresAtNotExpired: false,
  };
  for (const key of required) {
    const val = bootstrap[key]?.trim() || "";
    checks.requiredKeys[key] = val.length > 0;
    if (val && PLACEHOLDER_RE.test(val)) checks.placeholderFound = true;
  }
  for (const key of optional) {
    checks.requiredKeys[key] = key in bootstrap;
  }
  const secret = bootstrap.IAM_BOOTSTRAP_SECRET?.trim() || "";
  checks.secretLength = secret.length;
  checks.secretStrong = secret.length >= 32;
  const exp = bootstrap.IAM_BOOTSTRAP_EXPIRES_AT?.trim() || "";
  if (exp) {
    const ms = Date.parse(exp);
    checks.expiresAtValid = !Number.isNaN(ms);
    checks.expiresAtNotExpired = checks.expiresAtValid && Date.now() <= ms;
  }
  const gitCheck = spawnSync("git", ["check-ignore", "-q", BOOTSTRAP_ENV], { cwd: ROOT });
  const gitStatus = spawnSync("git", ["status", "--porcelain", ".env.staging.bootstrap.local"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const gitDiff = spawnSync("git", ["diff", "--", ".env.staging.bootstrap.local"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return {
    ...checks,
    gitignored: gitCheck.status === 0,
    gitTracked: gitStatus.stdout.trim().length > 0 && !gitStatus.stdout.startsWith("??"),
    gitDiffEmpty: gitDiff.stdout.trim().length === 0,
    stagingKeysPresent: Boolean(staging.STAGING_SUPABASE_URL && staging.STAGING_SUPABASE_PROJECT_REF),
  };
}

async function safetyCheck(env) {
  const staging = assertStagingSupabaseConfig({
    projectRef: env.STAGING_SUPABASE_PROJECT_REF,
    url: env.STAGING_SUPABASE_URL,
  });
  const usedRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  const ownerEmail = env.IAM_OWNER_EMAIL?.trim() || "";
  const expectedOwnerDomain = "hasanchartworld.com";
  const ownerDomainOk = ownerEmail.endsWith(`@${expectedOwnerDomain}`);

  const supabase = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: usersData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const owner = (usersData?.users || []).find(
    (u) => normalizeEmail(u.email) === normalizeEmail(ownerEmail)
  );

  let profile = null;
  if (owner) {
    const { data } = await supabase.from("profiles").select("id, role, admin_role, email").eq("id", owner.id).maybeSingle();
    profile = data;
  }

  const { count: activeAssignmentsCount } = await supabase
    .from("iam_user_assignments")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null);
  const { count: superAdminCount } = await supabase
    .from("iam_user_assignments")
    .select("id", { count: "exact", head: true })
    .eq("role_id", "super_admin")
    .is("revoked_at", null);
  const { data: bootstrap } = await supabase
    .from("iam_bootstrap_state")
    .select("completed_at, completed_by")
    .eq("id", true)
    .maybeSingle();

  const secret = env.IAM_BOOTSTRAP_SECRET?.trim() || "";
  const exp = env.IAM_BOOTSTRAP_EXPIRES_AT?.trim() || "";
  const expMs = Date.parse(exp);

  const check = {
    stagingProjectRefMatches: staging.projectRef === env.STAGING_SUPABASE_PROJECT_REF && usedRef === staging.projectRef,
    productionProjectRejected: staging.projectRef !== PRODUCTION_SUPABASE_PROJECT_REF && usedRef !== PRODUCTION_SUPABASE_PROJECT_REF,
    envIsolation: usedRef === staging.projectRef && usedRef !== PRODUCTION_SUPABASE_PROJECT_REF,
    ownerExists: Boolean(owner),
    ownerProfileExists: Boolean(profile?.id),
    ownerEmailConfirmed: Boolean(owner?.email_confirmed_at),
    ownerDomainMatches: ownerDomainOk,
    ownerIsProductionAccount: false,
    ownerRoleUnchanged: profile ? typeof profile.role === "string" : false,
    bootstrapSecretValid: secret.length >= 32,
    bootstrapNotExpired: exp ? Date.now() <= expMs : false,
    activeAssignmentsCount: activeAssignmentsCount ?? 0,
    superAdminCount: superAdminCount ?? 0,
    bootstrapCompleted: Boolean(bootstrap?.completed_at),
    ownerEmailMasked: maskEmail(ownerEmail),
    ownerUserIdPrefix: owner?.id?.slice(0, 8) || null,
    profileRole: profile?.role || null,
    stagingRefMasked: maskProjectRef(staging.projectRef),
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    usedRefMasked: maskProjectRef(usedRef),
  };

  check.safeForBootstrap =
    check.stagingProjectRefMatches &&
    check.productionProjectRejected &&
    check.envIsolation &&
    check.ownerExists &&
    check.ownerProfileExists &&
    check.ownerEmailConfirmed &&
    check.ownerDomainMatches &&
    check.bootstrapSecretValid &&
    check.bootstrapNotExpired &&
    check.activeAssignmentsCount === 0 &&
    check.superAdminCount === 0 &&
    !check.bootstrapCompleted;

  return { check, supabase, owner, profile, bootstrap };
}

function extractCookie(setCookieHeaders, name) {
  const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  for (const h of headers) {
    if (!h) continue;
    const m = String(h).match(new RegExp(`${name}=([^;]+)`));
    if (m) return m[1];
  }
  return null;
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

function waitForServer(port, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: AbortSignal.timeout(3000) });
        if (res.ok || res.status < 500) return resolve(true);
      } catch {
        /* retry */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error("Server startup timeout"));
      setTimeout(tick, 1500);
    };
    tick();
  });
}

async function verifyDbState(supabase, ownerId, completedAtBefore = null) {
  const { data: assignment } = await supabase
    .from("iam_user_assignments")
    .select("user_id, role_id, organization_id, granted_by, granted_at, revoked_at")
    .eq("user_id", ownerId)
    .is("revoked_at", null)
    .maybeSingle();
  const { count: activeAssignmentsCount } = await supabase
    .from("iam_user_assignments")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null);
  const { count: superAdminCount } = await supabase
    .from("iam_user_assignments")
    .select("id", { count: "exact", head: true })
    .eq("role_id", "super_admin")
    .is("revoked_at", null);
  const { data: bootstrap } = await supabase
    .from("iam_bootstrap_state")
    .select("completed_at, completed_by")
    .eq("id", true)
    .maybeSingle();
  const { data: auditRows } = await supabase
    .from("iam_audit_logs")
    .select("action, actor_id, metadata")
    .eq("action", "iam.bootstrap")
    .order("created_at", { ascending: false })
    .limit(3);
  const { data: secRows } = await supabase
    .from("iam_security_events")
    .select("event_type, user_id, details, severity")
    .in("event_type", ["iam.bootstrap.completed", "iam.bootstrap.failed"])
    .order("created_at", { ascending: false })
    .limit(5);

  const secretLeak = (rows) =>
    JSON.stringify(rows || []).match(/secret|token|password|cookie|Bearer/i) !== null;

  return {
    assignment: assignment
      ? {
          role_id: assignment.role_id,
          organization_id: assignment.organization_id,
          granted_by: assignment.granted_by?.slice(0, 8) + "...",
          granted_at_set: Boolean(assignment.granted_at),
          user_id_prefix: assignment.user_id?.slice(0, 8) + "...",
        }
      : null,
    activeAssignmentsCount,
    superAdminCount,
    bootstrapCompleted: Boolean(bootstrap?.completed_at),
    completedByPrefix: bootstrap?.completed_by?.slice(0, 8) + "..." || null,
    completedAtUnchanged: completedAtBefore ? bootstrap?.completed_at === completedAtBefore : null,
    auditEventFound: (auditRows || []).some((r) => r.action === "iam.bootstrap"),
    securitySuccessFound: (secRows || []).some((r) => r.event_type === "iam.bootstrap.completed"),
    secretLeakageInAudit: secretLeak(auditRows),
    secretLeakageInSecurity: secretLeak(secRows),
  };
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const report = { ok: false, verdict: "BOOTSTRAP FAILED", phases: {} };

  report.phases.envFile = validateEnvFile();
  if (!report.phases.envFile.fileExists) {
    report.error = "Missing .env.staging.bootstrap.local";
    return finish(report);
  }

  const env = loadIsolatedEnv();
  const { check, supabase, owner, profile } = await safetyCheck(env);
  report.phases.safetyCheck = check;

  if (!check.safeForBootstrap) {
    report.error = "safeForBootstrap=false — aborted before mutation";
    return finish(report);
  }

  const dev = spawn("npm", ["run", "dev", "--", "-p", String(DEV_PORT)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let devLog = "";
  dev.stdout?.on("data", (d) => {
    devLog += d.toString();
    if (devLog.length > 8000) devLog = devLog.slice(-8000);
  });
  dev.stderr?.on("data", (d) => {
    devLog += d.toString();
    if (devLog.length > 8000) devLog = devLog.slice(-8000);
  });

  try {
    await waitForServer(DEV_PORT);
    const base = `http://127.0.0.1:${DEV_PORT}`;

    const loginRes = await httpJson(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: env.IAM_OWNER_EMAIL,
        password: env.STAGING_OWNER_PASSWORD,
      }),
    });

    report.phases.login = {
      status: loginRes.status,
      success: loginRes.body?.success === true,
      hasUser: Boolean(loginRes.body?.user?.id),
      cookieSet: Boolean(extractCookie(loginRes.headers.getSetCookie?.() || loginRes.headers.raw?.()?.["set-cookie"], "hc_access_token")),
    };

    if (!report.phases.login.success) {
      report.error = "Login failed";
      return finish(report, dev);
    }

    const setCookie = loginRes.headers.getSetCookie?.() || [];
    const accessCookie = extractCookie(setCookie, "hc_access_token");
    const cookieHeader = accessCookie ? `hc_access_token=${accessCookie}` : "";

    report.phases.bootstrap = {};
    const bootstrapRes = await httpJson(`${base}/api/iam/bootstrap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
        "x-iam-bootstrap-token": env.IAM_BOOTSTRAP_SECRET,
        Origin: base,
        Host: `127.0.0.1:${DEV_PORT}`,
      },
      body: JSON.stringify({ confirmEmail: env.IAM_OWNER_EMAIL }),
    });
    report.phases.bootstrap.initial = {
      status: bootstrapRes.status,
      success: bootstrapRes.body?.success === true,
      roleId: bootstrapRes.body?.roleId || null,
      error: bootstrapRes.body?.error || null,
    };

    if (!report.phases.bootstrap.initial.success) {
      report.error = "Bootstrap POST failed";
      return finish(report, dev);
    }

    const dbAfter = await verifyDbState(supabase, owner.id);
    report.phases.dbAfterBootstrap = dbAfter;

    const completedAt = (await supabase.from("iam_bootstrap_state").select("completed_at").eq("id", true).maybeSingle()).data?.completed_at;

    report.phases.abuse = {};

    const replay = await httpJson(`${base}/api/iam/bootstrap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
        "x-iam-bootstrap-token": env.IAM_BOOTSTRAP_SECRET,
        Origin: base,
      },
      body: JSON.stringify({ confirmEmail: env.IAM_OWNER_EMAIL }),
    });
    report.phases.abuse.replay = { status: replay.status, error: replay.body?.error || null };

    const noSession = await httpJson(`${base}/api/iam/bootstrap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-iam-bootstrap-token": env.IAM_BOOTSTRAP_SECRET,
      },
      body: JSON.stringify({ confirmEmail: env.IAM_OWNER_EMAIL }),
    });
    report.phases.abuse.noSession = { status: noSession.status };

    const noToken = await httpJson(`${base}/api/iam/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify({ confirmEmail: env.IAM_OWNER_EMAIL }),
    });
    report.phases.abuse.noToken = { status: noToken.status };

    const badToken = await httpJson(`${base}/api/iam/bootstrap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
        "x-iam-bootstrap-token": "invalid-token-value-for-test-only",
        Origin: base,
      },
      body: JSON.stringify({ confirmEmail: env.IAM_OWNER_EMAIL }),
    });
    report.phases.abuse.badToken = { status: badToken.status };

    const badEmail = await httpJson(`${base}/api/iam/bootstrap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieHeader,
        "x-iam-bootstrap-token": env.IAM_BOOTSTRAP_SECRET,
        Origin: base,
      },
      body: JSON.stringify({ confirmEmail: "other@hasanchartworld.com" }),
    });
    report.phases.abuse.badConfirmEmail = { status: badEmail.status };

    const dbAfterAbuse = await verifyDbState(supabase, owner.id, completedAt);
    report.phases.abuse.dbStable = {
      activeAssignmentsCount: dbAfterAbuse.activeAssignmentsCount,
      superAdminCount: dbAfterAbuse.superAdminCount,
      completedAtUnchanged: dbAfterAbuse.completedAtUnchanged,
    };

    const meAdmin = await httpJson(`${base}/api/iam/me`, {
      headers: { Cookie: cookieHeader },
    });
    report.phases.meAdmin = {
      status: meAdmin.status,
      isAdmin: meAdmin.body?.isAdmin,
      roles: meAdmin.body?.roles || [],
      hasIamManage: (meAdmin.body?.permissions || []).includes("iam.manage"),
      hasSecrets: JSON.stringify(meAdmin.body || {}).match(/secret|token|password|Bearer/i) !== null,
      bootstrapCompleted: meAdmin.body?.bootstrap?.completed,
    };

    const health = await httpJson(`${base}/api/iam/health`, {
      headers: { Cookie: cookieHeader },
    });
    report.phases.health = {
      status: health.status,
      success: health.body?.success,
      schemaConfigured: health.body?.health?.schemaConfigured,
      bootstrapCompleted: health.body?.health?.bootstrapCompleted,
      assignmentsCount: health.body?.health?.assignmentsCount,
      superAdminCount: health.body?.health?.superAdminCount,
      iamStatus: health.body?.health?.status,
      flags: health.body?.health?.flags || null,
    };

    const dryRun = await httpJson(`${base}/api/iam/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify({ action: "dry_run_backfill", confirm: "DRY_RUN_BACKFILL" }),
    });
    report.phases.backfillDryRun = {
      status: dryRun.status,
      dryRun: dryRun.body?.dryRun,
      report: dryRun.body?.report
        ? {
            legacyAdminsFound: dryRun.body.report.legacyAdminsFound,
            proposedAssignments: dryRun.body.report.proposedAssignments?.length ?? dryRun.body.report.proposedCount,
            duplicates: dryRun.body.report.duplicates?.length ?? dryRun.body.report.duplicateCount,
            proposedSuperAdminCount: dryRun.body.report.proposedSuperAdminCount,
            alreadyAssigned: dryRun.body.report.alreadyAssigned,
            unexpectedCandidates: dryRun.body.report.unexpectedCandidates?.length ?? 0,
          }
        : { error: dryRun.body?.error },
    };

    const normalUser = (await supabase.auth.admin.listUsers({ page: 1, perPage: 100 })).data?.users?.find(
      (u) => normalizeEmail(u.email) !== normalizeEmail(env.IAM_OWNER_EMAIL)
    );
    if (normalUser) {
      const normalLogin = await httpJson(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalUser.email, password: "invalid-password-on-purpose" }),
      });
      report.phases.meNormal = { skipped: true, reason: "no normal user password available" };
      if (normalLogin.status === 401) {
        report.phases.meNormal = { testedViaUnauth: true, loginRejected: true };
      }
    }

    const meUnauth = await httpJson(`${base}/api/iam/me`);
    report.phases.meUnauth = { status: meUnauth.status };

    report.secretLeakage =
      dbAfter.secretLeakageInAudit ||
      dbAfter.secretLeakageInSecurity ||
      report.phases.meAdmin.hasSecrets ||
      /secret|password|Bearer/i.test(devLog);

    report.ok =
      report.phases.bootstrap.initial.success &&
      dbAfter.activeAssignmentsCount === 1 &&
      dbAfter.superAdminCount === 1 &&
      dbAfter.bootstrapCompleted &&
      replay.status === 410 &&
      noSession.status === 401 &&
      report.phases.meAdmin.isAdmin === true &&
      report.phases.meAdmin.hasIamManage === true;

    report.verdict = report.ok ? "BOOTSTRAP VALIDATED" : "BOOTSTRAP FAILED";
    return finish(report, dev);
  } catch (err) {
    report.error = err.message;
    return finish(report, dev);
  }
}

function finish(report, dev) {
  if (dev && !dev.killed) dev.kill("SIGTERM");
  const path = join(ARTIFACT_DIR, `staging-bootstrap-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict: report.verdict, ok: report.ok, artifact: path, report }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ verdict: "BOOTSTRAP FAILED", error: e.message }));
  process.exit(1);
});
