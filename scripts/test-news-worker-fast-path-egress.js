#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerSource = fs.readFileSync(path.join(root, "worker/news-worker.js"), "utf8");
const observabilitySource = fs.readFileSync(
  path.join(root, "worker/lib/news-intelligence/autonomy/decision-persistence.js"),
  "utf8"
);
const envSource = fs.readFileSync(path.join(root, "worker/news/news-worker-env.js"), "utf8");

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing start marker: ${startMarker}`);
  assert.ok(end > start, `missing end marker: ${endMarker}`);
  return source.slice(start, end);
}

const fetchCycle = sliceBetween(workerSource, "async function fetchForexNews", "module.exports");
const fastGate = sliceBetween(
  fetchCycle,
  "if (options.telegramOnly !== true)",
  "const publishedItems = ["
);
const finallyBlock = sliceBetween(fetchCycle, "} finally {", "const completedAt = new Date().toISOString();");
const dedupContext = sliceBetween(
  workerSource,
  "async function buildTelegramPublishDedupContext",
  "async function deliverTelegramNews"
);
const flushObservability = sliceBetween(
  observabilitySource,
  "async function flushObservability",
  "module.exports"
);

assert.match(fastGate, /loadPublishedNewsFromSupabase\(/);
assert.match(fastGate, /loadNewsPostsFromSupabase\(/);
assert.ok(
  fetchCycle.indexOf("processDuePendingReleases") < fetchCycle.indexOf("if (options.telegramOnly !== true)"),
  "economic pending releases must run before the historical-load gate"
);
assert.ok(
  fetchCycle.indexOf("if (options.telegramOnly !== true)") < fetchCycle.indexOf("discoverTelegramNews("),
  "telegram discovery must still run on the fast path"
);
assert.ok(
  fetchCycle.indexOf("discoverTelegramNews(") < fetchCycle.indexOf("if (options.telegramOnly === true)"),
  "fast path must return only after telegram discovery"
);
assert.ok(
  fetchCycle.indexOf("if (options.telegramOnly === true)") < fetchCycle.indexOf("processGeneralRssItems("),
  "RSS processing must stay on the full cycle, after the fast-path return"
);
assert.match(fetchCycle, /publishedKeys: telegramPublishedKeys/);

assert.match(finallyBlock, /flushObservability\(/);
assert.equal(finallyBlock.includes("flushSourceHealthStates"), false);
assert.equal(workerSource.includes("flushSourceHealthStates"), false);

assert.equal(flushObservability.split("flushSourceHealthStates(").length - 1, 1);

assert.match(dedupContext, /loadPublishedNewsFromSupabase\(/);
assert.match(dedupContext, /loadNewsPostsFromSupabase\(/);

const publishedLoader = sliceBetween(
  workerSource,
  "async function loadPublishedNewsFromSupabase",
  "async function loadNewsPostsFromSupabase"
);
const postsLoader = sliceBetween(
  workerSource,
  "async function loadNewsPostsFromSupabase",
  "async function savePublishedNewsToSupabase"
);
assert.match(publishedLoader, /\.limit\(200\)/);
assert.match(postsLoader, /\.select\("title, content, source_link, created_at"\)/);
assert.match(postsLoader, /\.limit\(200\)/);

assert.match(
  envSource,
  /getTelegramEconomicFastPollIntervalMs\(\) \{\s*return parseBoundedInt\("TELEGRAM_ECONOMIC_FAST_POLL_MS", \{ defaultValue: 15_000/
);

console.log("news worker fast-path egress PASS");
