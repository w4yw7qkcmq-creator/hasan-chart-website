#!/usr/bin/env node

const path = require("path");
const root = path.join(__dirname, "..");

const {
  buildCanonicalRssEvidence,
  buildStructuredFactsV2,
  validateEditorV2FactGuard,
  runEditorV2ShadowReview,
  V2_REASON_CODES,
} = require(path.join(root, "lib/general-rss"));
const {
  buildDeterministicArabicFallback,
  isPredominantlyArabic,
} = require(path.join(root, "lib/general-rss/editor-v2/deterministic-arabic-fallback"));
const { extractActionFromEvidence, ACTION_CLASSES } = require(path.join(root, "lib/general-rss/editor-v2/action-resolution"));
const { resolvePrimarySubject } = require(path.join(root, "lib/general-rss/editor-v2/primary-subject"));
const { measureTemplateRepetition } = require(path.join(root, "lib/general-rss/editor-v2/fallback-templates"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const P0_FIXTURES = [
  {
    id: "boj_hike",
    item: {
      title: "BOJ seen hiking to 1.25pct in September as yen weakness accelerates timeline",
      contentSnippet: "Economists expect the Bank of Japan to raise rates to 1.25% in September.",
      sourceName: "ForexLive",
      link: "https://investinglive.com/central-banks/boj-seen-hiking/",
    },
    expectAction: ACTION_CLASSES.RATE_HIKE,
    expectSubject: "boj",
    mustNotMatch: /تراجع/u,
    mustMatch: /رفع|1\.25/u,
  },
  {
    id: "zerohash_charter",
    item: {
      title: "Zerohash back for second effort at OCC trust bank charter",
      contentSnippet: "Zerohash is applying again for an OCC trust bank charter.",
      sourceName: "CoinDesk",
      link: "https://www.coindesk.com/zerohash-charter",
    },
    expectAction: ACTION_CLASSES.LICENSE_APPLICATION,
    expectSubject: "zerohash",
    mustNotMatch: /إعلام|اتصالات/u,
    mustMatch: /Zerohash|ترخيص/u,
  },
  {
    id: "iran_deal_rumors",
    item: {
      title: "There are rumors of a Russian media saying there is an Iran-US deal",
      contentSnippet: "Unconfirmed reports suggest a possible Iran-US understanding.",
      sourceName: "ForexLive",
      link: "https://investinglive.com/iran-deal",
    },
    expectAction: ACTION_CLASSES.DEAL,
    mustNotMatch: /عقوبات/u,
    mustMatch: /تفاهم|غير مؤكدة|إيران/u,
  },
  {
    id: "amd_vs_nvidia",
    item: {
      title: "Why AMD can beat rivals Intel and Nvidia in the market for data-center CPUs",
      contentSnippet: "AMD may gain share against Intel and Nvidia in data-center CPUs.",
      sourceName: "MarketWatch",
      link: "https://www.marketwatch.com/amd-beat",
    },
    expectSubject: "amd",
    mustNotMatch: /^إنفيديا:/u,
    mustMatch: /AMD/u,
  },
  {
    id: "oil_slides_2",
    item: {
      title: "Oil slides $2 on unconfirmed report of US Iran ceasefire, Hormuz reopening",
      contentSnippet: "Crude fell $2 on unconfirmed ceasefire headlines.",
      sourceName: "ForexLive",
      link: "https://investinglive.com/oil-slides",
    },
    expectAction: ACTION_CLASSES.FALL,
    mustMatch: /النفط|2/u,
    mustNotMatch: /عقوبات/u,
  },
  {
    id: "ecb_sources",
    item: {
      title: "ECB sources report: Policymakers are ready to raise rates in Sep",
      contentSnippet: "ECB sources say policymakers are ready to raise rates in September.",
      sourceName: "ForexLive",
      link: "https://investinglive.com/ecb-sources",
    },
    expectAction: ACTION_CLASSES.RATE_HIKE,
    expectSubject: "ecb",
    mustMatch: /البنك المركزي الأوروبي|مصادر|رفع/u,
    mustNotMatch: /أفاد المصدر عن/u,
  },
  {
    id: "canada_tariffs",
    item: {
      title: "Canada announces counter tariffs convering roughly $20 billion of products",
      contentSnippet: "Canada unveiled counter tariffs on roughly $20 billion of imports.",
      sourceName: "ForexLive",
      link: "https://investinglive.com/canada-tariffs",
    },
    expectAction: ACTION_CLASSES.COUNTER_TARIFF,
    expectSubject: "canada",
    mustMatch: /كندا|20 مليار|مضادة/u,
  },
  {
    id: "crude_8236",
    item: {
      title: "Crude oil futures sell at $82.36",
      contentSnippet: "Crude oil futures traded at $82.36.",
      sourceName: "ForexLive",
      link: "https://investinglive.com/crude-8236",
    },
    expectAction: ACTION_CLASSES.OTHER,
    mustMatch: /82\.36|النفط/u,
  },
  {
    id: "layerzero_zro",
    item: {
      title: "LayerZero unveils trading infrastructure for crypto and tokenized markets, ZRO surges",
      contentSnippet: "LayerZero launched trading infrastructure and ZRO surged.",
      sourceName: "CoinDesk",
      link: "https://www.coindesk.com/layerzero",
    },
    expectAction: ACTION_CLASSES.LAUNCH,
    expectSubject: "layerzero",
    mustMatch: /LayerZero/u,
    mustNotMatch: /^ارتفاع$/u,
  },
  {
    id: "sp500_growth",
    item: {
      title: "These growth stocks are still cheap, despite the S&P 500 being near a record high price-to-sales valuation",
      contentSnippet: "Growth stocks remain cheap even as the S&P 500 trades near record valuation.",
      sourceName: "MarketWatch",
      link: "https://www.marketwatch.com/sp500-growth",
    },
    expectSubject: "sp500",
    mustMatch: /S&P 500|نمو/u,
  },
];

const KNOWN_12 = [
  ...P0_FIXTURES,
  {
    id: "cnbc_software",
    item: {
      title: "2 of our software stocks face major tests of whether their rallies are for real",
      contentSnippet: "Two software names face key tests of rally durability.",
      sourceName: "CNBC",
      link: "https://www.cnbc.com/software-stocks",
    },
    mustNotMatch: /نتائج أرباح/u,
    mustMatch: /برمج|أسهم/u,
  },
  {
    id: "cnbc_oil_iran",
    item: {
      title: "Oil falls on easing concerns of renewed tensions as the U.S. pivots to economic pressure on Iran",
      contentSnippet: "Oil fell as the U.S. pivots to economic pressure on Iran.",
      sourceName: "CNBC",
      link: "https://www.cnbc.com/oil-iran",
    },
    expectAction: ACTION_CLASSES.FALL,
    mustMatch: /النفط/u,
  },
];

function testActionResolution() {
  for (const fixture of P0_FIXTURES) {
    if (!fixture.expectAction) continue;
    const evidence = buildCanonicalRssEvidence(fixture.item, fixture.item.sourceName);
    const action = extractActionFromEvidence(evidence);
    assert(
      action.actionClass === fixture.expectAction,
      `${fixture.id}: expected action ${fixture.expectAction}, got ${action.actionClass}`
    );
  }
}

function testPrimarySubject() {
  for (const fixture of P0_FIXTURES) {
    if (!fixture.expectSubject) continue;
    const evidence = buildCanonicalRssEvidence(fixture.item, fixture.item.sourceName);
    const facts = buildStructuredFactsV2(evidence);
    const action = extractActionFromEvidence(evidence);
    const subject = resolvePrimarySubject(evidence, facts, action);
    assert(
      subject.id === fixture.expectSubject,
      `${fixture.id}: expected subject ${fixture.expectSubject}, got ${subject.id}`
    );
  }
}

async function testFallbackQuality() {
  const bodies = [];
  for (const fixture of KNOWN_12) {
    const evidence = buildCanonicalRssEvidence(fixture.item, fixture.item.sourceName);
    const facts = buildStructuredFactsV2(evidence);
    const fallback = buildDeterministicArabicFallback(evidence, facts);
    assert(!fallback.insufficientEvidence, `${fixture.id} fallback must not be insufficient`);
    assert(isPredominantlyArabic(`${fallback.headline} ${fallback.body}`), `${fixture.id} must be Arabic`);
    if (fixture.mustMatch) assert(fixture.mustMatch.test(`${fallback.headline} ${fallback.body}`), `${fixture.id} missing required pattern in: ${fallback.headline} | ${fallback.body}`);
    if (fixture.mustNotMatch) assert(!fixture.mustNotMatch.test(fallback.headline), `${fixture.id} forbidden pattern in headline: ${fallback.headline}`);
    const guard = validateEditorV2FactGuard({ evidence, facts, editorial: fallback });
    assert(guard.ok, `${fixture.id} must pass fact guard (${guard.reasonCode})`);
    bodies.push(fallback);
  }
  const repetition = measureTemplateRepetition(bodies);
  assert(repetition.rate <= 0.25, `template repetition ${repetition.rate} exceeds 25%`);
  const robotic = bodies.filter((b) => /أفاد المصدر عن/u.test(b.body)).length;
  assert(robotic / bodies.length <= 0.25, `robotic phrase rate ${robotic}/${bodies.length} exceeds 25%`);
}

async function testShadowReviewDisableAi() {
  for (const fixture of P0_FIXTURES.slice(0, 4)) {
    const result = await runEditorV2ShadowReview({ item: fixture.item }, { disableAi: true });
    assert(result.ok, `${fixture.id} shadow review must pass`);
  }
}

async function main() {
  testActionResolution();
  testPrimarySubject();
  await testFallbackQuality();
  await testShadowReviewDisableAi();
  console.log("editor-v2-p0-semantic-fixtures.test.cjs PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
