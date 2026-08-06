#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const THEME = join(ROOT, "app/design-system/design-system-theme.css");
const GLOBALS = join(ROOT, "app/globals.css");

const REQUIRED_TOKENS = [
  "--ui-surface",
  "--ui-surface-muted",
  "--ui-surface-elevated",
  "--ui-border",
  "--ui-text",
  "--ui-text-muted",
  "--ui-text-subtle",
  "--ui-accent",
  "--ui-focus-ring",
  "--ui-positive",
  "--ui-negative",
  "--ui-warning",
  "--ui-radius-lg",
  "--ui-shell-root-bg",
];

const css = readFileSync(THEME, "utf8") + readFileSync(GLOBALS, "utf8");
let passed = 0;
const missing = [];

for (const token of REQUIRED_TOKENS) {
  if (!new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`).test(css)) {
    missing.push(token);
  } else {
    passed += 1;
  }
}

assert.match(css, /html\[data-theme="light"\][\s\S]*--ui-surface:/);
assert.match(css, /html\[data-theme="dark"\]|:root[\s\S]*--ui-surface:/);
passed += 2;

assert.equal(missing.length, 0, `missing core tokens: ${missing.join(", ")}`);
passed += 1;

console.log(`test-design-tokens: PASS (${passed} checks)`);
