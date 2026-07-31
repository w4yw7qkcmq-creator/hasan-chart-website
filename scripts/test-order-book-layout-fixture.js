import assert from "node:assert/strict";
import {
  EXECUTED_FLOW_FIXTURE,
  FIXTURE_COLUMN_HEADERS,
  FIXTURE_VALUE_SAMPLES,
  LARGE_TRADES_FIXTURE,
  LIQUIDITY_WALLS_FIXTURE,
} from "./fixtures/order-book-layout-fixture.js";
import { formatUsd } from "../app/components/order-book/formatters.js";

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
}

test("fixture has 15 large trade rows with long values", () => {
  assert.equal(LARGE_TRADES_FIXTURE.length, 15);
  for (const row of LARGE_TRADES_FIXTURE) {
    assert.ok(["binance", "bybit", "okx"].includes(row.exchange));
    assert.ok(["buy", "sell"].includes(row.side));
    assert.ok(row.notional >= 29_800);
    assert.ok(String(row.price).includes("."));
    assert.ok(row.quantity > 0);
  }
});

test("fixture value samples format compact usd", () => {
  const samples = [
    formatUsd(29_800, { compact: true }),
    formatUsd(129_800, { compact: true }),
    formatUsd(999_900, { compact: true }),
    formatUsd(1_200_000, { compact: true }),
  ];
  for (const sample of samples) {
    assert.match(sample, /^\$/);
  }
  assert.deepEqual(FIXTURE_VALUE_SAMPLES, ["$29.8K", "$129.8K", "$999.9K", "$1.20M"]);
});

test("fixture walls include price value quantity distance exchange", () => {
  for (const side of ["bid", "ask"]) {
    const wall = LIQUIDITY_WALLS_FIXTURE[side];
    assert.ok(wall.price > 0);
    assert.ok(wall.notional > 0);
    assert.ok(wall.quantity > 0);
    assert.ok(wall.distancePercent > 0);
    assert.ok(wall.exchange);
    assert.ok(wall.exchanges.length >= 1);
  }
});

test("fixture executed flow includes dominance metrics", () => {
  assert.ok(EXECUTED_FLOW_FIXTURE.buyNotional > 0);
  assert.ok(EXECUTED_FLOW_FIXTURE.sellNotional > 0);
  assert.ok(EXECUTED_FLOW_FIXTURE.netNotional !== 0);
  assert.ok(EXECUTED_FLOW_FIXTURE.dominanceLabel);
});

test("fixture table expects six rtl headers", () => {
  assert.equal(FIXTURE_COLUMN_HEADERS.length, 6);
  assert.deepEqual(FIXTURE_COLUMN_HEADERS, ["الوقت", "المنصة", "الاتجاه", "السعر", "الكمية", "القيمة"]);
});

console.log(`order-book layout fixture tests passed: ${passed}/${passed}`);
