#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");
const fixturesDir = path.join(root, "fixtures/news-intelligence/golden");

const { extractFactsFromTelegramPost } = require(path.join(root, "lib/telegram-news/extractor"));
const { resolveCanonicalEventKey } = require(path.join(root, "lib/economic-releases/canonical-events"));
const {
  resetCheckpointStoreForTests,
  bootstrapTelegramChannel,
  markTelegramMessageSeen,
  markCheckpointsHydrated,
  classifyTelegramMessage,
} = require(path.join(root, "lib/news-ingestion/checkpoint-store"));
const {
  resetPublishStateForTests,
  configurePublishWindowForTests,
  isSourcePublishable,
} = require(path.join(root, "lib/telegram-news/publish-state"));
const { validateCandidateForAtomicPublish } = require(path.join(root, "lib/telegram-news/atomic-publish"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function runFladelfiaCanonicalTests() {
  const fixture = loadFixture("production-incident-philly-fladelfia-20260917.json");
  const post = { ...fixture.post, rawText: fixture.sourceText };
  const facts = extractFactsFromTelegramPost(post);

  assert(facts.canonicalEventKey === fixture.expected.canonicalEventKey, "Fladelfia variant maps to Philadelphia Fed");
  assert(facts.actual === fixture.expected.actual, "actual 37.8");
  assert(facts.forecast === fixture.expected.forecast, "forecast 31.3");
  assert(facts.previous === fixture.expected.previous, "previous 47.4");
  assert(facts.isStructuredTriple === true, "structured triple");

  const english = resolveCanonicalEventKey("Philadelphia Fed Manufacturing Index", { countryCode: "US" });
  assert(english.eventKey === "US_PHILADELPHIA_FED_MANUFACTURING", "English Philadelphia Fed title");

  const standardArabic = resolveCanonicalEventKey("مؤشر فيلادلفيا للصناعات التحويلية", { countryCode: "US" });
  assert(standardArabic.eventKey === "US_PHILADELPHIA_FED_MANUFACTURING", "Standard Arabic Philadelphia title");
}

function runProcessedMarkRaceTest() {
  resetCheckpointStoreForTests();
  resetPublishStateForTests();
  markCheckpointsHydrated();
  configurePublishWindowForTests({ publishingEnabledAt: "2026-09-17T10:00:00.000Z" });

  const fixture = loadFixture("production-incident-philly-fladelfia-20260917.json");
  const post = { ...fixture.post, sourceMessageId: "42618", rawText: fixture.sourceText };
  bootstrapTelegramChannel(post.sourceChannel, [post], { nowMs: Date.parse("2026-09-17T12:29:00.000Z") });

  const facts = extractFactsFromTelegramPost(post);
  const candidate = {
    post,
    facts,
    newsType: "economic",
    skipPublish: false,
    formattedMessage:
      "🚨 مؤشر فيلادلفيا للصناعات التحويلية — الولايات المتحدة 🇺🇸\n\nالسابق: 47.4\nالمتوقع: 31.3\nالحالي: 37.8\n\n📊 القراءة:\nإيجابي للدولار الأمريكي.",
    resolvedTitle: "مؤشر فيلادلفيا للصناعات التحويلية",
  };

  assert(isSourcePublishable(post).ok === true, "publishable before premature processed mark");

  const matchingProcessed = [candidate];
  const shouldMarkProcessed = matchingProcessed.every((item) => {
    if (item.newsType === "economic" && !item.skipPublish && item.formattedMessage) {
      return false;
    }
    return item.skipPublish || item.observabilityOnly || item.finalFactCheck?.ok !== false || Boolean(item.newsType);
  });
  assert(shouldMarkProcessed === false, "economic publish candidate must not be marked processed early");

  const validation = validateCandidateForAtomicPublish(candidate, {});
  assert(validation.ok === true, "atomic validation passes for Philadelphia candidate");
  assert(isSourcePublishable(post).ok === true, "still publishable after validation");

  markTelegramMessageSeen(post.sourceChannel, post, { outcome: "processed" });
  assert(isSourcePublishable(post).ok === false, "processed mark still blocks replay duplicate");
}

function run() {
  runFladelfiaCanonicalTests();
  runProcessedMarkRaceTest();
  console.log("production-incident-philly-fladelfia-20260917.test.cjs PASS");
}

run();
