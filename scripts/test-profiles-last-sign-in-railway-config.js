#!/usr/bin/env node
/**
 * Guard: profiles-last-sign-in Railway cron must not use generic worker/railway.toml or npm start.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();

function read(path) {
  return readFileSync(join(ROOT, path), "utf8");
}

const profilesCronToml = read("worker/railway.profiles-last-sign-in-cron.toml");
const priceAlertsToml = read("worker/railway.toml");
const caller = read("worker/profiles-last-sign-in-reconcile-cron-caller.js");

assert.match(profilesCronToml, /startCommand = "node profiles-last-sign-in-reconcile-cron-caller\.js"/);
assert.match(profilesCronToml, /cronSchedule = "0 3 \* \* \*"/);
assert.match(profilesCronToml, /restartPolicyType = "NEVER"/);
assert.doesNotMatch(profilesCronToml, /startCommand = "npm start"/);
assert.doesNotMatch(profilesCronToml, /subscription-maintenance/);

assert.match(priceAlertsToml, /npm start/);
assert.doesNotMatch(priceAlertsToml, /profiles-last-sign-in-reconcile-cron-caller/);
assert.doesNotMatch(priceAlertsToml, /cronSchedule/);

assert.match(caller, /reconcile-profiles-last-sign-in/);
assert.match(caller, /x-service-account-id/);
assert.doesNotMatch(caller, /index\.js/);

console.log("profiles-last-sign-in railway config guard PASS");
