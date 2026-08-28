#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function testGoldRouteGroupIsolation() {
  assert.ok(fs.existsSync(path.join(rootDir, "app/(public-static)/gold/page.js")));
  assert.ok(!fs.existsSync(path.join(rootDir, "app/(app)/gold/page.js")));

  const publicStaticLayout = read("app/(public-static)/layout.js");
  assert.match(publicStaticLayout, /PublicStaticShell/);
  assert.doesNotMatch(publicStaticLayout, /ClientProviders/);
  assert.doesNotMatch(publicStaticLayout, /RootLayoutShell/);
  assert.doesNotMatch(publicStaticLayout, /AuthProvider/);
  assert.doesNotMatch(publicStaticLayout, /NotificationProvider/);
}

function testPublicStaticShellHasNoHeavyProviders() {
  const shell = read("app/components/PublicStaticShell.js");
  assert.doesNotMatch(shell, /AuthProvider/);
  assert.doesNotMatch(shell, /NotificationProvider/);
  assert.doesNotMatch(shell, /NotificationBell/);
  assert.doesNotMatch(shell, /AppModalProvider/);
  assert.doesNotMatch(shell, /supabase/);
  assert.doesNotMatch(shell, /push-enrollment/);
  assert.doesNotMatch(shell, /push-client/);
  assert.doesNotMatch(shell, /BrowserPushHeaderButton/);
  assert.match(shell, /useTheme/);
  assert.match(shell, /AuthLoginLink/);
}

function testGoldPageRemainsStaticServerContent() {
  const goldPage = read("app/(public-static)/gold/page.js");
  const goldLayout = read("app/(public-static)/gold/layout.js");

  assert.doesNotMatch(goldPage, /"use client"/);
  assert.match(goldPage, /GoldPageContent/);
  assert.match(goldLayout, /revalidate\s*=\s*3600/);
  assert.match(goldLayout, /buildPublicPageMetadata/);
  assert.match(goldLayout, /GoldPageJsonLd/);
  assert.doesNotMatch(goldLayout, /cookies\(\)/);
  assert.doesNotMatch(goldLayout, /headers\(\)/);
}

function testGoldContentComponentUnchanged() {
  const content = read("app/components/gold/GoldPageContent.js");
  assert.doesNotMatch(content, /"use client"/);
  assert.match(content, /سوق الذهب/);
}

const tests = [
  ["gold lives under public-static route group", testGoldRouteGroupIsolation],
  ["PublicStaticShell excludes heavy provider stack", testPublicStaticShellHasNoHeavyProviders],
  ["gold page remains static ISR server content", testGoldPageRemainsStaticServerContent],
  ["gold educational content preserved", testGoldContentComponentUnchanged],
];

let passed = 0;
for (const [label, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${label}`);
}

console.log(`\nPhase 5B gold public-static shell: ${passed}/${tests.length} passed`);
