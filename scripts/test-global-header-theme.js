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
  "--header-brand-text",
  "--header-brand-muted",
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
  ".site-sidebar-brand-title",
  ".site-sidebar-brand-subtitle",
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
assert.match(shell, /site-sidebar-brand-title/);
assert.match(shell, /site-sidebar-brand-subtitle/);
assert.match(shell, /site-header-logo-badge/);
assert.match(shell, /topUserChip/);
assert.match(shell, /topLogoutBtn/);
assert.match(shell, /site-header-theme-btn/);
passed += 8;

assert.doesNotMatch(shell, /site-header-brand[^\n]*text-black/);
assert.doesNotMatch(shell, /site-header-brand[^\n]*text-gray-900/);
assert.doesNotMatch(shell, /site-header-brand[^\n]*text-slate-900/);
assert.doesNotMatch(shell, /site-sidebar-brand-title[^\n]*text-black/);
assert.doesNotMatch(shell, /topUserChip[^\n]*text-black/);
assert.doesNotMatch(shell, /topLogoutBtn[^\n]*text-black/);
passed += 6;

assert.match(globals, /html\[data-theme="light"\][\s\S]*--header-brand-text/);
assert.match(globals, /:root[\s\S]*--header-brand-text/);
assert.match(shell, /site-top-header__actions/);
assert.match(shell, /site-header-brand__text--primary/);
assert.match(shell, /HasaN CharT/);
assert.match(shell, /BrowserPushHeaderButton|browserPushBell/);
assert.match(globals, /\.browserPushBell/);
assert.match(shell, /topLoginBtn--compact/);
assert.match(shell, /site-header-theme-btn--compact/);
assert.match(globals, /@media \(max-width: 639px\)[\s\S]*site-top-header__actions/);
assert.match(globals, /\.site-sidebar-brand-title[\s\S]*color:\s*var\(--header-brand-text/);
assert.match(globals, /\.site-sidebar-brand-subtitle[\s\S]*color:\s*var\(--header-brand-muted/);
assert.match(globals, /\.site-header-logo-badge[\s\S]*color:\s*var\(--header-logo-text\)/);
passed += 6;

console.log(`test-global-header-theme: PASS (${passed} checks)`);
