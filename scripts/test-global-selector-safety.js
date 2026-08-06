#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const CSS_FILES = [
  "app/globals.css",
  "app/design-system/design-system-theme.css",
  "app/(app)/order-book/order-book-theme.css",
];

const ALLOWED_HAS = [];

function listCssFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) listCssFiles(abs, acc);
    else if (entry.name.endsWith(".css")) acc.push(abs);
  }
  return acc;
}

let passed = 0;
const violations = [];

for (const rel of CSS_FILES) {
  const abs = join(ROOT, rel);
  assert.ok(existsSync(abs), `${rel} missing`);
  const content = readFileSync(abs, "utf8");
  if (/\[class\*=/.test(content)) violations.push(`${rel}: [class*="..."]`);
  if (/\[class\^=/.test(content)) violations.push(`${rel}: [class^="..."]`);
  if (/\[class\$=/.test(content)) violations.push(`${rel}: [class$="..."]`);
  const hasMatches = content.match(/:has\([^)]+\)/g) || [];
  for (const match of hasMatches) {
    if (!ALLOWED_HAS.some((allowed) => match.includes(allowed))) {
      violations.push(`${rel}: undocumented ${match}`);
    }
  }
  passed += 1;
}

assert.equal(violations.length, 0, violations.join("\n"));
passed += 1;

console.log(`test-global-selector-safety: PASS (${passed} checks)`);
