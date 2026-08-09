#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IAM_PERMISSIONS } from "../lib/iam/constants.js";
import { permissionForRoute } from "../lib/iam/route-permissions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

const ROUTE_FILE = path.join(repoRoot, "app/api/admin/news/system-status/route.js");

const FORBIDDEN_IMPORT_MARKERS = [
  "worker/lib/news-intelligence/autonomy/diagnostic-service",
  "worker/lib/news-intelligence/economic-editorial",
  "worker/lib/news-intelligence/autonomy/feature-flags",
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

const routeSource = fs.readFileSync(ROUTE_FILE, "utf8");

for (const marker of FORBIDDEN_IMPORT_MARKERS) {
  assert.equal(
    routeSource.includes(marker),
    false,
    `route must not reference forbidden marker: ${marker}`
  );
}

for (const marker of ALLOWED_IMPORT_MARKERS) {
  assert.ok(routeSource.includes(marker), `route should use allowed boundary module: ${marker}`);
}

assert.equal(
  permissionForRoute("GET", "/api/admin/news/system-status"),
  IAM_PERMISSIONS.NEWS_READ,
  "route must be protected by NEWS_READ"
);

const tree = traceLocalDependencyTree(ROUTE_FILE);
const forbiddenHits = [];

for (const filePath of tree.visited) {
  const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  const normalized = rel.toLowerCase();
  if (
    normalized.includes("worker/lib/news-images") ||
    normalized.includes("worker/lib/news-intelligence/economic-editorial") ||
    normalized.includes("worker/lib/news-intelligence/autonomy/diagnostic-service") ||
    normalized.includes("worker/news-worker.js") ||
    normalized.includes("branded-fallback")
  ) {
    forbiddenHits.push(rel);
  }
}

assert.deepEqual(
  forbiddenHits,
  [],
  `admin status route dependency tree must stay off worker runtime modules: ${JSON.stringify(forbiddenHits)}`
);

const websiteLibFiles = walkFiles(path.join(repoRoot, "lib/news-system-status"));
for (const filePath of websiteLibFiles) {
  const rel = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  assert.ok(!rel.includes("worker/"), `${rel} must remain website-local`);
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(!source.includes("sharp"), `${rel} must not import sharp`);
  assert.ok(!source.includes("news-images"), `${rel} must not import news-images`);
}

console.log(
  "test-news-system-status-boundary.js: PASS",
  JSON.stringify({
    routeFile: path.relative(repoRoot, ROUTE_FILE),
    tracedLocalFiles: tree.visited.length,
    forbiddenHits: forbiddenHits.length,
  })
);
