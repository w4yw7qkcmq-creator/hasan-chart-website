const { evaluateGeneralNewsMarketRelevance } = require("./market-relevance");
const { evaluateRssDuplicate } = require("./dedup");
const { evaluateItemFreshness, getItemPublishedAt, getFeedDelayMinutes } = require("./age-policy");
const {
  initializeRssFeedBaselines,
  isRssObservationReady,
  isRssItemAfterBaseline,
} = require("./observation-state");
const { resolveFeedName } = require("./feed-fetch");

function createEmptyRssDiagnostics() {
  return {
    fetched: 0,
    normalized: 0,
    structuredEconomicSkipped: 0,
    duplicateSkipped: 0,
    staleSkipped: 0,
    lowValueSkipped: 0,
    noMarketAngleSkipped: 0,
    qualityRejected: 0,
    rateLimited: 0,
    backlogSkipped: 0,
    eligible: 0,
    published: 0,
    wouldPublish: 0,
    rejectionSamples: [],
    feedReports: [],
    items: [],
  };
}

function recordRejectedItem(diagnostics, item, action, rejectionReason, extra = {}) {
  diagnostics.items.push({
    source: item.sourceName || resolveFeedName(item.feedUrl || ""),
    publishedAt: item.articlePublishedAt || item.isoDate || item.pubDate || null,
    ageMinutes: extra.ageMinutes ?? null,
    feedDelayMinutes: extra.feedDelayMinutes ?? getFeedDelayMinutes(item),
    category: extra.category ?? null,
    title: item.title || "",
    impactLevel: extra.impactLevel || null,
    marketAngle: extra.marketAngle || null,
    score: extra.score ?? null,
    duplicateKey: extra.duplicateKey || null,
    action,
    rejectionReason,
  });

  if (diagnostics.rejectionSamples.length < 20) {
    diagnostics.rejectionSamples.push({
      action,
      rejectionReason,
      title: String(item.title || "").slice(0, 120),
    });
  }
}

function logRssDiagnostic(event, payload = {}) {
  console.log(event, JSON.stringify(payload));
}

function evaluateRateLimitForRss(relevance, publishStats = {}, limits = {}) {
  const maxPerHour = limits.maxPostsPerHour ?? 5;
  const maxHighPerHour = limits.maxHighImpactPostsPerHour ?? 5;
  const postsLastHour = publishStats.postsLastHour ?? 0;

  if (postsLastHour >= maxHighPerHour && relevance.impactLevel !== "HIGH") {
    return { limited: true, reason: "hourly_hard_limit" };
  }

  if (postsLastHour >= maxPerHour && relevance.impactLevel === "MEDIUM") {
    return { limited: true, reason: "hourly_normal_limit_medium" };
  }

  return { limited: false, reason: null };
}

function processGeneralRssItems(items = [], context = {}) {
  const diagnostics = createEmptyRssDiagnostics();
  diagnostics.fetched = items.length;
  diagnostics.normalized = items.length;
  diagnostics.feedReports = context.feedReports || [];

  if (!items.length) {
    return { diagnostics, eligibleItems: [], selectedItem: null };
  }

    if (!context.skipObservationInit && !isRssObservationReady()) {
      initializeRssFeedBaselines(items);
      logRssDiagnostic("RSS_OBSERVATION_BASELINE_INITIALIZED", {
        feeds: diagnostics.feedReports.map((feed) => ({
          name: feed.name,
          fetched: feed.fetched,
          normalized: feed.normalized,
          newestPublishedAt: feed.newestPublishedAt,
        })),
      });
    }

    const publishedItems = context.publishedItems || [];
    const recentTitles = publishedItems
      .map((entry) => entry.title || entry.normalizedTitle || "")
      .filter(Boolean);
    const publishStats = context.publishStats || {};
    const limits = context.limits || {};
    const nowMs = context.nowMs || Date.now();
    const dryRun = context.dryRun === true;
    const skipBacklogCheck = context.skipBacklogCheck === true;

    const eligibleItems = [];

    for (const item of items) {
      const freshness = evaluateItemFreshness(item, nowMs);
      const relevance = evaluateGeneralNewsMarketRelevance(item);

      if (!skipBacklogCheck && !dryRun && isRssObservationReady() && !isRssItemAfterBaseline(item)) {
        diagnostics.backlogSkipped += 1;
        recordRejectedItem(diagnostics, item, "RSS_BACKLOG_SKIPPED", "backlog_before_baseline", {
          ageMinutes: freshness.ageMinutes,
          feedDelayMinutes: freshness.feedDelayMinutes,
          category: relevance.category,
        });
        continue;
      }

      if (relevance.rejectionReason === "structured_economic_release") {
        diagnostics.structuredEconomicSkipped += 1;
        recordRejectedItem(diagnostics, item, "RSS_STRUCTURED_ECONOMIC_SKIPPED", relevance.rejectionReason, {
          ageMinutes: freshness.ageMinutes,
          feedDelayMinutes: freshness.feedDelayMinutes,
          category: relevance.category,
          impactLevel: relevance.impactLevel,
          score: relevance.score,
        });
        continue;
      }

      if (relevance.rejectionReason === "evergreen_educational" || relevance.rejectionReason === "product_lifestyle_or_non_financial") {
        diagnostics.lowValueSkipped += 1;
        recordRejectedItem(diagnostics, item, "RSS_LOW_VALUE_SKIPPED", relevance.rejectionReason, {
          ageMinutes: freshness.ageMinutes,
          feedDelayMinutes: freshness.feedDelayMinutes,
          category: relevance.category,
          impactLevel: relevance.impactLevel,
          score: relevance.score,
        });
        continue;
      }

      if (!freshness.fresh) {
        diagnostics.staleSkipped += 1;
        recordRejectedItem(diagnostics, item, "RSS_STALE_SKIPPED", freshness.reason || "stale", {
          ageMinutes: freshness.ageMinutes,
          feedDelayMinutes: freshness.feedDelayMinutes,
          category: freshness.category || relevance.category,
          impactLevel: relevance.impactLevel,
          score: relevance.score,
        });
        continue;
      }

      const duplicate = evaluateRssDuplicate(item, publishedItems, recentTitles);
      if (duplicate.duplicate) {
        diagnostics.duplicateSkipped += 1;
        recordRejectedItem(diagnostics, item, "RSS_DUPLICATE_SKIPPED", duplicate.reason, {
          ageMinutes: freshness.ageMinutes,
          feedDelayMinutes: freshness.feedDelayMinutes,
          category: relevance.category,
          duplicateKey: duplicate.duplicateKey,
          impactLevel: relevance.impactLevel,
          score: relevance.score,
        });
        continue;
      }

      if (relevance.rejectionReason === "no_market_angle" || relevance.rejectionReason === "geopolitics_without_market_transmission" || relevance.rejectionReason === "asset_mention_without_investment_reflection" || relevance.rejectionReason === "politics_without_market_impact") {
        diagnostics.noMarketAngleSkipped += 1;
        recordRejectedItem(diagnostics, item, "RSS_NO_MARKET_ANGLE_SKIPPED", relevance.rejectionReason, {
          ageMinutes: freshness.ageMinutes,
          feedDelayMinutes: freshness.feedDelayMinutes,
          category: relevance.category,
          impactLevel: relevance.impactLevel,
          score: relevance.score,
          marketAngle: relevance.marketAngle,
        });
        continue;
      }

      if (relevance.rejectionReason === "low_impact") {
        diagnostics.lowValueSkipped += 1;
        recordRejectedItem(diagnostics, item, "RSS_LOW_VALUE_SKIPPED", relevance.rejectionReason, {
          ageMinutes: freshness.ageMinutes,
          feedDelayMinutes: freshness.feedDelayMinutes,
          category: relevance.category,
          impactLevel: relevance.impactLevel,
          score: relevance.score,
        });
        continue;
      }

      if (!relevance.eligible) {
        diagnostics.qualityRejected += 1;
        recordRejectedItem(diagnostics, item, "RSS_QUALITY_REJECTED", relevance.rejectionReason || "quality_rejected", {
          ageMinutes: freshness.ageMinutes,
          feedDelayMinutes: freshness.feedDelayMinutes,
          category: relevance.category,
          impactLevel: relevance.impactLevel,
          score: relevance.score,
          marketAngle: relevance.marketAngle,
        });
        continue;
      }

      const rateLimit = evaluateRateLimitForRss(relevance, publishStats, limits);
      if (rateLimit.limited && !dryRun) {
        diagnostics.rateLimited += 1;
        recordRejectedItem(diagnostics, item, "RSS_RATE_LIMITED", rateLimit.reason, {
          ageMinutes: freshness.ageMinutes,
          feedDelayMinutes: freshness.feedDelayMinutes,
          category: relevance.category,
          impactLevel: relevance.impactLevel,
          score: relevance.score,
          marketAngle: relevance.marketAngle,
          duplicateKey: duplicate.duplicateKey,
        });
        continue;
      }

      diagnostics.eligible += 1;
      if (rateLimit.limited && dryRun) {
        diagnostics.rateLimited += 1;
      }

      const enriched = {
        ...item,
        impactLevel: relevance.impactLevel,
        marketAngle: relevance.marketAngle,
        marketRelevanceScore: relevance.score,
        newsCategory: relevance.category,
        primaryMarket: relevance.primaryMarket,
        affectedMarkets: relevance.affectedMarkets,
        rssEventFingerprint: duplicate.fingerprint,
        rssDuplicateKey: duplicate.duplicateKey,
        publishedAtMs: getItemPublishedAt(item),
      };

      eligibleItems.push(enriched);
      recordRejectedItem(diagnostics, enriched, rateLimit.limited ? "RSS_WOULD_PUBLISH_RATE_LIMITED" : "RSS_ELIGIBLE", null, {
        ageMinutes: freshness.ageMinutes,
        feedDelayMinutes: freshness.feedDelayMinutes,
        category: relevance.category,
        impactLevel: relevance.impactLevel,
        score: relevance.score,
        marketAngle: relevance.marketAngle,
        duplicateKey: duplicate.duplicateKey,
      });
    }

  eligibleItems.sort((a, b) => (b.publishedAtMs || 0) - (a.publishedAtMs || 0));

  const selectedItem = eligibleItems[0] || null;
  diagnostics.wouldPublish = selectedItem ? 1 : 0;

  logRssDiagnostic("RSS_FETCHED", { count: diagnostics.fetched });
  logRssDiagnostic("RSS_NORMALIZED", { count: diagnostics.normalized });
  logRssDiagnostic("RSS_STRUCTURED_ECONOMIC_SKIPPED", { count: diagnostics.structuredEconomicSkipped });
  logRssDiagnostic("RSS_DUPLICATE_SKIPPED", { count: diagnostics.duplicateSkipped });
  logRssDiagnostic("RSS_STALE_SKIPPED", { count: diagnostics.staleSkipped });
  logRssDiagnostic("RSS_LOW_VALUE_SKIPPED", { count: diagnostics.lowValueSkipped });
  logRssDiagnostic("RSS_NO_MARKET_ANGLE_SKIPPED", { count: diagnostics.noMarketAngleSkipped });
  logRssDiagnostic("RSS_QUALITY_REJECTED", { count: diagnostics.qualityRejected });
  logRssDiagnostic("RSS_RATE_LIMITED", { count: diagnostics.rateLimited });
  logRssDiagnostic("RSS_ELIGIBLE", { count: diagnostics.eligible });
  logRssDiagnostic("RSS_PUBLISHED", { count: diagnostics.published, wouldPublish: diagnostics.wouldPublish });

  return {
    diagnostics,
    eligibleItems,
    selectedItem,
  };
}

module.exports = {
  createEmptyRssDiagnostics,
  processGeneralRssItems,
  evaluateRateLimitForRss,
  logRssDiagnostic,
};
