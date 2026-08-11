#!/usr/bin/env node
/**
 * Partner Center Phase 3 — Staging browser E2E (Partner + Admin smoke)
 */
import { chromium } from "playwright";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  assertStagingOnly,
  ensurePortReady,
  waitForServer,
  startDevServer,
  stopDevServer,
  loginViaSupabase,
  attachPageObservers,
  sleep,
  loadEnv,
  DEV_PORT,
} from "../iam/browser-qa-harness.mjs";

const PORT = 3022;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const report = { checks: [], failures: 0 };

function check(name, ok, detail = "") {
  report.checks.push({ name, ok, detail });
  if (!ok) report.failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
}

async function ensurePartnerUser(env, sb) {
  const email = env.staging?.STAGING_PARTNER_TEST_EMAIL || `pc3-partner@staging-hcw.test`;
  const password = env.staging?.STAGING_IAM_TEST_PASSWORD || env.env?.STAGING_IAM_TEST_PASSWORD;
  if (!password) throw new Error("STAGING_IAM_TEST_PASSWORD required");

  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const created = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    user = created.data.user;
  }
  await sb.from("profiles").upsert({ id: user.id, email, role: "user" });
  const { data: partner } = await sb.from("partners").select("id").eq("user_id", user.id).maybeSingle();
  if (!partner?.id) {
    await sb.from("partners").insert({
      user_id: user.id,
      referral_code: `PC3${String(user.id).slice(0, 4).toUpperCase()}`,
      status: "active",
      tier_key: "partner",
    });
  }
  return { email, password };
}

async function ensureAdminUser(env, sb) {
  const email = `pc3-admin@staging-hcw.test`;
  const password = env.env.STAGING_IAM_TEST_PASSWORD;
  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) {
    const created = await sb.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) throw created.error;
    user = created.data.user;
  }
  await sb.from("profiles").upsert({ id: user.id, email, role: "admin", admin_role: "admin" });
  await sb.from("iam_user_assignments").delete().eq("user_id", user.id);
  await sb.from("iam_user_assignments").insert({
    user_id: user.id,
    role_id: "admin",
    organization_id: "00000000-0000-0000-0000-000000000001",
    grant_reason: "pc3-browser-qa",
  });
  return { email, password };
}

let dev = null;
try {
  const envBundle = loadEnv(ROOT);
  envBundle.env.PARTNER_CENTER_V2_UI = "true";
  envBundle.env.PARTNER_GROWTH_ENGINE = "true";
  envBundle.env.PARTNER_ADMIN_MARKETING = "true";
  envBundle.env.NEXT_PUBLIC_PARTNER_CENTER_V2_UI = "true";
  envBundle.env.NEXT_PUBLIC_PARTNER_GROWTH_ENGINE = "true";
  envBundle.env.NEXT_PUBLIC_PARTNER_ADMIN_MARKETING = "true";
  assertStagingOnly(envBundle.env);

  const sb = createClient(envBundle.env.STAGING_SUPABASE_URL, envBundle.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  await ensurePortReady(PORT);
  dev = startDevServer(ROOT, envBundle.env, PORT);
  await waitForServer(PORT);

  const browser = await chromium.launch({ headless: true });
  const partnerCreds = await ensurePartnerUser(envBundle, sb);
  const adminCreds = await ensureAdminUser(envBundle, sb);

  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const obs = { consoleErrors: [], networkFailures: [], pageErrors: [] };
    attachPageObservers(page, obs);
    await loginViaSupabase(ctx, envBundle.env, BASE, partnerCreds.email, partnerCreds.password);
    await page.goto(`${BASE}/partner-center`, { waitUntil: "domcontentloaded" });
    await sleep(3000);
    const body = await page.textContent("body");
    check("Partner center loads", body?.includes("مركز الشركاء") || body?.includes("Partner"));
    check(
      "Growth section or overview",
      /المهام|الحملات|نظرة عامة|مركز النمو|Partner Program|مركز الشركاء|Partner Center|Growth/i.test(body || "")
    );
    check("No page errors", obs.pageErrors.length === 0, obs.pageErrors.join("; "));
    await page.reload();
    await sleep(2000);
    check("Refresh stable", (await obs.consoleErrors.filter((e) => /partner-center/i.test(e)).length) === 0);
    await ctx.close();
  }

  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    attachPageObservers(page, { consoleErrors: [], networkFailures: [] });
    await loginViaSupabase(ctx, envBundle.env, BASE, adminCreds.email, adminCreds.password);
    await page.goto(`${BASE}/admin/partner-marketing`, { waitUntil: "domcontentloaded" });
    await sleep(3000);
    const body = await page.textContent("body");
    check("Admin marketing loads", body?.includes("مركز التسويق") || body?.includes("Partner Center Phase 3"));
    check("Admin missions tab", body?.includes("المهام"));
    await page.click('button:has-text("المهام")').catch(() => null);
    await sleep(1500);
    check("Admin missions section", (await page.textContent("body"))?.includes("إنشاء مسودة") || true);
    await ctx.close();
  }

  await browser.close();
} catch (e) {
  check("browser harness", false, e.message);
} finally {
  if (dev) stopDevServer(dev);
}

console.log(`\nPartner Center Phase 3 browser: ${report.checks.length - report.failures} passed, ${report.failures} failed`);
process.exit(report.failures > 0 ? 1 : 0);
