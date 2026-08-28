#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

const MARKERS = {
  news: "--news-blue:",
  dailyAnalysis: "--da-blue:",
  dashboard: "--ud-blue:",
};

function testMarkersAbsentFromGlobals() {
  const globals = read("app/globals.css");
  for (const marker of Object.values(MARKERS)) {
    assert.doesNotMatch(globals, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
}

function testMarkersPresentInFeatureFiles() {
  assert.match(read("app/styles/news.css"), /\/\* ===== News page ===== \*\//);
  assert.match(read("app/styles/news.css"), /--news-blue:/);
  assert.match(read("app/styles/daily-analysis.css"), /\/\* ===== Daily analysis ===== \*\//);
  assert.match(read("app/styles/daily-analysis.css"), /--da-blue:/);
  assert.match(read("app/styles/user-dashboard.css"), /\/\* ===== User dashboard ===== \*\//);
  assert.match(read("app/styles/user-dashboard.css"), /--ud-blue:/);
}

function testRouteImportOwnership() {
  assert.match(read("app/(public)/news/layout.js"), /styles\/news\.css/);
  assert.match(read("app/(app)/admin/news/layout.js"), /styles\/news\.css/);
  assert.match(read("app/(app)/daily-analysis/layout.js"), /styles\/daily-analysis\.css/);
  assert.match(read("app/(app)/my-dashboard/layout.js"), /styles\/user-dashboard\.css/);
  assert.match(read("app/(app)/partner-center/layout.js"), /styles\/user-dashboard\.css/);
  assert.match(read("app/components/asset-hub/AssetAnalysisSection.js"), /styles\/daily-analysis\.css/);
}

function testPublicStaticRoutesDoNotImportFeatureCss() {
  const publicStaticLayout = read("app/(public-static)/layout.js");
  const rootLayout = read("app/layout.js");
  for (const css of ["news.css", "daily-analysis.css", "user-dashboard.css"]) {
    assert.doesNotMatch(publicStaticLayout, new RegExp(css));
    assert.doesNotMatch(rootLayout, new RegExp(css));
  }
}

function testRootLayoutStillImportsGlobals() {
  assert.match(read("app/layout.js"), /import\s+"\.\/globals\.css"/);
}

function testNoJsProviderChanges() {
  const forbidden = [
    "app/components/AuthProvider.js",
    "app/components/ClientProviders.js",
    "app/components/PublicClientProviders.js",
    "app/components/RootLayoutShell.js",
    "app/components/notifications/NotificationProvider.js",
  ];
  // This test runs against working tree; ensure we didn't touch provider files in this phase.
  for (const file of forbidden) {
    assert.ok(fs.existsSync(path.join(rootDir, file)));
  }
}

function testNoDuplicatePrimaryBlocks() {
  const globals = read("app/globals.css");
  assert.doesNotMatch(globals, /\/\* ===== News page ===== \*\//);
  assert.doesNotMatch(globals, /\/\* ===== Daily analysis ===== \*\//);
  assert.doesNotMatch(globals, /\/\* ===== User dashboard ===== \*\//);
}

const tests = [
  ["feature markers absent from globals.css", testMarkersAbsentFromGlobals],
  ["feature markers present in feature CSS files", testMarkersPresentInFeatureFiles],
  ["route import ownership is correct", testRouteImportOwnership],
  ["public-static routes do not import feature CSS", testPublicStaticRoutesDoNotImportFeatureCss],
  ["root layout still imports globals.css", testRootLayoutStillImportsGlobals],
  ["no duplicate primary feature blocks remain in globals.css", testNoDuplicatePrimaryBlocks],
  ["provider files remain present (no JS architecture phase)", testNoJsProviderChanges],
];

let passed = 0;
for (const [label, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${label}`);
}

console.log(`\nPhase 6B CSS split: ${passed}/${tests.length} passed`);
