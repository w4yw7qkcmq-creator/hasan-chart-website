#!/usr/bin/env node

const assert = require("assert");
const path = require("path");

const root = path.join(__dirname, "..");
const { prepareTelegramPost } = require(path.join(root, "lib/telegram-news/pipeline"));
const { TELEGRAM_SOURCE_CHANNELS } = require(path.join(root, "lib/telegram-news/sources"));
const { isOfficialHighImpactTelegramPost } = require(path.join(root, "lib/telegram-news/source-policy"));
const {
  resetPublishStateForTests,
  initializeBaselinesFromPosts,
  completeBaselineFetch,
  isSourcePublishable,
  configurePublishWindowForTests,
} = require(path.join(root, "lib/telegram-news/publish-state"));
const {
  resetCheckpointStoreForTests,
  hydrateFromDb,
  markTelegramMessageSeen,
  classifyTelegramMessage,
} = require(path.join(root, "lib/news-ingestion/checkpoint-store"));
const {
  validateCandidateForAtomicPublish,
  resetAtomicPublishForTests,
} = require(path.join(root, "lib/telegram-news/atomic-publish"));

const PROMO_FOOTER = "لمتابعة أخبار الأسهم والذهب والعملات إنضم للقناة من الرابط:\nTelegram.me/ForexBreakingNews";

const CONSUMER_CONFIDENCE_BODY = [
  "صدر الآن :",
  "أمريكا -",
  "مؤشر ثقة المستهلك CB",
  "▪️ السابق : 81.9",
  "▪️ التقدير : 81.2",
  "▫️ الحالي : 91.7",
  "النتيجة : إيجابي للدولار الأمريكي",
].join("\n");

const NEW_HOME_SALES_BODY = [
  "صدر الآن :",
  "أمريكا -",
  "مبيعات المنازل الجديدة",
  "▪️ السابق : 684K",
  "▪️ التقدير : 651K",
  "▫️ الحالي : 676K",
  "النتيجة : إيجابي للدولار الأمريكي",
].join("\n");

function approvedPost(overrides = {}) {
  return {
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "43490",
    sourceUrl: "https://t.me/ForexBreakingNews/43490",
    sourcePublishedAt: new Date().toISOString(),
    priority: 1,
    rawText: "",
    ...overrides,
  };
}

function withFooterMultiline(body) {
  return `${body}\n${PROMO_FOOTER}`;
}

function withFooterSingleLine(body) {
  return `${body.replace(/\n/g, " ")} لمتابعة أخبار الأسهم والذهب والعملات إنضم للقناة من الرابط: Telegram.me/ForexBreakingNews`;
}

function enablePublishState(baselineMessageId = "0") {
  resetPublishStateForTests();
  resetCheckpointStoreForTests();
  hydrateFromDb(null);
  resetAtomicPublishForTests();
  process.env.TELEGRAM_NEWS_PUBLISH_ENABLED = "1";
  const baselineTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  configurePublishWindowForTests({
    publishingEnabledAt: baselineTime,
    minimumPublishableSourceTime: baselineTime,
  });
  initializeBaselinesFromPosts([
    approvedPost({
      sourceMessageId: String(baselineMessageId),
      sourcePublishedAt: baselineTime,
    }),
    approvedPost({
      sourceChannel: "ForexNewspaper",
      sourceUrl: "https://t.me/ForexNewspaper/1",
      sourceMessageId: String(baselineMessageId),
      sourcePublishedAt: baselineTime,
    }),
  ]);
  completeBaselineFetch();
}

function assertStructuredAccepted(label, rawText, expectedEventKey) {
  const prep = prepareTelegramPost(approvedPost({ rawText }));
  assert.strictEqual(prep.skip, false, `${label}: expected accepted, got ${prep.reason}`);
  assert.notStrictEqual(prep.reason, "TELEGRAM_PROMOTION_SKIPPED", `${label}: must not be promotion-only`);
  const facts = prep.classification?.facts || {};
  assert.strictEqual(facts.isStructuredTriple, true, `${label}: expected structured triple`);
  assert.ok(isOfficialHighImpactTelegramPost(prep.classification), `${label}: expected official high-impact`);
  if (expectedEventKey) {
    assert.strictEqual(facts.canonicalEventKey, expectedEventKey, `${label}: canonical event`);
  }
  return prep;
}

function testApprovedSourcesUnchanged() {
  assert.deepStrictEqual(
    TELEGRAM_SOURCE_CHANNELS.map((channel) => channel.name),
    ["ForexBreakingNews", "ForexNewspaper"]
  );
}

function testConsumerConfidenceMultilineWithFooter() {
  const prep = assertStructuredAccepted(
    "CB multiline",
    withFooterMultiline(CONSUMER_CONFIDENCE_BODY),
    "US_CONSUMER_CONFIDENCE"
  );
  assert.strictEqual(prep.classification.facts.previous, "81.9");
  assert.strictEqual(prep.classification.facts.forecast, "81.2");
  assert.strictEqual(prep.classification.facts.actual, "91.7");
}

function testConsumerConfidenceSingleLineWithFooter() {
  const prep = assertStructuredAccepted(
    "CB single-line",
    withFooterSingleLine(CONSUMER_CONFIDENCE_BODY),
    "US_CONSUMER_CONFIDENCE"
  );
  assert.strictEqual(prep.classification.facts.previous, "81.9");
  assert.strictEqual(prep.classification.facts.forecast, "81.2");
  assert.strictEqual(prep.classification.facts.actual, "91.7");
}

function testNewHomeSalesMultilineWithFooter() {
  const prep = assertStructuredAccepted(
    "NHS multiline",
    withFooterMultiline(NEW_HOME_SALES_BODY),
    "US_NEW_HOME_SALES"
  );
  assert.strictEqual(prep.classification.facts.previous, "684K");
  assert.strictEqual(prep.classification.facts.forecast, "651K");
  assert.strictEqual(prep.classification.facts.actual, "676K");
}

function testNewHomeSalesSingleLineWithFooter() {
  const prep = assertStructuredAccepted(
    "NHS single-line",
    withFooterSingleLine(NEW_HOME_SALES_BODY),
    "US_NEW_HOME_SALES"
  );
  assert.strictEqual(prep.classification.facts.previous, "684K");
  assert.strictEqual(prep.classification.facts.forecast, "651K");
  assert.strictEqual(prep.classification.facts.actual, "676K");
}

function testPromotionOnlyStillSkipped() {
  const prep = prepareTelegramPost(
    approvedPost({
      rawText: `انضم للقناة الخاصة\nافتح حساب Exness من الرابط\nTelegram.me/ForexBreakingNews\n${PROMO_FOOTER}`,
    })
  );
  assert.strictEqual(prep.skip, true);
  assert.strictEqual(prep.reason, "TELEGRAM_PROMOTION_SKIPPED");
}

function testJoinFooterOnlyStillSkipped() {
  const prep = prepareTelegramPost(approvedPost({ rawText: PROMO_FOOTER }));
  assert.strictEqual(prep.skip, true);
  assert.strictEqual(prep.reason, "TELEGRAM_PROMOTION_SKIPPED");
}

function testBareNumbersAreNotAPromoBypass() {
  const prep = prepareTelegramPost(
    approvedPost({
      rawText: `81.9 81.2 91.7 684 651 676 انضم للقناة Telegram.me/ForexBreakingNews`,
    })
  );
  assert.strictEqual(prep.skip, true, "bare numbers must not be treated as a publishable economic release");
  assert.ok(
    prep.reason === "TELEGRAM_PROMOTION_SKIPPED" || prep.reason === "TELEGRAM_NON_ECONOMIC_SKIPPED",
    `bare numbers unexpected reason: ${prep.reason}`
  );
}

function testMissingNumericFieldsNotPromotionSkipped() {
  const prep = prepareTelegramPost(
    approvedPost({
      rawText: withFooterMultiline(
        ["صدر الآن :", "أمريكا -", "مؤشر ثقة المستهلك CB", "▪️ السابق : 81.9"].join("\n")
      ),
    })
  );
  assert.notStrictEqual(prep.reason, "TELEGRAM_PROMOTION_SKIPPED");
  assert.strictEqual(prep.classification?.facts?.forecast || null, null);
  assert.strictEqual(prep.classification?.facts?.actual || null, null);
}

function testUnapprovedSourceNotInFetchAllowlist() {
  const names = TELEGRAM_SOURCE_CHANNELS.map((channel) => channel.name);
  assert.ok(!names.includes("RandomForexTips"));
  assert.strictEqual(names.length, 2);
}

function testDuplicateEconomicReleaseIsOldSeen() {
  enablePublishState("43480");
  const post = approvedPost({
    sourceMessageId: "43490",
    rawText: withFooterMultiline(NEW_HOME_SALES_BODY),
  });
  const first = isSourcePublishable(post);
  assert.strictEqual(first.ok, true, `first pass should be new, got ${first.reason}`);
  markTelegramMessageSeen(post.sourceChannel, post, { outcome: "published" });
  const second = isSourcePublishable(post);
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.reason, "OLD_SEEN_MESSAGE");
  assert.strictEqual(classifyTelegramMessage(post.sourceChannel, post).new, false);
}

function testCheckpointOrderingTwoValidReleases() {
  enablePublishState("43480");
  const releaseA = approvedPost({
    sourceMessageId: "43490",
    rawText: withFooterMultiline(NEW_HOME_SALES_BODY),
  });
  const releaseB = approvedPost({
    sourceMessageId: "43491",
    sourceUrl: "https://t.me/ForexBreakingNews/43491",
    rawText: withFooterMultiline(CONSUMER_CONFIDENCE_BODY),
  });

  assert.strictEqual(prepareTelegramPost(releaseA).skip, false);
  assert.strictEqual(prepareTelegramPost(releaseB).skip, false);
  assert.strictEqual(isSourcePublishable(releaseA).ok, true);
  assert.strictEqual(isSourcePublishable(releaseB).ok, true);

  markTelegramMessageSeen(releaseB.sourceChannel, releaseB, { outcome: "processed" });

  const afterB = isSourcePublishable(releaseA);
  assert.strictEqual(afterB.ok, true, `A must remain publishable after B processed, got ${afterB.reason}`);
  const atomicA = validateCandidateForAtomicPublish(
    {
      post: releaseA,
      formattedMessage: "🚨 مبيعات المنازل الجديدة\n🌍 الولايات المتحدة\nالسابق: 684K\nالمتوقع: 651K\nالحالي: 676K\n📊 القراءة:\nالنتيجة إيجابية للدولار الأمريكي.",
      skipPublish: false,
      facts: { title: "مبيعات المنازل الجديدة", previous: "684K", forecast: "651K", actual: "676K" },
    },
    { mergeKey: "test-home-sales" }
  );
  assert.ok(!atomicA.issues.includes("OLD_SEEN_MESSAGE"), `atomic A must not be OLD_SEEN: ${atomicA.issues.join(",")}`);
}

function testCheckpointOrderingValidThenPromo() {
  enablePublishState("43480");
  const releaseA = approvedPost({
    sourceMessageId: "43490",
    rawText: withFooterMultiline(NEW_HOME_SALES_BODY),
  });
  const promoB = approvedPost({
    sourceMessageId: "43491",
    sourceUrl: "https://t.me/ForexBreakingNews/43491",
    rawText: `انضم للقناة الخاصة\nافتح حساب Exness\n${PROMO_FOOTER}`,
  });

  assert.strictEqual(prepareTelegramPost(releaseA).skip, false);
  const promoPrep = prepareTelegramPost(promoB);
  assert.strictEqual(promoPrep.skip, true);
  assert.strictEqual(promoPrep.reason, "TELEGRAM_PROMOTION_SKIPPED");

  markTelegramMessageSeen(promoB.sourceChannel, promoB, { outcome: "processed" });

  const afterPromo = isSourcePublishable(releaseA);
  assert.strictEqual(afterPromo.ok, true, `A must remain publishable after promo B, got ${afterPromo.reason}`);
  const atomicA = validateCandidateForAtomicPublish(
    {
      post: releaseA,
      formattedMessage: "🚨 مبيعات المنازل الجديدة\n🌍 الولايات المتحدة\nالسابق: 684K\nالمتوقع: 651K\nالحالي: 676K\n📊 القراءة:\nالنتيجة إيجابية للدولار الأمريكي.",
      skipPublish: false,
      facts: { title: "مبيعات المنازل الجديدة", previous: "684K", forecast: "651K", actual: "676K" },
    },
    { mergeKey: "test-home-sales-promo-sibling" }
  );
  assert.ok(!atomicA.issues.includes("OLD_SEEN_MESSAGE"), `atomic A must not be OLD_SEEN: ${atomicA.issues.join(",")}`);
}

async function run() {
  const tests = [
    testApprovedSourcesUnchanged,
    testConsumerConfidenceMultilineWithFooter,
    testConsumerConfidenceSingleLineWithFooter,
    testNewHomeSalesMultilineWithFooter,
    testNewHomeSalesSingleLineWithFooter,
    testPromotionOnlyStillSkipped,
    testJoinFooterOnlyStillSkipped,
    testBareNumbersAreNotAPromoBypass,
    testMissingNumericFieldsNotPromotionSkipped,
    testUnapprovedSourceNotInFetchAllowlist,
    testDuplicateEconomicReleaseIsOldSeen,
    testCheckpointOrderingTwoValidReleases,
    testCheckpointOrderingValidThenPromo,
  ];

  for (const testCase of tests) {
    testCase();
  }

  console.log(
    "TELEGRAM_PROMO_STRUCTURED_RELEASE_TESTS_PASSED",
    JSON.stringify({ tests: tests.length })
  );
}

run().catch((error) => {
  console.error("TELEGRAM_PROMO_STRUCTURED_RELEASE_TESTS_FAILED", error.stack || error.message);
  process.exit(1);
});
