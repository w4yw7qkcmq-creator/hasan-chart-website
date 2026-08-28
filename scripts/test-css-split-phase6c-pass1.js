#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

const NOTIFICATIONS_PAGE_MARKER = ".notificationsPage__alertSuccess";
const PASS1_MARKERS = {
  news: "--news-blue:",
  dailyAnalysis: "--da-blue:",
  dashboard: "--ud-blue:",
};
const GLOBAL_NOTIFICATION_MARKERS = [
  ".notificationBell",
  ".notificationDropdown",
  ".notificationListItem",
  ".notificationToast",
  ".browserPush",
];

function testNotificationsPageMarkerAbsentFromGlobals() {
  const globals = read("app/globals.css");
  assert.doesNotMatch(globals, /\.notificationsPage\s*\{/);
  assert.doesNotMatch(globals, /\.notificationsPage__/);
}

function testNotificationsPageMarkerPresentInFeatureFile() {
  const css = read("app/styles/notifications-page.css");
  assert.match(css, /\/\* ===== Notifications page ===== \*\//);
  assert.match(css, /\.notificationsPage__alertSuccess/);
  assert.match(css, /\.notificationsPage\s*\{/);
  assert.match(css, /html\[data-theme="light"\] \.notificationsPage__title/);
}

function testNotificationsPageImportOwnership() {
  for (const file of [
    "app/(app)/notifications/layout.js",
    "app/(app)/notification-settings/layout.js",
    "app/(app)/notification-sound-settings/layout.js",
  ]) {
    assert.match(read(file), /styles\/notifications-page\.css/);
  }
}

function testRootAndGroupLayoutsDoNotImportNotificationsPageCss() {
  const forbiddenImports = [
    "app/layout.js",
    "app/(app)/layout.js",
    "app/(public-static)/layout.js",
    "app/(public)/layout.js",
  ];
  for (const file of forbiddenImports) {
    assert.doesNotMatch(read(file), /notifications-page\.css/);
  }
}

function testGlobalNotificationUiRemainsInGlobals() {
  const globals = read("app/globals.css");
  for (const marker of GLOBAL_NOTIFICATION_MARKERS) {
    assert.match(globals, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
}

function testGlobalFocusVisibleRemainsInGlobals() {
  const globals = read("app/globals.css");
  assert.match(globals, /:focus-visible|:focus/);
}

function testPhase6bOwnershipIntact() {
  const globals = read("app/globals.css");
  for (const marker of Object.values(PASS1_MARKERS)) {
    assert.doesNotMatch(globals, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(read("app/styles/subscriptions.css"), /--sub-royal:/);
  assert.match(read("app/(app)/subscriptions/layout.js"), /styles\/subscriptions\.css/);
  assert.match(read("app/(public)/news/layout.js"), /styles\/news\.css/);
  assert.match(read("app/(app)/daily-analysis/layout.js"), /styles\/daily-analysis\.css/);
  assert.match(read("app/(app)/my-dashboard/layout.js"), /styles\/user-dashboard\.css/);
}

function testNotificationsPageCssOnlyImportedByApprovedLayouts() {
  const approved = new Set([
    "app/(app)/notifications/layout.js",
    "app/(app)/notification-settings/layout.js",
    "app/(app)/notification-sound-settings/layout.js",
  ]);
  const layouts = [
    "app/(app)/notifications/layout.js",
    "app/(app)/notification-settings/layout.js",
    "app/(app)/notification-sound-settings/layout.js",
    "app/(app)/subscriptions/layout.js",
    "app/(app)/alerts/layout.js",
    "app/(public)/news/layout.js",
    "app/(app)/my-dashboard/layout.js",
    "app/(public-static)/markets/layout.js",
  ];
  for (const file of layouts) {
    const content = read(file);
    if (approved.has(file)) {
      assert.match(content, /notifications-page\.css/);
    } else {
      assert.doesNotMatch(content, /notifications-page\.css/);
    }
  }
}

const tests = [
  ["notification-page marker absent from globals.css", testNotificationsPageMarkerAbsentFromGlobals],
  ["notification-page marker present in notifications-page.css", testNotificationsPageMarkerPresentInFeatureFile],
  ["notifications-page.css imported by approved route layouts", testNotificationsPageImportOwnership],
  ["root/app/public-static layouts do not import notifications-page.css", testRootAndGroupLayoutsDoNotImportNotificationsPageCss],
  ["bell/dropdown/toast/browserPush remain global", testGlobalNotificationUiRemainsInGlobals],
  ["global focus-visible remains global", testGlobalFocusVisibleRemainsInGlobals],
  ["Phase 6B ownership remains intact", testPhase6bOwnershipIntact],
  ["narrow notifications-page import ownership", testNotificationsPageCssOnlyImportedByApprovedLayouts],
];

let passed = 0;
for (const [label, fn] of tests) {
  fn();
  passed += 1;
  console.log(`✓ ${label}`);
}

console.log(`\nPhase 6C CSS split Pass 1: ${passed}/${tests.length} passed`);
