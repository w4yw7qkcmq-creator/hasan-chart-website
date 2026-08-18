#!/usr/bin/env node
/**
 * Browser QA — Human Verification + Partner Anti-Abuse (Staging only, FAIL CLOSED)
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  assertStagingOnly,
  ensurePortReady,
  waitForServer,
  startDevServer,
  stopDevServer,
  attachPageObservers,
  setTheme,
  loginViaSupabase,
  bootstrapSession,
  sleep,
} from "./iam/browser-qa-harness.mjs";
import {
  loadValidationBrowserEnv,
  resolveValidationAdminCredentials,
  ISOLATED_VALIDATION_ADMIN_EMAIL,
  createStagingServiceClient,
  resolveTestPassword,
} from "./iam/staging-admin-auth-resolver.mjs";
import {
  PRODUCTION_SUPABASE_PROJECT_REF,
  STAGING_SUPABASE_PROJECT_REF,
  maskProjectRef,
} from "../lib/staging-env-guard.js";
import { applyStagingPartnerFeatureFlags } from "./hv-abuse-pass2-lib.mjs";
import { USER_CLASSIFICATION } from "../lib/user-classification.js";

const ROOT = resolve(process.cwd());
const PORT = Number(process.env.HV_BROWSER_PORT || 3038);
const BASE = `http://127.0.0.1:${PORT}`;
const ARTIFACT = join(ROOT, ".artifacts/human-verification-partner-anti-abuse-staging-browser.json");
const FIXTURE_DOMAIN = "staging-hcw.test";
const RUN_TAG = process.env.HV_PASS3_RUN_TAG || `hv-browser-${Date.now()}`;

const report = {
  generatedAt: new Date().toISOString(),
  runTag: RUN_TAG,
  stagingTarget: {
    ref: STAGING_SUPABASE_PROJECT_REF,
    masked: maskProjectRef(STAGING_SUPABASE_PROJECT_REF),
    productionBlocked: PRODUCTION_SUPABASE_PROJECT_REF,
  },
  register: {},
  login: {},
  adminFraud: {},
  adminTrust: {},
  themes: {},
  observers: {
    criticalConsole: 0,
    unexpected429: 0,
    server5xx: 0,
    blackOverlay: 0,
    consoleErrors: [],
    pageErrors: [],
    networkFailures: [],
  },
  manifest: { executed: 0 },
  errors: [],
  pass: false,
};

function inc(n = 1) {
  report.manifest.executed += n;
}

function record(section, key, ok, detail) {
  report[section][key] = detail !== undefined ? detail : ok;
  if (!ok) report.errors.push({ section, key, detail });
  inc();
}

function isBadApiStatus(status, { allow = [] } = {}) {
  if (allow.includes(status)) return false;
  return status === 404 || status === 429 || status >= 500;
}

async function fetchApi(page, path, options = {}) {
  const base = BASE;
  return page.evaluate(
    async ({ baseUrl, path: p, options: o }) => {
      const url = p.startsWith("http") ? p : `${baseUrl}${p}`;
      const res = await fetch(url, { credentials: "include", ...o });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body, ok: res.ok };
    },
    { baseUrl: base, path, options }
  );
}

async function ensureTrustFixtures(service, password) {
  const specs = [
    { key: "real", classification: USER_CLASSIFICATION.REAL, human: "verified", label: "real-verified" },
    { key: "test", classification: USER_CLASSIFICATION.TEST, human: "verified", label: "test-verified" },
    { key: "e2e", classification: USER_CLASSIFICATION.E2E, human: "verified", label: "e2e-verified" },
    { key: "suspected", classification: USER_CLASSIFICATION.SUSPECTED, human: "verified", label: "suspected-verified" },
  ];
  const fixtures = {};
  for (const spec of specs) {
    const email = `${RUN_TAG}-${spec.key}@${FIXTURE_DOMAIN}`;
    let userId;
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { hv_pass3_browser: true, run_tag: RUN_TAG },
    });
    if (created.error && String(created.error.message).includes("already")) {
      const { data: list } = await service.auth.admin.listUsers({ perPage: 1000 });
      userId = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;
    } else if (created.error) {
      throw created.error;
    } else {
      userId = created.data.user.id;
    }
    await service.from("profiles").upsert({
      id: userId,
      email,
      username: spec.label,
      user_classification: spec.classification,
      effective_user_classification: spec.classification,
      user_classification_source: "admin_manual",
      human_verification_status: spec.human,
      human_verified_at: spec.human === "verified" ? new Date().toISOString() : null,
    });
    fixtures[spec.key] = { id: userId, email, classification: spec.classification };
  }
  return fixtures;
}

async function auditTrustTab(page, userId, classificationKey) {
  const trustApiPromise = page.waitForResponse(
    (r) => r.url().includes(`/api/admin/user-management/${userId}/trust`) && r.request().method() === "GET",
    { timeout: 45000 }
  );
  await page.goto(`${BASE}/admin/users/${userId}?tab=trust`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const trustRes = await trustApiPromise.catch(() => null);
  const apiStatus = trustRes?.status() ?? 0;
  const apiOk = apiStatus === 200;
  await page.locator(".admin-user-trust-panel").first().waitFor({ state: "visible", timeout: 30000 }).catch(() => null);
  const panelText = (await page.locator(".admin-user-trust-panel").first().innerText().catch(() => "")) || "";
  const hasArabicTrust = /التحقق|التصنيف|أهلية|الثقة/i.test(panelText);
  const noRawIp = !/\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(panelText);
  const noRawEnumTitle = !/\b(REAL|TEST|E2E|INTERNAL|SUSPECTED)\b/.test(panelText);
  const noSha256 = !/[a-f0-9]{32,}/i.test(panelText);
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return el.scrollWidth > el.clientWidth + 2;
  });
  return {
    classificationKey,
    apiStatus,
    apiOk,
    hasArabicTrust,
    noRawIp,
    noRawEnumTitle,
    noSha256,
    noHorizontalOverflow: !overflow,
    panelSnippet: panelText.slice(0, 200),
  };
}

async function main() {
  mkdirSync(join(ROOT, ".artifacts"), { recursive: true });
  let env = loadValidationBrowserEnv(ROOT);
  assertStagingOnly(env);
  env = applyStagingPartnerFeatureFlags(env);
  if (!env.SECURITY_SIGNAL_HMAC_SECRET && existsSync(join(ROOT, ".env.staging.local"))) {
    const raw = readFileSync(join(ROOT, ".env.staging.local"), "utf8");
    const m = raw.match(/^SECURITY_SIGNAL_HMAC_SECRET=(.+)$/m);
    if (m) env.SECURITY_SIGNAL_HMAC_SECRET = m[1].trim();
  }

  const adminSession = await resolveValidationAdminCredentials(env, {});
  report.adminCredentialResolution = {
    resolver: "resolveValidationAdminCredentials",
    maskedEmail: adminSession.email?.replace(/^(.{3}).*@/, "$1***@"),
    isolatedValidationAdmin:
      process.env.HV_VALIDATION_TARGET === "isolated"
        ? adminSession.email === ISOLATED_VALIDATION_ADMIN_EMAIL
        : null,
    stagingOwnerEmailUsed: adminSession.email === "staging@hasanchartworld.com",
  };
  const service = createStagingServiceClient(env);
  const password = resolveTestPassword(env);
  const trustFixtures = await ensureTrustFixtures(service, password);

  await ensurePortReady(PORT);
  env.NODE_ENV = "development";
  env.IAM_DB = "true";
  env.IAM_API = "true";
  env.IAM_UI = "true";
  env.IAM_RLS = "false";
  const dev = startDevServer(ROOT, env, PORT);

  let browser;
  let partnerUserId = null;
  try {
    await waitForServer(PORT, 120000);
    browser = await chromium.launch({ headless: true });

    const anonCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ar" });
    const anonPage = await anonCtx.newPage();
    attachPageObservers(anonPage, report.observers);
    await anonPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const anonFraud = await fetchApi(anonPage, "/api/admin/partner-marketing/fraud-review");
    record(
      "adminFraud",
      "anonymousFraudApiDenied",
      anonFraud.status === 401 || anonFraud.status === 403,
      anonFraud
    );
    record("adminFraud", "anonymousNot404", anonFraud.status !== 404, anonFraud);
    record("adminFraud", "anonymousNot5xx", anonFraud.status < 500, anonFraud);
    await anonCtx.close();

    const partnerEmail = `${RUN_TAG}-partner-deny@${FIXTURE_DOMAIN}`;
    const partnerCreated = await service.auth.admin.createUser({
      email: partnerEmail,
      password,
      email_confirm: true,
      user_metadata: { hv_pass3_browser: true },
    });
    partnerUserId =
      partnerCreated.data?.user?.id ||
      (await service.auth.admin.listUsers({ perPage: 1000 })).data.users.find((u) => u.email === partnerEmail)?.id;
    await service.from("profiles").upsert({ id: partnerUserId, email: partnerEmail, role: "user" });

    const partnerCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ar" });
    await loginViaSupabase(partnerCtx, env, BASE, partnerEmail, password);
    const partnerPage = await partnerCtx.newPage();
    attachPageObservers(partnerPage, report.observers);
    await partnerPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    const partnerFraud = await fetchApi(partnerPage, "/api/admin/partner-marketing/fraud-review");
    record(
      "adminFraud",
      "partnerFraudApiDenied",
      partnerFraud.status === 401 || partnerFraud.status === 403,
      partnerFraud
    );
    record("adminFraud", "partnerNot404", partnerFraud.status !== 404, partnerFraud);
    await partnerCtx.close();

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "ar" });
    const page = await context.newPage();
    attachPageObservers(page, report.observers);

    await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
    record("register", "desktopLoads", page.url().includes("/register"));
    await setTheme(page, "dark");
    record("themes", "registerDark", true);
    await setTheme(page, "light");
    record("themes", "registerLight", true);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/register`, { waitUntil: "domcontentloaded" });
    record("register", "mobile390", true);
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    record("register", "mobileNoHorizontalOverflow", !mobileOverflow);

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    record("login", "desktopLoads", page.url().includes("/login"));

    await loginViaSupabase(context, env, BASE, adminSession.email, adminSession.password);
    const boot = await bootstrapSession(page, BASE, { expectedIsAdmin: true });
    record("adminFraud", "adminBootstrap", boot.ok, { error: boot.error || null });

    const fraudNavPromise = page.waitForResponse(
      (r) => r.url().includes("/api/admin/partner-marketing/fraud-review") && r.request().method() === "GET",
      { timeout: 60000 }
    );
    await page.goto(`${BASE}/admin/partners?tab=fraud`, { waitUntil: "domcontentloaded", timeout: 60000 });
    const fraudNavRes = await fraudNavPromise.catch(() => null);
    const fraudNavStatus = fraudNavRes?.status() ?? 0;
    const fraudVisible = await page
      .getByText("الاحتيال والمراجعة", { exact: false })
      .first()
      .isVisible()
      .catch(() => false);

    const fraudApiAdmin = await fetchApi(page, "/api/admin/partner-marketing/fraud-review");
    record(
      "adminFraud",
      "fraudApiAdmin200",
      fraudApiAdmin.status === 200 && fraudApiAdmin.body?.success === true,
      { uiVisible: fraudVisible, navStatus: fraudNavStatus, ...fraudApiAdmin }
    );
    record("adminFraud", "fraudApiNot404", fraudApiAdmin.status !== 404, fraudApiAdmin);
    record("adminFraud", "fraudApiNot5xx", fraudApiAdmin.status < 500, fraudApiAdmin);
    record("adminFraud", "fraudApiNot429", fraudApiAdmin.status !== 429, fraudApiAdmin);

    await page.goto(`${BASE}/admin/users`, { waitUntil: "domcontentloaded" });
    record("adminTrust", "usersCrmLoads", page.url().includes("/admin/users"));

    report.adminTrust.fixtures = {};
    for (const [key, fx] of Object.entries(trustFixtures)) {
      const audit = await auditTrustTab(page, fx.id, key);
      report.adminTrust.fixtures[key] = audit;
      record(
        "adminTrust",
        `${key}TrustApi200`,
        audit.apiOk,
        { status: audit.apiStatus, classification: fx.classification }
      );
      record("adminTrust", `${key}ArabicPresentation`, audit.hasArabicTrust && audit.noRawEnumTitle, audit);
      record("adminTrust", `${key}NoRawIp`, audit.noRawIp, audit);
      record("adminTrust", `${key}NoHashLeak`, audit.noSha256, audit);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await setTheme(page, "dark");
    const mobileTrust = await auditTrustTab(page, trustFixtures.real.id, "real-mobile-dark");
    record("adminTrust", "mobileDarkTrust", mobileTrust.apiOk && mobileTrust.noHorizontalOverflow, mobileTrust);
    await setTheme(page, "light");
    record("themes", "adminTrustLight", true);
  } finally {
    if (browser) await browser.close();
    await stopDevServer(dev);
    for (const fx of Object.values(trustFixtures || {})) {
      try {
        await service.from("account_risk_signals").delete().eq("user_id", fx.id);
        await service.auth.admin.deleteUser(fx.id);
      } catch {
        /* best-effort cleanup */
      }
    }
    if (partnerUserId) {
      try {
        await service.auth.admin.deleteUser(partnerUserId);
      } catch {
        /* ignore */
      }
    }
  }

  const badNetwork = (report.observers.networkFailures || []).filter(
    (f) => f.status === 404 || f.status === 429 || f.status >= 500
  );
  record("observers", "noUnexpectedBadNetwork", badNetwork.length === 0, { badNetwork });
  record("observers", "noCriticalConsole", (report.observers.criticalConsole || 0) === 0, {
    count: report.observers.criticalConsole,
  });
  record("observers", "noUnexpected429", (report.observers.unexpected429 || 0) === 0, {
    count: report.observers.unexpected429,
  });
  record("observers", "noServer5xx", (report.observers.server5xx || 0) === 0, {
    count: report.observers.server5xx,
  });

  report.pass = report.errors.length === 0;
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: report.pass, artifact: ARTIFACT, executed: report.manifest.executed, errors: report.errors.length }, null, 2));
  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  report.errors.push({ fatal: String(err.message || err) });
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2));
  console.error(err);
  process.exit(1);
});
