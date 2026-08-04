#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function testPriceAlertNoSelectStar() {
  const worker = read("worker/index.js");
  assert.match(worker, /PRICE_ALERT_WORKER_COLUMNS/);
  assert.doesNotMatch(worker, /\.from\("price_alerts"\)[\s\S]*?select\("\*"\)/);
}

function testPriceAlertIntervalUnchanged() {
  assert.match(read("worker/index.js"), /MIN_PRICE_ALERT_CHECK_INTERVAL_MS = 30_000/);
  assert.match(read("worker/index.js"), /MAX_ALERTS_PER_RUN = 20/);
}

function testNotificationSettingsProjection() {
  assert.match(read("worker/notification-delivery-gate.js"), /NOTIFICATION_DELIVERY_SETTINGS_COLUMNS/);
  assert.doesNotMatch(read("worker/notification-delivery-gate.js"), /fetchSettingsRow[\s\S]*select\("\*"\)/);
}

function testNotificationInsertProjection() {
  assert.match(read("worker/create-user-notification.js"), /NOTIFICATION_INSERT_RETURN_COLUMNS/);
  assert.doesNotMatch(read("worker/create-user-notification.js"), /select\("\*"\)/);
}

function testNewsWorkerColumns() {
  assert.match(read("lib/supabase-query-columns.js"), /PUBLISHED_NEWS_WORKER_COLUMNS/);
  assert.match(read("worker/news-worker.js"), /PUBLISHED_NEWS_WORKER_COLUMNS|published_news/);
}

function testEmailOutboxBatch() {
  assert.match(read("worker/email-outbox-processor.js"), /claim_email_outbox_batch/);
}

const tests = [
  testPriceAlertNoSelectStar,
  testPriceAlertIntervalUnchanged,
  testNotificationSettingsProjection,
  testNotificationInsertProjection,
  testNewsWorkerColumns,
  testEmailOutboxBatch,
];

for (const test of tests) test();

console.log(`worker-query-projections: ${tests.length} passed`);
