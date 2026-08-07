#!/usr/bin/env node
/**
 * Order Blocks + mobile header brand — strict reachability browser check.
 */
import { chromium } from "playwright";

const BASE = process.env.ORDER_BOOK_TEST_BASE || "http://127.0.0.1:3000";
const VIEWPORTS = [
  { name: "320x700", width: 320, height: 700 },
  { name: "360x800", width: 360, height: 800 },
  { name: "390x844", width: 390, height: 844 },
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

  const result = await page.evaluate(async () => {
    function findFirstClippingAncestor(el) {
      if (!el) return null;
      let node = el.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        const overflowY = style.overflowY;
        const overflow = style.overflow;
        const clips =
          (overflowY === "hidden" || overflow === "hidden") &&
          el.getBoundingClientRect().bottom > node.getBoundingClientRect().bottom + 1;
        if (clips) {
          return {
            tag: node.tagName.toLowerCase(),
            className: node.className?.slice?.(0, 120) || "",
            computedHeight: style.height,
            computedOverflow: overflowY || overflow,
            clientHeight: node.clientHeight,
            scrollHeight: node.scrollHeight,
          };
        }
        node = node.parentElement;
      }
      return null;
    }

    const blocks = document.querySelector(".ob-order-blocks");
    const buySection = blocks?.querySelector('[data-order-blocks-section="buy"]');
    const sellSection = blocks?.querySelector('[data-order-blocks-section="sell"]');
    const mid = blocks?.querySelector('[data-order-blocks-section="mid"]');
    const buyRows = buySection ? [...buySection.querySelectorAll(".ob-positive")] : [];
    const sellRows = sellSection ? [...sellSection.querySelectorAll(".ob-negative")] : [];

    const inView = (el) => {
      if (!el) return false;
      const b = el.getBoundingClientRect();
      return b.height > 0 && b.width > 0 && b.top < window.innerHeight && b.bottom > 0;
    };

    const header = document.querySelector(".site-top-header");
    const brandPrimary = header?.querySelector(".site-header-brand__text--primary");
    const brandText = brandPrimary?.textContent?.trim() || "";
    const brandStyle = brandPrimary ? getComputedStyle(brandPrimary) : null;
    const hc = header?.querySelector(".site-header-logo-badge");
    const menuBtn = header?.querySelector(".site-header-menu-btn");
    const pushBtn = header?.querySelector(".browserPushBtn");

    const blocksStyle = blocks ? getComputedStyle(blocks) : null;
    const firstClippingAncestor = findFirstClippingAncestor(buySection);

    const lastBuy = buyRows[buyRows.length - 1] || null;
    const firstBuy = buyRows[0] || null;
    const midRect = mid?.getBoundingClientRect() || null;
    const firstBuyRectBeforeScroll = firstBuy?.getBoundingClientRect() || null;
    const lastBuyRectBeforeScroll = lastBuy?.getBoundingClientRect() || null;
    const buyBelowPriceBeforeScroll = Boolean(
      lastBuyRectBeforeScroll &&
        midRect &&
        lastBuyRectBeforeScroll.top > midRect.bottom - 1,
    );

    const brandVisible = Boolean(brandPrimary && inView(brandPrimary));
    const hcVisible = inView(hc);
    const menuVisible = inView(menuBtn);
    const notificationButtonsVisible = inView(pushBtn);

    if (lastBuy) {
      lastBuy.scrollIntoView({ block: "center", behavior: "instant" });
    }
    await new Promise((r) => requestAnimationFrame(r));

    const lastBuyRect = lastBuy?.getBoundingClientRect() || null;
    const firstBuyRect = firstBuy?.getBoundingClientRect() || null;
    let hitBuy = false;
    if (lastBuyRect && lastBuyRect.width > 0 && lastBuyRect.height > 0) {
      const x = Math.min(
        window.innerWidth - 4,
        Math.max(4, lastBuyRect.left + lastBuyRect.width / 2),
      );
      const y = Math.min(
        window.innerHeight - 4,
        Math.max(4, lastBuyRect.top + lastBuyRect.height / 2),
      );
      const hit = document.elementFromPoint(x, y);
      hitBuy = Boolean(hit?.closest('[data-order-blocks-section="buy"]'));
    }

    const overflowX = document.documentElement.scrollWidth > window.innerWidth + 2;

    return {
      missingBlocks: !blocks,
      sellRows: sellRows.length,
      buyRows: buyRows.length,
      sellVisible: sellRows.some((el) => inView(el)),
      buyVisible: buyRows.some((el) => inView(el)),
      currentPriceVisible: inView(mid),
      buySectionRendered: buyRows.length > 0,
      buySectionHasHeight: Boolean(firstBuyRect && firstBuyRect.height > 0),
      buySectionReachableByScroll: Boolean(lastBuyRect && lastBuyRect.height > 0 && hitBuy),
      buySectionNotClipped: !firstClippingAncestor,
      buySectionOffsetTop: firstBuyRectBeforeScroll?.top ?? null,
      lastBuyBottom: lastBuyRectBeforeScroll?.bottom ?? null,
      currentPriceBottom: midRect?.bottom ?? null,
      buyBelowPrice: buyBelowPriceBeforeScroll,
      firstClippingAncestor,
      orderBlocksScrollHeight: blocks?.scrollHeight ?? null,
      orderBlocksClientHeight: blocks?.clientHeight ?? null,
      blocksOverflowY: blocksStyle?.overflowY ?? null,
      blocksMaxHeight: blocksStyle?.maxHeight ?? null,
      brandVisible,
      brandStartsWithHasan: brandText.startsWith("HasaN"),
      brandEllipsis: brandStyle?.textOverflow === "ellipsis",
      brandText,
      hcVisible,
      menuVisible,
      notificationButtonsVisible,
      headerOverflowX: overflowX,
      headerHasSurface: Boolean(document.querySelector("header.ob-surface, header.rounded-2xl")),
      dir: document.documentElement.getAttribute("dir"),
      overflowX,
    };
  });

  const isMobile = viewport.width < 768;
  const isTabletOrMobile = viewport.width < 1024;
  const ok =
    !result.missingBlocks &&
    result.sellRows >= 12 &&
    result.buyRows >= 12 &&
    result.currentPriceVisible &&
    result.buySectionRendered &&
    result.buySectionHasHeight &&
    result.buySectionReachableByScroll &&
    (isMobile ? result.buySectionNotClipped : true) &&
    result.buyBelowPrice &&
    result.brandVisible &&
    result.brandStartsWithHasan &&
    !result.brandEllipsis &&
    result.hcVisible &&
    (!isTabletOrMobile || result.menuVisible) &&
    result.notificationButtonsVisible &&
    !result.overflowX &&
    result.dir === "rtl" &&
    (!isMobile || result.blocksOverflowY === "visible") &&
    (!isMobile || result.blocksMaxHeight === "none");

  if (!ok) report.browserFailures += 1;
  if (result.overflowX) report.overflowFailures += 1;

  report.checks.push({
    viewport: viewport.name,
    theme,
    ...result,
    buyReachable: result.buySectionReachableByScroll,
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
    await evaluatePage(page, viewport, theme);
    await context.close();
  }
}
await browser.close();

console.log(JSON.stringify(report, null, 2));
if (report.browserFailures > 0 || report.pageErrors > 0) process.exit(1);
