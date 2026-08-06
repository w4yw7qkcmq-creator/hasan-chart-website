#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  attachRuntimeDiagnostics,
  createEmptyBucket,
  filterActionableIssues,
} from "./lib/design-system-runtime-diagnostics.js";
import {
  PUBLIC_RUNTIME_ROUTES,
} from "./lib/design-system-component-registry.js";

const BASE = process.env.DESIGN_SYSTEM_TEST_BASE_URL || "http://127.0.0.1:3099";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("test-runtime-console-sweep: SKIP (playwright not installed)");
  process.exit(0);
}

let consoleErrors = 0;
let reactWarnings = 0;
let hydrationWarnings = 0;
let pageErrors = 0;
let unexpectedNetwork4xx = 0;
let network5xx = 0;
let requestFailuresUnexpected = 0;

const browser = await chromium.launch({ headless: true });

async function sweepRoute(page, route, { authenticated = false } = {}) {
  const bucket = createEmptyBucket();
  attachRuntimeDiagnostics(page, bucket);
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 90000 });
    await page.waitForTimeout(500);
  } catch {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(800);
  }

  const defects = filterActionableIssues(bucket, {
    url: route,
    authenticated,
    expectAuthRedirect: route.startsWith("/admin") && !authenticated,
  });

  for (const issue of defects) {
    const label = issue.message || issue.text || issue.url || "";
    if (issue.kind === "console.error") consoleErrors += 1;
    else if (issue.kind === "console.warning") reactWarnings += 1;
    else if (issue.kind === "hydration") hydrationWarnings += 1;
    else if (issue.kind === "pageerror") pageErrors += 1;
    else if (issue.kind === "network4xx") unexpectedNetwork4xx += 1;
    else if (issue.kind === "network5xx") network5xx += 1;
    else if (issue.kind === "requestfailed") requestFailuresUnexpected += 1;
    if (defects.length) console.error(`[${route}] ${issue.kind}: ${label}`);
  }
}

const routes = [...PUBLIC_RUNTIME_ROUTES];

for (const route of PUBLIC_RUNTIME_ROUTES) {
  const page = await browser.newPage();
  await sweepRoute(page, route, { authenticated: false });
  await page.close();
}

await browser.close();

assert.equal(consoleErrors, 0, `consoleErrors=${consoleErrors}`);
assert.equal(reactWarnings, 0, `reactWarnings=${reactWarnings}`);
assert.equal(hydrationWarnings, 0, `hydrationWarnings=${hydrationWarnings}`);
assert.equal(pageErrors, 0, `pageErrors=${pageErrors}`);
assert.equal(unexpectedNetwork4xx, 0, `unexpectedNetwork4xx=${unexpectedNetwork4xx}`);
assert.equal(network5xx, 0, `network5xx=${network5xx}`);
assert.equal(requestFailuresUnexpected, 0, `requestFailuresUnexpected=${requestFailuresUnexpected}`);

console.log(
  `test-runtime-console-sweep: PASS routes=${routes.length} consoleErrors=0 hydrationWarnings=0 pageErrors=0`,
);
