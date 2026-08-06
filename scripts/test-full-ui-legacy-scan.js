#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import assert from "node:assert/strict";
import {
  UNSAFE_UI_PATTERNS,
  FINANCIAL_CHART_ALLOWLIST,
} from "../app/components/ui/ui-theme.js";

const ROOT = process.cwd();
const APP = join(ROOT, "app");
const SKIP = new Set([
  "app/components/ui/ui-theme.js",
  "app/components/order-book/order-book-theme.js",
]);

function listJsFiles(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) listJsFiles(abs, acc);
    else if (/\.(js|jsx|tsx)$/.test(entry.name)) acc.push(abs);
  }
  return acc;
}

const violations = [];

for (const abs of listJsFiles(APP)) {
  const rel = relative(ROOT, abs);
  if (SKIP.has(rel)) continue;

  const content = readFileSync(abs, "utf8");
  if (FINANCIAL_CHART_ALLOWLIST.some((token) => content.includes(token))) {
    continue;
  }

  const isUiPrimitive = rel.startsWith("app/components/ui/");
  for (const pattern of UNSAFE_UI_PATTERNS) {
    if (isUiPrimitive && String(pattern) === String(/<select[\s>]/)) {
      continue;
    }
    if (pattern.test(content)) {
      violations.push(`${rel}: matched ${pattern}`);
      break;
    }
  }
}

assert.equal(violations.length, 0, violations.slice(0, 40).join("\n"));
console.log(
  `test-full-ui-legacy-scan: PASS (0 legacy JSX violations, ${listJsFiles(APP).length} files scanned)`,
);
