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
  ExecutedFlowTracker,
} from "../lib/market-data/executed-flow.js";
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

  const large = tracker.getLargeTrades(100_000, 10);
  assert.equal(large.length, 1);
  assert.ok(large[0].notional >= 100_000);
}

function testApiValidation() {
  const valid = validateMarketDepthQuery(
    new URLSearchParams("symbol=BTCUSDT&mode=aggregated&levels=20&precision=1")
  );
  assert.equal(valid.valid, true);

  const invalid = validateMarketDepthQuery(new URLSearchParams("symbol=FAKECOIN"));
  assert.equal(invalid.valid, true);
  assert.equal(invalid.params.symbol, "BTCUSDT");
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
  testApiValidation,
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
];

let passed = 0;
for (const test of tests) {
  test();
  passed += 1;
}

console.log(`market-depth tests passed: ${passed}/${tests.length}`);
