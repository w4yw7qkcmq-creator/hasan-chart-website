#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const ALLOWLIST = join(ROOT, "scripts/design-system-legacy-allowlist.json");

const json = JSON.parse(readFileSync(ALLOWLIST, "utf8"));
let passed = 0;

const removedCorePaths = [
  "app/(app)/news/",
  "app/(app)/subscriptions/",
  "app/(app)/order-book/",
  "app/(app)/account-management/",
  "app/components/order-book/",
];

const legacyPaths = (json.paths || []).concat((json.exceptions || []).map((e) => e.file));

for (const core of removedCorePaths) {
  assert.ok(
    !legacyPaths.some((p) => p === core || p.startsWith(core)),
    `core path still allowlisted: ${core}`
  );
  passed += 1;
}

assert.equal(json.exceptions.length, 0, `allowlist must be empty: ${json.exceptions.length} exceptions`);
passed += 1;

console.log(`test-design-system-allowlist: PASS (${passed} checks)`);
