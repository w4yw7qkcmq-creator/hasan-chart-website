#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const page = readFileSync(join(process.cwd(), "app/components/order-book/OrderBookPageContent.js"), "utf8");
const panel = readFileSync(join(process.cwd(), "app/components/order-book/OrderBookPanel.js"), "utf8");
const ui = readFileSync(join(process.cwd(), "app/components/order-book/order-book-ui.js"), "utf8");

let passed = 0;

assert.match(page, /lg:grid-cols-12/);
assert.match(page, /grid-cols-2 gap-3 lg:col-span-7 lg:grid-cols-4/);
assert.match(page, /xl:grid-cols-2/);
assert.match(page, /sm:grid-cols-2/);
assert.match(page, /min-w-\[42rem\]/);
assert.match(page, /overflow-x-auto/);
assert.match(page, /md:block|md:hidden|max-lg:|lg:/);
passed += 7;

assert.match(panel, /grid-cols-3/);
assert.match(panel, /overflow-y-auto/);
assert.match(panel, /min-h-0/);
passed += 3;

assert.match(page, /dir="rtl"/);
passed += 1;

assert.match(ui, /mobileScrollable|max-lg:overflow-x-auto/);
passed += 1;

console.log(`test-order-book-responsive: PASS (${passed} checks)`);
