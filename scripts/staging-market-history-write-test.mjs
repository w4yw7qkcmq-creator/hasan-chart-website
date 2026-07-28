/**
 * Staging-only writer smoke test (5 minutes max).
 * Manual run only:
 *   MARKET_HISTORY_TEST_ALLOW_STAGING=true \
 *   STAGING_SUPABASE_URL=... \
 *   STAGING_SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/staging-market-history-write-test.mjs
 */
import { HistoricalMarketRecorder } from "../lib/market-data/history/historical-market-recorder.js";
import { getMarketHistoryConfig } from "../lib/market-data/history/history-config.js";
import { createSupabaseHistoryClient } from "../lib/market-data/history/supabase-history-client.js";
import { MarketHistoryWriter } from "../lib/market-data/history/market-history-writer.js";
import { HistoryMetrics } from "../lib/market-data/history/history-metrics.js";
import { FlowBucketAggregator } from "../lib/market-data/history/flow-bucket-aggregator.js";
import { BUCKET_MS, LATE_TRADE_GRACE_MS } from "../lib/market-data/history/constants.js";
import {
  assertStagingWriteTestAllowed,
  buildStagingTestTradeId,
} from "../lib/market-data/history/staging-write-test-guard.js";

const RUN_MS = 5 * 60 * 1000;
const INTERVAL_MS = 10_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tradeAt(exchange, minuteOffset, seq) {
  const ts = Date.now() - (3 - minuteOffset) * BUCKET_MS + seq * 1000;
  return {
    exchange,
    symbol: "BTCUSDT",
    tradeId: buildStagingTestTradeId(exchange, minuteOffset, seq),
    ts,
    side: seq % 2 === 0 ? "buy" : "sell",
    price: 50_000 + seq * 10,
    quantity: 1,
    notional: 50_000 + seq * 10,
  };
}

async function countRows(client, table) {
  const response = await fetch(`${client.url}/rest/v1/${table}?select=id`, {
    headers: {
      apikey: client.serviceKey,
      Authorization: `Bearer ${client.serviceKey}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
  });
  const range = response.headers.get("content-range") || "";
  const total = range.split("/")[1];
  return Number(total) || 0;
}

async function main() {
  const staging = assertStagingWriteTestAllowed(process.env);

  process.env.MARKET_HISTORY_WRITE_ENABLED = "true";
  process.env.SUPABASE_URL = staging.url;
  process.env.NEXT_PUBLIC_SUPABASE_URL = staging.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = staging.serviceKey;

  const client = createSupabaseHistoryClient({
    url: staging.url,
    serviceKey: staging.serviceKey,
  });

  let nowMs = Date.now();
  const metrics = new HistoryMetrics();
  const config = getMarketHistoryConfig({ enabled: true, flushIntervalMs: 10_000, batchSize: 50 });
  const aggregator = new FlowBucketAggregator({ now: () => nowMs });
  const writer = new MarketHistoryWriter({
    client,
    config,
    metrics,
    now: () => nowMs,
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

  const startedAt = Date.now();
  let iterations = 0;
  const exchanges = ["okx", "binance", "bybit"];

  console.log(
    JSON.stringify({
      event: "staging_write_test_start",
      maskedHostname: staging.maskedHostname,
      durationMs: RUN_MS,
    }),
  );

  while (Date.now() - startedAt < RUN_MS) {
    iterations += 1;
    for (const exchange of exchanges) {
      recorder.recordTrade(tradeAt(exchange, iterations % 3, iterations), nowMs);
      recorder.recordTrade(tradeAt(exchange, iterations % 3, iterations), nowMs);
      recorder.recordTrade(
        {
          ...tradeAt(exchange, iterations % 3, iterations + 1000),
          notional: 30_000,
          price: 30_000,
        },
        nowMs,
      );
    }

    nowMs = Date.now();
    if (nowMs - startedAt > BUCKET_MS + LATE_TRADE_GRACE_MS + 5_000) {
      await writer.flush();
    }

    await sleep(INTERVAL_MS);
  }

  await writer.shutdown({ timeoutMs: 5_000 });

  const flowRows = await countRows(
    { url: staging.url, serviceKey: staging.serviceKey },
    "market_flow_buckets",
  );
  const largeRows = await countRows(
    { url: staging.url, serviceKey: staging.serviceKey },
    "market_large_trades",
  );

  const status = recorder.getStatus();
  console.log(
    JSON.stringify(
      {
        event: "staging_write_test_complete",
        maskedHostname: staging.maskedHostname,
        durationMs: Date.now() - startedAt,
        iterations,
        flowRows,
        largeRows,
        metrics: {
          tradesReceived: status.tradesReceived,
          tradesAccepted: status.tradesAccepted,
          tradesDuplicate: status.tradesDuplicate,
          flushAttempts: status.flushAttempts,
          flushSuccesses: status.flushSuccesses,
          flushFailures: status.flushFailures,
          rowsWrittenFlow: status.rowsWrittenFlow,
          rowsWrittenLarge: status.rowsWrittenLarge,
          droppedEvents: status.droppedEvents,
          lastLatencyMs: status.lastLatencyMs,
          lastErrorSafe: status.lastErrorSafe,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
