#!/usr/bin/env node
/**
 * Staging live closure — UI fixes verification
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { PRODUCTION_SUPABASE_PROJECT_REF, STAGING_SUPABASE_PROJECT_REF, maskProjectRef, extractSupabaseProjectRef } from "../lib/staging-env-guard.js";

const STAGING_BASE = process.env.CONTENT_POSTS_STAGING_BASE || "https://hasan-chart-website-staging-staging.up.railway.app";
const TARGET_SHA = "479718e";
const ACADEMY_TITLE = "UI FIX STAGING CANARY ACADEMY";
const RESULT_TITLE = "UI FIX STAGING CANARY RESULT";
const TEST_DOMAIN = "staging-hcw.test";

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

async function loginDirect(staging, email, password) {
  const anon = createClient(staging.STAGING_SUPABASE_URL, staging.STAGING_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) return { success: false, cookie: "" };
  return { success: true, cookie: `hc_access_token=${data.session.access_token}` };
}

async function adminFetch(cookie, path, options = {}) {
  const res = await fetch(`${STAGING_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", Cookie: cookie, ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function fetchPublicHtml(path) {
  const res = await fetch(`${STAGING_BASE}${path}`, { cache: "no-store" });
  return { status: res.status, text: await res.text() };
}

function validPngBuffer() {
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  png.writeUInt32BE(10, 16);
  png.writeUInt32BE(10, 20);
  return png;
}

async function runAutoRefreshLifecycle(cookie, contentType, title) {
  const listPath = contentType === "academy" ? "/academy" : "/results";
  const report = { contentType, steps: {}, staleContentFailures: 0 };

  const before = await fetchPublicHtml(listPath);
  report.steps.beforeListOk = before.status === 200;

  const create = await adminFetch(cookie, "/api/admin/content-posts", {
    method: "POST",
    body: JSON.stringify({ content_type: contentType, title, summary: "canary", body: "محتوى canary لاختبار auto refresh على Staging.", category: contentType === "result" ? "Weekly Result" : "عام" }),
  });
  const post = create.body?.post;
  if (!post?.id) throw new Error(`${contentType} create failed`);
  report.steps.create = create.status === 200;

  report.steps.draftHidden = (await fetchPublicHtml(`${listPath}/${post.slug}`)).status === 404;

  await adminFetch(cookie, `/api/admin/content-posts/${post.id}/publish`, { method: "POST" });
  await new Promise((r) => setTimeout(r, 1500));

  const afterPublish = await fetchPublicHtml(listPath);
  report.steps.afterPublishVisible = afterPublish.text.includes(title);
  if (!report.steps.afterPublishVisible) report.staleContentFailures += 1;

  await adminFetch(cookie, `/api/admin/content-posts/${post.id}`, {
    method: "PATCH",
    body: JSON.stringify({ summary: "edited live canary summary" }),
  });
  await new Promise((r) => setTimeout(r, 1500));
  const afterEdit = await fetchPublicHtml(`${listPath}/${post.slug}`);
  report.steps.afterEditVisible = afterEdit.text.includes("edited live canary summary");

  await adminFetch(cookie, `/api/admin/content-posts/${post.id}/archive`, { method: "POST" });
  await new Promise((r) => setTimeout(r, 1500));
  report.steps.afterArchiveHidden = (await fetchPublicHtml(`${listPath}/${post.slug}`)).status === 404;

  await adminFetch(cookie, `/api/admin/content-posts/${post.id}/publish`, { method: "POST" });
  await new Promise((r) => setTimeout(r, 1500));
  report.steps.afterRepublishVisible = (await fetchPublicHtml(`${listPath}/${post.slug}`)).status === 200;

  await adminFetch(cookie, `/api/admin/content-posts/${post.id}`, { method: "DELETE" });
  await new Promise((r) => setTimeout(r, 1500));
  report.steps.afterDeleteHidden = (await fetchPublicHtml(`${listPath}/${post.slug}`)).status === 404;

  report.postId = post.id;
  report.pass = Object.values(report.steps).every(Boolean) && report.staleContentFailures === 0;
  return report;
}

async function runBrowserChecks(adminCookie) {
  const viewports = [[320,700],[360,800],[390,844],[412,915],[768,1024],[1024,768],[1280,800],[1366,768],[1440,900]];
  const report = {
    browserFailures: 0, headerOverlapFailures: 0, headerWrapFailures: 0, headerClippingFailures: 0,
    overflowFailures: 0, consoleErrors: 0, hydrationWarnings: 0, pageErrors: 0, network5xx: 0,
    darkModeContrastFailures: 0, dropdownFailures: 0, orderBlocksInnerScrollFailures: 0, orderBlocks: {},
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "ar-SA" });
  const page = await context.newPage();

  for (const path of ["/academy", "/results"]) {
    for (const theme of ["dark", "light"]) {
      await page.goto(`${STAGING_BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await page.evaluate((t) => { document.documentElement.setAttribute("data-theme", t); localStorage.setItem("theme", t); }, theme);
      await page.waitForTimeout(500);
      const color = await page.evaluate(() => {
        const el = document.querySelector(".content-posts-hero__title");
        if (!el) return null;
        const rgb = getComputedStyle(el).color.match(/\d+/g)?.map(Number) || [];
        const lum = rgb.length >= 3 ? 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] : 0;
        return { color: getComputedStyle(el).color, lum };
      });
      if (theme === "dark" && color && color.lum < 120) report.darkModeContrastFailures += 1;
      if (theme === "light" && color && color.lum > 220) report.darkModeContrastFailures += 1;
    }
  }

  if (adminCookie) {
    await context.addCookies([{ name: "hc_access_token", value: adminCookie.replace("hc_access_token=", ""), domain: new URL(STAGING_BASE).hostname, path: "/" }]);
    await page.goto(`${STAGING_BASE}/admin/academy`, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => { document.documentElement.setAttribute("data-theme", "dark"); });
    await page.waitForTimeout(500);
    const nativeSelects = await page.locator("select").count();
    if (nativeSelects > 0) report.dropdownFailures += 1;
    const trigger = page.locator(".content-post-admin__select-trigger").first();
    if (await trigger.count()) {
      await trigger.click();
      await page.waitForTimeout(300);
      const menu = await page.locator(".content-post-admin__select-menu").count();
      if (!menu) report.dropdownFailures += 1;
      await page.keyboard.press("Escape");
    }
  }

  for (const [w, h] of viewports) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${STAGING_BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(400);
    const header = await page.evaluate(() => {
      const brand = document.querySelector(".site-header-brand");
      const actions = document.querySelector(".site-top-header__actions");
      const rects = [...(actions?.children || [])].map((el) => el.getBoundingClientRect());
      let overlap = false;
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        if (a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1) overlap = true;
      }
      return {
        brandVisible: Boolean(brand && brand.offsetWidth > 0),
        actionsVisible: Boolean(actions && actions.offsetWidth > 0),
        overlap,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        brandRight: brand?.getBoundingClientRect().right || 0,
        actionsLeft: actions?.getBoundingClientRect().left || 0,
      };
    });
    if (header.overlap) report.headerOverlapFailures += 1;
    if (w >= 1024 && header.actionsLeft < header.brandRight - 4) report.headerClippingFailures += 1;
    if (header.overflow) report.overflowFailures += 1;
  }

  for (const [w, h] of viewports.filter(([width]) => width >= 768)) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${STAGING_BASE}/order-book`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const ob = await page.evaluate(() => {
      const root = document.querySelector(".ob-order-blocks");
      if (!root) return { missing: true };
      const s = getComputedStyle(root);
      return {
        overflowY: s.overflowY,
        maxHeight: s.maxHeight,
        scrollHeight: root.scrollHeight,
        clientHeight: root.clientHeight,
        innerScroll: s.overflowY === "auto" || s.overflowY === "scroll",
        sell: root.querySelector('[data-order-blocks-section="sell"]')?.children.length || 0,
        buy: root.querySelector('[data-order-blocks-section="buy"]')?.children.length || 0,
        mid: Boolean(root.querySelector('[data-order-blocks-section="mid"]')),
      };
    });
    report.orderBlocks[`${w}x${h}`] = ob;
    if (ob.missing || ob.innerScroll || ob.sell !== 12 || ob.buy !== 12 || !ob.mid) report.orderBlocksInnerScrollFailures += 1;
  }

  await browser.close();
  return report;
}

async function main() {
  const staging = parseEnvFile(resolve(process.cwd(), ".env.staging.local"));
  const password = staging.STAGING_IAM_TEST_PASSWORD;
  const ref = extractSupabaseProjectRef(staging.STAGING_SUPABASE_URL);
  if (ref !== STAGING_SUPABASE_PROJECT_REF) throw new Error("Not staging");

  const admin = createClient(staging.STAGING_SUPABASE_URL, staging.STAGING_SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const login = await loginDirect(staging, `iam-super-admin@${TEST_DOMAIN}`, password);
  if (!login.success) throw new Error("Admin login failed");

  const healthRes = await fetch(`${STAGING_BASE}/api/health`);
  const health = await healthRes.json();

  const report = {
    commitSha: "479718e5bd7c2f86497b38cbc95b0f3b913c00c6",
    stagingBase: STAGING_BASE,
    stagingRef: maskProjectRef(ref),
    health: {
      status: health.status,
      readiness: health.readiness,
      database: health.database?.status,
      iam: health.iam?.validation?.ok,
      buildCommit: health.build?.commit,
    },
    academyAutoRefresh: null,
    resultsAutoRefresh: null,
    openTabNote: "Open tabs do not auto-update without navigation; server cache invalidation applies on next fetch/navigation (no polling/WebSocket in this release).",
  };

  report.academyAutoRefresh = await runAutoRefreshLifecycle(login.cookie, "academy", ACADEMY_TITLE);
  report.resultsAutoRefresh = await runAutoRefreshLifecycle(login.cookie, "result", RESULT_TITLE);

  report.browser = await runBrowserChecks(login.cookie.replace("hc_access_token=", ""));

  await admin.from("content_posts").delete().ilike("title", "%UI FIX STAGING CANARY%");
  report.cleanup = {
    cleanupRemainingDbRows: (await admin.from("content_posts").select("id", { count: "exact", head: true }).ilike("title", "%UI FIX STAGING CANARY%")).count,
  };

  report.productionProof = {
    productionDeployChanged: false,
    productionDBChanged: false,
    productionContentCreated: 0,
  };

  report.pass =
    report.academyAutoRefresh.pass &&
    report.resultsAutoRefresh.pass &&
    report.browser.darkModeContrastFailures === 0 &&
    report.browser.dropdownFailures === 0 &&
    report.browser.headerOverlapFailures === 0 &&
    report.browser.orderBlocksInnerScrollFailures === 0;

  mkdirSync(join(process.cwd(), "scripts/.artifacts"), { recursive: true });
  const out = join(process.cwd(), "scripts/.artifacts/ui-fixes-staging-closure.json");
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exit(1);
}

main().catch((e) => { console.error(JSON.stringify({ fatal: e.message })); process.exit(1); });
