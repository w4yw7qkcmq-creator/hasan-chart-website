#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

const panel = read("app/components/order-book/OrderBookPanel.js");
const blocks = read("app/components/order-book/OrderBlocksPanel.js");
const theme = read("app/(app)/order-book/order-book-theme.css");

assert.match(blocks, /ob-order-blocks flex-none overflow-visible/);
assert.doesNotMatch(blocks, /overflow-y-auto/);
assert.doesNotMatch(blocks, /max-h-\[/);
assert.doesNotMatch(blocks, /ORDER_BLOCKS_DESKTOP_SCROLL_MAX/);
assert.match(theme, /\.ob-page \.ob-order-blocks[\s\S]*overflow-y: visible !important/);
assert.match(theme, /\.ob-page \.ob-order-blocks \.ob-mid-row[\s\S]*position: static !important/);
assert.match(panel, /OrderBlocksPanel/);

console.log("test-order-book-mobile-layout: PASS");
