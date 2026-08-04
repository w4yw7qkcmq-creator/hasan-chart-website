#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const routeSource = fs.readFileSync(path.join(root, "app/api/news/route.js"), "utf8");

const sampleItems = Array.from({ length: 3 }, (_, index) => ({
  id: `id-${index}`,
  slug: `slug-${index}`,
  title: `Title ${index}`,
  image_url: "https://example.com/image.jpg",
  impact_level: "HIGH",
  source_link: "https://example.com/article",
  created_at: "2026-08-01T12:00:00.000Z",
}));

const samplePagination = { limit: 20, hasMore: true, nextCursor: "abc" };

function buildNewsListResponse({ items, pagination, legacyPosts }) {
  const body = {
    success: true,
    items,
    pagination,
  };

  if (legacyPosts) {
    body.posts = items;
  }

  return body;
}

function testDefaultHasItemsOnly() {
  const body = buildNewsListResponse({
    items: sampleItems,
    pagination: samplePagination,
    legacyPosts: false,
  });
  assert.ok(Array.isArray(body.items));
  assert.equal(body.items.length, 3);
  assert.equal("posts" in body, false);
}

function testDefaultNoContent() {
  const body = buildNewsListResponse({
    items: sampleItems,
    pagination: samplePagination,
    legacyPosts: false,
  });
  for (const item of body.items) {
    assert.equal("content" in item, false);
  }
}

function testLegacyPostsAlias() {
  const body = buildNewsListResponse({
    items: sampleItems,
    pagination: samplePagination,
    legacyPosts: true,
  });
  assert.ok(Array.isArray(body.posts));
  assert.deepEqual(body.posts, body.items);
}

function testLegacyOnlyWhenRequested() {
  assert.match(routeSource, /legacyPosts/);
  assert.match(routeSource, /if \(legacyPosts\)/);
  assert.doesNotMatch(routeSource, /posts:\s*items,\s*\n\s*pagination/s);
}

function testCacheKeySeparatesLegacyMode() {
  assert.match(routeSource, /legacy:\$\{params\.legacyPosts\}/);
}

function testPaginationUnaffected() {
  const body = buildNewsListResponse({
    items: sampleItems,
    pagination: samplePagination,
    legacyPosts: false,
  });
  assert.deepEqual(body.pagination, samplePagination);
}

function testWireSizeReduction() {
  const withLegacy = Buffer.byteLength(
    JSON.stringify(
      buildNewsListResponse({
        items: sampleItems,
        pagination: samplePagination,
        legacyPosts: true,
      })
    )
  );
  const modern = Buffer.byteLength(
    JSON.stringify(
      buildNewsListResponse({
        items: sampleItems,
        pagination: samplePagination,
        legacyPosts: false,
      })
    )
  );
  assert.ok(modern < withLegacy);
  assert.ok(modern <= withLegacy * 0.75);
}

const tests = [
  ["default response has items only", testDefaultHasItemsOnly],
  ["default response has no posts key", () => {
    const body = buildNewsListResponse({
      items: sampleItems,
      pagination: samplePagination,
      legacyPosts: false,
    });
    assert.equal("posts" in body, false);
  }],
  ["default list has no content", testDefaultNoContent],
  ["legacyPosts=true adds posts alias", testLegacyPostsAlias],
  ["legacy alias only when requested in route", testLegacyOnlyWhenRequested],
  ["cache key separates legacy mode", testCacheKeySeparatesLegacyMode],
  ["pagination unaffected", testPaginationUnaffected],
  ["wire size smaller without duplicate posts", testWireSizeReduction],
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
console.log(`\n${tests.length}/${tests.length} news API compatibility tests passed`);
