#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const globals = readFileSync(join(ROOT, "app/globals.css"), "utf8");
const shell = readFileSync(join(ROOT, "app/components/RootLayoutShell.js"), "utf8");

let passed = 0;

const requiredTokens = [
  "--header-bg",
  "--header-border",
  "--header-text",
  "--header-text-muted",
  "--header-surface",
  "--header-danger-text",
  "--header-logo-text",
];

for (const token of requiredTokens) {
  assert.match(globals, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  passed += 1;
}

const requiredClasses = [
  ".site-top-header",
  ".site-header-brand__text",
  ".site-header-logo-badge",
  ".topUserChip",
  ".topLogoutBtn",
  ".site-header-theme-btn",
  ".browserPushBtn",
  ".notificationBell",
];

for (const cls of requiredClasses) {
  assert.match(globals, new RegExp(cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  passed += 1;
}

assert.match(shell, /site-top-header/);
assert.match(shell, /site-header-brand__text/);
assert.match(shell, /site-header-logo-badge/);
assert.match(shell, /topUserChip/);
assert.match(shell, /topLogoutBtn/);
assert.match(shell, /site-header-theme-btn/);
passed += 6;

assert.doesNotMatch(shell, /site-header-brand[^\n]*text-black/);
assert.doesNotMatch(shell, /site-header-brand[^\n]*text-gray-900/);
assert.doesNotMatch(shell, /site-header-brand[^\n]*text-slate-900/);
assert.doesNotMatch(shell, /topUserChip[^\n]*text-black/);
assert.doesNotMatch(shell, /topLogoutBtn[^\n]*text-black/);
passed += 5;

assert.match(globals, /html\[data-theme="light"\][\s\S]*--header-text/);
assert.match(globals, /\.site-header-brand__text[\s\S]*color:\s*var\(--header-text\)/);
passed += 2;

console.log(`test-global-header-theme: PASS (${passed} checks)`);
