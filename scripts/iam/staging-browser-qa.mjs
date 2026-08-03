#!/usr/bin/env node
/**
 * IAM staging browser QA — full matrix (--full) or limited smoke (--smoke).
 * Harness-only: no business logic changes.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import {
  filterCredentialMutationTargets,
} from "../../lib/staging-owner-guard.js";
import {
  DEV_PORT,
  SESSION_BOOTSTRAP_MS,
  PAGE_READY_MS,
  SMOKE_TOTAL_MS,
  FULL_QA_TOTAL_MS,
  loadEnv,
  assertStagingOnly,
  ensurePortReady,
  waitForServer,
  startDevServer,
  stopDevServer,
  loginViaSupabase,
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
} from "./browser-qa-harness.mjs";

const ROOT = process.cwd();
const SMOKE_MODE = process.argv.includes("--smoke");
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts/ui-screenshots");
const SMOKE_DIR = join(ROOT, "scripts/iam/.artifacts/smoke");
const REPORT_PATH = join(
  ROOT,
  SMOKE_MODE
    ? "scripts/iam/.artifacts/staging-browser-qa-smoke.json"
    : "scripts/iam/.artifacts/staging-browser-qa.json"
);
const TEST_DOMAIN = "staging-hcw.test";
const AXE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js";

const VIEWPORTS = [
  { name: "375x812", width: 375, height: 812 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
];

async function capture(page, dir, filename) {
  const path = join(dir, filename);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function runAxe(page) {
  await page.addScriptTag({ url: AXE_CDN });
  return page.evaluate(async () => {
    // @ts-ignore
    if (typeof axe === "undefined") return { error: "axe_not_loaded", violations: [] };
    // @ts-ignore
    const results = await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "best-practice"] },
    });
    const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
    for (const v of results.violations || []) {
      const impact = v.impact || "minor";
      if (byImpact[impact] !== undefined) byImpact[impact] += 1;
      else byImpact.minor += 1;
    }
    return {
      byImpact,
      violations: (results.violations || []).map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes?.length || 0,
      })),
    };
  });
}

async function openOverridesTab(page) {
  const selectors = [
    'button:has-text("الاستثناءات")',
    'button:has-text("Overrides")',
    ".admin-iam-tabs button",
  ];
  for (const sel of selectors) {
    try {
      const btn = page.locator(sel).first();
      if (await btn.count()) {
        await btn.click({ timeout: 3000 });
        await sleep(400);
        return true;
      }
    } catch {
      /* try next */
    }
  }
  return false;
}

async function prepareContext(browser, viewport, report) {
  const context = await browser.newContext({ locale: "ar-SA" });
  const page = await context.newPage();
  attachPageObservers(page, report);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  return { context, page };
}

async function loginContext(context, env, base, email, password) {
  await loginViaSupabase(context, env, base, email, password);
}

async function resetTestPasswords(env) {
  const sb = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const testPassword = crypto.randomBytes(16).toString("base64url");
  for (const email of filterCredentialMutationTargets(
    [
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
    const user = list?.users?.find((u) => u.email === email);
    if (user) {
      await sb.auth.admin.updateUserById(user.id, { password: testPassword, email_confirm: true });
    }
  }
  return testPassword;
}

async function runSmoke(env) {
  const startedAt = Date.now();
  mkdirSync(SMOKE_DIR, { recursive: true });
  const { stagingRef, productionRef } = envMeta(env);
  assertStagingOnly(env);

  const report = {
    mode: "smoke",
    verdict: "SMOKE FAILED",
    ok: false,
    startedAt: new Date(startedAt).toISOString(),
    environment: {
      stagingRef,
      productionRef,
      productionTouched: false,
      port: DEV_PORT,
      flags: { IAM_DB: true, IAM_API: true, IAM_UI: true, IAM_RLS: false },
    },
    cases: [],
    screenshots: [],
    consoleErrors: [],
    networkFailures: [],
    secretScan: { leaks: [] },
    processCleanup: { portPidsBefore: [], portPidsAfter: [], killedPids: [] },
    durationMs: 0,
  };

  let browser = null;
  let dev = null;

  try {
    report.processCleanup.killedPids = await ensurePortReady(DEV_PORT);
    report.processCleanup.portPidsBefore = getPidsOnPort(DEV_PORT);

    dev = startDevServer(ROOT, env, DEV_PORT);
    await waitForServer(DEV_PORT);
    browser = await chromium.launch({ headless: true });
    const base = `http://127.0.0.1:${DEV_PORT}`;
    const viewport = { width: 1440, height: 900 };
    const testPassword = await resetTestPasswords(env);

    const cases = [
      {
        id: "super_admin",
        email: env.IAM_OWNER_EMAIL,
        password: env.STAGING_OWNER_PASSWORD,
        expectedIsAdmin: true,
        steps: [
          {
            path: "/admin",
            expectAdminHub: true,
            screenshot: "smoke-super-admin.png",
            assert: (checks, me) =>
              me.status === 200 &&
              me.body?.isAdmin === true &&
              checks.hasAdminHub &&
              !checks.hasSpinner &&
              !checks.hasForbidden,
          },
          {
            path: "/admin/iam",
            expectIam: true,
            assert: (checks, me) =>
              me.status === 200 && me.body?.isAdmin === true && !checks.hasForbidden,
          },
        ],
      },
      {
        id: "news_editor",
        email: `iam-test-news-editor@${TEST_DOMAIN}`,
        password: testPassword,
        expectedIsAdmin: true,
        steps: [
          {
            path: "/admin/news",
            expectNews: true,
            screenshot: "smoke-news-editor.png",
            assert: (checks, me) =>
              me.status === 200 && me.body?.isAdmin === true && !checks.hasForbidden,
          },
          {
            path: "/admin/iam",
            expectForbidden: true,
            assert: (checks, me) => checks.hasForbidden && !checks.hasAdminHub && me.body?.isAdmin === true,
          },
        ],
      },
      {
        id: "normal",
        email: `iam-test-normal-user@${TEST_DOMAIN}`,
        password: testPassword,
        expectedIsAdmin: false,
        steps: [
          {
            path: "/admin",
            expectForbidden: true,
            screenshot: "smoke-normal-forbidden.png",
            assert: (checks, me) =>
              checks.hasForbidden && !checks.hasAdminHub && me.body?.isAdmin === false,
          },
        ],
      },
    ];

    for (const testCase of cases) {
      const caseStarted = Date.now();
      const caseResult = { role: testCase.id, steps: [], pass: true, durationMs: 0 };

      const { context, page } = await prepareContext(browser, viewport, report);
      try {
        await loginContext(context, env, base, testCase.email, testCase.password);
        const boot = await bootstrapSession(page, base, {
          expectedIsAdmin: testCase.expectedIsAdmin,
        });
        if (!boot.ok) {
          caseResult.pass = false;
          caseResult.bootstrapError = boot.error;
          caseResult.steps.push({ bootstrap: boot });
          report.cases.push(caseResult);
          await context.close();
          continue;
        }

        await setTheme(page, "light");

        for (const step of testCase.steps) {
          const stepStarted = Date.now();
          let ready = { ok: false, error: "not_started" };
          try {
            ready = await gotoAndWait(page, base, step.path, {
              expectForbidden: step.expectForbidden,
              expectAdminHub: step.expectAdminHub,
              expectNews: step.expectNews,
              expectIam: step.expectIam,
            });
          } catch (err) {
            ready = { ok: false, error: err?.message || "navigation_failed" };
          }

          const checks = ready.checks || (await pageChecks(page));
          const me = await fetchMe(page);
          const pass = ready.ok && step.assert(checks, me);
          if (!pass) caseResult.pass = false;

          const stepResult = {
            path: step.path,
            pass,
            ready: ready.ok,
            readyError: ready.error || null,
            durationMs: Date.now() - stepStarted,
            checks: { ...checks, meStatus: me.status, isAdmin: me.body?.isAdmin },
          };
          caseResult.steps.push(stepResult);

          if (step.screenshot && ready.ok) {
            const body = await page.content();
            report.secretScan.leaks.push(...scanSecrets(body));
            const shotPath = await capture(page, SMOKE_DIR, step.screenshot);
            report.screenshots.push(shotPath);
          }
        }
      } finally {
        await context.close();
      }

      caseResult.durationMs = Date.now() - caseStarted;
      report.cases.push(caseResult);
    }

    report.durationMs = Date.now() - startedAt;
    report.secretScan.leaks = [...new Set(report.secretScan.leaks)];
    report.consoleErrors = [...new Set(report.consoleErrors)];
    report.ok =
      report.durationMs <= SMOKE_TOTAL_MS &&
      report.cases.every((c) => c.pass) &&
      report.secretScan.leaks.length === 0 &&
      stagingRef !== productionRef;

    report.verdict = report.ok ? "SMOKE PASS" : "SMOKE FAILED";
    report.devLogTail = dev.getLogTail?.() || "";
    writeReport(REPORT_PATH, report);

    console.log(
      JSON.stringify(
        {
          verdict: report.verdict,
          ok: report.ok,
          durationMs: report.durationMs,
          cases: report.cases.map((c) => ({ role: c.role, pass: c.pass })),
          screenshots: report.screenshots,
          artifact: REPORT_PATH,
        },
        null,
        2
      )
    );
    process.exit(report.ok ? 0 : 1);
  } catch (err) {
    report.fatalError = err?.message || String(err);
    report.durationMs = Date.now() - startedAt;
    report.verdict = "SMOKE FAILED";
    report.ok = false;
    writeReport(REPORT_PATH, report);
    console.error(err);
    process.exit(1);
  } finally {
    if (browser) await browser.close().catch(() => null);
    if (dev) await stopDevServer(dev);
    await sleep(500);
    report.processCleanup.portPidsAfter = getPidsOnPort(DEV_PORT);
    if (report.processCleanup.portPidsAfter.length) {
      report.processCleanup.orphans = report.processCleanup.portPidsAfter;
    }
  }
}

async function runFull(env) {
  const startedAt = Date.now();
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const { stagingRef, productionRef } = envMeta(env);
  assertStagingOnly(env);

  const deadline = () => Date.now() - startedAt > FULL_QA_TOTAL_MS;
  const abortIfDeadline = (report, reason) => {
    if (!deadline()) return false;
    report.aborted = true;
    report.abortReason = reason;
    report.durationMs = Date.now() - startedAt;
    report.verdict = "BROWSER QA FAILED";
    report.ok = false;
    writeReport(REPORT_PATH, report);
    console.error(JSON.stringify({ aborted: true, reason, durationMs: report.durationMs }));
    process.exit(1);
  };

  const report = {
    mode: "full",
    verdict: "BROWSER QA FAILED",
    ok: false,
    startedAt: new Date(startedAt).toISOString(),
    durationMs: 0,
    environment: {
      stagingRef,
      productionRef,
      productionTouched: false,
      port: DEV_PORT,
      flags: { IAM_DB: true, IAM_API: true, IAM_UI: true, IAM_RLS: false },
    },
    playwright: { chromium: false },
    sessions: [],
    directUrlDenial: [],
    responsive: [],
    themes: [],
    axe: [],
    consoleErrors: [],
    networkFailures: [],
    secretScan: { leaks: [] },
    screenshots: [],
    assertions: {},
  };

  const testPassword = await resetTestPasswords(env);
  await ensurePortReady(DEV_PORT);
  const dev = startDevServer(ROOT, env, DEV_PORT);

  try {
    await waitForServer(DEV_PORT);
    const browser = await chromium.launch({ headless: true });
    report.playwright.chromium = true;
    const base = `http://127.0.0.1:${DEV_PORT}`;

    const roleSessions = [
      {
        role: "super_admin",
        email: env.IAM_OWNER_EMAIL,
        password: env.STAGING_OWNER_PASSWORD,
        expectAdminHub: true,
        expectFinance: true,
        expectIam: true,
        expectNews: true,
        expectedIsAdmin: true,
      },
      {
        role: "admin",
        email: `iam-test-admin@${TEST_DOMAIN}`,
        expectAdminHub: true,
        expectFinance: true,
        expectIam: true,
        expectSubs: true,
        expectedIsAdmin: true,
      },
      {
        role: "support",
        email: `iam-test-support@${TEST_DOMAIN}`,
        expectAdminHub: true,
        expectFinance: false,
        expectIam: false,
        expectedIsAdmin: true,
      },
      {
        role: "accountant",
        email: `iam-test-accountant@${TEST_DOMAIN}`,
        expectAdminHub: true,
        expectFinance: true,
        expectIam: false,
        expectedIsAdmin: true,
      },
      {
        role: "analyst",
        email: `iam-test-analyst@${TEST_DOMAIN}`,
        expectAdminHub: true,
        expectFinance: false,
        expectIam: false,
        expectSubs: false,
        expectPerms: ["analysis.read", "subscriptions.read"],
        expectedIsAdmin: true,
      },
      {
        role: "news_editor",
        email: `iam-test-news-editor@${TEST_DOMAIN}`,
        expectAdminHub: true,
        expectNews: true,
        expectIam: false,
        expectFinance: false,
        expectedIsAdmin: true,
      },
      {
        role: "subscription_manager",
        email: `iam-test-subscription-manager@${TEST_DOMAIN}`,
        expectAdminHub: true,
        expectSubs: true,
        expectIam: false,
        expectFinance: false,
        expectedIsAdmin: true,
      },
      {
        role: "normal",
        email: `iam-test-normal-user@${TEST_DOMAIN}`,
        expectForbidden: true,
        expectedIsAdmin: false,
      },
    ];

    const shots = [
      { file: "01-admin-super.png", email: env.IAM_OWNER_EMAIL, password: env.STAGING_OWNER_PASSWORD, path: "/admin", expectAdminHub: true, theme: "dark" },
      { file: "02-admin-admin.png", email: `iam-test-admin@${TEST_DOMAIN}`, path: "/admin", expectAdminHub: true, theme: "dark" },
      { file: "03-admin-support.png", email: `iam-test-support@${TEST_DOMAIN}`, path: "/admin", expectAdminHub: true, theme: "dark" },
      { file: "04-admin-accountant.png", email: `iam-test-accountant@${TEST_DOMAIN}`, path: "/admin", expectAdminHub: true, theme: "dark" },
      { file: "05-admin-analyst.png", email: `iam-test-analyst@${TEST_DOMAIN}`, path: "/admin", expectAdminHub: true, theme: "dark" },
      { file: "06-admin-news-editor.png", email: `iam-test-news-editor@${TEST_DOMAIN}`, path: "/admin", expectAdminHub: true, theme: "dark" },
      { file: "07-admin-subscription-manager.png", email: `iam-test-subscription-manager@${TEST_DOMAIN}`, path: "/admin", expectAdminHub: true, theme: "dark" },
      { file: "08-iam-users.png", email: env.IAM_OWNER_EMAIL, password: env.STAGING_OWNER_PASSWORD, path: "/admin/iam", expectIam: true, theme: "dark" },
      { file: "09-iam-overrides.png", email: env.IAM_OWNER_EMAIL, password: env.STAGING_OWNER_PASSWORD, path: "/admin/iam", expectIam: true, overrides: true, theme: "dark" },
      { file: "10-news-admin.png", email: `iam-test-news-editor@${TEST_DOMAIN}`, path: "/admin/news", expectNews: true, theme: "dark" },
      { file: "11-forbidden-normal.png", email: `iam-test-normal-user@${TEST_DOMAIN}`, path: "/admin/iam", expectForbidden: true, theme: "dark" },
      { file: "12-mobile-admin.png", email: env.IAM_OWNER_EMAIL, password: env.STAGING_OWNER_PASSWORD, path: "/admin", expectAdminHub: true, width: 375, height: 812, theme: "dark" },
      { file: "13-tablet-iam.png", email: env.IAM_OWNER_EMAIL, password: env.STAGING_OWNER_PASSWORD, path: "/admin/iam", expectIam: true, width: 768, height: 1024, theme: "light" },
      { file: "14-dark-admin.png", email: env.IAM_OWNER_EMAIL, password: env.STAGING_OWNER_PASSWORD, path: "/admin", expectAdminHub: true, theme: "dark" },
    ];

    for (const shot of shots) {
      if (abortIfDeadline(report, "screenshots")) return;
      const { context, page } = await prepareContext(
        browser,
        { width: shot.width || 1440, height: shot.height || 900 },
        report
      );
      await loginContext(context, env, base, shot.email, shot.password || testPassword);
      await bootstrapSession(page, base, {
        expectedIsAdmin: shot.expectForbidden ? false : true,
      });
      await gotoAndWait(page, base, shot.path, {
        expectForbidden: shot.expectForbidden,
        expectAdminHub: shot.expectAdminHub,
        expectNews: shot.expectNews,
        expectIam: shot.expectIam,
        timeoutMs: PAGE_READY_MS,
      });
      await setTheme(page, shot.theme || "dark");
      if (shot.overrides) await openOverridesTab(page);
      const body = await page.content();
      report.secretScan.leaks.push(...scanSecrets(body));
      report.screenshots.push(await capture(page, ARTIFACT_DIR, shot.file));
      await context.close();
    }

    for (const role of roleSessions) {
      if (abortIfDeadline(report, "role-sessions")) return;
      const sessionStarted = Date.now();
      const { context, page } = await prepareContext(browser, VIEWPORTS[2], report);
      await loginContext(context, env, base, role.email, role.password || testPassword);
      const boot = await bootstrapSession(page, base, { expectedIsAdmin: role.expectedIsAdmin });
      if (!boot.ok) {
        report.sessions.push({
          role: role.role,
          path: "/admin",
          pass: false,
          bootstrapError: boot.error,
          durationMs: Date.now() - sessionStarted,
        });
        await context.close();
        continue;
      }
      await gotoAndWait(page, base, "/admin", {
        expectForbidden: role.expectForbidden,
        expectAdminHub: role.expectAdminHub,
        timeoutMs: PAGE_READY_MS,
      });
      await setTheme(page, "dark");
      const checks = await pageChecks(page);
      const me = await fetchMe(page);
      const nav = navFromPermissions(me.body?.permissions);
      const pass =
        boot.ok &&
        !checks.hasSpinner &&
        (role.expectForbidden ? checks.hasForbidden && !checks.hasAdminHub : checks.hasAdminHub) &&
        (role.expectForbidden
          ? me.body?.isAdmin === false
          : me.status === 200 && me.body?.isAdmin === true) &&
        (role.expectFinance === undefined || nav.financeNav === role.expectFinance) &&
        (role.expectIam === undefined || nav.iamNav === role.expectIam) &&
        (role.expectNews === undefined || nav.newsNav === role.expectNews) &&
        (role.expectSubs === undefined || nav.subsNav === role.expectSubs) &&
        (role.expectPerms === undefined ||
          role.expectPerms.every((p) => (me.body?.permissions || []).includes(p))) &&
        checks.dir === "rtl" &&
        !checks.overflowX;

      report.sessions.push({
        role: role.role,
        path: "/admin",
        checks: { ...checks, ...nav, meStatus: me.status, isAdmin: me.body?.isAdmin },
        pass,
        durationMs: Date.now() - sessionStarted,
      });
      await context.close();
    }

    const directCases = [
      { role: "normal", email: `iam-test-normal-user@${TEST_DOMAIN}`, path: "/admin", expectForbidden: true },
      { role: "normal", email: `iam-test-normal-user@${TEST_DOMAIN}`, path: "/admin/iam", expectForbidden: true },
      { role: "support", email: `iam-test-support@${TEST_DOMAIN}`, path: "/admin/financial-center", expectForbidden: true },
      { role: "accountant", email: `iam-test-accountant@${TEST_DOMAIN}`, path: "/admin/iam", expectForbidden: true },
      { role: "news_editor", email: `iam-test-news-editor@${TEST_DOMAIN}`, path: "/admin/news", expectForbidden: false, expectNews: true },
      { role: "news_editor", email: `iam-test-news-editor@${TEST_DOMAIN}`, path: "/admin/iam", expectForbidden: true },
      { role: "subscription_manager", email: `iam-test-subscription-manager@${TEST_DOMAIN}`, path: "/admin/users", expectForbidden: true },
    ];

    for (const dc of directCases) {
      if (abortIfDeadline(report, "direct-url-denial")) return;
      const { context, page } = await prepareContext(browser, VIEWPORTS[2], report);
      await loginContext(context, env, base, dc.email, testPassword);
      await bootstrapSession(page, base, { expectedIsAdmin: dc.expectForbidden ? undefined : true });
      await gotoAndWait(page, base, dc.path, {
        expectForbidden: dc.expectForbidden,
        expectNews: dc.expectNews,
        timeoutMs: PAGE_READY_MS,
      });
      const checks = await pageChecks(page);
      const me = await fetchMe(page);
      let pass = dc.expectForbidden ? checks.hasForbidden && !checks.hasAdminHub : !checks.hasForbidden;
      if (dc.path === "/admin/news" && !dc.expectForbidden) {
        pass = me.status === 200 && me.body?.isAdmin && !checks.hasForbidden;
      }
      report.directUrlDenial.push({
        ...dc,
        checks: { hasForbidden: checks.hasForbidden, hasAdminHub: checks.hasAdminHub, meStatus: me.status },
        pass,
      });
      await context.close();
    }

    for (const vp of VIEWPORTS) {
      const { context, page } = await prepareContext(browser, vp, report);
      await loginContext(context, env, base, env.IAM_OWNER_EMAIL, env.STAGING_OWNER_PASSWORD);
      await bootstrapSession(page, base, { expectedIsAdmin: true });
      await gotoAndWait(page, base, "/admin", { expectAdminHub: true, timeoutMs: PAGE_READY_MS });
      const checks = await pageChecks(page);
      report.responsive.push({
        viewport: vp.name,
        overflowX: checks.overflowX,
        hasAdminHub: checks.hasAdminHub,
        pass: !checks.overflowX && checks.hasAdminHub,
      });
      await context.close();
    }

    for (const theme of ["dark", "light"]) {
      const { context, page } = await prepareContext(browser, VIEWPORTS[2], report);
      await loginContext(context, env, base, env.IAM_OWNER_EMAIL, env.STAGING_OWNER_PASSWORD);
      await bootstrapSession(page, base, { expectedIsAdmin: true });
      await gotoAndWait(page, base, "/admin/iam", { expectIam: true, timeoutMs: PAGE_READY_MS });
      await setTheme(page, theme);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForPageReady(page, { expectIam: true, timeoutMs: PAGE_READY_MS });
      await setTheme(page, theme);
      const persisted = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      const checks = await pageChecks(page);
      report.themes.push({
        theme,
        persisted: persisted === theme,
        overflowX: checks.overflowX,
        pass: !checks.overflowX,
      });
      await context.close();
    }

    const axeTargets = [
      { label: "admin", path: "/admin", email: env.IAM_OWNER_EMAIL, password: env.STAGING_OWNER_PASSWORD, expectAdminHub: true },
      { label: "admin-iam", path: "/admin/iam", email: env.IAM_OWNER_EMAIL, password: env.STAGING_OWNER_PASSWORD, expectIam: true },
      { label: "admin-news", path: "/admin/news", email: `iam-test-news-editor@${TEST_DOMAIN}`, expectNews: true },
      { label: "forbidden", path: "/admin/iam", email: `iam-test-normal-user@${TEST_DOMAIN}`, expectForbidden: true },
    ];

    for (const target of axeTargets) {
      const { context, page } = await prepareContext(browser, VIEWPORTS[2], report);
      await loginContext(context, env, base, target.email, target.password || testPassword);
      await bootstrapSession(page, base, { expectedIsAdmin: target.expectForbidden ? false : true });
      await gotoAndWait(page, base, target.path, {
        expectForbidden: target.expectForbidden,
        expectAdminHub: target.expectAdminHub,
        expectNews: target.expectNews,
        expectIam: target.expectIam,
        timeoutMs: PAGE_READY_MS,
      });
      report.axe.push({ page: target.label, ...(await runAxe(page)) });
      await context.close();
    }

    {
      const { context, page } = await prepareContext(browser, VIEWPORTS[2], report);
      await loginContext(context, env, base, env.IAM_OWNER_EMAIL, env.STAGING_OWNER_PASSWORD);
      await bootstrapSession(page, base, { expectedIsAdmin: true });
      await gotoAndWait(page, base, "/admin/iam", { expectIam: true, timeoutMs: PAGE_READY_MS });
      await openOverridesTab(page);
      report.axe.push({ page: "iam-overrides", ...(await runAxe(page)) });
      await context.close();
    }

    await browser.close();

    report.durationMs = Date.now() - startedAt;
    report.secretScan.leaks = [...new Set(report.secretScan.leaks)];
    report.consoleErrors = [...new Set(report.consoleErrors)].slice(0, 30);
    report.networkFailures = report.networkFailures.slice(0, 20);

    const axeCritical = report.axe.reduce((n, a) => n + (a.byImpact?.critical || 0), 0);
    const axeSerious = report.axe.reduce((n, a) => n + (a.byImpact?.serious || 0), 0);

    report.assertions = {
      sessionsPass: report.sessions.every((s) => s.pass),
      directUrlPass: report.directUrlDenial.every((d) => d.pass),
      responsivePass: report.responsive.every((r) => r.pass),
      themesPass: report.themes.every((t) => t.pass),
      screenshotsCount: report.screenshots.length,
      axeCritical,
      axeSerious,
      secretLeaks: report.secretScan.leaks.length,
      consoleErrors: report.consoleErrors.length,
    };

    report.ok =
      report.playwright.chromium &&
      report.assertions.sessionsPass &&
      report.assertions.directUrlPass &&
      report.assertions.responsivePass &&
      report.assertions.themesPass &&
      report.assertions.screenshotsCount === 14 &&
      report.assertions.axeCritical === 0 &&
      report.assertions.secretLeaks === 0 &&
      stagingRef !== productionRef;

    report.devLogTail = dev.getLogTail?.() || "";
    report.verdict = report.ok ? "BROWSER QA VALIDATED" : "BROWSER QA FAILED";
    writeReport(REPORT_PATH, report);

    console.log(
      JSON.stringify(
        {
          verdict: report.verdict,
          ok: report.ok,
          durationMs: report.durationMs,
          screenshots: report.screenshots.length,
          axeCritical,
          axeSerious,
          artifact: REPORT_PATH,
        },
        null,
        2
      )
    );
    process.exit(report.ok ? 0 : 1);
  } finally {
    await stopDevServer(dev);
    await sleep(500);
    report.processCleanup = report.processCleanup || {};
    report.processCleanup.portPidsAfter = getPidsOnPort(DEV_PORT);
    if (report.processCleanup.portPidsAfter?.length) {
      report.processCleanup.orphans = report.processCleanup.portPidsAfter;
    }
  }
}

async function main() {
  const { env } = loadEnv(ROOT);
  if (SMOKE_MODE) {
    await runSmoke(env);
  } else {
    await runFull(env);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
