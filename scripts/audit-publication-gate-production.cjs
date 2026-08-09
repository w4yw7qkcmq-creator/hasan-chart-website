#!/usr/bin/env node
/**
 * Production Publication Gate Audit — replays RSS pipeline + editorial gates
 * for the first successful cycle after checkpoint bootstrap (4056f2a semantics).
 */

const path = require("path");
const root = path.join(__dirname, "../worker");

const { fetchGeneralRssFeeds } = require(path.join(root, "lib/general-rss/feed-fetch"));
const { processGeneralRssItems } = require(path.join(root, "lib/general-rss"));
const {
  resetCheckpointStoreForTests,
  hydrateFromDb,
  bootstrapAllRssSources,
  normalizeLink,
  markCheckpointsHydrated,
} = require(path.join(root, "lib/news-ingestion/checkpoint-store"));
const { resetRssObservationStateForTests } = require(path.join(root, "lib/general-rss/observation-state"));
const {
  validateGeneralRssEditorialOutput,
  buildRawSourceText,
} = require(path.join(root, "lib/general-rss/editorial-safety"));
const { evaluateCopySimilarity } = require(path.join(root, "lib/news-intelligence/copy-similarity-guard"));

const PUBLISHED_LINKS = new Set([
  "https://www.coindesk.com/business/2026/08/08/hardware-wallet-sales-in-russia-more-than-double-as-new-crypto-rules-near",
  "https://www.coindesk.com/business/2026/08/08/brazil-s-central-bank-orders-exchanges-to-delay-large-crypto-transfers-abroad",
  "https://www.cnbc.com/2026/08/08/berkshire-hathaway-earnings-q2-2026.html",
]);

function isEconomicReleaseTitle(title) {
  const value = String(title || "").toLowerCase();
  return /fomc|federal reserve|fed rate|interest rate decision|rate decision|cpi|core cpi|ppi|pce|nfp|nonfarm payrolls|jobless claims|initial claims|unemployment|consumer confidence|retail sales|pmi|ism|gdp|china.*cpi|cpi.*china/i.test(
    value
  );
}

function mockArabicEditorial(title, rawSourceText) {
  const headline = String(title || "").slice(0, 120);
  return `🚨 ${headline}\n\nسجلت الأسواق تحركاً ملحوظاً في هذا السياق، مع متابعة واسعة لتداعيات الخبر على المزاج العام.\n\n📢 قناة الأخبار الرسمية:\nhttps://t.me/EconomicNewsi`;
}

function classifyPolicy(item) {
  const title = String(item.title || "").toLowerCase();
  if (/china.*cpi|cpi.*china|july cpi|producer prices/i.test(title)) {
    return "SHOULD_BLOCK";
  }
  if (/newsquawk week ahead|week ahead preview|what are the main events/i.test(title)) {
    return "SHOULD_BLOCK";
  }
  if (/saudi aramco|houthis|refinery fire|hormuz|iran|israel|war|attack|missile|oil jumps|gold jumps|bitcoin.*etf|crypto.*shakeout|berkshire|abel.*cash/i.test(title)) {
    return "SHOULD_PUBLISH";
  }
  if (/retirement|myspace|parent.*career|elevator|hunter biden|verizon outage|phishing email|social security/i.test(title)) {
    return "SHOULD_BLOCK";
  }
  return "BORDERLINE";
}

function traceCandidate(item, aiMessage) {
  const rawSourceText = buildRawSourceText(item);
  const steps = [];

  steps.push({ stage: "NEW", result: "PASS" });

  if (isEconomicReleaseTitle(item.title)) {
    steps.push({ stage: "economic_detector", result: "TRIGGERED", note: "structured economic title" });
  } else {
    steps.push({ stage: "economic_detector", result: "PASS" });
  }

  const editorial = validateGeneralRssEditorialOutput({
    title: item.title,
    body: aiMessage,
    rawSourceText,
  });

  if (!editorial.ok) {
    steps.push({
      stage: "rss_editorial_safety",
      result: "BLOCK",
      reasonCode: editorial.reason,
      module: "editorial-safety.js",
      similarity: editorial.similarity ?? null,
      coverage: editorial.coverage ?? null,
    });
    return { steps, terminal: editorial.reason, gate: "rss_editorial_safety" };
  }

  const copyCheck = evaluateCopySimilarity(aiMessage, rawSourceText);
  steps.push({
    stage: "copy_similarity",
    result: copyCheck.ok ? "PASS" : "BLOCK",
    similarity: copyCheck.similarity,
    coverage: copyCheck.coverage,
    threshold: copyCheck.threshold,
  });

  if (!copyCheck.ok) {
    return {
      steps,
      terminal: "RSS_COPY_SIMILARITY_TOO_HIGH",
      gate: "copy-similarity-guard.js",
    };
  }

  steps.push({ stage: "publication_gateway", result: "WOULD_ATTEMPT", note: "legacy RSS direct publish path" });
  return { steps, terminal: "WOULD_PUBLISH", gate: null };
}

async function main() {
  resetCheckpointStoreForTests();
  resetRssObservationStateForTests();
  await hydrateFromDb(null);

  const fetchResult = await fetchGeneralRssFeeds({ nowMs: Date.parse("2026-08-09T14:20:00.000Z") });
  const items = fetchResult.items || [];
  const publishedItems = [...PUBLISHED_LINKS].map((link) => ({ link }));

  bootstrapAllRssSources(items, {
    nowMs: Date.parse("2026-08-09T14:20:00.000Z"),
    maxAgeHours: 24,
    publishedLinks: PUBLISHED_LINKS,
  });
  markCheckpointsHydrated();

  const pipeline = processGeneralRssItems(items, {
    publishedItems,
    publishStats: { postsLastHour: 0, highImpactPostsLastHour: 0 },
    dryRun: true,
    skipCheckpointAdvance: true,
    nowMs: Date.parse("2026-08-09T14:20:00.000Z"),
  });

  const diag = pipeline.diagnostics;
  console.log(
    "PIPELINE_REPLAY",
    JSON.stringify({
      fetched: diag.fetched,
      newItems: diag.newItems,
      oldSeenSkipped: diag.oldSeenSkipped,
      eligible: diag.eligible,
      structuredEconomicSkipped: diag.structuredEconomicSkipped,
      qualityRejected: diag.qualityRejected,
      staleSkipped: diag.staleSkipped,
      noMarketAngleSkipped: diag.noMarketAngleSkipped,
    })
  );

  const eligible = pipeline.eligibleItems || [];
  console.log(`\nELIGIBLE_COUNT=${eligible.length}\n`);

  for (const [index, item] of eligible.entries()) {
    const policy = classifyPolicy(item);
    const rawSourceText = buildRawSourceText(item);
    const aiMessage = mockArabicEditorial(item.title, rawSourceText);
    const trace = traceCandidate(item, aiMessage);

    console.log(
      `CANDIDATE_${index + 1}`,
      JSON.stringify(
        {
          source: item.sourceName,
          link: normalizeLink(item.link),
          title: String(item.title || "").slice(0, 140),
          impactLevel: item.impactLevel || null,
          economic: isEconomicReleaseTitle(item.title),
          policyClassification: policy,
          editorialPreview: aiMessage.slice(0, 200),
          terminalReason: trace.terminal,
          firstBlockingGate: trace.gate,
          path: trace.steps,
        },
        null,
        2
      )
    );
    console.log("---");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
