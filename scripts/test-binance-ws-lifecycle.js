import assert from "node:assert/strict";
import { register } from "node:module";

register(new URL("./binance-ws-test-loader.mjs", import.meta.url), import.meta.url);

const { openSockets } = await import("./binance-ws-test-socket.mjs");
const { BinanceOrderBookConnection } = await import("../lib/market-data/exchanges/binance.js");
const { WS_BACKOFF_MS } = await import("../lib/market-data/constants.js");

const timers = new Map();
let timerSeq = 1;
global.setTimeout = (fn, ms) => {
  const id = timerSeq++;
  timers.set(id, { fn, ms });
  return id;
};
global.clearTimeout = (id) => {
  timers.delete(id);
};

const logCounts = {};
const writeLog = console.log;
console.log = (...args) => {
  const phase = args[1] && typeof args[1] === "object" ? args[1].phase || args[0] : args[0];
  const key = String(phase);
  logCounts[key] = (logCounts[key] || 0) + 1;
};

const fetchState = {
  mode: "451",
  calls: 0,
  cancelled: 0,
  inflight: 0,
  release: null,
};

global.fetch = (_url) => {
  fetchState.calls += 1;
  fetchState.inflight += 1;
  const finish = (response) => {
    fetchState.inflight -= 1;
    return response;
  };
  if (fetchState.mode === "hang") {
    return new Promise((resolve) => {
      fetchState.release = () => {
        fetchState.mode = "451";
        resolve(finish(failureResponse()));
      };
    });
  }
  if (fetchState.mode === "hold-json") {
    fetchState.mode = "ok";
    return Promise.resolve(finish(heldSuccessResponse(fetchState.heldPayload)));
  }
  return Promise.resolve(finish(fetchState.mode === "ok" ? successResponse() : failureResponse()));
};

function failureResponse() {
  let cancelled = false;
  return {
    ok: false,
    status: 451,
    body: {
      cancel() {
        cancelled = true;
        fetchState.cancelled += 1;
        return Promise.resolve();
      },
    },
    async json() {
      if (cancelled) throw new Error("BODY_CANCELLED");
      return { code: 451 };
    },
  };
}

function successResponse() {
  const payload = fetchState.okPayload || {
    lastUpdateId: 100,
    bids: [["100", "1"]],
    asks: [["101", "2"]],
  };
  return {
    ok: true,
    status: 200,
    body: { cancel() { return Promise.resolve(); } },
    async json() {
      return payload;
    },
  };
}

function heldSuccessResponse(payload) {
  let resolveJson;
  const pending = new Promise((resolve) => {
    resolveJson = resolve;
  });
  fetchState.releaseJson = () => resolveJson(payload);
  return {
    ok: true,
    status: 200,
    body: { cancel() { return Promise.resolve(); } },
    json() {
      return pending;
    },
  };
}

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve));
}

function reconnectTimers() {
  return [...timers.values()].filter((timer) => timer.ms !== 8000);
}

function flushReconnect() {
  const entry = [...timers.entries()].find(([, timer]) => timer.ms !== 8000);
  if (!entry) return null;
  timers.delete(entry[0]);
  const delay = entry[1].ms;
  entry[1].fn();
  return delay;
}

function sample(label) {
  if (typeof global.gc === "function") global.gc();
  const memory = process.memoryUsage();
  const round = (value) => Math.round((value / 1048576) * 1000) / 1000;
  return {
    label,
    heap: round(memory.heapUsed),
    rss: round(memory.rss),
    external: round(memory.external),
    arrayBuffers: round(memory.arrayBuffers),
    openSockets: openSockets.size,
    timers: reconnectTimers().length,
    inflight: fetchState.inflight,
  };
}

async function settleOpen() {
  await flushMicrotasks();
  await flushMicrotasks();
}

function createConnection(symbol, updates = []) {
  return new BinanceOrderBookConnection({
    siteSymbol: symbol,
    onUpdate(snapshot) {
      updates.push(snapshot);
    },
    onTrade() {},
  });
}

async function failCycles(connection, count) {
  const delays = [];
  for (let index = 0; index < count; index += 1) {
    await settleOpen();
    const delay = flushReconnect();
    delays.push(delay);
  }
  return delays;
}

const results = {};

fetchState.mode = "451";
const one = createConnection("BTCUSDT");
one.incrementSubscribers();
const delays40 = await failCycles(one, 40);
assert.equal(openSockets.size, 1);
assert.equal(reconnectTimers().length, 0);
assert.ok(delays40[0] >= WS_BACKOFF_MS[0] && delays40[0] < WS_BACKOFF_MS[0] * 1.25);
assert.ok(delays40[4] >= WS_BACKOFF_MS[4] && delays40[4] < WS_BACKOFF_MS[4] * 1.25);
assert.equal(one.reconnectAttempt, 40);
one.shutdown();
assert.equal(openSockets.size, 0);
assert.equal(one.reconnectTimer, null);
results.failures40 = { openSockets: 0, finalDelay: delays40[39], logs: logCounts["snapshot_failure"] };

const before100 = sample("before 100");
const two = createConnection("ETHUSDT");
two.incrementSubscribers();
const delays100 = await failCycles(two, 100);
const after100 = sample("after 100");
assert.equal(openSockets.size, 1);
assert.equal(reconnectTimers().length, 0);
assert.ok(delays100[99] >= WS_BACKOFF_MS[4]);
assert.equal(two.ownedSockets.size, 1);
two.shutdown();
const afterShutdown = sample("after shutdown");
assert.equal(openSockets.size, 0);
assert.equal(two.ownedSockets.size, 0);
results.memory = { before100, after100, afterShutdown };

fetchState.mode = "451";
const recoveryUpdates = [];
const recovery = createConnection("SOLUSDT", recoveryUpdates);
recovery.incrementSubscribers();
await settleOpen();
const firstDelay = flushReconnect();
await settleOpen();
fetchState.mode = "ok";
const secondDelay = flushReconnect();
await settleOpen();
assert.equal(recovery.reconnectAttempt, 0);
assert.equal(recovery.snapshotReceived, true);
recovery.ws.emit("message", JSON.stringify({
  data: { e: "depthUpdate", U: 101, u: 101, b: [["100", "2"]], a: [["101", "1"]] },
}));
const live = recoveryUpdates.at(-1);
assert.equal(live.symbol, "SOLUSDT");
assert.equal(live.synced, true);
assert.ok(live.bids.length > 0);
const sseLine = `data: ${JSON.stringify({ success: true, ...live })}\n\n`;
const parsed = JSON.parse(sseLine.slice(6).trim());
assert.equal(parsed.success, true);
assert.equal(parsed.symbol, "SOLUSDT");
assert.ok(parsed.bids.length > 0);
recovery.shutdown();
assert.equal(openSockets.size, 0);
results.recovery = { firstDelay, secondDelay, synced: live.synced, sse: true };

fetchState.mode = "hang";
const hanging = createConnection("XRPUSDT");
hanging.incrementSubscribers();
await settleOpen();
assert.equal(fetchState.inflight, 1);
hanging.shutdown();
fetchState.release();
await settleOpen();
assert.equal(hanging.reconnectTimer, null);
assert.equal(openSockets.size, 0);
assert.equal(hanging.closedByShutdown, true);
results.shutdownDuringSnapshot = { inflightAfter: fetchState.inflight, cancelled: fetchState.cancelled > 0 };

fetchState.mode = "451";
const stale = createConnection("BTCUSDT");
stale.incrementSubscribers();
const firstSocket = stale.ws;
stale.connect();
const secondSocket = stale.ws;
assert.notEqual(firstSocket, secondSocket);
firstSocket.emit("close", 1006, Buffer.from("stale"));
assert.equal(stale.ws, secondSocket);
assert.equal(reconnectTimers().length, 0);
stale.shutdown();
results.staleClose = { keptNewerSocket: true };

const quiet = createConnection("BTCUSDT");
quiet.incrementSubscribers();
await settleOpen();
flushReconnect();
quiet.decrementSubscribers();
assert.equal(quiet.subscribers, 0);
assert.equal(quiet.closedByShutdown, true);
assert.equal(quiet.reconnectTimer, null);
assert.equal(openSockets.size, 0);
quiet.scheduleReconnect("after_zero");
assert.equal(quiet.reconnectTimer, null);
results.zeroSubscribers = true;

const alphaUpdates = [];
const betaUpdates = [];
const alpha = createConnection("BTCUSDT", alphaUpdates);
const beta = createConnection("ETHUSDT", betaUpdates);
alpha.incrementSubscribers();
beta.incrementSubscribers();
assert.equal(openSockets.size, 2);
alpha.shutdown();
assert.equal(beta.ownedSockets.size, 1);
assert.notEqual(beta.ws, null);
beta.shutdown();
assert.equal(openSockets.size, 0);
results.multipleSymbols = true;

const rapid = createConnection("BTCUSDT");
rapid.incrementSubscribers();
rapid.incrementSubscribers();
assert.equal(openSockets.size, 1);
assert.equal(rapid.subscribers, 2);
await settleOpen();
assert.equal(openSockets.size, 0);
rapid.connect();
rapid.connect();
assert.equal(rapid.ownedSockets.size, 1);
assert.equal(openSockets.size, 1);
rapid.scheduleReconnect("first");
const timer = rapid.reconnectTimer;
rapid.scheduleReconnect("second");
assert.equal(rapid.reconnectTimer, timer);
rapid.shutdown();
results.rapidReconnect = { owned: 1, duplicateTimer: false };

fetchState.mode = "451";
const syncedUpdates = [];
const again = createConnection("BTCUSDT", syncedUpdates);
again.incrementSubscribers();
await settleOpen();
flushReconnect();
await settleOpen();
const attemptBeforeSuccess = again.reconnectAttempt;
assert.ok(attemptBeforeSuccess > 0);
fetchState.mode = "ok";
fetchState.okPayload = undefined;
flushReconnect();
await settleOpen();
assert.equal(again.snapshotReceived, true);
assert.equal(again.reconnectAttempt, 0);
again.ws.emit("message", JSON.stringify({
  data: { e: "depthUpdate", U: 101, u: 101, b: [["100", "4"]], a: [["101", "4"]] },
}));
assert.equal(syncedUpdates.at(-1).synced, true);
assert.equal(syncedUpdates.at(-1).bids[0].price, 100);
again.shutdown();
results.failureThenSuccess = { attemptBeforeSuccess, synced: true };

fetchState.mode = "hold-json";
fetchState.heldPayload = { lastUpdateId: 1, bids: [["50", "9"]], asks: [["51", "9"]] };
const replacementUpdates = [];
const replaced = createConnection("BTCUSDT", replacementUpdates);
replaced.incrementSubscribers();
await settleOpen();
assert.equal(replaced.snapshotReceived, false);
fetchState.okPayload = { lastUpdateId: 200, bids: [["300", "3"]], asks: [["301", "4"]] };
replaced.connect();
await settleOpen();
assert.equal(replaced.snapshotLastUpdateId, 200);
assert.equal(replacementUpdates.at(-1).bids[0].price, 300);
const updatesAfterCurrent = replacementUpdates.length;
replaced.reconnectAttempt = 4;
replaced.pinnedRestBaseIndex = 2;
fetchState.releaseJson();
await settleOpen();
assert.equal(replaced.snapshotLastUpdateId, 200);
assert.equal(replaced.getConnectionSnapshot().bids[0].price, 300);
assert.equal(replaced.reconnectAttempt, 4);
assert.equal(replaced.pinnedRestBaseIndex, 2);
assert.equal(replacementUpdates.length, updatesAfterCurrent);
assert.equal(reconnectTimers().length, 0);
replaced.shutdown();
fetchState.okPayload = undefined;
results.staleAfterReplacement = true;

fetchState.mode = "hold-json";
fetchState.heldPayload = { lastUpdateId: 9, bids: [["9", "9"]], asks: [["10", "9"]] };
const shutdownUpdates = [];
const stopping = createConnection("ETHUSDT", shutdownUpdates);
stopping.incrementSubscribers();
await settleOpen();
stopping.shutdown();
fetchState.releaseJson();
await settleOpen();
assert.equal(stopping.snapshotReceived, false);
assert.equal(stopping.snapshotLastUpdateId, null);
assert.equal(shutdownUpdates.length, 0);
assert.equal(stopping.reconnectTimer, null);
assert.equal(openSockets.size, 0);
assert.equal(reconnectTimers().length, 0);
results.staleAfterShutdown = true;

fetchState.mode = "451";
const repeated = createConnection("BTCUSDT");
repeated.incrementSubscribers();
repeated.shutdown();
repeated.shutdown();
assert.equal(repeated.ownedSockets.size, 0);
assert.equal(repeated.reconnectTimer, null);
assert.equal(repeated.connectTimeoutTimer, null);
assert.equal(openSockets.size, 0);
results.repeatedShutdown = true;

const logLines = Object.values(logCounts).reduce((sum, value) => sum + value, 0);
results.logging = {
  snapshotFailures: logCounts.snapshot_failure,
  reconnectScheduled: logCounts.reconnect_scheduled,
  totalLines: logLines,
  cappedDelay: WS_BACKOFF_MS[4],
};

writeLog(JSON.stringify(results, null, 2));
writeLog("binance websocket lifecycle tests passed");
