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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;

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
  const source = readFileSync(
    join(ROOT, "app/components/order-book/OrderBookPageContent.js"),
    "utf8",
  );
  assert.match(source, /useOrderBookHistory/);
  assert.match(source, /HistoryState/);
  assert.match(source, /البيانات التاريخية قيد التجميع/);
  assert.match(source, /coveragePercent/);
  assert.match(source, /formatCoveragePercent/);
  assert.doesNotMatch(source, /Math\.round\(\(Number\(completeness\)/);
  assert.match(source, /dir="ltr"/);
  assert.match(source, /overflow-x-hidden/);
});

test("UI window options include long frames", () => {
  assert.ok(FLOW_WINDOW_OPTIONS.includes("7d"));
  assert.ok(LARGE_TRADE_WINDOW_OPTIONS.includes("7d"));
});

test("no historical walls claim", () => {
  const source = readFileSync(
    join(ROOT, "app/components/order-book/OrderBookPageContent.js"),
    "utf8",
  );
  assert.match(source, /جدران السيولة/);
  assert.doesNotMatch(source, /جدران.*تاريخ/i);
});

test("history API routes referenced by hook", () => {
  const source = readFileSync(join(ROOT, "app/hooks/useOrderBookHistory.js"), "utf8");
  assert.match(source, /\/api\/market-depth\/history\/flow/);
  assert.match(source, /\/api\/market-depth\/history\/large-trades/);
});

test("mobile layout classes present", () => {
  const source = readFileSync(
    join(ROOT, "app/components/order-book/OrderBookPageContent.js"),
    "utf8",
  );
  assert.match(source, /max-w-7xl px-4/);
  assert.match(source, /sm:grid-cols-2/);
});

console.log(`order-book history ui tests passed: ${passed}/${passed}`);
