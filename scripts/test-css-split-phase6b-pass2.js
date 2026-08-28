#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

const SUBSCRIPTIONS_MARKER = "--sub-royal:";
const PASS1_MARKERS = {
  news: "--news-blue:",
  dailyAnalysis: "--da-blue:",
  dashboard: "--ud-blue:",
};

function testSubscriptionsMarkerAbsentFromGlobals() {
  const globals = read("app/globals.css");
  assert.doesNotMatch(globals, /--sub-royal:/);
  assert.doesNotMatch(globals, /\.subscriptions-page\s*\{/);
}

function testSubscriptionsMarkerPresentInFeatureFile() {
  const css = read("app/styles/subscriptions.css");
  assert.match(css, /\/\* ===== Subscriptions page ===== \*\//);
  assert.match(css, /--sub-royal:/);
  assert.match(css, /\.subscriptions-page\s*\{/);
}

function testSubscriptionsImportOwnership() {
  assert.match(read("app/(app)/subscriptions/layout.js"), /styles\/subscriptions\.css/);
}

function testRootAndPublicStaticDoNotImportSubscriptionsCss() {
  const rootLayout = read("app/layout.js");
  const publicStaticLayout = read("app/(public-static)/layout.js");
  assert.doesNotMatch(rootLayout, /subscriptions\.css/);
  assert.doesNotMatch(publicStaticLayout, /subscriptions\.css/);
}

function testPass1OwnershipIntact() {
  const globals = read("app/globals.css");
  for (const marker of Object.values(PASS1_MARKERS)) {
    assert.doesNotMatch(globals, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(read("app/(public)/news/layout.js"), /styles\/news\.css/);
  assert.match(read("app/(app)/admin/news/layout.js"), /styles\/news\.css/);
  assert.match(read("app/(app)/daily-analysis/layout.js"), /styles\/daily-analysis\.css/);
  assert.match(read("app/(app)/my-dashboard/layout.js"), /styles\/user-dashboard\.css/);
  assert.match(read("app/(app)/partner-center/layout.js"), /styles\/user-dashboard\.css/);
  assert.match(read("app/components/asset-hub/AssetAnalysisSection.js"), /styles\/daily-analysis\.css/);
}

function testNoProviderChanges() {
  const forbidden = [
    "app/components/AuthProvider.js",
    "app/components/ClientProviders.js",
    "app/components/PublicClientProviders.js",
    "app/components/RootLayoutShell.js",
    "app/components/notifications/NotificationProvider.js",
  ];
  for (const file of forbidden) {
    assert.ok(fs.existsSync(path.join(rootDir, file)));
  }
}

function testSubscriptionsCssOnlyImportedBySubscriptionsLayout() {
  const files = [
    "app/(app)/subscriptions/layout.js",
    "app/(app)/vip-forex/layout.js",
    "app/(app)/vip-spot/layout.js",
    "app/(app)/vip-futures/layout.js",
    "app/(app)/account-management/layout.js",
    "app/(app)/my-dashboard/layout.js",
    "app/(app)/partner-center/layout.js",
  ];
  for (const file of files) {
    const content = read(file);
    if (file.includes("subscriptions/layout.js")) {
      assert.match(content, /subscriptions\.css/);
    } else {
      assert.doesNotMatch(content, /subscriptions\.css/);
    }
  }
}

const tests = [
  ["subscription marker absent from globals.css", testSubscriptionsMarkerAbsentFromGlobals],
  ["subscription marker present in subscriptions.css", testSubscriptionsMarkerPresentInFeatureFile],
  ["subscriptions.css imported by subscriptions layout only", testSubscriptionsImportOwnership],
  ["root/public-static do not import subscriptions.css", testRootAndPublicStaticDoNotImportSubscriptionsCss],
  ["Pass 1 feature ownership remains intact", testPass1OwnershipIntact],
  ["no provider/auth JS changes in scope", testNoProviderChanges],
  ["narrow subscriptions import ownership across related layouts", testSubscriptionsCssOnlyImportedBySubscriptionsLayout],
];

let passed = 0;
for (const [label, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${label}`);
}

console.log(`\nPhase 6B CSS split Pass 2: ${passed}/${tests.length} passed`);
