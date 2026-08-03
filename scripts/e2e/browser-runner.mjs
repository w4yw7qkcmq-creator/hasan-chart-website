import fs from "node:fs";
import path from "node:path";
import { ConsoleCapture } from "./console-capture.mjs";
import { DEFAULT_VIEWPORT, SCREENSHOT_PAGES } from "./screenshots.mjs";
import { screenshotPath } from "./paths.mjs";
import { compareScreenshot } from "./visual-regression.mjs";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

/**
 * @param {object} options
 * @param {string} options.baseUrl
 * @param {import('./paths.mjs').createRunPaths extends (...args: any) => infer R ? R : never} runPaths
 * @param {{ user?: import('./http.mjs').HttpClient, admin?: import('./http.mjs').HttpClient }} [options.clients]
 * @param {boolean} [options.hasAdminCredentials]
 */
export async function runVisualAndPerfCapture({
  baseUrl,
  runPaths,
  clients = {},
  hasAdminCredentials = false,
}) {
  const playwright = await loadPlaywright();
  if (!playwright) {
    return {
      status: "BLOCKED",
      note: "playwright not installed — run: npm install -D playwright && npx playwright install chromium",
      pages: [],
      visualRegressions: [],
    };
  }

  const capture = new ConsoleCapture(runPaths.files);
  const browser = await playwright.chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: DEFAULT_VIEWPORT,
    ignoreHTTPSErrors: true,
  });

  /** @type {Array<object>} */
  const pageMetrics = [];
  /** @type {Array<object>} */
  const visualResults = [];

  try {
    for (const spec of SCREENSHOT_PAGES) {
      if (spec.auth === "admin" && !hasAdminCredentials) {
        visualResults.push({
          file: spec.file,
          name: spec.name,
          status: "BLOCKED",
          note: "admin credentials missing",
        });
        continue;
      }

      const page = await context.newPage();
      capture.attach(page);

      if (spec.auth === "user" && clients.user) {
        await applyCookies(page, baseUrl, clients.user);
      }
      if (spec.auth === "admin" && clients.admin) {
        await applyCookies(page, baseUrl, clients.admin);
      }

      const url = `${baseUrl}${spec.path}`;
      const t0 = Date.now();

      let response = null;
      try {
        response = await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });
      } catch (error) {
        pageMetrics.push({
          slug: spec.slug,
          name: spec.name,
          url,
          loadTimeMs: Date.now() - t0,
          error: error?.message || String(error),
          failed: true,
        });
        visualResults.push({ file: spec.file, name: spec.name, status: "FAIL", note: error?.message });
        await page.close();
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const perf = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const paints = performance.getEntriesByType("paint");
        const fcp = paints.find((p) => p.name === "first-contentful-paint");
        let lcp = null;
        try {
          const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
          lcp = lcpEntries[lcpEntries.length - 1]?.startTime ?? null;
        } catch {
          lcp = null;
        }
        return {
          domReady: nav ? nav.domContentLoadedEventEnd : null,
          loadTime: nav ? nav.loadEventEnd : null,
          fcp: fcp ? fcp.startTime : null,
          lcp,
        };
      });

      const outPath = screenshotPath(runPaths.dirs, spec.file);
      await page.screenshot({ path: outPath, fullPage: false });

      const requests = await page.evaluate(() => performance.getEntriesByType("resource").length);

      pageMetrics.push({
        slug: spec.slug,
        name: spec.name,
        url,
        httpStatus: response?.status?.() ?? null,
        loadTimeMs: Date.now() - t0,
        domReadyMs: perf.domReady,
        fcpMs: perf.fcp,
        lcpMs: perf.lcp,
        networkRequests: requests,
        screenshot: spec.file,
      });

      const visual = await compareScreenshot({ currentPath: outPath, filename: spec.file });
      visualResults.push({ file: spec.file, name: spec.name, ...visual });

      await page.close();
    }
  } finally {
    await browser.close();
  }

  const regressions = visualResults.filter((v) => String(v.note || "").includes("VISUAL REGRESSION"));
  const status = regressions.length
    ? "FAIL"
    : visualResults.some((v) => v.status === "FAIL")
      ? "FAIL"
      : visualResults.some((v) => v.status === "BLOCKED")
        ? "BLOCKED"
        : "PASS";

  return {
    status,
    note: regressions.length
      ? `${regressions.length} VISUAL REGRESSION(S)`
      : `captured ${visualResults.filter((v) => v.status === "PASS").length} pages`,
    pages: pageMetrics,
    visualResults,
    console: capture.summary(),
    visualRegressions: regressions,
  };
}

async function applyCookies(page, baseUrl, client) {
  const cookieHeader = client.jar.header();
  if (!cookieHeader) return;
  const url = new URL(baseUrl);
  const cookies = cookieHeader.split(";").map((part) => {
    const eq = part.indexOf("=");
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    return {
      name,
      value,
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    };
  });
  await page.context().addCookies(cookies);
}
