#!/usr/bin/env node
/**
 * One-shot sandbox migration: inline REVALIDATE_* in route segment config exports.
 * Values must match lib/public-cache-config.js exactly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const REVALIDATE_LITERALS = {
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
    } else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

let changed = 0;

for (const file of walk(path.join(ROOT, "app"))) {
  let source = fs.readFileSync(file, "utf8");
  const original = source;

  for (const [name, value] of Object.entries(REVALIDATE_LITERALS)) {
    source = source.replace(
      new RegExp(`export const revalidate = ${name};`, "g"),
      `export const revalidate = ${value};`
    );
  }

  if (source !== original) {
    fs.writeFileSync(file, source);
    changed += 1;
    console.log("updated", path.relative(ROOT, file));
  }
}

console.log(`segment config literals migrated in ${changed} files`);
