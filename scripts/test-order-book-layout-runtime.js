import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const page = readFileSync(join(ROOT, "app/components/order-book/OrderBookPageContent.js"), "utf8");
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

test("layout row 1 uses stretch grid without fixed order book height", () => {
  const row1 = sliceBetween("{/* Row 1", "{/* Row 2");
  assert.match(row1, /lg:items-stretch/);
  assert.doesNotMatch(row1, /ORDER_BOOK_ROW_HEIGHT_LG/);
  assert.doesNotMatch(row1, /overflow-hidden lg:col-span-4/);
  assert.doesNotMatch(row1, /title="جدران السيولة"/);
});

test("executed flow panel avoids internal overflow clipping classes", () => {
  const row1 = sliceBetween("{/* Row 1", "{/* Row 2");
  const flowStart = row1.indexOf('title="حجم الشراء/البيع');
  const flowPanel = row1.slice(row1.lastIndexOf("<Panel", flowStart));
  assert.match(flowPanel, /className="min-w-0 transition-opacity duration-200"/);
  assert.match(flowPanel, /mt-3 grid grid-cols-2 gap-2/);
  assert.match(flowPanel, /dominanceLabel/);
  assert.match(flowPanel, /executedFlow\?\.window/);
  assert.doesNotMatch(flowPanel, /overflow-hidden/);
  assert.doesNotMatch(flowPanel, /overflow-x-hidden/);
});

test("liquidity walls panel is full-width independent row", () => {
  const wallsRow = sliceBetween("{/* Row 2", "{/* Row 3");
  assert.match(wallsRow, /lg:col-span-12/);
  assert.match(wallsRow, /title="جدران السيولة"/);
  assert.doesNotMatch(wallsRow, /overflow-hidden/);
  assert.doesNotMatch(wallsRow, /max-h-/);
  assert.doesNotMatch(wallsRow, /LiveWallCard compact/);
});

test("historical large trades table exposes all core columns", () => {
  const tradesRow = sliceBetween("{/* Row 3", "{/* Full-width sections");
  for (const header of ["الوقت", "المنصة", "الاتجاه", "السعر", "الكمية", "القيمة"]) {
    assert.match(tradesRow, new RegExp(header));
  }
  assert.match(tradesRow, /min-w-\[42rem\]/);
  assert.match(tradesRow, /table-auto/);
  assert.match(tradesRow, /align-middle/);
  assert.match(tradesRow, /whitespace-nowrap/);
  assert.match(tradesRow, /formatQuantity\(trade\.quantity\)/);
  assert.match(tradesRow, /lg:flex-row lg:flex-wrap/);
  assert.match(tradesRow, /mobileScrollable/);
});

test("page uses symbol search instead of fixed tabs only", () => {
  assert.match(page, /SymbolSearchCombobox/);
  assert.match(page, /SymbolSearchCombobox/);
  assert.match(page, /handleSymbolChange/);
});

console.log(`order-book layout runtime tests passed: ${passed}/${passed}`);
