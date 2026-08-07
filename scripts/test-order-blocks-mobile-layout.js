#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

const blocks = read("app/components/order-book/OrderBlocksPanel.js");
const panel = read("app/components/order-book/OrderBookPanel.js");
const css = read("app/(app)/order-book/order-book-theme.css");

assert.match(blocks, /export default function OrderBlocksPanel/);
assert.match(blocks, /ob-order-blocks/);
assert.match(blocks, /ORDER_BLOCKS_MOBILE_SCROLL_MAX/);
assert.match(blocks, /max-h-\[min\(70vh,36rem\)\]/);
assert.match(blocks, /flex-none overflow-y-auto overscroll-contain lg:max-h-none lg:flex-1/);
assert.match(blocks, /data-order-blocks-section="sell"/);
assert.match(blocks, /data-order-blocks-section="buy"/);
assert.match(blocks, /data-order-blocks-section="mid"/);
assert.match(blocks, /ORDER_BLOCKS_VISIBLE_ROWS = 12/);
assert.match(blocks, /showBids \?/);
assert.match(blocks, /showAsks \?/);

assert.match(panel, /import OrderBlocksPanel/);
assert.match(panel, /<OrderBlocksPanel/);
assert.doesNotMatch(panel, /function DepthRow/);

assert.match(css, /\.ob-page \.ob-order-blocks/);
assert.match(css, /lg\\:col-span-8\.flex\.flex-col/);

console.log("test-order-blocks-mobile-layout: PASS");
