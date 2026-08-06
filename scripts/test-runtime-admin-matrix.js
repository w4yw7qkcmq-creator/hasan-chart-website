#!/usr/bin/env node
/**
 * Authenticated admin runtime matrix — read-only navigation, no mutations.
 * Requires E2E_ADMIN_EMAIL + E2E_ADMIN_PASS in .env.e2e.local
 */
import assert from "node:assert/strict";
import { loginAdminSession, loadRuntimeCredentials } from "./lib/design-system-runtime-auth.js";
import {
  attachRuntimeDiagnostics,
  createEmptyBucket,
  filterActionableIssues,
  readPageDiagnostics,
  setTheme,
} from "./lib/design-system-runtime-diagnostics.js";
import { ADMIN_RUNTIME_ROUTES, RUNTIME_THEMES } from "./lib/design-system-component-registry.js";

const BASE = process.env.DESIGN_SYSTEM_TEST_BASE_URL || "http://127.0.0.1:3099";

const ADMIN_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
];

let consoleErrors = 0;
let hydrationWarnings = 0;
let pageErrors = 0;
let unexpectedNetwork4xx = 0;
let network5xx = 0;
let requestFailuresUnexpected = 0;
let keyboardFailures = 0;
let themeFailures = 0;
let responsiveFailures = 0;
let adminRuntimeFailures = 0;
let browserFailures = 0;

const creds = loadRuntimeCredentials();
if (!creds.hasAdminCredentials) {
  console.error(`
Admin Runtime Matrix BLOCKED — missing credentials.

Add to .env.e2e.local (project root, gitignored):

  E2E_ADMIN_EMAIL=your-admin@example.com
  E2E_ADMIN_PASS=your-admin-password

Optional: copy from .env.e2e.example
Provision smoke admin: npm run e2e:provision (requires E2E_USER_PASS + E2E_ADMIN_PASS + Supabase service role)

Then re-run: node scripts/test-runtime-admin-matrix.js
`);
  process.exit(1);
}

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("test-runtime-admin-matrix: playwright not installed");
  process.exit(1);
}

const adminSession = await loginAdminSession(BASE);
if (!adminSession.authenticated) {
  console.error("Admin login failed — check E2E_ADMIN_EMAIL / E2E_ADMIN_PASS");
  process.exit(1);
}
console.log(
  `admin session: authenticated=${adminSession.authenticated} admin=${adminSession.isAdmin} user=${adminSession.maskedEmail}`,
);

const ADMIN_ROUTES_WITH_ASSETS = [...ADMIN_RUNTIME_ROUTES, "/assets"];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies(adminSession.cookies);

async function fail(kind, detail) {
  adminRuntimeFailures += 1;
  browserFailures += 1;
  if (kind === "keyboard") keyboardFailures += 1;
  if (kind === "theme") themeFailures += 1;
  if (kind === "responsive") responsiveFailures += 1;
  console.error(`[admin-fail] ${kind}: ${detail}`);
}

async function exerciseAdminRoute(page, route) {
  const bucket = createEmptyBucket();
  attachRuntimeDiagnostics(page, bucket);

  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1000);

    const url = page.url();
    if (/\/login|\/403/.test(url)) {
      await fail("guard", `${route} redirected to ${url}`);
      return;
    }

    for (const theme of RUNTIME_THEMES) {
      await setTheme(page, theme);
      const diag = await readPageDiagnostics(page);
      if (diag.theme !== theme) {
        await fail("theme", `${route} expected theme=${theme} got=${diag.theme}`);
      }
      if (diag.dir !== "rtl") {
        await fail("theme", `${route} dir=${diag.dir} expected rtl`);
      }
      if (diag.overflowX > 2) {
        await fail("responsive", `${route} overflowX=${diag.overflowX} theme=${theme}`);
      }
    }

    if (route === "/admin") {
      for (const tabLabel of ["الاشتراكات", "التحليلات", "الحسابات"]) {
        const tab = page.getByRole("button", { name: tabLabel }).or(page.getByRole("tab", { name: tabLabel }));
        if (await tab.count()) {
          await tab.first().click({ timeout: 3000 }).catch(() => fail("keyboard", `tab ${tabLabel} on /admin`));
          await page.waitForTimeout(400);
        }
      }
    }

    const defects = filterActionableIssues(bucket, { url: route, authenticated: true });
    for (const issue of defects) {
      browserFailures += 1;
      adminRuntimeFailures += 1;
      if (issue.kind === "console.error") consoleErrors += 1;
      else if (issue.kind === "hydration") hydrationWarnings += 1;
      else if (issue.kind === "pageerror") pageErrors += 1;
      else if (issue.kind === "network4xx") unexpectedNetwork4xx += 1;
      else if (issue.kind === "network5xx") network5xx += 1;
      else if (issue.kind === "requestfailed") requestFailuresUnexpected += 1;
      console.error(`[${route}] ${issue.kind}: ${issue.message || issue.text || issue.url || ""}`);
    }
  } catch (error) {
    await fail("route", `${route} ${error.message}`);
  }
}

for (const route of ADMIN_ROUTES_WITH_ASSETS) {
  for (const viewport of ADMIN_VIEWPORTS) {
    const page = await context.newPage({
      viewport: { width: viewport.width, height: viewport.height },
    });
    await exerciseAdminRoute(page, route);
    await page.close();
  }
}

await context.close();
await browser.close();

assert.equal(consoleErrors, 0, `consoleErrors=${consoleErrors}`);
assert.equal(hydrationWarnings, 0, `hydrationWarnings=${hydrationWarnings}`);
assert.equal(pageErrors, 0, `pageErrors=${pageErrors}`);
assert.equal(unexpectedNetwork4xx, 0, `unexpectedNetwork4xx=${unexpectedNetwork4xx}`);
assert.equal(network5xx, 0, `network5xx=${network5xx}`);
assert.equal(requestFailuresUnexpected, 0, `requestFailuresUnexpected=${requestFailuresUnexpected}`);
assert.equal(keyboardFailures, 0, `keyboardFailures=${keyboardFailures}`);
assert.equal(themeFailures, 0, `themeFailures=${themeFailures}`);
assert.equal(responsiveFailures, 0, `responsiveFailures=${responsiveFailures}`);
assert.equal(adminRuntimeFailures, 0, `adminRuntimeFailures=${adminRuntimeFailures}`);
assert.equal(browserFailures, 0, `browserFailures=${browserFailures}`);

console.log(
  `test-runtime-admin-matrix: PASS routes=${ADMIN_ROUTES_WITH_ASSETS.length} viewports=${ADMIN_VIEWPORTS.length} adminRuntimeFailures=0`,
);
