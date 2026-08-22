#!/usr/bin/env node

const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");
const fixturesDir = path.join(root, "fixtures/news-intelligence/golden");

const { listCanonicalEventKeys } = require(path.join(root, "lib/economic-releases/canonical-events"));
const { countAliasCoverage, ARABIC_ALIASES } = require(path.join(root, "lib/news-intelligence/event-registry"));
const { listRegisteredEventTypes } = require(path.join(root, "lib/news-intelligence/economic-editorial/interpretation-registry"));
const { PREMIUM_IMAGE_EVENT_KEYS } = require(path.join(root, "lib/news-images/important-events"));
const { extractFactsFromTelegramPost } = require(path.join(root, "lib/telegram-news/extractor"));
const { buildEconomicTripleKey } = require(path.join(root, "lib/telegram-news/fingerprint"));
const { resolveCountryCode } = require(path.join(root, "lib/economic-releases/country-resolver"));
const {
  recordTelegramEconomicExitIfNeeded,
  resetTelegramTerminalDecisionsForTests,
} = require(path.join(root, "lib/telegram-news/terminal-economic-decision"));
const { getRecentDecisions, resetDecisionRecordsForTests } = require(path.join(
  root,
  "lib/news-intelligence/autonomy/decision-record"
));
const { resolveCanonicalEventKey } = require(path.join(root, "lib/economic-releases/canonical-events"));
const { resolveEventTypeFromAliases } = require(path.join(root, "lib/news-intelligence/event-registry"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), "utf8"));
}

function runRegistryCoverageReport() {
  const canonicalCount = listCanonicalEventKeys().length;
  const aliasCount = countAliasCoverage();
  const interpretationCount = listRegisteredEventTypes().length;
  const imageCount = PREMIUM_IMAGE_EVENT_KEYS.size;
  const countries = new Set(listCanonicalEventKeys().map((key) => key.split("_")[0]));

  return {
    canonicalCount,
    aliasCount,
    interpretationCount,
    imageCount,
    countries: [...countries].sort(),
    interpretationParity: interpretationCount >= canonicalCount,
    aliasParity: aliasCount >= Math.floor(canonicalCount * 0.8),
  };
}

function runUkRetailFixture() {
  const fixture = loadFixture("uk-core-retail-sales-forexnewspaper-20260821.json");
  const post = { ...fixture.post, rawText: fixture.sourceText };
  const facts = extractFactsFromTelegramPost(post);
  assert(facts.countryCode === "UK", "UK country code");
  assert(facts.canonicalEventKey === "UK_CORE_RETAIL_SALES", "UK core retail canonical");
  assert(facts.actual === fixture.expected.actual, "UK actual");
  assert(facts.isStructuredTriple === true, "UK structured triple");
}

function runSameTimeCollisionTests() {
  const mfg = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "m1",
    sourcePublishedAt: "2026-08-21T13:40:14.000Z",
    rawText: loadFixture("production-incident-sp-global-flash-manufacturing-pmi-20260821.json").sourceText,
  });
  const svc = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "s1",
    sourcePublishedAt: "2026-08-21T13:40:14.000Z",
    rawText: loadFixture("production-incident-sp-global-flash-services-pmi-20260821.json").sourceText,
  });
  assert(mfg.canonicalEventKey !== svc.canonicalEventKey, "PMI keys distinct");
  assert(buildEconomicTripleKey(mfg) !== buildEconomicTripleKey(svc), "PMI triple distinct");

  const uk = extractFactsFromTelegramPost({
    sourceChannel: "ForexNewspaper",
    sourceMessageId: "uk1",
    sourcePublishedAt: "2026-08-21T13:40:14.000Z",
    rawText: loadFixture("uk-core-retail-sales-forexnewspaper-20260821.json").sourceText,
  });
  const usClone = { ...mfg, canonicalEventKey: mfg.canonicalEventKey, previous: uk.previous, forecast: uk.forecast, actual: uk.actual };
  assert(buildEconomicTripleKey(uk) !== buildEconomicTripleKey(usClone), "country/event triple distinct");
}

function runDisambiguationTests() {
  assert(resolveEventTypeFromAliases("ISM Manufacturing PMI", { countryCode: "US" }) === "US_ISM_MANUFACTURING", "ISM manufacturing");
  assert(
    resolveEventTypeFromAliases("مؤشر مديري المشتريات الصناعي", { countryCode: "US" }) ===
      "US_SP_GLOBAL_FLASH_MANUFACTURING_PMI",
    "Flash manufacturing Arabic"
  );
  assert(
    resolveCanonicalEventKey("Michigan consumer sentiment", { countryCode: "US" }).eventKey === "US_MICHIGAN_SENTIMENT",
    "Michigan split"
  );
  assert(
    resolveCanonicalEventKey("Conference Board consumer confidence", { countryCode: "US" }).eventKey ===
      "US_CONSUMER_CONFIDENCE",
    "Consumer confidence split"
  );
}

function runTerminalDecisionInvariant() {
  resetTelegramTerminalDecisionsForTests();
  resetDecisionRecordsForTests();

  const fixture = loadFixture("production-incident-sp-global-flash-manufacturing-pmi-20260821.json");
  const post = { ...fixture.post, rawText: fixture.sourceText };
  const facts = extractFactsFromTelegramPost(post);

  recordTelegramEconomicExitIfNeeded({
    post,
    facts,
    reason: "QUALITY_GATE_BLOCKED",
    stage: "test",
  });

  const decisions = getRecentDecisions();
  assert(decisions.length === 1, "exactly one terminal decision");
  assert(decisions[0].reasonCode === "QUALITY_GATE_BLOCKED", "reason code preserved");

  recordTelegramEconomicExitIfNeeded({
    post,
    facts,
    reason: "QUALITY_GATE_BLOCKED",
    stage: "test_repeat",
  });
  assert(getRecentDecisions().length === 1, "no duplicate terminal decision");
}

function main() {
  runUkRetailFixture();
  runSameTimeCollisionTests();
  runDisambiguationTests();
  runTerminalDecisionInvariant();
  const report = runRegistryCoverageReport();
  console.log(JSON.stringify({ ok: true, report }, null, 2));
}

main();
