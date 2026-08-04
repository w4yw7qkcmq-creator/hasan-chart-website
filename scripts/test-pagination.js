#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  buildPaginationResult,
  decodeCursor,
  encodeCursor,
  parseLimit,
} from "../lib/pagination.js";

function testParseLimit() {
  assert.equal(parseLimit(undefined, { defaultLimit: 20, maxLimit: 50 }), 20);
  assert.equal(parseLimit("20"), 20);
  assert.equal(parseLimit("999", { maxLimit: 50 }), 50);
  assert.equal(parseLimit("0", { defaultLimit: 20, maxLimit: 50 }), 1);
}

function testCursorRoundtrip() {
  const cursor = encodeCursor({ createdAt: "2026-08-04T12:00:00.000Z", id: "abc-123" });
  assert.deepEqual(decodeCursor(cursor), {
    createdAt: "2026-08-04T12:00:00.000Z",
    id: "abc-123",
  });
}

function testInvalidCursor() {
  assert.throws(() => decodeCursor("not-valid"), (error) => error.code === "INVALID_CURSOR");
}

function testBuildPaginationResult() {
  const rows = [
    { id: "3", created_at: "2026-08-04T10:00:00.000Z" },
    { id: "2", created_at: "2026-08-04T09:00:00.000Z" },
    { id: "1", created_at: "2026-08-04T08:00:00.000Z" },
  ];
  const result = buildPaginationResult(rows, 2);
  assert.equal(result.items.length, 2);
  assert.equal(result.pagination.hasMore, true);
  assert.ok(result.pagination.nextCursor);
}

const tests = [
  ["parseLimit defaults and max", testParseLimit],
  ["cursor roundtrip", testCursorRoundtrip],
  ["invalid cursor", testInvalidCursor],
  ["buildPaginationResult hasMore", testBuildPaginationResult],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✖ ${name}: ${error.message}`);
  }
}

if (failed > 0) process.exit(1);
console.log(`\n${tests.length}/${tests.length} pagination tests passed`);
