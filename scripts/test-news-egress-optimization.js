#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NEWS_CARD_COLUMNS,
  NEWS_DETAIL_COLUMNS,
  NEWS_LIST_COLUMNS,
  NEWS_RELATED_COLUMNS,
  PUBLISHED_NEWS_WORKER_COLUMNS,
} from "../lib/supabase-query-columns.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function testListColumnsExcludeContent() {
  for (const columns of [NEWS_LIST_COLUMNS, NEWS_CARD_COLUMNS, NEWS_RELATED_COLUMNS]) {
    assert.ok(!columns.split(",").includes("content"), `list columns must exclude content: ${columns}`);
  }
}

function testDetailColumnsIncludeContent() {
  assert.ok(NEWS_DETAIL_COLUMNS.includes("content"));
}

function testWorkerColumnsExplicit() {
  assert.ok(!PUBLISHED_NEWS_WORKER_COLUMNS.includes("*"));
  assert.ok(PUBLISHED_NEWS_WORKER_COLUMNS.includes("normalized_title"));
}

function testNewsApiNoExactCountByDefault() {
  const source = fs.readFileSync(path.join(root, "app/api/news/route.js"), "utf8");
  assert.match(source, /includeTotal/);
}

function testServerNewsCacheBounded() {
  const source = fs.readFileSync(path.join(root, "lib/server-news-cache.js"), "utf8");
  assert.ok(source.includes("getCachedNewsList"));
  assert.ok(!source.includes("fetchNewsPostsPool(NEWS_CATEGORY_POOL_LIMIT"));
}

function testWorkerPublishedNewsNoSelectStar() {
  const source = fs.readFileSync(path.join(root, "worker/news-worker.js"), "utf8");
  const block = source.slice(source.indexOf("loadPublishedNewsFromSupabase"), source.indexOf("async function loadNewsPostsFromSupabase"));
  assert.ok(!block.includes('.select("*")'));
  assert.match(block, /normalized_title/);
}

const tests = [
  ["list columns exclude content", testListColumnsExcludeContent],
  ["detail columns include content", testDetailColumnsIncludeContent],
  ["worker published_news columns explicit", testWorkerColumnsExplicit],
  ["news api includeTotal gated", testNewsApiNoExactCountByDefault],
  ["server news cache bounded list", testServerNewsCacheBounded],
  ["worker published_news no select star", testWorkerPublishedNewsNoSelectStar],
];

let failed = 0;
for (const [name, fn] of tests) {
  try {
    fn();
    console.log(`  ✔ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✖ ${name}: ${error.message}`);
  }
}

if (failed > 0) process.exit(1);
console.log(`\n${tests.length}/${tests.length} news egress optimization tests passed`);
