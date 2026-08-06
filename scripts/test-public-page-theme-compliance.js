#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();

const PUBLIC_PATHS = [
  "app/(public)/page.js",
  "app/(public)/HomePageClient.js",
  "app/(public)/news/page.js",
  "app/components/public-seo/PublicServiceLanding.js",
  "app/components/asset-hub/AssetPageTemplate.js",
  "app/(app)/crypto/page.js",
  "app/(app)/forex/page.js",
  "app/(app)/stocks/page.js",
  "app/(app)/login/page.js",
  "app/(app)/register/page.js",
  "app/not-found.js",
  "app/global-error.js",
  "app/error.js",
];

const UNSAFE = [
  { name: "text-white", pattern: /\btext-white\b/ },
  { name: "bg-white", pattern: /\bbg-white\b/ },
  { name: "dark visual", pattern: /\bdark:(?:bg|text|hidden|block)-/ },
  { name: "tailwind gradient class", pattern: /\bbg-gradient-/ },
  { name: "from/via/to utility", pattern: /\b(?:from|via|to)-[\w[\]./-]+/ },
  { name: "hardcoded hex", pattern: /(?<![-\w])#[0-9a-fA-F]{3,8}\b/ },
  { name: "inline visual style", pattern: /style=\{\{[^}]*(?:(?<![-\w])color\s*:|(?<![-\w])background\s*:)/ },
];

function scanAssetHubPages() {
  const dir = join(ROOT, "app/(app)");
  const violations = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const page = join(dir, entry.name, "page.js");
    if (!existsSync(page)) continue;
    const content = readFileSync(page, "utf8");
    if (!content.includes("AssetPageTemplate")) continue;
    for (const { name, pattern } of UNSAFE) {
      if (pattern.test(content)) violations.push(`${relativePath(page)}: ${name}`);
    }
  }
  return violations;
}

function relativePath(abs) {
  return abs.replace(`${ROOT}/`, "");
}

const violations = [];

for (const rel of PUBLIC_PATHS) {
  const abs = join(ROOT, rel);
  assert.ok(existsSync(abs), `${rel} missing`);
  const content = readFileSync(abs, "utf8");
  for (const { name, pattern } of UNSAFE) {
    if (pattern.test(content)) violations.push(`${rel}: ${name}`);
  }
}

violations.push(...scanAssetHubPages());

assert.equal(violations.length, 0, violations.join("\n"));
console.log(
  `test-public-page-theme-compliance: PASS (${PUBLIC_PATHS.length} core public files, 0 violations)`,
);
