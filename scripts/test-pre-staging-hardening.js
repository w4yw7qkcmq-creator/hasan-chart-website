import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSymbolChangeRateLimiter,
  SYMBOL_CHANGE_RATE_LIMIT_MESSAGE,
} from "../lib/market-data/symbol-change-rate-limit.js";
import { DynamicSymbolManager } from "../lib/market-data/dynamic-symbol-manager.js";
import { seedSymbolRegistryForTests, resetSymbolRegistryForTests } from "../lib/market-data/symbol-registry.js";
import { BybitOrderBookConnection } from "../lib/market-data/exchanges/bybit.js";
import { OkxOrderBookConnection } from "../lib/market-data/exchanges/okx.js";
import { BinanceOrderBookConnection } from "../lib/market-data/exchanges/binance.js";

const page = readFileSync(join(process.cwd(), "app/components/order-book/OrderBookPageContent.js"), "utf8");
const hook = readFileSync(join(process.cwd(), "app/hooks/useMarketDepthStream.js"), "utf8");

let now = 1_000_000;
const limiter = createSymbolChangeRateLimiter({ now: () => now });

const symbols = [
  "SYM01USDT",
  "SYM02USDT",
  "SYM03USDT",
  "SYM04USDT",
  "SYM05USDT",
  "SYM06USDT",
  "SYM07USDT",
  "SYM08USDT",
  "SYM09USDT",
  "SYM10USDT",
  "SYM11USDT",
];

for (const symbol of symbols.slice(0, 10)) {
  const check = limiter.canChange(symbol);
  assert.equal(check.allowed, true, `change ${symbol} should be allowed`);
  limiter.recordChange(symbol);
}

assert.equal(limiter.getChangeCount(), 10);

const eleventh = limiter.canChange("SYM11USDT");
assert.equal(eleventh.allowed, false);
assert.equal(eleventh.reason, "RATE_LIMIT");
assert.match(eleventh.message, /10 تغييرات/);

const duplicate = limiter.canChange("SYM01USDT");
assert.equal(duplicate.allowed, true);
assert.equal(duplicate.duplicate, true);
assert.equal(limiter.getChangeCount(), 10);

now += 60_001;
assert.equal(limiter.getChangeCount(), 0);
const afterWindow = limiter.canChange("SYM11USDT");
assert.equal(afterWindow.allowed, true);

limiter.reset();
now = 2_000_000;
limiter.recordChange("DOGEUSDT");
limiter.recordChange("DOGEUSDT");
assert.equal(limiter.getChangeCount(), 1);

assert.match(SYMBOL_CHANGE_RATE_LIMIT_MESSAGE, /تجاوزت الحد المسموح/);

assert.match(page, /الرمز المطلوب غير متاح حاليًا، تم الرجوع إلى BTC\/USDT\./);
assert.match(page, /تعذّر تحميل قائمة العملات حاليًا\. العملات الأساسية فقط متاحة مؤقتًا\./);
assert.match(page, /router\.replace\("\/order-book\?symbol=BTCUSDT"/);
assert.match(page, /source: "fallback"/);
assert.match(page, /symbolRateLimitMessage/);

assert.match(hook, /createSymbolChangeRateLimiter/);
assert.match(hook, /source === "user"/);
assert.match(hook, /symbolRateLimitMessage/);

resetSymbolRegistryForTests();
seedSymbolRegistryForTests([
  {
    symbol: "DOGEUSDT",
    base: "DOGE",
    quote: "USDT",
    displaySymbol: "DOGE/USDT",
    displayName: "Dogecoin",
    exchanges: {
      binance: { supported: true, marketSymbol: "DOGEUSDT" },
      bybit: { supported: true, marketSymbol: "DOGEUSDT" },
      okx: { supported: true, marketSymbol: "DOGE-USDT" },
    },
    supportedExchangeCount: 3,
    supportedExchanges: ["binance", "bybit", "okx"],
  },
]);

const manager = new DynamicSymbolManager({ idleTtlMs: 50 });
manager.ensureCoreSymbols();
manager.acquire("BTCUSDT", "client-a");
manager.acquire("DOGEUSDT", "client-b");

const connected = new Map([
  ["BTCUSDT", 2],
  ["DOGEUSDT", 1],
]);

const health = manager.getHealthSnapshot({
  getConnectedCount: (symbol) => connected.get(symbol) || 0,
  listenerCount: 3,
});

assert.equal(health.idleTimerCount, 0);
assert.equal(health.listenerCount, 3);
assert.ok(Array.isArray(health.symbols));
assert.ok(health.symbols.some((row) => row.symbol === "DOGEUSDT" && row.referenceCount === 1));
assert.ok(health.symbols.some((row) => row.symbol === "BTCUSDT" && row.referenceCount === 1));
assert.equal(
  health.symbols.find((row) => row.symbol === "DOGEUSDT")?.connectedExchangeCount,
  1,
);
assert.equal(JSON.stringify(health).includes("client-a"), false);
assert.equal(JSON.stringify(health).includes("client-b"), false);

manager.release("DOGEUSDT", "client-b");
const idleHealth = manager.getHealthSnapshot({ listenerCount: 3 });
assert.equal(idleHealth.idleTimerCount, 1);
assert.ok(idleHealth.symbols.some((row) => row.symbol === "DOGEUSDT" && row.hasIdleTimer === true));

function assertShutdownClearsReconnectTimer(ConnectionClass) {
  const conn = new ConnectionClass({
    siteSymbol: "BTCUSDT",
    onUpdate: () => {},
    onTrade: () => {},
  });

  conn.scheduleReconnect("test");
  assert.ok(conn.reconnectTimer, "reconnect timer should be scheduled");

  conn.shutdown();
  assert.equal(conn.reconnectTimer, null, "shutdown should clear reconnect timer");
  assert.equal(conn.closedByShutdown, true);

  conn.scheduleReconnect("after_shutdown");
  assert.equal(conn.reconnectTimer, null, "scheduleReconnect after shutdown must not create timer");
}

assertShutdownClearsReconnectTimer(BybitOrderBookConnection);
assertShutdownClearsReconnectTimer(OkxOrderBookConnection);
assertShutdownClearsReconnectTimer(BinanceOrderBookConnection);

const bybit = new BybitOrderBookConnection({
  siteSymbol: "BTCUSDT",
  onUpdate: () => {},
  onTrade: () => {},
});
bybit.scheduleReconnect("first");
const firstTimer = bybit.reconnectTimer;
bybit.scheduleReconnect("second");
assert.equal(bybit.reconnectTimer, firstTimer, "duplicate reconnect timers must not be created");
bybit.shutdown();

console.log("pre-staging hardening tests passed: 18/18");
