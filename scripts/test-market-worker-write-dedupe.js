#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  buildFlowBucketFingerprint,
  buildLiquidityWallFingerprint,
  dedupeBatchByKey,
  filterUnchangedRows,
} from "../lib/market-data/history/write-fingerprint.js";
import { LiquidityWallWriteState } from "../lib/market-data/history/liquidity-walls/liquidity-wall-write-state.js";
import { LiquidityWallWriter } from "../lib/market-data/history/liquidity-walls/liquidity-wall-writer.js";
import { MarketHistoryWriter } from "../lib/market-data/history/market-history-writer.js";
import { getMarketHistoryConfig } from "../lib/market-data/history/history-config.js";
import { FlowBucketAggregator } from "../lib/market-data/history/flow-bucket-aggregator.js";

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

function baseWall(overrides = {}) {
  return {
    wallKey: "BTCUSDT:binance:bid:65000",
    symbol: "BTCUSDT",
    exchange: "binance",
    side: "bid",
    price: 65000,
    size: 10,
    notional: 650000,
    distanceFromMid: 0.5,
    snapshotTime: 1_700_000_000_000,
    firstSeen: 1_700_000_000_000,
    lastSeen: 1_700_000_000_000,
    lifetimeSeconds: 0,
    appearanceCount: 1,
    persistenceScore: 0.2,
    maxSize: 10,
    averageSize: 10,
    reappearCount: 0,
    strongestNotional: 650000,
    survivedSnapshots: 1,
    isActive: true,
    ...overrides,
  };
}

async function main() {
  await test("empty batch → no DB call (liquidity writer)", async () => {
  let calls = 0;
  const writer = new LiquidityWallWriter({
    client: {
      upsertLiquidityWalls: async () => {
        calls += 1;
        return { ok: true, written: 0, latencyMs: 1 };
      },
    },
    config: getMarketHistoryConfig({ enabled: true, flushIntervalMs: 10_000 }),
    getPendingRows: () => [],
  });
  await writer.flushOnce();
  assert.equal(calls, 0);
  assert.equal(writer.emptyFlushes, 1);
  });

  await test("duplicate entries in same batch → one write", async () => {
  const row = baseWall();
  const deduped = dedupeBatchByKey([row, { ...row, size: 99 }], (r) => r.wallKey);
  assert.equal(deduped.length, 1);
  assert.equal(deduped[0].size, 99);
  });

  await test("unchanged state → no update", async () => {
  const state = new LiquidityWallWriteState();
  const row = baseWall();
  assert.equal(state.shouldQueue(row), true);
  state.markWritten([row]);
  assert.equal(state.shouldQueue(row), false);
  assert.equal(state.shouldQueue({ ...row, size: 11 }), true);
  });

  await test("changed state → update once", async () => {
  const calls = [];
  const writeState = new LiquidityWallWriteState();
  const pending = [baseWall()];
  const writer = new LiquidityWallWriter({
    client: {
      upsertLiquidityWalls: async (rows) => {
        calls.push(rows.length);
        return { ok: true, written: rows.length, latencyMs: 1 };
      },
    },
    config: getMarketHistoryConfig({ enabled: true }),
    getPendingRows: () => pending,
    acknowledgeRows: () => pending.length,
    writeState,
  });
  await writer.runFlush();
  assert.deepEqual(calls, [1]);
  pending[0] = baseWall({ size: 12, notional: 780000 });
  await writer.runFlush();
  assert.deepEqual(calls, [1, 1]);
  });

  await test("flow bucket unchanged fingerprint filtered", async () => {
  const lastWritten = new Map();
  const row = {
    symbol: "BTCUSDT",
    exchangeScope: "binance",
    bucketStart: 1_700_000_000_000,
    bucketSeconds: 60,
    buyNotional: 1,
    sellNotional: 2,
    buyCount: 1,
    sellCount: 1,
    maxTradeNotional: 1,
    large25kCount: 0,
    large50kCount: 0,
    large100kCount: 0,
    large250kCount: 0,
    large500kCount: 0,
    large1mCount: 0,
  };
  const fp = buildFlowBucketFingerprint(row);
  lastWritten.set("BTCUSDT:binance:1700000000000", fp);
  const filtered = filterUnchangedRows(
    [row],
    (r) => `${r.symbol}:${r.exchangeScope}:${r.bucketStart}`,
    buildFlowBucketFingerprint,
    lastWritten,
  );
  assert.equal(filtered.changed.length, 0);
  assert.equal(filtered.skipped, 1);
  });

  await test("no full-table comparison helpers present", async () => {
  const fs = await import("node:fs");
  const writerSource = fs.readFileSync("lib/market-data/history/market-history-writer.js", "utf8");
  const liquiditySource = fs.readFileSync(
    "lib/market-data/history/liquidity-walls/liquidity-wall-recorder.js",
    "utf8",
  );
  assert.doesNotMatch(writerSource, /select\s+\*|from\s+market_/i);
  assert.doesNotMatch(liquiditySource, /select\s+\*|from\s+market_/i);
  });

  await test("batch max enforced via config slice", async () => {
  const config = getMarketHistoryConfig({ enabled: true, batchSize: 2 });
  const aggregator = new FlowBucketAggregator({ now: () => 1_700_000_060_000 });
  const trade = {
    exchange: "binance",
    symbol: "BTCUSDT",
    tradeId: "1",
    ts: 1_700_000_000_000,
    side: "buy",
    price: 1,
    quantity: 1,
    notional: 30_000,
  };
  aggregator.addTrade(trade, { now: 1_700_000_000_000 });
  aggregator.addTrade({ ...trade, tradeId: "2", symbol: "ETHUSDT" }, { now: 1_700_000_000_000 });
  aggregator.addTrade({ ...trade, tradeId: "3", symbol: "SOLUSDT" }, { now: 1_700_000_000_000 });
  const ready = aggregator.getReadyBuckets(1_700_000_060_000 + 90_000);
  assert.ok(ready.snapshots.length >= 2);
  assert.equal(ready.snapshots.slice(0, config.batchSize).length, 2);
  });

  console.log(`\n${passed}/${passed} market-worker-write-dedupe tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});