#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const ALLOWLIST = join(ROOT, "scripts/design-system-legacy-allowlist.json");
const GLOBALS = join(ROOT, "app/globals.css");
const DESIGN = join(ROOT, "app/design-system/design-system-theme.css");

let passed = 0;

const json = JSON.parse(readFileSync(ALLOWLIST, "utf8"));
assert.ok(Array.isArray(json.exceptions), "exceptions array required");
assert.equal(json.exceptions.length, 0, `allowlist exceptions must be empty: ${json.exceptions.length}`);
assert.ok(!Array.isArray(json.paths) || json.paths.length === 0, "wildcard paths[] must be empty");
passed += 3;

const globals = readFileSync(GLOBALS, "utf8");
const design = readFileSync(DESIGN, "utf8");
const runtimeCss = `${design}\n${globals}`;
assert.doesNotMatch(runtimeCss, /\[class\*="sidebar"\]/);
assert.doesNotMatch(runtimeCss, /\[class\*="price"\]/);
assert.doesNotMatch(runtimeCss, /\[class\*="market"\]/);
assert.doesNotMatch(runtimeCss, /:has\(/);
assert.match(runtimeCss, /\.site-sidebar-panel/);
assert.match(runtimeCss, /\.ui-tradingview-shell/);
assert.match(runtimeCss, /\.ui-badge-panel/);
passed += 7;

console.log(`test-legacy-css-closure: PASS (${passed} checks, ${json.exceptions.length} exceptions)`);
