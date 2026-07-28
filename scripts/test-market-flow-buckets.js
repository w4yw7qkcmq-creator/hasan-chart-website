import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  FlowBucketAggregator,
  classifyLateTrade,
  validateTradeInput,
} from "../lib/market-data/history/flow-bucket-aggregator.js";
import { TradeDedup, buildTradeKey } from "../lib/market-data/history/trade-dedup.js";
import {
  BUCKET_MS,
  DEDUP_MAX_ENTRIES,
  DEDUP_TTL_MS,
  FLOW_BUCKET_UPSERT_SEMANTICS,
  LARGE_TRADE_BANDS,
  LATE_TRADE_GRACE_MS,
} from "../lib/market-data/history/constants.js";
import {
  calculateCompleteness,
  floorToMinute,
  getExpectedBucketCount,
  getWindowMs,
  getWindowStart,
  HISTORY_WINDOW_OPTIONS,
  isValidHistoryWindow,
} from "../lib/market-data/history/window-utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
}

function baseTrade(overrides = {}) {
  return {
    exchange: "binance",
    symbol: "BTCUSDT",
    tradeId: "t-1",
    ts: 1_700_000_000_000,
    side: "buy",
    price: 50_000,
    quantity: 1,
    notional: 50_000,
    ...overrides,
  };
}

function testValidBuyTrade() {
  const agg = new FlowBucketAggregator({ now: () => 1_700_000_000_000 });
  const result = agg.addTrade(baseTrade(), { now: 1_700_000_000_000 });
  assert.equal(result.ok, true);
  assert.equal(agg.stats.accepted, 1);
}

function testValidSellTrade() {
  const now = 1_700_000_060_000;
  const agg = new FlowBucketAggregator({ now: () => now });
  const result = agg.addTrade(
    baseTrade({
      side: "sell",
      tradeId: "t-sell",
      ts: now,
      notional: 25_000,
      price: 25_000,
      quantity: 1,
    }),
    { now },
  );
  assert.equal(result.ok, true);
  const bucket = agg.getBucket("BTCUSDT", "binance", floorToMinute(now));
  assert.equal(bucket.sellCount, 1);
  assert.equal(bucket.sellNotional, 25_000);
}

function testAggregatedAndPerExchange() {
  const ts = 1_700_000_120_000;
  const agg = new FlowBucketAggregator({ now: () => ts });
  agg.addTrade(baseTrade({ tradeId: "t-dual", ts }), { now: ts });

  const perExchange = agg.getBucket("BTCUSDT", "binance", floorToMinute(ts));
  const aggregated = agg.getBucket("BTCUSDT", "aggregated", floorToMinute(ts));
  assert.ok(perExchange);
  assert.ok(aggregated);
  assert.equal(perExchange.buyCount, 1);
  assert.equal(aggregated.buyCount, 1);
  assert.equal(agg.getBuckets().length, 2);
}

function testDuplicateTradeNotCountedTwice() {
  const ts = 1_700_000_180_000;
  const agg = new FlowBucketAggregator({ now: () => ts });
  const trade = baseTrade({ tradeId: "dup-1", ts });
  assert.equal(agg.addTrade(trade, { now: ts }).ok, true);
  assert.equal(agg.addTrade(trade, { now: ts }).ok, false);
  assert.equal(agg.stats.duplicate, 1);
  const bucket = agg.getBucket("BTCUSDT", "aggregated", floorToMinute(ts));
  assert.equal(bucket.buyCount, 1);
}

function testFallbackKeyWithoutTradeId() {
  const ts = 1_700_000_240_000;
  const trade = baseTrade({ tradeId: null, ts });
  const key = buildTradeKey(trade);
  assert.match(key, /^binance:BTCUSDT:/);

  const agg = new FlowBucketAggregator({ now: () => ts });
  assert.equal(agg.addTrade(trade, { now: ts }).ok, true);
  assert.equal(agg.addTrade(trade, { now: ts }).reason, "duplicate");
}

function testInvalidSide() {
  const agg = new FlowBucketAggregator();
  const result = agg.addTrade(baseTrade({ side: "long" }));
  assert.equal(result.ok, false);
  assert.equal(result.reason, "invalid_side");
}

function testInvalidTimestamp() {
  const agg = new FlowBucketAggregator();
  assert.equal(agg.addTrade(baseTrade({ ts: NaN })).reason, "invalid_timestamp");
  assert.equal(agg.addTrade(baseTrade({ ts: Infinity })).reason, "invalid_timestamp");
}

function testInvalidPrice() {
  const agg = new FlowBucketAggregator();
  assert.equal(agg.addTrade(baseTrade({ price: 0 })).reason, "invalid_price");
  assert.equal(agg.addTrade(baseTrade({ price: -1 })).reason, "invalid_price");
}

function testInvalidQuantity() {
  const agg = new FlowBucketAggregator();
  assert.equal(agg.addTrade(baseTrade({ quantity: 0 })).reason, "invalid_quantity");
}

function testNotionalComputedFromPriceQuantity() {
  const ts = 1_700_000_300_000;
  const agg = new FlowBucketAggregator({ now: () => ts });
  const result = agg.addTrade(
    baseTrade({
      tradeId: "calc-notional",
      ts,
      price: 100,
      quantity: 10,
      notional: undefined,
    }),
    { now: ts },
  );
  assert.equal(result.ok, true);
  const bucket = agg.getBucket("BTCUSDT", "binance", floorToMinute(ts));
  assert.equal(bucket.buyNotional, 1000);
}

function testBucketMinuteFloor() {
  const ts = 1_700_000_123_456;
  assert.equal(floorToMinute(ts), 1_700_000_100_000);
  const agg = new FlowBucketAggregator({ now: () => ts });
  agg.addTrade(baseTrade({ tradeId: "floor", ts }), { now: ts });
  assert.ok(agg.getBucket("BTCUSDT", "aggregated", floorToMinute(ts)));
  assert.equal(agg.getBucket("BTCUSDT", "aggregated", floorToMinute(ts) + BUCKET_MS), null);
}

function testMultipleTradesSameBucket() {
  const ts = 1_700_000_360_000;
  const agg = new FlowBucketAggregator({ now: () => ts });
  agg.addTrade(baseTrade({ tradeId: "m1", ts, notional: 10_000, side: "buy" }), { now: ts });
  agg.addTrade(baseTrade({ tradeId: "m2", ts: ts + 1000, notional: 20_000, side: "sell" }), { now: ts });
  const bucket = agg.getBucket("BTCUSDT", "aggregated", floorToMinute(ts));
  assert.equal(bucket.buyCount, 1);
  assert.equal(bucket.sellCount, 1);
  assert.equal(bucket.buyNotional, 10_000);
  assert.equal(bucket.sellNotional, 20_000);
}

function testTradesDifferentBuckets() {
  const ts1 = 1_700_000_420_000;
  const ts2 = ts1 + BUCKET_MS;
  const agg = new FlowBucketAggregator({ now: () => ts2 });
  agg.addTrade(baseTrade({ tradeId: "b1", ts: ts1 }), { now: ts2 });
  agg.addTrade(baseTrade({ tradeId: "b2", ts: ts2 }), { now: ts2 });
  assert.equal(agg.getBuckets().length, 4);
}

function testMaxTradeNotional() {
  const ts = 1_700_000_480_000;
  const agg = new FlowBucketAggregator({ now: () => ts });
  agg.addTrade(baseTrade({ tradeId: "max1", ts, notional: 30_000 }), { now: ts });
  agg.addTrade(baseTrade({ tradeId: "max2", ts: ts + 1, notional: 600_000 }), { now: ts });
  const bucket = agg.getBucket("BTCUSDT", "aggregated", floorToMinute(ts));
  assert.equal(bucket.maxTradeNotional, 600_000);
}

function testLargeTradeBandBoundaries() {
  const ts = 1_700_000_540_000;
  const agg = new FlowBucketAggregator({ now: () => ts });
  const bands = [
    { id: "b25", notional: 25_000, expected: { large25kCount: 1, large50kCount: 0 } },
    { id: "b50", notional: 50_000, expected: { large25kCount: 1, large50kCount: 1, large100kCount: 0 } },
    { id: "b100", notional: 100_000, expected: { large100kCount: 1, large250kCount: 0 } },
    { id: "b250", notional: 250_000, expected: { large250kCount: 1, large500kCount: 0 } },
    { id: "b500", notional: 500_000, expected: { large500kCount: 1, large1mCount: 0 } },
    { id: "b1m", notional: 1_000_000, expected: { large1mCount: 1 } },
  ];

  for (const band of bands) {
    const localAgg = new FlowBucketAggregator({ now: () => ts });
    localAgg.addTrade(
      baseTrade({ tradeId: band.id, ts, notional: band.notional, price: band.notional, quantity: 1 }),
      { now: ts },
    );
    const bucket = localAgg.getBucket("BTCUSDT", "aggregated", floorToMinute(ts));
    for (const [field, value] of Object.entries(band.expected)) {
      assert.equal(bucket[field], value, `${band.id} ${field}`);
    }
  }
}

function testTradeAboveOneMillion() {
  const ts = 1_700_000_600_000;
  const agg = new FlowBucketAggregator({ now: () => ts });
  agg.addTrade(baseTrade({ tradeId: "big", ts, notional: 1_200_000, price: 1_200_000, quantity: 1 }), {
    now: ts,
  });
  const bucket = agg.getBucket("BTCUSDT", "aggregated", floorToMinute(ts));
  assert.equal(bucket.large25kCount, 1);
  assert.equal(bucket.large50kCount, 1);
  assert.equal(bucket.large100kCount, 1);
  assert.equal(bucket.large250kCount, 1);
  assert.equal(bucket.large500kCount, 1);
  assert.equal(bucket.large1mCount, 1);
}

function testLateAccepted() {
  const now = 1_700_000_660_000;
  const tradeTs = now - 85_000;
  assert.equal(classifyLateTrade(tradeTs, now).lateAccepted, true);

  const agg = new FlowBucketAggregator({ now: () => now });
  const result = agg.addTrade(baseTrade({ tradeId: "late-ok", ts: tradeTs }), { now });
  assert.equal(result.ok, true);
  assert.equal(result.lateAccepted, true);
  assert.equal(agg.stats.lateAccepted, 1);
}

function testLateDropped() {
  const now = 1_700_000_720_000;
  const tradeTs = now - 91_000;
  const agg = new FlowBucketAggregator({ now: () => now });
  const result = agg.addTrade(baseTrade({ tradeId: "late-drop", ts: tradeTs }), { now });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "late_dropped");
  assert.equal(agg.stats.lateDropped, 1);
}

function testDrainReadyBucketsExcludesCurrent() {
  const addNow = 1_700_000_100_000;
  const oldBucket = floorToMinute(addNow);
  const agg = new FlowBucketAggregator({ now: () => addNow });
  agg.addTrade(baseTrade({ tradeId: "old", ts: oldBucket + 1_000 }), { now: addNow });

  const drainNow = oldBucket + BUCKET_MS + LATE_TRADE_GRACE_MS + 1_000;
  const currentBucket = floorToMinute(drainNow);
  agg.addTrade(baseTrade({ tradeId: "current", ts: currentBucket + 1_000 }), { now: drainNow });

  const drained = agg.drainReadyBuckets(drainNow);
  const starts = drained.map((b) => b.bucketStart);
  assert.ok(starts.includes(oldBucket));
  assert.ok(!starts.includes(currentBucket));
  assert.equal(agg.getBucket("BTCUSDT", "aggregated", currentBucket).buyCount, 1);
}

function testDrainReadyBucketsReturnsFinished() {
  const addNow = 1_700_000_200_000;
  const finishedBucket = floorToMinute(addNow);
  const agg = new FlowBucketAggregator({ now: () => addNow });
  agg.addTrade(baseTrade({ tradeId: "finished", ts: finishedBucket + 1_000 }), { now: addNow });

  const drainNow = finishedBucket + BUCKET_MS + LATE_TRADE_GRACE_MS + 1_000;
  const drained = agg.drainReadyBuckets(drainNow);
  assert.equal(drained.length, 2);
  assert.equal(agg.getBucket("BTCUSDT", "aggregated", finishedBucket), null);
}

function testSnapshotDoesNotMutateState() {
  const ts = 1_700_000_900_000;
  const agg = new FlowBucketAggregator({ now: () => ts });
  agg.addTrade(baseTrade({ tradeId: "snap", ts }), { now: ts });
  const before = agg.getBuckets().length;
  const snap = agg.snapshot();
  assert.equal(snap.length, before);
  assert.equal(agg.getBuckets().length, before);
}

function testClear() {
  const ts = 1_700_000_960_000;
  const agg = new FlowBucketAggregator({ now: () => ts });
  agg.addTrade(baseTrade({ tradeId: "clear", ts }), { now: ts });
  agg.clear();
  assert.equal(agg.getBuckets().length, 0);
  assert.equal(agg.dedup.size(), 0);
  assert.equal(agg.stats.accepted, 0);
}

function testDedupTtl() {
  const dedup = new TradeDedup({ ttlMs: 1000, maxEntries: 100 });
  dedup.add("k1", 1000);
  assert.equal(dedup.has("k1"), true);
  dedup.prune(2500);
  assert.equal(dedup.has("k1"), false);
}

function testDedupMaxSize() {
  const dedup = new TradeDedup({ ttlMs: 60_000, maxEntries: 3 });
  dedup.add("a", 1);
  dedup.add("b", 2);
  dedup.add("c", 3);
  dedup.add("d", 4);
  assert.equal(dedup.size(), 3);
  assert.equal(dedup.has("a"), false);
  assert.equal(dedup.has("d"), true);
}

function testNoNaNInfinity() {
  const agg = new FlowBucketAggregator();
  assert.equal(agg.addTrade(baseTrade({ notional: NaN })).reason, "invalid_notional");
  assert.equal(agg.addTrade(baseTrade({ notional: Infinity })).reason, "invalid_notional");

  const validated = validateTradeInput(baseTrade({ price: 100_000, quantity: 100, notional: 10_000_000 }));
  assert.equal(validated.ok, true);
  assert.equal(validated.trade.notional, 10_000_000);
}

function testClassifyLateTradeCurrentAndPrevious() {
  const now = 1_700_001_020_000;
  const current = floorToMinute(now);
  assert.equal(classifyLateTrade(current + 1000, now).lateAccepted, false);
  assert.equal(classifyLateTrade(current - BUCKET_MS + 1000, now).lateAccepted, false);
}

function testAllHistoryWindows() {
  const expectedCounts = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "1h": 60,
    "4h": 240,
    "12h": 720,
    "1d": 1440,
    "3d": 4320,
    "7d": 10080,
  };

  for (const window of HISTORY_WINDOW_OPTIONS) {
    assert.equal(isValidHistoryWindow(window), true);
    assert.equal(getExpectedBucketCount(window), expectedCounts[window]);
    assert.equal(getWindowMs(window), expectedCounts[window] * BUCKET_MS);
  }
}

function testInvalidWindow() {
  assert.equal(isValidHistoryWindow("2h"), false);
  assert.throws(() => getWindowMs("2h"), /Invalid history window/);
}

function testWindowStartAndFloorUtc() {
  const now = 1_700_001_080_000;
  assert.equal(getWindowStart("1h", now), now - 60 * 60_000);
  assert.equal(floorToMinute(1_700_001_081_234), 1_700_001_060_000);
}

function testCompletenessPartialAndFull() {
  const now = 1_700_001_140_000;
  const collectingSince = now - 30 * BUCKET_MS;
  const partial = calculateCompleteness({
    bucketCount: 10,
    window: "1h",
    collectingSince,
    now,
  });
  assert.equal(partial.expectedBuckets, 60);
  assert.equal(partial.availableExpectedBuckets, 30);
  assert.equal(partial.completeness, 10 / 30);
  assert.equal(partial.partialData, true);

  const full = calculateCompleteness({
    bucketCount: 60,
    window: "1h",
    collectingSince: now - 60 * BUCKET_MS,
    now,
  });
  assert.equal(full.completeness, 1);
  assert.equal(full.partialData, false);
}

function testCompletenessClampAndZero() {
  const now = 1_700_001_200_000;
  const over = calculateCompleteness({
    bucketCount: 100,
    window: "1h",
    collectingSince: now - 60 * BUCKET_MS,
    now,
  });
  assert.equal(over.completeness, 1);

  const zero = calculateCompleteness({
    bucketCount: 0,
    window: "5m",
    collectingSince: now,
    now,
  });
  assert.equal(zero.completeness, 0);
  assert.equal(zero.actualBuckets, 0);
}

function testUpsertSemanticsConstant() {
  assert.equal(FLOW_BUCKET_UPSERT_SEMANTICS, "replace");
  assert.deepEqual(LARGE_TRADE_BANDS, [25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]);
}

function testDedupDefaultsDocumented() {
  assert.equal(DEDUP_TTL_MS, 15 * 60 * 1000);
  assert.equal(DEDUP_MAX_ENTRIES, 250_000);
}

function findMigrationSql() {
  const dir = join(ROOT, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.includes("market_flow_history"));
  assert.ok(files.length >= 1, "migration file missing");
  return readFileSync(join(dir, files[0]), "utf8");
}

function testMigrationStaticChecks() {
  const sql = findMigrationSql();

  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.market_flow_buckets/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.market_large_trades/);
  assert.match(sql, /UNIQUE \(symbol, exchange_scope, bucket_start\)/);
  assert.match(sql, /UNIQUE \(trade_key\)|market_large_trades_trade_key_key/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON public\.market_flow_buckets FROM anon, authenticated/);
  assert.match(sql, /REVOKE ALL ON public\.market_large_trades FROM anon, authenticated/);
  assert.match(sql, /GRANT ALL ON public\.market_flow_buckets TO service_role/);
  assert.match(sql, /GRANT ALL ON public\.market_large_trades TO service_role/);
  assert.match(sql, /exchange_scope IN \('aggregated', 'okx', 'binance', 'bybit'\)/);
  assert.match(sql, /bucket_seconds = 60/);
  assert.match(sql, /threshold_band IN \(25000, 50000, 100000, 250000, 500000, 1000000\)/);
  assert.match(sql, /market_flow_buckets_symbol_scope_bucket_start_idx/);
  assert.match(sql, /market_flow_buckets_bucket_start_idx/);
  assert.match(sql, /market_large_trades_symbol_ts_idx/);
  assert.match(sql, /market_large_trades_symbol_notional_idx/);
  assert.match(sql, /market_large_trades_exchange_symbol_ts_idx/);
  assert.match(sql, /Server-managed/);

  assert.doesNotMatch(sql, /CREATE POLICY/);
  assert.doesNotMatch(sql, /market_wall/);
  assert.doesNotMatch(sql, /pg_cron/);
  assert.doesNotMatch(sql, /market_raw_trades/);
}

const tests = [
  ["valid buy trade", testValidBuyTrade],
  ["valid sell trade", testValidSellTrade],
  ["aggregated + per-exchange buckets", testAggregatedAndPerExchange],
  ["duplicate trade not counted twice", testDuplicateTradeNotCountedTwice],
  ["fallback key without tradeId", testFallbackKeyWithoutTradeId],
  ["invalid side", testInvalidSide],
  ["invalid timestamp", testInvalidTimestamp],
  ["invalid price", testInvalidPrice],
  ["invalid quantity", testInvalidQuantity],
  ["notional computed from price×quantity", testNotionalComputedFromPriceQuantity],
  ["bucket minute floor", testBucketMinuteFloor],
  ["multiple trades same bucket", testMultipleTradesSameBucket],
  ["trades different buckets", testTradesDifferentBuckets],
  ["maxTradeNotional", testMaxTradeNotional],
  ["large trade band boundaries", testLargeTradeBandBoundaries],
  ["trade above 1M", testTradeAboveOneMillion],
  ["late accepted", testLateAccepted],
  ["late dropped", testLateDropped],
  ["drainReadyBuckets excludes current bucket", testDrainReadyBucketsExcludesCurrent],
  ["drainReadyBuckets returns finished bucket", testDrainReadyBucketsReturnsFinished],
  ["snapshot does not mutate state", testSnapshotDoesNotMutateState],
  ["clear", testClear],
  ["dedup TTL", testDedupTtl],
  ["dedup max size", testDedupMaxSize],
  ["no NaN/Infinity", testNoNaNInfinity],
  ["classify late current/previous", testClassifyLateTradeCurrentAndPrevious],
  ["all history windows", testAllHistoryWindows],
  ["invalid window", testInvalidWindow],
  ["window start and UTC floor", testWindowStartAndFloorUtc],
  ["completeness partial and full", testCompletenessPartialAndFull],
  ["completeness clamp and zero", testCompletenessClampAndZero],
  ["upsert semantics constant", testUpsertSemanticsConstant],
  ["dedup defaults documented", testDedupDefaultsDocumented],
  ["migration static checks", testMigrationStaticChecks],
];

for (const [name, fn] of tests) {
  test(name, fn);
}

console.log(`market-flow-buckets tests passed: ${passed}/${tests.length}`);
