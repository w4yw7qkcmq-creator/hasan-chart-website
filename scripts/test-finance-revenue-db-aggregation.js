#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testNoRevenueScanConstant() {
  assert.doesNotMatch(read("lib/financial-center/financial-center-shared.js"), /FINANCIAL_REVENUE_SCAN_MAX_ROWS/);
}

function testRevenueUsesRpc() {
  assert.match(read("lib/financial-center/revenue-service.js"), /get_financial_revenue_summary/);
  assert.doesNotMatch(read("lib/financial-center/revenue-service.js"), /loadRecognizedRevenueRows/);
  assert.doesNotMatch(read("lib/financial-center/revenue-service.js"), /aggregateRecognizedRows/);
  assert.doesNotMatch(read("lib/financial-center/revenue-service.js"), /\.limit\(/);
}

function testRevenueMigrationExists() {
  const migration = read("supabase/migrations/20260805_financial_revenue_db_aggregation.sql");
  assert.match(migration, /get_financial_revenue_summary/);
  assert.match(migration, /SECURITY INVOKER/);
  assert.match(migration, /scannedRows/);
}

function testRevenueScanCompleteAlwaysTrue() {
  assert.match(read("lib/financial-center/revenue-service.js"), /scanComplete: true/);
  assert.match(read("lib/financial-center/revenue-service.js"), /scannedRows: 0/);
}

const tests = [
  testNoRevenueScanConstant,
  testRevenueUsesRpc,
  testRevenueMigrationExists,
  testRevenueScanCompleteAlwaysTrue,
];

for (const test of tests) {
  test();
}

console.log(`finance-revenue-db-aggregation: ${tests.length} passed`);
