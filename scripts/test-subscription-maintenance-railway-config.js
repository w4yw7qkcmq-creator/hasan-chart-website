#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

const apiToml = read("worker/railway.subscription.toml");
const cronToml = read("worker/railway.subscription-cron.toml");
const workerToml = read("worker/railway.toml");

assert.match(apiToml, /node subscription-maintenance-worker\.js/);
assert.match(apiToml, /healthcheckPath = "\/health"/);
assert.doesNotMatch(cronToml, /subscription-maintenance-worker\.js/);
assert.match(cronToml, /node subscription-maintenance-cron-caller\.js/);
assert.match(workerToml, /npm start/);
assert.doesNotMatch(workerToml, /subscription-maintenance-cron-caller/);

const cronCaller = read("worker/subscription-maintenance-cron-caller.js");
assert.doesNotMatch(cronCaller, /Authorization/);
assert.doesNotMatch(cronCaller, /x-cron-secret/i);
assert.match(cronCaller, /x-service-account-id/);

console.log("subscription-maintenance railway config guard PASS");
