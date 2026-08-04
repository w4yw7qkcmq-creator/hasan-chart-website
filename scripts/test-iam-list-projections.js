#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  IAM_LIST_LIMITS,
  buildIamListResponse,
  mapAuditListRow,
  mapSecurityListRow,
  mapSessionListRow,
  parseIamListParams,
} from "../lib/iam/list-api-helpers.js";
import { decodeCursor, encodeCursor, parseLimit } from "../lib/pagination.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testIamLimits() {
  assert.equal(IAM_LIST_LIMITS.audit.defaultLimit, 50);
  assert.equal(IAM_LIST_LIMITS.audit.maxLimit, 100);
  assert.equal(IAM_LIST_LIMITS.security.maxLimit, 100);
  assert.equal(IAM_LIST_LIMITS.sessions.maxLimit, 100);
}

function testAuditProjection() {
  const row = mapAuditListRow({
    id: "1",
    actor_id: "u1",
    actor_email: "a@example.com",
    action: "iam.role.grant",
    target_type: "role",
    target_id: "r1",
    created_at: "2026-01-01T00:00:00.000Z",
    ip_address: "203.0.113.10",
    metadata: { reason: "test", severity: "high", debug: { huge: "x".repeat(5000) } },
  });
  assert.equal(row.reason, "test");
  assert.equal(row.severity, "high");
  assert.equal("metadata" in row, false);
  assert.equal("before_data" in row, false);
}

function testSecurityProjection() {
  const row = mapSecurityListRow(
    {
      id: "1",
      event_type: "login.failed",
      severity: "high",
      user_id: "u1",
      ip_address: "203.0.113.10",
      created_at: "2026-01-01T00:00:00.000Z",
      details: { message: "bad password", token: "secret", resolved: true },
    },
    { u1: { email: "user@example.com" } }
  );
  assert.equal(row.actor_email, "user@example.com");
  assert.equal(row.message, "bad password");
  assert.equal("details" in row, false);
  assert.equal("token" in row, false);
}

function testSessionProjection() {
  const row = mapSessionListRow({
    id: "1",
    user_id: "u1",
    session_id_hash: "abcdef1234567890",
    started_at: "2026-01-01T00:00:00.000Z",
    ended_at: null,
    last_activity_at: "2026-01-02T00:00:00.000Z",
    ip_address: "203.0.113.10",
    user_agent: "Mozilla/5.0",
  });
  assert.equal(row.session_ref, "abcdef12");
  assert.equal(row.status, "active");
  assert.equal("session_id_hash" in row, false);
}

function testListResponseShape() {
  const body = buildIamListResponse({
    items: [{ id: "1" }],
    pagination: { limit: 50, hasMore: false, nextCursor: null },
    legacyKey: "logs",
    legacyItems: [{ id: "1" }],
  });
  assert.ok(Array.isArray(body.items));
  assert.ok(body.pagination);
  assert.deepEqual(body.logs, body.items);
}

function testInvalidCursor() {
  assert.throws(() => decodeCursor("not-valid"), /Invalid cursor/);
}

function testStableCursorPagination() {
  const cursor = encodeCursor({ createdAt: "2026-01-01T00:00:00.000Z", id: "abc" });
  const decoded = decodeCursor(cursor);
  assert.equal(decoded.id, "abc");
}

function testRouteSourcesNoSelectStar() {
  for (const file of [
    "app/api/iam/audit/route.js",
    "app/api/iam/security-events/route.js",
  ]) {
    const src = read(file);
    assert.doesNotMatch(src, /\.select\("\*"\)/);
    assert.doesNotMatch(src, /\.select\('\*'\)/);
  }
}

function testDetailQueryParam() {
  const audit = read("app/api/iam/audit/route.js");
  const security = read("app/api/iam/security-events/route.js");
  assert.match(audit, /params\.id/);
  assert.match(audit, /includeMetadata/);
  assert.match(security, /params\.id/);
}

function testCacheControlNoStore() {
  for (const file of [
    "app/api/iam/audit/route.js",
    "app/api/iam/security-events/route.js",
    "app/api/iam/sessions/route.js",
  ]) {
    assert.match(read(file), /CACHE_NO_STORE|no-store/);
  }
}

function testParseIncludeTotalDefaultFalse() {
  const params = parseIamListParams(new URLSearchParams(""), IAM_LIST_LIMITS.audit);
  assert.equal(params.includeTotal, false);
  const withTotal = parseIamListParams(new URLSearchParams("includeTotal=true"), IAM_LIST_LIMITS.audit);
  assert.equal(withTotal.includeTotal, true);
}

const tests = [
  testIamLimits,
  testAuditProjection,
  testSecurityProjection,
  testSessionProjection,
  testListResponseShape,
  testInvalidCursor,
  testStableCursorPagination,
  testRouteSourcesNoSelectStar,
  testDetailQueryParam,
  testCacheControlNoStore,
  testParseIncludeTotalDefaultFalse,
];

for (const test of tests) {
  test();
}

console.log(`iam-list-projections: ${tests.length} passed`);
