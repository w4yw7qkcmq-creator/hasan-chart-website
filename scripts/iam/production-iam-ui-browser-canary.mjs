#!/usr/bin/env node
/**
 * Production IAM admin UI browser canary — read-only, no grant/revoke mutations.
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const ROOT = process.cwd();
const BASE = "https://www.hasanchartworld.com";
const ARTIFACT_DIR = join(ROOT, "scripts/iam/.artifacts/production-ui-browser-canary");
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const TAB_LABELS = [
  "نظرة عامة",
  "المستخدمون الإداريون",
  "الأدوار والصلاحيات",
  "التعيينات",
  "الاستثناءات الفردية",
  "الجلسات النشطة",
  "الأحداث الأمنية",
  "سجل التدقيق",
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

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

function loadProductionEnv() {
  const local = parseEnvFile(resolve(ROOT, ".env.local"));
  const bootstrap = parseEnvFile(resolve(ROOT, ".env.production.bootstrap.local"));
  const env = { ...local, ...bootstrap };
  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL || local.NEXT_PUBLIC_SUPABASE_URL,
    anon: env.NEXT_PUBLIC_SUPABASE_ANON_KEY || local.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ownerEmail: env.IAM_OWNER_EMAIL,
    ownerPassword: env.PRODUCTION_OWNER_PASSWORD,
  };
}

async function fetchHealthCommit() {
  const res = await fetch(`${BASE}/api/health`);
  const json = await res.json();
  return {
    ok: res.status === 200 && json.status === "ok" && json.readiness === "ready",
    commit: String(json.build?.commit || ""),
    iam: json.iam?.effective || {},
    iamOk: json.iam?.validation?.ok === true,
  };
}

async function loginContext(context, env) {
  const anon = createClient(env.url, env.anon, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({
    email: env.ownerEmail,
    password: env.ownerPassword,
  });
  if (error || !data?.session?.access_token) {
    throw new Error(`Production login failed: ${error?.message || "no session"}`);
  }
  await context.addCookies([
    {
      name: "hc_access_token",
      value: data.session.access_token,
      url: `${BASE}/`,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
    {
      name: "hc_refresh_token",
      value: data.session.refresh_token,
      url: `${BASE}/`,
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    },
  ]);
}

function attachObservers(report, page) {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (/favicon|404.*\.map|hydration/i.test(t)) return;
    report.consoleErrors.push(t.slice(0, 240));
  });
  page.on("response", (res) => {
    const url = res.url();
    if ((url.includes("/api/iam") || url.includes("/api/admin")) && res.status() >= 500) {
      report.networkFailures.push({ url: url.split("?")[0], status: res.status() });
    }
  });
}

async function iamDomChecks(page) {
  return page.evaluate(({ tabLabels, uuidPattern }) => {
    const h1 = document.querySelector(".iam-page-header h1")?.textContent?.trim() || "";
    const tabs = [...document.querySelectorAll(".iam-tabs__btn")].map((b) => (b.textContent || "").trim());
    const dir = document.documentElement.getAttribute("dir");
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
    const statCards = document.querySelectorAll(".iam-stat, .iam-stat-card").length;
    const userNames = [...document.querySelectorAll(".iam-user-cell strong")].map((el) => el.textContent?.trim() || "");
    const uuidAsPrimaryName = userNames.some((n) => new RegExp(uuidPattern, "i").test(n));
    const rawJsonInTable = /^\s*\{/.test(
      [...document.querySelectorAll(".iam-table tbody td")].map((td) => td.textContent?.trim() || "")[0] || ""
    );
    const hasEnglishRevoke = /\bRevoke\b/i.test(document.body.innerText || "");
    const tabsPresent = tabLabels.filter((label) => tabs.some((t) => t.includes(label)));
    return {
      h1,
      tabs,
      dir,
      overflowX,
      statCards,
      uuidAsPrimaryName,
      rawJsonInTable,
      hasEnglishRevoke,
      tabsPresentCount: tabsPresent.length,
      hasIamPage: Boolean(document.querySelector(".admin-iam-page")),
      hasOverviewTab: tabs.some((t) => t.includes("نظرة عامة")),
    };
  }, { tabLabels: TAB_LABELS, uuidPattern: UUID_RE.source });
}

async function waitForIamReady(page, timeoutMs = 35000) {
  await page
    .waitForResponse((res) => res.url().includes("/api/iam/roles") && res.status() === 200, {
      timeout: timeoutMs,
    })
    .catch(() => null);

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const loading = await page.locator(".iam-loading, .iam-loading-skeleton").count();
    const checks = await iamDomChecks(page);
    if (checks.hasIamPage && checks.hasOverviewTab && checks.tabsPresentCount >= 6 && loading === 0) {
      return { ok: true, checks };
    }
    await page.waitForTimeout(500);
  }
  const checks = await iamDomChecks(page);
  const ok = checks.hasIamPage && checks.hasOverviewTab && checks.tabsPresentCount >= 6;
  return { ok, checks, error: ok ? null : "iam_ready_timeout" };
}

async function clickTab(page, label) {
  const clicked = await page.evaluate((tabLabel) => {
    const btn = [...document.querySelectorAll(".iam-tabs__btn")].find((b) =>
      (b.textContent || "").includes(tabLabel)
    );
    if (!btn) return false;
    btn.scrollIntoView({ inline: "center", block: "nearest" });
    btn.click();
    return true;
  }, label);
  if (!clicked) return { clicked: false, label };
  await page.waitForTimeout(700);
  return { clicked: true, label };
}

async function visibleTabLabels(page) {
  return page.locator(".iam-tabs__btn").evaluateAll((nodes) =>
    nodes.map((n) => (n.textContent || "").replace(/\s+/g, " ").trim())
  );
}

async function testGrantModal(page, report) {
  const grantBtn = page.getByRole("button", { name: /إسناد دور/i }).first();
  const visible = await grantBtn.isVisible().catch(() => false);
  if (!visible) {
    report.grantModal = { skipped: true, reason: "grant_button_not_visible" };
    return;
  }
  await grantBtn.click();
  await page.waitForSelector(".iam-modal", { timeout: 5000 });
  const step1 = await page.locator(".iam-modal").isVisible();
  const hasEmailField = await page.locator('.iam-modal input[type="email"], .iam-modal input').first().isVisible();
  const nextBtn = page.getByRole("button", { name: /التالي|متابعة/i }).first();
  if (await nextBtn.isVisible().catch(() => false)) {
    await page.locator('.iam-modal input[type="email"], .iam-modal input').first().fill("qa-readonly@example.com");
    await nextBtn.click();
    await page.waitForTimeout(400);
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const closed = !(await page.locator(".iam-modal").isVisible().catch(() => false));
  report.grantModal = { opened: step1, hasEmailField, closedWithEscape: closed, submitted: false, pass: step1 && closed };
}

async function testRevokeModal(page, report) {
  await clickTab(page, "التعيينات");
  await page.waitForTimeout(800);
  const revokeBtn = page.getByRole("button", { name: /إلغاء التعيين/i }).first();
  const visible = await revokeBtn.isVisible().catch(() => false);
  if (!visible) {
    report.revokeModal = { skipped: true, reason: "revoke_button_not_visible" };
    return;
  }
  await revokeBtn.click();
  await page.waitForSelector(".iam-modal--danger", { timeout: 5000 });
  const title = await page.locator("#iam-revoke-title").textContent().catch(() => "");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const closed = !(await page.locator(".iam-modal--danger").isVisible().catch(() => false));
  report.revokeModal = {
    opened: /إلغاء صلاحيات/i.test(title || ""),
    closedWithEscape: closed,
    submitted: false,
    pass: /إلغاء صلاحيات/i.test(title || "") && closed,
  };
}

async function testUserDrawer(page, report) {
  await clickTab(page, "المستخدمون الإداريون");
  await page.waitForTimeout(800);
  const detailsBtn = page.getByRole("button", { name: "عرض التفاصيل" }).first();
  if (!(await detailsBtn.isVisible().catch(() => false))) {
    report.userDrawer = { skipped: true, reason: "no_users" };
    return;
  }
  await detailsBtn.click();
  await page.waitForSelector(".iam-drawer", { timeout: 5000 });
  const drawerText = await page.locator(".iam-drawer").innerText();
  const uuidInHeader = UUID_RE.test(drawerText.split("\n")[0] || "");
  const rawPermIds = /\b(iam\.read|users\.read|dashboard\.read)\b/.test(
    drawerText.replace(/تفاصيل تقنية[\s\S]*/u, "")
  );
  await page.keyboard.press("Escape");
  report.userDrawer = {
    opened: true,
    uuidInHeader,
    rawPermIdsAsPrimary: rawPermIds,
    pass: !uuidInHeader && !rawPermIds,
  };
}

async function testTabs(page, report) {
  const visible = await visibleTabLabels(page);
  const results = [];
  for (const label of TAB_LABELS) {
    const match = visible.find((t) => t.includes(label));
    if (!match) {
      results.push({ tab: label, skipped: true, reason: "not_visible_for_user", pass: true });
      continue;
    }
    await clickTab(page, label);
    await page.waitForTimeout(700);
    const panelVisible = await page.locator(".iam-tab-panel").first().isVisible().catch(() => false);
    const checks = await iamDomChecks(page);
    results.push({
      tab: label,
      panelVisible,
      overflowX: checks.overflowX,
      pass: panelVisible && !checks.overflowX,
    });
  }
  report.tabs = results;
}

async function testUnauthenticated(page, report) {
  const res = await page.goto(`${BASE}/admin/iam`, { waitUntil: "domcontentloaded" });
  const url = page.url();
  const forbidden = /\/login|403|forbidden/i.test(url) || (await page.locator(".admin-forbidden-page").count()) > 0;
  const leakedData = (await page.locator(".iam-table tbody tr").count()) > 0;
  report.unauthenticated = {
    status: res?.status(),
    url,
    forbidden,
    leakedData,
    pass: forbidden && !leakedData,
  };
}

async function runProductionBrowserCanary() {
  const env = loadProductionEnv();
  if (!env.url || !env.anon || !env.ownerEmail || !env.ownerPassword) {
    throw new Error("Missing production browser QA credentials in env files");
  }

  const health = await fetchHealthCommit();
  const report = {
    ok: false,
    base: BASE,
    health,
    consoleErrors: [],
    networkFailures: [],
    startedAt: new Date().toISOString(),
  };

  if (!health.ok) {
    report.verdict = "STOPPED — HEALTH FAILED";
    return report;
  }
  if (!health.commit.startsWith("55abc01")) {
    report.verdict = "STOPPED — COMMIT MISMATCH";
    report.ok = false;
    return report;
  }
  if (!health.iam.IAM_DB || !health.iam.IAM_API || !health.iam.IAM_UI || !health.iam.IAM_RLS) {
    report.verdict = "STOPPED — IAM FLAGS CHANGED";
    return report;
  }

  const browser = await chromium.launch({ headless: true });
  try {
    // Unauthenticated guard
    {
      const context = await browser.newContext({ viewport: VIEWPORTS[0] });
      const page = await context.newPage();
      attachObservers(report, page);
      await testUnauthenticated(page, report);
      await context.close();
    }

    // Super admin full UI
    {
      const context = await browser.newContext({ viewport: VIEWPORTS[0], locale: "ar" });
      const page = await context.newPage();
      attachObservers(report, page);
      attachObservers(report, page);
      await loginContext(context, env);
      await page.goto(`${BASE}/admin/iam`, { waitUntil: "domcontentloaded", timeout: 30000 });
      const ready = await waitForIamReady(page);
      report.initial = ready;

      if (ready.ok || ready.checks?.hasIamPage) {
        await testTabs(page, report);
        await clickTab(page, "نظرة عامة");
        await testGrantModal(page, report);
        await testRevokeModal(page, report);
        await testUserDrawer(page, report);
      }

      report.superAdminDesktop = {
        ...ready.checks,
        pass:
          ready.checks?.hasIamPage &&
          ready.checks.h1.includes("إدارة الصلاحيات") &&
          !ready.checks.uuidAsPrimaryName &&
          !ready.checks.hasEnglishRevoke &&
          ready.checks.tabsPresentCount >= 6,
      };
      await context.close();
    }

    // Responsive + theme
    report.responsive = [];
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({ viewport: vp, locale: "ar" });
      const page = await context.newPage();
      await loginContext(context, env);
      await page.goto(`${BASE}/admin/iam`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await waitForIamReady(page, 15000);
      const checks = await iamDomChecks(page);
      report.responsive.push({
        viewport: vp.name,
        overflowX: checks.overflowX,
        hasIamPage: checks.hasIamPage,
        pass: checks.hasIamPage && !checks.overflowX,
      });
      await context.close();
    }

    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: VIEWPORTS[0], locale: "ar" });
      const page = await context.newPage();
      await loginContext(context, env);
      await page.goto(`${BASE}/admin/iam`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await waitForIamReady(page, 20000);
      await page.evaluate((t) => {
        document.documentElement.setAttribute("data-theme", t);
        document.documentElement.classList.toggle("dark", t === "dark");
        document.documentElement.classList.toggle("light", t === "light");
      }, theme);
      await page.waitForTimeout(400);
      const applied = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
      const checks = await iamDomChecks(page);
      report.themes = report.themes || [];
      report.themes.push({
        theme,
        applied,
        pass: applied === theme && checks.hasIamPage && !checks.overflowX,
      });
      await context.close();
    }

    const tabFail = (report.tabs || []).some((t) => !t.pass);
    const p0 =
      report.unauthenticated?.leakedData ||
      report.networkFailures.some((n) => n.status >= 500) ||
      report.initial?.checks?.uuidAsPrimaryName;
    const p1 =
      tabFail ||
      report.superAdminDesktop?.pass === false ||
      (report.grantModal && report.grantModal.pass === false) ||
      (report.revokeModal && report.revokeModal.pass === false) ||
      (report.userDrawer && report.userDrawer.pass === false) ||
      report.consoleErrors.length > 0;

    report.ok = !p0 && !p1;
    report.p0 = p0;
    report.p1 = p1;
    report.verdict = report.ok
      ? "IAM ADMIN UI PRODUCTION BROWSER CANARY PASS"
      : p0
        ? "STOPPED — P0 BROWSER CANARY"
        : "STOPPED — P1 BROWSER CANARY";
  } finally {
    await browser.close();
  }

  report.finishedAt = new Date().toISOString();
  return report;
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const report = await runProductionBrowserCanary();
  const path = join(ARTIFACT_DIR, `canary-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(report, null, 2));
  report.artifactPath = path;
  console.log(JSON.stringify({ ok: report.ok, verdict: report.verdict, artifactPath: path }, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e.message }));
  process.exit(1);
});
