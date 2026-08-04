#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routeSource = fs.readFileSync(path.join(root, "app/api/health/route.js"), "utf8");
const healthSource = fs.readFileSync(path.join(root, "lib/health-check.js"), "utf8");

function testRouteSupportsDetailFlag() {
  assert.match(routeSource, /detail/);
  assert.match(routeSource, /collectHealthReport\(\{ detail \}\)/);
}

function testCompactModeBranch() {
  assert.match(healthSource, /if \(!detail\)/);
  assert.match(healthSource, /marketHistory/);
}

function testDefaultResponseFields() {
  assert.match(routeSource, /readiness/);
  assert.match(routeSource, /database/);
  assert.match(routeSource, /build/);
}

function testHealthNoStore() {
  assert.match(routeSource, /CACHE_NO_STORE/);
}

const tests = [
  ["route detail flag", testRouteSupportsDetailFlag],
  ["compact mode branch", testCompactModeBranch],
  ["default response fields", testDefaultResponseFields],
  ["health no-store", testHealthNoStore],
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
console.log(`\n${tests.length}/${tests.length} health compact tests passed`);
