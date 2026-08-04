#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLimit } from "../lib/pagination.js";
import { IAM_LIST_LIMITS, parseIamListParams } from "../lib/iam/list-api-helpers.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testDefaultAndMaxLimits() {
  assert.equal(parseLimit(null, IAM_LIST_LIMITS.audit), 50);
  assert.equal(parseLimit("999", IAM_LIST_LIMITS.audit), 100);
  assert.equal(parseLimit("20", { defaultLimit: 25, maxLimit: 100 }), 20);
}

function testInvalidCursorParam() {
  assert.throws(
    () => parseIamListParams(new URLSearchParams("cursor=bad"), IAM_LIST_LIMITS.audit),
    /Invalid cursor/
  );
}

function testHasMorePattern() {
  const feed = read("app/api/notification-hub/feed/route.js");
  assert.match(feed, /limit \+ 1/);
  assert.match(feed, /buildPaginationResult/);
}

function testAdminUsersCap() {
  const helpers = read("lib/admin-user-list-response-helpers.js");
  assert.match(helpers, /ADMIN_USER_LIST_ALL_CAP = 100/);
  const admin = read("lib/admin-user-management.js");
  assert.match(admin, /, 100\)/);
}

function testNoFetch1000Pattern() {
  assert.doesNotMatch(read("lib/admin-user-list-response-helpers.js"), /1000/);
}

function testIncludeTotalExplicit() {
  assert.match(read("lib/iam/list-api-helpers.js"), /includeTotal/);
  assert.match(read("app/api/iam/audit/route.js"), /count: "exact"/);
}

function testBackwardCompatLegacyKeys() {
  assert.match(read("app/api/iam/audit/route.js"), /legacyKey: "logs"/);
  assert.match(read("app/api/iam/security-events/route.js"), /legacyKey: "events"/);
  assert.match(read("app/api/iam/sessions/route.js"), /legacyKey: "sessions"/);
}

function testUiLoadMore() {
  assert.match(read("app/components/iam/IamPolish.js"), /تحميل المزيد/);
  assert.match(read("app/components/iam/useIamListFeed.js"), /loadMore/);
}

function testExportCurrentPage() {
  assert.match(read("app/components/iam/IamPolish.js"), /exportToJson\(filtered/);
}

function testPermissionRoutes() {
  assert.match(read("app/api/iam/audit/route.js"), /IAM_AUDIT_READ/);
  assert.match(read("app/api/iam/security-events/route.js"), /IAM_SECURITY_READ/);
  assert.match(read("app/api/iam/sessions/route.js"), /IAM_SESSIONS_READ/);
}

const tests = [
  testDefaultAndMaxLimits,
  testInvalidCursorParam,
  testHasMorePattern,
  testAdminUsersCap,
  testNoFetch1000Pattern,
  testIncludeTotalExplicit,
  testBackwardCompatLegacyKeys,
  testUiLoadMore,
  testExportCurrentPage,
  testPermissionRoutes,
];

for (const test of tests) {
  test();
}

console.log(`admin-pagination: ${tests.length} passed`);
