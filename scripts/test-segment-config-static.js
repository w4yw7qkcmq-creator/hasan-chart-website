#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const EXPECTED = {
  REVALIDATE_STATIC_MARKETING: 3600,
  REVALIDATE_PUBLIC_NEWS: 120,
  REVALIDATE_DAILY_ANALYSIS_PAGE: 300,
  REVALIDATE_CONTENT_POSTS_PAGE: 300,
  REVALIDATE_ASSET_HUB: 300,
  REVALIDATE_HOME_PAGE: 3600,
};

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, files);
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const segmentExportPattern =
  /export const (revalidate|dynamic|fetchCache|runtime|preferredRegion|maxDuration)\s*=\s*([^;\n]+);/g;

let violations = [];

for (const file of walk(path.join(ROOT, "app"))) {
  const source = fs.readFileSync(file, "utf8");
  let match;
  while ((match = segmentExportPattern.exec(source)) !== null) {
    const [, key, value] = match;
    const trimmed = value.trim();
    if (/^REVALIDATE_/.test(trimmed)) {
      violations.push(`${path.relative(ROOT, file)}: ${key} uses imported ${trimmed}`);
    }
    if (/^[A-Z_]+$/.test(trimmed) && !/^(force-dynamic|nodejs|edge|auto|default)$/.test(trimmed)) {
      violations.push(`${path.relative(ROOT, file)}: ${key} uses non-literal ${trimmed}`);
    }
    if (key === "revalidate" && /^\d+$/.test(trimmed)) {
      const num = Number(trimmed);
      const allowed = new Set([0, ...Object.values(EXPECTED)]);
      if (!allowed.has(num)) {
        violations.push(`${path.relative(ROOT, file)}: unexpected revalidate literal ${num}`);
      }
    }
  }
}

assert.equal(violations.length, 0, violations.join("\n"));
console.log("segment config static checker passed");
