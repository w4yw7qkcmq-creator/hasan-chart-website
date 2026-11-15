import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MEMORY_DIAGNOSTICS_FIELDS,
  MEMORY_DIAGNOSTICS_INTERVAL_MS,
  buildMemoryDiagnosticsSample,
  formatMemoryDiagnosticsLog,
  isMemoryDiagnosticsEnabled,
  readProductionComponentCounts,
  sampleMemoryDiagnostics,
  startMemoryDiagnostics,
  stopMemoryDiagnostics,
} from "../lib/memory-diagnostics.js";
import {
  getMarketStreamHub,
  readMarketStreamResourceCounts,
} from "../lib/okx-market-stream.js";
import {
  cancelAlbumGroupTimer,
  clearAlbumTimerRegistryForTests,
  getAlbumTimerRegistrySize,
  scheduleAlbumGroupFinalization,
} from "../lib/telegram-content/album-liveness-scheduler.js";
import { getSymbolRegistryHealth } from "../lib/market-data/symbol-registry.js";
import {
  readReadApiCacheEntryCount,
  withReadCache,
} from "../lib/server-read-cache.js";

const FORBIDDEN = [
  "BTCUSDT",
  "telegram secret text",
  "user@example.com",
  "secret-token",
  "mediaGroup",
];

function assertSafeLog(line) {
  const parsed = JSON.parse(line);
  const allowed = new Set([
    "level",
    "event",
    "at",
    "intervalMs",
    ...MEMORY_DIAGNOSTICS_FIELDS,
  ]);

  assert.deepEqual(Object.keys(parsed).filter((key) => !allowed.has(key)), []);
  for (const field of MEMORY_DIAGNOSTICS_FIELDS) {
    assert.ok(parsed[field] === null || Number.isFinite(parsed[field]));
  }
  for (const secret of FORBIDDEN) {
    assert.equal(line.includes(secret), false);
  }
  return parsed;
}

function fakeTimer() {
  const calls = [];
  return {
    calls,
    setIntervalImpl(callback, delay) {
      calls.push({ callback, delay });
      return { unref() {}, id: calls.length };
    },
  };
}

delete globalThis.__okxMarketStreamHub;
delete globalThis.__hcMemoryDiagnostics;
clearAlbumTimerRegistryForTests();

assert.equal(isMemoryDiagnosticsEnabled({}), false);
assert.equal(isMemoryDiagnosticsEnabled({ MEMORY_DIAGNOSTICS: "0" }), false);
assert.equal(isMemoryDiagnosticsEnabled({ MEMORY_DIAGNOSTICS: "true" }), false);
assert.equal(isMemoryDiagnosticsEnabled({ MEMORY_DIAGNOSTICS: "1" }), true);

{
  const timer = fakeTimer();
  let reads = 0;
  const disabled = startMemoryDiagnostics({
    env: {},
    setIntervalImpl: timer.setIntervalImpl,
    readCounts: async () => {
      reads += 1;
      return {};
    },
  });
  assert.deepEqual(disabled, { started: false, reason: "disabled" });
  assert.equal(timer.calls.length, 0);
  assert.equal(reads, 0);
  assert.equal(globalThis.__hcMemoryDiagnostics, undefined);
}

{
  const timer = fakeTimer();
  const first = startMemoryDiagnostics({
    env: { MEMORY_DIAGNOSTICS: "1" },
    setIntervalImpl(callback, delay) {
      const nested = startMemoryDiagnostics({
        env: { MEMORY_DIAGNOSTICS: "1" },
        setIntervalImpl: timer.setIntervalImpl,
      });
      assert.deepEqual(nested, { started: false, reason: "already_running" });
      return timer.setIntervalImpl(callback, delay);
    },
  });
  const second = startMemoryDiagnostics({
    env: { MEMORY_DIAGNOSTICS: "1" },
    setIntervalImpl: timer.setIntervalImpl,
  });

  assert.deepEqual(first, { started: true, reason: "started" });
  assert.deepEqual(second, { started: false, reason: "already_running" });
  assert.equal(timer.calls.length, 1);
  assert.equal(timer.calls[0].delay, MEMORY_DIAGNOSTICS_INTERVAL_MS);
  assert.equal(MEMORY_DIAGNOSTICS_INTERVAL_MS, 900000);
  stopMemoryDiagnostics();
  assert.equal(globalThis.__hcMemoryDiagnostics, undefined);
}

{
  const lines = [];
  await sampleMemoryDiagnostics({
    logger: (line) => lines.push(line),
    now: () => new Date("2026-11-14T00:00:00.000Z"),
    memoryUsage: () => ({
      rss: 1024,
      heapUsed: 512,
      heapTotal: 2048,
      external: 32,
      arrayBuffers: 8,
      note: "telegram secret text",
    }),
    readCounts: async () => ({
      albumTimers: 2,
      okxSubscribers: 1,
      okxConnections: 1,
      okxReconnects: 4,
      registryEntries: 30,
      prices: { BTCUSDT: "12345.67" },
      message: "telegram secret text",
      email: "user@example.com",
      token: "secret-token",
      mediaGroupId: "mediaGroup",
    }),
  });

  assert.equal(lines.length, 1);
  const parsed = assertSafeLog(lines[0]);
  assert.equal(parsed.event, "memory_diagnostics");
  assert.equal(parsed.at, "2026-11-14T00:00:00.000Z");
  assert.equal(parsed.intervalMs, 900000);
  assert.equal(parsed.rss, 1024);
  assert.equal(parsed.heapUsed, 512);
  assert.equal(parsed.heapTotal, 2048);
  assert.equal(parsed.external, 32);
  assert.equal(parsed.arrayBuffers, 8);
  assert.equal(parsed.albumTimers, 2);
  assert.equal(parsed.okxSubscribers, 1);
  assert.equal(parsed.okxConnections, 1);
  assert.equal(parsed.okxReconnects, 4);
  assert.equal(parsed.registryEntries, 30);
  assert.equal(parsed.readApiCacheEntries, null);
}

{
  const sample = buildMemoryDiagnosticsSample(
    { rss: Number.NaN, heapUsed: Infinity, heapTotal: "2048" },
    { albumTimers: "telegram secret text", okxSubscribers: -1 }
  );
  const line = formatMemoryDiagnosticsLog(sample, "2026-11-14T00:15:00.000Z");
  const parsed = assertSafeLog(line);
  assert.equal(parsed.rss, null);
  assert.equal(parsed.heapUsed, null);
  assert.equal(parsed.heapTotal, null);
  assert.equal(parsed.albumTimers, null);
  assert.equal(parsed.okxSubscribers, -1);
}

{
  const lines = [];
  await sampleMemoryDiagnostics({
    logger: (line) => lines.push(line),
    memoryUsage: () => {
      throw new Error("user@example.com secret-token");
    },
    readCounts: async () => {
      throw new Error("telegram secret text BTCUSDT");
    },
  });
  assert.deepEqual(JSON.parse(lines[0]), {
    level: "error",
    event: "memory_diagnostics_failed",
  });
  assert.equal(lines[0].includes("user@example.com"), false);
  assert.equal(lines[0].includes("BTCUSDT"), false);
}

{
  assert.equal(globalThis.__okxMarketStreamHub, undefined);
  assert.deepEqual(readMarketStreamResourceCounts(), {
    subscribers: 0,
    connections: 0,
    reconnects: 0,
  });
  assert.equal(globalThis.__okxMarketStreamHub, undefined);

  const hub = getMarketStreamHub();
  const before = hub.getSnapshot();
  const callback = () => {};
  hub.subscribers.add(callback);
  hub.reconnectAttempt = 3;

  const counts = hub.getResourceCounts();
  const after = hub.getSnapshot();

  assert.deepEqual(counts, { subscribers: 1, connections: 0, reconnects: 3 });
  assert.deepEqual(readMarketStreamResourceCounts(), counts);
  assert.deepEqual(after.prices, before.prices);
  assert.equal(after.status, before.status);
  assert.equal(after.messagesReceived, before.messagesReceived);
  assert.equal(hub.ws, null);
  assert.equal(hub.started, false);
  assert.equal(hub.reconnectTimer, null);
  assert.equal(hub.pingTimer, null);

  hub.subscribers.delete(callback);
  hub.reconnectAttempt = 0;
  assert.equal(readMarketStreamResourceCounts().subscribers, 0);
  delete globalThis.__okxMarketStreamHub;
}

{
  const registryBefore = getSymbolRegistryHealth();
  const albumBefore = getAlbumTimerRegistrySize();
  const cacheBefore = globalThis.__hcReadApiCache;
  const cacheSizeBefore = cacheBefore?.size ?? 0;
  const counts = await readProductionComponentCounts();
  assert.equal(counts.albumTimers, albumBefore);
  assert.equal(counts.registryEntries, registryBefore.registrySymbolCount);
  assert.equal(counts.readApiCacheEntries, cacheSizeBefore);
  assert.equal(globalThis.__hcReadApiCache, cacheBefore);
  assert.equal(counts.okxSubscribers, 0);
  assert.equal(counts.okxConnections, 0);
  assert.equal(globalThis.__okxMarketStreamHub, undefined);

  const registryAfter = getSymbolRegistryHealth();
  assert.equal(registryAfter.registryRefreshInFlight, false);
  assert.equal(registryAfter.registrySymbolCount, registryBefore.registrySymbolCount);
  assert.equal(registryAfter.registryLastAttemptAt, registryBefore.registryLastAttemptAt);
  assert.equal(registryAfter.registryMode, registryBefore.registryMode);

  scheduleAlbumGroupFinalization(
    "channel-test",
    "group-test",
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  );
  assert.equal(getAlbumTimerRegistrySize(), albumBefore + 1);
  const scheduled = await readProductionComponentCounts();
  assert.equal(scheduled.albumTimers, albumBefore + 1);
  cancelAlbumGroupTimer("channel-test", "group-test");
  assert.equal(getAlbumTimerRegistrySize(), albumBefore);
  clearAlbumTimerRegistryForTests();
}

{
  const source = readFileSync(new URL("../instrumentation.js", import.meta.url), "utf8");
  const nodeBlock = source.slice(
    source.indexOf('NEXT_RUNTIME === "nodejs"'),
    source.indexOf('NEXT_RUNTIME === "edge"')
  );
  const edgeBlock = source.slice(source.indexOf('NEXT_RUNTIME === "edge"'));

  assert.equal(nodeBlock.includes("setInterval"), false);
  assert.equal(edgeBlock.includes("startMemoryDiagnostics"), false);
  assert.equal(nodeBlock.split("startMemoryDiagnostics(").length - 1, 1);
  assert.ok(nodeBlock.includes('process.env["MEMORY_DIAGNOSTICS"] === "1"'));
  assert.ok(nodeBlock.indexOf("warmupSymbolRegistry") < nodeBlock.indexOf("MEMORY_DIAGNOSTICS"));
}

{
  const previousCache = globalThis.__hcReadApiCache;
  delete globalThis.__hcReadApiCache;

  assert.equal(readReadApiCacheEntryCount(), 0);
  assert.equal(globalThis.__hcReadApiCache, undefined);

  globalThis.__hcReadApiCache = new Map();
  assert.equal(readReadApiCacheEntryCount(), 0);
  assert.equal(globalThis.__hcReadApiCache.size, 0);

  const stored = { query: "user search gold", items: ["secret-token"] };
  globalThis.__hcReadApiCache.set("alpha", { data: stored, expiresAt: Date.now() + 60000 });
  assert.equal(readReadApiCacheEntryCount(), 1);
  assert.equal(globalThis.__hcReadApiCache.get("alpha").data, stored);

  delete globalThis.__hcReadApiCache;
  const repeated = await withReadCache("alpha", 60000, async () => ({ query: "user search gold" }));
  const repeatedHit = await withReadCache("alpha", 60000, async () => ({ query: "should-not-run" }));
  assert.equal(repeated.cacheHit, false);
  assert.equal(repeatedHit.cacheHit, true);
  assert.equal(repeatedHit.data.query, "user search gold");
  assert.equal(readReadApiCacheEntryCount(), 1);

  await withReadCache("beta", 60000, async () => ({ query: "silver query" }));
  assert.equal(readReadApiCacheEntryCount(), 2);

  const lines = [];
  await sampleMemoryDiagnostics({
    logger: (line) => lines.push(line),
    now: () => new Date("2026-11-14T00:30:00.000Z"),
    memoryUsage: () => ({
      rss: 4,
      heapUsed: 3,
      heapTotal: 5,
      external: 2,
      arrayBuffers: 1,
    }),
    readCounts: async () => ({
      albumTimers: 0,
      okxSubscribers: 0,
      okxConnections: 0,
      okxReconnects: 0,
      registryEntries: 0,
      readApiCacheEntries: readReadApiCacheEntryCount(),
      query: "user search gold",
    }),
  });
  const parsed = assertSafeLog(lines[0]);
  assert.equal(parsed.readApiCacheEntries, 2);
  assert.equal(lines[0].includes("user search gold"), false);
  assert.equal(lines[0].includes("alpha"), false);
  assert.equal(lines[0].includes("silver query"), false);

  if (previousCache) globalThis.__hcReadApiCache = previousCache;
  else delete globalThis.__hcReadApiCache;
}

console.log("memory diagnostics tests passed");
