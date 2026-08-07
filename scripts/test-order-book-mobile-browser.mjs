#!/usr/bin/env node
/**
 * Order Book mobile layout browser check — local or production BASE URL.
 */
import { chromium } from "playwright";

const BASE = process.env.ORDER_BOOK_TEST_BASE || "http://127.0.0.1:3000";
const VIEWPORTS = [
  { name: "390x844", width: 390, height: 844 },
  { name: "360x800", width: 360, height: 800 },
  { name: "412x915", width: 412, height: 915 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
];

const report = {
  base: BASE,
  browserFailures: 0,
  consoleErrors: 0,
  pageErrors: 0,
  hydrationWarnings: 0,
  network5xx: 0,
  overflowFailures: 0,
  checks: [],
};

async function evaluatePage(page, viewport, theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }, theme);

  await page.goto(`${BASE}/order-book?symbol=BTCUSDT`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(4000);

  const result = await page.evaluate(() => {
    const asks = document.querySelectorAll(".ob-negative").length;
    const bids = document.querySelectorAll(".ob-positive").length;
    const mid = document.querySelectorAll(".ob-mid-row").length;
    const headerCard = document.querySelector("header.ob-surface, header .ob-surface");
    const headerHasSurface =
      Boolean(document.querySelector("header.rounded-2xl")) ||
      Boolean(document.querySelector("header .ob-surface"));
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
    return {
      asks,
      bids,
      mid,
      headerHasSurface,
      dir: document.documentElement.getAttribute("dir"),
      overflowX,
      title: document.querySelector("h1")?.textContent?.trim() || "",
    };
  });

  const ok =
    result.asks > 0 &&
    result.bids > 0 &&
    result.mid > 0 &&
    result.headerHasSurface &&
    result.dir === "rtl" &&
    !result.overflowX;

  if (!ok) report.browserFailures += 1;
  if (result.overflowX) report.overflowFailures += 1;

  report.checks.push({
    viewport: viewport.name,
    theme,
    ...result,
    mobileRedSectionVisible: result.asks > 0,
    mobileGreenSectionVisible: result.bids > 0,
    mobileCurrentPriceVisible: result.mid > 0,
    mobileNoHorizontalOverflow: !result.overflowX,
    headerCardResponsive: result.headerHasSurface,
    ok,
  });
}

const browser = await chromium.launch({ headless: true });
for (const viewport of VIEWPORTS) {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, locale: "ar-SA" });
    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error" && !/favicon|hydration/i.test(msg.text())) report.consoleErrors += 1;
      if (msg.type() === "warning" && /hydration/i.test(msg.text())) report.hydrationWarnings += 1;
    });
    page.on("pageerror", () => {
      report.pageErrors += 1;
    });
    page.on("response", (res) => {
      if (res.url().includes("hasanchartworld") || res.url().includes("127.0.0.1")) {
        if (res.status() >= 500) report.network5xx += 1;
      }
    });
    await evaluatePage(page, viewport, theme);
    await context.close();
  }
}
await browser.close();

console.log(JSON.stringify(report, null, 2));
if (report.browserFailures > 0 || report.pageErrors > 0) process.exit(1);
