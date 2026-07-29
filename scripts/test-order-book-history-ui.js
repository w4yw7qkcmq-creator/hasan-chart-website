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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;

function readSources() {
  return {
    page: readFileSync(join(ROOT, "app/components/order-book/OrderBookPageContent.js"), "utf8"),
    walls: readFileSync(join(ROOT, "app/components/order-book/HistoricalLiquidityWallsPanel.js"), "utf8"),
    ui: readFileSync(join(ROOT, "app/components/order-book/order-book-ui.js"), "utf8"),
    panel: readFileSync(join(ROOT, "app/components/order-book/OrderBookPanel.js"), "utf8"),
    chart: readFileSync(join(ROOT, "app/components/order-book/LiquidityDepthChart.js"), "utf8"),
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
  const dataSourcesIndex = page.lastIndexOf('title="مصادر البيانات"');
  const wallsIndex = page.indexOf("HistoricalLiquidityWallsPanel");
  const orderBookIndex = page.indexOf("OrderBookPanel");
  assert.ok(dataSourcesIndex > wallsIndex);
  assert.ok(dataSourcesIndex > orderBookIndex);
  assert.doesNotMatch(page, /title="مصادر البيانات"[\s\S]*OrderBookPanel/);
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
  const summaryHook = readFileSync(join(ROOT, "app/hooks/useOrderBook24hSummary.js"), "utf8");
  const { page } = readSources();
  assert.match(summaryHook, /window=1d|SUMMARY_WINDOW = "1d"/);
  assert.match(summaryHook, /scope=aggregated|SUMMARY_SCOPE = "aggregated"/);
  assert.match(page, /useOrderBook24hSummary/);
  assert.match(page, /آخر 24 ساعة/);
  assert.match(page, /formatPercent\(summary24h\?\.buyPercent\)/);
  assert.match(page, /summaryNetFlow/);
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

console.log(`order-book history ui tests passed: ${passed}/${passed}`);
