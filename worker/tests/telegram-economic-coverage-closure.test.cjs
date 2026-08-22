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
const { isPremiumImageEvent } = require(path.join(root, "lib/news-images/important-events"));
const { isOfficialHighImpactTelegramPost } = require(path.join(root, "lib/telegram-news/source-policy"));
const { resolveNewsImagePolicy, IMAGE_POLICY_MODES } = require(path.join(root, "lib/news-images/image-policy"));
const { SOURCE_TYPES } = require(path.join(root, "lib/news-intelligence/publication-types"));

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
  assert(
    resolveCanonicalEventKey("ISM Manufacturing PMI", { countryCode: "US" }).eventKey === "US_ISM_MANUFACTURING",
    "ISM manufacturing"
  );
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

function runFixture(name, checks = {}) {
  const fixture = loadFixture(name);
  const post = { ...fixture.post, rawText: fixture.sourceText };
  const facts = extractFactsFromTelegramPost(post);
  if (fixture.expected.canonicalEventKey) {
    assert(facts.canonicalEventKey === fixture.expected.canonicalEventKey, `${name} canonical`);
  }
  if (fixture.expected.countryCode) {
    assert(facts.countryCode === fixture.expected.countryCode, `${name} country`);
  }
  if (fixture.expected.actual) {
    assert(facts.actual === fixture.expected.actual, `${name} actual`);
  }
  if (fixture.expected.previous) {
    assert(facts.previous === fixture.expected.previous, `${name} previous`);
  }
  if (fixture.expected.forecast) {
    assert(facts.forecast === fixture.expected.forecast, `${name} forecast`);
  }
  if (fixture.expected.isStructuredTriple != null) {
    assert(facts.isStructuredTriple === fixture.expected.isStructuredTriple, `${name} triple`);
  }
  if (checks.extra) checks.extra(facts, fixture);
  return facts;
}

function runChRuEzFixtureSuite() {
  runFixture("ch-snb-rate-decision-ar-20260822.json");
  runFixture("ch-cpi-ar-20260822.json");
  runFixture("ru-cbr-rate-decision-ar-20260822.json");
  runFixture("ru-cpi-ar-20260822.json");
  runFixture("ez-ecb-rate-decision-ar-20260822.json");
  runFixture("ez-core-cpi-20260822.json");
}

function runCountryFirstCpiDisambiguation() {
  const base = `\u0645\u0624\u0634\u0631 \u0627\u0644\u062a\u0636\u062e\u0645`;
  const ch = resolveCanonicalEventKey(`${base} 🇨🇭`, { countryCode: resolveCountryCode(`${base} 🇨🇭`) }).eventKey;
  const ru = resolveCanonicalEventKey(`${base} 🇷🇺`, { countryCode: resolveCountryCode(`${base} 🇷🇺`) }).eventKey;
  const ez = resolveCanonicalEventKey(`${base} 🇪🇺`, { countryCode: resolveCountryCode(`${base} 🇪🇺`) }).eventKey;
  assert(ch === "CH_CPI" || ch === "CH_CPI_GENERIC", "CH CPI disambiguation");
  assert(ru === "RU_CPI" || ru === "RU_CPI_GENERIC", "RU CPI disambiguation");
  assert(ez === "EZ_CPI" || ez === "EZ_CPI_GENERIC", "EZ CPI disambiguation");
  assert(ch !== "US_CPI" && ru !== "US_CPI" && ez !== "US_CPI", "no US CPI bleed");
}

function runCrossCountryDedupeProof() {
  const ts = "2026-08-22T12:00:00.000Z";
  const ch = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "ch-dedupe",
    sourcePublishedAt: ts,
    rawText: loadFixture("ch-cpi-ar-20260822.json").sourceText,
  });
  const ru = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "ru-dedupe",
    sourcePublishedAt: ts,
    rawText: loadFixture("ru-cpi-ar-20260822.json").sourceText,
  });
  assert(ch.previous === ru.previous && ch.forecast === ru.forecast && ch.actual === ru.actual, "same triple");
  assert(buildEconomicTripleKey(ch) !== buildEconomicTripleKey(ru), "CH/RU dedupe distinct");
}

function runCentralBankSameMinuteCollisions() {
  const ts = "2026-08-22T12:45:00.000Z";
  const snb = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "snb-collision",
    sourcePublishedAt: ts,
    rawText: loadFixture("ch-snb-rate-decision-ar-20260822.json").sourceText,
  });
  const ecb = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "ecb-collision",
    sourcePublishedAt: ts,
    rawText: loadFixture("ez-ecb-rate-decision-ar-20260822.json").sourceText,
  });
  const cbr = extractFactsFromTelegramPost({
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "cbr-collision",
    sourcePublishedAt: ts,
    rawText: loadFixture("ru-cbr-rate-decision-ar-20260822.json").sourceText,
  });
  assert(buildEconomicTripleKey(snb) !== buildEconomicTripleKey(ecb), "SNB/ECB distinct");
  assert(buildEconomicTripleKey(cbr) !== buildEconomicTripleKey(ecb), "CBR/ECB distinct");
}

function runImagePolicySuite() {
  for (const key of ["CH_SNB_RATE_DECISION", "RU_CBR_RATE_DECISION", "EZ_ECB_RATE_DECISION", "CH_CPI", "RU_CPI", "EZ_CORE_CPI"]) {
    assert(isPremiumImageEvent(key), `${key} premium image`);
  }

  const snbFacts = runFixture("ch-snb-rate-decision-ar-20260822.json");
  assert(
    isOfficialHighImpactTelegramPost({ facts: snbFacts, cleanedText: loadFixture("ch-snb-rate-decision-ar-20260822.json").sourceText }),
    "SNB high impact telegram"
  );

  const rssPolicy = resolveNewsImagePolicy({
    sourceType: SOURCE_TYPES.RSS_GENERAL,
    eventType: "CH_SNB_RATE_DECISION",
    importance: "HIGH",
  });
  assert(rssPolicy.mode === IMAGE_POLICY_MODES.SOURCE_ONLY, "RSS source only");
  assert(rssPolicy.allowAi === false, "RSS AI zero");
}

function runUnknownEventTerminalDecision() {
  resetTelegramTerminalDecisionsForTests();
  resetDecisionRecordsForTests();
  const post = {
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "unknown-economic",
    sourcePublishedAt: "2026-08-22T13:00:00.000Z",
    rawText: "🔴 السابق: 1.0%\n🔴 المتوقع: 1.1%\n🔵 الحالي: 1.2%",
  };
  const facts = extractFactsFromTelegramPost(post);
  recordTelegramEconomicExitIfNeeded({
    post,
    facts,
    reason: "CANONICAL_EVENT_UNRESOLVED",
    stage: "test_unknown",
  });
  const decisions = getRecentDecisions();
  assert(decisions.length === 1, "unknown event terminal decision");
  assert(decisions[0].reasonCode === "CANONICAL_EVENT_UNRESOLVED", "unknown reason preserved");
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
  runChRuEzFixtureSuite();
  runCountryFirstCpiDisambiguation();
  runCrossCountryDedupeProof();
  runCentralBankSameMinuteCollisions();
  runImagePolicySuite();
  runUnknownEventTerminalDecision();
  runTerminalDecisionInvariant();
  const report = runRegistryCoverageReport();
  assert(report.countries.length === 9, "countries count");
  assert(report.interpretationParity, "interpretation parity");
  console.log(JSON.stringify({ ok: true, report }, null, 2));
}

main();
