#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();

const CORE_PAGE_PATHS = [
  "app/(public)/page.js",
  "app/(public)/HomePageClient.js",
  "app/(app)/markets/page.js",
  "app/(app)/order-book/page.js",
  "app/(public)/news/page.js",
  "app/(app)/subscriptions/page.js",
  "app/(app)/account-management/page.js",
  "app/(app)/my-dashboard/page.js",
  "app/(app)/partner-center/page.js",
  "app/(app)/daily-analysis/page.js",
  "app/(app)/admin/page.js",
  "app/(app)/admin/iam/page.js",
  "app/(app)/admin/financial-center/page.js",
  "app/(app)/admin/users/page.js",
  "app/(app)/crypto/page.js",
  "app/(app)/forex/page.js",
  "app/(app)/stocks/page.js",
];

const UNSAFE_PATTERNS = [
  { name: "bg-white", pattern: /\bbg-white\b/ },
  { name: "text-black", pattern: /\btext-black\b/ },
  { name: "dark:", pattern: /\bdark:(?:bg|text)-/ },
  { name: "hardcoded hex", pattern: /#[0-9a-fA-F]{3,8}\b/ },
];

let passed = 0;
const violations = [];

for (const rel of CORE_PAGE_PATHS) {
  const abs = join(ROOT, rel);
  assert.ok(existsSync(abs), `${rel} missing`);
  passed += 1;

  const content = readFileSync(abs, "utf8");
  for (const { name, pattern } of UNSAFE_PATTERNS) {
    if (pattern.test(content)) {
      violations.push(`${rel}: ${name}`);
    }
  }
}

assert.equal(violations.length, 0, violations.join("\n"));
passed += 1;

console.log(`test-core-page-theme-compliance: PASS (${passed} checks, ${CORE_PAGE_PATHS.length} pages)`);
