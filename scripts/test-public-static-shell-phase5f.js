#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_STATIC_BATCH_1_ROUTES,
  PUBLIC_STATIC_BATCH_2_ROUTES,
  PUBLIC_STATIC_BATCH_3_ROUTES,
  PUBLIC_STATIC_MIGRATED_ROUTES,
  PUBLIC_STATIC_REJECTED_BATCH_2_ROUTES,
  PUBLIC_STATIC_REJECTED_BATCH_3_ROUTES,
} from "../lib/site-shell-navigation.js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function routeFolder(route) {
  return route.replace(/^\//, "");
}

function testBatch3RouteUnderPublicStatic() {
  for (const route of PUBLIC_STATIC_BATCH_3_ROUTES) {
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

function testBatch1And2RoutesStillUnderPublicStatic() {
  for (const route of [...PUBLIC_STATIC_BATCH_1_ROUTES, ...PUBLIC_STATIC_BATCH_2_ROUTES]) {
    const folder = routeFolder(route);
    assert.ok(fs.existsSync(path.join(rootDir, `app/(public-static)/${folder}/page.js`)));
    assert.ok(!fs.existsSync(path.join(rootDir, `app/(app)/${folder}/page.js`)));
  }
}

function testPriceAlertsRemainsOnFullShell() {
  assert.ok(fs.existsSync(path.join(rootDir, "app/(app)/price-alerts/page.js")));
  assert.ok(!fs.existsSync(path.join(rootDir, "app/(public-static)/price-alerts/page.js")));
  assert.ok(PUBLIC_STATIC_REJECTED_BATCH_2_ROUTES.includes("/price-alerts"));
  assert.ok(PUBLIC_STATIC_REJECTED_BATCH_3_ROUTES.includes("/price-alerts"));
  assert.ok(!PUBLIC_STATIC_REJECTED_BATCH_2_ROUTES.includes("/technical-analysis"));
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

function testBatch3RouteRemainsStaticServerPage() {
  for (const route of PUBLIC_STATIC_BATCH_3_ROUTES) {
    const folder = routeFolder(route);
    const page = read(`app/(public-static)/${folder}/page.js`);
    const layout = read(`app/(public-static)/${folder}/layout.js`);

    assert.doesNotMatch(page, /"use client"/, `${route} page must stay server`);
    assert.match(layout, /revalidate\s*=\s*3600/, `${route} layout must keep ISR`);
    assert.doesNotMatch(layout, /cookies\(\)/, `${route} layout must not use cookies()`);
    assert.doesNotMatch(layout, /headers\(\)/, `${route} layout must not use headers()`);
  }
}

function testNavigationModuleListsMigratedRoutes() {
  const nav = read("lib/site-shell-navigation.js");
  assert.match(nav, /PUBLIC_STATIC_BATCH_3_ROUTES/);
  assert.match(nav, /PUBLIC_STATIC_MIGRATED_ROUTES/);
  assert.equal(PUBLIC_STATIC_BATCH_3_ROUTES.length, 1);
  assert.equal(PUBLIC_STATIC_MIGRATED_ROUTES.length, 11);
  assert.deepEqual(PUBLIC_STATIC_BATCH_1_ROUTES, ["/about", "/brand", "/company", "/commodities", "/oil"]);
  assert.deepEqual(PUBLIC_STATIC_BATCH_2_ROUTES, [
    "/markets",
    "/forex",
    "/crypto",
    "/stocks",
    "/economic-news",
  ]);
}

const tests = [
  ["technical-analysis lives under public-static", testBatch3RouteUnderPublicStatic],
  ["batch 1 and batch 2 routes remain under public-static", testBatch1And2RoutesStillUnderPublicStatic],
  ["price-alerts remains on full shell", testPriceAlertsRemainsOnFullShell],
  ["PublicStaticShell stays auth/push-free", testPublicStaticShellRemainsAuthFree],
  ["technical-analysis remains static ISR server page", testBatch3RouteRemainsStaticServerPage],
  ["navigation module tracks batch 3 migrated routes", testNavigationModuleListsMigratedRoutes],
];

let passed = 0;
for (const [label, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${label}`);
}

console.log(`\nPhase 5F public-static shell expansion: ${passed}/${tests.length} passed`);
