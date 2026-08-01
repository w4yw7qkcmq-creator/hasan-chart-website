import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  aggregateLevels,
  bucketPrice,
  computeLiquidityDominance,
  computeSpread,
  detectLiquidityWalls,
  mergeExchangeBooks,
} from "../lib/market-data/aggregation.js";
import { assertNoMockInProduction, validateMarketDepthQuery } from "../lib/market-data/validation.js";
import { LocalOrderBook } from "../lib/market-data/order-book.js";
import { WS_BACKOFF_MS } from "../lib/market-data/constants.js";
import {
  classifyBinanceTrade,
  classifyDominanceStrength,
  dominantSideLabelAr,
  ExecutedFlowTracker,
} from "../lib/market-data/executed-flow.js";
import { formatLargeTradeEmptyMessage } from "../app/components/order-book/formatters.js";
import {
  countHealthyExchanges,
  resolveMarketDepthConnectionStatus,
} from "../lib/market-data/connection-status.js";
import {
  normalizeSiteSymbol,
  toExchangeSymbol,
} from "../lib/market-data/symbols.js";
import {
  BINANCE_REST_BASES,
  BINANCE_WS_ENDPOINTS,
  buildBinanceRestDepthUrl,
  buildBinanceStreamNames,
  buildBinanceWsUrl,
  computeBinanceReconnectDelay,
  isBinanceLiveConnected,
  resolveBinanceEndpointRotation,
} from "../lib/market-data/exchanges/binance.js";

function testSymbolNormalization() {
  assert.equal(normalizeSiteSymbol("btc/usdt"), "BTCUSDT");
  assert.equal(toExchangeSymbol("okx", "BTCUSDT"), "BTC-USDT");
  assert.equal(toExchangeSymbol("binance", "ETHUSDT"), "ETHUSDT");
  assert.equal(toExchangeSymbol("bybit", "XRPUSDT"), "XRPUSDT");
  assert.equal(normalizeSiteSymbol("DOGEUSDT"), null);
}

function testSnapshotAndDelta() {
  const book = new LocalOrderBook();
  book.applySnapshot({
    bids: [{ price: 100, quantity: 2 }],
    asks: [{ price: 101, quantity: 1 }],
    updateId: 10,
  });

  assert.equal(book.synced, true);
  assert.equal(book.bids.get(100), 2);

  const result = book.applyDelta({
    bids: [{ price: 100, quantity: 3 }],
    asks: [],
    updateId: 11,
    prevUpdateId: 10,
  });

  assert.equal(result.ok, true);
  assert.equal(book.bids.get(100), 3);
}

function testRemoveZeroQuantityLevel() {
  const book = new LocalOrderBook();
  book.applySnapshot({
    bids: [{ price: 50, quantity: 1 }],
    asks: [],
    updateId: 1,
  });

  book.applyDelta({
    bids: [{ price: 50, quantity: 0 }],
    asks: [],
    updateId: 2,
    prevUpdateId: 1,
  });

  assert.equal(book.bids.has(50), false);
}

function testSequenceGapRequiresResyncFlag() {
  const book = new LocalOrderBook();
  book.applySnapshot({
    bids: [{ price: 10, quantity: 1 }],
    asks: [],
    updateId: 5,
  });

  const result = book.applyDelta({
    bids: [{ price: 10, quantity: 2 }],
    asks: [],
    updateId: 7,
    prevUpdateId: 6,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "sequence_gap");
}

function testAggregationAcrossExchanges() {
  const books = [
    {
      exchange: "okx",
      synced: true,
      bids: [{ price: 100, quantity: 1 }],
      asks: [{ price: 101, quantity: 1 }],
    },
    {
      exchange: "binance",
      synced: true,
      bids: [{ price: 100.04, quantity: 2 }],
      asks: [{ price: 101.02, quantity: 1 }],
    },
  ];

  const bids = mergeExchangeBooks(books, { precision: 1, side: "bid", limit: 10 });
  assert.equal(bids.length, 1);
  assert.equal(bids[0].quantity, 3);
  assert.deepEqual(bids[0].exchanges.sort(), ["binance", "okx"]);
}

function testPriceBucketingAndNotional() {
  assert.equal(bucketPrice(100.04, 1), 100);
  const aggregated = aggregateLevels(
    [
      { price: 100.1, quantity: 1 },
      { price: 100.4, quantity: 2 },
    ],
    1,
    "okx"
  );
  assert.equal(aggregated.length, 1);
  assert.equal(aggregated[0].quantity, 3);
  assert.ok(aggregated[0].notional > 0);
}

function testDominanceCalculation() {
  const result = computeLiquidityDominance({
    bids: [{ price: 99, quantity: 10, notional: 990 }],
    asks: [{ price: 101, quantity: 1, notional: 101 }],
    midPrice: 100,
    rangePercent: 2,
  });

  assert.ok(result.bidPercent > 55);
  assert.equal(result.dominance, "غلبة شراء");
}

function testEmptyBookAndSingleExchangeDown() {
  const books = [
    { exchange: "okx", synced: false, bids: [{ price: 1, quantity: 1 }], asks: [] },
    { exchange: "binance", synced: true, bids: [{ price: 100, quantity: 1 }], asks: [] },
  ];

  const bids = mergeExchangeBooks(books, { precision: 1, side: "bid", limit: 10 });
  assert.equal(bids.length, 1);
  assert.equal(bids[0].exchanges[0], "binance");
}

function testExecutedTradeClassificationAndWindows() {
  assert.equal(classifyBinanceTrade(true), "sell");
  assert.equal(classifyBinanceTrade(false), "buy");

  const tracker = new ExecutedFlowTracker();
  const now = Date.now();
  tracker.addTrade({
    ts: now - 30_000,
    price: 100,
    quantity: 10,
    side: "buy",
    exchange: "okx",
    symbol: "BTCUSDT",
  });
  tracker.addTrade({
    ts: now - 20_000,
    price: 100,
    quantity: 5,
    side: "sell",
    exchange: "binance",
    symbol: "BTCUSDT",
  });

  const flow = tracker.computeFlow("1m");
  assert.equal(flow.buyNotional, 1000);
  assert.equal(flow.sellNotional, 500);
  assert.equal(flow.netNotional, 500);
}

function testLargeTradeThreshold() {
  const tracker = new ExecutedFlowTracker();
  tracker.addTrade({
    ts: Date.now(),
    price: 1000,
    quantity: 200,
    side: "buy",
    exchange: "bybit",
    symbol: "BTCUSDT",
  });

  const large = tracker.getLargeTrades(100_000, "1h", 10);
  assert.equal(large.trades.length, 1);
  assert.ok(large.trades[0].notional >= 100_000);
  assert.equal(large.tradesAboveThreshold, 1);
}

function testLargeTradeWindowsAndThresholds() {
  const tracker = new ExecutedFlowTracker();
  const now = Date.now();

  tracker.addTrade({
    ts: now - 2 * 60_000,
    price: 100,
    quantity: 600,
    side: "buy",
    exchange: "okx",
    symbol: "BTCUSDT",
  });
  tracker.addTrade({
    ts: now - 20 * 60_000,
    price: 100,
    quantity: 400,
    side: "sell",
    exchange: "binance",
    symbol: "BTCUSDT",
  });
  tracker.addTrade({
    ts: now - 70 * 60_000,
    price: 100,
    quantity: 1000,
    side: "buy",
    exchange: "bybit",
    symbol: "BTCUSDT",
  });

  const fiveMinute = tracker.getLargeTrades(25_000, "5m", 10);
  assert.equal(fiveMinute.trades.length, 1);
  assert.equal(fiveMinute.trades[0].notional, 60_000);
  assert.equal(fiveMinute.tradesInWindow, 1);

  const fifteenMinute = tracker.getLargeTrades(50_000, "15m", 10);
  assert.equal(fifteenMinute.trades.length, 1);
  assert.equal(fifteenMinute.tradesAboveThreshold, 1);

  const oneHour = tracker.getLargeTrades(25_000, "1h", 10);
  assert.equal(oneHour.trades.length, 2);
  assert.equal(oneHour.trades[0].ts, now - 2 * 60_000);
  assert.equal(oneHour.trades[1].ts, now - 20 * 60_000);

  const empty = tracker.getLargeTrades(100_000, "15m", 10);
  assert.equal(empty.trades.length, 0);
  assert.equal(empty.tradesAboveThreshold, 0);
}

function testExecutedDominanceFlow() {
  const tracker = new ExecutedFlowTracker();
  const now = Date.now();

  tracker.addTrade({
    ts: now - 1000,
    price: 100,
    quantity: 10,
    side: "buy",
    exchange: "okx",
    symbol: "BTCUSDT",
  });
  tracker.addTrade({
    ts: now - 500,
    price: 100,
    quantity: 2,
    side: "sell",
    exchange: "binance",
    symbol: "BTCUSDT",
  });

  const buyers = tracker.computeFlow("5m");
  assert.equal(buyers.dominantSide, "buyers");
  assert.equal(buyers.dominantSideLabel, "المشترون");
  assert.equal(buyers.dominanceClassification, "غلبة شديدة");
  assert.ok(buyers.dominanceStrength >= 65);

  const sellers = new ExecutedFlowTracker();
  sellers.addTrade({
    ts: now,
    price: 100,
    quantity: 1,
    side: "buy",
    exchange: "okx",
    symbol: "BTCUSDT",
  });
  sellers.addTrade({
    ts: now,
    price: 100,
    quantity: 9,
    side: "sell",
    exchange: "binance",
    symbol: "BTCUSDT",
  });

  const sellFlow = sellers.computeFlow("5m");
  assert.equal(sellFlow.dominantSide, "sellers");
  assert.equal(sellFlow.dominantSideLabel, "البائعون");

  const balanced = new ExecutedFlowTracker();
  balanced.addTrade({
    ts: now,
    price: 100,
    quantity: 5,
    side: "buy",
    exchange: "okx",
    symbol: "BTCUSDT",
  });
  balanced.addTrade({
    ts: now,
    price: 100,
    quantity: 5,
    side: "sell",
    exchange: "binance",
    symbol: "BTCUSDT",
  });

  const balancedFlow = balanced.computeFlow("5m");
  assert.equal(balancedFlow.dominantSide, "balanced");
  assert.equal(balancedFlow.dominanceStrength, 0);
  assert.equal(balancedFlow.dominanceClassification, "متوازن");

  const emptyTracker = new ExecutedFlowTracker();
  const zeroFlow = emptyTracker.computeFlow("5m");
  assert.equal(zeroFlow.dominanceStrength, 0);
  assert.equal(zeroFlow.dominantSide, "balanced");
}

function testDominanceStrengthBoundaries() {
  assert.equal(classifyDominanceStrength(0), "متوازن");
  assert.equal(classifyDominanceStrength(9.9), "متوازن");
  assert.equal(classifyDominanceStrength(10), "غلبة ضعيفة");
  assert.equal(classifyDominanceStrength(24.9), "غلبة ضعيفة");
  assert.equal(classifyDominanceStrength(25), "غلبة متوسطة");
  assert.equal(classifyDominanceStrength(44.9), "غلبة متوسطة");
  assert.equal(classifyDominanceStrength(45), "غلبة قوية");
  assert.equal(classifyDominanceStrength(64.9), "غلبة قوية");
  assert.equal(classifyDominanceStrength(65), "غلبة شديدة");
  assert.equal(dominantSideLabelAr("buyers"), "المشترون");
  assert.equal(dominantSideLabelAr("sellers"), "البائعون");
  assert.equal(dominantSideLabelAr("balanced"), "متوازن");
}

function testLiquidityDepthChartMultiLevel() {
  const chartSource = readFileSync(
    fileURLToPath(new URL("../app/components/order-book/LiquidityDepthChart.js", import.meta.url)),
    "utf8",
  );
  const pageSource = readFileSync(
    fileURLToPath(new URL("../app/components/order-book/OrderBookPageContent.js", import.meta.url)),
    "utf8",
  );

  assert.match(chartSource, /points\.filter\(\(point\) => point\.side === "bid"\)/);
  assert.match(chartSource, /points\.filter\(\(point\) => point\.side === "ask"\)/);
  assert.match(chartSource, /sqrtScale/);
  assert.match(chartSource, /buildPriceTicks/);
  assert.match(chartSource, /buildValueTicks/);
  assert.match(chartSource, /#10b981/);
  assert.match(chartSource, /#f43f5e/);
  assert.match(chartSource, /buildTooltipLines/);
  assert.match(chartSource, /mode === "historical"/);
  assert.match(chartSource, /if \(error\)/);
  assert.match(pageSource, /data\?\.depthMap/);
  assert.match(pageSource, /aggregatedDepthPoints/);
  assert.match(pageSource, /flex min-h-0 min-w-0 flex-col gap-3 lg:col-span-4/);
  assert.match(pageSource, /Row 2 — live \/ summary liquidity walls/);
  assert.match(pageSource, /SymbolSearchCombobox/);
  assert.match(pageSource, /LARGE_TRADES_MAX_VISIBLE_ROWS/);
  assert.doesNotMatch(chartSource, /as="span"/);
}

function testOrderBookUiSourceGuards() {
  const pageSource = readFileSync(
    fileURLToPath(new URL("../app/components/order-book/OrderBookPageContent.js", import.meta.url)),
    "utf8"
  );
  const panelSource = readFileSync(
    fileURLToPath(new URL("../app/components/order-book/OrderBookPanel.js", import.meta.url)),
    "utf8"
  );
  const formatterSource = readFileSync(
    fileURLToPath(new URL("../app/components/order-book/formatters.js", import.meta.url)),
    "utf8"
  );

  assert.equal(pageSource.includes('title="حالة الاتصال"'), false);
  assert.equal(pageSource.includes('title="آخر تحديث"'), false);
  assert.equal(pageSource.includes("data?.liquidity?.bidNotional"), false);
  assert.match(pageSource, /dominanceFlow\?\.buyNotional/);
  assert.match(formatterSource, /en-US/);
  assert.match(formatterSource, /numberingSystem: "latn"/);
  assert.match(panelSource, /bg-emerald-500/);
  assert.match(panelSource, /bg-rose-500/);
  assert.equal(/teal|blue/i.test(panelSource), false);
  assert.match(pageSource, /formatLargeTradeEmptyMessage/);
  assert.match(pageSource, /StatTile/);
  assert.match(pageSource, /مصادر البيانات/);
  assert.doesNotMatch(pageSource, /SummaryCard/);
  assert.doesNotMatch(pageSource, /lg:row-span-/);
  assert.doesNotMatch(pageSource, /lg:col-start-/);
  assert.match(pageSource, /max-h-\[26rem\]/);
  assert.match(pageSource, /fillContainer/);
  assert.match(pageSource, /lg:items-stretch/);
  assert.doesNotMatch(pageSource, /ORDER_BOOK_ROW_HEIGHT_LG/);
  assert.match(pageSource, /grid grid-cols-1 gap-3 md:grid-cols-2/);
  assert.match(panelSource, /ORDER_BOOK_VISIBLE_ROWS = 12/);
  assert.match(panelSource, /ORDER_BOOK_ROW_HEIGHT_LG = "lg:h-\[36rem\]"/);
  assert.match(panelSource, /h-full min-h-0/);
  assert.match(panelSource, /overflow-y-auto overscroll-contain/);
}

function testIndependentFlowDominanceWindows() {
  const tracker = new ExecutedFlowTracker();
  const now = Date.now();

  tracker.addTrade({
    ts: now - 30_000,
    price: 100,
    quantity: 10,
    side: "buy",
    exchange: "okx",
    symbol: "BTCUSDT",
  });
  tracker.addTrade({
    ts: now - 45 * 60_000,
    price: 100,
    quantity: 50,
    side: "sell",
    exchange: "binance",
    symbol: "BTCUSDT",
  });

  const oneMinute = tracker.computeFlow("1m");
  const oneHour = tracker.computeFlow("1h");

  assert.equal(oneMinute.buyNotional, 1000);
  assert.equal(oneMinute.sellNotional, 0);
  assert.equal(oneHour.buyNotional, 1000);
  assert.equal(oneHour.sellNotional, 5000);
  assert.notEqual(oneMinute.dominanceStrength, oneHour.dominanceStrength);
  assert.equal(oneMinute.window, "1m");
  assert.equal(oneHour.window, "1h");
}

function testLargeTradeStatsBeforeLimit() {
  const tracker = new ExecutedFlowTracker();
  const now = Date.now();

  for (let i = 0; i < 5; i += 1) {
    tracker.addTrade({
      ts: now - i * 1000,
      price: 100,
      quantity: 300,
      side: "buy",
      exchange: "okx",
      symbol: "BTCUSDT",
    });
  }

  const result = tracker.getLargeTrades(25_000, "15m", 2);
  assert.equal(result.trades.length, 2);
  assert.equal(result.tradesAboveThreshold, 5);
  assert.equal(result.tradesInWindow, 5);
  assert.ok(result.trades[0].ts >= result.trades[1].ts);
}

function testDominanceLabelAndZeroVolume() {
  const tracker = new ExecutedFlowTracker();
  const flow = tracker.computeFlow("5m");

  assert.equal(flow.totalNotional, 0);
  assert.equal(flow.dominantSide, "balanced");
  assert.equal(flow.dominanceStrength, 0);
  assert.equal(flow.dominanceLabel, "متوازن");
}

function testHubPayloadScopeGuard() {
  const hubSource = readFileSync(
    fileURLToPath(new URL("../lib/market-data/market-depth-hub.js", import.meta.url)),
    "utf8"
  );

  assert.match(hubSource, /computeFlow\(flowWindow\)/);
  assert.match(hubSource, /computeFlow\(dominanceWindow/);
  assert.match(hubSource, /getLargeTrades\(\s*largeTradeThreshold,\s*largeTradeWindow/);
  assert.match(hubSource, /dominanceFlow/);
  assert.match(hubSource, /largeTradeStats/);
  assert.match(hubSource, /computeLiquidityDominance/);
  assert.doesNotMatch(hubSource, /this\.largeTrades/);
  assert.doesNotMatch(hubSource, /recentTrades:\s*flowTracker\.trades/);
}

function testArabicLargeTradeEmptyState() {
  const message = formatLargeTradeEmptyMessage(50_000, "15m");
  assert.match(message, /15 دقيقة/);
  assert.match(message, /\$50\.0K/);
}

function testApiValidationExtended() {
  const valid = validateMarketDepthQuery(
    new URLSearchParams(
      "symbol=BTCUSDT&mode=aggregated&levels=20&precision=1&largeTradeThreshold=25000&largeTradeWindow=15m&dominanceWindow=1h"
    )
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.params.largeTradeThreshold, 25_000);
  assert.equal(valid.params.largeTradeWindow, "15m");
  assert.equal(valid.params.dominanceWindow, "1h");
}

function testApiValidation() {
  const valid = validateMarketDepthQuery(
    new URLSearchParams("symbol=BTCUSDT&mode=aggregated&levels=20&precision=1")
  );
  assert.equal(valid.valid, true);

  const invalid = validateMarketDepthQuery(new URLSearchParams("symbol=FAKECOIN"));
  assert.equal(invalid.valid, false);
  assert.equal(invalid.error, "INVALID_SYMBOL");
}

function testNoMockInProductionGuard() {
  const originalEnv = process.env.NODE_ENV;
  const originalMock = process.env.MARKET_DEPTH_USE_MOCK;

  process.env.NODE_ENV = "production";
  process.env.MARKET_DEPTH_USE_MOCK = "1";
  assert.throws(() => assertNoMockInProduction());

  process.env.NODE_ENV = originalEnv;
  process.env.MARKET_DEPTH_USE_MOCK = originalMock;
}

function testStaleDataExclusionInSpread() {
  const spread = computeSpread(null, { price: 101, quantity: 1 });
  assert.equal(spread.midPrice, null);
}

function testWallDetection() {
  const walls = detectLiquidityWalls({
    bids: [
      { price: 99.5, quantity: 1, notional: 100 },
      { price: 99, quantity: 2, notional: 200 },
      { price: 98, quantity: 500, notional: 50_000 },
    ],
    asks: [{ price: 101, quantity: 2, notional: 202 }],
    midPrice: 100,
    minNotional: 1000,
  });

  assert.ok(walls.largestBid);
  assert.equal(walls.largestBid.price, 98);
  assert.ok(walls.largestAsk);
  assert.equal(walls.largestAsk.price, 101);
}

function testProductionFilesAvoidMockKeywords() {
  const hubSource = readFileSync(
    fileURLToPath(new URL("../lib/market-data/market-depth-hub.js", import.meta.url)),
    "utf8"
  );
  assert.equal(/mock/i.test(hubSource), false);
  assert.equal(/Math\.random/.test(hubSource), false);
}

function healthyPayload(count) {
  const exchanges = ["okx", "binance", "bybit"].slice(0, count);
  return {
    success: true,
    stale: false,
    exchangeStatuses: exchanges.map((exchange) => ({
      exchange,
      synced: true,
      stale: false,
    })),
  };
}

function testConnectionStatusOpenToConnected() {
  const result = resolveMarketDepthConnectionStatus({
    ssePhase: "open",
    payload: healthyPayload(3),
    browserOnline: true,
  });
  assert.equal(result.status, "connected");
  assert.equal(result.label, "متصل لحظيًا");
  assert.equal(result.healthyCount, 3);
}

function testConnectionStatusDegraded() {
  const result = resolveMarketDepthConnectionStatus({
    ssePhase: "open",
    payload: healthyPayload(2),
    browserOnline: true,
  });
  assert.equal(result.status, "degraded");
  assert.equal(result.healthyCount, 2);
}

function testConnectionStatusReconnectingWithoutFreshPayload() {
  const result = resolveMarketDepthConnectionStatus({
    ssePhase: "reconnecting",
    payload: null,
    browserOnline: true,
  });
  assert.equal(result.status, "reconnecting");
}

function testConnectionStatusMessageAfterErrorRestoresConnected() {
  const result = resolveMarketDepthConnectionStatus({
    ssePhase: "reconnecting",
    payload: healthyPayload(3),
    browserOnline: true,
  });
  assert.equal(result.status, "connected");
}

function testConnectionStatusStaleDoesNotShowConnected() {
  const payload = healthyPayload(3);
  payload.stale = true;
  const result = resolveMarketDepthConnectionStatus({
    ssePhase: "open",
    payload,
    browserOnline: true,
  });
  assert.notEqual(result.status, "connected");
}

function testConnectionStatusOffline() {
  const result = resolveMarketDepthConnectionStatus({
    ssePhase: "open",
    payload: healthyPayload(3),
    browserOnline: false,
  });
  assert.equal(result.status, "disconnected");
}

function testConnectionStatusZeroHealthyExchanges() {
  assert.equal(countHealthyExchanges([]), 0);
  const result = resolveMarketDepthConnectionStatus({
    ssePhase: "open",
    payload: { success: true, stale: false, exchangeStatuses: [] },
    browserOnline: true,
  });
  assert.equal(result.status, "reconnecting");
}

function testHookUsesStableEmptyOverrides() {
  const hookSource = readFileSync(
    fileURLToPath(new URL("../app/hooks/useMarketDepthStream.js", import.meta.url)),
    "utf8"
  );
  assert.match(hookSource, /EMPTY_OVERRIDES = Object\.freeze\(\{\}\)/);
  assert.match(hookSource, /overrides = EMPTY_OVERRIDES/);
  assert.doesNotMatch(hookSource, /\[overrides\]/);
}

function testBinanceEndpointFallbackUrls() {
  assert.equal(BINANCE_WS_ENDPOINTS.length, 3);
  assert.equal(BINANCE_REST_BASES.length, 6);
  assert.equal(buildBinanceStreamNames("BTCUSDT"), "btcusdt@depth@100ms/btcusdt@trade");
  assert.match(
    buildBinanceWsUrl(BINANCE_WS_ENDPOINTS[0], "BTCUSDT"),
    /^wss:\/\/stream\.binance\.com:9443\/stream\?streams=btcusdt@depth@100ms\/btcusdt@trade$/
  );
  assert.match(
    buildBinanceWsUrl(BINANCE_WS_ENDPOINTS[2], "ETHUSDT"),
    /^wss:\/\/data-stream\.binance\.vision:443\/stream\?streams=ethusdt@depth@100ms\/ethusdt@trade$/
  );
  assert.equal(
    buildBinanceRestDepthUrl("https://data-api.binance.vision", "BTCUSDT"),
    "https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=1000"
  );
}

function testBinanceEndpointRotation() {
  const firstFail = resolveBinanceEndpointRotation({
    pinnedIndex: null,
    activeIndex: 0,
    endpointFailures: 1,
    rotate: false,
  });
  assert.equal(firstFail.nextIndex, 0);
  assert.equal(firstFail.pinnedIndex, null);

  const rotated = resolveBinanceEndpointRotation({
    pinnedIndex: 0,
    activeIndex: 0,
    endpointFailures: 2,
    rotate: true,
  });
  assert.equal(rotated.nextIndex, 1);
  assert.equal(rotated.pinnedIndex, null);
  assert.equal(rotated.endpointFailures, 0);

  const pinned = resolveBinanceEndpointRotation({
    pinnedIndex: 2,
    activeIndex: 2,
    endpointFailures: 0,
    rotate: false,
  });
  assert.equal(pinned.nextIndex, 2);
  assert.equal(pinned.pinnedIndex, 2);
}

function testBinanceReconnectDelayHasJitter() {
  const delays = new Set();
  for (let i = 0; i < 20; i += 1) {
    delays.add(computeBinanceReconnectDelay(0));
  }
  assert.ok(delays.size > 1);
  for (const delay of delays) {
    assert.ok(delay >= WS_BACKOFF_MS[0]);
    assert.ok(delay <= WS_BACKOFF_MS[0] * 1.25);
  }
}

function testBinanceLiveConnectedGate() {
  assert.equal(
    isBinanceLiveConnected({
      wsOpen: true,
      snapshotReceived: true,
      firstDeltaApplied: true,
    }),
    true
  );
  assert.equal(
    isBinanceLiveConnected({
      wsOpen: true,
      snapshotReceived: true,
      firstDeltaApplied: false,
    }),
    false
  );
  assert.equal(
    isBinanceLiveConnected({
      wsOpen: false,
      snapshotReceived: true,
      firstDeltaApplied: true,
    }),
    false
  );
}

function testBinanceAdapterUsesFallbackAndIpv4() {
  const source = readFileSync(
    fileURLToPath(new URL("../lib/market-data/exchanges/binance.js", import.meta.url)),
    "utf8"
  );
  assert.match(source, /BINANCE_WS_ENDPOINTS/);
  assert.match(source, /data-stream\.binance\.vision/);
  assert.match(source, /data-api\.binance\.vision/);
  assert.match(source, /lookupIpv4/);
  assert.match(source, /first_delta/);
  assert.match(source, /endpoint_rotate/);
}

function testHubHistoryIntegrationGuards() {
  const source = readFileSync(
    fileURLToPath(new URL("../lib/market-data/market-depth-hub.js", import.meta.url)),
    "utf8"
  );
  assert.match(source, /getHistoricalMarketRecorder/);
  assert.match(source, /startHistoricalMarketRecorder/);
  assert.match(source, /historyRecorder\.recordTrade\(trade\)/);
  assert.doesNotMatch(source, /await\s+this\.historyRecorder\.recordTrade/);
  const buildPayload = source.slice(source.indexOf("buildPayload(params)"));
  assert.doesNotMatch(buildPayload, /historyWriter|historyRecorder|getHistoryWriterStatus/);
}

const tests = [
  testSymbolNormalization,
  testSnapshotAndDelta,
  testRemoveZeroQuantityLevel,
  testSequenceGapRequiresResyncFlag,
  testAggregationAcrossExchanges,
  testPriceBucketingAndNotional,
  testDominanceCalculation,
  testEmptyBookAndSingleExchangeDown,
  testExecutedTradeClassificationAndWindows,
  testLargeTradeThreshold,
  testLargeTradeWindowsAndThresholds,
  testExecutedDominanceFlow,
  testDominanceStrengthBoundaries,
  testLiquidityDepthChartMultiLevel,
  testOrderBookUiSourceGuards,
  testIndependentFlowDominanceWindows,
  testLargeTradeStatsBeforeLimit,
  testDominanceLabelAndZeroVolume,
  testHubPayloadScopeGuard,
  testArabicLargeTradeEmptyState,
  testApiValidation,
  testApiValidationExtended,
  testNoMockInProductionGuard,
  testStaleDataExclusionInSpread,
  testWallDetection,
  testProductionFilesAvoidMockKeywords,
  testConnectionStatusOpenToConnected,
  testConnectionStatusDegraded,
  testConnectionStatusReconnectingWithoutFreshPayload,
  testConnectionStatusMessageAfterErrorRestoresConnected,
  testConnectionStatusStaleDoesNotShowConnected,
  testConnectionStatusOffline,
  testConnectionStatusZeroHealthyExchanges,
  testHookUsesStableEmptyOverrides,
  testBinanceEndpointFallbackUrls,
  testBinanceEndpointRotation,
  testBinanceReconnectDelayHasJitter,
  testBinanceLiveConnectedGate,
  testBinanceAdapterUsesFallbackAndIpv4,
  testHubHistoryIntegrationGuards,
];

let passed = 0;
for (const test of tests) {
  test();
  passed += 1;
}

console.log(`market-depth tests passed: ${passed}/${tests.length}`);
