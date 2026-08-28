#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

const HUB_MARKER = ".notificationHub__search";
const PAGE_MARKER = ".notificationsPage__alertSuccess";
const GLOBAL_MARKERS = [
  ".notificationBell",
  ".notificationDropdown",
  ".notificationToast",
  ".browserPush",
];

function testNotificationHubMarkerAbsentFromGlobals() {
  const globals = read("app/globals.css");
  assert.doesNotMatch(globals, /\.notificationHub\s*\{/);
  assert.doesNotMatch(globals, /\.notificationHub__/);
  assert.doesNotMatch(globals, /\.notificationHubList/);
  assert.doesNotMatch(globals, /\.notificationHubItem/);
}

function testNotificationHubMarkerPresentInFeatureFile() {
  const css = read("app/styles/notification-hub.css");
  assert.match(css, /\/\* ===== Notification hub/);
  assert.match(css, /\.notificationHub__search/);
  assert.match(css, /\.notificationHubItem__title/);
  assert.match(css, /html\[data-theme="light"\] \.notificationHub/);
}

function testNotificationHubImportOwnership() {
  assert.match(read("app/(app)/notifications/layout.js"), /styles\/notification-hub\.css/);
}

function testSettingsLayoutsDoNotImportHubCss() {
  for (const file of [
    "app/(app)/notification-settings/layout.js",
    "app/(app)/notification-sound-settings/layout.js",
  ]) {
    const content = read(file);
    assert.match(content, /notifications-page\.css/);
    assert.doesNotMatch(content, /notification-hub\.css/);
  }
}

function testRootAndGroupLayoutsDoNotImportHubCss() {
  for (const file of [
    "app/layout.js",
    "app/(app)/layout.js",
    "app/(public-static)/layout.js",
    "app/(public)/layout.js",
  ]) {
    assert.doesNotMatch(read(file), /notification-hub\.css/);
  }
}

function testGlobalNotificationUiRemainsInGlobals() {
  const globals = read("app/globals.css");
  for (const marker of GLOBAL_MARKERS) {
    assert.match(globals, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
}

function testNotificationsPageRemainsSeparate() {
  const pageCss = read("app/styles/notifications-page.css");
  const hubCss = read("app/styles/notification-hub.css");
  assert.match(pageCss, /\.notificationsPage__alertSuccess/);
  assert.doesNotMatch(pageCss, /\.notificationHub/);
  assert.doesNotMatch(hubCss, /\.notificationsPage/);
}

function testPhase6cPass1OwnershipPreserved() {
  for (const file of [
    "app/(app)/notifications/layout.js",
    "app/(app)/notification-settings/layout.js",
    "app/(app)/notification-sound-settings/layout.js",
  ]) {
    assert.match(read(file), /notifications-page\.css/);
  }
  assert.doesNotMatch(read("app/globals.css"), /\.notificationsPage/);
}

function testGlobalFocusRulesPreserved() {
  assert.match(read("app/globals.css"), /:focus-visible|:focus/);
}

function testNoDuplicateHubMarkersAcrossFiles() {
  const files = {
    globals: read("app/globals.css"),
    page: read("app/styles/notifications-page.css"),
    hub: read("app/styles/notification-hub.css"),
  };
  assert.doesNotMatch(files.globals, /\.notificationHub/);
  assert.doesNotMatch(files.page, /\.notificationHub/);
  assert.match(files.hub, /\.notificationHub/);
  assert.doesNotMatch(files.hub, /\.notificationBell|\.browserPushBtn|\.notificationDropdown/);
}

function testPhase6bOwnershipIntact() {
  assert.match(read("app/styles/subscriptions.css"), /--sub-royal:/);
  assert.match(read("app/(public)/news/layout.js"), /styles\/news\.css/);
  assert.match(read("app/(app)/daily-analysis/layout.js"), /styles\/daily-analysis\.css/);
  assert.match(read("app/(app)/my-dashboard/layout.js"), /styles\/user-dashboard\.css/);
}

const tests = [
  ["notificationHub marker absent from globals.css", testNotificationHubMarkerAbsentFromGlobals],
  ["notificationHub marker present in notification-hub.css", testNotificationHubMarkerPresentInFeatureFile],
  ["notification-hub.css imported only by /notifications layout", testNotificationHubImportOwnership],
  ["settings layouts do not import notification-hub.css", testSettingsLayoutsDoNotImportHubCss],
  ["root/app/public-static layouts do not import notification-hub.css", testRootAndGroupLayoutsDoNotImportHubCss],
  ["notificationBell/browserPush/toast remain global", testGlobalNotificationUiRemainsInGlobals],
  ["notificationsPage remains in notifications-page.css only", testNotificationsPageRemainsSeparate],
  ["Phase 6C Pass 1 ownership preserved", testPhase6cPass1OwnershipPreserved],
  ["global focus rules preserved", testGlobalFocusRulesPreserved],
  ["no duplicate hub markers across feature/core files", testNoDuplicateHubMarkersAcrossFiles],
  ["Phase 6B ownership remains intact", testPhase6bOwnershipIntact],
];

let passed = 0;
for (const [label, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${label}`);
}

console.log(`\nPhase 6C CSS split Pass 2: ${passed}/${tests.length} passed`);
