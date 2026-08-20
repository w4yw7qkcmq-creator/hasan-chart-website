#!/usr/bin/env node
/**
 * Extracts executable inline <script> bodies from HTML and computes SHA-256 CSP hashes.
 * Skips JSON-LD and external src scripts.
 */
import crypto from "node:crypto";
import fs from "node:fs";

const routes = process.argv.slice(2);
if (routes.length === 0) {
  console.error("Usage: node scripts/extract-inline-script-hashes.mjs <url-or-file>...");
  process.exit(1);
}

function hashScript(source) {
  const digest = crypto.createHash("sha256").update(source, "utf8").digest("base64");
  return `'sha256-${digest}'`;
}

function extractInlineScripts(html) {
  const scripts = [];
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const attrs = match[1] || "";
    const body = match[2] || "";
    if (/\bsrc\s*=/.test(attrs)) continue;
    if (/type\s*=\s*["']application\/ld\+json["']/i.test(attrs)) continue;
    const trimmed = body.trim();
    if (!trimmed) continue;
    scripts.push({ attrs: attrs.trim(), body: trimmed });
  }
  return scripts;
}

async function loadInput(input) {
  if (/^https?:\/\//.test(input) || input.startsWith("http://")) {
    const res = await fetch(input);
    return await res.text();
  }
  return fs.readFileSync(input, "utf8");
}

const globalHashes = new Map();

for (const input of routes) {
  const html = await loadInput(input);
  const scripts = extractInlineScripts(html);
  const routeHashes = new Map();
  for (const script of scripts) {
    const hash = hashScript(script.body);
    const preview = script.body.slice(0, 80).replace(/\s+/g, " ");
    routeHashes.set(hash, preview);
    if (!globalHashes.has(hash)) {
      globalHashes.set(hash, { preview, routes: new Set([input]) });
    } else {
      globalHashes.get(hash).routes.add(input);
    }
  }
  console.log(`\n=== ${input} (${scripts.length} inline scripts) ===`);
  for (const [hash, preview] of routeHashes) {
    console.log(`${hash}  ${preview}`);
  }
}

console.log("\n=== GLOBAL UNIQUE HASHES ===");
console.log(`count: ${globalHashes.size}`);
for (const [hash, meta] of globalHashes) {
  console.log(`${hash}`);
  console.log(`  routes: ${[...meta.routes].join(", ")}`);
  console.log(`  preview: ${meta.preview}`);
}
