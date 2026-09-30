#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createDedupeHistoryCache } = require("../worker/lib/news-dedupe-history-cache");

function createHarness() {
  let clock = 1_000_000;
  let fetchCount = 0;
  let fail = false;
  const published = [{ link: "https://example.com/a", title: "A", normalizedTitle: "a", publishedAt: "2026-09-30T00:00:00.000Z" }];
  const posts = [{ link: "https://example.com/post-a", title: "Post", duplicateKey: "fed_hike", publishedAt: "2026-09-30T00:00:00.000Z" }];

  const cache = createDedupeHistoryCache({
    refreshIntervalMs: 15 * 60 * 1000,
    failureBackoffMs: 60 * 1000,
    limit: 200,
    now: () => clock,
    loadHistory: async () => {
      fetchCount += 1;
      if (fail) return { ok: false, error: "refresh_failed" };
      return {
        ok: true,
        publishedItems: published.slice(),
        newsPostItems: posts.slice(),
      };
    },
  });

  return {
    cache,
    get fetchCount() {
      return fetchCount;
    },
    advance(ms) {
      clock += ms;
    },
    failNext() {
      fail = true;
    },
    succeedNext() {
      fail = false;
    },
  };
}

async function testHydratesOnceThenSkipsCycles() {
  const harness = createHarness();
  const first = await harness.cache.getPublishedItems();
  const posts = await harness.cache.getNewsPostItems();
  assert.equal(first.length, 1);
  assert.equal(posts[0].duplicateKey, "fed_hike");
  assert.equal(harness.fetchCount, 1);
  assert.equal(harness.cache.getStats().hydrated, true);

  await harness.cache.getPublishedItems();
  await harness.cache.getNewsPostItems();
  harness.advance(85_000);
  await harness.cache.getPublishedItems();
  assert.equal(harness.fetchCount, 1, "history must not reload on a normal cycle inside the refresh interval");
}

async function testRefreshOnlyAfterInterval() {
  const harness = createHarness();
  await harness.cache.ensureFresh();
  harness.advance(15 * 60 * 1000 - 1);
  await harness.cache.ensureFresh();
  assert.equal(harness.fetchCount, 1);
  harness.advance(1);
  await harness.cache.ensureFresh();
  assert.equal(harness.fetchCount, 2);
}

async function testPublicationUpdatesCacheWithoutFetch() {
  const harness = createHarness();
  await harness.cache.ensureFresh();
  harness.cache.notePublishedItem({
    link: "important-event-alert:cpi:60m",
    title: "CPI",
    normalizedTitle: "cpi",
    topicCluster: "important_economic_event_alert",
    publishedAt: "2026-09-30T10:00:00.000Z",
  });
  harness.cache.noteNewsPostItem({
    link: "https://example.com/new",
    title: "Fed raises rates",
    normalizedTitle: "fed raises rates",
    duplicateKey: "fed_raise",
    publishedAt: "2026-09-30T10:00:00.000Z",
  });
  const published = await harness.cache.getPublishedItems();
  const posts = await harness.cache.getNewsPostItems();
  assert.equal(published[0].link, "important-event-alert:cpi:60m");
  assert.equal(posts[0].duplicateKey, "fed_raise");
  assert.equal(harness.fetchCount, 1);
}

async function testRestartRehydrates() {
  const harness = createHarness();
  await harness.cache.ensureFresh();
  const restarted = createDedupeHistoryCache({
    refreshIntervalMs: 15 * 60 * 1000,
    now: () => 2_000_000,
    loadHistory: async () => {
      harness.fetchCount;
      return { ok: true, publishedItems: [{ link: "https://example.com/restarted" }], newsPostItems: [] };
    },
  });
  let loads = 0;
  const fresh = createDedupeHistoryCache({
    refreshIntervalMs: 15 * 60 * 1000,
    now: () => 2_000_000,
    loadHistory: async () => {
      loads += 1;
      return { ok: true, publishedItems: [{ link: "https://example.com/restarted" }], newsPostItems: [] };
    },
  });
  void restarted;
  const items = await fresh.getPublishedItems();
  assert.equal(loads, 1);
  assert.equal(items[0].link, "https://example.com/restarted");
  assert.equal(fresh.getStats().hydrated, true);
}

async function testFailedRefreshKeepsCache() {
  const harness = createHarness();
  await harness.cache.ensureFresh();
  harness.failNext();
  harness.advance(15 * 60 * 1000);
  await harness.cache.ensureFresh();
  const items = await harness.cache.getPublishedItems();
  assert.equal(items[0].link, "https://example.com/a");
  assert.equal(harness.cache.getStats().hydrated, true);
  assert.equal(harness.cache.getStats().lastError, "refresh_failed");
  const fetchesAfterFailure = harness.fetchCount;
  harness.advance(30_000);
  await harness.cache.ensureFresh();
  assert.equal(harness.fetchCount, fetchesAfterFailure, "failed refresh must back off instead of clearing or retrying every cycle");
}

async function testCacheStaysBounded() {
  const harness = createHarness();
  await harness.cache.ensureFresh();
  for (let i = 0; i < 250; i += 1) {
    harness.cache.notePublishedItem({ link: `https://example.com/${i}`, title: String(i), publishedAt: "2026-09-30T10:00:00.000Z" });
  }
  assert.equal(harness.cache.getStats().publishedCount, 200);
}

const tests = [
  ["hydrates on startup and skips fast cycles", testHydratesOnceThenSkipsCycles],
  ["refreshes only after the configured interval", testRefreshOnlyAfterInterval],
  ["publication updates local dedupe state immediately", testPublicationUpdatesCacheWithoutFetch],
  ["restart rehydrates from the history loader", testRestartRehydrates],
  ["failed refresh keeps the valid cache", testFailedRefreshKeepsCache],
  ["cache growth stays bounded", testCacheStaysBounded],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`  ✔ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✖ ${name}: ${error.message}`);
  }
}

if (failed > 0) process.exit(1);
console.log(`news dedupe history cache PASS (${tests.length})`);
