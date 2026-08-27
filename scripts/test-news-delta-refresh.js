#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyCreatedAtIdCursor,
  applyNewerThanCreatedAtIdCursor,
  compareUuidDesc,
  formatPostgrestFilterValue,
  parseAfterCreatedAt,
  parseAfterId,
  parseDeltaRefreshParams,
} from "../lib/pagination.js";
import { compareNewsByRecency, mergeNewsLists } from "../lib/news-list-merge.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function makeItem(id, createdAt, extra = {}) {
  return {
    id,
    slug: `slug-${id}`,
    title: `Title ${id}`,
    image_url: "https://example.com/image.jpg",
    impact_level: "MEDIUM",
    source_link: "https://example.com/article",
    created_at: createdAt,
    ...extra,
  };
}

function deltaParams(afterCreatedAt, afterId) {
  const params = new URLSearchParams();
  if (afterCreatedAt) {
    params.set("afterCreatedAt", afterCreatedAt);
  }
  if (afterId) {
    params.set("afterId", afterId);
  }
  return params;
}

function testParseDeltaBothOrNeither() {
  assert.equal(parseDeltaRefreshParams(new URLSearchParams("limit=50")), null);

  assert.throws(
    () => parseDeltaRefreshParams(deltaParams("2026-08-27T21:00:15.602+00:00")),
    (error) => error.statusCode === 400
  );

  assert.throws(
    () => parseDeltaRefreshParams(deltaParams(null, "a74f4a5e-0889-4d6d-91ca-7cbf751de749")),
    (error) => error.statusCode === 400
  );

  const parsed = parseDeltaRefreshParams(
    deltaParams("2026-08-27T21:00:15.602+00:00", "a74f4a5e-0889-4d6d-91ca-7cbf751de749")
  );

  assert.equal(parsed.afterCreatedAt, "2026-08-27T21:00:15.602+00:00");
  assert.equal(parsed.afterId, "a74f4a5e-0889-4d6d-91ca-7cbf751de749");
}

function testValidationErrors() {
  assert.throws(() => parseAfterCreatedAt("not-a-date"), (error) => error.statusCode === 400);
  assert.throws(() => parseAfterId("not-a-uuid"), (error) => error.statusCode === 400);
  assert.equal(parseAfterCreatedAt("2026-08-27T21:00:15.602Z"), "2026-08-27T21:00:15.602Z");
}

function testPostgrestEscaping() {
  const ts = "2026-08-27T21:00:15.602+00:00";
  const quoted = formatPostgrestFilterValue(ts);
  assert.equal(quoted, `"${ts}"`);

  const filter = { afterCreatedAt: ts, afterId: "a74f4a5e-0889-4d6d-91ca-7cbf751de749" };
  const query = {
    filters: [],
    or(expression) {
      this.filters.push(expression);
      return this;
    },
  };

  applyNewerThanCreatedAtIdCursor(query, filter);
  assert.match(query.filters[0], /created_at\.gt\."2026-08-27T21:00:15\.602\+00:00"/);
  assert.match(query.filters[0], /id\.gt\."a74f4a5e-0889-4d6d-91ca-7cbf751de749"/);
}

function testOlderCursorUnchanged() {
  const query = {
    filters: [],
    or(expression) {
      this.filters.push(expression);
      return this;
    },
  };

  const cursor = Buffer.from(
    JSON.stringify({ createdAt: "2026-08-27T21:00:15.602+00:00", id: "a74f4a5e-0889-4d6d-91ca-7cbf751de749" }),
    "utf8"
  ).toString("base64url");

  applyCreatedAtIdCursor(query, cursor);
  assert.match(query.filters[0], /created_at\.lt\./);
  assert.match(query.filters[0], /id\.lt\./);
  assert.doesNotMatch(query.filters[0], /created_at\.gt\./);
}

function testUuidCompareDesc() {
  assert.ok(
    compareUuidDesc("b0000000-0000-4000-8000-000000000002", "a0000000-0000-4000-8000-000000000001") < 0
  );
  assert.equal(compareUuidDesc("same", "same"), 0);
}

function testSameTimestampMergeOrdering() {
  const ts = "2026-08-27T21:00:15.602+00:00";
  const items = [
    makeItem("a0000000-0000-4000-8000-000000000001", ts),
    makeItem("b0000000-0000-4000-8000-000000000002", ts),
    makeItem("c0000000-0000-4000-8000-000000000003", ts),
  ];

  const merged = mergeNewsLists([], items, 50);
  assert.deepEqual(
    merged.map((item) => item.id),
    [
      "c0000000-0000-4000-8000-000000000003",
      "b0000000-0000-4000-8000-000000000002",
      "a0000000-0000-4000-8000-000000000001",
    ]
  );
}

function testSameTimestampBoundaryExcludesHeld() {
  const ts = "2026-08-27T21:00:15.602+00:00";
  const held = makeItem("a0000000-0000-4000-8000-000000000001", ts);
  const newerSameTs = makeItem("b0000000-0000-4000-8000-000000000002", ts);
  const merged = mergeNewsLists([held], [newerSameTs], 50);

  assert.deepEqual(merged.map((item) => item.id), [newerSameTs.id, held.id]);
}

function testDeltaMergeCases() {
  const base = [
    makeItem("held-1", "2026-08-27T21:00:00.000+00:00"),
    makeItem("held-2", "2026-08-27T20:00:00.000+00:00"),
  ];

  assert.deepEqual(mergeNewsLists(base, [], 50).map((item) => item.id), ["held-1", "held-2"]);

  const oneNew = mergeNewsLists(base, [makeItem("new-1", "2026-08-27T22:00:00.000+00:00")], 50);
  assert.deepEqual(oneNew.map((item) => item.id), ["new-1", "held-1", "held-2"]);

  const duplicate = mergeNewsLists(base, [makeItem("held-1", "2026-08-27T21:00:00.000+00:00")], 50);
  assert.equal(duplicate.length, 2);

  const manyNew = Array.from({ length: 100 }, (_, index) =>
    makeItem(`new-${index}`, new Date(Date.UTC(2026, 7, 28, 12, index)).toISOString())
  );
  const capped = mergeNewsLists(base, manyNew, 50);
  assert.equal(capped.length, 50);
  assert.equal(new Set(capped.map((item) => item.id)).size, 50);
  assert.equal(capped[0].id, "new-99");
}

function testNewerThanQueryDirection() {
  const heldTs = "2026-08-27T20:00:00.000+00:00";
  const heldId = "a0000000-0000-4000-8000-000000000001";
  const newerItems = Array.from({ length: 100 }, (_, index) =>
    makeItem(
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      new Date(Date.UTC(2026, 7, 28, 12, index)).toISOString()
    )
  );

  const deltaSlice = newerItems.slice(-50).reverse();
  const merged = mergeNewsLists([makeItem(heldId, heldTs)], deltaSlice, 50);
  assert.equal(merged.length, 50);
  assert.equal(merged[0].id, deltaSlice[0].id);
}

function testApiRouteSource() {
  const routeSource = read("app/api/news/route.js");
  assert.match(routeSource, /parseDeltaRefreshParams/);
  assert.match(routeSource, /applyNewerThanCreatedAtIdCursor/);
  assert.match(routeSource, /if \(params\.delta\) \{\s*const data = await fetchNewsList\(params\);/);
  assert.doesNotMatch(routeSource, /if \(params\.delta\) \{[\s\S]{0,180}withReadCache/);
}

function testClientSource() {
  const clientSource = read("app/(public)/news/NewsListClient.js");
  assert.match(clientSource, /fetchNewsDeltaPage/);
  assert.match(clientSource, /fetchFullNews/);
  assert.match(clientSource, /runNewsDeltaRefresh/);
  assert.match(clientSource, /afterCreatedAt/);
  assert.match(clientSource, /afterId/);
  assert.match(clientSource, /useVisibilityRefresh\(\(\) => runNewsDeltaRefresh\(\)/);
  assert.match(clientSource, /fetchFullNews\(\{ force: true \}\)/);
  assert.match(clientSource, /mergeNewsLists\(currentItems, deltaItems/);
  assert.match(clientSource, /offset: NEWS_SSR_INITIAL_SIZE/);
}

function testCompareNewsByRecencyUsesUuidDesc() {
  const ts = "2026-08-27T21:00:15.602+00:00";
  const a = makeItem("a0000000-0000-4000-8000-000000000001", ts);
  const b = makeItem("b0000000-0000-4000-8000-000000000002", ts);
  assert.ok(compareNewsByRecency(b, a) < 0);
}

function run() {
  testParseDeltaBothOrNeither();
  testValidationErrors();
  testPostgrestEscaping();
  testOlderCursorUnchanged();
  testUuidCompareDesc();
  testSameTimestampMergeOrdering();
  testSameTimestampBoundaryExcludesHeld();
  testDeltaMergeCases();
  testNewerThanQueryDirection();
  testApiRouteSource();
  testClientSource();
  testCompareNewsByRecencyUsesUuidDesc();
  console.log("test-news-delta-refresh: PASS");
}

run();
