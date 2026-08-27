#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareNewsByRecency,
  mergeNewsLists,
} from "../lib/news-list-merge.js";
import {
  NEWS_BACKGROUND_FILL_SIZE,
  NEWS_FULL_LIST_SIZE,
  NEWS_LIST_MAX_PAGE_SIZE,
  NEWS_SSR_INITIAL_SIZE,
} from "../lib/public-cache-config.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function testConstants() {
  assert.equal(NEWS_SSR_INITIAL_SIZE, 20);
  assert.equal(NEWS_FULL_LIST_SIZE, 50);
  assert.equal(NEWS_BACKGROUND_FILL_SIZE, 30);
  assert.equal(NEWS_FULL_LIST_SIZE, NEWS_LIST_MAX_PAGE_SIZE);
  assert.equal(NEWS_SSR_INITIAL_SIZE + NEWS_BACKGROUND_FILL_SIZE, NEWS_FULL_LIST_SIZE);
}

function testPageUsesSsrInitialLimit() {
  const pageSource = read("app/(public)/news/page.js");
  assert.match(pageSource, /NEWS_SSR_INITIAL_SIZE/);
  assert.match(pageSource, /getCachedNewsList\(\{\s*limit:\s*NEWS_SSR_INITIAL_SIZE\s*\}\)/);
  assert.doesNotMatch(pageSource, /getCachedNewsList\(\{\s*limit:\s*NEWS_LIST_MAX_PAGE_SIZE\s*\}\)/);
}

function testClientBackgroundFillStrategy() {
  const clientSource = read("app/(public)/news/NewsListClient.js");
  assert.match(clientSource, /NEWS_BACKGROUND_FILL_SIZE/);
  assert.match(clientSource, /NEWS_SSR_INITIAL_SIZE/);
  assert.match(clientSource, /offset:\s*NEWS_SSR_INITIAL_SIZE/);
  assert.match(clientSource, /limit:\s*NEWS_BACKGROUND_FILL_SIZE/);
  assert.match(clientSource, /mergeNewsLists/);
  assert.match(clientSource, /scheduleAfterPaint/);
  assert.match(clientSource, /REFRESH_NEWS_LIMIT\s*=\s*NEWS_FULL_LIST_SIZE/);
  assert.doesNotMatch(clientSource, /NEWS_LIST_MAX_PAGE_SIZE/);
}

function testClientDoesNotTouchImagePriority() {
  const clientSource = read("app/(public)/news/page.js") + read("app/(public)/news/NewsListClient.js");
  assert.doesNotMatch(clientSource, /NewsCoverImage/);
}

function testSeoArtifactsUntouched() {
  const pageSource = read("app/(public)/news/page.js");
  assert.match(pageSource, /buildNewsListPageJsonLd/);
  assert.match(pageSource, /buildBreadcrumbJsonLd/);
  assert.match(pageSource, /buildPublicMetadata/);
}

function testCompareNewsByRecency() {
  const older = { id: "2", created_at: "2026-08-01T10:00:00.000Z" };
  const newer = { id: "1", created_at: "2026-08-01T12:00:00.000Z" };
  assert.ok(compareNewsByRecency(newer, older) < 0);
  assert.ok(compareNewsByRecency(older, newer) > 0);

  const sameTimeA = { id: "10", created_at: "2026-08-01T12:00:00.000Z" };
  const sameTimeB = { id: "9", created_at: "2026-08-01T12:00:00.000Z" };
  assert.ok(compareNewsByRecency(sameTimeA, sameTimeB) < 0);
}

function testMergeDedupesAndCaps() {
  const initial = [
    { id: "a", created_at: "2026-08-01T12:00:00.000Z" },
    { id: "b", created_at: "2026-08-01T11:00:00.000Z" },
  ];
  const background = [
    { id: "b", created_at: "2026-08-01T11:00:00.000Z" },
    { id: "c", created_at: "2026-08-01T10:00:00.000Z" },
  ];

  const merged = mergeNewsLists(initial, background, NEWS_FULL_LIST_SIZE);
  assert.deepEqual(merged.map((item) => item.id), ["a", "b", "c"]);
}

function testMergeRaceNewItemBetweenRequests() {
  const ssrBatch = Array.from({ length: 20 }, (_, index) => ({
    id: `ssr-${index}`,
    created_at: new Date(Date.UTC(2026, 7, 1, 12, 59 - index)).toISOString(),
  }));

  const backgroundBatch = Array.from({ length: 30 }, (_, index) => ({
    id: `bg-${index}`,
    created_at: new Date(Date.UTC(2026, 7, 1, 10, index)).toISOString(),
  }));

  const duplicateOverlap = { id: "ssr-19", created_at: ssrBatch[19].created_at };
  const merged = mergeNewsLists(ssrBatch, [...backgroundBatch, duplicateOverlap], NEWS_FULL_LIST_SIZE);

  assert.equal(merged.length, 50);
  assert.equal(new Set(merged.map((item) => item.id)).size, 50);
  assert.equal(merged[0].id, "ssr-0");
}

function testMergeReordersWhenIncomingIsNewer() {
  const initial = [{ id: "old-1", created_at: "2026-08-01T08:00:00.000Z" }];
  const incoming = [{ id: "new-1", created_at: "2026-08-01T13:00:00.000Z" }];
  const merged = mergeNewsLists(initial, incoming, NEWS_FULL_LIST_SIZE);
  assert.deepEqual(merged.map((item) => item.id), ["new-1", "old-1"]);
}

function testBackgroundFailurePreservesInitial() {
  const initial = [{ id: "keep-me", created_at: "2026-08-01T12:00:00.000Z" }];
  const merged = mergeNewsLists(initial, [], NEWS_FULL_LIST_SIZE);
  assert.deepEqual(merged, initial);
}

function run() {
  testConstants();
  testPageUsesSsrInitialLimit();
  testClientBackgroundFillStrategy();
  testClientDoesNotTouchImagePriority();
  testSeoArtifactsUntouched();
  testCompareNewsByRecency();
  testMergeDedupesAndCaps();
  testMergeRaceNewItemBetweenRequests();
  testMergeReordersWhenIncomingIsNewer();
  testBackgroundFailurePreservesInitial();
  console.log("test-news-hub-phase3d1: PASS");
}

run();
