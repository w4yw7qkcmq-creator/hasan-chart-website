#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLIC_STATIC_BATCH_1_ROUTES } from "../lib/site-shell-navigation.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function routeFolder(route) {
  return route.replace(/^\//, "");
}

function testBatchRoutesUnderPublicStatic() {
  for (const route of PUBLIC_STATIC_BATCH_1_ROUTES) {
    const folder = routeFolder(route);
    assert.ok(
      fs.existsSync(path.join(rootDir, `app/(public-static)/${folder}/page.js`)),
      `${route} should live under (public-static)`
    );
    assert.ok(
      !fs.existsSync(path.join(rootDir, `app/(app)/${folder}/page.js`)),
      `${route} should not remain under (app)`
    );
  }
}

function testGoldStillUnderPublicStatic() {
  assert.ok(fs.existsSync(path.join(rootDir, "app/(public-static)/gold/page.js")));
  assert.ok(!fs.existsSync(path.join(rootDir, "app/(app)/gold/page.js")));
}

function testPublicStaticShellRemainsAuthFree() {
  const shell = read("app/components/PublicStaticShell.js");
  const forbidden = [
    /AuthProvider/,
    /useAuth/,
    /NotificationProvider/,
    /useNotifications/,
    /supabase/,
    /push-enrollment/,
    /push-client/,
    /RootLayoutShell/,
  ];
  for (const pattern of forbidden) {
    assert.doesNotMatch(shell, pattern, `PublicStaticShell must not import ${pattern}`);
  }
}

function testNavigationModuleIsPureData() {
  const nav = read("lib/site-shell-navigation.js");
  assert.doesNotMatch(nav, /"use client"/);
  assert.doesNotMatch(nav, /react/i);
  assert.doesNotMatch(nav, /useAuth/);
  assert.doesNotMatch(nav, /supabase/);
  assert.doesNotMatch(nav, /NotificationProvider/);
  assert.match(nav, /siteShellMenuGroups/);
  assert.match(nav, /publicStaticMenuGroups/);
  assert.match(nav, /PUBLIC_STATIC_BATCH_1_ROUTES/);
}

function testMigratedRoutesRemainStaticServerPages() {
  for (const route of PUBLIC_STATIC_BATCH_1_ROUTES) {
    const folder = routeFolder(route);
    const page = read(`app/(public-static)/${folder}/page.js`);
    const layout = read(`app/(public-static)/${folder}/layout.js`);

    assert.doesNotMatch(page, /"use client"/, `${route} page must stay server`);
    assert.match(layout, /revalidate\s*=\s*3600/, `${route} layout must keep ISR`);
    assert.doesNotMatch(layout, /cookies\(\)/, `${route} layout must not use cookies()`);
    assert.doesNotMatch(layout, /headers\(\)/, `${route} layout must not use headers()`);
  }
}

function testShellsShareNavigationData() {
  const publicShell = read("app/components/PublicStaticShell.js");
  const rootShell = read("app/components/RootLayoutShell.js");
  assert.match(publicShell, /site-shell-navigation/);
  assert.match(rootShell, /site-shell-navigation/);
}

const tests = [
  ["batch 1 routes live under public-static", testBatchRoutesUnderPublicStatic],
  ["/gold remains under public-static", testGoldStillUnderPublicStatic],
  ["PublicStaticShell stays auth/push-free", testPublicStaticShellRemainsAuthFree],
  ["site-shell-navigation is pure data", testNavigationModuleIsPureData],
  ["migrated routes remain static ISR server pages", testMigratedRoutesRemainStaticServerPages],
  ["both shells consume shared navigation data", testShellsShareNavigationData],
];

let passed = 0;
for (const [label, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${label}`);
}

console.log(`\nPhase 5C public-static shell expansion: ${passed}/${tests.length} passed`);
