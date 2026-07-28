import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ORDER_BOOK_PREFS,
  LEGACY_STORAGE_KEYS,
  PREFERENCES_SCHEMA_VERSION,
  STORAGE_KEY,
  buildMarketDepthQuery,
  migrateOrderBookPreferences,
  normalizeOrderBookPreferences,
} from "../app/hooks/useOrderBookPreferences.js";
import { formatLargeTradeEmptyMessage } from "../app/components/order-book/formatters.js";
import { formatInteger } from "../app/components/order-book/formatters.js";

function testFreshDefaults() {
  const prefs = normalizeOrderBookPreferences({});
  assert.equal(prefs.largeTradeThreshold, 50_000);
  assert.equal(prefs.largeTradeWindow, "15m");
  assert.equal(prefs.symbol, "BTCUSDT");
}

function testLegacy100KMigratesTo50K() {
  const migrated = migrateOrderBookPreferences(
    {
      symbol: "ETHUSDT",
      mode: "okx",
      levels: 50,
      largeTradeThreshold: 100_000,
      flowWindow: "15m",
    },
    { legacy: true }
  );

  assert.equal(migrated.largeTradeThreshold, 50_000);
  assert.equal(migrated.largeTradeWindow, "15m");
  assert.equal(migrated.symbol, "ETHUSDT");
  assert.equal(migrated.mode, "okx");
  assert.equal(migrated.levels, 50);
  assert.equal(migrated.flowWindow, "15m");
}

function testModernExplicit100KRemains() {
  const migrated = migrateOrderBookPreferences(
    {
      symbol: "BTCUSDT",
      largeTradeThreshold: 100_000,
      __explicitLargeTradeThreshold: true,
      largeTradeWindow: "15m",
    },
    { legacy: false }
  );

  assert.equal(migrated.largeTradeThreshold, 100_000);
}

function testInvalidStoredFallback() {
  const prefs = normalizeOrderBookPreferences({
    largeTradeThreshold: 999_999,
    largeTradeWindow: "2d",
    flowWindow: "bad",
    symbol: "BTCUSDT",
  });

  assert.equal(prefs.largeTradeThreshold, 50_000);
  assert.equal(prefs.largeTradeWindow, "15m");
  assert.equal(prefs.flowWindow, "5m");
}

function testHistoricalWindowsAccepted() {
  const prefs = normalizeOrderBookPreferences({
    flowWindow: "7d",
    dominanceWindow: "4h",
    largeTradeWindow: "1d",
    symbol: "BTCUSDT",
  });

  assert.equal(prefs.flowWindow, "7d");
  assert.equal(prefs.dominanceWindow, "4h");
  assert.equal(prefs.largeTradeWindow, "1d");
}

function testBuildQueryIndependentWindows() {
  const query = buildMarketDepthQuery({
    ...DEFAULT_ORDER_BOOK_PREFS,
    flowWindow: "1m",
    dominanceWindow: "1h",
    largeTradeWindow: "15m",
    largeTradeThreshold: 25_000,
  });

  const params = new URLSearchParams(query);
  assert.equal(params.get("flowWindow"), "1m");
  assert.equal(params.get("dominanceWindow"), "1h");
  assert.equal(params.get("largeTradeWindow"), "15m");
  assert.equal(params.get("largeTradeThreshold"), "25000");
}

function testSchemaMetadata() {
  assert.equal(PREFERENCES_SCHEMA_VERSION, 3);
  assert.equal(STORAGE_KEY, "hasan-chart-order-book-prefs-v3");
  assert.deepEqual(LEGACY_STORAGE_KEYS, [
    "hasan-chart-order-book-prefs-v2",
    "hasan-chart-order-book-prefs-v1",
  ]);
}

function testArabicEmptyStateLabels() {
  const message = formatLargeTradeEmptyMessage(50_000, "15m");
  assert.match(message, /50\.0K/);
  assert.match(message, /15 دقيقة/);
  assert.doesNotMatch(message, /15m/);
}

function testFearGreedEnglishDigits() {
  const fearGreedSource = readFileSync(
    fileURLToPath(new URL("../app/components/order-book/FearGreedCard.js", import.meta.url)),
    "utf8"
  );

  assert.match(fearGreedSource, /formatInteger/);
  assert.doesNotMatch(fearGreedSource, /\{value\}/);
  assert.equal(formatInteger(72), "72");
}

const tests = [
  testFreshDefaults,
  testLegacy100KMigratesTo50K,
  testModernExplicit100KRemains,
  testInvalidStoredFallback,
  testHistoricalWindowsAccepted,
  testBuildQueryIndependentWindows,
  testSchemaMetadata,
  testArabicEmptyStateLabels,
  testFearGreedEnglishDigits,
];

let passed = 0;
for (const test of tests) {
  test();
  passed += 1;
}

console.log(`order-book preferences tests passed: ${passed}/${tests.length}`);
