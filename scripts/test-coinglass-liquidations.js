import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCoinglassRequestHeaders,
  decryptCoinglassPayload,
} from "../lib/market-data/liquidations/coinglass-crypto.js";
import {
  CACHE_TTL_MS,
  STALE_TTL_MS,
  buildTargetExchangeRows,
  createEmptyLiquidationsPayload,
  parseExchangeBreakdown,
  parseRealtimeOrders,
  parseSummaryFromCoinLiquidation,
  resetCoinglassLiquidationsCacheForTests,
} from "../lib/market-data/liquidations/coinglass-public-source.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures/coinglass-liquidations");

function loadJson(name) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8"));
}

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`✓ ${name}`);
}

const sampleCoin = loadJson("coin-liquidation.json");
const sampleEx = loadJson("ex-info-h4.json");
const sampleOrders = loadJson("orders.json");
const sampleEncrypted = loadJson("encrypted-envelope.json");

test("buildCoinglassRequestHeaders excludes cookies and auth", () => {
  const headers = buildCoinglassRequestHeaders();
  assert.equal(headers.encryption, "true");
  assert.equal(headers.language, "en");
  assert.ok(headers["cache-ts-v2"]);
  assert.ok(!("Cookie" in headers));
  assert.ok(!("Authorization" in headers));
  assert.ok(!JSON.stringify(headers).includes("I65VU7K5ZQL7WB4E"));
});

test("decryptCoinglassPayload parses encrypted fixture", () => {
  const data = decryptCoinglassPayload({
    encryptedBodyB64: sampleEncrypted.data,
    userTokenB64: sampleEncrypted.user,
    v: sampleEncrypted.v,
    urlPath: sampleEncrypted.urlPath,
    cacheTsV2: sampleEncrypted.cacheTsV2,
    timeHeader: sampleEncrypted.time,
  });
  assert.ok(data.h1.totalVolUsd > 0);
  assert.ok(data.h4.longVolUsd > 0);
});

test("parseSummaryFromCoinLiquidation maps h1/h4/h12/h24", () => {
  const summary = parseSummaryFromCoinLiquidation(sampleCoin);
  assert.equal(summary["1h"].total, sampleCoin.h1.totalVolUsd);
  assert.equal(summary["4h"].long, sampleCoin.h4.longVolUsd);
  assert.equal(summary["24h"].short, sampleCoin.h24.shortVolUsd);
});

test("parseExchangeBreakdown filters All and keeps Binance", () => {
  const rows = parseExchangeBreakdown(sampleEx);
  assert.equal(rows.some((row) => row.exchange === "Binance"), true);
  assert.equal(rows.some((row) => row.exchange === "All"), false);
  assert.equal(rows[0].sharePercent, sampleEx[1].rate);
});

test("buildTargetExchangeRows includes total row for target exchanges", () => {
  const rows = buildTargetExchangeRows(parseExchangeBreakdown(sampleEx));
  assert.equal(rows.some((row) => row.exchange === "Binance"), true);
  assert.equal(rows.some((row) => row.exchange === "Bybit"), true);
  assert.equal(rows.some((row) => row.exchange === "OKX"), true);
  assert.equal(rows.at(-1).exchange, "الإجمالي");
});

test("parseRealtimeOrders maps side and exchange fields", () => {
  const rows = parseRealtimeOrders(sampleOrders);
  assert.equal(rows[0].symbol, "BEAT");
  assert.equal(rows[0].side, "short");
  assert.equal(rows[0].exchange, "OKX");
  assert.equal(rows[1].side, "long");
});

test("missing encrypted fields throws without fake numbers", () => {
  assert.throws(
    () =>
      decryptCoinglassPayload({
        encryptedBodyB64: "",
        userTokenB64: "abc",
        v: "1",
        urlPath: "/api/coin/liquidation",
      }),
    /COINGLASS_DECRYPT_MISSING_FIELDS/,
  );
});

test("createEmptyLiquidationsPayload has null totals only", () => {
  const empty = createEmptyLiquidationsPayload();
  assert.deepEqual(empty.summary["1h"], { total: null, long: null, short: null });
  assert.equal(empty.exchanges.length, 0);
  assert.equal(empty.realtime.length, 0);
  assert.equal(empty.source, "coinglass-public");
});

test("cache and stale constants stay within requested bounds", () => {
  assert.ok(CACHE_TTL_MS >= 10_000 && CACHE_TTL_MS <= 30_000);
  assert.ok(STALE_TTL_MS >= 60_000);
  resetCoinglassLiquidationsCacheForTests();
});

test("LiquidationsPanel includes loading/error/unavailable copy", () => {
  const ui = readFileSync(
    join(__dirname, "../app/components/order-book/LiquidationsPanel.js"),
    "utf8",
  );
  assert.match(ui, /بيانات التصفيات غير متاحة مؤقتًا/);
  assert.match(ui, /المصدر: البيانات العامة المتاحة من CoinGlass/);
  assert.match(ui, /animate-pulse/);
  assert.match(ui, /text-rose-600/);
  assert.match(ui, /text-emerald-600/);
});

test("api route returns unavailable without throwing 500", () => {
  const route = readFileSync(
    join(__dirname, "../app/api/market-depth/liquidations/route.js"),
    "utf8",
  );
  assert.match(route, /available: false/);
  assert.match(route, /error: "LIQUIDATIONS_UNAVAILABLE"/);
  assert.match(route, /status: 200/);
  assert.match(route, /بيانات التصفيات غير متاحة مؤقتًا/);
});

console.log(`\ncoinglass liquidations tests passed: ${passed}/${passed}`);
