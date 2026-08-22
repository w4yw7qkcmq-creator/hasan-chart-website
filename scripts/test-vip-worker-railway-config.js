#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const vipToml = read("worker/railway.vip-status-delivery.toml");
const emailToml = read("worker/railway.email-queue.toml");
const vipNixpacks = read("worker/nixpacks.vip-status-delivery.toml");
const emailNixpacks = read("worker/nixpacks.email-queue.toml");
const priceToml = read("worker/railway.toml");
const pkg = JSON.parse(read("worker/package.json"));

assert.match(vipToml, /nixpacks\.vip-status-delivery\.toml/);
assert.match(vipToml, /npm run vip-status-delivery-worker/);
assert.doesNotMatch(vipToml, /npm start/);
assert.doesNotMatch(vipToml, /index\.js/);

assert.match(emailToml, /nixpacks\.email-queue\.toml/);
assert.match(emailToml, /npm run email-queue-worker/);
assert.doesNotMatch(emailToml, /npm start/);
assert.doesNotMatch(emailToml, /index\.js/);

assert.match(vipNixpacks, /npm run vip-status-delivery-worker/);
assert.match(emailNixpacks, /npm run email-queue-worker/);
assert.match(emailNixpacks, /email-outbox-processor\.js/);

const rootCore = read("lib/email-outbox-core.cjs");
const workerCore = read("worker/lib/email-outbox-core.cjs");
assert.equal(
  rootCore,
  workerCore,
  "worker/lib/email-outbox-core.cjs must stay in sync with lib/email-outbox-core.cjs"
);
assert.match(read("lib/email-outbox-guard.cjs"), /email-recipient-guard\.cjs/);
assert.match(read("worker/lib/email-outbox-guard.cjs"), /email-recipient-guard\.cjs/);

assert.equal(pkg.scripts["vip-status-delivery-worker"], "VIP_STATUS_DELIVERY_WORKER_ONESHOT=false node vip-status-delivery-worker.js");
assert.equal(pkg.scripts["email-queue-worker"], "EMAIL_QUEUE_WORKER_ONESHOT=false node email-queue-worker.js");
assert.equal(pkg.scripts.start, "node index.js");

assert.doesNotMatch(priceToml, /vip-status-delivery-worker/);
assert.doesNotMatch(priceToml, /email-queue-worker/);

console.log("VIP worker railway config PASS");
