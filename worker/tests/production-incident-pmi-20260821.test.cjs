#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");
const fixturesDir = path.join(root, "fixtures/news-intelligence/golden");

const { extractFactsFromTelegramPost } = require(path.join(root, "lib/telegram-news/extractor"));
const { buildCanonicalEventFromCandidate } = require(path.join(root, "lib/news-intelligence/event-normalizer"));
const { resolveEventTypeFromAliases, normalizeAliasText } = require(path.join(root, "lib/news-intelligence/event-registry"));
const { buildEconomicTripleKey } = require(path.join(root, "lib/telegram-news/fingerprint"));
const { processTelegramPosts } = require(path.join(root, "lib/telegram-news/dedupe"));
const { summarizeTelegramIngestion } = require(path.join(root, "lib/telegram-news/index"));
const {
  publishValidatedTelegramNewsCandidate,
  resetAtomicPublishForTests,
} = require(path.join(root, "lib/telegram-news/atomic-publish"));
const {
  resetPublishStateForTests,
  configurePublishWindowForTests,
  completeBaselineFetch,
  isSourcePublishable,
} = require(path.join(root, "lib/telegram-news/publish-state"));
const {
  resetCheckpointStoreForTests,
  bootstrapTelegramChannel,
  markTelegramMessageSeen,
  markCheckpointsHydrated,
} = require(path.join(root, "lib/news-ingestion/checkpoint-store"));
const { createTelegramMergeBuffer, resetTelegramMergeBufferForTests } = require(path.join(root, "lib/telegram-news/merge-buffer"));
const { getRecentDecisions, resetDecisionRecordsForTests } = require(path.join(root, "lib/news-intelligence/autonomy/decision-record"));
const { isPremiumImageEvent } = require(path.join(root, "lib/news-images/important-events"));
const { interpretSingleEvent } = require(path.join(root, "lib/news-intelligence/economic-editorial/deterministic-interpretation"));
const { resolveCanonicalEventKey } = require(path.join(root, "lib/economic-releases/canonical-events"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function resetHarness() {
  resetPublishStateForTests();
  resetCheckpointStoreForTests();
  resetAtomicPublishForTests();
  resetTelegramMergeBufferForTests();
  resetDecisionRecordsForTests();
  markCheckpointsHydrated();
  configurePublishWindowForTests({ publishingEnabledAt: "2020-01-01T00:00:00Z" });
  completeBaselineFetch();
}

function runFixtureExtractionTest(fixtureName, label) {
  const fixture = loadFixture(fixtureName);
  const post = { ...fixture.post, rawText: fixture.sourceText };
  const facts = extractFactsFromTelegramPost(post);
  assert(facts.canonicalEventKey === fixture.expected.canonicalEventKey, `${label} canonical event key`);
  assert(facts.actual === fixture.expected.actual, `${label} actual`);
  assert(facts.forecast === fixture.expected.forecast, `${label} forecast`);
  assert(facts.previous === fixture.expected.previous, `${label} previous`);
  assert(facts.isStructuredTriple === true, `${label} structured triple`);
  assert(String(facts.title || "").includes(fixture.expected.titleContains), `${label} title`);
  return { post, facts, fixture };
}

function runArabicAliasVariantTests() {
  const manufacturingVariants = [
    "مؤشر مديري المشتريات الصناعي",
    "مؤشر مديري المشتريات التصنيعي",
    "مديري المشتريات الصناعي",
    "مديري المشتريات التصنيعي",
    "مؤشر مديري المشتريات للقطاع الصناعي",
    "مؤcher مديري المشتريات للقطاع التصنيعي".replace("مؤcher", "مؤشر"),
  ];
  const servicesVariants = [
    "مؤشر مديري المشتريات الخدمي",
    "مؤشر مديري المشتريات للخدمات",
    "مديري المشتريات الخدمي",
    "مديري المشتريات الخدماتي",
    "مؤشر مديري المشتريات للقطاع الخدمي",
    "مؤشر مديري المشتريات لقطاع الخدمات",
  ];

  for (const title of manufacturingVariants) {
    const normalized = normalizeAliasText(title);
    assert(
      resolveEventTypeFromAliases(`${title}\nالسابق 53.9`) === "US_SP_GLOBAL_FLASH_MANUFACTURING_PMI",
      `manufacturing alias failed for ${normalized}`
    );
  }

  for (const title of servicesVariants) {
    assert(
      resolveEventTypeFromAliases(`${title}\nالسابق 54.6`) === "US_SP_GLOBAL_FLASH_SERVICES_PMI",
      `services alias failed for ${title}`
    );
  }

  assert(resolveEventTypeFromAliases("ISM Manufacturing PMI") === null, "ISM must not resolve through flash PMI aliases");
  assert(
    resolveCanonicalEventKey("ISM Manufacturing PMI").eventKey === "US_ISM_MANUFACTURING",
    "ISM manufacturing must remain on ISM canonical type"
  );
}

async function runDistinctIdentityTest() {
  const manufacturing = runFixtureExtractionTest(
    "production-incident-sp-global-flash-manufacturing-pmi-20260821.json",
    "Manufacturing"
  );
  const services = runFixtureExtractionTest(
    "production-incident-sp-global-flash-services-pmi-20260821.json",
    "Services"
  );

  const mfgKey = buildCanonicalEventFromCandidate({
    eventType: manufacturing.facts.canonicalEventKey,
    country: "US",
    releaseDate: manufacturing.post.sourcePublishedAt,
    actual: manufacturing.facts.actual,
    forecast: manufacturing.facts.forecast,
    previous: manufacturing.facts.previous,
  }).eventKey;
  const svcKey = buildCanonicalEventFromCandidate({
    eventType: services.facts.canonicalEventKey,
    country: "US",
    releaseDate: services.post.sourcePublishedAt,
    actual: services.facts.actual,
    forecast: services.facts.forecast,
    previous: services.facts.previous,
  }).eventKey;

  assert(mfgKey && svcKey, "event keys must exist");
  assert(mfgKey !== svcKey, "Manufacturing and Services must have distinct eventKeys");

  const mfgTriple = buildEconomicTripleKey(manufacturing.facts);
  const svcTriple = buildEconomicTripleKey(services.facts);
  assert(mfgTriple !== svcTriple, "economic triple fingerprints must differ");

  const processed = await processTelegramPosts([manufacturing.post, services.post], {
    disableAi: true,
    flushImmediately: true,
  });
  assert(processed.length === 2, "both PMI posts should remain distinct");
  assert(processed.every((item) => item.skipPublish === false), "both PMI posts should be publish-ready");
}

function runInterpretationTest() {
  const manufacturing = interpretSingleEvent({
    eventType: "US_SP_GLOBAL_FLASH_MANUFACTURING_PMI",
    actual: "53.2",
    forecast: "54.0",
    previous: "53.9",
  });
  assert(manufacturing.comparison.relation === "BELOW", "Manufacturing should be below forecast");

  const services = interpretSingleEvent({
    eventType: "US_SP_GLOBAL_FLASH_SERVICES_PMI",
    actual: "56.8",
    forecast: "53.9",
    previous: "54.6",
  });
  assert(services.comparison.relation === "ABOVE", "Services should be above forecast");
  assert(manufacturing.interpretationLine !== services.interpretationLine, "PMI interpretations must stay independent");
}

function runFactCheckMetricTest() {
  const summary = summarizeTelegramIngestion([], [
    { finalFactCheck: { ok: true } },
    { finalFactCheck: { ok: false, reason: "FINAL_MESSAGE_FACT_MISMATCH" } },
    { finalFactCheck: "ok" },
  ]);
  assert(summary.factCheckFailed === 1, "factCheckFailed must count only failed object checks");
}

async function runPhase2BlockDecisionTest() {
  resetHarness();
  process.env.NEWS_PHASE2_EDITORIAL = "1";

  const post = {
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "block-test",
    sourceUrl: "https://t.me/ForexBreakingNews/block-test",
    sourcePublishedAt: "2026-08-21T13:40:14.000Z",
    rawText:
      "🟥 صدر الآن :\n\n🇺🇸 أمريكا\n\n▪️ السابق : 53.9\n▪️ المتوقع : 54.0\n▫️ الحالي : 53.2",
  };
  const processed = await processTelegramPosts([post], { disableAi: true, flushImmediately: true });
  const item = processed[0];
  assert(item.facts.canonicalEventKey === null, "unrecognized triple must stay canonical-null before phase2");

  const result = await publishValidatedTelegramNewsCandidate(item, {}, { dryRun: false, forceMemory: true, supabase: null });
  assert(result.blocked === true, "missing canonical event must block");
  const decisions = getRecentDecisions({ sourceId: "ForexBreakingNews" });
  assert(decisions.length === 1, "Phase 2 block must write one terminal decision");
  assert(decisions[0].decision === "BLOCKED", "terminal decision must be BLOCKED");
  assert(
    decisions[0].reasonCode === "MISSING_CANONICAL_EVENT" ||
      decisions[0].reasonCode === "QUALITY_GATE_BLOCKED",
    "blocked PMI must record explicit reason"
  );
}

async function runSuccessfulPublishDecisionTest() {
  resetHarness();
  process.env.NEWS_PHASE2_EDITORIAL = "1";

  const fixture = loadFixture("production-incident-sp-global-flash-manufacturing-pmi-20260821.json");
  const post = { ...fixture.post, rawText: fixture.sourceText };
  const processed = await processTelegramPosts([post], { disableAi: true, flushImmediately: true });
  const item = processed[0];

  assert(isPremiumImageEvent(item.facts.canonicalEventKey) === true, "Flash manufacturing PMI must remain AI-primary eligible");

  const result = await publishValidatedTelegramNewsCandidate(item, {}, {
    dryRun: false,
    forceMemory: true,
    supabase: null,
    sendTelegramMessage: async () => ({ ok: true }),
    sendTelegramPhoto: async () => ({ ok: true }),
    saveNewsPostToSupabase: async () => ({ error: null }),
    savePublishedNewsToSupabase: async () => {},
    savePublishedNewsLink: () => {},
    dispatchMarketNewsNotifications: async () => {},
  });

  assert(result.published === true, "recognized PMI should publish");
  const publishedDecisions = getRecentDecisions({ sourceId: "ForexBreakingNews", reasonCode: "PUBLISHED" });
  assert(publishedDecisions.length === 1, "successful PMI publish must record PUBLISHED decision once");
  assert(
    publishedDecisions[0].eventType === "US_SP_GLOBAL_FLASH_MANUFACTURING_PMI",
    "published PMI decision must carry canonical event type"
  );
}

async function runMergeBufferCheckpointRaceTest() {
  resetHarness();
  const fixture = loadFixture("production-incident-sp-global-flash-manufacturing-pmi-20260821.json");
  const post = { ...fixture.post, sourceMessageId: "50001", rawText: fixture.sourceText };
  bootstrapTelegramChannel(post.sourceChannel, [post], { nowMs: Date.parse("2026-08-21T13:39:00.000Z") });

  assert(isSourcePublishable(post).ok === true, "PMI candidate publishable before processed mark");
  markTelegramMessageSeen(post.sourceChannel, post, { outcome: "processed" });
  assert(isSourcePublishable(post).ok === false, "Premature processed mark must block publish");

  resetHarness();
  bootstrapTelegramChannel(post.sourceChannel, [post], { nowMs: Date.parse("2026-08-21T13:39:00.000Z") });
  const mergeBuffer = createTelegramMergeBuffer({ disableAi: true });
  const submit = mergeBuffer.submit(post);
  assert(submit.action === "pending" || submit.action === "pending_dry_run", "Merge buffer accepts PMI candidate");
  assert(isSourcePublishable(post).ok === true, "PMI candidate stays publishable while pending merge flush");
  await mergeBuffer.flushAllSync({ disableAi: true });
  assert(isSourcePublishable(post).ok === true, "PMI flush path remains publishable before premature checkpoint mark");
}

async function main() {
  resetHarness();
  runFixtureExtractionTest("production-incident-sp-global-flash-manufacturing-pmi-20260821.json", "Manufacturing fixture A");
  runFixtureExtractionTest("production-incident-sp-global-flash-services-pmi-20260821.json", "Services fixture B");
  runArabicAliasVariantTests();
  await runDistinctIdentityTest();
  runInterpretationTest();
  runFactCheckMetricTest();
  await runPhase2BlockDecisionTest();
  await runSuccessfulPublishDecisionTest();
  await runMergeBufferCheckpointRaceTest();
  console.log("production-incident-pmi-20260821.test.cjs PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
