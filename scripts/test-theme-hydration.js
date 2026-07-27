#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSafeTheme, THEME_COOKIE_NAME } from "../lib/theme-shared.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const layoutSource = fs.readFileSync(path.join(rootDir, "app/layout.js"), "utf8");
const themeProviderSource = fs.readFileSync(
  path.join(rootDir, "app/components/ThemeProvider.js"),
  "utf8"
);
const bootScriptSource = fs.readFileSync(
  path.join(rootDir, "lib/theme-critical-styles.js"),
  "utf8"
);

function testBootScriptUsesSharedCookieKey() {
  assert.match(bootScriptSource, new RegExp(`COOKIE_NAME = "${THEME_COOKIE_NAME}"`));
}

function testInvalidThemeFallback() {
  assert.equal(getSafeTheme("light"), "light");
  assert.equal(getSafeTheme("dark"), "dark");
  assert.equal(getSafeTheme("system"), "dark");
  assert.equal(getSafeTheme(""), "dark");
  assert.equal(getSafeTheme(undefined), "dark");
  assert.equal(getSafeTheme(null), "dark");
}

function testLayoutReadsServerThemeCookie() {
  assert.match(layoutSource, /readThemeFromRequestCookies/);
  assert.match(layoutSource, /data-theme=\{initialTheme\}/);
  assert.doesNotMatch(layoutSource, /data-theme="dark"/);
}

function testLayoutDoesNotReadBrowserStorageDuringSsr() {
  assert.doesNotMatch(layoutSource, /localStorage/);
  assert.doesNotMatch(layoutSource, /\bwindow\b/);
  assert.doesNotMatch(layoutSource, /document\./);
}

function testThemeProviderDoesNotReadDocumentDuringRender() {
  assert.doesNotMatch(themeProviderSource, /readBootTheme/);
  assert.doesNotMatch(themeProviderSource, /document\.documentElement\.getAttribute\("data-theme"\)/);
}

function testSuppressHydrationWarningScope() {
  assert.match(layoutSource, /suppressHydrationWarning/);
  assert.match(layoutSource, /<html[\s\S]*suppressHydrationWarning/);
  assert.match(layoutSource, /id="theme-boot-loader"[\s\S]*suppressHydrationWarning/);
  assert.doesNotMatch(layoutSource, /<body[^>]*suppressHydrationWarning/);
}

function testLayoutDoesNotUseNonDeterministicInitialTheme() {
  assert.doesNotMatch(layoutSource, /Math\.random/);
  assert.doesNotMatch(layoutSource, /Date\.now/);
  assert.doesNotMatch(layoutSource, /new Date\(/);
  assert.doesNotMatch(themeProviderSource, /Math\.random/);
  assert.doesNotMatch(themeProviderSource, /Date\.now/);
}

const tests = [
  ["boot script uses shared cookie key", testBootScriptUsesSharedCookieKey],
  ["invalid theme values normalize to fallback", testInvalidThemeFallback],
  ["layout reads theme from server cookies", testLayoutReadsServerThemeCookie],
  ["layout avoids browser-only reads during SSR", testLayoutDoesNotReadBrowserStorageDuringSsr],
  ["ThemeProvider avoids document reads during render", testThemeProviderDoesNotReadDocumentDuringRender],
  ["suppressHydrationWarning limited to html and boot loader", testSuppressHydrationWarningScope],
  ["initial theme does not use random or date values", testLayoutDoesNotUseNonDeterministicInitialTheme],
];

for (const [name, run] of tests) {
  run();
  console.log(`✓ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} theme hydration checks passed`);
