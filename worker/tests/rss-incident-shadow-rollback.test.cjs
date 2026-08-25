#!/usr/bin/env node

const path = require("path");

const root = path.join(__dirname, "..");

const {
  validateGeneralRssEditorialOutput,
  buildRssPublicationPresentation,
  evaluateRssCuratorGate,
  CURATOR_OUTCOMES,
  validateRssMinimumInformation,
  MINIMUM_INFO_REASON_CODES,
  buildAndValidateFinalRssPublication,
  assertDeliveryMatchesValidatedPresentation,
  sanitizeRssDraftAiText,
  evaluateRssDuplicate,
  buildRssEventFingerprint,
} = require(path.join(root, "lib/general-rss"));

const FOOTER = "\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function testFooterDoesNotSatisfyMinimumBodyGate() {
  const headlineOnly = `🚨 خبر عاجل ⚠️${FOOTER}`;
  const editorial = validateGeneralRssEditorialOutput({
    title: "CNBC market headline",
    body: headlineOnly,
    rawSourceText: "Oil prices rise after Middle East tensions",
  });
  assert(!editorial.ok, "Headline/footer-only body must fail editorial length gate");
  assert(editorial.reason === "RSS_BODY_TOO_SHORT", "Footer must not inflate body length");
}

function testCnbcEmptyIncidentNeverValidates() {
  const presentation = buildRssPublicationPresentation({
    sourceTitle: "Oil prices jump as Middle East tensions rise",
    editorialMessage: `🚨 خبر عاجل ⚠️${FOOTER}`,
    imageTitle: "خبر عاجل",
  });
  const minimum = validateRssMinimumInformation(presentation);
  assert(!minimum.ok, "CNBC empty incident must fail minimum information gate");
}

function testNvidiaListicleCuratorSkips() {
  const gate = evaluateRssCuratorGate({
    title: "Here are 10 things to watch in the stock market Monday including Nvidia",
    contentSnippet: "Investors should watch Nvidia, earnings, and the Fed this week.",
  });
  assert(!gate.ok, "NVIDIA listicle must be skipped by curator");
  assert(gate.outcome === CURATOR_OUTCOMES.SKIP_LISTICLE, "Listicle outcome expected");
}

function testOilIranSameEventFingerprint() {
  const first = buildRssEventFingerprint({
    title: "Oil falls after Iran sanctions escalation",
    contentSnippet: "Crude prices retreated after Washington threatened harsher Iran sanctions.",
  });
  const second = buildRssEventFingerprint({
    title: "Crude retreats as Washington threatens harsher Iran sanctions",
    contentSnippet: "Oil prices dropped on renewed Iran sanction fears.",
  });
  assert(first && second, "Fingerprints required");
  assert(first === second, "Semantically same oil/Iran sanctions event should share fingerprint");
}

function testOilIranDistinctDevelopments() {
  const sanctions = buildRssEventFingerprint({
    title: "Oil falls after Iran sanctions escalation",
    contentSnippet: "Crude prices retreated after Washington threatened harsher Iran sanctions.",
  });
  const shipping = buildRssEventFingerprint({
    title: "Iran closes key shipping lane",
    contentSnippet: "Tehran blocked a strategic maritime route, raising supply concerns.",
  });
  assert(sanctions !== shipping, "Sanctions move and shipping closure must remain distinct");
}

function testGoodBreakingStoryStillPublishes() {
  const editorialMessage =
    "🚨 النفط يرتفع بعد تصعيد العقوبات على إيران\n\n" +
    "قفزت أسعار الخام بعد إعلان واشنطن عن عقوبات جديدة على طهران، ما أثار مخاوف إمدادات السوق.\n\n" +
    "📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi";
  const finalPublication = buildAndValidateFinalRssPublication({
    sourceTitle: "Oil jumps after new Iran sanctions",
    editorialMessage,
    imageTitle: "النفط يرتفع بعد تصعيد العقوبات على إيران",
  });
  assert(finalPublication.ok, "Good breaking story must remain publishable");
}

function testEnglishFilterDestructionBlocksDraft() {
  const sanitized = sanitizeRssDraftAiText(
    "🚨 خبر عاجل\n\nOil prices jumped after Middle East tensions escalated sharply.",
    { title: "Oil prices jump", isEconomicReleaseTitle: () => false }
  );
  assert(!sanitized.ok, "English-only factual body must invalidate draft");
  assert(
    sanitized.reason === "english_filter_removed_all_meaningful_content",
    "Expected english destruction reason"
  );
}

function testPostValidationImmutability() {
  const editorialMessage =
    "🚨 أسعار النفط تتراجع\n\n" +
    "تراجعت أسعار الخام بعد تصاعد المخاوف الجيوسياسية في المنطقة.\n\n" +
    "📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi";
  const finalPublication = buildAndValidateFinalRssPublication({
    sourceTitle: "Oil prices fall on geopolitical tensions",
    editorialMessage,
    imageTitle: "أسعار النفط تتراجع",
  });
  assert(finalPublication.ok, "Fixture must validate");
  const immutability = assertDeliveryMatchesValidatedPresentation(finalPublication.presentation, {
    telegramMessage: finalPublication.presentation.telegramMessage,
    siteTitle: finalPublication.presentation.siteTitle,
    siteContent: finalPublication.presentation.siteContent,
  });
  assert(immutability.ok, "Validated presentation must match delivery payload");
}

function testDuplicateEvaluationUsesEventFingerprint() {
  const item = {
    title: "Crude retreats as Washington threatens harsher Iran sanctions",
    contentSnippet: "Oil prices dropped on renewed Iran sanction fears.",
    link: "https://example.com/oil-2",
  };
  const duplicate = evaluateRssDuplicate(item, [
    {
      title: "Oil falls after Iran sanctions escalation",
      contentSnippet: "Crude prices retreated after Washington threatened harsher Iran sanctions.",
      link: "https://example.com/oil-1",
      rssEventFingerprint: buildRssEventFingerprint({
        title: "Oil falls after Iran sanctions escalation",
        contentSnippet: "Crude prices retreated after Washington threatened harsher Iran sanctions.",
      }),
    },
  ]);
  assert(duplicate.duplicate, "Same underlying event should dedupe");
  assert(duplicate.reason === "same_event_fingerprint", "Event fingerprint dedupe expected");
}

function run() {
  testFooterDoesNotSatisfyMinimumBodyGate();
  testCnbcEmptyIncidentNeverValidates();
  testNvidiaListicleCuratorSkips();
  testOilIranSameEventFingerprint();
  testOilIranDistinctDevelopments();
  testGoodBreakingStoryStillPublishes();
  testEnglishFilterDestructionBlocksDraft();
  testPostValidationImmutability();
  testDuplicateEvaluationUsesEventFingerprint();
  console.log("rss-incident-shadow-rollback tests passed");
}

run();
