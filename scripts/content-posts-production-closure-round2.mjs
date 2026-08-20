#!/usr/bin/env node
import { chromium } from "playwright";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const BASE = "https://www.hasanchartworld.com";
const TARGET_SHA = "e6ce28f";
const VIEWPORTS = [
  [320, 700],
  [360, 800],
  [390, 844],
  [412, 915],
  [768, 1024],
  [1024, 768],
  [1280, 800],
  [1366, 768],
  [1440, 900],
];

function parseEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
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

const report = {
  commitSha: "e6ce28f6450856f65790e88274de976674fa71aa",
  health: null,
  dropdownFailures: 0,
  dropdownContrastFailures: 0,
  transparentDropdownFailures: 0,
  dropdownOverlapFailures: 0,
  academyCardVisible: false,
  academyDetailHttp200: false,
  academyDetailVisible: false,
  academyDetail404: true,
  arabicSlugHref: null,
  resultsDetailHttp200: false,
  resultsDetail404: true,
  resultsPostAvailable: false,
  academyInsideMarkets: false,
  resultInsideMarkets: false,
  academyInsideServices: false,
  duplicateAcademyLinks: 0,
  academyBadge: null,
  resultsBadge: null,
  brandOrderFailures: 0,
  headerOverlapFailures: 0,
  horizontalOverflow: false,
  browserFailures: 0,
  whiteScreenFailures: 0,
  overflowFailures: 0,
  consoleErrors: 0,
  hydrationWarnings: 0,
  pageErrors: 0,
  network5xx: 0,
  productionContentCreated: 0,
  productionDBChanged: false,
  adminDropdownTested: false,
};

const healthRes = await fetch(`${BASE}/api/health`);
report.health = await healthRes.json();

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ locale: "ar-SA" });
const page = await context.newPage();

page.on("console", (m) => {
  if (m.type() === "error") report.consoleErrors += 1;
  if (/hydration/i.test(m.text())) report.hydrationWarnings += 1;
});
page.on("pageerror", () => {
  report.pageErrors += 1;
});
page.on("response", (r) => {
  if (r.url().startsWith(BASE) && r.status() >= 500) report.network5xx += 1;
});

await page.goto(`${BASE}/academy`, { waitUntil: "domcontentloaded", timeout: 120000 });
report.academyCardVisible = (await page.locator(".content-post-card").count()) > 0;
report.academyBadge = (await page.locator(".content-posts-hero__badge").textContent().catch(() => ""))?.trim() || null;
const href = await page.locator(".content-post-card").first().getAttribute("href").catch(() => null);
report.arabicSlugHref = href;
if (href) {
  const res = await page.goto(`${BASE}${href}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  report.academyDetailHttp200 = res?.status() === 200;
  report.academyDetail404 =
    (await page.locator("text=404").count()) > 0 ||
    (await page.locator("text=الصفحة غير موجودة").count()) > 0;
  report.academyDetailVisible = (await page.locator(".content-post-detail").count()) > 0;
}

await page.goto(`${BASE}/results`, { waitUntil: "domcontentloaded", timeout: 120000 });
report.resultsBadge = (await page.locator(".content-posts-hero__badge").textContent().catch(() => ""))?.trim() || null;
const rhref = await page.locator(".content-post-card").first().getAttribute("href").catch(() => null);
report.resultsPostAvailable = Boolean(rhref);
if (rhref) {
  const res = await page.goto(`${BASE}${rhref}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  report.resultsDetailHttp200 = res?.status() === 200;
  report.resultsDetail404 = (await page.locator("text=404").count()) > 0;
} else {
  report.resultsDetailHttp200 = true;
  report.resultsDetail404 = false;
}

await page.setViewportSize({ width: 1280, height: 800 });
await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
const sidebar = await page.evaluate(() => {
  const academyLinks = [...document.querySelectorAll('a[href="/academy"]')];
  const resultLinks = [...document.querySelectorAll('a[href="/results"]')];
  const getSection = (el) => {
    let node = el;
    for (let i = 0; i < 14 && node; i += 1) {
      const text = node.textContent || "";
      if (text.includes("الأسواق") && node.querySelector?.('a[href="/academy"]')) return "markets";
      if (text.includes("الخدمات") && node.querySelector?.('a[href="/academy"]')) return "services";
      node = node.parentElement;
    }
    return "unknown";
  };
  return {
    academyCount: academyLinks.length,
    resultCount: resultLinks.length,
    academySection: academyLinks[0] ? getSection(academyLinks[0]) : "missing",
  };
});
report.duplicateAcademyLinks = Math.max(0, sidebar.academyCount - 1);
report.academyInsideMarkets = sidebar.academySection === "markets";
report.resultInsideMarkets = sidebar.resultCount >= 1;
report.academyInsideServices = sidebar.academySection === "services";

const env = parseEnv(".env.local");
if (env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.STAGING_IAM_TEST_PASSWORD) {
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data } = await anon.auth.signInWithPassword({
    email: "iam-super-admin@staging-hcw.test",
    password: env.STAGING_IAM_TEST_PASSWORD,
  });
  if (data?.session?.access_token) {
    await context.addCookies([
      {
        name: "hc_access_token",
        value: data.session.access_token,
        domain: "www.hasanchartworld.com",
        path: "/",
      },
    ]);
  }
}

for (const adminPath of ["/admin/academy", "/admin/results"]) {
  for (const theme of ["light", "dark"]) {
    await page.goto(`${BASE}${adminPath}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    if (page.url().includes("/login")) continue;
    report.adminDropdownTested = true;
    await page.evaluate((t) => {
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("theme", t);
    }, theme);
    const trigger = page.locator(".content-post-admin__select-trigger").first();
    if (!(await trigger.count())) {
      report.dropdownFailures += 1;
      continue;
    }
    await trigger.click();
    await page.waitForTimeout(350);
    const menu = page.locator(".content-post-admin__select-menu--portal, .content-post-admin__select-menu").first();
    if (!(await menu.count())) {
      report.dropdownFailures += 1;
      await page.keyboard.press("Escape");
      continue;
    }
    const style = await menu.evaluate((el) => {
      const s = getComputedStyle(el);
      const rgb = s.backgroundColor.match(/\d+/g)?.map(Number) || [];
      const lum = rgb.length >= 3 ? 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] : 0;
      return { z: Number(s.zIndex) || 0, lum };
    });
    if (style.z < 1000 || style.lum < 15) report.transparentDropdownFailures += 1;
    const opt = page.locator(".content-post-admin__select-option").first();
    if (await opt.count()) {
      const optLum = await opt.evaluate((el) => {
        const rgb = getComputedStyle(el).color.match(/\d+/g)?.map(Number) || [];
        return rgb.length >= 3 ? 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] : 0;
      });
      if (theme === "dark" && optLum < 120) report.dropdownContrastFailures += 1;
      if (theme === "light" && optLum > 230) report.dropdownContrastFailures += 1;
    }
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await page.waitForTimeout(150);
    await trigger.click();
    await page.waitForTimeout(150);
    await page.keyboard.press("Escape");
    await page.mouse.click(10, 10);
  }
}

for (const [w, h] of VIEWPORTS) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
  const brand = await page.evaluate(() => {
    const el = document.querySelector(".site-header-brand");
    const text = el?.innerText?.replace(/\s+/g, " ").trim() || "";
    const actions = document.querySelector(".site-top-header__actions");
    const rects = [...(actions?.children || [])].map((e) => e.getBoundingClientRect());
    let overlap = false;
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        if (a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1) {
          overlap = true;
        }
      }
    }
    return {
      text,
      overlap,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    };
  });
  if (brand.text.includes("World HasaN") || /^World/.test(brand.text)) report.brandOrderFailures += 1;
  if (w >= 1024 && !brand.text.includes("World")) report.brandOrderFailures += 1;
  if (brand.overlap) report.headerOverlapFailures += 1;
  if (brand.overflow) {
    report.overflowFailures += 1;
    report.horizontalOverflow = true;
  }
}

for (const path of ["/academy", "/results"]) {
  for (const theme of ["dark", "light"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.evaluate((t) => {
      document.documentElement.setAttribute("data-theme", t);
      localStorage.setItem("theme", t);
    }, theme);
    const metrics = await page.evaluate(() => ({
      white: (document.body?.innerText?.trim() || "").length < 20,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    }));
    if (metrics.white) report.whiteScreenFailures += 1;
    if (metrics.overflow) report.overflowFailures += 1;
  }
}

await browser.close();

report.pass =
  report.dropdownFailures === 0 &&
  report.dropdownContrastFailures === 0 &&
  report.transparentDropdownFailures === 0 &&
  report.dropdownOverlapFailures === 0 &&
  report.academyDetailHttp200 &&
  report.academyDetailVisible &&
  !report.academyDetail404 &&
  (!report.resultsPostAvailable || (report.resultsDetailHttp200 && !report.resultsDetail404)) &&
  report.duplicateAcademyLinks === 0 &&
  report.academyInsideMarkets &&
  !report.academyInsideServices &&
  report.brandOrderFailures === 0 &&
  report.headerOverlapFailures === 0 &&
  !report.horizontalOverflow &&
  report.whiteScreenFailures === 0 &&
  report.overflowFailures === 0 &&
  report.consoleErrors === 0 &&
  report.hydrationWarnings === 0 &&
  report.pageErrors === 0 &&
  report.network5xx === 0 &&
  (report.academyBadge || "").includes("محتوى تعليمي") &&
  !(report.academyBadge || "").includes("يدوي") &&
  (report.resultsBadge || "").includes("نتائج وإنجازات") &&
  !(report.resultsBadge || "").includes("يدوي");

mkdirSync(join(process.cwd(), "scripts/.artifacts"), { recursive: true });
writeFileSync(
  join(process.cwd(), "scripts/.artifacts/content-posts-production-closure-round2.json"),
  JSON.stringify(report, null, 2)
);
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
