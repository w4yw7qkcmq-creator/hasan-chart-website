#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const THEME = join(ROOT, "app/design-system/design-system-theme.css");

const REQUIRED_CHART_TOKENS = [
  "--ui-chart-grid",
  "--ui-chart-axis",
  "--ui-chart-tooltip-bg",
  "--ui-chart-tooltip-text",
  "--ui-chart-series-1",
  "--ui-chart-series-2",
  "--ui-chart-buy",
  "--ui-chart-sell",
  "--ui-chart-neutral",
];

const css = readFileSync(THEME, "utf8");
let passed = 0;
const missing = [];

for (const token of REQUIRED_CHART_TOKENS) {
  if (!new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`).test(css)) {
    missing.push(token);
  } else {
    passed += 1;
  }
}

assert.equal(missing.length, 0, `missing chart tokens: ${missing.join(", ")}`);
passed += 1;

console.log(`test-chart-token-contract: PASS (${passed} checks)`);
