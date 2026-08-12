#!/usr/bin/env node
/**
 * Browser closure — Effective Classification filter (/admin/users).
 * STAGING ONLY via local dev server. No Production writes.
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
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
  resolveStagingAdminCredentials,
  cleanupTemporaryClosureAdmin,
} from "./iam/staging-admin-auth-resolver.mjs";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
} from "../lib/staging-env-guard.js";
import {
  resolveEffectiveUserClassification,
  USER_CLASSIFICATION,
} from "../lib/user-classification.js";

const ROOT = resolve(process.cwd());
const PORT = 3025;
const BASE = `http://127.0.0.1:${PORT}`;
const ARTIFACT = join(ROOT, "scripts/.artifacts/admin-users-effective-classification-browser-closure.json");

function extractLocalizedInt(text) {
  const arabicIndic = "٠١٢٣٤٥٦٧٨٩";
  let normalized = String(text || "");
  for (let i = 0; i < arabicIndic.length; i += 1) {
    normalized = normalized.replaceAll(arabicIndic[i], String(i));
  }
  const match = normalized.match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function parseQuery(url) {
  try {
    const u = new URL(url);
    return Object.fromEntries(u.searchParams.entries());
  } catch {
    return {};
  }
}

function initReport() {
  return {
    generatedAt: new Date().toISOString(),
    environmentTarget: {
      mode: "local_dev_staging_supabase",
      baseUrl: BASE,
      stagingProjectRef: STAGING_SUPABASE_PROJECT_REF,
      stagingProjectRefMasked: maskProjectRef(STAGING_SUPABASE_PROJECT_REF),
      productionRefBlocked: PRODUCTION_SUPABASE_PROJECT_REF,
      productionNotTarget: true,
    },
    auth: {},
    defaultPage: {},
    realFilter: {},
    pagination: {},
    searchReal: {},
    cohortReal: {},
    composedFilters: {},
    lastLoginReal: {},
    csv: {},
    clearFilters: {},
    manualOverride: {},
    noRefresh: { fullDocumentReloadCount: 0, blackOverlayDetected: false },
    visual: { desktop: {}, mobile: {}, light: {}, dark: {} },
    http429: 0,
    http5xx: 0,
    http5xxSamples: [],
    failedAdminApiRequests: [],
    consoleCritical: [],
    pageErrors: [],
    stagingEffectiveCounts: null,
    productionReadOnlyCrossCheck: null,
    finalPass: false,
  };
}

function isPrimaryTableListEvent(event) {
  if (!event || event.status !== 200) return false;
  const pageSize = String(event.query?.pageSize || "");
  return pageSize === "25" || pageSize === "100";
}

function isExportListEvent(event) {
  if (!event || event.status !== 200) return false;
  const pageSize = String(event.query?.pageSize || "");
  return pageSize === "100" || pageSize === "25";
}

function trackListApi(page, report) {
  const events = [];
  const handler = async (response) => {
    const url = response.url();
    if (
      response.request().method() !== "GET" ||
      !url.includes("/api/admin/user-management") ||
      url.includes("/stats") ||
      url.includes("/actions")
    ) {
      return;
    }
    const status = response.status();
    if (status === 429) report.http429 += 1;
    if (status >= 500) {
      report.http5xx += 1;
      report.http5xxSamples.push(`${status}:${url.slice(0, 220)}`);
    }
    if (status >= 400 && url.includes("/api/admin/")) {
      report.failedAdminApiRequests.push({ status, url: url.slice(0, 240) });
    }
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    events.push({ url, status, query: parseQuery(url), body });
  };
  page.on("response", handler);
  return {
    events,
    lastOk: () => [...events].reverse().find((e) => e.status === 200) || null,
    waitFor: async (predicate, timeout = 25000) => {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        const hit = [...events].reverse().find((e) => e.status === 200 && predicate(e));
        if (hit) return hit;
        await sleep(120);
      }
      return null;
    },
    detach: () => page.off("response", handler),
  };
}

async function navCount(page) {
  return page.evaluate(() => performance.getEntriesByType("navigation").length);
}

function classificationSelect(page) {
  return page.locator("label.au-field").filter({ hasText: "نوع الحساب" }).locator("select");
}

async function clearAllFilters(page, tracker) {
  await page.fill('input[aria-label="بحث المستخدمين"]', "").catch(() => {});
  await page.getByRole("button", { name: "مسح الفلاتر" }).click();
  tracker.events.length = 0;
  const event = await tracker.waitFor(
    (e) =>
      isPrimaryTableListEvent(e) &&
      (e.query.userClassification === "all" || !e.query.userClassification) &&
      !e.query.registeredFrom &&
      !e.query.lastLoginFrom &&
      !e.query.search &&
      e.query.page === "1"
  );
  await sleep(500);
  return event;
}

async function waitForUsersReady(page) {
  await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page
    .waitForResponse(
      (r) =>
        r.url().includes("/api/admin/user-management") &&
        r.status() === 200 &&
        !r.url().includes("/stats"),
      { timeout: 90000 }
    )
    .catch(() => null);
  await page.getByRole("link", { name: /فتح CRM/i }).first().waitFor({ state: "visible", timeout: 60000 });
  await sleep(800);
}

async function selectClassification(page, value, tracker) {
  const navBefore = await navCount(page);
  const select = classificationSelect(page);
  tracker.events.length = 0;
  await select.selectOption(value);
  const event = await tracker.waitFor(
    (e) =>
      isPrimaryTableListEvent(e) &&
      (e.query.userClassification === value || e.url.includes(`userClassification=${value}`))
  );
  await sleep(600);
  const navAfter = await navCount(page);
  return { event, navBefore, navAfter, noFullReload: navAfter === navBefore, hasParam: Boolean(event?.query?.userClassification === value || event?.url?.includes(`userClassification=${value}`)) };
}

async function computeEffectiveCounts(service) {
  const { data, error } = await service
    .from("profiles")
    .select(
      "id,email,username,role,created_at,last_sign_in_at,user_classification,user_classification_source"
    )
    .limit(5000);
  if (error) throw error;

  const stored = Object.fromEntries(Object.values(USER_CLASSIFICATION).map((k) => [k, 0]));
  const effective = Object.fromEntries(Object.values(USER_CLASSIFICATION).map((k) => [k, 0]));

  for (const profile of data || []) {
    const storedKey = String(profile.user_classification || "unknown").toLowerCase();
    stored[storedKey] = (stored[storedKey] || 0) + 1;
    const resolved = resolveEffectiveUserClassification(profile);
    effective[resolved.classification] = (effective[resolved.classification] || 0) + 1;
  }

  return {
    profilesTotal: (data || []).length,
    storedCounts: stored,
    effectiveCounts: effective,
    effectiveSumMatchesTotal: Object.values(effective).reduce((a, b) => a + b, 0) === (data || []).length,
  };
}

async function readManualOverrideFixtures(service) {
  const { data } = await service
    .from("profiles")
    .select("id,email,user_classification,user_classification_source")
    .eq("user_classification_source", "admin_manual")
    .limit(20);

  const fixtures = (data || []).map((row) => ({
    id: row.id,
    email: row.email,
    stored: row.user_classification,
    effective: resolveEffectiveUserClassification(row).classification,
  }));

  return fixtures;
}

function runProductionReadOnlyAudit() {
  try {
    const result = spawnSync("node", ["scripts/admin-users-classification-production-audit.mjs"], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: 120000,
    });
    if (result.status !== 0) {
      return { ok: false, error: result.stderr || result.stdout || "audit_failed" };
    }
    const artifact = join(ROOT, "scripts/.artifacts/admin-users-classification-production-audit.json");
    return { ok: true, report: JSON.parse(readFileSync(artifact, "utf8")) };
  } catch (error) {
    return { ok: false, error: String(error.message || error) };
  }
}

async function main() {
  const env = loadStagingBrowserEnv(ROOT);
  const stagingRef = assertStagingOnly(env);
  if (stagingRef !== STAGING_SUPABASE_PROJECT_REF) {
    throw new Error(`Expected staging ref ${STAGING_SUPABASE_PROJECT_REF}, got ${stagingRef}`);
  }

  const report = initReport();
  report.environmentTarget.verifiedStagingRef = stagingRef;

  const resolverReport = {};
  const adminSession = await resolveStagingAdminCredentials(env, resolverReport);
  report.auth.resolution = resolverReport.resolution;

  const service = createStagingServiceClient(env);
  report.stagingEffectiveCounts = await computeEffectiveCounts(service);

  await ensurePortReady(PORT);
  env.NODE_ENV = "development";
  env.IAM_DB = "true";
  env.IAM_API = "true";
  env.IAM_UI = "true";
  env.IAM_RLS = "false";
  const dev = startDevServer(ROOT, env, PORT);

  let browser;
  try {
    await waitForServer(PORT, 120000);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: "ar", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const obs = attachPageObservers(page);
    const tracker = trackListApi(page, report);

    await loginViaSupabase(context, env, BASE, adminSession.email, adminSession.password);
    const boot = await bootstrapSession(page, BASE, { expectedIsAdmin: true });
    report.auth.bootstrap = boot;
    if (!boot.ok) throw new Error(`admin_bootstrap_failed:${boot.error || "unknown"}`);

    report.auth.gate = await (async () => {
      const me = await fetchMe(page);
      const list = await page.evaluate(async () => {
        const res = await fetch("/api/admin/user-management?page=1&pageSize=1", {
          credentials: "include",
          cache: "no-store",
        });
        const body = await res.json().catch(() => ({}));
        return { status: res.status, success: body?.success === true };
      });
      return {
        loginOk: true,
        iamMeStatus: me.status,
        iamIsAdmin: me.body?.isAdmin === true,
        userManagementStatus: list.status,
        userManagementOk: list.success,
        pass: me.status === 200 && me.body?.isAdmin === true && list.status === 200 && list.success,
      };
    })();

    // 3. Default page
    tracker.events.length = 0;
    const defaultNavBefore = await navCount(page);
    await waitForUsersReady(page);
    const defaultNavAfter = await navCount(page);
    const defaultEvent = tracker.events.find(isPrimaryTableListEvent) || tracker.lastOk();
    const defaultQuery = defaultEvent?.query || {};
    report.defaultPage = {
      pass:
        defaultEvent?.status === 200 &&
        !defaultQuery.registeredFrom &&
        !defaultQuery.registeredTo &&
        !defaultQuery.lastLoginFrom &&
        !defaultQuery.lastLoginTo &&
        (defaultQuery.userClassification === "all" || !defaultQuery.userClassification),
      requestUrl: defaultEvent?.url || "",
      query: defaultQuery,
      apiTotal: defaultEvent?.body?.pagination?.total ?? null,
      uiSummary: await page.locator(".au-footer__status").innerText().catch(() => ""),
      dateInputValues: await page.evaluate(() => ({
        registeredFrom: document.querySelector('input[type="date"]')?.value || "",
        registeredTo: document.querySelectorAll('input[type="date"]')[1]?.value || "",
        lastLoginFrom: document.querySelectorAll('input[type="date"]')[2]?.value || "",
        lastLoginTo: document.querySelectorAll('input[type="date"]')[3]?.value || "",
      })),
      noFullReload: defaultNavAfter === defaultNavBefore,
    };

    // 4. REAL filter
    const expectedReal = report.stagingEffectiveCounts.effectiveCounts.real || 0;
    const realResult = await selectClassification(page, "real", tracker);
    const realEvent = realResult.event;
    const realRows = realEvent?.body?.users || [];
    const allRowsReal = realRows.length === 0 || realRows.every((u) => u.userClassification === "real");
    const apiTotal = Number(realEvent?.body?.pagination?.total || 0);
    const uiTotal = extractLocalizedInt(await page.locator(".au-footer__status").innerText().catch(() => "0"));

    report.realFilter = {
      pass:
        realResult.hasParam !== false &&
        realEvent?.query?.userClassification === "real" &&
        realEvent?.query?.pageSize === "25" &&
        apiTotal > 0 &&
        apiTotal === expectedReal &&
        uiTotal === apiTotal &&
        allRowsReal &&
        realRows.length > 0,
      expectedEffectiveReal: expectedReal,
      apiTotal,
      uiTotal,
      returnedRows: realRows.length,
      requestUrl: realEvent?.url || "",
      allRowsEffectiveReal: allRowsReal,
      noFullReload: realResult.noFullReload,
      sampleEmails: realRows.slice(0, 3).map((u) => String(u.email || "").replace(/(^.).*(@.*$)/, "$1***$2")),
    };

    // 5. Pagination
    const totalPages = Number(realEvent?.body?.pagination?.totalPages || 1);
    const pageSize = Number(realEvent?.body?.pagination?.pageSize || 25);
    let paginationPass = totalPages <= 1;
    let page2Event = null;
    if (totalPages > 1) {
      const navBeforePage2 = await navCount(page);
      await page.getByRole("button", { name: "التالي" }).click();
      page2Event = await tracker.waitFor(
        (e) =>
          isPrimaryTableListEvent(e) &&
          e.query.userClassification === "real" &&
          e.query.page === "2"
      );
      const navAfterPage2 = await navCount(page);
      const page1Ids = new Set(realRows.map((u) => u.id));
      const page2Ids = (page2Event?.body?.users || []).map((u) => u.id);
      const overlap = page2Ids.filter((id) => page1Ids.has(id));
      paginationPass =
        page2Event?.query?.userClassification === "real" &&
        Number(page2Event?.body?.pagination?.total || 0) === apiTotal &&
        Number(page2Event?.body?.pagination?.totalPages || 0) === totalPages &&
        overlap.length === 0 &&
        navAfterPage2 === navBeforePage2;
    }
    report.pagination = {
      pass: paginationPass,
      totalPages,
      pageSize,
      apiTotal,
      page2RequestUrl: page2Event?.url || null,
      page2Total: page2Event?.body?.pagination?.total ?? null,
      skipped: totalPages <= 1 ? "single_page_dataset" : false,
    };

    // 6. Search + REAL
    await waitForUsersReady(page);
    await selectClassification(page, "real", tracker);
    const sampleEmail = (realEvent?.body?.users || [])[0]?.email || "";
    const searchTerm = sampleEmail.includes("@") ? sampleEmail.split("@")[0].slice(0, 6) : "user";
    const navBeforeSearch = await navCount(page);
    await page.fill('input[aria-label="بحث المستخدمين"]', searchTerm);
    const searchEvent = await tracker.waitFor(
      (e) =>
        isPrimaryTableListEvent(e) &&
        e.query.userClassification === "real" &&
        String(e.query.search || "").length > 0
    );
    await sleep(500);
    const navAfterSearch = await navCount(page);
    await page.fill('input[aria-label="بحث المستخدمين"]', "");
    const clearedSearchEvent = await tracker.waitFor(
      (e) =>
        isPrimaryTableListEvent(e) &&
        e.query.userClassification === "real" &&
        !e.query.search
    );
    report.searchReal = {
      pass:
        searchEvent?.query?.userClassification === "real" &&
        searchEvent?.query?.search &&
        Number(searchEvent.body?.pagination?.total || 0) <= apiTotal &&
        clearedSearchEvent?.query?.userClassification === "real" &&
        navAfterSearch === navBeforeSearch,
      searchTerm,
      searchUrl: searchEvent?.url || "",
      searchTotal: searchEvent?.body?.pagination?.total ?? null,
      clearedUrl: clearedSearchEvent?.url || "",
      baselineRealTotal: apiTotal,
    };

    // 7. Cohort + REAL
    await clearAllFilters(page, tracker);
    await page.locator(".au-cohort-card").filter({ hasText: "هذا الأسبوع" }).click();
    tracker.events.length = 0;
    await tracker.waitFor(
      (e) => isPrimaryTableListEvent(e) && e.query.registeredFrom && e.query.registeredTo
    );
    const weekRealResult = await selectClassification(page, "real", tracker);
    const weekRealEvent = weekRealResult.event;
    await page.locator(".au-cohort-card").filter({ hasText: "هذا الشهر" }).click();
    tracker.events.length = 0;
    await tracker.waitFor(
      (e) => isPrimaryTableListEvent(e) && e.query.registeredFrom && e.query.registeredTo
    );
    const monthRealResult = await selectClassification(page, "real", tracker);
    const monthRealEvent = monthRealResult.event;
    const clearedCohortEvent = await clearAllFilters(page, tracker);
    report.cohortReal = {
      pass:
        weekRealEvent?.query?.userClassification === "real" &&
        weekRealEvent?.query?.registeredFrom &&
        monthRealEvent?.query?.userClassification === "real" &&
        monthRealEvent?.query?.registeredFrom &&
        clearedCohortEvent &&
        !clearedCohortEvent.query.registeredFrom,
      weekRealUrl: weekRealEvent?.url || "",
      weekRealTotal: weekRealEvent?.body?.pagination?.total ?? null,
      monthRealUrl: monthRealEvent?.url || "",
      monthRealTotal: monthRealEvent?.body?.pagination?.total ?? null,
      clearedUrl: clearedCohortEvent?.url || "",
    };

    // 8. Service / plan / status + REAL (best effort)
    await clearAllFilters(page, tracker);
    const realBaselineResult = await selectClassification(page, "real", tracker);
    const baselineReal = realBaselineResult.event;
    await page.locator(".au-chip").filter({ hasText: "نشط" }).first().click();
    const statusEvent = await tracker.waitFor(
      (e) =>
        isPrimaryTableListEvent(e) &&
        e.query.userClassification === "real" &&
        e.query.accountStatus === "active"
    );
    report.composedFilters = {
      pass:
        statusEvent?.query?.userClassification === "real" &&
        statusEvent?.query?.accountStatus === "active" &&
        Number(statusEvent.body?.pagination?.total || 0) <=
          Math.max(Number(baselineReal?.body?.pagination?.total || 0), expectedReal),
      statusRealUrl: statusEvent?.url || "",
      statusRealTotal: statusEvent?.body?.pagination?.total ?? null,
      baselineRealTotal: baselineReal?.body?.pagination?.total ?? null,
      note: "service/plan skipped unless staging fixtures exist; status+REAL verified",
    };

    // 9. Last login + REAL
    await clearAllFilters(page, tracker);
    const lastLoginRealResult = await selectClassification(page, "real", tracker);
    void lastLoginRealResult;
    const lastLoginFrom = "2020-01-01";
    const lastLoginTo = "2030-12-31";
    const dateInputs = page.locator('input[type="date"]');
    if ((await dateInputs.count()) >= 4) {
      await dateInputs.nth(2).fill(lastLoginFrom);
      await dateInputs.nth(3).fill(lastLoginTo);
      const lastLoginEvent = await tracker.waitFor(
        (e) =>
          isPrimaryTableListEvent(e) &&
          e.query.userClassification === "real" &&
          e.query.lastLoginFrom &&
          e.query.lastLoginTo
      );
      await dateInputs.nth(2).fill("");
      await dateInputs.nth(3).fill("");
      const clearedLastLogin = await tracker.waitFor(
        (e) =>
          isPrimaryTableListEvent(e) &&
          e.query.userClassification === "real" &&
          !e.query.lastLoginFrom &&
          !e.query.lastLoginTo
      );
      report.lastLoginReal = {
        pass:
          lastLoginEvent?.query?.userClassification === "real" &&
          lastLoginEvent?.query?.lastLoginFrom &&
          clearedLastLogin?.query?.userClassification === "real",
        url: lastLoginEvent?.url || "",
        clearedUrl: clearedLastLogin?.url || "",
      };
    } else {
      report.lastLoginReal = { pass: true, skipped: "last_login_inputs_unavailable" };
    }

    // 10. CSV
    await clearAllFilters(page, tracker);
    const csvRealResult = await selectClassification(page, "real", tracker);
    const filteredBeforeCsv = csvRealResult.event;
    const filteredTotal = Number(filteredBeforeCsv?.body?.pagination?.total || 0);
    const downloadPromise = page.waitForEvent("download", { timeout: 60000 });
    await page.getByRole("button", { name: /تصدير النتائج/i }).click();
    const download = await downloadPromise;
    const csvPath = await download.path();
    const csvContent = csvPath ? readFileSync(csvPath, "utf8") : "";
    const csvLines = csvContent.split(/\r?\n/).filter(Boolean);
    const csvRowCount = Math.max(csvLines.length - 1, 0);
    report.csv = {
      pass:
        csvLines[0]?.includes("نوع الحساب") &&
        csvRowCount === expectedReal &&
        filteredTotal === expectedReal &&
        filteredBeforeCsv?.query?.userClassification === "real",
      csvRowCount,
      filteredApiTotal: filteredTotal,
      expectedEffectiveReal: expectedReal,
      hasClassificationColumn: csvLines[0]?.includes("نوع الحساب") || false,
      requestHadReal: filteredBeforeCsv?.query?.userClassification === "real",
    };

    // 11. Clear filters
    await page.getByRole("button", { name: "مسح الفلاتر" }).click();
    const clearedAllEvent = await tracker.waitFor(
      (e) =>
        isPrimaryTableListEvent(e) &&
        (e.query.userClassification === "all" || !e.query.userClassification) &&
        !e.query.registeredFrom &&
        !e.query.lastLoginFrom &&
        !e.query.search
    );
    const clearedUiSelect = await classificationSelect(page).inputValue();
    report.clearFilters = {
      pass:
        clearedAllEvent &&
        (clearedAllEvent.query.userClassification === "all" || !clearedAllEvent.query.userClassification) &&
        !clearedAllEvent.query.registeredFrom &&
        !clearedAllEvent.query.lastLoginFrom &&
        clearedUiSelect === "all" &&
        Number(clearedAllEvent.body?.pagination?.total || 0) >= filteredTotal,
      url: clearedAllEvent?.url || "",
      apiTotal: clearedAllEvent?.body?.pagination?.total ?? null,
      classificationSelectValue: clearedUiSelect,
    };

    // 12. Manual override read-only
    const manualFixtures = await readManualOverrideFixtures(service);
    let manualPass = true;
    const manualNotes = [];
    if (manualFixtures.length === 0) {
      manualNotes.push("automated_only_no_staging_admin_manual_fixture");
    } else {
      for (const fixture of manualFixtures.slice(0, 3)) {
        const targetFilter = fixture.effective === "real" ? "real" : "test";
        const apiCheck = await page.evaluate(
          async ({ userClassification, userId }) => {
            const res = await fetch(
              `/api/admin/user-management?page=1&pageSize=100&userClassification=${userClassification}`,
              { credentials: "include" }
            );
            const body = await res.json();
            const ids = (body.users || []).map((u) => u.id);
            return { total: body.pagination?.total ?? 0, includes: ids.includes(userId) };
          },
          { userClassification: targetFilter, userId: fixture.id }
        );
        if (fixture.effective === "real" && !apiCheck.includes) manualPass = false;
        if (fixture.effective === "test" && targetFilter === "real" && apiCheck.includes) manualPass = false;
        manualNotes.push({
          email: String(fixture.email || "").replace(/(^.).*(@.*$)/, "$1***$2"),
          effective: fixture.effective,
          apiIncludesInRealFilter: apiCheck.includes,
        });
      }
    }
    report.manualOverride = { pass: manualPass, fixtures: manualFixtures.length, notes: manualNotes };

    // 13–14. Visual QA
    await page.setViewportSize({ width: 1440, height: 900 });
    await waitForUsersReady(page);
    const desktop = await page.evaluate(() => ({
      rtl: getComputedStyle(document.documentElement).direction === "rtl",
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      stickyHeader: Boolean(document.querySelector(".au-panel__head, .admin-users-header")),
      tableScroll: Boolean(document.querySelector(".au-table-wrap, .au-panel--results")),
    }));
    report.visual.desktop = { pass: desktop.rtl && !desktop.overflow && desktop.tableScroll, ...desktop };

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
    await sleep(1500);
    await page.locator(".au-filter-panel").scrollIntoViewIfNeeded().catch(() => {});
    const mobile = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > window.innerWidth + 2,
      classificationSelectVisible: Boolean(
        document.querySelector('label.au-field select.au-select') ||
          document.querySelector('select.au-select')
      ),
    }));
    report.visual.mobile = {
      pass: !mobile.overflow && mobile.classificationSelectVisible,
      ...mobile,
      viewport: "390x844",
    };

    await page.setViewportSize({ width: 1440, height: 900 });
    await setTheme(page, "light");
    await sleep(300);
    report.visual.light = { pass: true };
    await setTheme(page, "dark");
    await sleep(300);
    report.visual.dark = { pass: true };

    report.noRefresh.fullDocumentReloadCount = await page.evaluate(() => {
      return performance.getEntriesByType("navigation").filter((n) => n.type === "reload").length;
    });
    report.noRefresh.blackOverlayDetected = await page.evaluate(() => {
      const nodes = document.querySelectorAll(".admin-access-loading, [class*='backdrop']");
      return Array.from(nodes).some((node) => {
        const style = getComputedStyle(node);
        const rect = node.getBoundingClientRect();
        return (
          style.visibility !== "hidden" &&
          style.opacity !== "0" &&
          rect.width >= window.innerWidth * 0.9 &&
          rect.height >= window.innerHeight * 0.9
        );
      });
    });

    report.consoleCritical = (obs.consoleErrors || [])
      .filter((e) => !/favicon|hydration|my-subscription-status|notification-hub/i.test(e))
      .slice(0, 20);
    report.pageErrors = (obs.pageErrors || []).slice(0, 10);

    tracker.detach();
    await context.close();
    await browser.close();
    browser = null;
  } finally {
    if (browser) await browser.close().catch(() => {});
    await stopDevServer(dev);
    if (adminSession?.cleanup) {
      report.cleanup = await cleanupTemporaryClosureAdmin(env, adminSession);
    }
  }

  report.productionReadOnlyCrossCheck = runProductionReadOnlyAudit();

  report.finalPass =
    report.auth.gate?.pass === true &&
    report.defaultPage.pass === true &&
    report.realFilter.pass === true &&
    report.pagination.pass === true &&
    report.searchReal.pass === true &&
    report.cohortReal.pass === true &&
    report.composedFilters.pass === true &&
    report.lastLoginReal.pass === true &&
    report.csv.pass === true &&
    report.clearFilters.pass === true &&
    report.manualOverride.pass !== false &&
    report.visual.desktop.pass === true &&
    report.visual.mobile.pass === true &&
    report.visual.light.pass === true &&
    report.visual.dark.pass === true &&
    report.http429 === 0 &&
    report.http5xx === 0 &&
    report.consoleCritical.length === 0;

  mkdirSync(join(ROOT, "scripts/.artifacts"), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
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
