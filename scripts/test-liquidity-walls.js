import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateHistoryLiquidityWallsQuery } from "../lib/market-data/history/history-api-validation.js";
import {
  HistoricalLiquidityWallRecorder,
  resetHistoricalLiquidityWallRecorderForTests,
} from "../lib/market-data/history/liquidity-walls/liquidity-wall-recorder.js";
import { LiquidityWallMetrics } from "../lib/market-data/history/liquidity-walls/liquidity-wall-metrics.js";
import {
  clearLiquidityWallQueryCacheForTests,
  queryHistoricalLiquidityWalls,
} from "../lib/market-data/history/liquidity-walls/liquidity-wall-query.js";
import { computePersistenceScore } from "../lib/market-data/history/liquidity-walls/persistence-score.js";
import { LiquidityWallTracker } from "../lib/market-data/history/liquidity-walls/wall-tracker.js";
import {
  buildLiquidityWallKey,
  detectSignificantLiquidityWalls,
  HISTORY_LIQUIDITY_WALL_WINDOWS,
  SYMBOL_WALL_MIN_NOTIONAL,
  WALL_SAMPLE_INTERVAL_MS,
} from "../lib/market-data/history/liquidity-walls/wall-detector.js";
import { HISTORICAL_LIQUIDITY_WALL_WINDOWS } from "../lib/market-data/constants.js";
import { isHistoricalLiquidityWallWindow } from "../app/hooks/useOrderBookLiquidityWalls.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;
const asyncTests = [];

function test(name, fn) {
  if (fn.constructor.name === "AsyncFunction") {
    asyncTests.push({ name, fn });
    return;
  }
  fn();
  passed += 1;
}

function makeLevels({ midPrice, side, bigNotional, noiseNotional = 1000, count = 8 }) {
  const levels = [];
  for (let i = 0; i < count; i += 1) {
    const offset = (i + 1) * 0.001;
    const price = side === "bid" ? midPrice * (1 - offset) : midPrice * (1 + offset);
    const notional = i === 0 ? bigNotional : noiseNotional;
    levels.push({
      price,
      quantity: notional / price,
      notional,
    });
  }
  return levels;
}

test("wall windows match constants", () => {
  assert.deepEqual(HISTORICAL_LIQUIDITY_WALL_WINDOWS, HISTORY_LIQUIDITY_WALL_WINDOWS);
  for (const window of HISTORICAL_LIQUIDITY_WALL_WINDOWS) {
    assert.equal(isHistoricalLiquidityWallWindow(window), true);
  }
});

test("wall detection filters noise and respects symbol thresholds", () => {
  const midPrice = 100_000;
  const btcWalls = detectSignificantLiquidityWalls({
    symbol: "BTCUSDT",
    midPrice,
    bids: makeLevels({ midPrice, side: "bid", bigNotional: 120_000 }),
    asks: makeLevels({ midPrice, side: "ask", bigNotional: 90_000, noiseNotional: 500 }),
  });
  assert.ok(btcWalls.length >= 1);
  assert.ok(btcWalls.every((wall) => wall.notional >= SYMBOL_WALL_MIN_NOTIONAL.BTCUSDT * 0.75));

  const xrpWalls = detectSignificantLiquidityWalls({
    symbol: "XRPUSDT",
    midPrice: 1,
    bids: makeLevels({ midPrice: 1, side: "bid", bigNotional: 2_000, noiseNotional: 100 }),
    asks: [],
  });
  assert.equal(xrpWalls.length, 0);

  const xrpStrong = detectSignificantLiquidityWalls({
    symbol: "XRPUSDT",
    midPrice: 1,
    bids: makeLevels({ midPrice: 1, side: "bid", bigNotional: 20_000, noiseNotional: 500 }),
    asks: [],
  });
  assert.ok(xrpStrong.length >= 1);
});

test("wall key is stable for nearby prices", () => {
  const keyA = buildLiquidityWallKey("BTCUSDT", "binance", "bid", 100_123.2);
  const keyB = buildLiquidityWallKey("BTCUSDT", "binance", "bid", 100_123.4);
  assert.equal(keyA, keyB);
});

test("tracker merges continuous snapshots", () => {
  const tracker = new LiquidityWallTracker({ now: () => 1_000_000 });
  const wall = {
    side: "bid",
    price: 100,
    size: 10,
    notional: 100_000,
    distanceFromMid: 0.5,
  };

  const first = tracker.ingestSnapshot({
    symbol: "BTCUSDT",
    exchange: "binance",
    walls: [wall],
    snapshotTime: 1_000_000,
  });
  const second = tracker.ingestSnapshot({
    symbol: "BTCUSDT",
    exchange: "binance",
    walls: [{ ...wall, size: 12, notional: 120_000 }],
    snapshotTime: 1_060_000,
  });

  assert.equal(first.length, 1);
  assert.equal(second.length, 1);
  const state = tracker.tracked.values().next().value;
  assert.equal(state.appearanceCount, 2);
  assert.equal(state.maxSize, 12);
  assert.equal(state.survivedSnapshots, 2);
});

test("tracker treats reappear within grace as continuation", () => {
  const now = 2_000_000;
  let clock = now;
  const tracker = new LiquidityWallTracker({
    now: () => clock,
    reappearGraceMs: 5 * 60_000,
  });
  const wall = {
    side: "ask",
    price: 200,
    size: 5,
    notional: 80_000,
    distanceFromMid: 0.4,
  };

  tracker.ingestSnapshot({
    symbol: "ETHUSDT",
    exchange: "okx",
    walls: [wall],
    snapshotTime: now,
  });
  tracker.ingestSnapshot({
    symbol: "ETHUSDT",
    exchange: "okx",
    walls: [],
    snapshotTime: now + 60_000,
  });
  clock = now + 120_000;
  const updates = tracker.ingestSnapshot({
    symbol: "ETHUSDT",
    exchange: "okx",
    walls: [wall],
    snapshotTime: clock,
  });

  const active = updates.find((row) => row.isActive);
  assert.ok(active);
  assert.equal(active.reappearCount, 1);
  assert.equal(active.appearanceCount, 2);
});

test("persistence score stays within 0..100", () => {
  const low = computePersistenceScore({
    lifetimeSeconds: 0,
    appearanceCount: 1,
    averageSize: 1,
    maxSize: 10,
    survivedSnapshots: 1,
    reappearCount: 0,
  });
  const high = computePersistenceScore({
    lifetimeSeconds: 7200,
    appearanceCount: 20,
    averageSize: 9,
    maxSize: 10,
    survivedSnapshots: 20,
    reappearCount: 3,
  });
  assert.ok(low >= 0 && low <= 100);
  assert.ok(high >= low);
  assert.ok(high <= 100);
});

test("liquidity walls validation accepts supported params", () => {
  for (const window of HISTORY_LIQUIDITY_WALL_WINDOWS) {
    const result = validateHistoryLiquidityWallsQuery(
      new URLSearchParams({ symbol: "BTCUSDT", window, side: "bid", limit: "10" }),
    );
    assert.equal(result.valid, true, window);
  }
});

test("liquidity walls validation rejects invalid side", () => {
  const result = validateHistoryLiquidityWallsQuery(
    new URLSearchParams({ symbol: "BTCUSDT", window: "4h", side: "buy" }),
  );
  assert.equal(result.valid, false);
});

test("query API shapes top lists and analytics", async () => {
  clearLiquidityWallQueryCacheForTests();
  const now = Date.parse("2026-07-29T00:00:00.000Z");
  const rows = [
    {
      wall_key: "BTCUSDT:binance:bid:100",
      symbol: "BTCUSDT",
      exchange: "binance",
      side: "bid",
      price: 100,
      size: 10,
      notional: 1000,
      distance_from_mid: 0.5,
      snapshot_time: "2026-07-28T20:00:00.000Z",
      first_seen: "2026-07-28T18:00:00.000Z",
      last_seen: "2026-07-28T22:00:00.000Z",
      lifetime_seconds: 14400,
      appearance_count: 8,
      persistence_score: 72,
      max_size: 12,
      average_size: 10,
      reappear_count: 1,
      strongest_notional: 1200,
      survived_snapshots: 8,
      is_active: true,
    },
    {
      wall_key: "BTCUSDT:binance:ask:101",
      symbol: "BTCUSDT",
      exchange: "binance",
      side: "ask",
      price: 101,
      size: 8,
      notional: 900,
      distance_from_mid: 0.4,
      snapshot_time: "2026-07-28T21:00:00.000Z",
      first_seen: "2026-07-28T19:00:00.000Z",
      last_seen: "2026-07-28T21:30:00.000Z",
      lifetime_seconds: 9000,
      appearance_count: 5,
      persistence_score: 55,
      max_size: 8,
      average_size: 7,
      reappear_count: 2,
      strongest_notional: 1500,
      survived_snapshots: 5,
      is_active: false,
    },
  ];

  const payload = await queryHistoricalLiquidityWalls({
    client: {
      restGet: async () => rows,
    },
    symbol: "BTCUSDT",
    window: "4h",
    limit: 5,
    now,
  });

  assert.equal(payload.success, true);
  assert.equal(payload.topPersistent[0].persistenceScore, 72);
  assert.equal(payload.topAppeared[0].appearanceCount, 8);
  assert.equal(payload.recentlyDisappeared.length, 1);
  assert.equal(payload.analytics.strongestWall.wallKey, "BTCUSDT:binance:bid:100");
  assert.equal(payload.analytics.largestNotionalWall.strongestNotional, 1500);
});

test("recorder keeps one pending row per wall key", () => {
  resetHistoricalLiquidityWallRecorderForTests();
  const metrics = new LiquidityWallMetrics();
  const tracker = new LiquidityWallTracker();
  let now = 1_000_000;
  const recorder = new HistoricalLiquidityWallRecorder({
    config: { enabled: true, flushIntervalMs: 60_000, retryMax: 0, retryBaseMs: 1, requestTimeoutMs: 1000 },
    metrics,
    tracker,
    now: () => now,
    writer: {
      start() {},
      stop() {},
    },
  });

  const snapshot = {
    symbol: "BTCUSDT",
    exchange: "binance",
    bids: makeLevels({ midPrice: 100_000, side: "bid", bigNotional: 120_000 }),
    asks: makeLevels({ midPrice: 100_000, side: "ask", bigNotional: 120_000 }),
    lastPrice: 100_000,
  };

  recorder.recordExchangeSnapshot(snapshot);
  now += WALL_SAMPLE_INTERVAL_MS;
  recorder.recordExchangeSnapshot(snapshot);
  assert.equal(recorder.pendingRows.size, tracker.getTrackedCount() + tracker.graceDisappeared.size);
  resetHistoricalLiquidityWallRecorderForTests();
});

test("recorder throttles sampling per exchange", () => {
  resetHistoricalLiquidityWallRecorderForTests();
  const metrics = new LiquidityWallMetrics();
  const tracker = new LiquidityWallTracker();
  let now = 1_000_000;
  const recorder = new HistoricalLiquidityWallRecorder({
    config: { enabled: true, flushIntervalMs: 60_000, retryMax: 0, retryBaseMs: 1, requestTimeoutMs: 1000 },
    metrics,
    tracker,
    now: () => now,
    writer: {
      start() {},
      stop() {},
    },
  });

  const snapshot = {
    symbol: "BTCUSDT",
    exchange: "binance",
    bids: makeLevels({ midPrice: 100_000, side: "bid", bigNotional: 120_000 }),
    asks: makeLevels({ midPrice: 100_000, side: "ask", bigNotional: 120_000 }),
    lastPrice: 100_000,
  };

  recorder.recordExchangeSnapshot(snapshot);
  const firstSamples = metrics.samplesReceived;
  now += 10_000;
  recorder.recordExchangeSnapshot(snapshot);
  assert.equal(metrics.samplesReceived, firstSamples);

  now += WALL_SAMPLE_INTERVAL_MS;
  recorder.recordExchangeSnapshot(snapshot);
  assert.equal(metrics.samplesReceived, firstSamples + 1);
  resetHistoricalLiquidityWallRecorderForTests();
});

test("hub integration is isolated from SSE path", () => {
  const source = readFileSync(join(ROOT, "lib/market-data/market-depth-hub.js"), "utf8");
  assert.match(source, /liquidityWallRecorder\.recordExchangeSnapshot/);
  assert.match(source, /startHistoricalLiquidityWallRecorder/);
  assert.match(source, /liquidity wall recorder failures must not affect live order book/);
  assert.doesNotMatch(source, /await this\.liquidityWallRecorder/);
});

test("API route exists and uses validation", () => {
  const source = readFileSync(
    join(ROOT, "app/api/market-depth/history/liquidity-walls/route.js"),
    "utf8",
  );
  assert.match(source, /validateHistoryLiquidityWallsQuery/);
  assert.match(source, /queryHistoricalLiquidityWalls/);
  assert.match(source, /getLiquidityWallWriterStatus/);
});

test("migration defines market_liquidity_walls table", () => {
  const source = readFileSync(
    join(ROOT, "supabase/migrations/20260729_market_liquidity_walls.sql"),
    "utf8",
  );
  assert.match(source, /market_liquidity_walls/);
  assert.match(source, /persistence_score/);
  assert.match(source, /wall_key/);
});

for (const { name, fn } of asyncTests) {
  await fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

console.log(`liquidity walls tests passed: ${passed}/${passed}`);
