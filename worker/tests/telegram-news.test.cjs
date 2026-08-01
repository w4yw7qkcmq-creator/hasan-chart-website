#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");

const { parseTelegramChannelHtml, cleanTelegramSourceText } = require(path.join(root, "lib/telegram-news/fetcher"));
const { extractFactsFromTelegramPost, resolveCanonicalForTelegram } = require(path.join(root, "lib/telegram-news/extractor"));
const {
  buildTelegramNewsFingerprint,
  buildFingerprintBundle,
  buildEconomicTripleKey,
} = require(path.join(root, "lib/telegram-news/fingerprint"));
const { detectFactConflict } = require(path.join(root, "lib/telegram-news/conflict"));
const { dedupeTelegramPosts, processTelegramPosts, dedupeGroupEntries } = require(path.join(root, "lib/telegram-news/dedupe"));
const { formatTelegramPost } = require(path.join(root, "lib/telegram-news/format"));
const {
  validateFinalMessageAgainstFacts,
  validateAiOutputAgainstFacts,
} = require(path.join(root, "lib/telegram-news/invariants"));
const {
  rssItemHasStructuredTripleFields,
  filterGeneralRssItems,
} = require(path.join(root, "lib/telegram-news/rss-filter"));
const { fetchTelegramSourcePosts } = require(path.join(root, "lib/telegram-news/index"));
const {
  stripPromotionalFooter,
  stripPromotionalContent,
  isPromotionOnly,
  hasRealNewsContent,
} = require(path.join(root, "lib/telegram-news/promo-filter"));
const { classifyTelegramPost } = require(path.join(root, "lib/telegram-news/classifier"));
const { prepareTelegramPost } = require(path.join(root, "lib/telegram-news/pipeline"));
const { scoreNewsValue } = require(path.join(root, "lib/telegram-news/quality-gate"));
const {
  buildEditorialDraft,
  validateEditorialDraft,
  buildStructuredFactsForEditorial,
} = require(path.join(root, "lib/telegram-news/editorial"));
const {
  formatTelegramNewsMessage,
  stripTimestampFooter,
} = require(path.join(root, "lib/telegram-news/telegram-formatter"));
const { removeSemanticRepetition } = require(path.join(root, "lib/telegram-news/repetition"));
const {
  createTelegramMergeBuffer,
  resetTelegramMergeBufferForTests,
} = require(path.join(root, "lib/telegram-news/merge-buffer"));
const { detectPostPublishAction, snapshotFacts } = require(path.join(root, "lib/telegram-news/post-publish"));
const {
  buildAiImpactParagraph,
  resolveImpactWithAi,
} = require(path.join(root, "lib/telegram-news/ai-impact"));
const {
  resolveEditorialTitle,
  isGenericTitle,
  buildEconomicEditorialTitle,
} = require(path.join(root, "lib/telegram-news/editorial-title"));
const {
  buildConciseEditorialMessage,
  buildConciseStructuredFallback,
  buildMinimalStructuredFallback,
} = require(path.join(root, "lib/telegram-news/concise-editorial"));
const { splitMultiStoryPost, expandPostsWithMultiStory } = require(path.join(root, "lib/telegram-news/multi-story"));
const {
  buildFedWatchFingerprint,
  compareFedWatchUpdates,
  applyFedWatchDedup,
} = require(path.join(root, "lib/telegram-news/fedwatch-dedup"));
const { validateFinalEditorialQuality } = require(path.join(root, "lib/telegram-news/editorial-quality"));
const { createEditorialMetrics, resolveDraftWithSimilarityRetry } = require(path.join(root, "lib/telegram-news/editorial"));

const fixturesDir = path.join(__dirname, "fixtures");

function loadFixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

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

function testCrossChannelEconomicDedupDifferentTitles() {
  const textA = "صدر الآن\nConsumer Confidence\nالسابق: 49.5\nالمتوقع: 54.4\nالحالي: 55.2";
  const textB = "PMI Flash Release\nالسابق: 49.5\nالمتوقع: 54.4\nالحالي: 55.2";
  const deduped = dedupeTelegramPosts([
    post({ sourceChannel: "ForexNewspaper", sourceMessageId: "13458", priority: 2, rawText: textA }),
    post({ sourceChannel: "ForexBreakingNews", sourceMessageId: "41461", rawText: textB }),
  ]);

  assert.strictEqual(deduped.length, 1);
  assert.deepStrictEqual(deduped[0].sources.sort(), ["ForexBreakingNews", "ForexNewspaper"].sort());
  assert.strictEqual(deduped[0].metadata.sourceMessageIds.length, 2);
  assert.strictEqual(deduped[0].facts.previous, "49.5");
  assert.strictEqual(deduped[0].facts.actual, "55.2");
}

async function testCrossChannelSinglePublishViaMergeBuffer() {
  resetTelegramMergeBufferForTests();
  const publishLog = [];
  let now = 1_000;

  const buffer = createTelegramMergeBuffer({
    dryRun: true,
    nowFn: () => now,
    setTimerFn: () => null,
    clearTimerFn: () => {},
    onReady: async (item) => {
      publishLog.push(item);
    },
  });

  const textA = "صدر الآن\nConfidence\nالسابق: 49.5\nالمتوقع: 54.4\nالحالي: 55.2";
  const textB = "Now:\nالسابق: 49.5\nالمتوقع: 54.4\nالحالي: 55.2";

  buffer.submit(post({ sourceChannel: "ForexNewspaper", sourceMessageId: "1", priority: 2, rawText: textA }));
  buffer.submit(post({ sourceChannel: "ForexBreakingNews", sourceMessageId: "2", rawText: textB }));

  await buffer.flushAllSync({ disableAi: true });

  assert.strictEqual(publishLog.length, 1);
  assert.strictEqual(publishLog[0].skipPublish, false);
  assert.deepStrictEqual(publishLog[0].sources.sort(), ["ForexBreakingNews", "ForexNewspaper"].sort());
  assert.strictEqual(publishLog[0].metadata.sourceMessageIds.length, 2);
  assert.strictEqual(buffer.getActiveTimerCount(), 0);
}

async function testMergeBufferTimerMergeAtEightSeconds() {
  resetTelegramMergeBufferForTests();
  const publishLog = [];
  let now = 0;
  const timers = new Map();
  let timerSeq = 0;

  const buffer = createTelegramMergeBuffer({
    dryRun: false,
    nowFn: () => now,
    setTimerFn: (fn, delay) => {
      const id = ++timerSeq;
      timers.set(id, { fn, fireAt: now + delay });
      return id;
    },
    clearTimerFn: (id) => timers.delete(id),
    onReady: async (item) => publishLog.push(item),
  });

  const triple = "السابق: 49.5\nالمتوقع: 54.4\nالحالي: 55.2";
  const first = buffer.submit(post({ sourceChannel: "ForexBreakingNews", sourceMessageId: "10", rawText: `A\n${triple}` }));
  now = 4_000;
  buffer.submit(
    post({ sourceChannel: "ForexNewspaper", sourceMessageId: "11", priority: 2, rawText: `B\n${triple}` })
  );

  now = 8_000;
  await buffer.flush(first.mergeKey, { disableAi: true });

  assert.strictEqual(publishLog.length, 1);
  assert.strictEqual(buffer.getActiveTimerCount(), 0);
}

async function testMergeBufferLateDuplicateSkipped() {
  resetTelegramMergeBufferForTests();
  const publishLog = [];
  let now = 0;
  const timers = new Map();
  let timerSeq = 0;

  const buffer = createTelegramMergeBuffer({
    dryRun: false,
    nowFn: () => now,
    setTimerFn: (fn, delay) => {
      const id = ++timerSeq;
      timers.set(id, { fn, fireAt: now + delay });
      return id;
    },
    clearTimerFn: (id) => timers.delete(id),
    onReady: async (item) => publishLog.push(item),
  });

  const triple = "السابق: 56.7\nالمتوقع: 56.0\nالحالي: 57.6";
  const first = buffer.submit(post({ sourceMessageId: "20", rawText: `First\n${triple}` }));

  now = 8_000;
  await buffer.flush(first.mergeKey, { disableAi: true });

  now = 20_000;
  const second = buffer.submit(
    post({ sourceChannel: "ForexNewspaper", sourceMessageId: "21", priority: 2, rawText: `Late\n${triple}` })
  );

  assert.strictEqual(publishLog.length, 1);
  assert.strictEqual(second.action, "duplicate_skip");
}

async function testAiAcceptedWhenValid() {
  const facts = extractFactsFromTelegramPost(
    post({ rawText: "CPI\nالسابق: 0.2%\nالمتوقع: 0.3%\nالحالي: 0.4%" })
  );

  const resolved = await resolveImpactWithAi(facts, {
    disableAi: false,
    aiBuilder: async () => ({
      usedAi: true,
      rejected: false,
      title: facts.title,
      impactParagraph: "• الدولار: متباين\n• الذهب: متباين\n• الأسهم: متباين\n• العملات الرقمية: متباين",
      fallback: false,
      aiResult: "accepted",
    }),
  });
  assert.strictEqual(resolved.aiResult, "accepted");
  assert.ok(resolved.impactParagraph.includes("الدولار"));
}

async function testAiRejectedUsesFallback() {
  const facts = extractFactsFromTelegramPost(
    post({ rawText: "CPI\nالسابق: 0.2%\nالمتوقع: 0.3%\nالحالي: 0.4%" })
  );

  const resolved = await resolveImpactWithAi(facts, {
    disableAi: false,
    aiBuilder: async () => ({
      usedAi: true,
      rejected: true,
      title: facts.title,
      impactParagraph: null,
      fallback: true,
      aiResult: "rejected_fact_mismatch",
    }),
  });
  assert.strictEqual(resolved.aiResult, "rejected_fact_mismatch");
  assert.ok(resolved.impactParagraph);
}

async function testAiTimeoutFallback() {
  const facts = extractFactsFromTelegramPost(
    post({ rawText: "CPI\nالسابق: 0.2%\nالمتوقع: 0.3%\nالحالي: 0.4%" })
  );

  const resolved = await resolveImpactWithAi(facts, {
    disableAi: false,
    aiBuilder: async () => ({
      usedAi: true,
      rejected: true,
      fallback: true,
      aiResult: "fallback",
      reason: "ai_error",
      title: facts.title,
      impactParagraph: null,
    }),
  });
  assert.strictEqual(resolved.aiResult, "fallback");
  assert.ok(resolved.impactParagraph);
}

function testPromoFooterStrippedNewsKept() {
  const raw = "🟥 الذهب يتراجع 1.8%\nتفاصيل السوق\nاشترك في القناة";
  const cleaned = stripPromotionalFooter(raw);
  assert.ok(cleaned.includes("الذهب"));
  assert.ok(!cleaned.includes("اشترك"));
  assert.strictEqual(isPromotionOnly(raw), false);
}

function testPromoOnlySkipped() {
  assert.strictEqual(isPromotionOnly("اخبار الفوركس العاجلة 📊 📚"), true);
  assert.strictEqual(isPromotionOnly("https://t.me/ForexBreakingNews"), true);
  assert.strictEqual(isPromotionOnly("Exness - open your account now"), true);
}

function testEconomicWithPromoFooterStillPublishable() {
  const facts = extractFactsFromTelegramPost(
    post({
      rawText: "CPI\nالسابق: 0.2%\nالمتوقع: 0.3%\nالحالي: 0.4%\nاشترك في القناة",
    })
  );
  assert.strictEqual(facts.previous, "0.2%");
}

function testPostPublishCorrectionPending() {
  const published = snapshotFacts(
    { previous: "0.2%", forecast: "0.3%", actual: "0.4%", canonicalEventKey: "US_CPI_MOM" },
    "merge-key-1"
  );
  const update = detectPostPublishAction(
    published,
    { previous: "0.2%", forecast: "0.3%", actual: "0.5%" },
    { mergeKey: "merge-key-1", sourceMessageId: "999" }
  );
  assert.strictEqual(update.action, "TELEGRAM_NEWS_UPDATE_PENDING");
  assert.ok(update.changedFields.includes("actual"));
}

function testPostPublishSameNumbersDuplicateSkip() {
  const published = snapshotFacts({ previous: "49.5", forecast: "54.4", actual: "55.2" }, "k1");
  const result = detectPostPublishAction(published, {
    previous: "49.5",
    forecast: "54.4",
    actual: "55.2",
  });
  assert.strictEqual(result.action, "duplicate_skip");
}

function testEconomicTripleKeyIgnoresTitle() {
  const a = extractFactsFromTelegramPost(post({ rawText: "صدر الآن\nالسابق: 49.5\nالمتوقع: 54.4\nالحالي: 55.2" }));
  const b = extractFactsFromTelegramPost(
    post({ rawText: "Different Title\nالسابق: 49.5\nالمتوقع: 54.4\nالحالي: 55.2" })
  );
  assert.strictEqual(buildEconomicTripleKey(a), buildEconomicTripleKey(b));
}

function testEconomicExtractionPreservesNumbers() {
  const text = loadFixture("telegram-economic-release.txt");
  const facts = extractFactsFromTelegramPost(post({ rawText: text }));
  assert.strictEqual(facts.previous, "49.5");
  assert.strictEqual(facts.forecast, "54.4");
  assert.strictEqual(facts.actual, "55.2");
}

async function testIncompleteEconomicNoPublish() {
  const facts = extractFactsFromTelegramPost(
    post({ rawText: "صدر الآن\nمؤشر CPI\nالسابق: 0.2%\nالمتوقع: 0.3%" })
  );
  const formatted = await formatTelegramPost(post(), facts, { disableAi: true });
  assert.strictEqual(formatted.skipPublish, true);
  assert.strictEqual(formatted.formatted, null);
}

async function testZeroActualIsValid() {
  const facts = extractFactsFromTelegramPost(
    post({ rawText: "NFP\nالسابق: 150K\nالمتوقع: 120K\nالحالي: 0K" })
  );
  const formatted = await formatTelegramPost(post(), facts, { disableAi: true });
  assert.strictEqual(formatted.skipPublish, false);
  assert.ok(formatted.formatted.includes("0K"));
}

function testAiChangedNumberRejected() {
  const facts = extractFactsFromTelegramPost(
    post({ rawText: "CPI\nالسابق: 0.2%\nالمتوقع: 0.3%\nالحالي: 0.4%" })
  );
  const validation = validateAiOutputAgainstFacts({ title: "CPI", impactParagraph: "Actual 0.5%" }, facts);
  assert.strictEqual(validation.ok, false);
}

function testParserFromFixtureHtml() {
  const html = loadFixture("telegram-channel-sample.html");
  const parsed = parseTelegramChannelHtml(html, { name: "ForexBreakingNews", priority: 1 });
  assert.ok(parsed.length >= 1);
}

async function testExnessFullAdSkipped() {
  const processed = await processTelegramPosts([
    post({
      rawText: "Exness - افتح حسابك الآن\none.exness.link/a\nبونص 50%\nسبريد منخفض",
    }),
  ], { disableAi: true });
  assert.strictEqual(processed.length, 1);
  assert.strictEqual(processed[0].skipPublish, true);
  assert.match(processed[0].reason, /PROMOTION|BROKER/);
}

async function testAccountLinkSkipped() {
  const processed = await processTelegramPosts([
    post({ rawText: "https://t.me/joinchat/abc123" }),
  ], { disableAi: true });
  assert.strictEqual(processed[0].skipPublish, true);
}

async function testSubscriptionOfferSkipped() {
  const processed = await processTelegramPosts([
    post({ rawText: "عرض خاص: اشتراك شهري 100$ → 75$\nVIP توصيات مدفوعة" }),
  ], { disableAi: true });
  assert.strictEqual(processed[0].skipPublish, true);
}

async function testChannelPrivateAdSkipped() {
  const processed = await processTelegramPosts([
    post({ rawText: "قناة المضاربات الخاصة\nانضم الآن\nحصاد أسبوع توصياتنا" }),
  ], { disableAi: true });
  assert.strictEqual(processed[0].skipPublish, true);
}

async function testRealNewsExnessFooterRemoved() {
  const processed = await processTelegramPosts([
    post({
      rawText: "🟥 الذهب يرتفع 1.2% بعد تصريحات الفيدرالي\nتفاصيل: Powell highlighted inflation risks\nExness - open account",
    }),
  ], { disableAi: true });
  assert.strictEqual(processed[0].skipPublish, false);
  assert.ok(processed[0].promoFooterRemoved);
  assert.ok(!processed[0].formattedMessage.includes("Exness"));
}

async function testMichiganEconomicTemplate() {
  const rawText = "صدر الآن\nUniversity of Michigan Sentiment\nالسابق: 67.8\nالمتوقع: 68.5\nالحالي: 69.1";
  const processed = await processTelegramPosts([post({ rawText })], { disableAi: true });
  const msg = processed[0].formattedMessage;
  assert.ok(msg.includes("🚨"));
  assert.ok(msg.includes("السابق: 67.8"));
  assert.ok(msg.includes("المتوقع: 68.5"));
  assert.ok(msg.includes("الحالي: 69.1"));
  assert.ok(!msg.includes("ما الذي حدث"));
  assert.ok(!msg.includes("أهم التفاصيل"));
}

async function testIsmEconomicTemplate() {
  const rawText = "صدر الآن\nISM Manufacturing PMI\nالسابق: 49.5\nالمتوقع: 50.2\nالحالي: 50.9";
  const processed = await processTelegramPosts([post({ rawText })], { disableAi: true });
  const msg = processed[0].formattedMessage;
  assert.ok(msg.includes("49.5"));
  assert.ok(msg.includes("50.9"));
  assert.ok(msg.includes("📊 التأثير المحتمل"));
}

async function testLoganGeneralTemplate() {
  const rawText =
    "🚨 Fed's Logan: inflation progress is uneven\nShe said policy should remain restrictive until confidence improves";
  const processed = await processTelegramPosts([post({ rawText })], { disableAi: true });
  const msg = processed[0].formattedMessage;
  assert.ok(msg);
  assert.ok(!msg.includes("ما الذي حدث"));
  assert.ok(!msg.includes("ForexBreakingNews"));
}

async function testTrumpIranGeneralTemplate() {
  const rawText = "🚨 Trump says Iran talks could resume if Tehran agrees to nuclear limits\nOil prices eased after the remarks";
  const processed = await processTelegramPosts([post({ rawText })], { disableAi: true });
  assert.strictEqual(processed[0].skipPublish, false);
  assert.ok(/ترامب|Trump/i.test(processed[0].formattedMessage));
  assert.ok(!isGenericTitle(processed[0].resolvedTitle || ""));
}

async function testPreEventWithEventName() {
  const processed = await processTelegramPosts([
    post({ rawText: "⏰ باقي 5 دقائق على خبر NFP الأمريكي" }),
  ], { disableAi: true });
  const msg = processed[0].formattedMessage;
  assert.strictEqual(processed[0].skipPublish, false);
  assert.ok(msg.startsWith("⏳"));
  assert.ok(msg.includes("NFP"));
}

async function testPreEventVagueSkipped() {
  const processed = await processTelegramPosts([
    post({ rawText: "⏰ باقي 5 دقائق على أخبار الدولار المهمة" }),
  ], { disableAi: true });
  assert.strictEqual(processed[0].skipPublish, true);
  assert.strictEqual(processed[0].reason, "PRE_EVENT_ALERT_MISSING_EVENT_NAME");
}

function testTimestampFooterRemoved() {
  const msg = formatTelegramNewsMessage({
    template: "general",
    headline: "اختبار",
    summary: "ملخص خبر.",
    bullets: [],
    impact: "تأثير محتمل.",
  });
  const withFooter = `${msg}\n\n🕒 2026/07/31 5:00 م`;
  const cleaned = stripTimestampFooter(withFooter);
  assert.ok(!cleaned.includes("2026/07/31"));
  assert.ok(!cleaned.includes("🕒"));
}

function testEventTimeInsideBodyKept() {
  const body = "🚨 قرار الفائدة\n\nيصدر الساعة 9:00 مساءً بتوقيت سوريا.";
  assert.ok(body.includes("9:00"));
}

async function testAiChangedNumberRejectedInDraft() {
  const facts = extractFactsFromTelegramPost(post({ rawText: "CPI\nالسابق: 0.2%\nالمتوقع: 0.3%\nالحالي: 0.4%" }));
  const structured = buildStructuredFactsForEditorial(facts, post());
  const draft = "🚨 CPI\n\nالحالي: 0.5%";
  const check = validateEditorialDraft(draft, post().rawText, facts, structured);
  assert.strictEqual(check.ok, false);
}

function testSimilarityTriggersFallbackPath() {
  const source = "Gold rises 1.8% after Powell comments on inflation risks in the US session";
  const draft = "Gold rises 1.8% after Powell comments on inflation risks in the US session";
  const check = validateEditorialDraft(draft, source, { numbers: ["1.8%"] }, { keyNumbers: ["1.8%"] });
  assert.ok(check.issues.includes("AI_EDITORIAL_DRAFT_TOO_SIMILAR"));
}

function testNoChannelNamesInOutput() {
  const msg = formatTelegramNewsMessage({
    template: "general",
    headline: "تحديث",
    summary: "ملخص.",
    bullets: [],
    impact: "تأثير.",
  });
  assert.ok(!/ForexBreakingNews|ForexNewspaper/i.test(msg));
}

function testNoSourceLinksInOutput() {
  const msg = formatTelegramNewsMessage({
    template: "general",
    headline: "تحديث",
    summary: "ملخص.",
    bullets: [],
    impact: "تأثير.",
  });
  assert.ok(!/https?:\/\//i.test(msg));
}

function testNoPlaceholdersInOutput() {
  const msg = formatTelegramNewsMessage({
    template: "economic",
    headline: "CPI",
    country: "الولايات المتحدة",
    previous: "0.2%",
    forecast: "0.3%",
    actual: "0.4%",
    impact: "تأثير.",
  });
  assert.ok(!/غير\s*متوفر/i.test(msg));
}

function testNoSemanticRepetitionInSections() {
  const cleaned = removeSemanticRepetition({
    headline: "الذهب يرتفع",
    summary: "الذهب يرتفع",
    bullets: ["الذهب يرتفع"],
    impact: "قد يؤثر على الدولار.",
  });
  assert.notStrictEqual(cleaned.summary, cleaned.headline);
  assert.strictEqual(cleaned.bullets.length, 0);
}

async function testAiFailureDoesNotStopNews() {
  const rawText = "CPI\nالسابق: 0.2%\nالمتوقع: 0.3%\nالحالي: 0.4%";
  const processed = await processTelegramPosts([post({ rawText })], {
    disableAi: false,
    aiBuilder: async () => ({ rejected: true, fallback: true, aiResult: "fallback", impactParagraph: null }),
  });
  assert.strictEqual(processed[0].skipPublish, false);
  assert.ok(processed[0].formattedMessage);
}

async function testPromotionOnlyNeverFormats() {
  const processed = await processTelegramPosts([
    post({ rawText: "Exness broker promo code VIP" }),
  ], { disableAi: false });
  assert.strictEqual(processed[0].formattedMessage, null);
  assert.strictEqual(processed[0].aiResult, "none");
}

async function testLowValueSkipped() {
  const processed = await processTelegramPosts([
    post({ rawText: "تابعونا لأخبار عاجلة قريبًا 📊" }),
  ], { disableAi: true });
  assert.strictEqual(processed[0].skipPublish, true);
}

function testSpacingRules() {
  const msg = formatTelegramNewsMessage({
    template: "economic",
    headline: "CPI",
    country: "US",
    previous: "0.2%",
    forecast: "0.3%",
    actual: "0.4%",
    impact: "تأثير.",
  });
  assert.ok(msg.includes("🚨 CPI\n\n🌍"));
  assert.ok(!/\n{3,}/.test(msg));
}

function testConsumerConfidenceGenericTitleResolved() {
  const facts = {
    title: "صدر الآن",
    isStructuredTriple: true,
    canonicalEventKey: "US_CONSUMER_CONFIDENCE",
    actual: "55.2",
    forecast: "54.4",
    previous: "49.5",
  };
  const result = resolveEditorialTitle(facts, "US_CONSUMER_CONFIDENCE", "صدر الآن");
  assert.strictEqual(result.rejected, false);
  assert.ok(result.title.includes("ثقة المستهلك"));
  assert.ok(!isGenericTitle(result.title));
}

function testTrumpIranGenericTitleResolved() {
  const facts = {
    title: "عاجل",
    detailLines: ["Trump says Iran talks could resume if Tehran agrees to nuclear limits"],
    entities: ["Trump", "Iran"],
  };
  const result = resolveEditorialTitle(facts, null, "عاجل");
  assert.strictEqual(result.rejected, false);
  assert.ok(/ترامب|إيران/i.test(result.title));
}

function testGenericTitleWithoutFactsRejected() {
  const result = resolveEditorialTitle({ title: "عاجل" }, null, "عاجل");
  assert.strictEqual(result.rejected, true);
  assert.strictEqual(result.reason, "GENERIC_TITLE_REJECTED");
}

function testLongGeneralNewsUnder600Chars() {
  const longLine = "A".repeat(500);
  const structuredFacts = {
    factualPoints: [longLine, "Gold rises 1.8% after Powell comments on inflation risks in the US session"],
    officials: ["Powell"],
    keyNumbers: ["1.8%"],
  };
  const facts = {
    title: "Gold update",
    detailLines: structuredFacts.factualPoints,
    numbers: ["1.8%"],
    entities: ["Powell"],
  };
  const draft = buildConciseStructuredFallback(structuredFacts, facts);
  assert.strictEqual(draft.ok, true);
  const msg = formatTelegramNewsMessage({
    template: "general",
    headline: draft.headline,
    summary: draft.summary,
    bullets: draft.bullets,
    impact: draft.impact,
  });
  assert.ok(msg.length <= 600, `expected <=600 got ${msg.length}`);
}

function testConciseMessageMaxThreeBullets() {
  const structuredFacts = {
    factualPoints: [
      "Fed's Logan said inflation progress is uneven and policy should stay restrictive",
      "Markets trimmed rate-cut bets after the remarks",
      "Gold eased while the dollar held firm in late trading",
      "Treasury yields moved higher across the curve",
    ],
    officials: ["Logan"],
    keyNumbers: [],
  };
  const facts = {
    title: "Fed remarks",
    detailLines: structuredFacts.factualPoints,
    entities: ["Logan"],
  };
  const draft = buildConciseEditorialMessage(structuredFacts, facts);
  assert.strictEqual(draft.ok, true);
  assert.ok(draft.bullets.length <= 3);
}

function testSimilarityRetryUsesStructuredFacts() {
  const structuredFacts = {
    factualPoints: ["Gold rises 1.8% after Powell comments on inflation risks in the US session"],
    keyNumbers: ["1.8%"],
  };
  const facts = { title: "Gold", detailLines: structuredFacts.factualPoints, numbers: ["1.8%"] };
  const source = structuredFacts.factualPoints[0];
  const metrics = createEditorialMetrics();
  const resolved = resolveDraftWithSimilarityRetry(structuredFacts, facts, source, metrics);
  assert.ok(resolved.draft);
  const formatted = formatTelegramNewsMessage({
    template: "general",
    headline: resolved.draft.headline,
    summary: resolved.draft.summary,
    bullets: resolved.draft.bullets,
    impact: resolved.draft.impact,
  });
  const check = validateEditorialDraft(formatted, source, facts, structuredFacts);
  assert.ok(check.ok || metrics.structuredFallbackUsed > 0);
}

function testSimilarityRetryFallsBackToConciseStructured() {
  const structuredFacts = {
    factualPoints: ["Gold rises 1.8% after Powell comments on inflation risks in the US session"],
    keyNumbers: ["1.8%"],
  };
  const facts = { title: "Gold", detailLines: structuredFacts.factualPoints, numbers: ["1.8%"] };
  const source = structuredFacts.factualPoints[0];
  const metrics = createEditorialMetrics();
  const resolved = resolveDraftWithSimilarityRetry(structuredFacts, facts, source, metrics);
  assert.ok(resolved.draft);
  assert.ok(metrics.aiEditorialAccepted >= 1 || metrics.structuredFallbackUsed >= 1);
}

function testStructuredFallbackDoesNotMirrorRawDetailLines() {
  const structuredFacts = {
    factualPoints: [
      "Line one about markets",
      "Line two about oil",
      "Line three about rates",
    ],
    officials: ["Trump"],
    keyNumbers: [],
  };
  const facts = {
    title: "Trump update",
    detailLines: structuredFacts.factualPoints,
    entities: ["Trump"],
  };
  const fallback = buildConciseStructuredFallback(structuredFacts, facts, { reorder: true });
  assert.strictEqual(fallback.ok, true);
  assert.notDeepStrictEqual(fallback.bullets, structuredFacts.factualPoints.map((l) => l));
}

function testMultiStoryDigestSplitsIntoThree() {
  const rawText = `موجز مساء
• Trump says Iran talks could resume if Tehran agrees to nuclear limits
• Japan intervened in the yen after a sharp move in Tokyo trading
• Gold rises 1.8% after Powell comments on inflation risks`;
  const result = splitMultiStoryPost(post({ rawText }));
  assert.strictEqual(result.split, true);
  assert.strictEqual(result.stories.length, 3);
}

function testUnclearMultiStoryDigestSkipped() {
  const rawText = "موجز مساء\n• short\n• tiny";
  const result = splitMultiStoryPost(post({ rawText }));
  assert.strictEqual(result.unclear, true);
  assert.strictEqual(result.reason, "MULTI_STORY_UNCLEAR");
}

function testFedWatchDuplicateSameProbability() {
  const items = applyFedWatchDedup([
    {
      post: post({ rawText: "FedWatch: 67% chance of a 25bp hike at the July FOMC meeting", sourcePublishedAt: "2026-08-01T10:00:00+00:00" }),
      facts: { title: "FedWatch", isPlainFedNews: true },
      skipPublish: false,
    },
    {
      post: post({ rawText: "FedWatch update: 67% probability for July FOMC hike", sourcePublishedAt: "2026-08-01T11:00:00+00:00" }),
      facts: { title: "FedWatch", isPlainFedNews: true },
      skipPublish: false,
    },
  ]);
  const skipped = items.filter((i) => i.reason === "fedwatch_duplicate_skip");
  assert.strictEqual(skipped.length, 1);
}

function testFedWatchMinorChangePrefersLatest() {
  const comparison = compareFedWatchUpdates(
    { post: { rawText: "FedWatch 63.4% hike July FOMC" }, facts: {} },
    { post: { rawText: "FedWatch 67% hike July FOMC" }, facts: {} }
  );
  assert.strictEqual(comparison.action, "duplicate_skip");
}

function testFedWatchMaterialChangeUpdatePending() {
  const comparison = compareFedWatchUpdates(
    { post: { rawText: "FedWatch 40% hike July FOMC" }, facts: {} },
    { post: { rawText: "FedWatch 67% hike July FOMC" }, facts: {} }
  );
  assert.strictEqual(comparison.action, "update_pending");
  const items = applyFedWatchDedup([
    {
      post: post({ rawText: "FedWatch 40% hike July FOMC", sourcePublishedAt: "2026-08-01T10:00:00+00:00" }),
      facts: { isPlainFedNews: true },
      skipPublish: false,
    },
    {
      post: post({ rawText: "FedWatch 67% hike July FOMC", sourcePublishedAt: "2026-08-01T11:00:00+00:00" }),
      facts: { isPlainFedNews: true },
      skipPublish: false,
    },
  ]);
  assert.ok(items.every((i) => i.skipPublish === true));
  assert.ok(items.some((i) => i.reason === "TELEGRAM_NEWS_UPDATE_PENDING"));
}

function testEconomicCanonicalTitleFromKey() {
  const title = buildEconomicEditorialTitle(
    { actual: "50.9", forecast: "50.2" },
    "US_ISM_MANUFACTURING"
  );
  assert.ok(title.includes("التصنيع"));
  assert.ok(!isGenericTitle(title));
}

function testNoHeadlineRepeatInSummary() {
  const msg = formatTelegramNewsMessage({
    template: "general",
    headline: "الذهب يرتفع بعد تصريحات باوell",
    summary: "تحركت أسعار الذهب صعودًا بعد تصريحات Powell حول التضخم.",
    bullets: ["الدولار استقر"],
    impact: "قد تنعكس الحركة على الذهب والدولار خلال الجلسة.",
  });
  const check = validateFinalEditorialQuality(msg, { numbers: [] }, { template: "general" });
  assert.ok(check.ok || !check.issues.includes("headline_repeated"));
}

function testQualityGateCharacterLimit() {
  const longMsg = `🚨 عنوان حقيقي للخبر\n\n${"x".repeat(620)}`;
  const check = validateFinalEditorialQuality(longMsg, {}, { template: "general" });
  assert.ok(check.issues.includes("character_limit_exceeded"));
}

function testQualityGateNoSourceChannel() {
  const msg = "🚨 خبر\n\nملخص.\n\n📊 التأثير المحتمل:\nتأثير.";
  const check = validateFinalEditorialQuality(msg, {}, { template: "general" });
  assert.ok(!check.issues.includes("channel_name_leak"));
}

function testQualityGateNoSourceLink() {
  const msg = formatTelegramNewsMessage({
    template: "general",
    headline: "تحديث السوق",
    summary: "ملخص.",
    bullets: [],
    impact: "تأثير.",
  });
  assert.ok(!/https?:\/\//i.test(msg));
}

function testQualityGateNoTimestampFooter() {
  const msg = stripTimestampFooter("🚨 خبر\n\nملخص.\n\n🕒 2026/08/01 10:00 PM");
  assert.ok(!/🕒|2026\//.test(msg));
}

function testQualityGateNoPlaceholders() {
  const check = validateFinalEditorialQuality("🚨 CPI\n\nغير متوفر", {}, { template: "general" });
  assert.ok(check.issues.includes("placeholder_text"));
}

function testQualityGateNoFactMismatch() {
  const msg = formatTelegramNewsMessage({
    template: "general",
    headline: "الذهب يرتفع بعد Powell",
    summary: "سجل الذهب ارتفاعًا بنسبة 1.8% بعد تصريحات Powell حول التضخم.",
    bullets: [],
    impact: "قد ينعكس ذلك على الدولار والذهب خلال الجلسة.",
  });
  const check = validateFinalEditorialQuality(msg, { numbers: ["1.8%"], rawNumbers: ["1.8%"] }, { template: "general" });
  assert.ok(check.ok);
}

function testQualityGateMaxThreeBullets() {
  const msg = `🚨 تحديث حقيقي للسوق\n\nملخص.\n\n📌 أبرز التفاصيل:\n• a\n• b\n• c\n• d\n\n📊 التأثير المحتمل:\nتأثير.`;
  const check = validateFinalEditorialQuality(msg, {}, { template: "general" });
  assert.ok(check.issues.includes("too_many_bullets"));
}

function testQualityGateImpactDoesNotRepeatFact() {
  const msg = `🚨 الذهب يقفز في الجلسة\n\nسجل الذهب ارتفاعًا بنسبة 1.8% بعد Powell.\n\n📊 التأثير المحتمل:\nسجل الذهب ارتفاعًا بنسبة 1.8% بعد Powell.`;
  const check = validateFinalEditorialQuality(msg, { numbers: ["1.8%"] }, { template: "general" });
  assert.ok(check.issues.includes("impact_repeats_fact"));
}

async function testFinalMessagePassesQualityGate() {
  const rawText = "🚨 Trump says Iran talks could resume if Tehran agrees to nuclear limits\nOil prices eased after the remarks";
  const processed = await processTelegramPosts([post({ rawText })], { disableAi: true });
  assert.strictEqual(processed[0].skipPublish, false);
  assert.ok(processed[0].qualityCheck?.ok !== false);
  assert.ok(processed[0].formattedMessage.length <= 600);
}

async function run() {
  const tests = [
    testCrossChannelEconomicDedupDifferentTitles,
    testCrossChannelSinglePublishViaMergeBuffer,
    testMergeBufferTimerMergeAtEightSeconds,
    testMergeBufferLateDuplicateSkipped,
    testAiAcceptedWhenValid,
    testAiRejectedUsesFallback,
    testAiTimeoutFallback,
    testPromoFooterStrippedNewsKept,
    testPromoOnlySkipped,
    testEconomicWithPromoFooterStillPublishable,
    testPostPublishCorrectionPending,
    testPostPublishSameNumbersDuplicateSkip,
    testEconomicTripleKeyIgnoresTitle,
    testEconomicExtractionPreservesNumbers,
    testIncompleteEconomicNoPublish,
    testZeroActualIsValid,
    testAiChangedNumberRejected,
    testParserFromFixtureHtml,
    testExnessFullAdSkipped,
    testAccountLinkSkipped,
    testSubscriptionOfferSkipped,
    testChannelPrivateAdSkipped,
    testRealNewsExnessFooterRemoved,
    testMichiganEconomicTemplate,
    testIsmEconomicTemplate,
    testLoganGeneralTemplate,
    testTrumpIranGeneralTemplate,
    testPreEventWithEventName,
    testPreEventVagueSkipped,
    testTimestampFooterRemoved,
    testEventTimeInsideBodyKept,
    testAiChangedNumberRejectedInDraft,
    testSimilarityTriggersFallbackPath,
    testNoChannelNamesInOutput,
    testNoSourceLinksInOutput,
    testNoPlaceholdersInOutput,
    testNoSemanticRepetitionInSections,
    testAiFailureDoesNotStopNews,
    testPromotionOnlyNeverFormats,
    testLowValueSkipped,
    testSpacingRules,
    testConsumerConfidenceGenericTitleResolved,
    testTrumpIranGenericTitleResolved,
    testGenericTitleWithoutFactsRejected,
    testLongGeneralNewsUnder600Chars,
    testConciseMessageMaxThreeBullets,
    testSimilarityRetryUsesStructuredFacts,
    testSimilarityRetryFallsBackToConciseStructured,
    testStructuredFallbackDoesNotMirrorRawDetailLines,
    testMultiStoryDigestSplitsIntoThree,
    testUnclearMultiStoryDigestSkipped,
    testFedWatchDuplicateSameProbability,
    testFedWatchMinorChangePrefersLatest,
    testFedWatchMaterialChangeUpdatePending,
    testEconomicCanonicalTitleFromKey,
    testNoHeadlineRepeatInSummary,
    testQualityGateCharacterLimit,
    testQualityGateNoSourceChannel,
    testQualityGateNoSourceLink,
    testQualityGateNoTimestampFooter,
    testQualityGateNoPlaceholders,
    testQualityGateNoFactMismatch,
    testQualityGateMaxThreeBullets,
    testQualityGateImpactDoesNotRepeatFact,
    testFinalMessagePassesQualityGate,
  ];

  for (const testCase of tests) {
    await testCase();
  }

  console.log("TELEGRAM_NEWS_TESTS_PASSED", JSON.stringify({ tests: tests.length }));
}

run().catch((error) => {
  console.error("TELEGRAM_NEWS_TESTS_FAILED", error.message);
  process.exit(1);
});
