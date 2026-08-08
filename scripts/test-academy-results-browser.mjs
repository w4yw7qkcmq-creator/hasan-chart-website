#!/usr/bin/env node
import { chromium } from "playwright";

const BASE = process.env.CONTENT_POSTS_TEST_BASE || "http://127.0.0.1:3000";
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
  { name: "360x800", width: 360, height: 800 },
];

const PATHS = ["/academy", "/results", "/admin/academy", "/admin/results"];
const THEMES = ["dark", "light"];

const report = {
  base: BASE,
  browserFailures: 0,
  overflowFailures: 0,
  whiteScreenFailures: 0,
  consoleErrors: 0,
  hydrationWarnings: 0,
  pageErrors: 0,
  network5xx: 0,
  checks: [],
};

async function inspectPage(page, path, viewport, theme) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }, theme);

  const consoleErrors = [];
  const pageErrors = [];
  const hydrationWarnings = [];
  let network5xx = 0;

  const onConsole = (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (type === "error") consoleErrors.push(text);
    if (/hydration/i.test(text)) hydrationWarnings.push(text);
  };
  const onPageError = (error) => pageErrors.push(String(error));
  const onResponse = (response) => {
    if (response.status() >= 500) network5xx += 1;
  };

  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("response", onResponse);

  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1500);

  const metrics = await page.evaluate(() => {
    const bodyText = document.body?.innerText?.trim() || "";
    const scrollWidth = document.documentElement.scrollWidth;
    const clientWidth = document.documentElement.clientWidth;
    return {
      whiteScreen: bodyText.length < 20,
      overflow: scrollWidth > clientWidth + 2,
      hasMain: Boolean(document.querySelector("main")),
    };
  });

  page.off("console", onConsole);
  page.off("pageerror", onPageError);
  page.off("response", onResponse);

  const check = {
    path,
    viewport: viewport.name,
    theme,
    ...metrics,
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length,
    hydrationWarnings: hydrationWarnings.length,
    network5xx,
    pass:
      metrics.hasMain &&
      !metrics.whiteScreen &&
      !metrics.overflow &&
      consoleErrors.length === 0 &&
      pageErrors.length === 0 &&
      hydrationWarnings.length === 0 &&
      network5xx === 0,
  };

  if (!check.pass) {
    if (!metrics.hasMain || metrics.whiteScreen) report.whiteScreenFailures += 1;
    if (metrics.overflow) report.overflowFailures += 1;
    if (consoleErrors.length) report.consoleErrors += consoleErrors.length;
    if (pageErrors.length) report.pageErrors += pageErrors.length;
    if (hydrationWarnings.length) report.hydrationWarnings += hydrationWarnings.length;
    if (network5xx) report.network5xx += network5xx;
    report.browserFailures += 1;
  }

  report.checks.push(check);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "ar-SA" });
  const page = await context.newPage();

  for (const path of PATHS) {
    for (const viewport of VIEWPORTS) {
      for (const theme of THEMES) {
        await inspectPage(page, path, viewport, theme);
      }
    }
  }

  await browser.close();

  console.log(JSON.stringify(report, null, 2));
  if (report.browserFailures > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
