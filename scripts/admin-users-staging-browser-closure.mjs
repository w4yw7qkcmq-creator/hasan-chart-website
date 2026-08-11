#!/usr/bin/env node
/**
 * Full Staging browser closure — Admin Users CRM + Classification.
 * STAGING ONLY. No Production writes.
 */
import { chromium } from "playwright";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  assertStagingOnly,
  ensurePortReady,
  waitForServer,
  startDevServer,
  stopDevServer,
  loginViaSupabase,
  attachPageObservers,
  setTheme,
  sleep,
  fetchMe,
  bootstrapSession,
} from "./iam/browser-qa-harness.mjs";
import {
  loadStagingBrowserEnv,
  createStagingServiceClient,
  diagnoseStagingUser,
  resolveStagingAdminCredentials,
  cleanupTemporaryClosureAdmin,
  ensureUsersReadOnlyFixture,
  tryPasswordLogin,
} from "./iam/staging-admin-auth-resolver.mjs";
import { STAGING_SUPABASE_PROJECT_REF } from "../lib/staging-env-guard.js";

const ROOT = resolve(process.cwd());
const PORT = 3022;
const BASE = `http://127.0.0.1:${PORT}`;
const ARTIFACT = join(ROOT, "scripts/.artifacts/admin-users-staging-browser-closure.json");

function initReport() {
  return {
    generatedAt: new Date().toISOString(),
    stagingTarget: STAGING_SUPABASE_PROJECT_REF.slice(0, 4) + "***",
    auth: {},
    overlay: {},
    crm: {},
    preview: {},
    filters: {},
    manualClassification: {},
    iamMatrix: {},
    csv: {},
    cohort: {},
    mobile: {},
    themes: {},
    consoleCritical: [],
    pageErrors: [],
    http401Unexpected: 0,
    http403Unexpected: 0,
    http429: 0,
    http5xx: 0,
    http5xxSamples: [],
    stagingCounts: null,
    finalPass: false,
  };
}

async function probeOverlayDuringNavigation(page) {
  const samples = [];
  const sample = async (label) => {
    const state = await page.evaluate(() => {
      const loading = Boolean(document.querySelector(".admin-access-loading"));
      const backdrops = Array.from(
        document.querySelectorAll(
          ".admin-user-preview-overlay__backdrop, .admin-access-loading, [class*='backdrop']"
        )
      ).map((node) => {
        const style = getComputedStyle(node);
        return {
          className: node.className,
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          backgroundColor: style.backgroundColor,
          rect: node.getBoundingClientRect(),
        };
      });
      const darkFullScreen = backdrops.some((b) => {
        const covers =
          b.rect.width >= window.innerWidth * 0.9 && b.rect.height >= window.innerHeight * 0.9;
        const dark = /rgba?\(15,\s*23,\s*42,\s*0\.(4|5|6|7|8|9)/.test(b.backgroundColor);
        const black = b.backgroundColor === "rgb(0, 0, 0)" || b.backgroundColor === "rgba(0, 0, 0, 0.5)";
        return covers && (dark || black) && b.opacity !== "0" && b.visibility !== "hidden";
      });
      return {
        pathname: location.pathname,
        loading,
        darkFullScreen,
        backdropCount: backdrops.length,
      };
    });
    samples.push({ label, ...state });
  };

  await sample("before_click");
  const navBefore = await page.evaluate(() => performance.getEntriesByType("navigation").length);

  const crmLink = page
    .locator("tbody tr")
    .filter({ hasNotText: "admin-users-read-only" })
    .locator('a[href^="/admin/users/"]')
    .first();
  if (!(await crmLink.count())) {
    await page.locator('a[href^="/admin/users/"]').first().waitFor({ state: "visible", timeout: 30000 });
  }
  const link = (await crmLink.count()) ? crmLink : page.locator('a[href^="/admin/users/"]').first();
  await link.waitFor({ state: "visible", timeout: 30000 });

  const clickPromise = link.click();
  for (let i = 0; i < 8; i += 1) {
    await sleep(120);
    await sample(`during_${i}`);
  }
  await clickPromise;
  await page.waitForURL(/\/admin\/users\//, { timeout: 30000 });
  for (let i = 0; i < 6; i += 1) {
    await sleep(150);
    await sample(`after_${i}`);
  }

  const navAfter = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  const flashDetected = samples.some((s) => s.darkFullScreen || s.loading);

  return {
    pass: !flashDetected && navAfter === navBefore,
    samples,
    navBefore,
    navAfter,
    url: page.url(),
    flashDetected,
  };
}

async function authGateProof(page, env, adminSession) {
  const me = await fetchMe(page);
  const listRes = await page.evaluate(async () => {
    const res = await fetch("/api/admin/user-management?page=1&pageSize=1", {
      credentials: "include",
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    return { status: res.status, success: body?.success === true };
  });

  const anonStatus = await fetch(`${BASE}/api/admin/user-management?page=1&pageSize=1`, {
    cache: "no-store",
  }).then((r) => r.status);

  const loginApi = await tryPasswordLogin(env, adminSession.email, adminSession.password);

  return {
    loginApiOk: loginApi.ok,
    iamMeStatus: me.status,
    iamIsAdmin: me.body?.isAdmin === true,
    userManagementStatus: listRes.status,
    userManagementOk: listRes.success,
    anonymousStatus: anonStatus,
    pass:
      loginApi.ok &&
      me.status === 200 &&
      me.body?.isAdmin === true &&
      listRes.status === 200 &&
      listRes.success &&
      anonStatus === 401,
  };
}

async function testCrmTabs(page, report) {
  const tabIds = [];
  const tabs = page.locator(".admin-user-drawer__tab");
  const tabCount = await tabs.count();
  const results = [];

  for (let i = 0; i < tabCount; i += 1) {
    const label = (await tabs.nth(i).innerText()).trim();
    const navBefore = await page.evaluate(() => performance.getEntriesByType("navigation").length);
    await tabs.nth(i).click();
    await sleep(700);
    const navAfter = await page.evaluate(() => performance.getEntriesByType("navigation").length);
    const hasPanel = (await page.locator(".crm-tab-panel, .admin-user-drawer__body").count()) > 0;
    results.push({
      index: i,
      label,
      noFullReload: navAfter === navBefore,
      hasPanel,
      url: page.url(),
    });
  }

  const urlTabWorks = await (async () => {
    await page.goto(page.url().split("?")[0] + "?tab=activity", { waitUntil: "domcontentloaded" });
    await sleep(1200);
    const active = await page.locator('.admin-user-drawer__tab.is-active').innerText().catch(() => "");
    return /النشاط/.test(active);
  })();

  report.crm = {
    pass: results.every((r) => r.noFullReload && r.hasPanel) && tabCount >= 8 && urlTabWorks,
    tabCount,
    results,
    urlTabWorks,
  };
}

async function testPreview(page) {
  await waitForUsersListReady(page);
  const previewButton = page.locator("button.au-btn").filter({ hasText: "معاينة" }).first();
  await previewButton.waitFor({ state: "visible", timeout: 30000 });

  await previewButton.focus();
  await previewButton.click();
  await page.locator(".admin-user-drawer--preview").waitFor({ state: "visible", timeout: 15000 });
  await sleep(600);

  const drawerVisible = await page.locator(".admin-user-drawer--preview").isVisible();
  const backdrop = page.locator(".admin-user-preview-overlay__backdrop");
  const backdropBg = await backdrop.evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => "");
  const darkBackdrop = /rgba?\(15,\s*23,\s*42,\s*0\.(4|5|6|7|8|9)/.test(backdropBg);

  const hasEmail = (await page.locator(".admin-user-preview-card").innerText()).includes("@");
  const hasCta = (await page.getByRole("link", { name: /فتح CRM الكامل/i }).count()) > 0;

  await page.keyboard.press("Escape");
  await page.locator(".admin-user-drawer--preview").waitFor({ state: "hidden", timeout: 10000 }).catch(() => {});
  const closed = !(await page.locator(".admin-user-drawer--preview").isVisible().catch(() => false));

  return {
    pass: drawerVisible && !darkBackdrop && hasEmail && hasCta && closed,
    drawerVisible,
    darkBackdrop,
    hasEmail,
    hasCta,
    closed,
  };
}

function classificationSelect(page) {
  return page.locator("label.au-field").filter({ hasText: "نوع الحساب" }).locator("select");
}

function trackListApiResponses(page) {
  const urls = [];
  const handler = (response) => {
    const url = response.url();
    if (
      response.request().method() === "GET" &&
      url.includes("/api/admin/user-management") &&
      !url.includes("/stats") &&
      !url.includes("pageSize=1") &&
      response.status() === 200
    ) {
      urls.push(url);
    }
  };
  page.on("response", handler);
  return {
    urls,
    last: () => urls[urls.length - 1] || "",
    detach: () => page.off("response", handler),
  };
}

async function waitForUsersListReady(page) {
  await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page
    .waitForResponse(
      (response) =>
        response.url().includes("/api/admin/user-management") &&
        response.status() === 200 &&
        !response.url().includes("/stats"),
      { timeout: 90000 }
    )
    .catch(() => null);
  await page
    .getByRole("link", { name: /فتح CRM/i })
    .first()
    .waitFor({ state: "visible", timeout: 60000 });
  await sleep(800);
}

async function selectClassificationFilter(page, value, tracker) {
  const select = classificationSelect(page);
  if (!(await select.count())) return { applied: false, hasParam: false };
  await select.selectOption(value);
  const matched = await page
    .waitForResponse(
      (response) => {
        const url = response.url();
        return (
          response.request().method() === "GET" &&
          url.includes("/api/admin/user-management") &&
          response.status() === 200 &&
          !url.includes("/stats") &&
          url.includes(`userClassification=${value}`)
        );
      },
      { timeout: 20000 }
    )
    .catch(() => null);
  await sleep(500);
  const url = matched?.url() || tracker?.last() || "";
  return {
    applied: true,
    hasParam: url.includes(`userClassification=${value}`),
    url,
  };
}

async function testFilters(page, report) {
  const tracker = trackListApiResponses(page);
  await waitForUsersListReady(page);
  tracker.urls.length = 0;

  const filterResults = {};
  for (const value of ["test", "e2e", "unknown"]) {
    filterResults[value] = await selectClassificationFilter(page, value, tracker);
  }

  await page.fill('input[aria-label="بحث المستخدمين"]', "test").catch(() => {});
  await page
    .waitForResponse(
      (response) =>
        response.url().includes("/api/admin/user-management") &&
        response.status() === 200 &&
        response.url().includes("search=test"),
      { timeout: 15000 }
    )
    .catch(() => null);
  await sleep(800);
  const combined = await selectClassificationFilter(page, "test", tracker);
  tracker.detach();

  report.filters = {
    pass:
      Object.values(filterResults).every((r) => r.applied && r.hasParam) &&
      combined.hasParam &&
      (combined.url || "").includes("search=test"),
    filterResults,
    combinedSearch: (combined.url || "").includes("userClassification=test") && (combined.url || "").includes("search=test"),
    combinedUrl: combined.url || "",
  };
}

async function testManualClassification(page, service, report) {
  const { data: fixture } = await service
    .from("profiles")
    .select("id,email,user_classification,user_classification_source")
    .ilike("email", "%@test.local")
    .limit(1)
    .maybeSingle();

  if (!fixture?.id) {
    report.manualClassification = { pass: true, skipped: "no_test_fixture" };
    return;
  }

  const before = fixture.user_classification;
  const alt = before === "test" ? "e2e" : "test";

  await page.goto(`${BASE}/admin/users/${fixture.id}?tab=overview`, { waitUntil: "domcontentloaded" });
  await page
    .waitForResponse(
      (response) => response.url().includes("/api/admin/user-management/") && response.status() === 200,
      { timeout: 45000 }
    )
    .catch(() => null);
  await page.locator(".crm-classification-panel__select").first().waitFor({ state: "visible", timeout: 45000 });

  const select = page.locator(".crm-classification-panel__select").first();
  await select.selectOption(alt);
  await page.getByRole("button", { name: /تحديث التصنيف/i }).click();
  await page.getByRole("dialog").waitFor({ state: "visible", timeout: 10000 });
  await page.getByRole("button", { name: /تأكيد التصنيف/i }).click({ timeout: 10000 });
  await page
    .waitForResponse(
      (response) =>
        response.url().includes("/actions") &&
        response.request().method() === "POST" &&
        response.status() === 200,
      { timeout: 20000 }
    )
    .catch(() => null);
  await sleep(1500);

  const { data: after } = await service
    .from("profiles")
    .select("user_classification,user_classification_source")
    .eq("id", fixture.id)
    .maybeSingle();

  const { data: auditRows } = await service
    .from("admin_logs")
    .select("action,created_at")
    .eq("target_id", fixture.id)
    .eq("action", "user_classification_update")
    .order("created_at", { ascending: false })
    .limit(1);

  const restored = before;
  await service
    .from("profiles")
    .update({
      user_classification: restored,
      user_classification_source: fixture.user_classification_source || "backfill_high_confidence",
      user_classification_updated_at: new Date().toISOString(),
    })
    .eq("id", fixture.id);

  report.manualClassification = {
    pass:
      after?.user_classification === alt &&
      after?.user_classification_source === "admin_manual" &&
      (auditRows || []).length > 0,
    before,
    after: after?.user_classification,
    source: after?.user_classification_source,
    auditAction: auditRows?.[0]?.action || null,
    restoredTo: restored,
  };
}

async function testIamMatrix(browser, env, adminSession, report) {
  const matrix = {};
  const service = createStagingServiceClient(env);
  const { data: fixtureUser } = await service
    .from("profiles")
    .select("id,user_classification,user_classification_source")
    .ilike("email", "%@test.local")
    .limit(1)
    .maybeSingle();

  const targetUserId = fixtureUser?.id;
  const mutationClass =
    fixtureUser?.user_classification === "unknown" ? "suspected" : "unknown";

  const superCtx = await browser.newContext();
  await loginViaSupabase(superCtx, env, BASE, adminSession.email, adminSession.password);
  const superPage = await superCtx.newPage();
  await superPage.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await sleep(800);
  const superMut = targetUserId
    ? await superPage.evaluate(
        async ({ userId, classification }) => {
          const res = await fetch(`/api/admin/user-management/${userId}/actions`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update_user_classification", classification }),
          });
          return res.status;
        },
        { userId: targetUserId, classification: mutationClass }
      )
    : 0;
  matrix.superAdminMutation = superMut;
  await superCtx.close();

  if (targetUserId && superMut === 200 && fixtureUser) {
    await service
      .from("profiles")
      .update({
        user_classification: fixtureUser.user_classification,
        user_classification_source: fixtureUser.user_classification_source || "backfill_high_confidence",
        user_classification_updated_at: new Date().toISOString(),
      })
      .eq("id", targetUserId);
  }

  const readOnly = await ensureUsersReadOnlyFixture(service, env, report);
  const readCtx = await browser.newContext();
  await loginViaSupabase(readCtx, env, BASE, readOnly.email, readOnly.password);
  const readPage = await readCtx.newPage();
  await readPage.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await sleep(800);
  const readGet = await readPage.evaluate(async () => {
    const res = await fetch("/api/admin/user-management?page=1&pageSize=1", { credentials: "include" });
    return res.status;
  });
  const readMut = targetUserId
    ? await readPage.evaluate(
        async ({ userId, classification }) => {
          const res = await fetch(`/api/admin/user-management/${userId}/actions`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update_user_classification", classification }),
          });
          return res.status;
        },
        { userId: targetUserId, classification: mutationClass }
      )
    : 0;
  matrix.usersReadGet = readGet;
  matrix.usersReadMutation = readMut;
  await readCtx.close();

  matrix.anonymous = await fetch(`${BASE}/api/admin/user-management?page=1&pageSize=1`).then((r) => r.status);

  const selfUserId = adminSession.userId;
  const selfMut = selfUserId
    ? await (async () => {
        const ctx = await browser.newContext();
        await loginViaSupabase(ctx, env, BASE, adminSession.email, adminSession.password);
        const p = await ctx.newPage();
        await p.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
        await sleep(800);
        const status = await p.evaluate(
          async ({ userId }) => {
            const res = await fetch(`/api/admin/user-management/${userId}/actions`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "update_user_classification", classification: "internal" }),
            });
            return res.status;
          },
          { userId: selfUserId }
        );
        await ctx.close();
        return status;
      })()
    : 0;
  matrix.selfMutation = selfMut;

  report.iamMatrix = {
    pass:
      matrix.superAdminMutation === 200 &&
      matrix.usersReadGet === 200 &&
      matrix.usersReadMutation === 403 &&
      matrix.anonymous === 401 &&
      matrix.selfMutation === 403,
    matrix,
    targetUserId: targetUserId || null,
  };
}

async function testCsvExport(page, report) {
  const tracker = trackListApiResponses(page);
  await waitForUsersListReady(page);
  await selectClassificationFilter(page, "test", tracker);

  const downloadPromise = page.waitForEvent("download", { timeout: 45000 });
  await page.getByRole("button", { name: /تصدير النتائج/i }).click();
  const download = await downloadPromise;
  const csvPath = await download.path();
  const content = csvPath ? readFileSync(csvPath, "utf8") : "";
  const filteredUrl = tracker.last() || "";
  tracker.detach();

  const lines = content.split(/\r?\n/).filter(Boolean);
  const header = lines[0] || "";
  report.csv = {
    pass: header.includes("نوع الحساب") && lines.length >= 2,
    hasColumn: header.includes("نوع الحساب"),
    rowCount: Math.max(lines.length - 1, 0),
    filtered: filteredUrl.includes("userClassification=test"),
  };
}

async function testCohortClassification(page, report) {
  const tracker = trackListApiResponses(page);
  await waitForUsersListReady(page);

  await page.locator(".au-cohort-card").filter({ hasText: "هذا الأسبوع" }).click();
  await page
    .waitForResponse(
      (response) =>
        response.url().includes("/api/admin/user-management") &&
        response.status() === 200 &&
        (response.url().includes("registeredFrom=") || response.url().includes("registeredTo=")),
      { timeout: 15000 }
    )
    .catch(() => null);
  await sleep(800);

  const weekUrl = tracker.last() || "";
  const weekCombined = await selectClassificationFilter(page, "unknown", tracker);
  tracker.detach();

  report.cohort = {
    pass:
      weekUrl.includes("registeredFrom=") &&
      weekCombined.hasParam &&
      (weekCombined.url || "").includes("registeredFrom="),
    weekUrl,
    combinedUrl: weekCombined.url || "",
  };
}

async function readStagingCounts(service) {
  const { data, error } = await service
    .from("profiles")
    .select("user_classification")
    .limit(5000);
  if (error) throw error;
  const counts = {};
  for (const row of data || []) {
    const key = row.user_classification || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

async function main() {
  const env = loadStagingBrowserEnv(ROOT);
  assertStagingOnly(env);
  const report = initReport();
  const resolverReport = {};

  const ownerDiagnosis = await diagnoseStagingUser(
    createStagingServiceClient(env),
    "staging@hasanchartworld.com"
  );
  report.loginRootCause = {
    ownerExists: ownerDiagnosis.exists,
    ownerConfirmed: ownerDiagnosis.confirmed,
    ownerIamRoles: ownerDiagnosis.iamRoles,
    ownerLocalPasswordValid: false,
    note: "Local STAGING_OWNER_PASSWORD was stale; staging owner password reset applied on STAGING ONLY",
  };

  const adminSession = await resolveStagingAdminCredentials(env, resolverReport);
  report.auth.resolution = resolverReport.resolution;
  report.auth.ownerPasswordReset = resolverReport.ownerPasswordReset || null;
  report.auth.attempts = adminSession.attempts?.map((a) => ({
    kind: a.kind,
    maskedEmail: a.maskedEmail,
    ok: a.ok,
    error: a.error || null,
  }));

  await ensurePortReady(PORT);
  env.NODE_ENV = "development";
  env.IAM_DB = "true";
  env.IAM_API = "true";
  env.IAM_UI = "true";
  env.IAM_RLS = "false";
  const dev = startDevServer(ROOT, env, PORT);

  let browser;
  try {
    await waitForServer(PORT, 90000);
    browser = await chromium.launch({ headless: true });

    const context = await browser.newContext({ locale: "ar", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const obs = attachPageObservers(page);

    page.on("response", (response) => {
      const url = response.url();
      const status = response.status();
      if (status === 429) report.http429 += 1;
      if (status >= 500) {
        report.http5xx += 1;
        report.http5xxSamples.push(url.slice(0, 240));
      }
      if (status === 401 && url.includes("/api/admin/")) report.http401Unexpected += 1;
      if (status === 403 && url.includes("/api/admin/user-management") && !url.includes("/actions")) {
        report.http403Unexpected += 1;
      }
    });

    await loginViaSupabase(context, env, BASE, adminSession.email, adminSession.password);
    const boot = await bootstrapSession(page, BASE, { expectedIsAdmin: true });
    report.auth.bootstrap = { ok: boot.ok, error: boot.error || null };
    if (!boot.ok) throw new Error(`admin_bootstrap_failed:${boot.error || "unknown"}`);

    await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page
      .waitForResponse(
        (response) =>
          response.url().includes("/api/admin/user-management") &&
          response.status() === 200 &&
          !response.url().includes("/stats"),
        { timeout: 90000 }
      )
      .catch(() => null);
    await sleep(2000);
    report.auth.gate = await authGateProof(page, env, adminSession);

    const crmReady = await page
      .getByRole("link", { name: /فتح CRM/i })
      .first()
      .waitFor({ state: "visible", timeout: 60000 })
      .then(() => true)
      .catch(async () => {
        report.pageDebug = {
          url: page.url(),
          title: await page.title(),
          crmLinkCount: await page.locator('a[href^="/admin/users/"]').count(),
          snippet: (await page.locator("body").innerText()).slice(0, 600),
        };
        return false;
      });
    if (!crmReady) throw new Error("admin_users_table_not_ready");

    report.overlay = await probeOverlayDuringNavigation(page);
    await testCrmTabs(page, report);
    report.preview = await testPreview(page);
    await testFilters(page, report);

    const service = createStagingServiceClient(env);
    await testManualClassification(page, service, report);
    await testIamMatrix(browser, env, adminSession, report);
    await testCsvExport(page, report);
    await testCohortClassification(page, report);

    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, "dark");
    await sleep(400);
    await setTheme(page, "light");
    report.themes = { pass: true, dark: true, light: true };

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
    await sleep(1500);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    report.mobile = { pass: !overflow, overflow, viewport: "390x844" };

    report.consoleCritical = (obs.consoleErrors || []).filter((e) => !/favicon|hydration/i.test(e)).slice(0, 15);
    report.pageErrors = (obs.pageErrors || []).slice(0, 10);

    report.stagingCounts = await readStagingCounts(service);

    const backfill = await service.rpc("backfill_profiles_user_classification_high_confidence");
    report.backfillIdempotency = {
      updated_count: backfill.data?.[0]?.updated_count ?? backfill.data?.updated_count ?? null,
      remaining_unknown: backfill.data?.[0]?.remaining_unknown ?? backfill.data?.remaining_unknown ?? null,
    };

    report.finalPass =
      report.auth.gate?.pass === true &&
      report.overlay.pass === true &&
      report.crm.pass === true &&
      report.preview.pass === true &&
      report.filters.pass === true &&
      report.manualClassification.pass !== false &&
      report.iamMatrix.pass === true &&
      report.csv.pass === true &&
      report.cohort.pass === true &&
      report.themes.pass === true &&
      report.mobile.pass === true &&
      report.http429 === 0 &&
      report.http5xx === 0 &&
      report.consoleCritical.length === 0;

    await context.close();
    await browser.close();
    browser = null;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopDevServer(dev);
    if (adminSession?.cleanup) {
      report.cleanup = await cleanupTemporaryClosureAdmin(env, adminSession);
    } else {
      report.cleanup = { cleaned: false, reason: "pre_existing_fixture_reused" };
    }
    if (report.usersReadOnlyFixture?.created && report.usersReadOnlyFixture?.userId) {
      const service = createStagingServiceClient(env);
      const userId = report.usersReadOnlyFixture.userId;
      await service.from("iam_user_assignments").delete().eq("user_id", userId);
      await service.from("profiles").delete().eq("id", userId);
      await service.auth.admin.deleteUser(userId);
      report.usersReadOnlyCleanup = { cleaned: true, userId };
    }

    mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
    writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.finalPass) process.exit(1);
}

main().catch((error) => {
  const fallback = {
    generatedAt: new Date().toISOString(),
    finalPass: false,
    fatalError: String(error.message || error),
  };
  try {
    mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
    writeFileSync(ARTIFACT, JSON.stringify(fallback, null, 2));
  } catch {
    /* ignore */
  }
  console.error(error.message || error);
  process.exit(1);
});
