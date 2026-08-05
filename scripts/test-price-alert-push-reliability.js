#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(join(process.cwd(), "worker/push-sender.js"), "utf8");
assert.match(source, /404|410/);
assert.match(source, /endpointPrefix/);
assert.doesNotMatch(source, /console\.log\([^)]*endpoint[^)]*\)/i);

console.log("price alert push reliability PASS");
