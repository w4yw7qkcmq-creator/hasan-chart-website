#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const root = path.join(__dirname, "..");
const { prepareTelegramPost } = require(path.join(root, "lib/telegram-news/pipeline"));
const { filterGeneralRssItems, markRssItemsAsGeneralOnly } = require(path.join(root, "lib/telegram-news/rss-filter"));

function post(overrides = {}) {
  return {
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "1",
    sourceUrl: "https://t.me/ForexBreakingNews/1",
    sourcePublishedAt: "2026-08-01T14:00:00+00:00",
    priority: 1,
    rawText: "",
    ...overrides,
  };
}

function expectTelegramAccepted(label, rawText, overrides = {}) {
  const prep = prepareTelegramPost(post({ rawText, ...overrides }));
  assert.strictEqual(prep.skip, false, `${label}: expected accepted, got ${prep.reason}`);
}

function expectTelegramSkipped(label, rawText, overrides = {}) {
  const prep = prepareTelegramPost(post({ rawText, ...overrides }));
  assert.strictEqual(prep.skip, true, `${label}: expected skipped`);
  assert.strictEqual(prep.reason, "TELEGRAM_NON_ECONOMIC_SKIPPED", `${label}: expected TELEGRAM_NON_ECONOMIC_SKIPPED, got ${prep.reason}`);
}

function testTelegramCpiAccepted() {
  expectTelegramAccepted(
    "CPI",
    "صدر الآن\nUS CPI m/m\nالسابق: 0.2%\nالمتوقع: 0.3%\nالحالي: 0.4%"
  );
}

function testTelegramNfpAccepted() {
  expectTelegramAccepted(
    "NFP",
    "Nonfarm Payrolls\nPrevious: 150K\nForecast: 180K\nActual: 200K"
  );
}

function testTelegramPowellSpeechAccepted() {
  expectTelegramAccepted(
    "Powell Speech",
    "Fed Chair Powell speech: inflation remains above target and policy will stay restrictive"
  );
}

function testTelegramFedStatementAccepted() {
  expectTelegramAccepted("Fed Statement", "FOMC statement: the Committee decided to maintain the target range for the federal funds rate");
}

function testTelegramFomcRateDecisionAccepted() {
  expectTelegramAccepted(
    "FOMC Rate Decision",
    "FOMC Rate Decision\nPrevious: 5.25%\nForecast: 5.50%\nActual: 5.50%"
  );
}

function testTelegramBeigeBookAccepted() {
  expectTelegramAccepted(
    "Beige Book",
    "Beige Book\nPrevious: n/a\nForecast: n/a\nActual: moderate growth"
  );
}

function testTelegramAdpAccepted() {
  expectTelegramAccepted(
    "ADP",
    "ADP Nonfarm Employment Change\nPrevious: 150K\nForecast: 160K\nActual: 175K"
  );
}

function testTelegramPreEventCpiAccepted() {
  expectTelegramAccepted("pre-event CPI", "⏰ باقي 5 دقائق على خبر CPI الأمريكي");
}

function testTelegramPreEventNfpAccepted() {
  expectTelegramAccepted("pre-event NFP", "⏰ باقي 5 دقائق على خبر NFP الأمريكي");
}

function testTelegramTrumpIranSkipped() {
  expectTelegramSkipped(
    "Trump/Iran",
    "🚨 Trump says Iran talks could resume if Tehran agrees to nuclear limits\nOil prices eased after the remarks"
  );
}

function testTelegramGoldSkipped() {
  expectTelegramSkipped("Gold", "Gold falls 1.8% to 4024 as the dollar rebounds");
}

function testTelegramCryptoSkipped() {
  expectTelegramSkipped("Crypto", "Bitcoin jumps 4% above 70000 after ETF inflows accelerate");
}

function testTelegramFedWatchSkipped() {
  expectTelegramSkipped("FedWatch", "FedWatch 67% hike July FOMC");
}

function testTelegramLoganSkipped() {
  expectTelegramSkipped("Logan", "Fed's Logan: inflation progress is uneven\nShe said policy should remain restrictive");
}

function testTelegramEveningDigestSkipped() {
  expectTelegramSkipped("digest", "موجز أخبار المساء\n• story A\n• story B");
}

function testRssGoldAccepted() {
  const items = filterGeneralRssItems([
    { title: "Gold rises 1.8% after Powell comments", contentSnippet: "Gold extended gains in New York trading" },
  ]);
  assert.strictEqual(items.length, 1);
  const marked = markRssItemsAsGeneralOnly(items);
  assert.strictEqual(marked[0].isRssGeneralOnly, true);
  assert.strictEqual(marked[0].isTelegramSource, false);
}

function testRssCryptoAccepted() {
  const items = filterGeneralRssItems([
    { title: "Bitcoin climbs above 70000", contentSnippet: "Crypto markets rallied on ETF demand" },
  ]);
  assert.strictEqual(items.length, 1);
}

function testRssGeopoliticalAccepted() {
  const items = filterGeneralRssItems([
    { title: "Trump warns Iran over nuclear program", contentSnippet: "Geopolitical tensions remain elevated" },
  ]);
  assert.strictEqual(items.length, 1);
}

function testRssStructuredTripleExcludedFromGeneral() {
  const items = filterGeneralRssItems([
    {
      title: "US CPI",
      contentSnippet: "Previous: 0.2%\nForecast: 0.3%\nActual: 0.4%",
    },
  ]);
  assert.strictEqual(items.length, 0);
}

async function run() {
  const tests = [
    testTelegramCpiAccepted,
    testTelegramNfpAccepted,
    testTelegramPowellSpeechAccepted,
    testTelegramFedStatementAccepted,
    testTelegramFomcRateDecisionAccepted,
    testTelegramBeigeBookAccepted,
    testTelegramAdpAccepted,
    testTelegramPreEventCpiAccepted,
    testTelegramPreEventNfpAccepted,
    testTelegramTrumpIranSkipped,
    testTelegramGoldSkipped,
    testTelegramCryptoSkipped,
    testTelegramFedWatchSkipped,
    testTelegramLoganSkipped,
    testTelegramEveningDigestSkipped,
    testRssGoldAccepted,
    testRssCryptoAccepted,
    testRssGeopoliticalAccepted,
    testRssStructuredTripleExcludedFromGeneral,
  ];

  for (const testCase of tests) {
    testCase();
  }

  console.log("TELEGRAM_SOURCE_POLICY_TESTS_PASSED", JSON.stringify({ tests: tests.length }));
}

run().catch((error) => {
  console.error("TELEGRAM_SOURCE_POLICY_TESTS_FAILED", error.message);
  process.exit(1);
});
