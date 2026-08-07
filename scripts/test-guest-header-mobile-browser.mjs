#!/usr/bin/env node
/**
 * Guest + authenticated mobile header overlap checks.
 */
import { chromium } from "playwright";

const BASE = process.env.ORDER_BOOK_TEST_BASE || "http://127.0.0.1:3000";
const VIEWPORTS = [
  { name: "320x700", width: 320, height: 700 },
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
  { name: "412x915", width: 412, height: 915 },
];

const PATHS = ["/", "/order-book?symbol=BTCUSDT"];

const report = {
  base: BASE,
  browserFailures: 0,
  consoleErrors: 0,
  pageErrors: 0,
  hydrationWarnings: 0,
  network5xx: 0,
  headerOverlapFailures: 0,
  checks: [],
};

function rectsOverlap(a, b, tolerance = 1) {
  if (!a || !b || a.width <= 0 || b.width <= 0) return false;
  return !(
    a.right <= b.left + tolerance ||
    a.left >= b.right - tolerance ||
    a.bottom <= b.top + tolerance ||
    a.top >= b.bottom - tolerance
  );
}

async function evaluateHeader(page, path, viewport, theme) {
  await page.evaluate((t) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("theme", t);
    } catch {}
  }, theme);

  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(2500);

  return page.evaluate(({ rectsOverlapSource, pagePath }) => {
    const rectsOverlap = new Function(`return (${rectsOverlapSource})`)();

    const header = document.querySelector(".site-top-header");
    const brand = header?.querySelector(".site-header-brand__text--primary");
    const hc = header?.querySelector(".site-header-logo-badge");
    const menu = header?.querySelector(".site-header-menu-btn");
    const bell = header?.querySelector(".browserPushBtn");
    const themeBtn = header?.querySelector(".site-header-theme-btn");
    const login = header?.querySelector(".topLoginBtn");
    const notificationBell = header?.querySelector(".notificationBell");

    const brandLink = header?.querySelector(".site-header-brand");
    const actions = header?.querySelector(".site-top-header__actions");

    const rect = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { top: b.top, left: b.left, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
    };

    const brandRect = rect(brand);
    const brandBoxRect = rect(brandLink);
    const actionsBoxRect = rect(actions);
    const bellRect = rect(bell);
    const loginRect = rect(login);
    const hcRect = rect(hc);
    const menuRect = rect(menu);
    const themeRect = rect(themeBtn);

    const overlaps = {
      brandBell: rectsOverlap(brandRect, bellRect),
      brandLogin: rectsOverlap(brandRect, loginRect),
      brandHc: rectsOverlap(brandRect, hcRect),
      brandMenu: rectsOverlap(brandRect, menuRect),
      brandTheme: rectsOverlap(brandRect, themeRect),
      brandActionsColumn: rectsOverlap(brandBoxRect, actionsBoxRect),
    };

    const inView = (el) => {
      if (!el) return false;
      const b = el.getBoundingClientRect();
      return b.height > 0 && b.width > 0 && b.top < window.innerHeight && b.bottom > 0;
    };

    const brandStyle = brand ? getComputedStyle(brand) : null;
    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;
    const isGuest = Boolean(login);
    const isAuth = Boolean(notificationBell);

    return {
      path: pagePath,
      brandText: brand?.textContent?.trim() || "",
      brandVisible: inView(brand),
      brandStartsWithHasan: (brand?.textContent?.trim() || "").startsWith("HasaN"),
      brandEllipsis: brandStyle?.textOverflow === "ellipsis",
      hcVisible: inView(hc),
      menuVisible: inView(menu),
      bellVisible: inView(bell),
      themeToggleVisible: inView(themeBtn),
      loginButtonVisible: inView(login),
      userChipVisible: inView(header?.querySelector(".topUserChip")),
      notificationBellVisible: inView(notificationBell),
      headerOverlap: overlaps.brandActionsColumn || overlaps.brandBell || overlaps.brandLogin,
      rectanglesDoNotOverlap: !(
        overlaps.brandActionsColumn ||
        overlaps.brandBell ||
        overlaps.brandLogin
      ),
      overlaps,
      brandRect,
      brandBoxRect,
      actionsBoxRect,
      bellRect,
      loginRect,
      hcRect,
      menuRect,
      headerOverflowX: overflowX,
      isGuest,
      isAuth,
      dir: document.documentElement.getAttribute("dir"),
    };
  }, { rectsOverlapSource: rectsOverlap.toString(), pagePath: path });
}

const browser = await chromium.launch({ headless: true });
for (const path of PATHS) {
  for (const viewport of VIEWPORTS) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        locale: "ar-SA",
      });
      const page = await context.newPage();
      page.on("console", (msg) => {
        if (msg.type() === "error" && !/favicon|hydration|market-depth|websocket/i.test(msg.text())) {
          report.consoleErrors += 1;
        }
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

      const result = await evaluateHeader(page, path, viewport, theme);
      const isMobile = viewport.width < 768;
      const ok =
        result.brandVisible &&
        result.brandStartsWithHasan &&
        !result.brandEllipsis &&
        result.hcVisible &&
        result.menuVisible &&
        result.bellVisible &&
        result.themeToggleVisible &&
        (result.isGuest ? result.loginButtonVisible : true) &&
        !result.headerOverlap &&
        result.rectanglesDoNotOverlap &&
        !result.headerOverflowX &&
        result.dir === "rtl" &&
        (isMobile ? result.brandText === "HasaN CharT" : result.brandText.startsWith("HasaN CharT"));

      if (!ok) report.browserFailures += 1;
      if (result.headerOverlap) report.headerOverlapFailures += 1;

      report.checks.push({
        viewport: viewport.name,
        theme,
        ...result,
        ok,
      });
      await context.close();
    }
  }
}
await browser.close();

console.log(JSON.stringify(report, null, 2));
if (report.browserFailures > 0 || report.pageErrors > 0) process.exit(1);
