#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const layoutSource = fs.readFileSync(path.join(rootDir, "app/layout.js"), "utf8");
const criticalSource = fs.readFileSync(path.join(rootDir, "lib/theme-critical-styles.js"), "utf8");
const themeProviderSource = fs.readFileSync(
  path.join(rootDir, "app/components/ThemeProvider.js"),
  "utf8"
);

function testLoaderRemovedFromDom() {
  assert.doesNotMatch(layoutSource, /id="theme-boot-loader"/);
  assert.doesNotMatch(layoutSource, /جاري تجهيز الواجهة/);
}

function testCriticalCssAntiFoucOnly() {
  assert.match(criticalSource, /html\[data-theme="dark"\]/);
  assert.match(criticalSource, /html\[data-theme="light"\]/);
  assert.doesNotMatch(criticalSource, /#theme-boot-loader/);
  assert.doesNotMatch(criticalSource, /theme-pending/);
}

function testInlineBootScriptIsCookieOnly() {
  assert.match(layoutSource, /THEME_COOKIE_BOOT_SCRIPT/);
  assert.doesNotMatch(layoutSource, /THEME_BOOT_SCRIPT/);
  assert.doesNotMatch(criticalSource, /export const THEME_BOOT_SCRIPT/);
}

function testThemeProviderAlwaysReady() {
  assert.match(themeProviderSource, /themeReady:\s*true/);
  assert.doesNotMatch(themeProviderSource, /useState\(false\)/);
}

function testNoPendingClassOnHtml() {
  assert.doesNotMatch(layoutSource, /theme-pending/);
}

const tests = [
  ["loader removed from DOM", testLoaderRemovedFromDom],
  ["critical CSS keeps anti-FOUC only", testCriticalCssAntiFoucOnly],
  ["inline boot script is cookie-only", testInlineBootScriptIsCookieOnly],
  ["ThemeProvider reports ready immediately", testThemeProviderAlwaysReady],
  ["html no longer uses theme-pending", testNoPendingClassOnHtml],
];

for (const [name, run] of tests) {
  run();
  console.log(`✓ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} phase 3B theme boot checks passed`);
