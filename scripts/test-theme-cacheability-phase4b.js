#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CSP_THEME_COOKIE_BOOT_HASH } from "../lib/csp-inline-script-hashes.js";
import { THEME_COOKIE_BOOT_SCRIPT } from "../lib/theme-critical-styles.js";

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
const themeSharedSource = fs.readFileSync(path.join(rootDir, "lib/theme-shared.js"), "utf8");

function testRootLayoutDoesNotReadThemeCookies() {
  assert.doesNotMatch(layoutSource, /readThemeFromRequestCookies/);
  assert.doesNotMatch(layoutSource, /from "\.\.\/lib\/theme-server"/);
  assert.doesNotMatch(layoutSource, /cookies\(\)/);
}

function testCspBootHashStillValid() {
  const digest = crypto.createHash("sha256").update(THEME_COOKIE_BOOT_SCRIPT).digest("base64");
  const expectedHash = `'sha256-${digest}'`;
  assert.equal(CSP_THEME_COOKIE_BOOT_HASH, expectedHash);
}

function testStaticNeutralHtmlTheme() {
  assert.match(layoutSource, /data-theme="dark"/);
  assert.match(layoutSource, /suppressHydrationWarning/);
}

function testBootScriptBeforeHydration() {
  const bootIndex = layoutSource.indexOf("THEME_COOKIE_BOOT_SCRIPT");
  const providerIndex = layoutSource.indexOf("ThemeProvider");
  assert.ok(bootIndex >= 0 && providerIndex >= 0);
  assert.ok(bootIndex < providerIndex, "boot script must render before ThemeProvider");
}

function testThemeProviderDoesNotOverwritePrepaintTheme() {
  assert.match(themeProviderSource, /readPrepaintTheme/);
  assert.match(themeProviderSource, /getSafeTheme/);
  assert.match(themeProviderSource, /useState\(readPrepaintTheme\)/);
  assert.match(themeProviderSource, /syncThemeColorMeta/);
}

function testNoSystemOrLocalStorageTheme() {
  for (const source of [layoutSource, themeProviderSource, bootScriptSource, themeSharedSource]) {
    assert.doesNotMatch(source, /localStorage/);
    assert.doesNotMatch(source, /prefers-color-scheme/);
    assert.doesNotMatch(source, /matchMedia/);
  }
}

function testCookieValidationPreserved() {
  assert.match(bootScriptSource, /COOKIE_NAME = "hc_theme"/);
  assert.match(themeSharedSource, /THEME_COOKIE_NAME = "hc_theme"/);
  assert.match(bootScriptSource, /return value === "light" \? "light" : "dark"/);
}

function testThemePersistencePreserved() {
  assert.match(themeProviderSource, /writeThemeCookie/);
  assert.match(themeProviderSource, /fetch\("\/api\/theme"/);
}

function testStaticViewportFallback() {
  assert.match(layoutSource, /themeColor:\s*THEME_COLOR_DARK/);
  assert.doesNotMatch(layoutSource, /resolveThemeColor\(/);
}

const tests = [
  ["root layout does not read theme cookies", testRootLayoutDoesNotReadThemeCookies],
  ["static neutral html theme", testStaticNeutralHtmlTheme],
  ["boot script remains before hydration", testBootScriptBeforeHydration],
  ["ThemeProvider adopts prepaint theme safely", testThemeProviderDoesNotOverwritePrepaintTheme],
  ["no system/localStorage theme behavior", testNoSystemOrLocalStorageTheme],
  ["cookie validation preserved", testCookieValidationPreserved],
  ["theme persistence preserved", testThemePersistencePreserved],
  ["static viewport fallback", testStaticViewportFallback],
  ["CSP boot hash still valid", testCspBootHashStillValid],
];

for (const [name, run] of tests) {
  run();
  console.log(`✓ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} phase 4B theme cacheability checks passed`);
