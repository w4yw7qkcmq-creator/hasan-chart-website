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
  V2_REASON_CODES,
} = require(path.join(root, "lib/general-rss"));
const {
  classifyEvidenceSufficiency,
  EVIDENCE_SUFFICIENCY,
  shouldOverrideAiInsufficientEvidence,
} = require(path.join(root, "lib/general-rss/editor-v2/evidence-sufficiency"));
const {
  finalizeEditorialResponse,
} = require(path.join(root, "lib/general-rss/editor-v2/editorial-ai"));
const { validateOutputNumbersSubset, extractNumericTokens } = require(path.join(
  root,
  "lib/general-rss/external-news-editor/numeric-utils"
));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const CALIBRATION_FIXTURES = [
  {
    id: "central_bank_rate_call",
    item: {
      title: "Bank of Korea rate call a coin toss as economists split on August hike",
      contentSnippet:
        "The near-even split among economists underlines how finely balanced this decision is, with the case for a hike resting on above-target inflation.",
      sourceName: "ForexLive",
    },
  },
  {
    id: "boj_hike_probability",
    item: {
      title: "MUFG sees yen risk skewed weaker despite 80% BOJ hike odds",
      contentSnippet:
        "The disconnect MUFG highlights, hike odds near 80% without corresponding yen buying, points to a market that has priced in tightening.",
      sourceName: "ForexLive",
    },
  },
  {
    id: "yields_warsh_speech",
    item: {
      title: "Yields decline on CNBC report Treasury could use General Account to fund buybacks",
      contentSnippet:
        "Treasury yields fell Monday as investors await Federal Reserve Chair Kevin Warsh's keynote speech at Jackson Hole later this week.",
      sourceName: "CNBC",
    },
  },
  {
    id: "trump_stock_gains",
    item: {
      title: "Trump's oil and gas stocks gained up to $15.5 million amid Iran war, congressional Democrats say",
      contentSnippet:
        "Trump's stock trading could face heightened congressional scrutiny if Democrats retake either chamber in the midterms.",
      sourceName: "CNBC",
    },
  },
  {
    id: "bitcoin_vs_stocks",
    item: {
      title: "Bitcoin has beaten stocks and gold over six months. Now it's closing in on $80,000.",
      contentSnippet:
        "Bitcoin was rising Monday near the $80,000 level after the cryptocurrency surged last week on the Treasury Department's plans to buy back longer-dated Treasurys.",
      sourceName: "MarketWatch",
    },
  },
  {
    id: "media_ma_antitrust",
    item: {
      title: "A media M&A chill: The Paramount-WBD antitrust challenge may hold up more deals than one",
      contentSnippet:
        "Paramount's proposed merger with WBD is delayed while an antitrust lawsuit plays out. The holdup could mean a freeze across the media industry.",
      sourceName: "CNBC",
    },
  },
  {
    id: "dollar_treasury_buybacks",
    item: {
      title: "Dollar slips to lowest since May as Treasury doubles bond buybacks, what's next?",
      contentSnippet:
        "The dollar's slide to its weakest level since May reflects a shift in the rates backdrop, with the Treasury's expanded buyback plan adding to pressure.",
      sourceName: "ForexLive",
    },
  },
];

const LOW_VALUE_FIXTURES = [
  {
    id: "newsletter_product",
    item: {
      title: "CNBC's The China Connection newsletter: Robots need help learning human skills",
      contentSnippet: "Humanoid robots still take a long time to complete human tasks.",
      sourceName: "CNBC",
    },
    outcome: CURATOR_OUTCOMES.SKIP_NEWSLETTER,
  },
  {
    id: "personal_finance_cobra",
    item: {
      title: "'She looked into COBRA': My friend was laid off and lost her health insurance. How can she find affordable coverage?",
      contentSnippet: "The cost is absolutely ridiculous.",
      sourceName: "MarketWatch",
    },
    outcome: CURATOR_OUTCOMES.SKIP_PERSONAL_FINANCE,
  },
  {
    id: "personal_finance_inheritance",
    item: {
      title: "My father-in-law passed away, leaving a house with tenants. Do I evict them?",
      contentSnippet: "We don't know whether they have signed leases or are renting month to month.",
      sourceName: "MarketWatch",
    },
    outcome: CURATOR_OUTCOMES.SKIP_PERSONAL_FINANCE,
  },
  {
    id: "preview_day_ahead",
    item: {
      title: "Financial repression: The new buzzword for bitcoin bulls",
      contentSnippet: "Your day-ahead look for Aug. 24, 2026",
      sourceName: "CoinDesk",
    },
    outcome: CURATOR_OUTCOMES.SKIP_EVERGREEN,
  },
];

function testCuratorRejectsLowValue() {
  for (const fixture of LOW_VALUE_FIXTURES) {
    const curator = evaluateRssCuratorGate(fixture.item);
    assert(!curator.ok, `${fixture.id} must be rejected by curator`);
    assert(curator.outcome === fixture.outcome, `${fixture.id} expected ${fixture.outcome}, got ${curator.outcome}`);
  }
}

function testEvidenceSufficiencyClassifier() {
  for (const fixture of CALIBRATION_FIXTURES) {
    const evidence = buildCanonicalRssEvidence(fixture.item, fixture.item.sourceName);
    const sufficiency = classifyEvidenceSufficiency(evidence);
    assert(
      sufficiency.level === EVIDENCE_SUFFICIENCY.SUFFICIENT_FULL ||
        sufficiency.level === EVIDENCE_SUFFICIENCY.SUFFICIENT_MINIMAL,
      `${fixture.id} must not be classified insufficient (${sufficiency.level})`
    );
  }

  const teaser = classifyEvidenceSufficiency(
    buildCanonicalRssEvidence(
      { title: "Something big may happen soon", contentSnippet: "", sourceName: "CNBC" },
      "CNBC"
    )
  );
  assert(teaser.level === EVIDENCE_SUFFICIENCY.INSUFFICIENT, "Teaser-only item must be insufficient");
}

function testInsufficientEvidenceOverride() {
  const override = shouldOverrideAiInsufficientEvidence(EVIDENCE_SUFFICIENCY.SUFFICIENT_MINIMAL, {
    headline: "بنك كوريا يواجه قرارًا متوازنًا",
    body: "انقسم الاقتصاديون حول ما إذا كان بنك كوريا سيرفع الفائدة في أغسطس.",
    insufficientEvidence: true,
  });
  assert(override, "Valid headline/body must override AI insufficientEvidence when evidence is sufficient");
}

function testFinalizeEditorialResponseOverride() {
  const editorial = finalizeEditorialResponse(
    {
      headline: "تراجع العائد على سندات الخزانة",
      body: "تراجعت عوائد سندات الخزانة مع ترقب كلمة رئيس الاحتياطي الفيدرالي في جاكson hole.",
      insufficientEvidence: true,
      confidence: "ai",
    },
    { evidenceSufficiencyLevel: EVIDENCE_SUFFICIENCY.SUFFICIENT_MINIMAL }
  );
  assert(!editorial.insufficientEvidence, "finalizeEditorialResponse must clear false insufficient flag");
}

function testNumericSubsetGuard() {
  const denseSource =
    "Gold traded near 4,530 while benchmark yields held around 4.25% and the dollar index fell 0.8% to 103.40 with 19% volatility in 2021.";
  const sourceTokens = extractNumericTokens(denseSource);
  const sparseOutput = "استقر الذهب قرب 4530 مع عائد near 4.25%.";
  const outputTokens = extractNumericTokens(sparseOutput);
  const check = validateOutputNumbersSubset(sourceTokens, outputTokens);
  assert(check.ok, "Sparse output using subset of dense source numbers must pass");

  const driftOutput = "استقر الذهب قرب 4350.";
  const driftTokens = extractNumericTokens(driftOutput);
  const driftCheck = validateOutputNumbersSubset(sourceTokens, driftTokens);
  assert(!driftCheck.ok, "Unsupported output number must fail subset guard");
}

function testCalibrationFixturesPreAiGates() {
  for (const fixture of CALIBRATION_FIXTURES) {
    const curator = evaluateRssCuratorGate(fixture.item);
    assert(curator.ok, `${fixture.id} must pass curator`);

    const evidence = buildCanonicalRssEvidence(fixture.item, fixture.item.sourceName);
    const sufficiency = classifyEvidenceSufficiency(evidence);
    assert(
      sufficiency.level !== EVIDENCE_SUFFICIENCY.INSUFFICIENT,
      `${fixture.id} must not be classified insufficient before AI`
    );
  }
}

async function run() {
  testCuratorRejectsLowValue();
  testEvidenceSufficiencyClassifier();
  testInsufficientEvidenceOverride();
  testFinalizeEditorialResponseOverride();
  testNumericSubsetGuard();
  testCalibrationFixturesPreAiGates();
  console.log("editor-v2-calibration-fixtures.test.cjs PASS");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
