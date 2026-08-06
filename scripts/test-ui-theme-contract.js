#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import {
  ui,
  UNSAFE_UI_PATTERNS,
  FINANCIAL_CHART_ALLOWLIST,
  LEGACY_UI_PATH_PREFIXES,
} from "../app/components/ui/ui-theme.js";

const ROOT = process.cwd();
const INDEX = join(ROOT, "app/components/ui/index.js");
const THEME = join(ROOT, "app/components/ui/ui-theme.js");

let passed = 0;

assert.ok(Array.isArray(UNSAFE_UI_PATTERNS) && UNSAFE_UI_PATTERNS.length > 0);
assert.ok(Array.isArray(FINANCIAL_CHART_ALLOWLIST) && FINANCIAL_CHART_ALLOWLIST.length > 0);
assert.ok(Array.isArray(LEGACY_UI_PATH_PREFIXES));
passed += 3;

assert.ok(typeof ui === "object");
assert.match(String(ui.btnPrimary), /ui-btn/);
assert.match(String(ui.pageShell), /ui-page-shell/);
assert.match(String(ui.focusRing), /focus-visible/);
passed += 4;

const indexSource = readFileSync(INDEX, "utf8");
assert.match(indexSource, /export\s*\{[\s\S]*ui,[\s\S]*UNSAFE_UI_PATTERNS/);
assert.match(indexSource, /UiButton/);
assert.match(indexSource, /UiModal/);
passed += 3;

const themeSource = readFileSync(THEME, "utf8");
for (const pattern of UNSAFE_UI_PATTERNS) {
  assert.ok(pattern instanceof RegExp, "UNSAFE_UI_PATTERNS must be RegExp");
  passed += 1;
}

assert.doesNotMatch(themeSource, /\[class\*="/);
passed += 1;

console.log(`test-ui-theme-contract: PASS (${passed} checks)`);
