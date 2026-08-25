#!/usr/bin/env node

const path = require("path");

const root = path.join(__dirname, "..");

const {
  buildCanonicalRssEvidence,
  buildStructuredFactsV2,
  validateEditorV2FactGuard,
  runEditorV2ShadowReview,
  evaluateRssCuratorGate,
  CURATOR_OUTCOMES,
} = require(path.join(root, "lib/general-rss"));
const {
  buildDeterministicArabicFallback,
  isPredominantlyArabic,
} = require(path.join(root, "lib/general-rss/editor-v2/deterministic-arabic-fallback"));
const {
  validateOutputNumbersSubset,
  normalizeNumericToken,
  extractNumericTokens,
} = require(path.join(root, "lib/general-rss/external-news-editor/numeric-utils"));
const {
  validateRssMinimumInformation,
  hasStandaloneFactCommunication,
  hasSufficientArabicContent,
} = require(path.join(root, "lib/general-rss/minimum-information-gate"));
const { buildRssPublicationPresentation } = require(path.join(root, "lib/general-rss/publication-format"));
const { DEFAULT_V2_TEMPERATURE } = require(path.join(root, "lib/general-rss/editor-v2/editorial-ai"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const MATERIAL_FIXTURES = [
  {
    id: "bank_of_korea",
    item: {
      title: "Bank of Korea rate call a coin toss as economists split on August hike",
      contentSnippet:
        "The near-even split among economists underlines how finely balanced this decision is, with the case for a hike resting on above-target inflation.",
      sourceName: "ForexLive",
    },
  },
  {
    id: "yields_warsh",
    item: {
      title: "Yields decline on CNBC report Treasury could use General Account to fund buybacks",
      contentSnippet:
        "Treasury yields fell Monday as investors await Federal Reserve Chair Kevin Warsh's keynote speech at Jackson Hole later this week.",
      sourceName: "CNBC",
    },
  },
];

const LOW_VALUE_FIXTURES = [
  {
    item: {
      title: "CNBC's The China Connection newsletter: Robots need help learning human skills",
      contentSnippet: "Humanoid robots still take a long time to complete human tasks.",
      sourceName: "CNBC",
    },
    outcome: CURATOR_OUTCOMES.SKIP_NEWSLETTER,
  },
  {
    item: {
      title: "'She looked into COBRA': My friend was laid off and lost her health insurance. How can she find affordable coverage?",
      contentSnippet: "The cost is absolutely ridiculous.",
      sourceName: "MarketWatch",
    },
    outcome: CURATOR_OUTCOMES.SKIP_PERSONAL_FINANCE,
  },
  {
    item: {
      title: "It's time to bet big on Nvidia's stock, says this analyst who thinks the market has it all wrong",
      contentSnippet: "Nvidia's controversial financial plays could actually keep the company on top.",
      sourceName: "MarketWatch",
    },
    outcome: CURATOR_OUTCOMES.SKIP_EVERGREEN,
  },
];

function testDeterministicFallbackArabic() {
  for (const fixture of MATERIAL_FIXTURES) {
    const evidence = buildCanonicalRssEvidence(fixture.item, fixture.item.sourceName);
    const facts = buildStructuredFactsV2(evidence);
    const fallback = buildDeterministicArabicFallback(evidence, facts);
    assert(!fallback.insufficientEvidence, `${fixture.id} fallback must not be insufficient`);
    assert(isPredominantlyArabic(`${fallback.headline} ${fallback.body}`), `${fixture.id} fallback must be Arabic`);
    const guard = validateEditorV2FactGuard({ evidence, facts, editorial: fallback });
    assert(guard.ok, `${fixture.id} fallback must pass fact guard (${guard.reasonCode})`);
  }
}

function testFactAwareMinimumInformation() {
  const evidence = buildCanonicalRssEvidence(MATERIAL_FIXTURES[0].item, "ForexLive");
  const facts = buildStructuredFactsV2(evidence);
  const editorial = buildDeterministicArabicFallback(evidence, facts);
  const presentation = buildRssPublicationPresentation({
    sourceTitle: evidence.title,
    editorialMessage: `🚨 ${editorial.headline}\n\n${editorial.body}`,
    imageTitle: editorial.headline,
  });
  const result = validateRssMinimumInformation(presentation, {
    sourceTitle: evidence.title,
    structuredFacts: facts,
    organizations: facts.organizations,
    people: facts.people,
    instruments: facts.instruments,
  });
  assert(result.ok, `fact-aware minimum info must pass (${result.issue})`);
  assert(
    hasStandaloneFactCommunication(editorial.headline, editorial.body, {
      sourceTitle: evidence.title,
      structuredFacts: facts,
    }),
    "standalone fact communication must pass"
  );
}

function testNumericNormalizationEquivalents() {
  const source = extractNumericTokens("Trump stocks gained up to $15.5M amid Iran war and 80% odds");
  const output = extractNumericTokens("ارتفعت الأسهم إلى 15.5M مع 80%");
  const check = validateOutputNumbersSubset(source, output);
  assert(check.ok, `numeric equivalence failed: ${check.extra.join(",")}`);

  const denseSource = extractNumericTokens("Gold near 4,530 while yields held 4.25% and index fell 0.8%");
  const sparseOutput = extractNumericTokens("استقر الذهب قرب 4530 مع عائد 4.25%");
  const sparseCheck = validateOutputNumbersSubset(denseSource, sparseOutput);
  assert(sparseCheck.ok, "sparse output using subset must pass");

  const million = normalizeNumericToken("$15.5M");
  const millionWords = extractNumericTokens("gained 15.5 million amid war");
  assert(million && millionWords.length, "million formats must parse");
  assert(
    validateOutputNumbersSubset(millionWords, [million]).ok,
    "15.5 million must equate to $15.5M"
  );
}

function testCuratorRegression() {
  for (const fixture of LOW_VALUE_FIXTURES) {
    const curator = evaluateRssCuratorGate(fixture.item);
    assert(!curator.ok, "low-value fixture must be rejected");
    assert(curator.outcome === fixture.outcome, `expected ${fixture.outcome}, got ${curator.outcome}`);
  }
}

async function testShadowPipelineDeterministic() {
  for (const fixture of MATERIAL_FIXTURES) {
    const result = await runEditorV2ShadowReview({ item: fixture.item }, { disableAi: true });
    assert(result.ok, `${fixture.id} deterministic shadow pipeline must pass (${result.reasonCode || result.stage})`);
  }
}

function testDeterminismSettings() {
  assert(DEFAULT_V2_TEMPERATURE <= 0.15, "editorial temperature should be low for stability");
}

function testArabicContentCounting() {
  const headline = "شركات بطاقات ائتمان: مستويات قياسية";
  const body = "أفاد المصدر عن مستويات قياسية مرتبط بـشركات بطاقات ائتمان.";
  assert(
    hasSufficientArabicContent(`${headline}\n${body}`, 10),
    "Arabic content count must not require consecutive characters"
  );
}

async function run() {
  testDeterministicFallbackArabic();
  testFactAwareMinimumInformation();
  testArabicContentCounting();
  testNumericNormalizationEquivalents();
  testCuratorRegression();
  testDeterminismSettings();
  await testShadowPipelineDeterministic();
  console.log("editor-v2-calibration-pass2.test.cjs PASS");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
