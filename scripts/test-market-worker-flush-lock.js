#!/usr/bin/env node
import assert from "node:assert/strict";
import { MarketHistoryWriter } from "../lib/market-data/history/market-history-writer.js";
import { LiquidityWallWriter } from "../lib/market-data/history/liquidity-walls/liquidity-wall-writer.js";
import { getMarketHistoryConfig } from "../lib/market-data/history/history-config.js";
import { FlowBucketAggregator } from "../lib/market-data/history/flow-bucket-aggregator.js";

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

async function main() {
  await test("overlapping flush prevented (market history writer)", async () => {
  let inFlightWrites = 0;
  let maxConcurrent = 0;
  const aggregator = new FlowBucketAggregator({ now: () => 1_700_000_060_000 });
  aggregator.addTrade(
    {
      exchange: "binance",
      symbol: "BTCUSDT",
      tradeId: "1",
      ts: 1_700_000_000_000,
      side: "buy",
      price: 1,
      quantity: 1,
      notional: 30_000,
    },
    { now: 1_700_000_000_000 },
  );

  const writer = new MarketHistoryWriter({
    client: {
      upsertFlowBuckets: async () => {
        inFlightWrites += 1;
        maxConcurrent = Math.max(maxConcurrent, inFlightWrites);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlightWrites -= 1;
        return { ok: true, status: 200, written: 1, skipped: 0, latencyMs: 1 };
      },
      insertLargeTrades: async () => ({
        ok: true,
        status: 200,
        written: 0,
        skipped: 0,
        latencyMs: 0,
      }),
    },
    config: getMarketHistoryConfig({ enabled: true, batchSize: 10 }),
    getReadyFlowBuckets: (now) => aggregator.getReadyBuckets(now),
    acknowledgeFlowBuckets: (keys) => aggregator.acknowledgeBuckets(keys),
    getPendingBucketStats: (now) => aggregator.getPendingBucketStats(now),
  });

  const p1 = writer.flush();
  const p2 = writer.flush();
  await Promise.all([p1, p2]);
  assert.equal(maxConcurrent, 1);
  });

  await test("overlapping flush prevented (liquidity wall writer)", async () => {
  let inFlightWrites = 0;
  let maxConcurrent = 0;
  const row = {
    wallKey: "BTCUSDT:binance:bid:65000",
    symbol: "BTCUSDT",
    exchange: "binance",
    side: "bid",
    price: 65000,
    size: 10,
    notional: 650000,
    distanceFromMid: 0.5,
    snapshotTime: 1,
    firstSeen: 1,
    lastSeen: 1,
    lifetimeSeconds: 0,
    appearanceCount: 1,
    persistenceScore: 0.2,
    maxSize: 10,
    averageSize: 10,
    reappearCount: 0,
    strongestNotional: 650000,
    survivedSnapshots: 1,
    isActive: true,
  };

  const writer = new LiquidityWallWriter({
    client: {
      upsertLiquidityWalls: async () => {
        inFlightWrites += 1;
        maxConcurrent = Math.max(maxConcurrent, inFlightWrites);
        await new Promise((resolve) => setTimeout(resolve, 20));
        inFlightWrites -= 1;
        return { ok: true, written: 1, latencyMs: 1 };
      },
    },
    config: getMarketHistoryConfig({ enabled: true }),
    getPendingRows: () => [row],
    acknowledgeRows: () => 1,
    writeState: { lastWrittenFingerprints: new Map() },
  });

  const p1 = writer.flushOnce();
  const p2 = writer.flushOnce();
  await Promise.all([p1, p2]);
  assert.equal(maxConcurrent, 1);
  });

  await test("empty flush does not increment flushAttempts (market history)", async () => {
  const writer = new MarketHistoryWriter({
    client: {
      upsertFlowBuckets: async () => ({
        ok: true,
        status: 200,
        written: 0,
        skipped: 0,
        latencyMs: 0,
      }),
      insertLargeTrades: async () => ({
        ok: true,
        status: 200,
        written: 0,
        skipped: 0,
        latencyMs: 0,
      }),
    },
    config: getMarketHistoryConfig({ enabled: true }),
    getReadyFlowBuckets: () => ({ snapshots: [], keys: [] }),
    acknowledgeFlowBuckets: () => 0,
    getPendingBucketStats: () => ({ count: 0, oldestAgeMs: null }),
  });

  const metricsBefore = writer.metrics.flushAttempts;
  await writer.runFlush();
  assert.equal(writer.metrics.flushAttempts, metricsBefore);
  assert.equal(writer.emptyFlushes, 1);
  });

  console.log(`\n${passed}/${passed} market-worker-flush-lock tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
