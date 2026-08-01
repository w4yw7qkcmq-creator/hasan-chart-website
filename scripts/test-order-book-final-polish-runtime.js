import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildFlowCacheKey,
  isHistoricalFlowWindow,
  isLiveFlowWindow,
} from "../app/hooks/useOrderBookHistory.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(ROOT, "app/components/order-book/OrderBookPageContent.js"), "utf8");
const hook = readFileSync(join(ROOT, "app/hooks/useOrderBookHistory.js"), "utf8");
let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
}

function sliceBetween(startMarker, endMarker) {
  const start = page.indexOf(startMarker);
  const end = page.indexOf(endMarker, start);
  assert.ok(start >= 0, `missing ${startMarker}`);
  assert.ok(end > start, `missing ${endMarker}`);
  return page.slice(start, end);
}

test("row 1 stretches order book to left column height on desktop", () => {
  const row1 = sliceBetween("{/* Row 1 — order book", "{/* Row 2");
  assert.match(row1, /lg:items-stretch/);
  assert.match(row1, /flex min-h-0 min-w-0 flex-col lg:col-span-8/);
  assert.doesNotMatch(row1, /ORDER_BOOK_ROW_HEIGHT_LG/);
  assert.doesNotMatch(row1, /lg:h-\[36rem\]/);
  assert.match(row1, /OrderBookPanel/);
});

test("order book panel keeps internal scroll region", () => {
  const panel = readFileSync(join(ROOT, "app/components/order-book/OrderBookPanel.js"), "utf8");
  assert.match(panel, /min-h-0 flex-1 overflow-y-auto/);
  assert.match(panel, /flex h-full min-h-0 min-w-0 flex-col/);
});

test("executed flow binds display to selected window only", () => {
  assert.match(page, /data\?\.executedFlow\?\.window === prefs\.flowWindow/);
  assert.match(page, /flowHistory\?\.window === prefs\.flowWindow/);
  assert.match(page, /historicalExecutedFlow/);
  assert.match(page, /liveExecutedFlow/);
});

test("history hook caches per symbol mode window", () => {
  assert.match(hook, /flowCacheRef/);
  assert.match(hook, /buildFlowCacheKey/);
  assert.match(hook, /flowCacheRef\.current\.set\(flowCacheKey/);
});

test("cache keys differ across windows", () => {
  const a = buildFlowCacheKey({ symbol: "BTCUSDT", mode: "aggregated", window: "1m" });
  const b = buildFlowCacheKey({ symbol: "BTCUSDT", mode: "aggregated", window: "4h" });
  assert.notEqual(a, b);
});

test("live vs historical window routing unchanged", () => {
  assert.equal(isLiveFlowWindow("1m"), true);
  assert.equal(isHistoricalFlowWindow("1m"), false);
  assert.equal(isHistoricalFlowWindow("4h"), true);
  assert.equal(isLiveFlowWindow("4h"), false);
});

test("executed flow panel shows frame metadata and loading placeholder", () => {
  const row1 = sliceBetween("{/* Row 1 — order book", "{/* Row 2");
  assert.match(row1, /الإطار الحالي/);
  assert.match(row1, /executedFlow\.window/);
  assert.match(row1, /executedFlowLoading/);
  assert.match(row1, /errorMessage="تعذّر تحميل بيانات التدفق التاريخية\."/);
  assert.match(row1, /emptyMessage="لا توجد بيانات كافية ضمن هذا الإطار حتى الآن\."/);
});

test("mobile keeps stacked auto layout without forced equal heights", () => {
  const row1 = sliceBetween("{/* Row 1 — order book", "{/* Row 2");
  assert.match(row1, /grid gap-4 lg:grid-cols-12 lg:items-stretch/);
  assert.doesNotMatch(row1, /h-\[36rem\]/);
  assert.doesNotMatch(row1, /max-h-\[/);
});

console.log(`order-book final polish runtime tests passed: ${passed}/${passed}`);
