#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = fs.readFileSync(
  path.join(rootDir, "app/(app)/order-book/page.js"),
  "utf8"
);
const contentSource = fs.readFileSync(
  path.join(rootDir, "app/components/order-book/OrderBookPageContent.js"),
  "utf8"
);

function testServerPageWrapsSuspense() {
  assert.doesNotMatch(pageSource, /"use client"/);
  assert.match(pageSource, /Suspense/);
  assert.match(pageSource, /OrderBookPageContent/);
  assert.match(pageSource, /OrderBookFallback/);
}

function testUseSearchParamsInClientOnly() {
  assert.doesNotMatch(pageSource, /useSearchParams/);
  assert.match(contentSource, /"use client"/);
  assert.match(contentSource, /useSearchParams/);
}

function testNoForceDynamicWorkaround() {
  for (const source of [pageSource, contentSource]) {
    assert.doesNotMatch(source, /force-dynamic/);
    assert.doesNotMatch(source, /connection\(\)/);
    assert.doesNotMatch(source, /revalidate\s*=\s*0/);
  }
}

function testBehaviorPreserved() {
  assert.match(contentSource, /searchParams\.get\("symbol"\)/);
  assert.match(contentSource, /useMarketDepthStream/);
  assert.match(contentSource, /router\.replace\(\`\/order-book/);
}

const tests = [
  ["server page wraps Suspense", testServerPageWrapsSuspense],
  ["useSearchParams stays in client subtree", testUseSearchParamsInClientOnly],
  ["no force-dynamic workaround", testNoForceDynamicWorkaround],
  ["order book query-param behavior preserved", testBehaviorPreserved],
];

for (const [name, run] of tests) {
  run();
  console.log(`✓ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} order book suspense checks passed`);
