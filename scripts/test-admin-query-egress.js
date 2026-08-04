#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testNoSelectStarInModifiedRoutes() {
  const targets = [
    "app/api/iam/audit/route.js",
    "app/api/iam/security-events/route.js",
    "app/api/notification-hub/feed/route.js",
    "lib/iam/session-log.js",
    "lib/admin-user-management.js",
  ];
  for (const file of targets) {
    const src = read(file);
    assert.doesNotMatch(src, /select\("\*"\)/, `${file} must not select("*")`);
    assert.doesNotMatch(src, /select\('\*'\)/, `${file} must not select('*')`);
  }
}

function testSignedUrlLazyOnFinanceDetail() {
  const detail = read("app/api/admin/financial-center/payment-proof/[requestId]/route.js");
  assert.match(detail, /signedUrl/);
  const listRoutes = [
    "app/api/admin/subscription-requests/route.js",
    "app/api/admin/financial-center/route.js",
  ].filter((file) => fs.existsSync(path.join(root, file)));

  for (const file of listRoutes) {
    assert.doesNotMatch(read(file), /createSignedUrl|signedUrl/, `${file} should not sign per row`);
  }
}

function testDashboardCacheTtl() {
  const dash = read("app/api/admin/dashboard/route.js");
  assert.match(dash, /withReadCache/);
  assert.match(dash, /ADMIN_DASHBOARD_STATS_CACHE_MS/);
}

function testAdminSearchMinChars() {
  assert.match(read("lib/admin-user-management.js"), /trimmed\.length >= 2/);
}

function testNoSharedUserCacheOnIam() {
  for (const file of [
    "app/api/iam/audit/route.js",
    "app/api/iam/security-events/route.js",
    "app/api/iam/sessions/route.js",
  ]) {
    assert.doesNotMatch(read(file), /withReadCache/);
  }
}

function testExactCountNotDefaultOnIamLists() {
  const audit = read("app/api/iam/audit/route.js");
  assert.match(audit, /includeTotal \? \{ count: "exact" \} : undefined/);
}

const tests = [
  testNoSelectStarInModifiedRoutes,
  testSignedUrlLazyOnFinanceDetail,
  testDashboardCacheTtl,
  testAdminSearchMinChars,
  testNoSharedUserCacheOnIam,
  testExactCountNotDefaultOnIamLists,
];

for (const test of tests) {
  test();
}

console.log(`admin-query-egress: ${tests.length} passed`);
