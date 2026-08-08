#!/usr/bin/env node
/**
 * Browser validation for Academy/Result/Header/Order Blocks fixes.
 */
import { chromium } from "playwright";

const BASE = process.env.CONTENT_POSTS_TEST_BASE || "http://127.0.0.1:3000";
const VIEWPORTS = [
  { name: "320x700", width: 320, height: 700 },
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "412x915", width: 412, height: 915 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
];

const report = {
  browserFailures: 0,
  headerOverlapFailures: 0,
  overflowFailures: 0,
  consoleErrors: 0,
  hydrationWarnings: 0,
  pageErrors: 0,
  network5xx: 0,
  orderBlocks: {},
  contentColors: {},
};

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }, theme);
}

async function auditPage(page, path, theme) {
  const consoleErrors = [];
  const pageErrors = [];
  const hydrationWarnings = [];
  let network5xx = 0;
  page.on("console", (msg) => {
    const t = msg.text();
    if (msg.type() === "error") consoleErrors.push(t);
    if (/hydration/i.test(t)) hydrationWarnings.push(t);
  });
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  page.on("response", (r) => {
    if (r.status() >= 500) network5xx += 1;
  });

  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await setTheme(page, theme);
  await page.waitForTimeout(600);

  const metrics = await page.evaluate(() => {
    const main = document.querySelector("main");
    const heroTitle = document.querySelector(".content-posts-hero__title, .content-post-detail__title");
    const titleColor = heroTitle ? getComputedStyle(heroTitle).color : null;
    const bg = main ? getComputedStyle(main).backgroundColor : null;
    return {
      hasMain: Boolean(main),
      whiteScreen: (document.body?.innerText?.trim() || "").length < 20,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      titleColor,
      bg,
    };
  });

  report.consoleErrors += consoleErrors.length;
  report.pageErrors += pageErrors.length;
  report.hydrationWarnings += hydrationWarnings.length;
  report.network5xx += network5xx;
  if (metrics.overflow) report.overflowFailures += 1;

  const pass =
    metrics.hasMain &&
    !metrics.whiteScreen &&
    !metrics.overflow &&
    !consoleErrors.length &&
    !pageErrors.length &&
    !hydrationWarnings.length &&
    !network5xx;

  if (!pass) report.browserFailures += 1;

  if (path.includes("/academy") || path.includes("/results")) {
    report.contentColors[`${path}:${theme}`] = metrics.titleColor;
    if (theme === "dark" && metrics.titleColor) {
      const rgb = metrics.titleColor.match(/\d+/g)?.map(Number) || [];
      const luminance = rgb.length >= 3 ? 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] : 0;
      if (luminance < 120) report.browserFailures += 1;
    }
  }

  return pass;
}

async function auditHeader(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(500);

  const metrics = await page.evaluate(() => {
    const row = document.querySelector(".site-top-header__row");
    const brand = document.querySelector(".site-header-brand");
    const actions = document.querySelector(".site-top-header__actions");
    const rects = [...(actions?.children || [])].map((el) => el.getBoundingClientRect());
    let overlap = false;
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (a.right > b.left + 1 && b.right > a.left + 1 && a.bottom > b.top + 1 && b.bottom > a.top + 1) {
          overlap = true;
        }
      }
    }
    return {
      brandVisible: Boolean(brand && brand.offsetWidth > 0),
      actionsVisible: Boolean(actions && actions.offsetWidth > 0),
      overlap,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      gap: actions ? getComputedStyle(actions).gap : null,
    };
  });

  if (metrics.overlap) report.headerOverlapFailures += 1;
  if (metrics.overflow) report.overflowFailures += 1;
  if (!metrics.brandVisible || !metrics.actionsVisible) report.browserFailures += 1;

  return metrics;
}

async function auditOrderBlocks(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.goto(`${BASE}/order-book`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForTimeout(1200);

  const metrics = await page.evaluate(() => {
    const root = document.querySelector(".ob-order-blocks");
    if (!root) return { missing: true };
    const style = getComputedStyle(root);
    const sell = root.querySelector('[data-order-blocks-section="sell"]')?.children.length || 0;
    const buy = root.querySelector('[data-order-blocks-section="buy"]')?.children.length || 0;
    const mid = Boolean(root.querySelector('[data-order-blocks-section="mid"]'));
    return {
      overflowY: style.overflowY,
      maxHeight: style.maxHeight,
      scrollHeight: root.scrollHeight,
      clientHeight: root.clientHeight,
      innerScroll: style.overflowY === "auto" || style.overflowY === "scroll",
      sell,
      buy,
      mid,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    };
  });

  const key = `${width}x${height}`;
  report.orderBlocks[key] = metrics;
  if (metrics.missing || metrics.innerScroll || metrics.sell !== 12 || metrics.buy !== 12 || !metrics.mid) {
    report.browserFailures += 1;
  }
  if (metrics.overflow) report.overflowFailures += 1;
  return metrics;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: "ar-SA" });
  const page = await context.newPage();

  for (const path of ["/academy", "/results", "/admin/academy", "/admin/results"]) {
    for (const theme of ["dark", "light"]) {
      await auditPage(page, path, theme);
    }
  }

  for (const vp of VIEWPORTS) {
    await auditHeader(page, vp.width, vp.height);
  }

  for (const vp of VIEWPORTS.filter((v) => v.width >= 768)) {
    await auditOrderBlocks(page, vp.width, vp.height);
  }

  await browser.close();
  console.log(JSON.stringify(report, null, 2));

  const failed =
    report.browserFailures > 0 ||
    report.headerOverlapFailures > 0 ||
    report.overflowFailures > 0 ||
    report.consoleErrors > 0 ||
    report.hydrationWarnings > 0 ||
    report.pageErrors > 0 ||
    report.network5xx > 0;

  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ fatal: error.message }));
  process.exit(1);
});
