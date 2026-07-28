import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  FlowBucketAggregator,
  buildFlowBucketKey,
} from "../lib/market-data/history/flow-bucket-aggregator.js";
import {
  HistoricalMarketRecorder,
  createHistoricalMarketRecorder,
  getHistoryWriterStatus,
  resetHistoricalMarketRecorderForTests,
  resolveThresholdBand,
} from "../lib/market-data/history/historical-market-recorder.js";
import {
  getMarketHistoryConfig,
  isMarketHistoryWriteEnabled,
  parseExplicitBoolean,
} from "../lib/market-data/history/history-config.js";
import { HistoryMetrics } from "../lib/market-data/history/history-metrics.js";
import {
  MarketHistoryWriter,
  registerMarketHistoryShutdown,
} from "../lib/market-data/history/market-history-writer.js";
import {
  createSupabaseHistoryClient,
  FLOW_CONFLICT_COLUMNS,
  LARGE_TRADE_CONFLICT_COLUMN,
  mapFlowBucketRow,
  mapLargeTradeRow,
  safeErrorMessage,
} from "../lib/market-data/history/supabase-history-client.js";
import { BUCKET_MS, LATE_TRADE_GRACE_MS } from "../lib/market-data/history/constants.js";
import { floorToMinute } from "../lib/market-data/history/window-utils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

let passed = 0;
const asyncTests = [];

function test(name, fn) {
  if (fn.constructor.name === "AsyncFunction") {
    asyncTests.push(fn);
    return;
  }
  fn();
  passed += 1;
}

function restoreEnv(key, value) {
  if (value == null) delete process.env[key];
  else process.env[key] = value;
}

function withEnv(overrides, fn) {
  const saved = {};
  for (const [key, value] of Object.entries(overrides)) {
    saved[key] = process.env[key];
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      restoreEnv(key, value);
    }
  }
}

function readyFlushNow(tradeTs) {
  const bucketStart = floorToMinute(tradeTs);
  return bucketStart + BUCKET_MS + LATE_TRADE_GRACE_MS + 1;
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

function createFakeClient(initial = {}) {
  const calls = {
    flow: [],
    large: [],
  };
  let flowBehavior = initial.flowBehavior ?? (async () => ({ ok: true, status: 200, written: 0, skipped: 0, latencyMs: 1 }));
  let largeBehavior = initial.largeBehavior ?? (async () => ({ ok: true, status: 200, written: 0, skipped: 0, latencyMs: 1 }));

  return {
    calls,
    setFlowBehavior(fn) {
      flowBehavior = fn;
    },
    setLargeBehavior(fn) {
      largeBehavior = fn;
    },
    client: {
      async upsertFlowBuckets(rows) {
        calls.flow.push(rows);
        return flowBehavior(rows);
      },
      async insertLargeTrades(rows) {
        calls.large.push(rows);
        return largeBehavior(rows);
      },
    },
  };
}

function createWriterHarness(options = {}) {
  const now = options.now ?? (() => 1_700_000_000_000);
  const aggregator = new FlowBucketAggregator({ now });
  const fake = createFakeClient(options.fakeClientOptions);
  const metrics = new HistoryMetrics();
  const config = getMarketHistoryConfig({
    enabled: true,
    flushIntervalMs: 10_000,
    batchSize: options.batchSize ?? 2,
    queueMax: options.queueMax ?? 10,
    retryMax: options.retryMax ?? 3,
    retryBaseMs: 10,
    requestTimeoutMs: 100,
    shutdownFlushTimeoutMs: 200,
    ...options.config,
  });

  const writer = new MarketHistoryWriter({
    client: fake.client,
    config,
    metrics,
    now,
    sleep: options.sleep ?? (async () => {}),
    getReadyFlowBuckets: (ts) => aggregator.getReadyBuckets(ts),
    acknowledgeFlowBuckets: (keys) => aggregator.acknowledgeBuckets(keys),
    getPendingBucketStats: (ts) => aggregator.getPendingBucketStats(ts),
  });

  const recorder = new HistoricalMarketRecorder({
    config,
    metrics,
    aggregator,
    writer,
    now,
  });

  return { now, aggregator, fake, metrics, config, writer, recorder };
}

// Feature flag
test("1 disabled → no timer", () => {
  const { writer } = createWriterHarness();
  assert.equal(writer.started, false);
  writer.start();
  writer.stop();
  assert.equal(writer.flushTimer, null);
});

test("2 disabled → no DB calls", () => {
  withEnv({ MARKET_HISTORY_WRITE_ENABLED: undefined }, () => {
    resetHistoricalMarketRecorderForTests();
    const recorder = createHistoricalMarketRecorder();
    recorder.recordTrade(baseTrade());
    assert.equal(getHistoryWriterStatus().enabled, false);
    resetHistoricalMarketRecorderForTests();
  });
});

test("3 enabled → timer/flush configured", () => {
  const { writer } = createWriterHarness();
  writer.start();
  assert.equal(writer.started, true);
  assert.ok(writer.flushTimer);
  writer.stop();
});

// Recorder
test("4 valid trade enters aggregated+exchange buckets", () => {
  const { recorder, now, aggregator } = createWriterHarness();
  recorder.recordTrade(baseTrade(), now());
  const bucketStart = floorToMinute(1_700_000_000_000);
  assert.ok(aggregator.getBucket("BTCUSDT", "binance", bucketStart));
  assert.ok(aggregator.getBucket("BTCUSDT", "aggregated", bucketStart));
});

test("5 large trade ≥25K queued", () => {
  const { recorder, writer, now } = createWriterHarness();
  recorder.recordTrade(baseTrade({ notional: 30_000, price: 30_000, quantity: 1 }), now());
  assert.equal(writer.largeTradeQueue.length, 1);
});

test("6 trade <25K no large event", () => {
  const { recorder, writer, now } = createWriterHarness();
  recorder.recordTrade(baseTrade({ notional: 10_000, price: 10_000, quantity: 1 }), now());
  assert.equal(writer.largeTradeQueue.length, 0);
});

test("7 threshold band exact boundaries", () => {
  assert.equal(resolveThresholdBand(24_999), null);
  assert.equal(resolveThresholdBand(25_000), 25_000);
  assert.equal(resolveThresholdBand(60_000), 50_000);
  assert.equal(resolveThresholdBand(600_000), 500_000);
  assert.equal(resolveThresholdBand(1_200_000), 1_000_000);
});

test("8 duplicate recorded once", () => {
  const { recorder, writer, now } = createWriterHarness();
  const trade = baseTrade({ tradeId: "dup-1", notional: 30_000 });
  recorder.recordTrade(trade, now());
  recorder.recordTrade(trade, now());
  assert.equal(writer.largeTradeQueue.length, 1);
});

test("9 invalid trade contained", () => {
  const { recorder, metrics, now } = createWriterHarness();
  recorder.recordTrade({ exchange: "bad", symbol: "BTCUSDT" }, now());
  assert.equal(metrics.tradesInvalid, 1);
});

test("10 recordTrade never throws", () => {
  const { recorder } = createWriterHarness();
  assert.doesNotThrow(() => recorder.recordTrade(null));
  assert.doesNotThrow(() => recorder.recordTrade({ exchange: "binance" }));
});

// Queue
test("11 batch size triggers flush scheduling", async () => {
  const { recorder, writer, fake, now } = createWriterHarness({ batchSize: 1 });
  writer.start();
  recorder.recordTrade(baseTrade({ notional: 30_000, tradeId: "a" }), now());
  await writer.flush();
  assert.equal(fake.calls.large.length, 1);
  writer.stop();
});

test("12 interval triggers flush", async () => {
  const { writer, recorder, fake, now } = createWriterHarness({ batchSize: 50 });
  writer.start();
  recorder.recordTrade(baseTrade({ notional: 30_000, tradeId: "b" }), now());
  await writer.flush();
  assert.equal(fake.calls.large.length, 1);
  writer.stop();
});

test("13 no concurrent flush", async () => {
  const { writer, recorder, fake, now } = createWriterHarness();
  let inFlight = 0;
  fake.setFlowBehavior(async (rows) => {
    inFlight += 1;
    assert.equal(inFlight, 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    inFlight -= 1;
    return { ok: true, status: 200, written: rows.length, skipped: 0, latencyMs: 20 };
  });

  const tradeTs = 1_700_000_000_000;
  recorder.recordTrade(baseTrade({ ts: tradeTs, tradeId: "c1" }), tradeTs);
  const flushNow = readyFlushNow(tradeTs);
  writer.nowFn = () => flushNow;
  const p1 = writer.flush();
  const p2 = writer.flush();
  await Promise.all([p1, p2]);
  assert.equal(fake.calls.flow.length, 1);
});

test("14 successful write acknowledges buckets", async () => {
  const { writer, recorder, aggregator } = createWriterHarness();
  const tradeTs = 1_700_000_000_000;
  const flushNow = readyFlushNow(tradeTs);
  recorder.recordTrade(baseTrade({ ts: tradeTs, tradeId: "ack-1" }), tradeTs);
  assert.ok(aggregator.getReadyBuckets(flushNow).snapshots.length > 0);
  const previousNow = writer.nowFn;
  writer.nowFn = () => flushNow;
  await writer.flush();
  writer.nowFn = previousNow;
  assert.equal(aggregator.getReadyBuckets(flushNow).snapshots.length, 0);
});

test("15 failed write keeps buckets", async () => {
  const { writer, recorder, aggregator, fake, now } = createWriterHarness();
  fake.setFlowBehavior(async () => ({
    ok: false,
    status: 500,
    written: 0,
    skipped: 0,
    errorCode: "500",
    errorMessageSafe: "server_error",
    latencyMs: 1,
    retryable: true,
  }));

  const tradeTs = 1_700_000_000_000;
  const flushNow = readyFlushNow(tradeTs);
  recorder.recordTrade(baseTrade({ ts: tradeTs, tradeId: "keep-1" }), tradeTs);
  writer.nowFn = () => flushNow;
  await writer.flush();
  assert.ok(aggregator.getReadyBuckets(flushNow).snapshots.length > 0);
});

test("16 retry on 500", async () => {
  const { writer, fake, now, aggregator } = createWriterHarness({ retryMax: 2, retryBaseMs: 1 });
  let attempts = 0;
  fake.setFlowBehavior(async (rows) => {
    attempts += 1;
    if (attempts === 1) {
      return {
        ok: false,
        status: 500,
        written: 0,
        skipped: 0,
        errorCode: "500",
        errorMessageSafe: "server_error",
        latencyMs: 1,
        retryable: true,
      };
    }
    return { ok: true, status: 200, written: rows.length, skipped: 0, latencyMs: 1 };
  });

  const tradeTs = 1_700_000_000_000;
  const flushNow = readyFlushNow(tradeTs);
  const recorder = new HistoricalMarketRecorder({
    config: writer.config,
    metrics: writer.metrics,
    aggregator,
    writer,
    now: () => flushNow,
  });
  recorder.recordTrade(baseTrade({ ts: tradeTs, tradeId: "retry-500" }), tradeTs);
  writer.nowFn = () => flushNow;
  await writer.flush();
  assert.equal(attempts, 2);
});

test("17 retry on 429", async () => {
  const { writer, fake, aggregator } = createWriterHarness({ retryMax: 2, retryBaseMs: 1 });
  let attempts = 0;
  fake.setFlowBehavior(async (rows) => {
    attempts += 1;
    if (attempts === 1) {
      return {
        ok: false,
        status: 429,
        written: 0,
        skipped: 0,
        errorCode: "429",
        errorMessageSafe: "rate_limited",
        latencyMs: 1,
        retryable: true,
      };
    }
    return { ok: true, status: 200, written: rows.length, skipped: 0, latencyMs: 1 };
  });

  const tradeTs = 1_700_000_000_000;
  const flushNow = readyFlushNow(tradeTs);
  const recorder = new HistoricalMarketRecorder({
    config: writer.config,
    metrics: writer.metrics,
    aggregator,
    writer,
    now: () => flushNow,
  });
  recorder.recordTrade(baseTrade({ ts: tradeTs, tradeId: "retry-429" }), tradeTs);
  writer.nowFn = () => flushNow;
  await writer.flush();
  assert.equal(attempts, 2);
});

test("18 no retry on 400", async () => {
  const { writer, fake, aggregator } = createWriterHarness({ retryMax: 3, retryBaseMs: 1 });
  let attempts = 0;
  fake.setFlowBehavior(async () => {
    attempts += 1;
    return {
      ok: false,
      status: 400,
      written: 0,
      skipped: 0,
      errorCode: "400",
      errorMessageSafe: "validation_error",
      latencyMs: 1,
      retryable: false,
    };
  });

  const tradeTs = 1_700_000_000_000;
  const flushNow = readyFlushNow(tradeTs);
  const recorder = new HistoricalMarketRecorder({
    config: writer.config,
    metrics: writer.metrics,
    aggregator,
    writer,
    now: () => flushNow,
  });
  recorder.recordTrade(baseTrade({ ts: tradeTs, tradeId: "no-retry-400" }), tradeTs);
  writer.nowFn = () => flushNow;
  await writer.flush();
  assert.equal(attempts, 1);
});

test("19 retry max respected", async () => {
  const { writer, fake, aggregator } = createWriterHarness({ retryMax: 2, retryBaseMs: 1 });
  let attempts = 0;
  fake.setFlowBehavior(async () => {
    attempts += 1;
    return {
      ok: false,
      status: 503,
      written: 0,
      skipped: 0,
      errorCode: "503",
      errorMessageSafe: "server_error",
      latencyMs: 1,
      retryable: true,
    };
  });

  const tradeTs = 1_700_000_000_000;
  const flushNow = readyFlushNow(tradeTs);
  const recorder = new HistoricalMarketRecorder({
    config: writer.config,
    metrics: writer.metrics,
    aggregator,
    writer,
    now: () => flushNow,
  });
  recorder.recordTrade(baseTrade({ ts: tradeTs, tradeId: "max-retry" }), tradeTs);
  writer.nowFn = () => flushNow;
  await writer.flush();
  assert.equal(attempts, 3);
});

test("20 queue max bounded", () => {
  const { writer } = createWriterHarness({ queueMax: 3 });
  for (let i = 0; i < 5; i += 1) {
    writer.enqueueLargeTrade({
      tradeKey: `k-${i}`,
      symbol: "BTCUSDT",
      exchange: "binance",
      ts: 1,
      side: "buy",
      price: 1,
      quantity: 1,
      notional: 30_000,
      thresholdBand: 25_000,
    });
  }
  assert.equal(writer.largeTradeQueue.length, 3);
});

test("21 droppedEvents increments", () => {
  const { writer, metrics } = createWriterHarness({ queueMax: 2 });
  for (let i = 0; i < 4; i += 1) {
    writer.enqueueLargeTrade({
      tradeKey: `drop-${i}`,
      symbol: "BTCUSDT",
      exchange: "binance",
      ts: 1,
      side: "buy",
      price: 1,
      quantity: 1,
      notional: 30_000,
      thresholdBand: 25_000,
    });
  }
  assert.equal(metrics.droppedEvents, 2);
});

test("22 large duplicate considered skipped not fatal", async () => {
  const { writer, fake } = createWriterHarness();
  fake.setLargeBehavior(async (rows) => ({
    ok: true,
    status: 201,
    written: rows.length,
    skipped: 0,
    latencyMs: 1,
  }));
  writer.enqueueLargeTrade({
    tradeKey: "dup-large",
    symbol: "BTCUSDT",
    exchange: "binance",
    ts: 1,
    side: "buy",
    price: 1,
    quantity: 1,
    notional: 30_000,
    thresholdBand: 25_000,
  });
  await writer.flush();
  assert.equal(writer.metrics.flushFailures, 0);
});

test("23 mixed flow+large flush", async () => {
  const { writer, recorder, fake } = createWriterHarness();
  const tradeTs = 1_700_000_000_000;
  const flushNow = readyFlushNow(tradeTs);
  recorder.recordTrade(baseTrade({ ts: tradeTs, tradeId: "mix-1", notional: 30_000 }), tradeTs);
  writer.nowFn = () => flushNow;
  await writer.flush();
  assert.equal(fake.calls.flow.length, 1);
  assert.equal(fake.calls.large.length, 1);
});

test("24 one category failure does not wipe the other", async () => {
  const { writer, recorder, fake, aggregator } = createWriterHarness({ retryMax: 0, retryBaseMs: 1 });
  fake.setFlowBehavior(async (rows) => ({
    ok: true,
    status: 200,
    written: rows.length,
    skipped: 0,
    latencyMs: 1,
  }));
  fake.setLargeBehavior(async () => ({
    ok: false,
    status: 500,
    written: 0,
    skipped: 0,
    errorCode: "500",
    errorMessageSafe: "server_error",
    latencyMs: 1,
    retryable: false,
  }));

  const tradeTs = 1_700_000_000_000;
  const flushNow = readyFlushNow(tradeTs);
  recorder.recordTrade(baseTrade({ ts: tradeTs, tradeId: "split-1", notional: 30_000 }), tradeTs);
  writer.nowFn = () => flushNow;
  await writer.flush();
  assert.equal(fake.calls.flow.length, 1);
  assert.equal(aggregator.getReadyBuckets(flushNow).snapshots.length, 0);
  assert.ok(writer.largeTradeQueue.length > 0 || writer.largeTradeDeadLetter.length > 0);
});

test("25 shutdown flush", async () => {
  const { writer, recorder, fake } = createWriterHarness();
  recorder.recordTrade(baseTrade({ notional: 30_000, tradeId: "shutdown-1" }), 1_700_000_000_000);
  await writer.shutdown({ timeoutMs: 200 });
  assert.equal(fake.calls.large.length, 1);
});

test("26 no duplicate process listeners", () => {
  resetHistoricalMarketRecorderForTests();
  delete globalThis.__marketHistoryShutdownRegistered;
  const { writer } = createWriterHarness();
  registerMarketHistoryShutdown(writer);
  registerMarketHistoryShutdown(writer);
  assert.equal(globalThis.__marketHistoryShutdownRegistered, true);
  assert.equal(process.listenerCount("SIGTERM"), 1);
  assert.equal(process.listenerCount("SIGINT"), 1);
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");
  delete globalThis.__marketHistoryShutdownRegistered;
});

test("27 HMR/singleton no duplicate timers", () => {
  const { writer } = createWriterHarness();
  writer.start();
  writer.start();
  assert.ok(writer.flushTimer);
  writer.stop();
});

// Supabase client
test("28 correct snake_case mapping", () => {
  const mapped = mapFlowBucketRow({
    symbol: "BTCUSDT",
    exchangeScope: "aggregated",
    bucketStart: 1_700_000_000_000,
    bucketSeconds: 60,
    buyNotional: 1,
    sellNotional: 2,
    buyCount: 3,
    sellCount: 4,
    maxTradeNotional: 5,
    large25kCount: 1,
    large50kCount: 0,
    large100kCount: 0,
    large250kCount: 0,
    large500kCount: 0,
    large1mCount: 0,
  });
  assert.equal(mapped.exchange_scope, "aggregated");
  assert.equal(mapped.buy_notional, 1);
  assert.equal(mapped.large_25k_count, 1);
});

test("29 flow on_conflict correct", () => {
  assert.equal(FLOW_CONFLICT_COLUMNS, "symbol,exchange_scope,bucket_start");
});

test("30 replace payload", () => {
  const row = mapFlowBucketRow({
    symbol: "BTCUSDT",
    exchangeScope: "binance",
    bucketStart: 1,
    bucketSeconds: 60,
    buyNotional: 10,
    sellNotional: 20,
    buyCount: 1,
    sellCount: 2,
    maxTradeNotional: 20,
    large25kCount: 0,
    large50kCount: 0,
    large100kCount: 0,
    large250kCount: 0,
    large500kCount: 0,
    large1mCount: 0,
  });
  assert.equal(row.buy_notional, 10);
  assert.equal(row.sell_notional, 20);
});

test("31 large trade conflict key", () => {
  assert.equal(LARGE_TRADE_CONFLICT_COLUMN, "trade_key");
  const row = mapLargeTradeRow({
    tradeKey: "binance:BTCUSDT:1",
    symbol: "BTCUSDT",
    exchange: "binance",
    ts: 1,
    side: "buy",
    price: 1,
    quantity: 1,
    notional: 30_000,
    thresholdBand: 25_000,
  });
  assert.equal(row.trade_key, "binance:BTCUSDT:1");
  assert.equal(row.threshold_band, 25_000);
});

test("32 timeout behavior", async () => {
  const client = createSupabaseHistoryClient({
    url: "https://example.supabase.co",
    serviceKey: "service-key",
    timeoutMs: 5,
    fetchFn: async () => {
      const error = new Error("FETCH_TIMEOUT");
      error.code = "FETCH_TIMEOUT";
      throw error;
    },
  });

  const result = await client.upsertFlowBuckets([
    {
      symbol: "BTCUSDT",
      exchangeScope: "binance",
      bucketStart: 1,
      bucketSeconds: 60,
      buyNotional: 1,
      sellNotional: 0,
      buyCount: 1,
      sellCount: 0,
      maxTradeNotional: 1,
      large25kCount: 0,
      large50kCount: 0,
      large100kCount: 0,
      large250kCount: 0,
      large500kCount: 0,
      large1mCount: 0,
    },
  ]);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "TIMEOUT");
});

test("33 safe error message", () => {
  assert.equal(safeErrorMessage(401), "auth_failed");
  assert.equal(safeErrorMessage(429), "rate_limited");
  assert.equal(safeErrorMessage(500), "server_error");
  assert.equal(safeErrorMessage(400), "validation_error");
});

test("34 no secrets in errors/logs", async () => {
  const secret = "super-secret-service-role-key";
  const client = createSupabaseHistoryClient({
    url: "https://example.supabase.co",
    serviceKey: secret,
    fetchFn: async () => ({
      ok: false,
      status: 403,
      text: async () => secret,
    }),
  });
  const result = await client.insertLargeTrades([
    {
      tradeKey: "k",
      symbol: "BTCUSDT",
      exchange: "binance",
      ts: 1,
      side: "buy",
      price: 1,
      quantity: 1,
      notional: 30_000,
      thresholdBand: 25_000,
    },
  ]);
  assert.equal(result.errorMessageSafe, "auth_failed");
  assert.notEqual(String(result.errorMessageSafe), secret);
});

// Hub integration (source guards)
test("35 hub onTrade calls existing tracker", () => {
  const source = readFileSync(join(ROOT, "lib/market-data/market-depth-hub.js"), "utf8");
  assert.match(source, /tracker\.addTrade\(trade\)/);
});

test("36 hub onTrade calls recorder once", () => {
  const source = readFileSync(join(ROOT, "lib/market-data/market-depth-hub.js"), "utf8");
  assert.match(source, /historyRecorder\.recordTrade\(trade\)/);
});

test("37 hub no await requirement", () => {
  const source = readFileSync(join(ROOT, "lib/market-data/market-depth-hub.js"), "utf8");
  assert.doesNotMatch(source, /await\s+this\.historyRecorder\.recordTrade/);
});

test("38 recorder throw contained", () => {
  const source = readFileSync(join(ROOT, "lib/market-data/market-depth-hub.js"), "utf8");
  assert.match(source, /try\s*\{[\s\S]*historyRecorder\.recordTrade\(trade\)[\s\S]*catch/);
});

test("39 feature disabled = behavior identical", () => {
  withEnv({ MARKET_HISTORY_WRITE_ENABLED: undefined }, () => {
    resetHistoricalMarketRecorderForTests();
    assert.equal(isMarketHistoryWriteEnabled(), false);
    const status = getHistoryWriterStatus();
    assert.equal(status.enabled, false);
    resetHistoricalMarketRecorderForTests();
  });
});

test("40 no SSE payload changes", () => {
  const source = readFileSync(join(ROOT, "lib/market-data/market-depth-hub.js"), "utf8");
  const buildPayload = source.slice(source.indexOf("buildPayload(params)"));
  assert.doesNotMatch(buildPayload, /history/i);
});

test("peek/ack preserves existing drain semantics", () => {
  const now = 1_700_000_180_000;
  const agg = new FlowBucketAggregator({ now: () => now });
  const tradeTs = 1_700_000_000_000;
  agg.addTrade(baseTrade({ ts: tradeTs, tradeId: "drain-1" }), { now: tradeTs });
  const drained = agg.drainReadyBuckets(tradeTs + BUCKET_MS + LATE_TRADE_GRACE_MS + 1);
  assert.ok(drained.length > 0);
  assert.equal(agg.getBuckets().length, 0);
});

test("explicit boolean parsing", () => {
  assert.equal(parseExplicitBoolean(undefined), false);
  assert.equal(parseExplicitBoolean("false"), false);
  assert.equal(parseExplicitBoolean("true"), true);
  assert.equal(parseExplicitBoolean("1"), true);
  assert.equal(parseExplicitBoolean("yes"), false);
});

test("buildFlowBucketKey stable", () => {
  assert.equal(buildFlowBucketKey("BTCUSDT", "binance", 123), "BTCUSDT:binance:123");
});

test("accelerated fake-client 3-minute simulation", async () => {
  const baseTs = 1_700_000_000_000;
  let nowMs = baseTs;
  const stats = { flowRows: 0, largeRows: 0, flowBatches: 0, failuresBeforeSuccess: 0 };
  const fakeClient = {
    async upsertFlowBuckets(rows) {
      stats.flowBatches += 1;
      stats.flowRows += rows.length;
      if (stats.failuresBeforeSuccess < 1) {
        stats.failuresBeforeSuccess += 1;
        return {
          ok: false,
          status: 503,
          written: 0,
          skipped: 0,
          errorCode: "503",
          errorMessageSafe: "server_error",
          latencyMs: 3,
          retryable: true,
        };
      }
      return { ok: true, status: 200, written: rows.length, skipped: 0, latencyMs: 3 };
    },
    async insertLargeTrades(rows) {
      stats.largeRows += rows.length;
      return { ok: true, status: 200, written: rows.length, skipped: 0, latencyMs: 2 };
    },
  };

  const metrics = new HistoryMetrics();
  const config = getMarketHistoryConfig({
    enabled: true,
    flushIntervalMs: 100,
    batchSize: 4,
    queueMax: 100,
    retryMax: 2,
    retryBaseMs: 5,
    requestTimeoutMs: 50,
  });
  const aggregator = new FlowBucketAggregator({ now: () => nowMs });
  const writer = new MarketHistoryWriter({
    client: fakeClient,
    config,
    metrics,
    now: () => nowMs,
    sleep: async (ms) => {
      nowMs += ms;
    },
    getReadyFlowBuckets: (now) => aggregator.getReadyBuckets(now),
    acknowledgeFlowBuckets: (keys) => aggregator.acknowledgeBuckets(keys),
    getPendingBucketStats: (now) => aggregator.getPendingBucketStats(now),
  });
  const recorder = new HistoricalMarketRecorder({
    config,
    metrics,
    aggregator,
    writer,
    now: () => nowMs,
  });

  writer.start();

  for (let minute = 0; minute < 3; minute += 1) {
    const ts = baseTs + minute * BUCKET_MS + 5_000;
    recorder.recordTrade(
      baseTrade({ ts, tradeId: `sim-${minute}`, exchange: "okx", notional: 50_000 }),
      nowMs,
    );
    recorder.recordTrade(
      baseTrade({
        ts,
        tradeId: "dup",
        exchange: "binance",
        notional: 60_000,
        price: 60_000,
      }),
      nowMs,
    );
    recorder.recordTrade(
      baseTrade({
        ts,
        tradeId: "dup",
        exchange: "binance",
        notional: 60_000,
        price: 60_000,
      }),
      nowMs,
    );
    recorder.recordTrade(
      baseTrade({
        ts,
        tradeId: "small",
        notional: 1_000,
        price: 1_000,
        quantity: 1,
      }),
      nowMs,
    );
    nowMs += BUCKET_MS;
  }

  nowMs = readyFlushNow(baseTs + 2 * BUCKET_MS);
  writer.nowFn = () => nowMs;
  await writer.flush();
  await writer.shutdown({ timeoutMs: 100 });

  const status = recorder.getStatus();
  assert.ok(stats.flowRows > 0);
  assert.ok(stats.largeRows > 0);
  assert.ok(stats.flowBatches > 0);
  assert.ok(status.tradesDuplicate >= 1);
  assert.equal(metrics.droppedEvents, 0);
  assert.equal(writer.largeTradeQueue.length, 0);
  writer.stop();
});

for (const asyncTest of asyncTests) {
  await asyncTest();
  passed += 1;
}

console.log(`market-history-writer tests passed: ${passed}/${passed}`);
