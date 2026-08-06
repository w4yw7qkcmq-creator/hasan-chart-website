#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ui = readFileSync(join(process.cwd(), "app/components/order-book/order-book-ui.js"), "utf8");
const page = readFileSync(join(process.cwd(), "app/components/order-book/OrderBookPageContent.js"), "utf8");
const css = readFileSync(join(process.cwd(), "app/(app)/order-book/order-book-theme.css"), "utf8");
const theme = readFileSync(join(process.cwd(), "app/components/order-book/order-book-theme.js"), "utf8");

let passed = 0;

assert.match(ui, /aria-label/);
assert.match(ui, /role="tablist"/);
assert.match(ui, /aria-selected/);
assert.match(ui, /ob\.focusRing|focus-visible/);
assert.match(theme, /focus-visible/);
passed += 5;

assert.match(ui, /aria-live="polite"/);
assert.match(page, /sr-only/);
passed += 2;

assert.match(css, /prefers-reduced-motion/);
passed += 1;

assert.match(ui, /SideBadge/);
assert.match(ui, /شراء|بيع/);
assert.match(ui, /CoverageBadge/);
assert.match(ui, /التغطية/);
passed += 4;

assert.match(ui, /text-xs font-semibold ob-text-muted|ob\.label/);
assert.match(ui, /ob\.badgeBuy/);
assert.match(ui, /ob\.badgeCoverage/);
passed += 3;

console.log(`test-order-book-accessibility: PASS (${passed} checks)`);
