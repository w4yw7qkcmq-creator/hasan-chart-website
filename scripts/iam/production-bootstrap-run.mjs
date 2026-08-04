#!/usr/bin/env node
/**
 * Production IAM bootstrap execution & validation.
 * Loads .env.local (Production Supabase) + .env.production.bootstrap.local ONLY.
 * Never loads Staging env files. Does not print secrets.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
  extractSupabaseProjectRef,
} from "../../lib/production-env-guard.js";
import { normalizeEmail } from "../../lib/admin-emails.js";
import { IAM_DEFAULT_ORGANIZATION_ID } from "../../lib/iam/constants.js";

const ROOT = process.cwd();
const PROD_ENV = resolve(ROOT, ".env.local");
const BOOTSTRAP_ENV = resolve(ROOT, ".env.production.bootstrap.local");
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts");
const DEV_PORT = 3012;

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
  const local = parseEnvFile(PROD_ENV);
  const bootstrap = parseEnvFile(BOOTSTRAP_ENV);
  const env = {
    ...process.env,
    NODE_ENV: "development",
    IAM_DB: "true",
    IAM_API: "false",
    IAM_UI: "false",
    IAM_RLS: "false",
  };
  for (const [k, v] of Object.entries({ ...local, ...bootstrap })) {
    env[k] = v;
  }
  delete env.NEXT_PUBLIC_SITE_URL;
  return env;
}

function validateEnvFile() {
  const required = [
    "IAM_OWNER_EMAIL",
    "PRODUCTION_OWNER_PASSWORD",
    "IAM_BOOTSTRAP_SECRET",
    "IAM_BOOTSTRAP_EXPIRES_AT",
  ];
  const bootstrap = parseEnvFile(BOOTSTRAP_ENV);
  const local = parseEnvFile(PROD_ENV);
  const checks = {
    bootstrapFileExists: existsSync(BOOTSTRAP_ENV),
    localFileExists: existsSync(PROD_ENV),
    requiredKeys: {},
    placeholderFound: false,
    secretStrong: false,
    expiresAtNotExpired: false,
  };
  for (const key of required) {
    const val = bootstrap[key]?.trim() || "";
    checks.requiredKeys[key] = val.length > 0;
    if (val && PLACEHOLDER_RE.test(val)) checks.placeholderFound = true;
  }
  const secret = bootstrap.IAM_BOOTSTRAP_SECRET?.trim() || "";
  checks.secretStrong = secret.length >= 64;
  const exp = bootstrap.IAM_BOOTSTRAP_EXPIRES_AT?.trim() || "";
  if (exp) {
    const ms = Date.parse(exp);
    checks.expiresAtNotExpired = !Number.isNaN(ms) && Date.now() <= ms;
  }
  const usedRef = extractSupabaseProjectRef(local.NEXT_PUBLIC_SUPABASE_URL);
  checks.productionRefMatches =
    usedRef === PRODUCTION_SUPABASE_PROJECT_REF;
  checks.stagingRefRejected = usedRef !== STAGING_SUPABASE_PROJECT_REF;
  const gitCheck = spawnSync("git", ["check-ignore", "-q", BOOTSTRAP_ENV], { cwd: ROOT });
  checks.bootstrapGitignored = gitCheck.status === 0;
  return checks;
}

async function safetyCheck(env) {
  const usedRef = extractSupabaseProjectRef(env.NEXT_PUBLIC_SUPABASE_URL);
  const ownerEmail = env.IAM_OWNER_EMAIL?.trim() || "";
  const ownerEmailNorm = normalizeEmail(ownerEmail);

  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  const { data: usersData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const owner = (usersData?.users || []).find(
    (u) => normalizeEmail(u.email) === ownerEmailNorm
  );

  let profile = null;
  if (owner) {
    const { data } = await supabase
      .from("profiles")
      .select("id, role, admin_role, email")
      .eq("id", owner.id)
      .maybeSingle();
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

  const check = {
    productionProjectRefMatches: usedRef === PRODUCTION_SUPABASE_PROJECT_REF,
    stagingProjectRejected: usedRef !== STAGING_SUPABASE_PROJECT_REF,
    ownerExists: Boolean(owner),
    ownerProfileExists: Boolean(profile?.id),
    ownerEmailConfirmed: Boolean(owner?.email_confirmed_at),
    ownerNotTestLocal: !ownerEmailNorm.includes("@test.local"),
    ownerNotStagingAccount: ownerEmailNorm !== "staging@hasanchartworld.com",
    ownerRoleUnchanged: profile?.role === "admin",
    profileRole: profile?.role || null,
    profileAdminRole: profile?.admin_role || null,
    bootstrapSecretValid: (env.IAM_BOOTSTRAP_SECRET?.trim() || "").length >= 64,
    bootstrapNotExpired: Date.now() <= Date.parse(env.IAM_BOOTSTRAP_EXPIRES_AT || ""),
    activeAssignmentsCount: activeAssignmentsCount ?? 0,
    superAdminCount: superAdminCount ?? 0,
    bootstrapCompleted: Boolean(bootstrap?.completed_at),
    ownerEmailMasked: maskEmail(ownerEmail),
    ownerUserIdPrefix: owner?.id?.slice(0, 8) || null,
    productionRefMasked: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    usedRefMasked: maskProjectRef(usedRef),
    rolesCount: 6,
    permissionsCount: 41,
  };

  check.safeForBootstrap =
    check.productionProjectRefMatches &&
    check.stagingProjectRejected &&
    check.ownerExists &&
    check.ownerProfileExists &&
    check.ownerEmailConfirmed &&
    check.ownerNotTestLocal &&
    check.ownerNotStagingAccount &&
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

function waitForServer(port, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok || res.status < 500) return resolve(true);
      } catch {
        /* retry */
      }
      if (Date.now() - start > timeoutMs) return reject(new Error("Server startup timeout"));
      setTimeout(tick, 2000);
    };
    tick();
  });
}

function scanSecrets(obj) {
  return JSON.stringify(obj || {}).match(/secret|token|password|Bearer|cookie/i) !== null;
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
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, admin_role")
    .eq("id", ownerId)
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

  return {
    assignment: assignment
      ? {
          role_id: assignment.role_id,
          organization_id: assignment.organization_id,
          organizationMatchesDefault: assignment.organization_id === IAM_DEFAULT_ORGANIZATION_ID,
          granted_by_prefix: assignment.granted_by?.slice(0, 8) + "...",
          granted_by_is_owner: assignment.granted_by === ownerId,
          granted_at_set: Boolean(assignment.granted_at),
        }
      : null,
    activeAssignmentsCount,
    superAdminCount,
    bootstrapCompleted: Boolean(bootstrap?.completed_at),
    completedByPrefix: bootstrap?.completed_by?.slice(0, 8) + "..." || null,
    completedAtUnchanged: completedAtBefore ? bootstrap?.completed_at === completedAtBefore : null,
    profileRole: profile?.role || null,
    profileAdminRole: profile?.admin_role || null,
    auditEventFound: (auditRows || []).some((r) => r.action === "iam.bootstrap"),
    securitySuccessFound: (secRows || []).some((r) => r.event_type === "iam.bootstrap.completed"),
    secretLeakageInAudit: scanSecrets(auditRows),
    secretLeakageInSecurity: scanSecrets(secRows),
  };
}

async function legacyAdminInventory(supabase) {
  const { data: roleAdmins } = await supabase
    .from("profiles")
    .select("id, email, role, admin_role")
    .eq("role", "admin");
  const { data: adminRoleOnly } = await supabase
    .from("profiles")
    .select("id, email, role, admin_role")
    .not("admin_role", "is", null)
    .neq("role", "admin");

  return {
    roleAdminCount: (roleAdmins || []).length,
    adminRoleOnlyCount: (adminRoleOnly || []).length,
    roleAdmins: (roleAdmins || []).map((p) => ({
      emailMasked: maskEmail(p.email),
      idPrefix: p.id?.slice(0, 8),
      adminRole: p.admin_role,
      isTestLocal: String(p.email || "").includes("@test.local"),
    })),
    adminRoleOnly: (adminRoleOnly || []).map((p) => ({
      emailMasked: maskEmail(p.email),
      idPrefix: p.id?.slice(0, 8),
      role: p.role,
      adminRole: p.admin_role,
    })),
  };
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const report = { ok: false, verdict: "BOOTSTRAP FAILED", phases: {} };

  report.phases.envFile = validateEnvFile();
  if (!report.phases.envFile.bootstrapFileExists) {
    report.error = "Missing .env.production.bootstrap.local";
    return finish(report, ts);
  }

  const env = loadIsolatedEnv();
  const { check, supabase, owner, profile } = await safetyCheck(env);
  report.phases.safetyCheck = check;

  writeFileSync(
    join(ARTIFACT_DIR, `production-bootstrap-pre-${ts}.json`),
    JSON.stringify(
      {
        phase: "production-bootstrap-pre",
        timestamp: ts,
        projectRefMasked: check.productionRefMasked,
        ownerEmailMasked: check.ownerEmailMasked,
        ownerUserIdPrefix: check.ownerUserIdPrefix,
        ownerProfileExists: check.ownerProfileExists,
        ownerConfirmed: check.ownerEmailConfirmed,
        profileRole: check.profileRole,
        profileAdminRole: check.profileAdminRole,
        activeAssignmentsCount: check.activeAssignmentsCount,
        superAdminCount: check.superAdminCount,
        bootstrapCompleted: check.bootstrapCompleted,
        rolesCount: check.rolesCount,
        permissionsCount: check.permissionsCount,
        iamFlags: { IAM_DB: "local-session-true", IAM_API: false, IAM_UI: false, IAM_RLS: false },
        health: { note: "pre-bootstrap" },
      },
      null,
      2
    )
  );

  if (!check.safeForBootstrap) {
    report.error = "safeForBootstrap=false — aborted before mutation";
    return finish(report, ts);
  }

  const dev = spawn("npm", ["run", "dev", "--", "-p", String(DEV_PORT)], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let devLog = "";
  const appendLog = (d) => {
    devLog += d.toString();
    if (devLog.length > 12000) devLog = devLog.slice(-12000);
  };
  dev.stdout?.on("data", appendLog);
  dev.stderr?.on("data", appendLog);

  try {
    await waitForServer(DEV_PORT);
    const base = `http://127.0.0.1:${DEV_PORT}`;

    const loginRes = await httpJson(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: env.IAM_OWNER_EMAIL,
        password: env.PRODUCTION_OWNER_PASSWORD,
      }),
    });

    report.phases.login = {
      status: loginRes.status,
      success: loginRes.body?.success === true,
      hasUser: Boolean(loginRes.body?.user?.id),
    };

    if (!report.phases.login.success) {
      report.error = "Login failed";
      return finish(report, ts, dev);
    }

    const setCookie = loginRes.headers.getSetCookie?.() || [];
    const accessCookie = extractCookie(setCookie, "hc_access_token");
    const cookieHeader = accessCookie ? `hc_access_token=${accessCookie}` : "";

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

    report.phases.bootstrap = {
      status: bootstrapRes.status,
      success: bootstrapRes.body?.success === true,
      roleId: bootstrapRes.body?.roleId || null,
      error: bootstrapRes.body?.error || null,
      responseHasSecrets: scanSecrets(bootstrapRes.body),
    };

    if (bootstrapRes.status !== 200 || !report.phases.bootstrap.success) {
      report.error = "Bootstrap POST failed";
      return finish(report, ts, dev);
    }

    const dbAfter = await verifyDbState(supabase, owner.id);
    report.phases.dbAfterBootstrap = dbAfter;

    const completedAt = (
      await supabase.from("iam_bootstrap_state").select("completed_at").eq("id", true).maybeSingle()
    ).data?.completed_at;

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
      hasSecrets: scanSecrets(meAdmin.body),
    };

    const meUnauth = await httpJson(`${base}/api/iam/me`);
    report.phases.meUnauth = { status: meUnauth.status };

    const dryRun = await httpJson(`${base}/api/iam/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader },
      body: JSON.stringify({ action: "dry_run_backfill", confirm: "DRY_RUN_BACKFILL" }),
    });

    const dryReport = dryRun.body?.report || {};
    report.phases.backfillDryRun = {
      status: dryRun.status,
      dryRun: dryRun.body?.dryRun,
      usersFound: dryReport.usersFound,
      proposedCount: (dryReport.proposed || []).length,
      proposed: (dryReport.proposed || []).map((p) => ({
        emailMasked: maskEmail(p.email),
        userIdPrefix: String(p.userId || "").slice(0, 8),
        legacyAdminRole: p.legacyAdminRole,
        proposedRole: p.proposedRole,
        isTestLocal: String(p.email || "").includes("@test.local"),
      })),
      duplicateAssignments: (dryReport.duplicateAssignments || []).map((d) => ({
        userIdPrefix: String(d.userId || "").slice(0, 8),
        existingRole: d.existingRole,
        proposedRole: d.proposedRole,
      })),
      proposedSuperAdminCount: dryReport.proposedSuperAdminCount,
      fallbackEmailsWithoutUser: dryReport.fallbackEmailsWithoutUser || [],
      ownerExcludedViaDuplicate: (dryReport.duplicateAssignments || []).some(
        (d) => d.existingRole === "super_admin"
      ),
    };

    report.phases.legacyInventory = await legacyAdminInventory(supabase);

    const prodHealth = await httpJson("https://www.hasanchartworld.com/api/health");
    report.phases.productionHealth = {
      status: prodHealth.body?.status,
      readiness: prodHealth.body?.readiness,
    };

    report.secretLeakage =
      dbAfter.secretLeakageInAudit ||
      dbAfter.secretLeakageInSecurity ||
      report.phases.meAdmin.hasSecrets ||
      report.phases.bootstrap.responseHasSecrets ||
      /IAM_BOOTSTRAP_SECRET|PRODUCTION_OWNER_PASSWORD/i.test(devLog);

    const testLocalProposed = (dryReport.proposed || []).some((p) =>
      String(p.email || "").includes("@test.local")
    );
    report.phases.backfillDryRun.testLocalAutoProposed = testLocalProposed;

    report.ok =
      report.phases.bootstrap.success &&
      dbAfter.activeAssignmentsCount === 1 &&
      dbAfter.superAdminCount === 1 &&
      dbAfter.bootstrapCompleted &&
      dbAfter.assignment?.role_id === "super_admin" &&
      dbAfter.assignment?.organizationMatchesDefault &&
      dbAfter.profileRole === "admin" &&
      replay.status === 410 &&
      noSession.status === 401 &&
      [401, 403].includes(noToken.status) &&
      badToken.status === 401 &&
      report.phases.meAdmin.isAdmin === true &&
      report.phases.meAdmin.hasIamManage === true &&
      !report.secretLeakage;

    report.verdict = report.ok ? "BOOTSTRAP VALIDATED" : "BOOTSTRAP FAILED";
    report.backfillSafe =
      report.ok &&
      !testLocalProposed &&
      report.phases.backfillDryRun.status === 200
        ? "REVIEW_REQUIRED"
        : "NOT_SAFE";

    return finish(report, ts, dev);
  } catch (err) {
    report.error = err.message;
    return finish(report, ts, dev);
  }
}

function finish(report, ts, dev) {
  if (dev && !dev.killed) {
    dev.kill("SIGTERM");
    setTimeout(() => {
      try {
        dev.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 3000);
  }
  const path = join(ARTIFACT_DIR, `production-bootstrap-post-${ts}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  const summary = {
    verdict: report.verdict,
    ok: report.ok,
    error: report.error || null,
    artifact: path,
    bootstrapStatus: report.phases?.bootstrap?.status,
    assignments: report.phases?.dbAfterBootstrap?.activeAssignmentsCount,
    replayStatus: report.phases?.abuse?.replay?.status,
    dryRunProposed: report.phases?.backfillDryRun?.proposedCount,
    testLocalProposed: report.phases?.backfillDryRun?.testLocalAutoProposed,
    secretLeakage: report.secretLeakage,
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ verdict: "BOOTSTRAP FAILED", error: e.message }));
  process.exit(1);
});
