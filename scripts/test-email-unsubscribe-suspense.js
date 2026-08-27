#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pageSource = fs.readFileSync(
  path.join(rootDir, "app/email/unsubscribe/page.js"),
  "utf8"
);
const clientSource = fs.readFileSync(
  path.join(rootDir, "app/email/unsubscribe/UnsubscribeClient.js"),
  "utf8"
);

function testServerPageWrapsSuspense() {
  assert.doesNotMatch(pageSource, /"use client"/);
  assert.match(pageSource, /Suspense/);
  assert.match(pageSource, /UnsubscribeClient/);
  assert.match(pageSource, /UnsubscribeFallback/);
}

function testUseSearchParamsInClientOnly() {
  assert.doesNotMatch(pageSource, /useSearchParams/);
  assert.match(clientSource, /"use client"/);
  assert.match(clientSource, /useSearchParams/);
}

function testNoForceDynamicWorkaround() {
  for (const source of [pageSource, clientSource]) {
    assert.doesNotMatch(source, /force-dynamic/);
    assert.doesNotMatch(source, /connection\(\)/);
    assert.doesNotMatch(source, /revalidate\s*=\s*0/);
  }
}

function testBehaviorPreserved() {
  assert.match(clientSource, /token/);
  assert.match(clientSource, /\/api\/email\/unsubscribe/);
  assert.match(clientSource, /تأكيد إلغاء الاشتراك/);
  assert.match(clientSource, /تم إلغاء الاشتراك/);
}

const tests = [
  ["server page wraps Suspense", testServerPageWrapsSuspense],
  ["useSearchParams stays in client subtree", testUseSearchParamsInClientOnly],
  ["no force-dynamic workaround", testNoForceDynamicWorkaround],
  ["unsubscribe behavior preserved", testBehaviorPreserved],
];

for (const [name, run] of tests) {
  run();
  console.log(`✓ ${name}`);
}

console.log(`\n${tests.length}/${tests.length} email unsubscribe suspense checks passed`);
