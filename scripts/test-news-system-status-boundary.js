#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IAM_PERMISSIONS } from "../lib/iam/constants.js";
import { permissionForRoute } from "../lib/iam/route-permissions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const ROUTE_FILES = [path.join(repoRoot, "app/api/admin/news/system-status/route.js")];
const WEBSITE_ENTRY_FILES = [
  ...ROUTE_FILES,
  path.join(repoRoot, "lib/news-intelligence/manual-publish.js"),
];

const FORBIDDEN_IMPORT_MARKERS = [
  "worker/lib/news-intelligence/autonomy/diagnostic-service",
  "worker/lib/news-intelligence/economic-editorial/integration",
  "worker/lib/news-intelligence/economic-editorial/index",
  "worker/lib/news-intelligence/autonomy/feature-flags",
  "worker/lib/news-intelligence/index",
  "worker/lib/news-images",
  "worker/news-worker.js",
  "branded-fallback",
  "sharp",
];

const ALLOWED_IMPORT_MARKERS = [
  "lib/news-system-status",
  "@supabase/supabase-js",
  "lib/admin-auth",
  "lib/iam/constants",
  "lib/enforce-rate-limit",
  "lib/rate-limit",
];

function collectImportStrings(source) {
  const imports = [];
  const patterns = [
    /from\s+["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      imports.push(match[1]);
    }
  }
  return imports;
}

function walkFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walkFiles(full, files);
      continue;
    }
    if (/\.(js|mjs|cjs|ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function resolveLocalImport(fromFile, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) {
    return null;
  }
  const base = path.resolve(path.dirname(fromFile), specifier);
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    const indexCandidate = path.join(base, "index.js");
    return fs.existsSync(indexCandidate) ? indexCandidate : null;
  }
  const candidates = [`${base}.js`, `${base}.mjs`, `${base}.cjs`, base];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) || null;
}

function traceLocalDependencyTree(entryFile, maxDepth = 12) {
  const visited = new Set();
  const edges = [];

  function visit(filePath, depth) {
    const normalized = path.normalize(filePath);
    if (visited.has(normalized) || depth > maxDepth) return;
    visited.add(normalized);

    const source = fs.readFileSync(normalized, "utf8");
    for (const specifier of collectImportStrings(source)) {
      edges.push({ from: normalized, specifier });
      const resolved = resolveLocalImport(normalized, specifier);
      if (resolved) {
        visit(resolved, depth + 1);
      }
    }
  }

  visit(path.normalize(entryFile), 0);
  return { visited: [...visited], edges };
}

function isForbiddenWebsiteDependency(rel) {
  const normalized = rel.toLowerCase();
  return (
    normalized.includes("worker/lib/news-images") ||
    normalized.includes("branded-fallback") ||
    normalized.includes("worker/lib/news-intelligence/economic-editorial/integration.js") ||
    normalized.includes("worker/lib/news-intelligence/economic-editorial/index.js") ||
    normalized.includes("worker/lib/news-intelligence/autonomy/diagnostic-service") ||
    normalized.includes("worker/lib/news-intelligence/index.js") ||
    normalized.includes("worker/news-worker.js")
  );
}

for (const routeFile of WEBSITE_ENTRY_FILES) {
  const routeSource = fs.readFileSync(routeFile, "utf8");

  for (const marker of FORBIDDEN_IMPORT_MARKERS) {
    assert.equal(
      routeSource.includes(marker),
      false,
      `${path.relative(repoRoot, routeFile)} must not reference forbidden marker: ${marker}`
    );
  }

  if (routeFile.endsWith("system-status/route.js")) {
    for (const marker of ALLOWED_IMPORT_MARKERS) {
      assert.ok(routeSource.includes(marker), `${path.relative(repoRoot, routeFile)} should use ${marker}`);
    }
  }

  const tree = traceLocalDependencyTree(routeFile);
  const forbiddenHits = [];

  for (const filePath of tree.visited) {
    const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");
    if (routeFile.endsWith("system-status/route.js")) {
      if (rel.startsWith("worker/")) {
        forbiddenHits.push(rel);
      }
      continue;
    }
    if (isForbiddenWebsiteDependency(rel)) {
      forbiddenHits.push(rel);
    }
  }

  assert.deepEqual(
    forbiddenHits,
    [],
    `${path.relative(repoRoot, routeFile)} dependency tree must stay off worker runtime modules: ${JSON.stringify(forbiddenHits)}`
  );
}

const websiteLibFiles = walkFiles(path.join(repoRoot, "lib/news-system-status"));
for (const filePath of websiteLibFiles) {
  const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  assert.ok(!rel.includes("worker/"), `${rel} must remain website-local`);
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(!source.includes("sharp"), `${rel} must not import sharp`);
  assert.ok(!source.includes("news-images"), `${rel} must not import news-images`);
}

assert.equal(
  permissionForRoute("GET", "/api/admin/news/system-status"),
  IAM_PERMISSIONS.NEWS_READ,
  "route must be protected by NEWS_READ"
);

console.log(
  "test-news-system-status-boundary.js: PASS",
  JSON.stringify({
    websiteEntryFiles: WEBSITE_ENTRY_FILES.map((filePath) => path.relative(repoRoot, filePath)),
  })
);
