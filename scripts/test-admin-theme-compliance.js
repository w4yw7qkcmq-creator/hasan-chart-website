#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const ADMIN_ROOT = join(ROOT, "app/(app)/admin");
const ADMIN_THEME = join(ADMIN_ROOT, "admin-theme.css");

const LEGACY_JSX_PATTERNS = [
  { name: "text-white", pattern: /\btext-white\b/ },
  { name: "bg-white", pattern: /\bbg-white\b/ },
  { name: "dark visual", pattern: /\bdark:(?:bg|text|border)-/ },
  { name: "tailwind gradient", pattern: /\bbg-gradient-/ },
  { name: "hardcoded hex in jsx", pattern: /(?<![-\w])#[0-9a-fA-F]{3,8}\b/ },
];

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
assert.ok(existsSync(ADMIN_THEME), "admin-theme.css missing");

const themeCss = readFileSync(ADMIN_THEME, "utf8");
if (/!important/.test(themeCss)) {
  violations.push("admin-theme.css: visual !important");
}

for (const abs of listJsFiles(ADMIN_ROOT)) {
  const rel = relative(ROOT, abs);
  const content = readFileSync(abs, "utf8");
  for (const { name, pattern } of LEGACY_JSX_PATTERNS) {
    if (pattern.test(content)) {
      violations.push(`${rel}: ${name}`);
    }
  }
}

assert.equal(violations.length, 0, violations.slice(0, 40).join("\n"));
console.log(`test-admin-theme-compliance: PASS (0 admin violations)`);
