#!/usr/bin/env node
/**
 * Production read-only browser smoke — Admin Users CRM + Classification.
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PRODUCTION_SUPABASE_PROJECT_REF, maskProjectRef } from "../lib/staging-env-guard.js";

const BASE = "https://www.hasanchartworld.com";
const ROOT = resolve(process.cwd());
const ARTIFACT = join(ROOT, ".artifacts/admin-users-production-browser-smoke.json");

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i <= 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function login(context, env) {
  const email = env.IAM_OWNER_EMAIL || env.ADMIN_EMAIL;
  const password = env.IAM_OWNER_PASSWORD || env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error("missing_production_admin_credentials");
  const urlRef = String(env.NEXT_PUBLIC_SUPABASE_URL || "").match(/https:\/\/([^.]+)\.supabase\.co/i)?.[1];
  if (urlRef !== PRODUCTION_SUPABASE_PROJECT_REF) throw new Error(`wrong_supabase_ref:${maskProjectRef(urlRef || "none")}`);
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) throw new Error("production_login_failed");
  await context.addCookies([
    { name: "hc_access_token", value: data.session.access_token, url: `${BASE}/`, httpOnly: true, secure: true, sameSite: "Lax" },
    { name: "hc_refresh_token", value: data.session.refresh_token, url: `${BASE}/`, httpOnly: true, secure: true, sameSite: "Lax" },
  ]);
  return { email, userId: data.user?.id };
}

async function main() {
  const env = { ...process.env, ...parseEnvFile(join(ROOT, ".env.local")), ...parseEnvFile(join(ROOT, ".env.production.bootstrap.local")) };
  const report = {
    generatedAt: new Date().toISOString(),
    base: BASE,
    productionRef: maskProjectRef(PRODUCTION_SUPABASE_PROJECT_REF),
    http429: 0,
    http5xx: 0,
    consoleCritical: [],
    manualClassification: { skipped: true, reason: "PRODUCTION_MANUAL_CLASSIFICATION_MUTATION_SKIPPED_FOR_SAFETY" },
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "ar", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on("response", (r) => {
    if (r.status() === 429) report.http429 += 1;
    if (r.status() >= 500) report.http5xx += 1;
  });
  page.on("console", (msg) => {
    if (msg.type() === "error" && !/favicon|hydration/i.test(msg.text())) report.consoleCritical.push(msg.text().slice(0, 200));
  });

  await login(context, env);
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await sleep(1500);

  const me = await page.evaluate(async () => {
    const res = await fetch("/api/iam/me", { credentials: "include" });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  });
  report.iam = { status: me.status, isAdmin: me.body?.isAdmin === true };

  await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForResponse((r) => r.url().includes("/api/admin/user-management") && r.status() === 200 && !r.url().includes("/stats"), { timeout: 90000 }).catch(() => null);
  await sleep(2000);

  report.adminUsers = {
    kpi: (await page.locator(".au-kpi-card, .admin-user-stat-card").count()) > 0,
    cohorts: (await page.locator(".au-cohort-card").count()) >= 3,
    classificationFilter: (await page.locator('label.au-field').filter({ hasText: "نوع الحساب" }).count()) > 0,
    search: (await page.locator('input[aria-label="بحث المستخدمين"]').count()) > 0,
    noMigrationWarning: !(await page.locator(".au-notice--warning").filter({ hasText: /migration|غير متاح/i }).count()),
  };

  const navBefore = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  const link = page.locator("tbody tr").filter({ hasNotText: "admin-users-read-only" }).locator('a[href^="/admin/users/"]').first();
  await link.waitFor({ state: "visible", timeout: 60000 });
  await link.click();
  await page.waitForURL(/\/admin\/users\//, { timeout: 30000 });
  await sleep(1500);
  const navAfter = await page.evaluate(() => performance.getEntriesByType("navigation").length);
  const overlay = await page.evaluate(() => Boolean(document.querySelector(".admin-access-loading")));
  report.overlay = { pass: !overlay && navAfter === navBefore, navBefore, navAfter, darkLoading: overlay };

  const tabs = page.locator(".admin-user-drawer__tab");
  const tabCount = await tabs.count();
  report.crm = { tabCount, pass: tabCount >= 8, hero: (await page.locator(".admin-user-center-shell, .admin-user-drawer--wide").count()) > 0 };

  await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  const previewBtn = page.locator("button.au-btn").filter({ hasText: "معاينة" }).first();
  await previewBtn.click();
  await page.locator(".admin-user-drawer--preview").waitFor({ state: "visible", timeout: 15000 });
  report.preview = {
    pass: (await page.locator(".admin-user-preview-card").innerText()).includes("@"),
    hasCta: (await page.getByRole("link", { name: /فتح CRM الكامل/i }).count()) > 0,
  };
  await page.keyboard.press("Escape");

  const filterUrls = [];
  page.on("response", (r) => {
    const u = r.url();
    if (r.request().method() === "GET" && u.includes("/api/admin/user-management") && !u.includes("/stats") && r.status() === 200) {
      filterUrls.push(u);
    }
  });
  await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
  await sleep(2000);
  const select = page.locator("label.au-field").filter({ hasText: "نوع الحساب" }).locator("select");
  for (const value of ["real", "test", "e2e", "internal", "suspected", "unknown"]) {
    await select.selectOption(value);
    await page.waitForResponse((r) => r.url().includes(`userClassification=${value}`) && r.status() === 200, { timeout: 15000 }).catch(() => null);
    await sleep(500);
  }
  report.filters = { pass: filterUrls.some((u) => u.includes("userClassification=")), samples: filterUrls.slice(-3) };

  await select.selectOption("test");
  await sleep(1200);
  const downloadPromise = page.waitForEvent("download", { timeout: 45000 });
  await page.getByRole("button", { name: /تصدير النتائج/i }).click();
  const download = await downloadPromise;
  const csvPath = await download.path();
  const csvHeader = csvPath ? readFileSync(csvPath, "utf8").split(/\r?\n/)[0] : "";
  report.csv = { pass: csvHeader.includes("نوع الحساب"), hasColumn: csvHeader.includes("نوع الحساب") };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
  await sleep(1200);
  report.mobile = { pass: !(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2)) };

  report.finalPass =
    report.iam.isAdmin &&
    report.adminUsers.classificationFilter &&
    report.overlay.pass &&
    report.crm.pass &&
    report.preview.pass &&
    report.filters.pass &&
    report.csv.pass &&
    report.mobile.pass &&
    report.http429 === 0 &&
    report.http5xx === 0 &&
    report.consoleCritical.length === 0;

  mkdirSync(join(ROOT, ".artifacts"), { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report, null, 2));
  if (!report.finalPass) process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
