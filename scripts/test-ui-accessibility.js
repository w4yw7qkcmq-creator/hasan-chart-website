#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const MODAL = join(ROOT, "app/components/ui/UiModal.js");

let passed = 0;
const source = readFileSync(MODAL, "utf8");

assert.match(source, /role="dialog"/);
assert.match(source, /aria-modal="true"/);
assert.match(source, /aria-labelledby/);
passed += 3;

assert.doesNotMatch(source, /role="presentation"[^>]*role="dialog"/);
passed += 1;

console.log(`test-ui-accessibility: PASS (${passed} checks)`);
