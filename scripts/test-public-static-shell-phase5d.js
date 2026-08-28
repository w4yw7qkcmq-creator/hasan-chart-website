#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_STATIC_BATCH_1_ROUTES,
  PUBLIC_STATIC_BATCH_2_ROUTES,
  PUBLIC_STATIC_MIGRATED_ROUTES,
  PUBLIC_STATIC_REJECTED_BATCH_2_ROUTES,
} from "../lib/site-shell-navigation.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function routeFolder(route) {
  return route.replace(/^\//, "");
}

function testBatch2RoutesUnderPublicStatic() {
  for (const route of PUBLIC_STATIC_BATCH_2_ROUTES) {
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

function testBatch1RoutesStillUnderPublicStatic() {
  for (const route of PUBLIC_STATIC_BATCH_1_ROUTES) {
    const folder = routeFolder(route);
    assert.ok(fs.existsSync(path.join(rootDir, `app/(public-static)/${folder}/page.js`)));
    assert.ok(!fs.existsSync(path.join(rootDir, `app/(app)/${folder}/page.js`)));
  }
}

function testRejectedRoutesRemainOnFullShell() {
  for (const route of PUBLIC_STATIC_REJECTED_BATCH_2_ROUTES) {
    const folder = routeFolder(route);
    assert.ok(
      fs.existsSync(path.join(rootDir, `app/(app)/${folder}/page.js`)),
      `${route} should remain under (app)`
    );
    assert.ok(
      !fs.existsSync(path.join(rootDir, `app/(public-static)/${folder}/page.js`)),
      `${route} must not be migrated in batch 2`
    );
  }
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

function testBatch2RoutesRemainStaticServerPages() {
  for (const route of PUBLIC_STATIC_BATCH_2_ROUTES) {
    const folder = routeFolder(route);
    const page = read(`app/(public-static)/${folder}/page.js`);
    const layout = read(`app/(public-static)/${folder}/layout.js`);

    assert.doesNotMatch(page, /"use client"/, `${route} page must stay server`);
    assert.match(layout, /revalidate\s*=\s*3600/, `${route} layout must keep ISR`);
    assert.doesNotMatch(layout, /cookies\(\)/, `${route} layout must not use cookies()`);
    assert.doesNotMatch(layout, /headers\(\)/, `${route} layout must not use headers()`);
  }
}

function testNavigationModuleListsAllMigratedRoutes() {
  const nav = read("lib/site-shell-navigation.js");
  assert.match(nav, /PUBLIC_STATIC_BATCH_2_ROUTES/);
  assert.match(nav, /PUBLIC_STATIC_MIGRATED_ROUTES/);
  assert.match(nav, /PUBLIC_STATIC_REJECTED_BATCH_2_ROUTES/);
  assert.equal(PUBLIC_STATIC_MIGRATED_ROUTES.length, 10);
}

const tests = [
  ["batch 2 routes live under public-static", testBatch2RoutesUnderPublicStatic],
  ["batch 1 routes remain under public-static", testBatch1RoutesStillUnderPublicStatic],
  ["rejected batch 2 candidates remain on full shell", testRejectedRoutesRemainOnFullShell],
  ["PublicStaticShell stays auth/push-free", testPublicStaticShellRemainsAuthFree],
  ["batch 2 routes remain static ISR server pages", testBatch2RoutesRemainStaticServerPages],
  ["navigation module tracks batch 2 migrated routes", testNavigationModuleListsAllMigratedRoutes],
];

let passed = 0;
for (const [label, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${label}`);
}

console.log(`\nPhase 5D public-static shell expansion: ${passed}/${tests.length} passed`);
