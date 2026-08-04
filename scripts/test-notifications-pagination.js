#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLimit } from "../lib/pagination.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testFeedLimits() {
  assert.equal(parseLimit(null, { defaultLimit: 20, maxLimit: 50 }), 20);
  assert.equal(parseLimit("100", { defaultLimit: 20, maxLimit: 50 }), 50);
}

function testCompositeCursor() {
  const feed = read("app/api/notification-hub/feed/route.js");
  assert.match(feed, /applyCreatedAtIdCursor/);
  assert.match(feed, /decodeCursor/);
  assert.doesNotMatch(feed, /\.lt\("created_at", cursor\)/);
}

function testNoMetadataInFeedColumns() {
  const cols = read("lib/supabase-query-columns.js");
  assert.match(cols, /NOTIFICATION_HUB_FEED_COLUMNS/);
  const feedCols = cols.match(/NOTIFICATION_HUB_FEED_COLUMNS\s*=\s*"([^"]+)"/)?.[1] || "";
  assert.equal(feedCols.includes("metadata"), false);
}

function testUnreadCountOptional() {
  assert.match(read("app/api/notification-hub/feed/route.js"), /includeUnreadCount/);
}

function testPrivateNoStore() {
  assert.match(read("app/api/notification-hub/feed/route.js"), /private, no-store/);
}

function testBellFeedLimitBounded() {
  const hook = read("app/hooks/useSiteNotifications.js");
  assert.match(hook, /BELL_FEED_LIMIT = 50/);
  assert.match(hook, /limit: String\(BELL_FEED_LIMIT\)/);
}

function testPaginationResponseShape() {
  assert.match(read("app/api/notification-hub/feed/route.js"), /pagination/);
  assert.match(read("app/api/notification-hub/feed/route.js"), /hasMore/);
}

function testUserScopedQuery() {
  assert.match(read("app/api/notification-hub/feed/route.js"), /eq\("user_email", email\)/);
}

const tests = [
  testFeedLimits,
  testCompositeCursor,
  testNoMetadataInFeedColumns,
  testUnreadCountOptional,
  testPrivateNoStore,
  testBellFeedLimitBounded,
  testPaginationResponseShape,
  testUserScopedQuery,
];

for (const test of tests) {
  test();
}

console.log(`notifications-pagination: ${tests.length} passed`);
