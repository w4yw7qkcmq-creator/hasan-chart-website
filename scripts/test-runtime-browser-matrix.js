#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  PUBLIC_RUNTIME_ROUTES,
  RUNTIME_VIEWPORTS,
  RUNTIME_THEMES,
} from "./lib/design-system-component-registry.js";
import {
  attachRuntimeDiagnostics,
  createEmptyBucket,
  filterActionableIssues,
  readPageDiagnostics,
  setTheme,
} from "./lib/design-system-runtime-diagnostics.js";

const BASE = process.env.DESIGN_SYSTEM_TEST_BASE_URL || "http://127.0.0.1:3099";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("test-runtime-browser-matrix: SKIP (playwright not installed)");
  process.exit(0);
}

let publicRuntimeFailures = 0;
let responsiveFailures = 0;
let themeRuntimeFailures = 0;
let browserFailures = 0;

const browser = await chromium.launch({ headless: true });

async function exerciseRoute(page, route, { authenticated = false } = {}) {
  const bucket = createEmptyBucket();
  attachRuntimeDiagnostics(page, bucket);

  try {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(800);

    for (const theme of RUNTIME_THEMES) {
      await setTheme(page, theme);
      const before = await readPageDiagnostics(page);
      await page.evaluate(() => {
        const root = document.documentElement;
        root.setAttribute(
          "data-theme",
          root.getAttribute("data-theme") === "dark" ? "light" : "dark",
        );
      });
      await page.waitForTimeout(150);
      const after = await readPageDiagnostics(page);
      await setTheme(page, theme);

      if (before.overflowX > 2 || after.overflowX > 2) {
        responsiveFailures += 1;
        browserFailures += 1;
        console.error(`overflow ${route} theme=${theme} overflow=${Math.max(before.overflowX, after.overflowX)}`);
      }
      if (!before.title) {
        browserFailures += 1;
        console.error(`missing title ${route}`);
      }
      if (before.theme !== theme) {
        themeRuntimeFailures += 1;
        browserFailures += 1;
        console.error(`theme not applied ${route} expected=${theme} got=${before.theme}`);
      }
      if (before.dir !== "rtl") {
        browserFailures += 1;
        console.error(`dir not rtl on ${route}`);
      }
    }

    const defects = filterActionableIssues(bucket, {
      url: route,
      authenticated,
      expectAuthRedirect: route.startsWith("/admin") && !authenticated,
    });
    if (defects.length) {
      browserFailures += defects.length;
      console.error(`defects on ${route}:`, defects.slice(0, 3));
    }
  } catch (error) {
    browserFailures += 1;
    console.error(`route failed ${route}:`, error.message);
  }
}

for (const route of PUBLIC_RUNTIME_ROUTES) {
  for (const viewport of RUNTIME_VIEWPORTS) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height } });
    await exerciseRoute(page, route, { authenticated: false });
    await page.close();
    if (browserFailures > publicRuntimeFailures) publicRuntimeFailures = browserFailures;
  }
}

await browser.close();

assert.equal(publicRuntimeFailures, 0, `publicRuntimeFailures=${publicRuntimeFailures}`);
assert.equal(responsiveFailures, 0, `responsiveFailures=${responsiveFailures}`);
assert.equal(themeRuntimeFailures, 0, `themeRuntimeFailures=${themeRuntimeFailures}`);
assert.equal(browserFailures, 0, `browserFailures=${browserFailures}`);

console.log(
  `test-runtime-browser-matrix: PASS public=${PUBLIC_RUNTIME_ROUTES.length} viewports=${RUNTIME_VIEWPORTS.length} browserFailures=0`,
);
