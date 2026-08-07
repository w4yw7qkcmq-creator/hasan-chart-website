#!/usr/bin/env node
/**
 * Order Blocks mobile browser check — targets depth ladder only (.ob-order-blocks).
 */
import { chromium } from "playwright";

const BASE = process.env.ORDER_BLOCKS_TEST_BASE || "http://127.0.0.1:3000";
const VIEWPORTS = [
  { name: "390x844", width: 390, height: 844 },
  { name: "360x800", width: 360, height: 800 },
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

  await page.evaluate(() => {
    document.querySelector(".ob-order-blocks")?.closest(".ob-surface")?.scrollIntoView({ block: "start" });
  });
  await page.waitForTimeout(400);

  const result = await page.evaluate(async () => {
    const blocks = document.querySelector(".ob-order-blocks");
    if (!blocks) {
      return { missingBlocks: true };
    }

    blocks.scrollTop = blocks.scrollHeight;
    await new Promise((r) => requestAnimationFrame(r));

    const sellSection = blocks.querySelector('[data-order-blocks-section="sell"]');
    const buySection = blocks.querySelector('[data-order-blocks-section="buy"]');
    const mid = blocks.querySelector('[data-order-blocks-section="mid"]');
    const sellRows = sellSection?.querySelectorAll(".ob-negative")?.length || 0;
    const buyRows = buySection?.querySelectorAll(".ob-positive")?.length || 0;
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
    const panel = blocks.closest(".ob-surface");
    const panelStyle = panel ? getComputedStyle(panel) : null;
    const blocksStyle = getComputedStyle(blocks);

    const inView = (el) => {
      if (!el) return false;
      const b = el.getBoundingClientRect();
      return b.height > 0 && b.top < window.innerHeight && b.bottom > 0;
    };

    const buyVisible = buySection
      ? [...buySection.querySelectorAll(".ob-positive")].some((el) => inView(el))
      : false;
    const sellVisible = sellSection
      ? [...sellSection.querySelectorAll(".ob-negative")].some((el) => inView(el))
      : false;

    return {
      missingBlocks: false,
      sellRows,
      buyRows,
      mid: Boolean(mid),
      sellVisible,
      buyVisible,
      midVisible: inView(mid),
      overflowX,
      panelOverflow: panelStyle?.overflow || null,
      blocksOverflowY: blocksStyle.overflowY,
      blocksScrollH: blocks.scrollHeight,
      blocksClientH: blocks.clientHeight,
      dir: document.documentElement.getAttribute("dir"),
    };
  });

  if (result.missingBlocks) report.browserFailures += 1;

  const ok =
    !result.missingBlocks &&
    result.sellRows > 0 &&
    result.buyRows > 0 &&
    result.mid &&
    result.sellVisible &&
    result.buyVisible &&
    result.midVisible &&
    result.dir === "rtl" &&
    !result.overflowX;

  if (!ok) report.browserFailures += 1;
  if (result.overflowX) report.overflowFailures += 1;

  report.checks.push({
    viewport: viewport.name,
    theme,
    ...result,
    sellBlocksVisible: result.sellVisible,
    buyBlocksVisible: result.buyVisible,
    currentPriceVisible: result.midVisible,
    horizontalOverflow: result.overflowX,
    ok,
  });
}

const browser = await chromium.launch({ headless: true });
for (const viewport of VIEWPORTS) {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      locale: "ar-SA",
    });
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
