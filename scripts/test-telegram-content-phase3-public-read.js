/**
 * Phase 3 public read integration tests.
 * Run: node scripts/test-telegram-content-phase3-public-read.js
 */

import assert from "node:assert/strict";
import { mergeFeedItemsByPublishedAt } from "../lib/public-section-feed/merge.js";
import { deriveTelegramPresentationTitle } from "../lib/public-section-feed/presentation-title.js";
import {
  normalizeTelegramForContentPost,
  normalizeTelegramForDailyAnalysis,
} from "../lib/public-section-feed/normalize.js";
import { isTelegramContentPublicSlug } from "../lib/public-section-feed/telegram-slug.js";

function matchesDailyAnalysisFilterForTest(item, filterKey) {
  if (item?.source === "telegram") {
    return filterKey === "all";
  }
  if (filterKey === "all") return true;
  return false;
}

function testMergeChronological() {
  const merged = mergeFeedItemsByPublishedAt([
    { id: "m1", published_at: "2026-01-01T10:00:00Z", source: "manual" },
    { id: "t1", published_at: "2026-01-02T10:00:00Z", source: "telegram" },
    { id: "m2", published_at: "2026-01-01T12:00:00Z", source: "manual" },
  ]);

  assert.equal(merged[0].id, "t1");
  assert.equal(merged[1].id, "m2");
  assert.equal(merged[2].id, "m1");
}

function testDailyTelegramNormalizationNoFakeMetadata() {
  const item = normalizeTelegramForDailyAnalysis({
    id: "abc",
    body: "تحليل بدون metadata",
    published_at: "2026-02-01T08:00:00Z",
    display_title: "",
    images: [{ url: "https://example.com/a.jpg", sort_order: 0, width: 800, height: 600 }],
  });

  assert.equal(item.source, "telegram");
  assert.equal(item.content, "تحليل بدون metadata");
  assert.equal("symbol" in item, false);
  assert.equal("direction" in item, false);
  assert.equal("analysisType" in item, false);
  assert.equal(item.images.length, 1);
}

function testAcademyNormalizationNoFakeFields() {
  const post = normalizeTelegramForContentPost(
    {
      id: "x",
      public_slug: "tg-ac-70",
      body: "درس Telegram",
      published_at: "2026-02-01T08:00:00Z",
      created_at: "2026-02-01T08:00:00Z",
      updated_at: "2026-02-01T08:00:00Z",
      display_title: "",
      image_url: null,
      images: [],
    },
    "academy"
  );

  assert.equal(post.source, "telegram");
  assert.equal(post.category, null);
  assert.equal(post.highlight_value, null);
  assert.equal(post.body, "درس Telegram");
  assert.match(post.title, /درس Telegram/);
}

function testArabicWhitespaceFidelity() {
  const body = "الفقرة الأولى\n\nالفقرة الثانية 🚀\n#BTC @HasanChart https://example.com\n123";
  const item = normalizeTelegramForDailyAnalysis({
    id: "1",
    body,
    published_at: "2026-02-01T08:00:00Z",
  });
  assert.equal(item.content, body);
  assert.ok(item.content.includes("\n\n"));
  assert.ok(item.content.includes("#BTC"));
  assert.ok(item.content.includes("@HasanChart"));
}

function testXssBodyPreservedAsTextNotHtml() {
  const malicious = '<script>alert(1)</script>\n<img src=x onerror=alert(2)>';
  const item = normalizeTelegramForDailyAnalysis({
    id: "1",
    body: malicious,
    published_at: "2026-02-01T08:00:00Z",
  });
  assert.equal(item.content, malicious);
  assert.ok(!item.content.includes("&lt;script")); // stored raw; React text node escapes at render
}

function testTelegramSlugIsolation() {
  assert.equal(isTelegramContentPublicSlug("tg-ac-70"), true);
  assert.equal(isTelegramContentPublicSlug("tg-rs-290"), true);
  assert.equal(isTelegramContentPublicSlug("my-manual-lesson"), false);
}

function testDailyFilterTelegramOnlyInAll() {
  const telegramItem = { source: "telegram" };
  const manualItem = { symbol: "BTC", title: "Bitcoin", content: "crypto" };

  assert.equal(matchesDailyAnalysisFilterForTest(telegramItem, "all"), true);
  assert.equal(matchesDailyAnalysisFilterForTest(telegramItem, "crypto"), false);
  assert.equal(matchesDailyAnalysisFilterForTest(manualItem, "all"), true);
}

function testPresentationTitleFromFirstLine() {
  const title = deriveTelegramPresentationTitle("\n\n  أول سطر مفيد\nثاني سطر", "");
  assert.equal(title, "أول سطر مفيد");
}

function testMergeCap() {
  const items = Array.from({ length: 120 }, (_, i) => ({
    id: String(i),
    published_at: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
  }));
  const merged = mergeFeedItemsByPublishedAt(items, { cap: 100 });
  assert.equal(merged.length, 100);
}

const tests = [
  testMergeChronological,
  testDailyTelegramNormalizationNoFakeMetadata,
  testAcademyNormalizationNoFakeFields,
  testArabicWhitespaceFidelity,
  testXssBodyPreservedAsTextNotHtml,
  testTelegramSlugIsolation,
  testDailyFilterTelegramOnlyInAll,
  testPresentationTitleFromFirstLine,
  testMergeCap,
];

let failed = 0;
for (const test of tests) {
  try {
    test();
    console.log(`PASS ${test.name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${test.name}`, error);
  }
}

if (failed > 0) {
  process.exitCode = 1;
  console.error(`\n${failed} test(s) failed`);
} else {
  console.log(`\nAll ${tests.length} Phase 3 public-read tests passed`);
}
