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

function testPriceAlertsUnderPublicStatic() {
  assert.ok(fs.existsSync(path.join(rootDir, "app/(public-static)/price-alerts/page.js")));
  assert.ok(fs.existsSync(path.join(rootDir, "app/(public-static)/price-alerts/layout.js")));
  assert.ok(!fs.existsSync(path.join(rootDir, "app/(app)/price-alerts/page.js")));
}

function testAlertsAppRemainsOnFullShell() {
  assert.ok(fs.existsSync(path.join(rootDir, "app/(app)/alerts/page.js")));
  assert.ok(fs.existsSync(path.join(rootDir, "app/(app)/alerts/layout.js")));
  assert.ok(!fs.existsSync(path.join(rootDir, "app/(public-static)/alerts/page.js")));
}

function testAlertsAppStillUsesAuthArchitecture() {
  const alertsPage = read("app/(app)/alerts/page.js");
  assert.match(alertsPage, /"use client"/);
  assert.match(alertsPage, /useAuth/);
  assert.match(alertsPage, /\/api\/alerts/);
  assert.doesNotMatch(read("app/(app)/alerts/layout.js"), /revalidate\s*=\s*3600/);
}

function testPublicStaticShellRemainsAuthFree() {
  const shell = read("app/components/PublicStaticShell.js");
  for (const pattern of [/AuthProvider/, /useAuth/, /supabase/, /RootLayoutShell/]) {
    assert.doesNotMatch(shell, pattern);
  }
}

function testPriceAlertsRemainsStaticIsr() {
  const page = read("app/(public-static)/price-alerts/page.js");
  const layout = read("app/(public-static)/price-alerts/layout.js");
  assert.doesNotMatch(page, /"use client"/);
  assert.match(layout, /revalidate\s*=\s*3600/);
  assert.doesNotMatch(layout, /cookies\(\)/);
  assert.doesNotMatch(layout, /headers\(\)/);
}

function testAlertsCtaHrefsPreserved() {
  const content = read("app/components/price-alerts/PriceAlertsPageContent.js");
  const hrefMatches = [...content.matchAll(/href:\s*"(\/alerts)"|href="(\/alerts)"/g)];
  assert.equal(hrefMatches.length, 5, "expected five /alerts Link hrefs");
  assert.match(content, /href="\/alerts"[\s\S]*ضبط تنبيه سعر/);
  const alertsLabels = [...content.matchAll(/label:\s*"صفحة التنبيهات",\s*href:\s*"\/alerts"/g)];
  assert.equal(alertsLabels.length, 4, "expected four section/internal صفحة التنبيهات CTAs");
}

function testRouteTrackingListsCorrect() {
  assert.deepEqual(PUBLIC_STATIC_BATCH_3_ROUTES, ["/technical-analysis", "/price-alerts"]);
  assert.equal(PUBLIC_STATIC_MIGRATED_ROUTES.length, 12);
  assert.deepEqual(PUBLIC_STATIC_REJECTED_BATCH_2_ROUTES, []);
  assert.deepEqual(PUBLIC_STATIC_REJECTED_BATCH_3_ROUTES, []);
  assert.ok(!PUBLIC_STATIC_MIGRATED_ROUTES.includes("/alerts"));
}

function testPreviousMigratedRouteListsIntact() {
  assert.deepEqual(PUBLIC_STATIC_BATCH_1_ROUTES, ["/about", "/brand", "/company", "/commodities", "/oil"]);
  assert.deepEqual(PUBLIC_STATIC_BATCH_2_ROUTES, [
    "/markets",
    "/forex",
    "/crypto",
    "/stocks",
    "/economic-news",
  ]);
  assert.ok(fs.existsSync(path.join(rootDir, "app/(public-static)/technical-analysis/page.js")));
  assert.ok(!fs.existsSync(path.join(rootDir, "app/(app)/technical-analysis/page.js")));
}

const tests = [
  ["price-alerts lives under public-static", testPriceAlertsUnderPublicStatic],
  ["alerts application remains under (app)", testAlertsAppRemainsOnFullShell],
  ["alerts application keeps auth architecture", testAlertsAppStillUsesAuthArchitecture],
  ["PublicStaticShell stays auth/push-free", testPublicStaticShellRemainsAuthFree],
  ["price-alerts remains static ISR server page", testPriceAlertsRemainsStaticIsr],
  ["all /alerts CTA hrefs preserved", testAlertsCtaHrefsPreserved],
  ["route tracking lists correct", testRouteTrackingListsCorrect],
  ["previous migrated route lists intact", testPreviousMigratedRouteListsIntact],
];

let passed = 0;
for (const [label, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${label}`);
}

console.log(`\nPhase 5G public-static shell expansion: ${passed}/${tests.length} passed`);
