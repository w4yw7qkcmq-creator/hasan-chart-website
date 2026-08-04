#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testListHasProofAvailableNotUrl() {
  const payment = read("lib/financial-center/payment-service.js");
  assert.match(payment, /proofAvailable/);
  assert.doesNotMatch(payment, /proofUrl/);
}

function testDetailRouteSignedUrl() {
  const detail = read("app/api/admin/financial-center/payment-proof/[requestId]/route.js");
  assert.match(detail, /createSignedUrl|signedUrl/);
  assert.match(detail, /requireAdminPermission|FINANCE_READ/);
}

function hasInlineProofColumn(columns) {
  return /(?:^|,)payment_proof(?!_)(?:,|$)/.test(columns);
}

function testListColumnsExcludeInlineProof() {
  const shared = read("lib/financial-center/financial-center-shared.js");
  const list = shared.match(/FINANCIAL_SUBSCRIPTION_PROOF_LIST_COLUMNS\s*=\s*"([^"]+)"/)?.[1] || "";
  assert.equal(hasInlineProofColumn(list), false);
}

function testPartnerWithdrawalListNoProof() {
  const cols = read("lib/supabase-query-columns.js");
  const list = cols.match(/PARTNER_WITHDRAWAL_LIST_COLUMNS\s*=\s*"([^"]+)"/)?.[1] || "";
  assert.equal(list.includes("payment_proof"), false);
}

function testUnauthorizedDetailPattern() {
  assert.match(read("app/api/admin/financial-center/payment-proof/[requestId]/route.js"), /adminCheck\.ok|FINANCE_PROOFS_READ/);
}

const tests = [
  testListHasProofAvailableNotUrl,
  testDetailRouteSignedUrl,
  testListColumnsExcludeInlineProof,
  testPartnerWithdrawalListNoProof,
  testUnauthorizedDetailPattern,
];

for (const test of tests) test();

console.log(`payment-proof-lazy-access: ${tests.length} passed`);
