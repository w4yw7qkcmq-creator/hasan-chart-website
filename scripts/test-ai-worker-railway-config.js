#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const aiToml = readFileSync(join(root, "worker/railway.ai.toml"), "utf8");
const priceToml = readFileSync(join(root, "worker/railway.toml"), "utf8");
const indexSource = readFileSync(join(root, "worker/index.js"), "utf8");

assert.match(aiToml, /AI_WORKER_ENABLED\s*=\s*"true"/);
assert.match(aiToml, /PRICE_ALERT_WORKER_ENABLED\s*=\s*"false"/);
assert.match(aiToml, /healthcheckPath\s*=\s*"\/health"/);
assert.match(aiToml, /startCommand\s*=\s*"npm start"/);
assert.doesNotMatch(aiToml, /start:news/);
assert.match(indexSource, /validateAiWorkerEnvironment|ai-worker-env/);
assert.match(indexSource, /isAiWorkerPrimaryMode/);
assert.doesNotMatch(priceToml, /AI_WORKER_ENABLED/);

console.log("ai worker railway config PASS");
