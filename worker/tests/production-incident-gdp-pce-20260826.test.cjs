#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");
const fixturesDir = path.join(root, "fixtures/news-intelligence/golden");

const { extractFactsFromTelegramPost } = require(path.join(root, "lib/telegram-news/extractor"));
const { buildEconomicTripleKey } = require(path.join(root, "lib/telegram-news/fingerprint"));
const { processTelegramPosts } = require(path.join(root, "lib/telegram-news/dedupe"));
const {
  publishValidatedTelegramNewsCandidate,
  resetAtomicPublishForTests,
  validateCandidateForAtomicPublish,
} = require(path.join(root, "lib/telegram-news/atomic-publish"));
const {
  resetPublishStateForTests,
  configurePublishWindowForTests,
  completeBaselineFetch,
} = require(path.join(root, "lib/telegram-news/publish-state"));
const { resetCheckpointStoreForTests, markCheckpointsHydrated } = require(path.join(
  root,
  "lib/news-ingestion/checkpoint-store"
));
const { resetDecisionRecordsForTests } = require(path.join(root, "lib/news-intelligence/autonomy/decision-record"));
const { buildPhase2PublicationRequest } = require(path.join(root, "lib/news-intelligence/economic-editorial/pipeline"));
const { isHighImpactEventKey } = require(path.join(root, "lib/telegram-news/economic-fast-lane"));
const { evaluateAnalysisDeliverableGate } = require(path.join(root, "lib/general-rss/analysis-deliverable-gate"));
const {
  tryReservePublicChartQuota,
  resetPublicChartQuotaForTests,
  isPublicChartQuotaBlocked,
} = require(path.join(root, "lib/general-rss/chart-visual-policy/public-chart-quota"));
const { consumesPublicChartQuota, classifyImageVisualType, VISUAL_TYPES } = require(path.join(
  root,
  "lib/general-rss/chart-visual-policy/chart-classifier"
));

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
  resetDecisionRecordsForTests();
  resetPublicChartQuotaForTests();
  markCheckpointsHydrated();
  configurePublishWindowForTests({ publishingEnabledAt: "2020-01-01T00:00:00Z" });
  completeBaselineFetch();
}

async function runFixturePipeline(fixtureName, label) {
  const fixture = loadFixture(fixtureName);
  const post = { ...fixture.post, rawText: fixture.sourceText };
  const facts = extractFactsFromTelegramPost(post);
  assert(facts.isStructuredTriple === true, `${label} structured triple`);
  assert(facts.canonicalEventKey === fixture.expected.canonicalEventKey, `${label} canonical`);
  assert(facts.previous === fixture.expected.previous, `${label} previous`);
  assert(facts.forecast === fixture.expected.forecast, `${label} forecast`);
  assert(facts.actual === fixture.expected.actual, `${label} actual`);
  assert(String(facts.title || "").includes(fixture.expected.titleContains), `${label} title`);

  const processed = await processTelegramPosts([post], {
    dryRun: false,
    flushImmediately: true,
    useMergeBuffer: false,
  });
  assert(processed.length === 1, `${label} processed one`);
  const candidate = processed[0];
  assert(candidate.newsType === "economic", `${label} economic`);
  assert(candidate.skipPublish !== true, `${label} publish-ready`);

  const validation = validateCandidateForAtomicPublish(candidate, {});
  assert(validation.ok === true, `${label} atomic validation: ${validation.issues?.join(", ")}`);

  const pubReq = require(path.join(root, "lib/news-intelligence/adapters")).buildTelegramPublicationRequest(
    candidate,
    validation,
    {}
  );
  const phase2 = await buildPhase2PublicationRequest(pubReq, {
    disableAi: true,
    testMode: true,
    allowPlaceholderImage: true,
  });
  assert(phase2.ok === true, `${label} phase2 quality gate: ${phase2.reason}`);

  const result = await publishValidatedTelegramNewsCandidate(candidate, {}, {
    dryRun: true,
    skipFamilyAggregation: true,
    disableAi: true,
    testMode: true,
    allowPlaceholderImage: true,
  });
  assert(result.published === true && result.dryRun === true, `${label} dry-run publish reached gateway stage`);
  return { post, facts, candidate, fixture };
}

async function runDedupeIndependenceTest(gdpFacts, pceFacts) {
  assert(gdpFacts.canonicalEventKey !== pceFacts.canonicalEventKey, "GDP/PCE distinct canonical");
  assert(buildEconomicTripleKey(gdpFacts) !== buildEconomicTripleKey(pceFacts), "GDP/PCE distinct triple key");
}

function runFastLaneTest() {
  assert(isHighImpactEventKey("US_GDP_QOQ") === true, "GDP fast lane HIGH");
  assert(isHighImpactEventKey("US_PCE") === true, "PCE fast lane HIGH");
}

function runAnalysisGateTests() {
  const teaser = evaluateAnalysisDeliverableGate({
    title: "انطلاق جلسة التداول بتحليل فني لزوج اليورو مقابل الدولار",
    contentSnippet: "يقدم التحليل نظرة على الاتجاهات الحالية والمخاطر والأهداف المحتملة",
  });
  assert(teaser.ok === false, "Arabic teaser rejected");

  const englishTeaser = evaluateAnalysisDeliverableGate({
    title: "Trading session outlook with technical analysis preview",
    contentSnippet: "This analysis offers a look at current trends, risks, and potential targets.",
  });
  assert(englishTeaser.ok === false, "English teaser rejected");

  const legitimate = evaluateAnalysisDeliverableGate({
    title: "EUR/USD breaks above 1.0920 resistance",
    contentSnippet: "The pair closed above 1.0920 with next target at 1.0980 and support at 1.0880.",
  });
  assert(legitimate.ok === true, "Legitimate analysis allowed");
}

async function runChartQuotaTests() {
  resetPublicChartQuotaForTests();
  const first = await tryReservePublicChartQuota({ skipProcessQueue: true, stateOverride: {} });
  assert(first.granted === true, "first chart granted");
  const second = await tryReservePublicChartQuota({ skipProcessQueue: true });
  assert(second.granted === false, "second chart blocked");
  assert(isPublicChartQuotaBlocked(Date.now(), first.state) === true, "rolling window active");

  const photoType = classifyImageVisualType("https://cdn.example.com/hero-photo.jpg", {
    title: "Company reports earnings beat",
  });
  assert(consumesPublicChartQuota(photoType) === false, "ordinary photo not chart quota");

  const chartType = classifyImageVisualType("https://cdn.example.com/stock-chart/usdjpy.png", {
    title: "USD/JPY price chart",
  });
  assert(chartType === VISUAL_TYPES.CHART, "chart url classified");
  assert(consumesPublicChartQuota(chartType) === true, "chart consumes quota");
}

async function main() {
  resetHarness();
  const gdp = await runFixturePipeline("production-incident-us-gdp-qoq-20260826.json", "GDP");
  resetHarness();
  const pce = await runFixturePipeline("production-incident-us-pce-20260826.json", "PCE");
  await runDedupeIndependenceTest(gdp.facts, pce.facts);
  runFastLaneTest();
  runAnalysisGateTests();
  await runChartQuotaTests();
  console.log("production-incident-gdp-pce-20260826.test.cjs: all passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
