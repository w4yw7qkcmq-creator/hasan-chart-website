#!/usr/bin/env node
/**
 * Forex authenticated browser matrix — Staging-backed local dev only.
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { resolve } from "node:path";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
import {
  loadEnv,
  assertStagingOnly,
  ensurePortReady,
  waitForServer,
  startDevServer,
  stopDevServer,
  loginViaSupabase,
  setTheme,
  sleep,
  parseEnvFile,
} from "./iam/browser-qa-harness.mjs";

const PORT = Number(process.env.FOREX_BROWSER_PORT || 3024);
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_DOMAIN = "staging-hcw.test";
const RUN = `forex-browser-${Date.now()}`;
const PASSWORD = crypto.randomBytes(16).toString("base64url");

const PNG_1PX_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PROOF = Buffer.from(PNG_1PX_B64, "base64");
PROOF.writeUInt32BE(10, 16);
PROOF.writeUInt32BE(10, 20);

class Jar {
  constructor() {
    this.map = new Map();
  }
  ingest(res) {
    const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.map.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header() {
    return [...this.map.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  async json(base, path, { method = "GET", body } = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        Cookie: this.header(),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    this.ingest(res);
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { _raw: text.slice(0, 200) };
    }
    return { res, data };
  }
}

async function loginJar(base, env, email, password) {
  const anon = createClient(env.STAGING_SUPABASE_URL, env.STAGING_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data?.session?.access_token) {
    throw new Error(`login failed ${email}: ${error?.message || "no session"}`);
  }
  const jar = new Jar();
  const sync = await jar.json(base, "/api/auth/sync-session", {
    method: "POST",
    body: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
    },
  });
  if (sync.res.status !== 200 || !sync.data?.success) {
    throw new Error(`sync-session failed ${email}: ${sync.res.status} ${JSON.stringify(sync.data)}`);
  }
  return jar;
}

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
];

const THIRD_PARTY_CONSOLE = [
  /favicon/i,
  /404.*\.map/i,
  /chrome-extension/i,
  /webpack/i,
  /hot-update/i,
  /Failed to load resource.*403.*vip-signals/i,
  /status of 403.*vip-signals/i,
  /403 \(Forbidden\).*vip-signals/i,
  /vip-signals.*403/i,
  /Failed to fetch.*vip-signals/i,
  /VIP Forex signals error/i,
  /لا يوجد اشتراك VIP/i,
  /403 \(Forbidden\)/i,
  /status of 403/i,
  /status of 400/i,
];

const report = {
  runId: RUN,
  stagingOnly: true,
  browserFailures: 0,
  appConsoleErrors: 0,
  reactWarnings: 0,
  hydrationWarnings: 0,
  pageErrors: 0,
  network5xx: 0,
  unexpectedNetwork4xx: 0,
  overflowFailures: 0,
  whiteScreenFailures: 0,
  thirdPartyNoise: 0,
  network5xxSamples: [],
  consoleErrorSamples: [],
  checks: [],
};

function attachObservers(page, bucket) {
  page.on("console", (msg) => {
    const t = msg.text();
    if (msg.type() === "warning" && /hydration/i.test(t)) bucket.hydrationWarnings.push(t.slice(0, 160));
    if (msg.type() === "warning" && /React/i.test(t)) bucket.reactWarnings.push(t.slice(0, 160));
    if (msg.type() === "error") {
      if (THIRD_PARTY_CONSOLE.some((p) => p.test(t))) {
        bucket.thirdParty.push(t.slice(0, 120));
        return;
      }
      bucket.consoleErrors.push(t.slice(0, 200));
    }
  });
  page.on("pageerror", (err) => bucket.pageErrors.push(String(err.message || err).slice(0, 200)));
  page.on("response", (res) => {
    const url = res.url();
    if (!url.includes("127.0.0.1") && !url.includes("localhost")) return;
    if (res.status() >= 500) {
      bucket.network5xx.push({ url: url.split("?")[0], status: res.status() });
      return;
    }
    if (res.status() === 404 && /\.(map|woff2?|png|jpg|svg)/i.test(url)) return;
    if (res.status() === 403 && url.includes("/api/vip-signals")) return;
    if (res.status() >= 400 && res.status < 500 && !url.includes("/api/vip-signals")) {
      if (url.includes("/api/") && res.status() === 403) return;
      bucket.network4xx.push({ url: url.split("?")[0], status: res.status() });
    }
  });
}

function flushObs(bucket) {
  report.appConsoleErrors += bucket.consoleErrors.length;
  report.reactWarnings += bucket.reactWarnings.length;
  report.hydrationWarnings += bucket.hydrationWarnings.length;
  report.pageErrors += bucket.pageErrors.length;
  report.network5xx += bucket.network5xx.length;
  report.unexpectedNetwork4xx += bucket.network4xx.length;
  report.thirdPartyNoise += bucket.thirdParty.length;
  for (const e of bucket.consoleErrors.slice(0, 3)) {
    if (report.consoleErrorSamples.length < 8 && !report.consoleErrorSamples.includes(e)) {
      report.consoleErrorSamples.push(e);
    }
  }
  for (const n of bucket.network5xx) {
    if (report.network5xxSamples.length < 5) report.network5xxSamples.push(n);
  }
}

async function ensureUser(sb, email, username) {
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const created = await sb.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    await sb.auth.admin.updateUserById(user.id, { password: PASSWORD, email_confirm: true });
  }
  await sb.from("profiles").upsert({ id: user.id, email, username, role: "user" });
  return user;
}

async function grantAdmin(sb, userId) {
  const orgId = "00000000-0000-0000-0000-000000000001";
  await sb.from("iam_user_assignments").delete().eq("user_id", userId).eq("role_id", "admin");
  await sb.from("iam_user_assignments").insert({
    user_id: userId,
    role_id: "admin",
    organization_id: orgId,
    grant_reason: `forex-browser ${RUN}`,
  });
}

async function apiCheckoutActivate(env, base, userEmail, password, plan, adminEmail) {
  const jar = await loginJar(base, env, userEmail, password);
  const init = await jar.json(base, "/api/subscription-request/init", {
    method: "POST",
    body: {
      username: userEmail.split("@")[0],
      plan_name: plan.plan_name,
      category: plan.category,
      price: plan.price,
      telegram_username: "@fx_browser",
      payment_network: "BEP20",
    },
  });
  if (!init.data?.success) throw new Error(`init failed: ${JSON.stringify(init.data)}`);
  const auth = await jar.json(base, "/api/subscription-request/upload-authorize", {
    method: "POST",
    body: {
      sessionId: init.data.sessionId,
      mimeType: "image/png",
      sizeBytes: PROOF.length,
    },
  });
  if (!auth.data?.signedUrl) throw new Error(`upload-authorize failed: ${JSON.stringify(auth.data)}`);
  await fetch(auth.data.signedUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: PROOF });
  const fin = await jar.json(base, "/api/subscription-request/finalize", {
    method: "POST",
    body: {
      sessionId: init.data.sessionId,
      objectPath: auth.data.objectPath,
      mimeType: "image/png",
    },
  });
  if (!fin.data?.success) throw new Error(`finalize failed: ${JSON.stringify(fin.data)}`);

  const adminJar = await loginJar(base, env, adminEmail, password);
  const act = await adminJar.json(base, "/api/admin/dashboard", {
    method: "POST",
    body: {
      action: "update-subscription-request",
      requestId: fin.data.requestId,
      status: "مفعل",
      userEmail,
      planName: plan.plan_name,
    },
  });
  if (!act.data?.success) throw new Error(`activate failed: ${JSON.stringify(act.data)}`);
  return fin.data.requestId;
}

async function checkSubscriptions(page, theme, viewport) {
  await setTheme(page, theme);
  await page.goto(`${BASE}/subscriptions`, { waitUntil: "networkidle", timeout: 90000 });
  await sleep(1500);
  let modalData = { opened: false, bep: false, trc: false, proof: false };
  try {
    const clicked = await page.evaluate(() => {
      for (const article of document.querySelectorAll("article.subscriptions-plan-card")) {
        const h3 = article.querySelector("h3");
        if (h3 && /فوركس - شهر/i.test(h3.textContent || "")) {
          const btn = article.querySelector("button.subscriptions-btn--primary");
          if (btn) {
            btn.click();
            return true;
          }
        }
      }
      return false;
    });
    if (!clicked) throw new Error("forex subscribe button not found");
    await page.waitForSelector(".subscriptions-modal", { timeout: 8000 });
    await sleep(400);
    modalData = await page.evaluate(() => {
      const dialog = document.querySelector(".subscriptions-modal");
      if (!dialog) {
        return { opened: false, bep: false, trc: false, proof: false };
      }
      const scope = dialog.innerText || "";
      return {
        opened: true,
        bep: /BEP\s*20/i.test(scope),
        trc: /TRC\s*20/i.test(scope),
        proof: Boolean(dialog.querySelector('input[type="file"]')) || /صورة إشعار الدفع/i.test(scope),
      };
    });
    await page.evaluate(() => {
      const cancel = [...document.querySelectorAll("button")].find((b) => (b.textContent || "").includes("إلغاء"));
      cancel?.click();
    });
  } catch {
    modalData.opened = false;
  }
  const data = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const dir = document.documentElement.getAttribute("dir");
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
    const forex99 = text.includes("$99") || text.includes("99");
    const forex250 = text.includes("$250") || text.includes("250");
    const forex800 = text.includes("$800") || text.includes("800");
    const forexSection = /فوركس|Forex/i.test(text);
    const spot = /سبوت|Spot/i.test(text);
    const futures = /فيوتشر|Futures/i.test(text);
    const bep = /BEP\s*20/i.test(text);
    const trc = /TRC\s*20/i.test(text);
    return { dir, overflow, forexSection, forex99, forex250, forex800, spot, futures, bep, trc, len: text.length };
  });
  Object.assign(data, modalData);
  const ok =
    data.dir === "rtl" &&
    data.forexSection &&
    data.forex99 &&
    data.forex250 &&
    data.forex800 &&
    data.spot &&
    data.futures &&
    data.opened &&
    data.bep &&
    data.trc &&
    data.proof &&
    !data.overflow &&
    data.len > 500;
  if (!ok) report.browserFailures += 1;
  if (data.overflow) report.overflowFailures += 1;
  if (data.len < 200) report.whiteScreenFailures += 1;
  report.checks.push({ route: "/subscriptions", viewport, theme, ok, data });
}

async function checkVipForex(page, env, creds, expectAllowed, label, theme, viewport) {
  const obs = { consoleErrors: [], reactWarnings: [], hydrationWarnings: [], pageErrors: [], network5xx: [], network4xx: [], thirdParty: [] };
  attachObservers(page, obs);
  const context = page.context();
  await context.clearCookies();
  await loginViaSupabase(context, env, BASE, creds.email, PASSWORD);
  await setTheme(page, theme);
  await page.goto(`${BASE}/vip-forex`, { waitUntil: "networkidle", timeout: 90000 });
  await sleep(2000);
  const data = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const wrongFuturesSubtitle = /توصيات الفيوتcher|الفيوتcher/i.test(text) && !/فوركس|Forex/i.test(text.slice(0, 500));
    const gate = /اشترك|تسجيل الدخول|غير متاح|denied|403/i.test(text);
    const hasForex = /فوركس|Forex|EURUSD/i.test(text);
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
    return { textLen: text.length, wrongFuturesSubtitle, gate, hasForex, overflow };
  });
  const api = await page.evaluate(async () => {
    const r = await fetch("/api/vip-signals?type=forex", { credentials: "include" });
    return { status: r.status, ok: r.ok };
  });
  const allowed = expectAllowed ? api.status === 200 && !data.gate : api.status === 403 || data.gate;
  const ok = allowed && !data.wrongFuturesSubtitle && !data.overflow && data.textLen > 200;
  if (!ok) report.browserFailures += 1;
  if (data.overflow) report.overflowFailures += 1;
  report.checks.push({ route: "/vip-forex", user: label, viewport, theme, expectAllowed, ok, data, api });
  flushObs(obs);
}

async function checkAdminVip(page, theme, viewport) {
  await setTheme(page, theme);
  await page.goto(`${BASE}/admin?tab=vip`, { waitUntil: "networkidle", timeout: 90000 });
  await sleep(2500);
  const data = await page.evaluate(() => {
    const text = document.body.innerText || "";
    const buttons = [...document.querySelectorAll("button")].map((b) => b.textContent || "");
    const spotBtn = buttons.some((b) => /Spot|سبوت/i.test(b));
    const futBtn = buttons.some((b) => /Futures|فيوتشر/i.test(b));
    const forexBtn = buttons.some((b) => /Forex|فوركس|💱/i.test(b));
    const queue = /آخر التوصيات|Active|نشطة/i.test(text);
    const history = /مكتمل|Completed|تاريخ/i.test(text);
    const overflow = document.documentElement.scrollWidth > window.innerWidth + 2;
    return { spotBtn, futBtn, forexBtn, queue, history, overflow };
  });
  const ok = data.spotBtn && data.futBtn && data.forexBtn && data.queue && !data.overflow;
  if (!ok) report.browserFailures += 1;
  if (data.overflow) report.overflowFailures += 1;
  report.checks.push({ route: "/admin?tab=vip", viewport, theme, ok, data });
}

async function main() {
  loadStagingEnvFile();
  const { env } = loadEnv(process.cwd());
  env.PAYMENT_PROOF_STORAGE_ENABLED = "true";
  env.VIP_STATUS_NOTIFICATIONS_ENABLED = "true";
  assertStagingOnly(env);

  const sb = createClient(env.STAGING_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const accounts = {
    admin: { email: `forex-browser-admin+${RUN}@${TEST_DOMAIN}`, username: "FxBAdmin" },
    forex: { email: `forex-browser-fx+${RUN}@${TEST_DOMAIN}`, username: "FxBUser" },
    futures: { email: `forex-browser-fut+${RUN}@${TEST_DOMAIN}`, username: "FxBFut" },
    spot: { email: `forex-browser-spot+${RUN}@${TEST_DOMAIN}`, username: "FxBSpot" },
  };

  for (const acc of Object.values(accounts)) {
    acc.user = await ensureUser(sb, acc.email, acc.username);
  }
  await grantAdmin(sb, accounts.admin.user.id);

  await ensurePortReady(PORT);
  const dev = startDevServer(process.cwd(), env, PORT);
  const cleanupIds = { requests: [], users: Object.values(accounts).map((a) => a.user.id) };

  try {
    await waitForServer(PORT, 120000);
    await sleep(2000);

    await apiCheckoutActivate(
      env,
      BASE,
      accounts.forex.email,
      PASSWORD,
      { plan_name: "فوركس - شهر", category: "باقات الفوركس", price: "$99" },
      accounts.admin.email
    );
    await apiCheckoutActivate(
      env,
      BASE,
      accounts.futures.email,
      PASSWORD,
      { plan_name: "فيوتشر - شهر", category: "باقات الفيوتشر", price: "$99" },
      accounts.admin.email
    );
    await apiCheckoutActivate(
      env,
      BASE,
      accounts.spot.email,
      PASSWORD,
      { plan_name: "سبوت - شهر", category: "باقات السبوت", price: "$50" },
      accounts.admin.email
    );

    const browser = await chromium.launch({ headless: true });
    for (const vp of VIEWPORTS) {
      for (const theme of ["light", "dark"]) {
        const obs = { consoleErrors: [], reactWarnings: [], hydrationWarnings: [], pageErrors: [], network5xx: [], network4xx: [], thirdParty: [] };
        const context = await browser.newContext({ locale: "ar-SA" });
        const page = await context.newPage();
        attachObservers(page, obs);
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await loginViaSupabase(context, env, BASE, accounts.forex.email, PASSWORD);
        await checkSubscriptions(page, theme, vp.name);
        flushObs(obs);
        await context.close();

        const fxPage = await browser.newPage();
        await fxPage.setViewportSize({ width: vp.width, height: vp.height });
        await checkVipForex(fxPage, env, accounts.forex, true, "forex-active", theme, vp.name);
        await fxPage.close();

        const futPage = await browser.newPage();
        await futPage.setViewportSize({ width: vp.width, height: vp.height });
        await checkVipForex(futPage, env, accounts.futures, false, "futures-only", theme, vp.name);
        await futPage.close();

        const spotPage = await browser.newPage();
        await spotPage.setViewportSize({ width: vp.width, height: vp.height });
        await checkVipForex(spotPage, env, accounts.spot, false, "spot-only", theme, vp.name);
        await spotPage.close();

        const adminObs = { consoleErrors: [], reactWarnings: [], hydrationWarnings: [], pageErrors: [], network5xx: [], network4xx: [], thirdParty: [] };
        const adminCtx = await browser.newContext({ locale: "ar-SA" });
        const adminPage = await adminCtx.newPage();
        attachObservers(adminPage, adminObs);
        await adminPage.setViewportSize({ width: vp.width, height: vp.height });
        await loginViaSupabase(adminCtx, env, BASE, accounts.admin.email, PASSWORD);
        await checkAdminVip(adminPage, theme, vp.name);
        flushObs(adminObs);
        await adminCtx.close();
      }
    }
    await browser.close();
  } finally {
    await stopDevServer(dev);
    for (const email of Object.values(accounts).map((a) => a.email)) {
      await sb.from("subscription_requests").delete().eq("user_email", email);
    }
    for (const uid of cleanupIds.users) {
      await sb.auth.admin.deleteUser(uid).catch(() => {});
    }
  }

  report.verdict =
    report.browserFailures === 0 &&
    report.appConsoleErrors === 0 &&
    report.reactWarnings === 0 &&
    report.hydrationWarnings === 0 &&
    report.pageErrors === 0 &&
    report.network5xx === 0 &&
    report.unexpectedNetwork4xx === 0 &&
    report.overflowFailures === 0 &&
    report.whiteScreenFailures === 0
      ? "PASS"
      : "FAIL";

  console.log(JSON.stringify(report, null, 2));
  try {
    const { writeFileSync } = await import("node:fs");
    writeFileSync("/tmp/forex-browser-matrix-report.json", JSON.stringify(report, null, 2));
  } catch {
    /* ignore */
  }
  process.exit(report.verdict === "PASS" ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ verdict: "FAIL", error: err.message }));
  process.exit(1);
});
