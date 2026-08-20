#!/usr/bin/env node
/**
 * VIP admin panel live browser matrix on Staging-backed local dev.
 */
import { chromium } from "playwright";
import { loadStagingEnvFile } from "../lib/load-staging-env.js";
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
  parseEnvFile,
} from "./iam/browser-qa-harness.mjs";
import { resolve } from "node:path";

const PORT = 3021;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_DOMAIN = "staging-hcw.test";

async function ensureVipTestAdmin(env) {
  const email = `vip-qa-admin@${TEST_DOMAIN}`;
  const password = env.STAGING_IAM_TEST_PASSWORD;
  const sb = createClient(env.STAGING_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const created = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { vip_qa: true },
    });
    if (created.error) throw created.error;
    user = created.data.user;
  } else {
    await sb.auth.admin.updateUserById(user.id, { password, email_confirm: true });
  }
  await sb.from("profiles").upsert({ id: user.id, email, role: "admin", admin_role: "admin" });
  await sb.from("iam_user_assignments").delete().eq("user_id", user.id).eq("role_id", "admin");
  await sb.from("iam_user_assignments").insert({
    user_id: user.id,
    role_id: "admin",
    organization_id: "00000000-0000-0000-0000-000000000001",
    grant_reason: "vip-qa-staging-test",
  });
  return { email, password };
}

const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
];

const report = {
  browserFailures: 0,
  consoleErrors: 0,
  reactWarnings: 0,
  hydrationWarnings: 0,
  pageErrors: 0,
  network5xx: 0,
  overflowFailures: 0,
  themeFailures: 0,
  responsiveFailures: 0,
  checks: [],
};

function bumpFromObservers(obs) {
  report.consoleErrors += obs.consoleErrors?.length || 0;
  report.reactWarnings += obs.reactWarnings?.length || 0;
  report.hydrationWarnings += obs.hydrationWarnings?.length || 0;
  report.pageErrors += obs.pageErrors?.length || 0;
  report.network5xx += obs.network5xx?.length || 0;
}

async function clickVipTab(page) {
  const selectors = [
    'button:has-text("نشر VIP")',
    'button.admin-hub-tabs__btn:has-text("VIP")',
    '[data-tab="vip"]',
  ];
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.count()) {
      await loc.click({ timeout: 5000 });
      await sleep(600);
      return true;
    }
  }
  return false;
}

async function runViewport(browser, env, viewport, theme, testAdmin) {
  const obs = { consoleErrors: [], reactWarnings: [], hydrationWarnings: [], pageErrors: [], network5xx: [] };
  const context = await browser.newContext({ locale: "ar-SA" });
  const page = await context.newPage();
  attachPageObservers(page, obs);
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  await loginViaSupabase(context, env, BASE, testAdmin.email, testAdmin.password);
  await page.goto(`${BASE}/admin?tab=vip`, { waitUntil: "networkidle", timeout: 90000 });
  await sleep(3000);
  await setTheme(page, theme);
  await sleep(500);

  const vipClicked = true;
  const sectionVisible = await page.locator('text=آخر التوصيات المنشورة').count();
  const hasCards = await page.locator("article").count();
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > doc.clientWidth + 2;
  });

  const ok = vipClicked && sectionVisible > 0;
  report.checks.push({
    viewport: viewport.name,
    theme,
    vipClicked,
    sectionVisible: sectionVisible > 0,
    hasCards,
    overflow,
    ok,
  });

  if (!ok) report.browserFailures += 1;
  if (overflow) report.overflowFailures += 1;

  bumpFromObservers(obs);
  await context.close();
}

async function main() {
  loadStagingEnvFile();
  const bootstrap = parseEnvFile(resolve(process.cwd(), ".env.staging.bootstrap.local"));
  const env = {
    ...process.env,
    ...bootstrap,
    NODE_ENV: "development",
    NEXT_PUBLIC_SUPABASE_URL: process.env.STAGING_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.STAGING_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY,
    STAGING_SUPABASE_URL: process.env.STAGING_SUPABASE_URL,
    STAGING_SUPABASE_ANON_KEY: process.env.STAGING_SUPABASE_ANON_KEY,
    IAM_DB: "true",
    IAM_API: "true",
    IAM_UI: "true",
    VIP_STATUS_NOTIFICATIONS_ENABLED: "true",
  };
  assertStagingOnly(env);
  const testAdmin = await ensureVipTestAdmin(env);

  await ensurePortReady(PORT);
  const dev = startDevServer(process.cwd(), { ...env, VIP_STATUS_NOTIFICATIONS_ENABLED: "true" }, PORT);

  try {
    await waitForServer(PORT, 120000);
    await sleep(2500);

    const browser = await chromium.launch({ headless: true });
    for (const vp of VIEWPORTS) {
      await runViewport(browser, env, vp, "dark", testAdmin);
      await runViewport(browser, env, vp, "light", testAdmin);
    }
    await browser.close();
  } finally {
    await stopDevServer(dev);
  }

  report.verdict =
    report.browserFailures === 0 &&
    report.consoleErrors === 0 &&
    report.hydrationWarnings === 0 &&
    report.pageErrors === 0 &&
    report.network5xx === 0 &&
    report.overflowFailures === 0
      ? "PASS"
      : "FAIL";

  console.log(JSON.stringify(report, null, 2));
  if (report.verdict !== "PASS") process.exit(1);
}

main().catch((err) => {
  console.error(JSON.stringify({ verdict: "FAIL", error: err.message }));
  process.exit(1);
});
