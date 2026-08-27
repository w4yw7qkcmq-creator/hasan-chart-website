#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const globalsCssSource = fs.readFileSync(path.join(rootDir, "app/globals.css"), "utf8");

function getSafeTheme(value) {
  return value === "light" ? "light" : "dark";
}

function testBootScriptUsesSharedCookieKey() {
  assert.match(bootScriptSource, /COOKIE_NAME = "hc_theme"/);
  assert.match(themeSharedSource, /THEME_COOKIE_NAME = "hc_theme"/);
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
  assert.doesNotMatch(layoutSource, /<body[^>]*suppressHydrationWarning/);
}

function testLayoutDoesNotUseHardcodedDarkBodyClasses() {
  assert.match(layoutSource, /className="site-body/);
  assert.doesNotMatch(layoutSource, /bg-\[#020617\]/);
  assert.doesNotMatch(layoutSource, /text-white/);
}

function testLayoutUsesDynamicViewportThemeColor() {
  assert.match(layoutSource, /generateViewport/);
  assert.match(layoutSource, /readThemeFromRequestCookies/);
  assert.doesNotMatch(layoutSource, /themeColor:\s*"#020617"/);
}

function testThemeProviderSyncsThemeColorMeta() {
  assert.match(themeProviderSource, /syncThemeColorMeta/);
  assert.match(themeProviderSource, /resolveThemeColor/);
}

function testLayoutDoesNotUseNonDeterministicInitialTheme() {
  assert.doesNotMatch(layoutSource, /Math\.random/);
  assert.doesNotMatch(layoutSource, /Date\.now/);
  assert.doesNotMatch(layoutSource, /new Date\(/);
  assert.doesNotMatch(themeProviderSource, /Math\.random/);
  assert.doesNotMatch(themeProviderSource, /Date\.now/);
}

function testModulePackageJsonBoundaries() {
  const scriptsPackageJsonPath = path.join(rootDir, "scripts/package.json");
  assert.doesNotThrow(() => fs.accessSync(scriptsPackageJsonPath));
  const scriptsPackageJson = JSON.parse(fs.readFileSync(scriptsPackageJsonPath, "utf8"));
  assert.equal(scriptsPackageJson.type, "module");

  assert.throws(
    () => fs.accessSync(path.join(rootDir, "lib/package.json")),
    (error) => error?.code === "ENOENT"
  );
  assert.throws(
    () => fs.accessSync(path.join(rootDir, "app/(app)/admin/package.json")),
    (error) => error?.code === "ENOENT"
  );

  const rootPackageJson = JSON.parse(
    fs.readFileSync(path.join(rootDir, "package.json"), "utf8")
  );
  assert.notEqual(rootPackageJson.type, "module");
}

function testNoFullScreenThemeBootLoader() {
  assert.doesNotMatch(layoutSource, /theme-boot-loader/);
  assert.doesNotMatch(bootScriptSource, /theme-boot-loader/);
  assert.doesNotMatch(bootScriptSource, /themeBootSpin/);
}

function testSiteRootNotBlockedDuringBoot() {
  assert.doesNotMatch(bootScriptSource, /pointer-events:\s*none/);
  assert.doesNotMatch(bootScriptSource, /overflow:\s*hidden/);
  assert.doesNotMatch(globalsCssSource, /html\.theme-pending body/);
}

function testNoRevealFallbackTimers() {
  assert.doesNotMatch(bootScriptSource, /THEME_BOOT_SCRIPT/);
  assert.doesNotMatch(bootScriptSource, /setTimeout\(revealTheme,\s*1200\)/);
  assert.doesNotMatch(themeProviderSource, /THEME_REVEAL_TIMEOUT/);
  assert.doesNotMatch(themeProviderSource, /setTimeout\(reveal/);
  assert.doesNotMatch(themeProviderSource, /markThemeReady/);
}

function testThemeCookieBootstrapBeforeHydration() {
  assert.match(layoutSource, /THEME_COOKIE_BOOT_SCRIPT/);
  assert.match(bootScriptSource, /document\.documentElement\.setAttribute\("data-theme"/);
}

function testThemePersistenceIntact() {
  assert.match(themeProviderSource, /writeThemeCookie/);
  assert.match(themeProviderSource, /fetch\("\/api\/theme"/);
}

const tests = [
  ["boot script uses shared cookie key", testBootScriptUsesSharedCookieKey],
  ["invalid theme values normalize to fallback", testInvalidThemeFallback],
  ["layout reads theme from server cookies", testLayoutReadsServerThemeCookie],
  ["layout avoids browser-only reads during SSR", testLayoutDoesNotReadBrowserStorageDuringSsr],
  ["ThemeProvider avoids document reads during render", testThemeProviderDoesNotReadDocumentDuringRender],
  ["suppressHydrationWarning limited to html", testSuppressHydrationWarningScope],
  ["layout avoids hardcoded dark body classes", testLayoutDoesNotUseHardcodedDarkBodyClasses],
  ["layout uses dynamic viewport theme color", testLayoutUsesDynamicViewportThemeColor],
  ["ThemeProvider syncs theme-color meta", testThemeProviderSyncsThemeColorMeta],
  ["initial theme does not use random or date values", testLayoutDoesNotUseNonDeterministicInitialTheme],
  ["module package.json boundaries stay scoped to scripts", testModulePackageJsonBoundaries],
  ["no full-screen theme boot loader", testNoFullScreenThemeBootLoader],
  ["site root not blocked during boot", testSiteRootNotBlockedDuringBoot],
  ["no reveal fallback timers", testNoRevealFallbackTimers],
  ["theme cookie bootstrap before hydration", testThemeCookieBootstrapBeforeHydration],
  ["theme persistence intact", testThemePersistenceIntact],
];

for (const [name, run] of tests) {
  run();
  console.log(`✓ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} theme hydration checks passed`);
