#!/usr/bin/env node

const path = require("path");
const root = path.join(__dirname, "..");

const { compareEconomicValues, parseEconomicNumber } = require(path.join(root, "lib/economic-releases/normalize"));
const {
  compareActualToForecast,
  interpretSingleEvent,
  buildForecastRelationPhrase,
} = require(path.join(root, "lib/news-intelligence/economic-editorial/deterministic-interpretation"));
const {
  formatSingleEditorial,
  joinSections,
} = require(path.join(root, "lib/news-intelligence/economic-editorial/arabic-formatter"));
const { getMergeWindowMs, isFamilyMergeCandidate } = require(path.join(root, "lib/telegram-news/merge-window"));
const {
  registerScheduledEvents,
  isFastLaneActive,
  getTelegramBurstPollIntervalMs,
  resetFastLaneStateForTests,
} = require(path.join(root, "lib/telegram-news/economic-fast-lane"));
const { resolveEventTypeFromAliases } = require(path.join(root, "lib/news-intelligence/event-registry"));
const { extractFactsFromTelegramPost } = require(path.join(root, "lib/telegram-news/extractor"));
const {
  getCachedEventImage,
  prewarmEventImage,
  resetEventImageCacheForTests,
} = require(path.join(root, "lib/news-images/event-image-cache"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function testNumericNormalization() {
  const inline = compareEconomicValues("11.80", "11.80K", { eventType: "US_ADP_EMPLOYMENT" });
  assert(inline.relation === "INLINE", "11.80 vs 11.80K inline for ADP");

  const inline2 = compareEconomicValues("11.8K", "11.80K", { eventType: "US_ADP_EMPLOYMENT" });
  assert(inline2.relation === "INLINE", "11.8K vs 11.80K inline");

  const above = compareEconomicValues("12.0K", "11.80K", { eventType: "US_ADP_EMPLOYMENT" });
  assert(above.relation === "ABOVE", "ADP above forecast");

  const below = compareEconomicValues("10.0K", "11.80K", { eventType: "US_ADP_EMPLOYMENT" });
  assert(below.relation === "BELOW", "ADP below forecast");

  const noGlobalK = parseEconomicNumber("11.80", { eventType: "US_CPI_MOM", peerValues: ["0.3%"] });
  assert(noGlobalK === 11.8, "CPI bare number not auto-multiplied");
}

function testDeterministicInterpretation() {
  const equal = interpretSingleEvent({
    eventType: "US_ADP_EMPLOYMENT",
    actual: "11.80K",
    forecast: "11.80K",
    previous: "9.50K",
    country: "US",
  });
  assert(equal.comparison.relation === "INLINE", "ADP inline comparison");
  assert(!/انحراف/.test(equal.interpretationLine), "no false deviation on inline ADP");
  assert(/مطابقة/.test(equal.interpretationLine), "inline wording present");

  const above = interpretSingleEvent({
    eventType: "US_ADP_EMPLOYMENT",
    actual: "13.0K",
    forecast: "11.80K",
    previous: "9.50K",
    country: "US",
  });
  assert(/أعلى/.test(above.interpretationLine), "ADP above wording");

  const below = interpretSingleEvent({
    eventType: "US_ADP_EMPLOYMENT",
    actual: "9.0K",
    forecast: "11.80K",
    previous: "9.50K",
    country: "US",
  });
  assert(/دون/.test(below.interpretationLine), "ADP below wording");

  const unknown = interpretSingleEvent({
    eventType: "US_ADP_EMPLOYMENT",
    actual: "???",
    forecast: "11.80K",
    previous: "9.50K",
    country: "US",
  });
  assert(unknown.comparison.relation === "UNKNOWN", "unknown relation");
  assert(!/انحراف/.test(unknown.interpretationLine), "unknown must not say deviation");
  assert(/تعذر تحديد/.test(unknown.interpretationLine), "unknown safe wording");
}

function testFormattingPreservesBlankLines() {
  const body = formatSingleEditorial({
    headline: "تقرير ADP للوظائف",
    countryLine: "الولايات المتحدة 🇺🇸",
    factsBlock: "السابق: 9.50K\nالمتوقع: 11.80K\nالحالي: 11.80K",
    interpretation: "جاءت القrاءة مطابقة للتوقعات وأعلى من القrاءة السابقة.".replace(/القrاءة/g, "القراءة"),
    marketImpact: "تأثير محدود مبدئيًا على الدولار الأمريكي.",
  });

  assert(body.includes("\n\n"), "blank lines preserved");
  assert(!body.includes("💵"), "removed extra money emoji section label");
  assert(body.includes("📊 القrاءة:") || body.includes("📊 القراءة:"), "reading section present");
  assert(body.includes("https://t.me/EconomicNewsi"), "footer present");
  assert(!/🌍/.test(body), "no country emoji line");
}

function testMergeWindowStandalone() {
  const adpFacts = {
    isStructuredTriple: true,
    importance: "high",
    canonicalEventKey: "US_ADP_EMPLOYMENT",
  };
  assert(getMergeWindowMs(adpFacts) === 0, "ADP standalone has zero merge wait");

  const joblessFacts = {
    isStructuredTriple: true,
    importance: "high",
    canonicalEventKey: "US_INITIAL_JOBLESS_CLAIMS",
  };
  assert(isFamilyMergeCandidate(joblessFacts), "jobless is family candidate");
  assert(getMergeWindowMs(joblessFacts) === 8000, "jobless family keeps merge window");
}

function testFastLaneBurst() {
  resetFastLaneStateForTests();
  const now = Date.parse("2026-08-25T12:30:00.000Z");
  registerScheduledEvents([
    { eventKey: "US_ADP_EMPLOYMENT", scheduledAt: "2026-08-25T12:31:00.000Z" },
  ]);
  assert(isFastLaneActive(now), "fast lane active inside burst window");
  assert(getTelegramBurstPollIntervalMs(now) === 3000, "burst poll interval");

  const after = Date.parse("2026-08-25T12:40:00.000Z");
  assert(!isFastLaneActive(after), "fast lane inactive after window");
  assert(getTelegramBurstPollIntervalMs(after) === null, "normal cadence outside burst");
}

function testSpGlobalAliases() {
  const compositeAr =
    "🟥 صدر الآن\nأمريكا\nستاندرد آند بورز\nمؤشر مديري المشتريات المركب\nالسابق 52.0\nالتقدير 52.5\nالحالي 52.8";
  assert(
    resolveEventTypeFromAliases(compositeAr) === "US_SP_GLOBAL_PMI",
    "Arabic S&P composite alias"
  );

  const servicesAr =
    "ستاندرد أند بورز\nمؤشر مديري المشتريات للخدمات\nالسابق 54.0\nالتقدير 54.2\nالحالي 54.5";
  assert(
    resolveEventTypeFromAliases(servicesAr) === "US_SP_GLOBAL_FLASH_SERVICES_PMI",
    "Arabic S&P services alias"
  );

  const manufacturingEn =
    "US - Standard & Poor's Flash Manufacturing PMI\nPrevious 53.9\nForecast 54.0\nActual 53.2";
  assert(
    resolveEventTypeFromAliases(manufacturingEn) === "US_SP_GLOBAL_FLASH_MANUFACTURING_PMI",
    "English Standard & Poor's manufacturing alias"
  );

  const post = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "90001",
    sourcePublishedAt: "2026-08-25T12:30:00.000Z",
    rawText: manufacturingEn,
  });
  assert(post.canonicalEventKey === "US_SP_GLOBAL_FLASH_MANUFACTURING_PMI", "extractor resolves S&P manufacturing");
}

async function testImageCacheAndTextFirstPolicy() {
  resetEventImageCacheForTests();
  assert(getCachedEventImage("US_ADP_EMPLOYMENT", "US") === null, "cache miss initially");
  const cached = await prewarmEventImage("US_ADP_EMPLOYMENT", {
    country: "US",
    title: "ADP Employment",
    importance: "HIGH",
  });
  assert(cached && cached.filePath, "prewarm stores cache entry");
  assert(getCachedEventImage("US_ADP_EMPLOYMENT", "US") !== null, "cache hit after prewarm");
}

async function run() {
  testNumericNormalization();
  testDeterministicInterpretation();
  testFormattingPreservesBlankLines();
  testMergeWindowStandalone();
  testFastLaneBurst();
  testSpGlobalAliases();
  await testImageCacheAndTextFirstPolicy();
  console.log("economic-fast-lane-incident.test.cjs passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
