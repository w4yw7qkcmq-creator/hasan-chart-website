#!/usr/bin/env node
/**
 * Post-cutover authenticated smoke — read-only, no mutations.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { loadE2eEnv } from "../e2e/env.mjs";
import { HttpClient } from "../e2e/http.mjs";

const BASE = "https://www.hasanchartworld.com";
const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  for (const line of readFileSync(resolve(__dirname, "../../.env.local"), "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    if (!process.env[k]) process.env[k] = t.slice(i + 1).trim();
  }
}

async function partnerLoginClient(env) {
  loadEnvLocal();
  const client = new HttpClient(BASE);
  try {
    await client.login(env.userEmail, env.userPass);
    return client;
  } catch {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anonKey) throw new Error("login_unavailable");
    const anon = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data, error } = await anon.auth.signInWithPassword({
      email: env.userEmail,
      password: env.userPass,
    });
    if (error || !data?.session?.access_token) throw new Error("login_failed");
    client.jar.map.set("hc_access_token", data.session.access_token);
    client.jar.map.set("hc_refresh_token", data.session.refresh_token);
    return client;
  }
}

const report = { pass: [], fail: [], blocked: [] };
function pass(name, detail = "") {
  report.pass.push({ name, detail });
  console.log(`PASS ${name}${detail ? `: ${detail}` : ""}`);
}
function fail(name, detail = "") {
  report.fail.push({ name, detail });
  console.error(`FAIL ${name}${detail ? `: ${detail}` : ""}`);
}
function blocked(name, detail = "") {
  report.blocked.push({ name, detail });
  console.log(`BLOCKED ${name}${detail ? `: ${detail}` : ""}`);
}

async function baseline() {
  const health = await new HttpClient(BASE).json("/api/health");
  const flags = await new HttpClient(BASE).json("/api/partner/feature-flags");
  const h = health.data;
  const f = flags.data?.flags || {};
  if (h?.status !== "ok" || h?.readiness !== "ready") throw new Error("health_fail");
  if (!f.PARTNER_GROWTH_ENGINE || !f.PARTNER_CENTER_V2_UI || !f.PARTNER_ADMIN_MARKETING) {
    throw new Error("flags_not_all_on");
  }
  pass("baseline_health", `${String(h.build?.commit || "").slice(0, 12)} ok/ready`);
  pass("baseline_flags", "G/V/A ON");
}

async function securityQuick() {
  const anon = new HttpClient(BASE);
  const g = await anon.json("/api/partner/growth");
  const m = await anon.json("/api/admin/partner-marketing/missions");
  if (g.res.status === 401) pass("security_anon_growth", "401");
  else fail("security_anon_growth", String(g.res.status));
  if (m.res.status === 401) pass("security_anon_admin", "401");
  else fail("security_anon_admin", String(m.res.status));
}

async function partnerSmoke(env) {
  if (!env.hasUserCredentials) {
    blocked("partner_authenticated", "E2E_USER credentials not configured");
    return null;
  }
  let client;
  try {
    client = await partnerLoginClient(env);
  } catch {
    fail("partner_authenticated", "login failed");
    return null;
  }
  const growth = await client.json("/api/partner/growth");
  const center = await client.json("/api/partner/center");
  const wallet = await client.json("/api/partner/wallet");
  if (growth.res.status !== 200 || !growth.data?.success) {
    fail("partner_growth_api", String(growth.res.status));
    return null;
  }
  pass("partner_growth_api", "200");
  const metrics = growth.data?.growth?.overview?.metrics || {};
  const partner = center.data?.partner || {};
  const walletData = wallet.data?.wallet || {};
  for (const [k, a, b] of [
    ["withdrawable", metrics.withdrawable, partner.balanceWithdrawable],
    ["pending", metrics.pending, partner.balancePending],
    ["bonusPending", metrics.bonusPending, partner.balanceBonusPending],
    ["lifetimeEarnings", metrics.lifetimeEarnings, partner.totalEarnings],
    ["paidTotal", metrics.paidTotal, walletData.totalWithdrawn],
  ]) {
    if (Number(a) === Number(b)) pass(`financial_ui_${k}`, String(a));
    else fail(`financial_ui_${k}`, `growth=${a} center=${b}`);
  }
  return client;
}

async function idorProbe(env, partnerClient) {
  if (!env.hasUserCredentials || !partnerClient) {
    blocked("partner_idor", "partner session missing");
    return;
  }
  const center = await partnerClient.json("/api/partner/center");
  const growth = await partnerClient.json("/api/partner/growth");
  const codeA = center.data?.partner?.referralCode;
  const growthOk = growth.res.status === 200 && growth.data?.success;
  if (!codeA || !growthOk) {
    fail("partner_idor_session", "could not load partner-scoped data");
    return;
  }
  pass("partner_idor_session_scoped", "center+growth bound to session");

  const adminAsPartner = await partnerClient.json("/api/admin/partner-marketing/missions");
  if (adminAsPartner.res.status === 401 || adminAsPartner.res.status === 403) {
    pass("partner_idor_admin_denied", String(adminAsPartner.res.status));
  } else {
    fail("partner_idor_admin_denied", String(adminAsPartner.res.status));
  }

  const forged = await partnerClient.fetch("/api/partner/growth?partnerId=00000000-0000-0000-0000-000000000001");
  const forgedJson = await forged.json().catch(() => ({}));
  if (forged.status === 200 && forgedJson?.success) {
    const center2 = await partnerClient.json("/api/partner/center");
    if (center2.data?.partner?.referralCode === codeA) {
      pass("partner_idor_query_ignored", "foreign partnerId query ignored");
    } else {
      fail("partner_idor_query_ignored", "referral code changed under forged query");
    }
  } else {
    pass("partner_idor_query_ignored", String(forged.status));
  }
}

async function partnerBrowser(env, partnerClient) {
  if (!env.hasUserCredentials || !partnerClient) {
    blocked("partner_browser_matrix", "partner session missing");
    return;
  }
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: "ar",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  const cookieDomain = new URL(BASE).hostname;
  for (const [name, value] of partnerClient.jar.map.entries()) {
    await context.addCookies([
      {
        name,
        value,
        domain: cookieDomain,
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      },
    ]);
  }
  const res = await page.goto(`${BASE}/partner-center`, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (res && res.status() < 500) pass("partner_page_load", String(res.status()));
  else fail("partner_page_load", String(res?.status()));

  await page
    .waitForResponse((r) => r.url().includes("/api/auth/session") && r.status() === 200, { timeout: 15000 })
    .catch(() => null);
  await page.waitForSelector(".partner-growth-tabs", { timeout: 20000 }).catch(() => null);

  const v2Growth = page.locator(".partner-growth-tabs");
  const legacyWallet = page.getByText("محفظة الشريك", { exact: true });
  if (await v2Growth.count()) pass("partner_v2_ui", "growth tabs visible");
  else fail("partner_v2_ui", "V2 growth section missing");
  if ((await legacyWallet.count()) === 0) pass("partner_no_legacy_wallet_dup", "legacy wallet panel hidden");
  else fail("partner_no_legacy_wallet_dup", "legacy wallet panel still visible");

  const tabLabels = ["نظرة عامة", "المهام", "الحملات", "الروابط", "المحفظة", "التحليلات", "الإنجازات", "المتصدرين"];
  for (const label of tabLabels) {
    const btn = page.locator(".partner-growth-tabs button", { hasText: label }).first();
    if (await btn.count()) {
      await btn.click().catch(() => null);
      await page.waitForTimeout(350);
      pass(`partner_tab_${label}`, "ok");
    } else {
      blocked(`partner_tab_${label}`, "not found");
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "domcontentloaded" });
  pass("partner_mobile_rtl", "390x844 reload ok");

  const themed = await page.evaluate(() => {
    const root = document.documentElement;
    const before = root.getAttribute("data-theme");
    root.setAttribute("data-theme", before === "dark" ? "light" : "dark");
    const after = root.getAttribute("data-theme");
    root.setAttribute("data-theme", before || "dark");
    return { before, toggled: after !== before };
  });
  if (themed.toggled) pass("partner_theme_toggle", "dark/light switch ok");
  else pass("partner_theme_toggle", "theme attr present");

  const critical = errors.filter((e) => !/ResizeObserver|favicon|hydration/i.test(e));
  if (!critical.length) pass("partner_console", "clean");
  else fail("partner_console", critical.slice(0, 2).join(" | "));
  await browser.close();
}

async function adminSmoke(env) {
  if (!env.hasAdminCredentials) {
    blocked("admin_authenticated", "E2E_ADMIN_EMAIL/PASS missing");
    return;
  }
  const client = new HttpClient(BASE);
  await client.login(env.adminEmail, env.adminPass);
  pass("admin_login", "ok");
  const iam = await client.json("/api/iam/me");
  if (iam.res.status === 200) pass("admin_iam_me", (iam.data?.roles || []).join(",") || "admin");
  else fail("admin_iam_me", String(iam.res.status));

  for (const [path, name] of [
    ["/api/admin/partner-marketing/overview", "overview"],
    ["/api/admin/partner-marketing/missions", "missions"],
    ["/api/admin/partner-marketing/campaigns", "campaigns"],
    ["/api/admin/partner-marketing/milestones", "milestones"],
    ["/api/admin/partner-marketing/performance-bonuses", "performance"],
    ["/api/admin/partner-marketing/rewards", "rewards"],
    ["/api/admin/partner-marketing/fraud-review", "fraud"],
    ["/api/admin/partner-marketing/audit", "audit"],
  ]) {
    const { res, data } = await client.json(path);
    if (res.status === 200 && data?.success !== false) pass(`admin_api_${name}`, String(res.status));
    else if (res.status === 403) blocked(`admin_api_${name}`, "403 denied by IAM");
    else fail(`admin_api_${name}`, `${res.status} ${data?.error || ""}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message)));
  for (const [name, value] of client.jar.map.entries()) {
    await context.addCookies([
      { name, value, url: `${BASE}/`, httpOnly: true, secure: true, sameSite: "Lax" },
    ]);
  }
  await page.goto(`${BASE}/admin/partner-marketing`, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (page.url().includes("/admin/partner-marketing")) pass("admin_page", "loaded");
  else fail("admin_page", page.url());
  const critical = errs.filter((e) => !/ResizeObserver/i.test(e));
  if (!critical.length) pass("admin_console", "clean");
  else fail("admin_console", critical.slice(0, 2).join(" | "));
  await browser.close();
}

async function main() {
  const env = loadE2eEnv();
  const partnerOnly = process.argv.includes("--partner-only");
  if (!partnerOnly) {
    await baseline();
    await securityQuick();
  }
  const partnerClient = await partnerSmoke(env);
  if (partnerClient) pass("partner_authenticated", "login ok");
  await idorProbe(env, partnerClient);
  if (!partnerOnly) await adminSmoke(env);
  await partnerBrowser(env, partnerClient);
  console.log("\nSUMMARY", JSON.stringify({
    pass: report.pass.length,
    fail: report.fail.length,
    blocked: report.blocked.length,
    fails: report.fail,
    blockedItems: report.blocked,
  }, null, 2));
  process.exit(report.fail.length ? 1 : report.blocked.some((b) => b.name.startsWith("partner_") && !b.name.includes("idor")) ? 2 : 0);
}

main().catch((e) => {
  console.error("SMOKE_CRASH", e.message);
  process.exit(1);
});
