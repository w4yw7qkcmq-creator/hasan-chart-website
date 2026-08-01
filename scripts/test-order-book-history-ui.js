import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FLOW_WINDOW_OPTIONS,
  HISTORICAL_FLOW_WINDOWS,
  HISTORICAL_LARGE_TRADE_WINDOWS,
  LARGE_TRADE_WINDOW_OPTIONS,
  LIVE_FLOW_WINDOWS,
  LIVE_LARGE_TRADE_WINDOWS,
} from "../lib/market-data/constants.js";
import {
  isHistoricalFlowWindow,
  isHistoricalLargeTradeWindow,
  isLiveFlowWindow,
  isLiveLargeTradeWindow,
} from "../app/hooks/useOrderBookHistory.js";
import { buildMarketDepthQuery } from "../app/hooks/useOrderBookPreferences.js";
import { formatDurationAr } from "../app/components/order-book/formatters.js";
import { computeDepthBarWidthPercent } from "../app/components/order-book/depth-bar-utils.js";
import {
  fearGreedClassificationAr,
  fearGreedPointerPosition,
} from "../app/components/order-book/fear-greed-gauge.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;

function readSources() {
  return {
    page: readFileSync(join(ROOT, "app/components/order-book/OrderBookPageContent.js"), "utf8"),
    walls: readFileSync(join(ROOT, "app/components/order-book/HistoricalLiquidityWallsPanel.js"), "utf8"),
    ui: readFileSync(join(ROOT, "app/components/order-book/order-book-ui.js"), "utf8"),
    panel: readFileSync(join(ROOT, "app/components/order-book/OrderBookPanel.js"), "utf8"),
    chart: readFileSync(join(ROOT, "app/components/order-book/LiquidityDepthChart.js"), "utf8"),
    fearGreed: readFileSync(join(ROOT, "app/components/order-book/FearGreedCard.js"), "utf8"),
    summaryHook: readFileSync(join(ROOT, "app/hooks/useOrderBook24hSummary.js"), "utf8"),
  };
}

function test(name, fn) {
  fn();
  passed += 1;
}

test("short flow frames are live", () => {
  for (const window of ["1m", "5m", "15m", "1h"]) {
    assert.equal(isLiveFlowWindow(window), true);
    assert.equal(isHistoricalFlowWindow(window), false);
  }
});

test("long flow frames are historical", () => {
  for (const window of HISTORICAL_FLOW_WINDOWS) {
    assert.equal(isHistoricalFlowWindow(window), true);
    assert.equal(isLiveFlowWindow(window), false);
  }
});

test("large trade live vs historical split", () => {
  for (const window of ["5m", "15m", "1h"]) {
    assert.equal(isLiveLargeTradeWindow(window), true);
  }
  for (const window of HISTORICAL_LARGE_TRADE_WINDOWS) {
    assert.equal(isHistoricalLargeTradeWindow(window), true);
  }
});

test("SSE query keeps live windows only", () => {
  const query = buildMarketDepthQuery({
    symbol: "BTCUSDT",
    mode: "aggregated",
    flowWindow: "7d",
    dominanceWindow: "4h",
    largeTradeWindow: "1d",
    levels: 20,
    liquidityRange: 0.5,
    largeTradeThreshold: 50_000,
  });
  assert.match(query, /flowWindow=5m/);
  assert.match(query, /dominanceWindow=5m/);
  assert.match(query, /largeTradeWindow=15m/);
});

test("SSE query preserves selected live windows", () => {
  const query = buildMarketDepthQuery({
    symbol: "BTCUSDT",
    mode: "aggregated",
    flowWindow: "1h",
    dominanceWindow: "15m",
    largeTradeWindow: "1h",
    levels: 20,
    liquidityRange: 0.5,
    largeTradeThreshold: 50_000,
  });
  assert.match(query, /flowWindow=1h/);
  assert.match(query, /dominanceWindow=15m/);
  assert.match(query, /largeTradeWindow=1h/);
});

test("UI uses history hook and partial badge", () => {
  const { page, ui } = readSources();
  assert.match(page, /useOrderBookHistory/);
  assert.match(page, /HistoryState/);
  assert.match(ui, /البيانات التاريخية قيد التجميع/);
  assert.match(page, /coveragePercent/);
  assert.match(ui, /formatCoveragePercent/);
  assert.match(ui, /dir="ltr"/);
});

test("UI window options include long frames", () => {
  assert.ok(FLOW_WINDOW_OPTIONS.includes("7d"));
  assert.ok(LARGE_TRADE_WINDOW_OPTIONS.includes("7d"));
});

test("historical liquidity walls panel arabic and tabs", () => {
  const { page, walls } = readSources();
  assert.match(page, /HistoricalLiquidityWallsPanel/);
  assert.match(page, /useOrderBookLiquidityWalls/);
  assert.match(walls, /جدران السيولة التاريخية/);
  assert.match(walls, /الأكثر ثباتًا/);
  assert.match(walls, /الأكثر ظهورًا/);
  assert.match(walls, /المختفية حديثًا/);
  assert.match(walls, /أقوى جدار/);
  assert.doesNotMatch(walls, /Top Persistent Walls/);
  assert.doesNotMatch(walls, /Historical Liquidity Walls/);
  assert.doesNotMatch(walls, /Persistence:/);
});

test("buy green sell red without blue on trade elements", () => {
  const { page, walls, panel, chart, ui } = readSources();
  const combined = page + walls + panel + chart + ui;
  assert.match(combined, /text-emerald|bg-emerald|emerald-/);
  assert.match(combined, /text-rose|bg-rose|rose-/);
  assert.doesNotMatch(panel, /text-blue|bg-blue|border-blue|text-cyan|text-sky|text-teal/);
  assert.doesNotMatch(chart, /#3b82f6|#0ea5e9|#06b6d4|blue/);
  assert.doesNotMatch(walls, /["']Buy["']|["']Sell["']/);
  assert.doesNotMatch(walls, />\s*Buy\s*</);
  assert.doesNotMatch(walls, />\s*Sell\s*</);
});

test("data sources moved to last section", () => {
  const page = readSources().page;
  const dataSourcesIndex = page.lastIndexOf("مصادر البيانات");
  const wallsIndex = page.indexOf("HistoricalLiquidityWallsPanel");
  const orderBookIndex = page.indexOf("OrderBookPanel");
  assert.ok(dataSourcesIndex > wallsIndex);
  assert.ok(dataSourcesIndex > orderBookIndex);
  assert.match(page, /FearGreedCard[\s\S]*مصادر البيانات/);
});

test("historical walls full width grid", () => {
  const { page, walls } = readSources();
  assert.match(page, /items-start/);
  assert.match(page, /lg:grid-cols-12/);
  assert.match(page, /lg:col-span-8/);
  assert.match(page, /lg:col-span-4/);
  assert.match(walls, /col-span-full/);
});

test("segmented controls replace native timeframe selects in page", () => {
  const page = readSources().page;
  assert.match(page, /SegmentedControl/);
  assert.doesNotMatch(page, /<select[\s\S]*flowWindow/);
});

test("duration formatter converts seconds to arabic minutes", () => {
  assert.equal(formatDurationAr(540), "9 دقيقة");
  assert.equal(formatDurationAr(35), "35 ث");
  assert.equal(formatDurationAr(0), "حديثًا");
  assert.equal(formatDurationAr(3900), "1 س 5 د");
});

test("walls table limits default rows and show more", () => {
  const walls = readSources().walls;
  assert.match(walls, /DEFAULT_VISIBLE = 8/);
  assert.match(walls, /عرض المزيد/);
});

test("liquidity walls hook calls history API", () => {
  const source = readFileSync(join(ROOT, "app/hooks/useOrderBookLiquidityWalls.js"), "utf8");
  assert.match(source, /\/api\/market-depth\/history\/liquidity-walls/);
  assert.match(source, /initialLoading/);
  assert.match(source, /isRefreshing/);
  assert.match(source, /cacheByKeyRef/);
});

test("history API routes referenced by hook", () => {
  const source = readFileSync(join(ROOT, "app/hooks/useOrderBookHistory.js"), "utf8");
  assert.match(source, /\/api\/market-depth\/history\/flow/);
  assert.match(source, /\/api\/market-depth\/history\/large-trades/);
});

test("mobile layout classes present", () => {
  const page = readSources().page;
  assert.match(page, /max-w-7xl px-4/);
  assert.match(page, /sm:grid-cols-2/);
  assert.match(page, /overflow-x-auto/);
});

test("24h summary uses dedicated hook with fixed 1d window", () => {
  const { summaryHook, page } = readSources();
  assert.match(summaryHook, /window=1d|SUMMARY_WINDOW = "1d"/);
  assert.match(summaryHook, /scope=aggregated|SUMMARY_SCOPE = "aggregated"/);
  assert.match(page, /useOrderBook24hSummary/);
  assert.match(page, /آخر 24 ساعة/);
  assert.match(page, /formatPercent\(summary24h\.buyPercent\)/);
  assert.match(page, /summaryNetFlow/);
});

test("24h summary separates initialLoading from isRefreshing", () => {
  const { summaryHook, page, ui } = readSources();
  assert.match(summaryHook, /initialLoading/);
  assert.match(summaryHook, /isRefreshing/);
  assert.match(summaryHook, /background:\s*true/);
  assert.match(summaryHook, /hasDataRef/);
  assert.match(page, /initialLoading:\s*summary24hInitialLoading/);
  assert.match(page, /isRefreshing:\s*summary24hRefreshing/);
  assert.match(page, /initialLoading=\{summary24hInitialLoading\}/);
  assert.match(page, /isRefreshing=\{summary24hRefreshing\}/);
  assert.match(ui, /RefreshSpinner/);
  assert.match(ui, /initialLoading/);
  assert.match(ui, /isRefreshing/);
});

test("24h summary does not flash ellipsis during background refresh", () => {
  const page = readSources().page;
  assert.doesNotMatch(page, /summary24hLoading[\s\S]*"\.\.\."/);
  assert.doesNotMatch(page, /"\.\.\."/);
  assert.match(page, /summary24h\s*\?\s*formatPercent/);
});

test("control labels are fully arabic", () => {
  const page = readSources().page;
  assert.match(page, /label="دقة السعر"/);
  assert.match(page, /label="عدد المستويات"/);
  assert.match(page, /label="نطاق السيولة"/);
  assert.match(page, /label="عرض الجوال"/);
  assert.doesNotMatch(page, /label="Precision"/);
  assert.match(page, /عمق السوق/);
});

test("fear and greed card has order book variant with arabic title", () => {
  const { page, fearGreed } = readSources();
  assert.match(page, /FearGreedCard variant="orderBook"/);
  assert.match(fearGreed, /variant = "default"/);
  assert.match(fearGreed, /variant === "orderBook"/);
  assert.match(fearGreed, /مؤشر الخوف والطمع/);
  assert.match(fearGreed, /تعذّر تحميل مؤشر الخوف والطمع حاليًا/);
});

test("order book depth glow uses rose and emerald gradients", () => {
  const panel = readSources().panel;
  assert.match(panel, /linear-gradient\(to left, rgba\(244,63,94/);
  assert.match(panel, /linear-gradient\(to left, rgba\(16,185,129/);
  assert.match(panel, /absolute inset-y-0 right-0/);
  assert.match(panel, /relative z-\[1\]/);
  assert.doesNotMatch(panel, /text-blue|bg-blue|text-cyan|text-sky|text-teal/);
});

test("depth bar width uses sqrt scaling with visual minimum", () => {
  assert.equal(computeDepthBarWidthPercent(0, 100), 0);
  assert.equal(computeDepthBarWidthPercent(50, 0), 0);
  assert.equal(computeDepthBarWidthPercent(100, 100), 100);
  assert.ok(computeDepthBarWidthPercent(25, 100) >= 8);
  assert.ok(computeDepthBarWidthPercent(25, 100) < computeDepthBarWidthPercent(100, 100));
});

test("liquidity walls summary has independent live/historical frames", () => {
  const { page, panel } = readSources();
  assert.match(page, /liquidityWallsWindow/);
  assert.match(page, /LIQUIDITY_WALLS_SUMMARY_WINDOW_OPTIONS/);
  assert.match(page, /title="جدران السيولة"/);
  assert.match(page, /HistoricalWallCard/);
  assert.match(page, /LiquidityWallsState/);
  assert.match(page, /strongestBid/);
  assert.match(page, /strongestAsk/);
  assert.match(page, /enabled: !isSidebarWallsLive/);
  assert.match(panel, /تعذّر تحميل جدران السيولة/);
});

test("fear and greed semicircle gauge has five segments and arabic bands", () => {
  const fearGreed = readSources().fearGreed;
  const gauge = readFileSync(join(ROOT, "app/components/order-book/fear-greed-gauge.js"), "utf8");
  assert.match(fearGreed, /fear-greed-gauge/);
  assert.match(gauge, /FEAR_GREED_GAUGE_SEGMENTS/);
  assert.match(gauge, /#dc2626/);
  assert.match(gauge, /#f97316/);
  assert.match(gauge, /#eab308/);
  assert.match(gauge, /#84cc16/);
  assert.match(gauge, /#059669/);
  assert.match(fearGreed, /SemicircleGauge/);
  assert.equal(fearGreedClassificationAr(39), "خوف");
  assert.equal(fearGreedClassificationAr(0), "خوف شديد");
  assert.equal(fearGreedClassificationAr(50), "محايد");
  assert.equal(fearGreedClassificationAr(100), "طمع شديد");
  const left = fearGreedPointerPosition(0);
  const mid = fearGreedPointerPosition(50);
  const right = fearGreedPointerPosition(100);
  assert.ok(left.x < mid.x && mid.x < right.x);
  assert.ok(mid.y < left.y);
  assert.doesNotMatch(fearGreed, /Sentiment[\s\S]*variant === "orderBook"/);
});

test("liquidity depth chart supports live and historical windows", () => {
  const { page, chart, ui } = readSources();
  assert.match(page, /liquidityDepthWindow/);
  assert.match(page, /LIQUIDITY_DEPTH_WINDOW_OPTIONS/);
  assert.match(page, /useLiquidityDepthHistory/);
  assert.match(page, /خريطة جدران السيولة التاريخية/);
  assert.match(chart, /mode === "historical"/);
  assert.match(page, /depthHistory\?\.aggregatedDepthPoints/);
  assert.match(ui, /DepthHistoryState/);
  assert.match(ui, /تعذّر تحميل بيانات السيولة التاريخية/);
});

test("segmented controls stay inside cards with width constraints", () => {
  const { ui, page } = readSources();
  assert.match(ui, /min-w-0 max-w-full/);
  assert.match(ui, /overflow-x-auto scrollbar-none/);
  assert.match(ui, /whitespace-nowrap/);
  assert.match(page, /Panel[\s\S]*SegmentedControl/);
  assert.doesNotMatch(page, /action=\{\s*<SegmentedControl/);
});

test("spread stays live while summary uses 24h", () => {
  const page = readSources().page;
  assert.match(page, /label="السبريد"[\s\S]*sublabel="لحظي"/);
  assert.match(page, /formatPrice\(data\?\.spread/);
});

test("default historical wall window is defined and used", () => {
  const page = readSources().page;
  assert.match(page, /DEFAULT_LIQUIDITY_WALL_WINDOW/);
});

test("live walls keep last known values during reconnect", () => {
  const page = readSources().page;
  assert.match(page, /lastLiveWallsRef/);
  assert.match(page, /liveWallsBid/);
  assert.match(page, /liveWallsAsk/);
});

test("historical walls panel falls back across tabs and keeps analytics", () => {
  const walls = readSources().walls;
  assert.match(walls, /resolveTabRows/);
  assert.match(walls, /strongestBid/);
  assert.match(walls, /strongestAsk/);
  assert.match(walls, /usingFallback/);
});

test("order book layout uses separate rows without grid placement hacks", () => {
  const { page, panel } = readSources();
  assert.match(page, /Row 1 — order book \(right\) \+ dominance \/ executed flow \(left\)/);
  assert.match(page, /Row 2 — live \/ summary liquidity walls/);
  assert.match(page, /Row 3 — depth chart \(right\) \+ large trades \(left\)/);
  assert.match(page, /lg:items-stretch/);
  assert.match(page, /Full-width sections/);
  assert.match(page, /space-y-4/);
  assert.match(page, /Last — data sources/);
  assert.doesNotMatch(page, /lg:row-span-/);
  assert.doesNotMatch(page, /lg:row-start-/);
  assert.doesNotMatch(page, /lg:col-start-/);
  assert.doesNotMatch(page, /marketToolsGrid/);
  const row1 = page.slice(page.indexOf("{/* Row 1"), page.indexOf("{/* Row 2"));
  assert.match(row1, /flex min-h-0 min-w-0 flex-col lg:col-span-8/);
  assert.match(row1, /flex min-h-0 min-w-0 flex-col gap-3 lg:col-span-4/);
  assert.doesNotMatch(row1, /ORDER_BOOK_ROW_HEIGHT_LG/);
  assert.doesNotMatch(row1, /overflow-hidden lg:col-span-4/);
  assert.doesNotMatch(row1, /title="جدران السيولة"/);
  assert.match(panel, /ORDER_BOOK_VISIBLE_ROWS = 12/);
  assert.match(panel, /ORDER_BOOK_ROW_HEIGHT_LG = "lg:h-\[36rem\]"/);
  assert.match(panel, /visibleAsks = asks\.slice\(0, ORDER_BOOK_VISIBLE_ROWS\)/);
  assert.match(panel, /h-full min-h-0/);
  assert.match(panel, /overflow-y-auto overscroll-contain/);
});

test("row 1 sidebar has natural height without walls stack", () => {
  const page = readSources().page;
  const row1 = page.slice(page.indexOf("{/* Row 1"), page.indexOf("{/* Row 2"));
  assert.match(row1, /lg:items-stretch/);
  assert.match(row1, /OrderBookPanel/);
  assert.match(row1, /title="سيطرة الشراء والبيع"/);
  assert.match(row1, /title="حجم الشراء\/البيع المنفذ"/);
  assert.doesNotMatch(row1, /title="جدران السيولة"/);
  assert.doesNotMatch(row1, /flex-1 flex-col overflow-x-hidden/);
});

test("sidebar column has no fixed height wrapper", () => {
  const page = readSources().page;
  const row1 = page.slice(page.indexOf("{/* Row 1"), page.indexOf("{/* Row 2"));
  assert.doesNotMatch(row1, /lg:col-span-4 lg:min-h-0 \$\{ORDER_BOOK_ROW_HEIGHT_LG\}/);
  assert.match(row1, /className="min-w-0"/);
});

test("depth and large trades share equal-height row with scroll cap", () => {
  const page = readSources().page;
  const row2 = page.slice(page.indexOf("{/* Row 3"), page.indexOf("{/* Full-width sections"));
  assert.match(row2, /relative isolate z-0/);
  assert.match(row2, /lg:col-span-7/);
  assert.match(row2, /lg:col-span-5/);
  assert.match(row2, /fillContainer/);
  assert.match(row2, /max-h-\[26rem\]/);
  assert.match(row2, /overflow-y-auto overflow-x-auto overscroll-contain/);
  assert.match(row2, /relative z-0 flex h-full min-h-0 min-w-0 flex-col lg:col-span-5/);
  assert.match(row2, /shrink-0 space-y-3[\s\S]*HistoryState/);
  assert.match(row2, /mt-3 min-h-0 flex-1 min-w-0/);
  assert.match(row2, /min-w-\[42rem\]/);
  assert.match(row2, /الكمية/);
  assert.match(page, /LARGE_TRADES_MAX_VISIBLE_ROWS = 15/);
  assert.match(page, /\.slice\(0, LARGE_TRADES_MAX_VISIBLE_ROWS\)/);
  assert.match(page, /displayedLargeTrades = useMemo/);
  assert.doesNotMatch(row2, /lg:row-start-/);
  assert.doesNotMatch(row2, /lg:col-start-/);
});

test("executed flow panel uses natural auto height grid metrics", () => {
  const { page } = readSources();
  const row1 = page.slice(page.indexOf("{/* Row 1"), page.indexOf("{/* Row 2"));
  const flowTitleIndex = row1.indexOf('title="حجم الشراء/البيع');
  const flowStart = row1.lastIndexOf("<Panel", flowTitleIndex);
  const flowPanel = row1.slice(flowStart, row1.indexOf("</Panel>", flowTitleIndex) + 8);
  assert.match(flowPanel, /className="min-w-0 transition-opacity duration-200"/);
  assert.match(flowPanel, /mt-3 grid grid-cols-2 gap-2/);
  assert.match(flowPanel, /executedFlow\?\.window/);
  assert.doesNotMatch(flowPanel, /overflow-hidden/);
  assert.doesNotMatch(flowPanel, /min-h-0 overflow-x-hidden/);
});

test("liquidity depth chart renders multi-level histogram with axes and tooltip", () => {
  const { chart, page } = readSources();
  assert.match(chart, /sqrtScale/);
  assert.match(chart, /buildPriceTicks/);
  assert.match(chart, /buildValueTicks/);
  assert.match(chart, /#10b981/);
  assert.match(chart, /#f43f5e/);
  assert.match(chart, /strokeDasharray="4 3"/);
  assert.match(chart, /buildTooltipLines/);
  assert.match(chart, /البعد عن السعر/);
  assert.match(chart, /مستوى شراء ·/);
  assert.match(chart, /preserveAspectRatio="none"/);
  assert.match(chart, /min-h-\[14rem\]/);
  assert.match(page, /depthMap \|\| \[\]/);
  assert.match(page, /aggregatedDepthPoints/);
  assert.doesNotMatch(chart, /as="span"/);
});

test("depth chart keeps historical errors visible without silent fallback", () => {
  const { chart, page } = readSources();
  assert.match(chart, /mode === "historical"/);
  assert.match(chart, /if \(error\)/);
  assert.match(chart, /DepthHistoryState/);
  assert.match(page, /depthHistoryError/);
  assert.doesNotMatch(chart, /catch[\s\S]*mode = "live"/);
});

test("liquidity walls moved to dedicated full-width row", () => {
  const page = readSources().page;
  const row1 = page.slice(page.indexOf("{/* Row 1"), page.indexOf("{/* Row 2"));
  assert.doesNotMatch(row1, /title="جدران السيولة"/);
  const wallsRow = page.slice(page.indexOf("{/* Row 2"), page.indexOf("{/* Row 3"));
  assert.match(wallsRow, /title="جدران السيولة"/);
  assert.match(wallsRow, /lg:col-span-12/);
  assert.match(wallsRow, /LiveWallCard title="أكبر جدار شراء"/);
  assert.doesNotMatch(wallsRow, /LiveWallCard compact/);
});

test("fear and greed order book uses coinmarketcap source without visible attribution", () => {
  const { fearGreed } = readSources();
  assert.match(fearGreed, /source=coinmarketcap/);
  assert.match(fearGreed, /attribution: "المصدر: CoinMarketCap"/);
  assert.match(fearGreed, /FEAR_GREED_REFRESH_MS = 15 \* 60 \* 1000/);
  assert.doesNotMatch(fearGreed, /alternative\.me[\s\S]*variant === "orderBook"/);
  assert.match(fearGreed, /lastSuccessfulRef/);
  assert.match(fearGreed, /cache: "no-store"/);
  const orderBookRenderStart = fearGreed.indexOf("if (isOrderBook) {");
  const orderBookRenderEnd = fearGreed.indexOf("return (\n    <div className={wrapperClass}>", orderBookRenderStart);
  const orderBookRender = fearGreed.slice(orderBookRenderStart, orderBookRenderEnd);
  assert.doesNotMatch(orderBookRender, /المصدر: CoinMarketCap/);
});

test("coinmarketcap fear greed adapter parses public endpoint", () => {
  const adapter = readFileSync(
    join(ROOT, "lib/market-data/sentiment/coinmarketcap-fear-greed.js"),
    "utf8",
  );
  const constants = readFileSync(join(ROOT, "lib/market-data/constants.js"), "utf8");
  assert.match(adapter, /coinmarketcap/);
  assert.match(adapter, /CMC_FEAR_GREED_API_URL/);
  assert.match(constants, /pro-api\.coinmarketcap\.com\/public-api\/v3\/fear-and-greed\/latest/);
  assert.match(adapter, /CMC_FEAR_GREED_CACHE_MS/);
});

test("historical walls hook retries and caches per window", () => {
  const hook = readFileSync(join(ROOT, "app/hooks/useOrderBookLiquidityWalls.js"), "utf8");
  assert.match(hook, /fetchLiquidityWallsWithRetry/);
  assert.match(hook, /cacheByKeyRef/);
  assert.match(hook, /30_000/);
  assert.match(hook, /stale: true/);
});

test("liquidity wall cards grow naturally without clipping overflow", () => {
  const { panel, ui } = readSources();
  assert.doesNotMatch(panel, /LiveWallCard[\s\S]*min-h-\[7\.5rem\]/);
  assert.doesNotMatch(panel, /HistoricalWallCard[\s\S]*min-h-\[8rem\]/);
  assert.match(ui, /overflow-x-hidden/);
  assert.doesNotMatch(ui, /Panel[\s\S]*overflow-hidden rounded-2xl/);
});

test("symbol search combobox replaces fixed symbol tabs", () => {
  const { page, ui } = readSources();
  assert.match(page, /SymbolSearchCombobox/);
  assert.match(page, /SymbolSearchCombobox/);
  assert.match(page, /handleSymbolChange/);
  assert.match(ui, /filterSymbolSearchEntries|\/api\/market-symbols/);
  assert.match(ui, /placeholder="ابحث عن عملة USDT/);
});

console.log(`order-book history ui tests passed: ${passed}/${passed}`);
