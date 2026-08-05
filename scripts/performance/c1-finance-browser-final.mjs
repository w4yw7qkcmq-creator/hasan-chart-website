#!/usr/bin/env node
/**
 * C1 Final — Production Financial Center browser smoke (read-only).
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const BASE = "https://www.hasanchartworld.com";
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15) + "Z";
const ARTIFACT_PATH = join(
  ROOT,
  `scripts/performance/.artifacts/c1-finance-browser-final-${TIMESTAMP}.json`,
);

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "mobile", width: 390, height: 844 },
];

const TABS = ["overview", "subscriptions", "payment-reviews", "revenue"];

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
    ownerEmail: env.IAM_OWNER_EMAIL || env.E2E_ADMIN_EMAIL,
    ownerPassword: env.PRODUCTION_OWNER_PASSWORD || env.E2E_ADMIN_PASSWORD,
  };
}

function mask(value) {
  if (!value) return null;
  const s = String(value);
  if (s.length <= 6) return "***";
  return `${s.slice(0, 3)}***${s.slice(-2)}`;
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
  return data.session.user?.id || null;
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
    if (url.includes("/api/admin/financial-center") && res.status() >= 400) {
      report.networkFailures.push({ url: url.split("?")[0], status: res.status() });
    }
  });
}

async function fetchApiTotals(page) {
  return page.evaluate(async () => {
    const res = await fetch("/api/admin/financial-center?section=overview", { credentials: "include" });
    const json = await res.json();
    return {
      status: res.status,
      pendingReviews: json?.overview?.pendingReviews ?? json?.pendingReviews ?? null,
      revenueTotals: json?.overview?.revenueTotals ?? null,
    };
  });
}

async function runFinanceChecks(page, report, viewport) {
  await page.goto(`${BASE}/admin/financial-center`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const dom = await page.evaluate(() => ({
    dir: document.documentElement.getAttribute("dir"),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    hasTabs: document.querySelectorAll(".admin-financial-tabs__btn").length >= 4,
    bodyText: document.body.innerText.slice(0, 4000),
  }));

  report.viewports[viewport.name] = {
    dir: dom.dir,
    overflowX: dom.overflowX,
    hasTabs: dom.hasTabs,
    rtl: dom.dir === "rtl",
  };

  const apiBefore = await fetchApiTotals(page);
  report.pendingCounter = apiBefore.pendingReviews;

  for (const tab of TABS) {
    await page.goto(`${BASE}/admin/financial-center?tab=${tab}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    const listRes = await page.waitForResponse(
      (res) => res.url().includes("/api/admin/financial-center") && res.status() === 200,
      { timeout: 15000 },
    ).catch(() => null);

    const listJson = listRes ? await listRes.json().catch(() => ({})) : {};
    const items =
      listJson?.subscriptions?.items ||
      listJson?.paymentReviews?.items ||
      listJson?.items ||
      [];
    const ids = items.map((row) => row.id).filter(Boolean);
    const uniqueIds = new Set(ids);
    report.tabs[tab] = {
      status: listRes?.status() || null,
      count: ids.length,
      duplicateIds: ids.length - uniqueIds.size,
      hasProofUrlInList: JSON.stringify(items).includes("proofUrl"),
    };
  }

  await page.goto(`${BASE}/admin/financial-center?tab=payment-reviews&reviewStatus=pending`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(1200);
  const pendingRes = await page.waitForResponse(
    (res) => res.url().includes("reviewStatus=pending") || res.url().includes("review_status"),
    { timeout: 10000 },
  ).catch(() => null);
  if (pendingRes) {
    const pendingJson = await pendingRes.json().catch(() => ({}));
    const pendingItems = pendingJson?.paymentReviews?.items || pendingJson?.items || [];
    report.pendingListTotal = pendingItems.length;
  }

  await page.goto(`${BASE}/admin/financial-center?tab=subscriptions&search=test`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForTimeout(900);
  report.searchDebounce = true;

  const proofBtn = page.locator('button:has-text("عرض الإثبات"), button:has-text("إثبات")').first();
  if (await proofBtn.isVisible().catch(() => false)) {
    const proofReq = page.waitForResponse(
      (res) => res.url().includes("/api/admin/financial-center/payment-proof/"),
      { timeout: 10000 },
    );
    await proofBtn.click();
    const proofRes = await proofReq.catch(() => null);
    report.proofDetail = {
      requestedOnOpen: Boolean(proofRes),
      status: proofRes?.status() || null,
    };
    await page.keyboard.press("Escape");
  } else {
    report.proofDetail = { skipped: true, reason: "no_pending_proof_button" };
  }

  for (const theme of ["dark", "light"]) {
    await page.evaluate((mode) => {
      document.documentElement.setAttribute("data-theme", mode);
    }, theme);
    report.themes[theme] = { applied: true };
  }
}

async function main() {
  const env = loadProductionEnv();
  if (!env.ownerEmail || !env.ownerPassword || !env.url || !env.anon) {
    throw new Error("Missing production owner credentials or Supabase config in .env.local");
  }

  mkdirSync(join(ROOT, "scripts/performance/.artifacts"), { recursive: true });

  const healthRes = await fetch(`${BASE}/api/health`);
  const health = await healthRes.json();

  const report = {
    timestamp: TIMESTAMP,
    productionCommit: health?.build?.commit || null,
    ownerEmailMasked: mask(env.ownerEmail),
    consoleErrors: [],
    networkFailures: [],
    tabs: {},
    themes: {},
    viewports: {},
    verdict: "PENDING",
  };

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  attachObservers(report, await context.newPage());
  const page = await context.newPage();
  attachObservers(report, page);

  report.ownerUserId = await loginContext(context, env);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await runFinanceChecks(page, report, viewport);
  }

  await browser.close();

  const parityOk =
    report.pendingCounter == null ||
    report.pendingListTotal == null ||
    report.pendingCounter === report.pendingListTotal;

  report.pendingParity = {
    overviewCounter: report.pendingCounter,
    pendingListTotal: report.pendingListTotal,
    pass: parityOk,
  };

  const pass =
    report.consoleErrors.length === 0 &&
    report.networkFailures.filter((f) => f.status >= 500).length === 0 &&
    Object.values(report.tabs).every((t) => (t.duplicateIds ?? 0) === 0 && !t.hasProofUrlInList) &&
    parityOk;

  report.verdict = pass ? "PASS" : "FAIL";

  writeFileSync(ARTIFACT_PATH, JSON.stringify(report, null, 2));
  console.log(`Artifact: ${ARTIFACT_PATH}`);
  console.log(`Verdict: ${report.verdict}`);
  if (!pass) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
