#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testPartnerLimits() {
  assert.match(read("lib/partner-admin-server.js"), /PARTNER_DEFAULT_PAGE_SIZE = 25/);
  assert.match(read("lib/partner-admin-server.js"), /PARTNER_MAX_PAGE_SIZE = 100/);
}

function testWithdrawalListProjection() {
  const cols = read("lib/supabase-query-columns.js");
  assert.match(cols, /PARTNER_WITHDRAWAL_LIST_COLUMNS/);
  const list = cols.match(/PARTNER_WITHDRAWAL_LIST_COLUMNS\s*=\s*"([^"]+)"/)?.[1] || "";
  assert.equal(list.includes("payment_proof"), false);
  assert.equal(list.includes("admin_note"), false);
}

function testLedgerUsesLedgerColumns() {
  const src = read("lib/partner-admin-server.js");
  assert.match(src, /listAdminPartnerWalletLedger[\s\S]*?PARTNER_LEDGER_COLUMNS/);
}

function testPaginationInRoutes() {
  assert.match(read("app/api/admin/partner-withdrawals/route.js"), /\.range\(from, to\)|pagination/);
  assert.match(read("app/api/admin/partner-wallet-ledger/route.js"), /limit.*25/);
}

function testBatchProfileEnrichment() {
  assert.match(read("lib/partner-admin-server.js"), /loadProfilesByUserIds/);
  assert.match(read("lib/partner-admin-server.js"), /\.in\("id", partnerIds\)/);
}

function testNoSelectStar() {
  assert.doesNotMatch(read("lib/partner-admin-server.js"), /\.select\("\*"\)/);
}

function testCacheControl() {
  assert.match(read("app/api/admin/partner-withdrawals/route.js"), /no-store/);
}

const tests = [
  testPartnerLimits,
  testWithdrawalListProjection,
  testLedgerUsesLedgerColumns,
  testPaginationInRoutes,
  testBatchProfileEnrichment,
  testNoSelectStar,
  testCacheControl,
];

for (const test of tests) test();

console.log(`partner-query-egress: ${tests.length} passed`);
