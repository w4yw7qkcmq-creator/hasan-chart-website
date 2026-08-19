#!/usr/bin/env node

const path = require("path");

const root = path.join(__dirname, "..");

const {
  buildRssPublicationPresentation,
  normalizeHeadlineComparable,
  bodyStartsWithEquivalentHeadline,
  removeLeadingHeadlineFromBody,
  validateGeneralRssEditorialOutput,
} = require(path.join(root, "lib/general-rss"));
const {
  resetCycleFunnelForTests,
  getCycleFunnel,
  recordPublicationAttempt,
  recordPublicationSuccess,
  recordRssPublished,
} = require(path.join(root, "lib/news-ingestion/cycle-funnel"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function countHeadlineOccurrences(text, headline) {
  const normalizedHeadline = normalizeHeadlineComparable(headline);
  const lines = String(text || "")
    .split(/\n+/)
    .map((line) => normalizeHeadlineComparable(line))
    .filter(Boolean);
  return lines.filter((line) => line === normalizedHeadline).length;
}

const FOREX_LIVE_FIXTURE = {
  sourceTitle: "Monday open indicative forex prices, August 10, 2026",
  imageTitle: "أسعار الفوركس التقديرية لافتتاح السوق يوم الاثنين، 10 أغسطس 2026",
  editorialMessage:
    "🚨 أسعار الفوركس التقديرية لافتتاح السوق يوم الاثنين، 10 أغسطس 2026 ⚠️\n\n" +
    "توقعات أسعار العملات الرئيسية مع بداية الأسبوع تشير إلى استقرار في بعض الأزواج، مع تحركات محدودة في السوق.\n\n" +
    "📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi",
};

function testRssPublishedMatchesLogicalSuccess() {
  resetCycleFunnelForTests();
  recordPublicationAttempt();
  recordPublicationSuccess();
  recordRssPublished();
  const funnel = getCycleFunnel();
  assert(funnel.publicationAttempts === 1, "publicationAttempts should be 1");
  assert(funnel.publicationsSuccess === 1, "publicationsSuccess should be 1");
  assert(funnel.rssPublished === 1, "rssPublished should be 1");
}

function testRssPublishedDoesNotDoubleCountDeliveryLegs() {
  resetCycleFunnelForTests();
  recordPublicationSuccess();
  recordRssPublished();
  const funnel = getCycleFunnel();
  assert(funnel.publicationsSuccess === 1, "logical success should count once");
  assert(funnel.rssPublished === 1, "rssPublished should count once for dual delivery");
}

function testRssPublishedDoesNotDoubleCountRetry() {
  resetCycleFunnelForTests();
  recordPublicationAttempt();
  recordPublicationSuccess();
  recordRssPublished();
  recordPublicationAttempt();
  const funnel = getCycleFunnel();
  assert(funnel.publicationAttempts === 2, "retry attempt tracked separately");
  assert(funnel.publicationsSuccess === 1, "retry must not double logical success");
  assert(funnel.rssPublished === 1, "retry must not double rssPublished");
}

function testDuplicateDoesNotIncrementRssPublished() {
  resetCycleFunnelForTests();
  const funnel = getCycleFunnel();
  assert(funnel.rssPublished === 0, "duplicate blocked cycle should keep rssPublished at 0");
  assert(funnel.publicationsSuccess === 0, "duplicate blocked cycle should keep publicationsSuccess at 0");
}

function testFailedPublicationDoesNotIncrementRssPublished() {
  resetCycleFunnelForTests();
  recordPublicationAttempt();
  const funnel = getCycleFunnel();
  assert(funnel.publicationAttempts === 1, "failed attempt recorded");
  assert(funnel.rssPublished === 0, "failed publication must not increment rssPublished");
  assert(funnel.publicationsSuccess === 0, "failed publication must not increment publicationsSuccess");
}

function testCanonicalHeadlineAppearsOnce() {
  const presentation = buildRssPublicationPresentation(FOREX_LIVE_FIXTURE);
  assert(
    countHeadlineOccurrences(presentation.telegramMessage, presentation.canonicalHeadline) === 1,
    "telegram message should contain canonical headline once"
  );
}

function testBodyWithHeadlineDoesNotDoubleRender() {
  const presentation = buildRssPublicationPresentation(FOREX_LIVE_FIXTURE);
  assert(
    !bodyStartsWithEquivalentHeadline(presentation.canonicalHeadline, presentation.siteContent),
    "site content should not repeat canonical headline at start"
  );
  assert(
    normalizeHeadlineComparable(presentation.siteTitle) ===
      normalizeHeadlineComparable(presentation.canonicalHeadline),
    "site title should own canonical headline"
  );
}

function testBodyWithoutHeadlineGetsCorrectPresentation() {
  const presentation = buildRssPublicationPresentation({
    sourceTitle: "Market update",
    imageTitle: "تحرك محدود في الأسواق",
    editorialMessage:
      "🚨 تحرك محدود في الأسواق\n\nشهدت الأسواق تذبذباً محدوداً خلال الجلسة.\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi",
  });
  assert(presentation.telegramMessage.includes("🚨"), "telegram keeps headline presentation");
  assert(presentation.siteContent.includes("شهدت الأسواق"), "site body preserved");
}

function testDifferentFirstSentenceIsNotRemoved() {
  const headline = "افتتاح هادئ لأسواق العملات";
  const body = "شهدت الأسواق افتتاحاً هادئاً مع ترقب البيانات.";
  assert(bodyStartsWithEquivalentHeadline(headline, body) === false, "different first sentence must remain");
  assert(removeLeadingHeadlineFromBody(headline, body) === body, "body must not be trimmed");
}

function testOfficialFooterStillAllowed() {
  const presentation = buildRssPublicationPresentation(FOREX_LIVE_FIXTURE);
  const editorialCheck = validateGeneralRssEditorialOutput({
    title: FOREX_LIVE_FIXTURE.sourceTitle,
    body: presentation.telegramMessage,
    rawSourceText:
      "Monday open indicative forex prices, August 10, 2026 with indicative FX levels for the week open.",
  });
  assert(editorialCheck.ok === true, "official footer must remain allowed after headline cleanup");
}

function testWebsiteTitleBodyDoNotDuplicateHeadline() {
  const presentation = buildRssPublicationPresentation(FOREX_LIVE_FIXTURE);
  assert(presentation.siteTitle.length > 0, "site title required");
  assert(!presentation.siteContent.startsWith(presentation.siteTitle), "site content must not repeat title");
}

function testForexLiveRegressionFixture() {
  resetCycleFunnelForTests();
  recordPublicationAttempt();
  recordPublicationSuccess();
  recordRssPublished();
  const funnel = getCycleFunnel();
  assert(funnel.publicationsSuccess === 1, "fixture expects publicationsSuccess = 1");
  assert(funnel.rssPublished === 1, "fixture expects rssPublished = 1");

  const presentation = buildRssPublicationPresentation(FOREX_LIVE_FIXTURE);
  assert(
    countHeadlineOccurrences(presentation.telegramMessage, presentation.canonicalHeadline) === 1,
    "fixture headline appears once"
  );
  assert(
    (presentation.telegramMessage.match(/https:\/\/t\.me\/EconomicNewsi/gi) || []).length === 1,
    "fixture footer appears once"
  );
  assert(presentation.dedupeIdentity.includes(FOREX_LIVE_FIXTURE.sourceTitle), "dedupe identity keeps source title");
}

function run() {
  testRssPublishedMatchesLogicalSuccess();
  testRssPublishedDoesNotDoubleCountDeliveryLegs();
  testRssPublishedDoesNotDoubleCountRetry();
  testDuplicateDoesNotIncrementRssPublished();
  testFailedPublicationDoesNotIncrementRssPublished();
  testCanonicalHeadlineAppearsOnce();
  testBodyWithHeadlineDoesNotDoubleRender();
  testBodyWithoutHeadlineGetsCorrectPresentation();
  testDifferentFirstSentenceIsNotRemoved();
  testOfficialFooterStillAllowed();
  testWebsiteTitleBodyDoNotDuplicateHeadline();
  testForexLiveRegressionFixture();
  console.log("rss-publication-cleanup tests passed");
}

run();
