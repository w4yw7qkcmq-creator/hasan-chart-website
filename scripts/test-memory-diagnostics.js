import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import {
  MEMORY_DIAGNOSTICS_FIELDS,
  MEMORY_DIAGNOSTICS_INTERVAL_MS,
  WEBSITE_ROUTE_COUNT_KEYS,
  buildMemoryDiagnosticsSample,
  formatMemoryDiagnosticsLog,
  installWebsiteRequestCounter,
  isMemoryDiagnosticsEnabled,
  readProductionComponentCounts,
  readWebsiteRouteCounts,
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
    "routeCounts",
  ]);

  assert.deepEqual(Object.keys(parsed).filter((key) => !allowed.has(key)), []);
  for (const field of MEMORY_DIAGNOSTICS_FIELDS) {
    assert.ok(parsed[field] === null || Number.isFinite(parsed[field]));
  }
  assert.deepEqual(Object.keys(parsed.routeCounts), WEBSITE_ROUTE_COUNT_KEYS);
  for (const key of WEBSITE_ROUTE_COUNT_KEYS) {
    assert.equal(Number.isInteger(parsed.routeCounts[key]), true);
    assert.ok(parsed.routeCounts[key] >= 0);
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
  assert.equal(edgeBlock.includes("installWebsiteRequestCounter"), false);
  assert.equal(nodeBlock.split("startMemoryDiagnostics(").length - 1, 1);
  assert.equal(nodeBlock.split("installWebsiteRequestCounter(").length - 1, 1);
  assert.ok(nodeBlock.includes('process.env["MEMORY_DIAGNOSTICS"] === "1"'));
  assert.ok(nodeBlock.indexOf("MEMORY_DIAGNOSTICS") < nodeBlock.indexOf("installWebsiteRequestCounter("));
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

{
  const http = createRequire("/")("http");
  const originalEmit = http.Server.prototype.emit;
  delete http.Server.prototype.__hcWebsiteRequestCounterInstalled;
  delete globalThis.__hcWebsiteRequestCounterInstalled;
  delete globalThis.__hcWebsiteRouteCounts;

  const disabled = await installWebsiteRequestCounter({ env: {} });
  assert.deepEqual(disabled, { installed: false, reason: "disabled" });
  assert.equal(globalThis.__hcWebsiteRouteCounts, undefined);
  assert.equal(http.Server.prototype.emit, originalEmit);

  let installFailed = false;
  try {
    await installWebsiteRequestCounter({
      env: { MEMORY_DIAGNOSTICS: "1" },
      loadHttp: async () => {
        throw new Error("secret-token /api/news?search=gold");
      },
    });
  } catch (error) {
    installFailed = true;
    assert.equal(error.message.includes("secret-token"), true);
  }
  assert.equal(installFailed, true);
  assert.equal(globalThis.__hcWebsiteRequestCounterInstalled, undefined);
  assert.equal(globalThis.__hcWebsiteRouteCounts, undefined);
  const failureLog = JSON.stringify({ level: "error", event: "memory_diagnostics_failed" });
  assert.equal(failureLog.includes("secret-token"), false);
  assert.equal(failureLog.includes("gold"), false);

  let intervals = 0;
  const originalSetInterval = globalThis.setInterval;
  globalThis.setInterval = (...args) => {
    intervals += 1;
    return originalSetInterval(...args);
  };
  const first = await installWebsiteRequestCounter({ env: { MEMORY_DIAGNOSTICS: "1" } });
  const wrappedEmit = http.Server.prototype.emit;
  const second = await installWebsiteRequestCounter({ env: { MEMORY_DIAGNOSTICS: "1" } });
  globalThis.setInterval = originalSetInterval;
  assert.deepEqual(first, { installed: true, reason: "installed" });
  assert.deepEqual(second, { installed: true, reason: "already_installed" });
  assert.equal(http.Server.prototype.emit, wrappedEmit);
  assert.notEqual(wrappedEmit, originalEmit);
  assert.equal(intervals, 0);
  assert.equal(Object.isSealed(globalThis.__hcWebsiteRouteCounts), true);

  try {
    const bare = new http.Server();
    let context = null;
    let args = null;
    bare.on("request", function onRequest(...received) {
      context = this;
      args = received;
    });
    const response = { untouched: true };
    const request = {
      method: "GET",
      url: "/api/health?token=secret-token",
    };
    const returned = bare.emit("request", request, response, "tail");
    assert.equal(returned, true);
    assert.equal(context, bare);
    assert.equal(args[0], request);
    assert.equal(args[1], response);
    assert.equal(args[2], "tail");
    assert.equal(response.untouched, true);
    assert.equal(request.url, "/api/health?token=secret-token");
    assert.equal(readWebsiteRouteCounts()["GET /api/health"], 1);

    const beforeOther = readWebsiteRouteCounts().OTHER;
    bare.emit("not-a-request", { method: "GET", url: "/api/health" });
    assert.equal(readWebsiteRouteCounts()["GET /api/health"], 1);
    assert.equal(readWebsiteRouteCounts().OTHER, beforeOther);

    let listenerRan = false;
    bare.on("request", () => {
      listenerRan = true;
    });
    const throwing = {
      method: "GET",
      get url() {
        throw new Error("secret-token /private/raw-path");
      },
    };
    const safeResponse = { untouched: true };
    const afterThrow = bare.emit("request", throwing, safeResponse);
    assert.equal(afterThrow, true);
    assert.equal(listenerRan, true);
    assert.equal(safeResponse.untouched, true);
    assert.equal(readWebsiteRouteCounts()["GET /api/health"], 1);

    const outgoingBefore = readWebsiteRouteCounts();
    await new Promise((resolve) => {
      const outgoing = http.request({
        hostname: "127.0.0.1",
        port: 1,
        method: "GET",
        path: "/api/health?token=secret-token",
      });
      outgoing.on("error", () => resolve());
      outgoing.end();
    });
    assert.deepEqual(readWebsiteRouteCounts(), outgoingBefore);

    function send(port, method, path, body) {
      return new Promise((resolve, reject) => {
        const req = http.request(
          { hostname: "127.0.0.1", port, method, path },
          (res) => {
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => {
              resolve({
                status: res.statusCode,
                marker: res.headers["x-marker"],
                body: Buffer.concat(chunks).toString("utf8"),
              });
            });
          }
        );
        req.on("error", reject);
        req.end(body);
      });
    }

    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if ((req.url || "").startsWith("/api/market-stream")) {
          res.writeHead(200, { "content-type": "text/event-stream", "x-marker": "sse" });
          res.write("data: one\n\n");
          res.write("data: tick\n\n");
          res.end();
          return;
        }
        if ((req.url || "").startsWith("/api/market-depth/stream")) {
          res.writeHead(200, { "content-type": "text/plain", "x-marker": "depth" });
          res.write("hello-");
          res.end("stream");
          return;
        }
        const pathname = (req.url || "").split("?")[0];
        const authed =
          pathname === "/login" ||
          pathname.startsWith("/login/") ||
          pathname === "/admin" ||
          pathname.startsWith("/admin/") ||
          pathname === "/api/admin" ||
          pathname.startsWith("/api/admin/") ||
          pathname === "/api/iam" ||
          pathname.startsWith("/api/iam/") ||
          pathname === "/api/admin-reply";
        res.writeHead(authed ? 401 : 200, { "content-type": "text/plain", "x-marker": "plain" });
        res.end(body || "empty");
      });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    const before = readWebsiteRouteCounts();

    const health = await send(port, "GET", "/api/health");
    const news = await send(port, "GET", "/api/news?search=gold-secret-query&token=secret-token");
    const dynamic = await send(port, "GET", "/api/news/abc-secret-id?x=secret-token");
    const denied = await send(port, "POST", "/api/admin/users?token=secret-token", "secret-token-body");
    const login = await send(port, "GET", "/login?returnUrl=/admin/secret-token");
    const iam = await send(port, "GET", "/api/iam/roles/secret-token");
    const depth = await send(port, "GET", "/api/market-depth/stream");
    const sse = await send(port, "GET", "/api/market-stream");
    const unknown = await send(port, "GET", "/api/not-a-route/secret-token?q=gold");

    assert.deepEqual(health, { status: 200, marker: "plain", body: "empty" });
    assert.deepEqual(news, { status: 200, marker: "plain", body: "empty" });
    assert.deepEqual(dynamic, { status: 200, marker: "plain", body: "empty" });
    assert.deepEqual(denied, { status: 401, marker: "plain", body: "secret-token-body" });
    assert.deepEqual(login, { status: 401, marker: "plain", body: "empty" });
    assert.deepEqual(iam, { status: 401, marker: "plain", body: "empty" });
    assert.deepEqual(depth, { status: 200, marker: "depth", body: "hello-stream" });
    assert.deepEqual(sse, { status: 200, marker: "sse", body: "data: one\n\ndata: tick\n\n" });
    assert.deepEqual(unknown, { status: 200, marker: "plain", body: "empty" });

    const afterSingles = readWebsiteRouteCounts();
    assert.equal(afterSingles["GET /api/health"] - before["GET /api/health"], 1);
    assert.equal(afterSingles["GET /api/news"] - before["GET /api/news"], 1);
    assert.equal(afterSingles["GET /api/market-depth/stream"] - before["GET /api/market-depth/stream"], 1);
    assert.equal(afterSingles["GET /api/market-stream"] - before["GET /api/market-stream"], 1);
    assert.equal(afterSingles.AUTH - before.AUTH, 3);
    assert.equal(afterSingles.OTHER - before.OTHER, 2);

    const beforeConcurrent = readWebsiteRouteCounts();
    const concurrent = await Promise.all(
      Array.from({ length: 40 }, () => send(port, "GET", "/api/health?token=secret-token"))
    );
    assert.equal(concurrent.every((item) => item.status === 200 && item.body === "empty"), true);
    assert.equal(readWebsiteRouteCounts()["GET /api/health"] - beforeConcurrent["GET /api/health"], 40);

    const beforeUnique = readWebsiteRouteCounts();
    for (let offset = 0; offset < 2000; offset += 100) {
      await Promise.all(
        Array.from({ length: 100 }, (_, index) => {
          const id = `path-${offset + index}-secret-token`;
          return send(port, "GET", `/api/news/${id}?search=gold-secret-query&n=${offset + index}`);
        })
      );
    }
    const afterUnique = readWebsiteRouteCounts();
    assert.equal(afterUnique.OTHER - beforeUnique.OTHER, 2000);
    assert.equal(afterUnique["GET /api/news"], beforeUnique["GET /api/news"]);
    assert.deepEqual(Object.keys(afterUnique), WEBSITE_ROUTE_COUNT_KEYS);
    assert.equal(Object.isSealed(globalThis.__hcWebsiteRouteCounts), true);
    const serializedCounts = JSON.stringify(afterUnique);
    assert.equal(serializedCounts.includes("secret-token"), false);
    assert.equal(serializedCounts.includes("gold-secret-query"), false);
    assert.equal(serializedCounts.includes("abc-secret-id"), false);
    assert.equal(Buffer.byteLength(serializedCounts) < 300, true);

    const beforeSample = readWebsiteRouteCounts();
    const lines = [];
    await sampleMemoryDiagnostics({
      logger: (line) => lines.push(line),
      now: () => new Date("2026-11-16T00:00:00.000Z"),
      memoryUsage: () => ({
        rss: 9,
        heapUsed: 8,
        heapTotal: 7,
        external: 6,
        arrayBuffers: 5,
      }),
      readCounts: async () => ({
        albumTimers: 0,
        okxSubscribers: 0,
        okxConnections: 0,
        okxReconnects: 0,
        registryEntries: 0,
        readApiCacheEntries: 0,
        routeCounts: { "/api/news?search=gold-secret-query": 9, OTHER: "secret-token" },
        token: "secret-token",
      }),
    });
    const parsed = assertSafeLog(lines[0]);
    assert.deepEqual(parsed.routeCounts, beforeSample);
    assert.deepEqual(readWebsiteRouteCounts(), beforeSample);
    assert.equal(lines[0].includes("gold-secret-query"), false);
    assert.equal(lines[0].includes("secret-token"), false);
    assert.equal(lines[0].includes("abc-secret-id"), false);
    assert.equal(lines[0].includes("routeCountOverflow"), false);

    server.close();
  } finally {
    http.Server.prototype.emit = originalEmit;
    delete http.Server.prototype.__hcWebsiteRequestCounterInstalled;
    delete globalThis.__hcWebsiteRequestCounterInstalled;
    delete globalThis.__hcWebsiteRouteCounts;
  }
}

console.log("memory diagnostics tests passed");
