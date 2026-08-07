#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildFinancialCenterSearchParams,
  isValidFinancialCenterCursor,
} from "../lib/admin-financial-center-client.js";
import { encodeCursor } from "../lib/pagination.js";

const ROOT = process.cwd();
const read = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

function queryString(section, query) {
  return buildFinancialCenterSearchParams(section, query).toString();
}

function testNoCursorOmitted() {
  const qs = queryString("subscriptions", {
    status: "all",
    service: "all",
    source: "all",
    paid: "all",
    search: "",
  });
  assert.doesNotMatch(qs, /(^|&)cursor=/);
}

function testInvalidCursorsOmitted() {
  for (const cursor of [undefined, null, "", "undefined", "null", "  undefined  "]) {
    const qs = queryString("subscriptions", {
      cursor,
      status: "all",
      service: "vip_forex",
    });
    assert.doesNotMatch(qs, /(^|&)cursor=/, `cursor=${cursor} should be omitted`);
  }
}

function testValidCursorIncluded() {
  const cursor = encodeCursor({ createdAt: "2026-08-07T12:00:00.000Z", id: "42" });
  const qs = queryString("subscriptions", {
    cursor,
    service: "vip_spot",
    status: "all",
  });
  assert.match(qs, /(^|&)cursor=/);
  assert.match(qs, new RegExp(`cursor=${encodeURIComponent(cursor)}`));
}

function testServiceFilterFirstRequestHasNoCursor() {
  const qs = queryString("subscriptions", {
    status: "all",
    service: "vip_forex",
    source: "all",
    paid: "all",
  });
  assert.match(qs, /service=vip_forex/);
  assert.doesNotMatch(qs, /(^|&)cursor=/);
}

function testSpotFuturesAllFiltersUnchanged() {
  for (const service of ["all", "vip_spot", "vip_futures", "vip_forex"]) {
    const qs = queryString("subscriptions", { service, status: "all" });
    assert.match(qs, new RegExp(`service=${service}`));
    assert.doesNotMatch(qs, /cursor=undefined/);
  }
}

function testPaginationNextPageUsesCursor() {
  const cursor = encodeCursor({ createdAt: "2026-08-07T12:00:00.000Z", id: "99" });
  const qs = queryString("subscriptions", {
    cursor,
    service: "vip_futures",
    status: "active",
  });
  assert.match(qs, /service=vip_futures/);
  assert.match(qs, /status=active/);
  assert.match(qs, /cursor=/);
}

function testPanelOmitsUndefinedCursorPattern() {
  const panel = read("app/(app)/admin/components/FinancialCenterPanel.js");
  assert.doesNotMatch(panel, /cursor:\s*subscriptionCursor\s*\|\|\s*undefined/);
  assert.doesNotMatch(panel, /cursor:\s*paymentCursor\s*\|\|\s*undefined/);
  assert.match(panel, /\.\.\.\(subscriptionCursor \? \{ cursor: subscriptionCursor \} : \{\}\)/);
  assert.match(panel, /setSubscriptionCursor\(null\)/);
}

function testApiDefensiveNormalization() {
  const route = read("app/api/admin/financial-center/route.js");
  assert.match(route, /rawCursor/);
  assert.match(route, /\["undefined", "null"\]/);
}

function testCursorValidator() {
  assert.equal(isValidFinancialCenterCursor(undefined), false);
  assert.equal(isValidFinancialCenterCursor(null), false);
  assert.equal(isValidFinancialCenterCursor(""), false);
  assert.equal(isValidFinancialCenterCursor("undefined"), false);
  assert.equal(isValidFinancialCenterCursor("null"), false);
  assert.equal(
    isValidFinancialCenterCursor(encodeCursor({ createdAt: "2026-08-07T12:00:00.000Z", id: "1" })),
    true
  );
}

const tests = [
  ["no cursor omits query param", testNoCursorOmitted],
  ["invalid cursors omitted", testInvalidCursorsOmitted],
  ["valid cursor included", testValidCursorIncluded],
  ["service filter first request has no cursor", testServiceFilterFirstRequestHasNoCursor],
  ["spot/futures/all filters unchanged", testSpotFuturesAllFiltersUnchanged],
  ["pagination next page uses cursor", testPaginationNextPageUsesCursor],
  ["panel omits undefined cursor pattern", testPanelOmitsUndefinedCursorPattern],
  ["api defensive normalization", testApiDefensiveNormalization],
  ["cursor validator", testCursorValidator],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}:`, error?.message || error);
  }
}

if (failed > 0) {
  process.exit(1);
}

console.log(`Financial center cursor tests PASS (${tests.length})`);
