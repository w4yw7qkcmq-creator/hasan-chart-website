import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateHistoryFlowQuery,
  validateHistoryLargeTradesQuery,
} from "../lib/market-data/history/history-api-validation.js";
import {
  buildFlowDominance,
  clearHistoryQueryCacheForTests,
  createHistoryQueryClient,
  queryHistoricalFlow,
  queryHistoricalLargeTrades,
} from "../lib/market-data/history/history-query.js";
import { HISTORY_FLOW_API_WINDOWS, HISTORY_LARGE_TRADE_API_WINDOWS } from "../lib/market-data/constants.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
}

function fakeClient({ flowRows = [], largeRows = [] } = {}) {
  return {
    restGet(path) {
      if (path.includes("market_flow_buckets")) return Promise.resolve(flowRows);
      if (path.includes("market_large_trades")) return Promise.resolve(largeRows);
      return Promise.resolve([]);
    },
  };
}

test("flow validation all windows", () => {
  for (const window of HISTORY_FLOW_API_WINDOWS) {
    const result = validateHistoryFlowQuery(
      new URLSearchParams({ symbol: "BTCUSDT", window, scope: "aggregated" }),
    );
    assert.equal(result.valid, true, window);
  }
});

test("large trades validation all windows", () => {
  for (const window of HISTORY_LARGE_TRADE_API_WINDOWS) {
    const result = validateHistoryLargeTradesQuery(
      new URLSearchParams({ symbol: "BTCUSDT", window, minNotional: "50000" }),
    );
    assert.equal(result.valid, true, window);
  }
});

test("invalid symbol rejected", () => {
  assert.equal(validateHistoryFlowQuery(new URLSearchParams({ symbol: "BAD", window: "4h" })).valid, false);
});

test("invalid window rejected", () => {
  assert.equal(
    validateHistoryFlowQuery(new URLSearchParams({ symbol: "BTCUSDT", window: "2h" })).valid,
    false,
  );
});

test("invalid scope rejected", () => {
  assert.equal(
    validateHistoryFlowQuery(
      new URLSearchParams({ symbol: "BTCUSDT", window: "4h", scope: "fake" }),
    ).valid,
    false,
  );
});

test("dominance calculations", () => {
  const result = buildFlowDominance({
    buyNotional: 600,
    sellNotional: 400,
    buyCount: 6,
    sellCount: 4,
  });
  assert.equal(result.buyPercent, 60);
  assert.equal(result.dominantSide, "buyers");
  assert.equal(result.netFlow, 200);
});

test("completeness partial when empty", async () => {
  clearHistoryQueryCacheForTests();
  const payload = await queryHistoricalFlow({
    client: fakeClient({ flowRows: [] }),
    symbol: "BTCUSDT",
    window: "4h",
    scope: "aggregated",
    now: 1_700_000_000_000,
  });
  assert.equal(payload.partialData, true);
  assert.equal(payload.bucketCount, 0);
});

test("flow query aggregates rows", async () => {
  clearHistoryQueryCacheForTests();
  const payload = await queryHistoricalFlow({
    client: fakeClient({
      flowRows: [
        {
          bucket_start: new Date(1_700_000_000_000).toISOString(),
          buy_notional: 100,
          sell_notional: 50,
          buy_count: 2,
          sell_count: 1,
        },
      ],
    }),
    symbol: "BTCUSDT",
    window: "4h",
    scope: "aggregated",
    now: 1_700_000_000_000 + 4 * 60 * 60_000,
  });
  assert.equal(payload.buyNotional, 100);
  assert.equal(payload.bucketCount, 1);
});

test("flow coverage contract for partial 4h window", async () => {
  clearHistoryQueryCacheForTests();
  const rows = Array.from({ length: 34 }, (_, index) => ({
    bucket_start: new Date(1_700_000_000_000 + index * 60_000).toISOString(),
    buy_notional: 10,
    sell_notional: 5,
    buy_count: 1,
    sell_count: 1,
  }));
  const payload = await queryHistoricalFlow({
    client: fakeClient({ flowRows: rows }),
    symbol: "BTCUSDT",
    window: "4h",
    scope: "aggregated",
    now: 1_700_000_000_000 + 4 * 60 * 60_000,
  });
  assert.equal(payload.bucketCount, 34);
  assert.equal(payload.expectedBucketCount, 240);
  assert.equal(payload.missingBucketCount, 206);
  assert.ok(Math.abs(payload.coverageRatio - 34 / 240) < 1e-9);
  assert.ok(Math.abs(payload.coveragePercent - (34 / 240) * 100) < 1e-6);
  assert.equal(payload.completeness, payload.coverageRatio);
  assert.equal(payload.partialData, true);
});

test("duplicate bucket timestamps count once", async () => {
  clearHistoryQueryCacheForTests();
  const ts = new Date(1_700_000_000_000).toISOString();
  const payload = await queryHistoricalFlow({
    client: fakeClient({
      flowRows: [
        {
          bucket_start: ts,
          buy_notional: 100,
          sell_notional: 50,
          buy_count: 2,
          sell_count: 1,
        },
        {
          bucket_start: ts,
          buy_notional: 20,
          sell_notional: 10,
          buy_count: 1,
          sell_count: 1,
        },
      ],
    }),
    symbol: "BTCUSDT",
    window: "4h",
    scope: "aggregated",
    now: 1_700_000_000_000 + 4 * 60 * 60_000,
  });
  assert.equal(payload.bucketCount, 1);
  assert.equal(payload.buyNotional, 120);
});

test("large trades limit maximum", () => {
  const result = validateHistoryLargeTradesQuery(
    new URLSearchParams({ symbol: "BTCUSDT", window: "4h", limit: "500" }),
  );
  assert.equal(result.valid, true);
  assert.equal(result.params.limit, 100);
});

test("large trades empty DB", async () => {
  clearHistoryQueryCacheForTests();
  const payload = await queryHistoricalLargeTrades({
    client: fakeClient({ largeRows: [] }),
    symbol: "BTCUSDT",
    window: "4h",
    minNotional: 25_000,
    limit: 50,
    now: 1_700_000_000_000,
  });
  assert.deepEqual(payload.rows, []);
  assert.equal(payload.totalCount, 0);
});

test("route files exist and avoid secret leakage patterns", () => {
  const flowRoute = readFileSync(
    join(ROOT, "app/api/market-depth/history/flow/route.js"),
    "utf8",
  );
  const largeRoute = readFileSync(
    join(ROOT, "app/api/market-depth/history/large-trades/route.js"),
    "utf8",
  );
  assert.match(flowRoute, /marketHistoryLimiter/);
  assert.match(largeRoute, /marketHistoryLimiter/);
  assert.doesNotMatch(flowRoute, /SERVICE_ROLE_KEY/);
  assert.doesNotMatch(largeRoute, /console\.log/);
});

test("rate limit wired", () => {
  const source = readFileSync(join(ROOT, "lib/rate-limit.js"), "utf8");
  assert.match(source, /marketHistoryLimiter/);
});

test("history query client uses NEXT_PUBLIC_SUPABASE_URL fallback", () => {
  const prevPublic = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevPrivate = process.env.SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  try {
    const client = createHistoryQueryClient({ serviceKey: "test-service-key" });
    assert.equal(client.url, "https://example.supabase.co");
  } finally {
    if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevPublic;
    if (prevPrivate === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevPrivate;
  }
});

console.log(`market-history-api tests passed: ${passed}/${passed}`);
