#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const railwayToml = readFileSync(join(root, "worker/railway.toml"), "utf8");
const pkg = JSON.parse(readFileSync(join(root, "worker/package.json"), "utf8"));

assert.match(railwayToml, /startCommand\s*=\s*"npm start"/);
assert.equal(pkg.scripts.start, "node index.js");
assert.notEqual(pkg.scripts.start, "node news-worker.js");
assert.notEqual(pkg.scripts.start, "node subscription-maintenance-worker.js");

const indexSource = readFileSync(join(root, "worker/index.js"), "utf8");
assert.match(indexSource, /CHECK_INTERVAL_MS/);
assert.match(indexSource, /30000|resolveCheckIntervalMs|DEFAULT_CHECK_INTERVAL_MS/);
assert.doesNotMatch(indexSource, /setInterval\(checkPriceAlerts,\s*5000\)/);

console.log("price alerts railway config PASS");
