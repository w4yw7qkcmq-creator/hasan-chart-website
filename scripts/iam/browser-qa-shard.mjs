#!/usr/bin/env node
/**
 * IAM Browser QA — sharded runner (≤3 min per shard).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { filterCredentialMutationTargets } from "../../lib/staging-owner-guard.js";
import {
  ADMIN_HUB_QUICK_NAV_ITEMS,
  filterAdminNavByPermission,
} from "../../app/(app)/admin/components/admin-hub-config.js";
import {
  DEV_PORT,
  PAGE_READY_MS,
  loadEnv,
  assertStagingOnly,
  ensurePortReady,
  waitForServer,
  startDevServer,
  stopDevServer,
  bootstrapSession,
  gotoAndWait,
  waitForPageReady,
  attachPageObservers,
  pageChecks,
  fetchMe,
  navFromPermissions,
  scanSecrets,
  setTheme,
  writeReport,
  envMeta,
  getPidsOnPort,
  sleep,
  loginViaSupabase as loginContext,
} from "./browser-qa-harness.mjs";
import {
  loadManifest,
  saveManifest,
  markShard,
  importMonolithicArtifact,
  MANIFEST_PATH,
  ARTIFACT_DIR,
} from "./browser-qa-manifest.mjs";

const ROOT = process.cwd();
const SHARD_ARG = process.argv.find((a) => a.startsWith("--shard="));
const SHARD = SHARD_ARG?.split("=")[1];
const SHARD_TIMEOUTS = {
  "roles-core": 180000,
  "roles-remaining": 180000,
  "direct-urls": 240000,
  "responsive-theme": 180000,
  a11y: 180000,
};
const SHARD_TOTAL_MS = SHARD_TIMEOUTS[SHARD] || 180000;
const SHARD_PAGE_MS = 6000;
const TEST_DOMAIN = "staging-hcw.test";

function getTestPassword(env) {
  const password = env.STAGING_IAM_TEST_PASSWORD || process.env.STAGING_IAM_TEST_PASSWORD;
  if (!password) {
    throw new Error("Missing STAGING_IAM_TEST_PASSWORD (set in .env.staging.local for browser QA shards)");
  }
  return password;
}
const AXE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js";

const VIEWPORTS = [
  { name: "375x812", width: 375, height: 812 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
];

const VALID_SHARDS = ["roles-core", "roles-remaining", "direct-urls", "responsive-theme", "a11y"];

const ROLE_CORE = [
  { role: "super_admin", email: () => `iam-super-admin@${TEST_DOMAIN}`, expectAdminHub: true, expectFinance: true, expectIam: true, expectNews: true, expectSubsManage: true },
  { role: "admin", email: () => `iam-test-admin@${TEST_DOMAIN}`, expectAdminHub: true, expectFinance: true, expectIam: true, expectSubsManage: true },
  { role: "support", email: () => `iam-test-support@${TEST_DOMAIN}`, expectAdminHub: true, expectFinance: false, expectIam: false, expectSubsManage: true },
  { role: "accountant", email: () => `iam-test-accountant@${TEST_DOMAIN}`, expectAdminHub: true, expectFinance: true, expectIam: false, expectSubsManage: false },
  {
    role: "analyst",
    email: () => `iam-test-analyst@${TEST_DOMAIN}`,
    expectAdminHub: true,
    expectFinance: false,
    expectIam: false,
    expectSubsManage: false,
    expectSubsRead: true,
    expectAnalysisNav: true,
    expectSubsManageActions: false,
  },
  { role: "news_editor", email: () => `iam-test-news-editor@${TEST_DOMAIN}`, expectAdminHub: true, expectNews: true, expectIam: false, expectFinance: false, expectSubsManage: false },
];

const ROLE_REMAINING = [
  {
    role: "subscription_manager",
    email: () => `iam-test-subscription-manager@${TEST_DOMAIN}`,
    expectAdminHub: true,
    expectSubsManage: true,
    expectIam: false,
    expectFinance: false,
    expectUsers: false,
    expectNews: false,
    expectAnalysis: false,
    expectPartners: false,
  },
  { role: "normal", email: () => `iam-test-normal-user@${TEST_DOMAIN}`, expectForbidden: true, expectedIsAdmin: false },
];

function shardArtifactPath(id) {
  return join(ARTIFACT_DIR, `browser-qa-shard-${id}.json`);
}

async function prepareContext(browser, viewport, report) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  attachPageObservers(page, report);
  return { context, page };
}

async function resetTestPasswords(env) {
  const sb = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  for (const email of filterCredentialMutationTargets(
    [
      `iam-super-admin@${TEST_DOMAIN}`,
      `iam-test-admin@${TEST_DOMAIN}`,
      `iam-test-support@${TEST_DOMAIN}`,
      `iam-test-accountant@${TEST_DOMAIN}`,
      `iam-test-analyst@${TEST_DOMAIN}`,
      `iam-test-news-editor@${TEST_DOMAIN}`,
      `iam-test-subscription-manager@${TEST_DOMAIN}`,
      `iam-test-normal-user@${TEST_DOMAIN}`,
    ],
    env
  )) {
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    const testPassword = getTestPassword(env);
    if (user) await sb.auth.admin.updateUserById(user.id, { password: testPassword });
  }
  return getTestPassword(env);
}

async function auditAnalystPermissions(env) {
  const sb = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const email = `iam-test-analyst@${TEST_DOMAIN}`;
  const { data: rolePerms } = await sb.from("iam_role_permissions").select("permission_id,effect").eq("role_id", "analyst");
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  let assignments = [];
  let overrides = [];
  if (user) {
    const { data: a } = await sb.from("iam_user_assignments").select("role_id").eq("user_id", user.id);
    assignments = a || [];
    const { data: o } = await sb.from("iam_user_permission_overrides").select("permission_id,effect").eq("user_id", user.id);
    overrides = o || [];
  }
  const allowPerms = (rolePerms || []).filter((p) => p.effect === "allow").map((p) => p.permission_id);
  return {
    email,
    userId: user?.id || null,
    iam_role_permissions: rolePerms || [],
    iam_user_assignments: assignments,
    iam_user_permission_overrides: overrides,
    hasSubscriptionsRead: allowPerms.includes("subscriptions.read"),
    hasSubscriptionsManage: allowPerms.includes("subscriptions.manage"),
    navRequiresManage: "subscriptions.manage",
    conclusion:
      allowPerms.includes("subscriptions.read") && !allowPerms.includes("subscriptions.manage")
        ? "subscriptions.read intentional; nav hidden (manage required)"
        : allowPerms.includes("subscriptions.manage")
          ? "subscriptions.manage present — nav may show"
          : "no subscriptions permissions",
  };
}

function assertRoleSession(role, checks, nav, me) {
  const perms = me.body?.permissions || [];
  let pass = true;
  const failures = [];

  if (role.expectForbidden) {
    if (!checks.hasForbidden || checks.hasAdminHub) { pass = false; failures.push("forbidden"); }
    if (me.body?.isAdmin !== false) { pass = false; failures.push("isAdmin"); }
    return { pass, failures };
  }

  if (!checks.hasAdminHub || checks.hasForbidden || checks.hasSpinner) {
    pass = false;
    failures.push("adminHub");
  }
  if (me.status !== 200 || me.body?.isAdmin !== true) {
    pass = false;
    failures.push("me");
  }
  if (role.expectFinance !== undefined && checks.financeNav !== role.expectFinance) {
    pass = false;
    failures.push(`financeNav=${checks.financeNav}`);
  }
  if (role.expectIam !== undefined && checks.iamNav !== role.expectIam) {
    pass = false;
    failures.push(`iamNav=${checks.iamNav}`);
  }
  if (role.expectNews !== undefined && checks.newsNav !== role.expectNews) {
    pass = false;
    failures.push(`newsNav=${checks.newsNav}`);
  }
  if (role.expectSubsManage !== undefined && checks.subsNav !== role.expectSubsManage) {
    pass = false;
    failures.push(`subsNav=${checks.subsNav}`);
  }
  if (role.expectSubsRead !== undefined && !perms.includes("subscriptions.read")) {
    pass = false;
    failures.push("missing subscriptions.read");
  }
  if (role.expectSubsManageActions !== undefined && checks.subsManageActions !== role.expectSubsManageActions) {
    pass = false;
    failures.push(`subsManageActions=${checks.subsManageActions}`);
  }
  if (role.expectAnalysisNav !== undefined && nav.analysisNav !== role.expectAnalysisNav) {
    pass = false;
    failures.push(`analysisNav=${nav.analysisNav}`);
  }
  if (!checks.dir || checks.dir !== "rtl") {
    pass = false;
    failures.push("rtl");
  }
  if (checks.overflowX) {
    pass = false;
    failures.push("overflowX");
  }

  return { pass, failures };
}

async function runAxe(page) {
  await page.addScriptTag({ url: AXE_CDN });
  return page.evaluate(async () => {
    // @ts-ignore
    if (typeof axe === "undefined") return { error: "axe_not_loaded", violations: [], byImpact: { critical: 0, serious: 0, moderate: 0, minor: 0 } };
    // @ts-ignore
    const results = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "best-practice"] },
    });
    const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    const seriousViolations = [];
    for (const v of results.violations || []) {
      const impact = v.impact || "minor";
      if (byImpact[impact] !== undefined) byImpact[impact] += 1;
      else byImpact.minor += 1;
      if (impact === "serious" || impact === "critical") {
        seriousViolations.push({
          id: v.id,
          impact: v.impact,
          help: v.help,
          helpUrl: v.helpUrl,
          nodeCount: (v.nodes || []).length,
          nodes: (v.nodes || []).slice(0, 2).map((n) => ({
            target: n.target,
            failureSummary: n.failureSummary,
            html: (n.html || "").slice(0, 200),
          })),
        });
      }
    }
    return { byImpact, violationCount: (results.violations || []).length, seriousViolations };
  });
}

async function openOverridesTab(page) {
  const tab = page.locator('button:has-text("Overrides"), button:has-text("تجاوز")').first();
  if (await tab.count()) await tab.click({ timeout: 3000 }).catch(() => null);
  await sleep(400);
}

async function runRolesShard(browser, base, env, roles, report, password) {
  for (const role of roles) {
    if (Date.now() - report.startedAtMs > SHARD_TOTAL_MS) {
      report.aborted = true;
      report.abortReason = "shard_timeout";
      break;
    }
    const sessionStarted = Date.now();
    const email = typeof role.email === "function" ? role.email(env) : role.email;
    const pwd = role.password?.(env) || password;
    const { context, page } = await prepareContext(browser, VIEWPORTS[2], report);
    try {
      await loginContext(context, env, base, email, pwd);
      const boot = await bootstrapSession(page, base, {
        expectedIsAdmin: role.expectedIsAdmin ?? !role.expectForbidden,
        skipWarm: true,
      });
      if (!boot.ok) {
        report.sessions.push({ role: role.role, pass: false, bootstrapError: boot.error, durationMs: Date.now() - sessionStarted });
        continue;
      }
      await gotoAndWait(page, base, "/admin", {
        expectForbidden: role.expectForbidden,
        expectAdminHub: role.expectAdminHub,
        timeoutMs: SHARD_PAGE_MS,
      });
      const checks = await pageChecks(page);
      const me = await fetchMe(page);
      const nav = navFromPermissions(me.body?.permissions);
      const { pass, failures } = assertRoleSession(role, checks, nav, me);
      report.sessions.push({
        role: role.role,
        pass,
        failures,
        checks: { ...checks, meStatus: me.status, isAdmin: me.body?.isAdmin, permissions: me.body?.permissions },
        nav,
        durationMs: Date.now() - sessionStarted,
      });
      if (role.role === "subscription_manager") {
        const can = (p) => (me.body?.permissions || []).includes(p);
        const filtered = filterAdminNavByPermission(ADMIN_HUB_QUICK_NAV_ITEMS, can, { iamUiEnabled: true, isAdmin: true });
        const ids = filtered.map((i) => i.id || i.href);
        report.subscriptionManagerNav = { ids, pass: ids.includes("subscriptions") && !ids.includes("iam") && !ids.includes("users") };
      }
    } finally {
      await context.close();
    }
  }
}

async function runDirectUrlsShard(browser, base, env, report, password) {
  const cases = [
    { role: "support", email: `iam-test-support@${TEST_DOMAIN}`, path: "/admin/financial-center", expectForbidden: true },
    { role: "support", email: `iam-test-support@${TEST_DOMAIN}`, path: "/admin/iam", expectForbidden: true },
    { role: "accountant", email: `iam-test-accountant@${TEST_DOMAIN}`, path: "/admin/iam", expectForbidden: true },
    { role: "accountant", email: `iam-test-accountant@${TEST_DOMAIN}`, path: "/admin/news", expectForbidden: true },
    { role: "analyst", email: `iam-test-analyst@${TEST_DOMAIN}`, path: "/admin/financial-center", expectForbidden: true },
    { role: "analyst", email: `iam-test-analyst@${TEST_DOMAIN}`, path: "/admin/iam", expectForbidden: true },
    { role: "news_editor", email: `iam-test-news-editor@${TEST_DOMAIN}`, path: "/admin/news", expectForbidden: false, expectNews: true },
    { role: "news_editor", email: `iam-test-news-editor@${TEST_DOMAIN}`, path: "/admin/iam", expectForbidden: true },
    { role: "subscription_manager", email: `iam-test-subscription-manager@${TEST_DOMAIN}`, path: "/admin/users", expectForbidden: true },
    { role: "subscription_manager", email: `iam-test-subscription-manager@${TEST_DOMAIN}`, path: "/admin/financial-center", expectForbidden: true },
    { role: "subscription_manager", email: `iam-test-subscription-manager@${TEST_DOMAIN}`, path: "/admin/iam", expectForbidden: true },
    { role: "normal", email: `iam-test-normal-user@${TEST_DOMAIN}`, path: "/admin", expectForbidden: true },
    { role: "normal", email: `iam-test-normal-user@${TEST_DOMAIN}`, path: "/admin/iam", expectForbidden: true },
    { role: "normal", email: `iam-test-normal-user@${TEST_DOMAIN}`, path: "/admin/financial-center", expectForbidden: true },
  ];

  const byEmail = new Map();
  for (const dc of cases) {
    if (!byEmail.has(dc.email)) byEmail.set(dc.email, []);
    byEmail.get(dc.email).push(dc);
  }

  const doneKeys = new Set(
    (report.existingPassed || []).map((d) => `${d.email}|${d.path}`)
  );

  for (const [email, group] of byEmail) {
    if (Date.now() - report.startedAtMs > SHARD_TOTAL_MS) break;
    const pending = group.filter((dc) => !doneKeys.has(`${dc.email}|${dc.path}`));
    if (!pending.length) continue;
    const { context, page } = await prepareContext(browser, VIEWPORTS[2], report);
    try {
      await loginContext(context, env, base, email, password);
      const needsAdmin = pending.some((g) => !g.expectForbidden);
      await bootstrapSession(page, base, {
        expectedIsAdmin: needsAdmin ? true : false,
        skipWarm: true,
      });
      for (const dc of pending) {
        if (Date.now() - report.startedAtMs > SHARD_TOTAL_MS) break;
        await gotoAndWait(page, base, dc.path, {
          expectForbidden: dc.expectForbidden,
          expectNews: dc.expectNews,
          timeoutMs: SHARD_PAGE_MS,
        });
        const checks = await pageChecks(page);
        const me = await fetchMe(page);
        let pass = dc.expectForbidden ? checks.hasForbidden && !checks.hasAdminHub : !checks.hasForbidden;
        if (dc.path === "/admin/news" && !dc.expectForbidden) {
          pass = me.status === 200 && me.body?.isAdmin && !checks.hasForbidden;
        }
        report.directUrlDenial.push({ ...dc, pass, checks: { hasForbidden: checks.hasForbidden, hasAdminHub: checks.hasAdminHub } });
      }
    } finally {
      await context.close();
    }
  }
}

async function runResponsiveThemeShard(browser, base, env, report, password) {
  const paths = ["/admin", "/admin/iam", "/admin/news", "/forbidden"];
  for (const vp of VIEWPORTS) {
    if (Date.now() - report.startedAtMs > SHARD_TOTAL_MS) break;
    const { context, page } = await prepareContext(browser, vp, report);
    try {
      await loginContext(context, env, base, env.IAM_OWNER_EMAIL, env.STAGING_OWNER_PASSWORD);
      await bootstrapSession(page, base, { expectedIsAdmin: true, skipWarm: true });
      await gotoAndWait(page, base, "/admin", { expectAdminHub: true, timeoutMs: SHARD_PAGE_MS });
      const checks = await pageChecks(page);
      report.responsive.push({ viewport: vp.name, path: "/admin", overflowX: checks.overflowX, rtl: checks.dir === "rtl", pass: !checks.overflowX && checks.dir === "rtl" });
    } finally {
      await context.close();
    }
  }
  for (const theme of ["dark", "light"]) {
    const { context, page } = await prepareContext(browser, VIEWPORTS[2], report);
    try {
      await loginContext(context, env, base, env.IAM_OWNER_EMAIL, env.STAGING_OWNER_PASSWORD);
      await bootstrapSession(page, base, { expectedIsAdmin: true, skipWarm: true });
      await gotoAndWait(page, base, "/admin/iam", { expectIam: true, timeoutMs: SHARD_PAGE_MS });
      await setTheme(page, theme);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForPageReady(page, { expectIam: true, timeoutMs: SHARD_PAGE_MS });
      await setTheme(page, theme);
      const persisted = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      const checks = await pageChecks(page);
      report.themes.push({ theme, persisted: persisted === theme, overflowX: checks.overflowX, pass: persisted === theme && !checks.overflowX });
    } finally {
      await context.close();
    }
  }
}

async function runA11yShard(browser, base, env, report, password) {
  const targets = [
    { label: "admin", path: "/admin", email: env.IAM_OWNER_EMAIL, password: env.STAGING_OWNER_PASSWORD, expectAdminHub: true },
    { label: "admin-iam", path: "/admin/iam", email: env.IAM_OWNER_EMAIL, password: env.STAGING_OWNER_PASSWORD, expectIam: true },
    { label: "admin-news", path: "/admin/news", email: `iam-test-news-editor@${TEST_DOMAIN}`, expectNews: true },
    { label: "forbidden", path: "/admin/iam", email: `iam-test-normal-user@${TEST_DOMAIN}`, expectForbidden: true },
  ];
  for (const target of targets) {
    if (Date.now() - report.startedAtMs > SHARD_TOTAL_MS) break;
    const { context, page } = await prepareContext(browser, VIEWPORTS[2], report);
    try {
      await loginContext(context, env, base, target.email, target.password || password);
      await bootstrapSession(page, base, { expectedIsAdmin: target.expectForbidden ? false : true, skipWarm: true });
      await gotoAndWait(page, base, target.path, {
        expectForbidden: target.expectForbidden,
        expectAdminHub: target.expectAdminHub,
        expectNews: target.expectNews,
        expectIam: target.expectIam,
        timeoutMs: SHARD_PAGE_MS,
      });
      report.axe.push({ page: target.label, ...(await runAxe(page)) });
    } finally {
      await context.close();
    }
  }
  const { context, page } = await prepareContext(browser, VIEWPORTS[2], report);
  try {
    await loginContext(context, env, base, env.IAM_OWNER_EMAIL, env.STAGING_OWNER_PASSWORD);
    await bootstrapSession(page, base, { expectedIsAdmin: true, skipWarm: true });
    await gotoAndWait(page, base, "/admin/iam", { expectIam: true, timeoutMs: PAGE_READY_MS });
    await openOverridesTab(page);
    report.axe.push({ page: "iam-overrides", ...(await runAxe(page)) });
  } finally {
    await context.close();
  }
}

async function main() {
  if (!SHARD || !VALID_SHARDS.includes(SHARD)) {
    console.error(`Usage: node browser-qa-shard.mjs --shard=${VALID_SHARDS.join("|")}`);
    process.exit(1);
  }

  const startedAtMs = Date.now();
  const { env } = loadEnv(ROOT);
  const meta = envMeta(env);
  assertStagingOnly(env);

  let manifest = loadManifest(meta);
  manifest = importMonolithicArtifact(manifest);

  if (SHARD === "roles-core") {
    manifest.analystAudit = await auditAnalystPermissions(env);
  }

  markShard(manifest, SHARD, { status: "running", startedAt: new Date(startedAtMs).toISOString() });

  const report = {
    shard: SHARD,
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
    environment: { ...meta, port: DEV_PORT, flags: manifest.iamFlags },
    sessions: [],
    directUrlDenial: [],
    responsive: [],
    themes: [],
    axe: [],
    consoleErrors: [],
    networkFailures: [],
    secretScan: { leaks: [] },
    ok: false,
    verdict: "SHARD FAILED",
  };

  mkdirSync(ARTIFACT_DIR, { recursive: true });
  await ensurePortReady(DEV_PORT);
  const password = await resetTestPasswords(env);
  const dev = startDevServer(ROOT, env, DEV_PORT);

  try {
    await waitForServer(DEV_PORT);
    const browser = await chromium.launch({ headless: true });
    const base = `http://127.0.0.1:${DEV_PORT}`;

    if (SHARD === "roles-core") {
      report.analystAudit = manifest.analystAudit;
      await runRolesShard(browser, base, env, ROLE_CORE, report, password);
    } else if (SHARD === "roles-remaining") {
      await runRolesShard(browser, base, env, ROLE_REMAINING, report, password);
    } else if (SHARD === "direct-urls") {
      const priorPath = shardArtifactPath(SHARD);
      try {
        const { readFileSync, existsSync } = await import("node:fs");
        if (existsSync(priorPath)) {
          const prior = JSON.parse(readFileSync(priorPath, "utf8"));
          report.existingPassed = (prior.directUrlDenial || []).filter((d) => d.pass);
          report.directUrlDenial.push(...(prior.directUrlDenial || []).filter((d) => d.pass));
        }
      } catch {
        /* fresh run */
      }
      await runDirectUrlsShard(browser, base, env, report, password);
    } else if (SHARD === "responsive-theme") {
      await runResponsiveThemeShard(browser, base, env, report, password);
    } else if (SHARD === "a11y") {
      await runA11yShard(browser, base, env, report, password);
    }

    await browser.close();
    report.durationMs = Date.now() - startedAtMs;
    report.secretScan.leaks = [...new Set(report.secretScan.leaks)];
    report.consoleErrors = [...new Set(report.consoleErrors)];

    const axeCritical = report.axe.reduce((n, a) => n + (a.byImpact?.critical || 0), 0);
    const axeSerious = report.axe.reduce((n, a) => n + (a.byImpact?.serious || 0), 0);

    if (SHARD === "roles-core" || SHARD === "roles-remaining") {
      report.ok = report.sessions.every((s) => s.pass) && report.durationMs <= SHARD_TOTAL_MS;
    } else if (SHARD === "direct-urls") {
      report.ok =
        report.directUrlDenial.length >= 14 &&
        report.directUrlDenial.every((d) => d.pass) &&
        report.durationMs <= SHARD_TOTAL_MS;
    } else if (SHARD === "responsive-theme") {
      report.ok =
        report.responsive.every((r) => r.pass) &&
        report.themes.every((t) => t.pass) &&
        report.durationMs <= SHARD_TOTAL_MS;
    } else if (SHARD === "a11y") {
      report.ok = axeCritical === 0 && axeSerious === 0 && report.durationMs <= SHARD_TOTAL_MS;
    }

    report.verdict = report.ok ? "SHARD PASS" : "SHARD FAILED";
    report.processCleanup = { portPidsAfter: getPidsOnPort(DEV_PORT), orphans: getPidsOnPort(DEV_PORT) };

    const artifactPath = shardArtifactPath(SHARD);
    writeReport(artifactPath, report);

    markShard(manifest, SHARD, {
      status: report.ok ? "pass" : "fail",
      finishedAt: new Date().toISOString(),
      durationMs: report.durationMs,
      artifact: artifactPath,
      failedAssertions: report.sessions?.filter((s) => !s.pass).flatMap((s) => s.failures || []) || [],
      secretLeakCount: report.secretScan.leaks.length,
      processCleanup: report.processCleanup,
    });
    if (manifest.analystAudit) saveManifest(manifest);

    console.log(JSON.stringify({ shard: SHARD, verdict: report.verdict, ok: report.ok, durationMs: report.durationMs, artifact: artifactPath }, null, 2));
    process.exit(report.ok ? 0 : 1);
  } finally {
    await stopDevServer(dev);
    await sleep(400);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
