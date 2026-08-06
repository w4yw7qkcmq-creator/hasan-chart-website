#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  UNSAFE_COLOR_PATTERNS,
  UNSAFE_BORDER_PATTERNS,
  UNSAFE_BADGE_COLOR_PATTERNS,
  BADGE_COLOR_ALLOWLIST,
  REQUIRED_THEME_MARKERS,
  ob,
} from "../app/components/order-book/order-book-theme.js";

const ROOT = process.cwd();

const RUNTIME_DIRS = [
  "app/components/order-book",
  "app/(app)/order-book",
];

const TEST_FIXTURE_ALLOWLIST = [];
const RUNTIME_SCAN_EXCLUDE = new Set([
  "app/components/order-book/order-book-theme.js",
]);

function collectRuntimeSources() {
  const files = [];
  for (const dir of RUNTIME_DIRS) {
    const abs = join(ROOT, dir);
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/\.(js|jsx|ts|tsx)$/.test(entry.name)) continue;
      const rel = join(dir, entry.name);
      if (TEST_FIXTURE_ALLOWLIST.includes(rel)) continue;
      if (RUNTIME_SCAN_EXCLUDE.has(rel)) continue;
      files.push(rel);
    }
  }
  return files.sort();
}

let passed = 0;

const runtimeFiles = collectRuntimeSources();
assert.ok(runtimeFiles.length >= 8, `expected order-book runtime files, got ${runtimeFiles.length}`);
passed += 1;

const css = readFileSync(join(ROOT, "app/(app)/order-book/order-book-theme.css"), "utf8");
const ui = readFileSync(join(ROOT, "app/components/order-book/order-book-ui.js"), "utf8");
const page = readFileSync(join(ROOT, "app/components/order-book/OrderBookPageContent.js"), "utf8");

for (const marker of REQUIRED_THEME_MARKERS) {
  const haystack = ui + page + css;
  if (marker === "ob-page") {
    assert.match(haystack, /ob-page|ob\.page/);
  } else {
    assert.match(haystack, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  passed += 1;
}

assert.match(page, /ob\.page/);
assert.match(page, /ConnectionStatusBadge/);
assert.match(page, /aria-live="polite"/);
assert.doesNotMatch(page, /border-slate-/);
assert.match(page, /ob\.divider/);
passed += 5;

assert.match(ui, /ob\.badgeBuy/);
assert.match(ui, /ob\.badgeSell/);
assert.match(ui, /ob\.badgeCoverage/);
assert.match(ui, /SideBadge/);
assert.match(ui, /CoverageBadge/);
assert.match(ui, /شراء|بيع/);
assert.match(ui, /التغطية/);
assert.doesNotMatch(ui, /border-emerald-/);
assert.doesNotMatch(ui, /bg-emerald-/);
assert.doesNotMatch(ui, /text-emerald-/);
assert.doesNotMatch(ui, /border-rose-/);
assert.doesNotMatch(ui, /bg-rose-/);
assert.doesNotMatch(ui, /text-rose-/);
passed += 11;

assert.match(css, /\.ob-badge-buy/);
assert.match(css, /\.ob-badge-sell/);
assert.match(css, /\.ob-badge-coverage/);
assert.match(css, /\.ob-divider/);
passed += 4;

const CLOSED_PANELS = [
  "app/components/order-book/HistoricalLiquidityWallsPanel.js",
  "app/components/order-book/LiquidityDepthChart.js",
  "app/components/order-book/LiquidationsPanel.js",
  "app/components/order-book/FearGreedCard.js",
];

for (const rel of CLOSED_PANELS) {
  const content = readFileSync(join(ROOT, rel), "utf8");
  assert.match(content, /from "\.\/order-book-theme"/, `${rel} must import ob theme tokens`);
  passed += 1;
}

for (const rel of runtimeFiles) {
  const content = readFileSync(join(ROOT, rel), "utf8");
  for (const pattern of UNSAFE_COLOR_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      assert.fail(`unsafe legacy color in ${rel}: matched ${pattern} → "${match[0]}"`);
    }
    passed += 1;
  }
  for (const pattern of UNSAFE_BORDER_PATTERNS) {
    const match = content.match(pattern);
    if (match) {
      assert.fail(`unsafe legacy border in ${rel}: matched ${pattern} → "${match[0]}"`);
    }
    passed += 1;
  }
  if (!BADGE_COLOR_ALLOWLIST.includes(rel)) {
    for (const pattern of UNSAFE_BADGE_COLOR_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        assert.fail(`unsafe badge palette in ${rel}: matched ${pattern} → "${match[0]}"`);
      }
      passed += 1;
    }
  }
}

assert.match(ui, /export function ConnectionStatusBadge/);
assert.match(ui, /role="status"/);
assert.match(ui, /export function OrderBookListbox/);
assert.match(ui, /role="listbox"/);
assert.match(ui, /createPortal/);
assert.match(ui, /ob\.listboxMenu/);
assert.doesNotMatch(ui, /<select\b/);
assert.doesNotMatch(page, /<select\b/);
assert.match(page, /OrderBookListbox/);
assert.match(css, /\.ob-listbox-menu/);
assert.match(css, /html\[data-theme="light"\] \.ob-page/);
assert.match(css, /--ob-text-strong/);
assert.match(css, /--ob-chart-buy/);
assert.match(ob.page, /ob-page/);
passed += 14;

console.log(
  `test-order-book-theme: PASS (${passed} checks, ${runtimeFiles.length} runtime files)`,
);
