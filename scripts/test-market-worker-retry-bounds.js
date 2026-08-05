#!/usr/bin/env node
import assert from "node:assert/strict";
import { MarketHistoryWriter } from "../lib/market-data/history/market-history-writer.js";
import { LiquidityWallWriter } from "../lib/market-data/history/liquidity-walls/liquidity-wall-writer.js";
import { getMarketHistoryConfig } from "../lib/market-data/history/history-config.js";

let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

async function main() {
  await test("retry max respected and unchanged rows skipped on retry", async () => {
    let attempts = 0;
    const writer = new MarketHistoryWriter({
      client: {
        upsertFlowBuckets: async () => {
          attempts += 1;
          return {
            ok: false,
            status: 500,
            written: 0,
            skipped: 0,
            latencyMs: 1,
            retryable: true,
          };
        },
        insertLargeTrades: async () => ({
          ok: true,
          status: 200,
          written: 0,
          skipped: 0,
          latencyMs: 0,
        }),
      },
      config: getMarketHistoryConfig({ enabled: true, retryMax: 2, retryBaseMs: 1 }),
      sleep: async () => {},
      getReadyFlowBuckets: () => ({
        snapshots: [
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
        ],
        keys: ["BTCUSDT:binance:1"],
      }),
      acknowledgeFlowBuckets: () => 1,
      getPendingBucketStats: () => ({ count: 0, oldestAgeMs: null }),
    });

    const result = await writer.runFlush();
    assert.equal(result.flowResult.ok, false);
    assert.equal(attempts, 3);
  });

  await test("retry stops early when fingerprint already written", async () => {
  let attempts = 0;
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
  const writeState = { lastWrittenFingerprints: new Map() };
  writeState.lastWrittenFingerprints.set(row.wallKey, (await import("../lib/market-data/history/write-fingerprint.js")).buildLiquidityWallFingerprint(row));

  const writer = new LiquidityWallWriter({
    client: {
      upsertLiquidityWalls: async () => {
        attempts += 1;
        return { ok: false, retryable: true, latencyMs: 1 };
      },
    },
    config: getMarketHistoryConfig({ enabled: true, retryMax: 3, retryBaseMs: 1 }),
    sleep: async () => {},
    getPendingRows: () => [row],
    acknowledgeRows: () => 1,
    writeState,
  });

  const result = await writer.runFlush();
  assert.equal(result.ok, true);
  assert.equal(attempts, 0);
  });

  await test("large trade ordering preserved in batch dedupe", async () => {
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

  const batch = writer.prepareLargeTradeBatch([
    { tradeKey: "a", symbol: "BTCUSDT", exchange: "binance", ts: 1, side: "buy", price: 1, quantity: 1, notional: 1, thresholdBand: 25000 },
    { tradeKey: "a", symbol: "BTCUSDT", exchange: "binance", ts: 2, side: "buy", price: 1, quantity: 1, notional: 1, thresholdBand: 25000 },
    { tradeKey: "b", symbol: "BTCUSDT", exchange: "binance", ts: 3, side: "sell", price: 1, quantity: 1, notional: 1, thresholdBand: 25000 },
  ]);
  assert.deepEqual(batch.map((row) => row.tradeKey), ["a", "b"]);
  });

  console.log(`\n${passed}/${passed} market-worker-retry-bounds tests passed`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
