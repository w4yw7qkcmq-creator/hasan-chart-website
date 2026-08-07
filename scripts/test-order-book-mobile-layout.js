#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

const panel = read("app/components/order-book/OrderBookPanel.js");
const page = read("app/components/order-book/OrderBookPageContent.js");

assert.doesNotMatch(panel, /flex h-full min-h-0 min-w-0 flex-col overflow-hidden/);
assert.match(panel, /max-lg:h-auto lg:h-full/);
assert.match(panel, /max-lg:overflow-visible lg:overflow-hidden/);
assert.match(panel, /ORDER_BOOK_MOBILE_SCROLL_MAX/);
assert.match(panel, /flex-none overflow-y-auto overscroll-contain lg:max-h-none lg:flex-1/);
assert.match(panel, /lg:max-h-none lg:flex-1/);
assert.match(panel, /showBids \?/);
assert.match(panel, /showAsks \?/);

assert.match(page, /header className=\{`mt-4 mb-6 p-4 sm:p-5 \$\{ob\.surface\}`\}/);
assert.doesNotMatch(page, /<header className="mt-4 mb-6">/);

assert.doesNotMatch(panel, /\/logo\.png/);

console.log("test-order-book-mobile-layout: PASS");
