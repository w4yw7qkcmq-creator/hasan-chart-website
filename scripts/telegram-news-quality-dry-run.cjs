const { discoverTelegramNews } = require("../worker/lib/telegram-news");
const { isGenericTitle } = require("../worker/lib/telegram-news/editorial-title");

function aggregateEditorialMetrics(processed) {
  const totals = {
    aiEditorialAccepted: 0,
    aiEditorialRetryAccepted: 0,
    aiEditorialTooSimilar: 0,
    structuredFallbackUsed: 0,
    structuredFallbackRejected: 0,
    qualityGateRejected: 0,
    multiStorySplit: 0,
    multiStoryUnclear: 0,
    fedwatchDuplicateSkip: 0,
    fedwatchUpdatePending: 0,
  };

  for (const item of processed) {
    const metrics = item.editorialMetrics || {};
    totals.aiEditorialAccepted += metrics.aiEditorialAccepted || 0;
    totals.aiEditorialRetryAccepted += metrics.aiEditorialRetryAccepted || 0;
    totals.aiEditorialTooSimilar += metrics.aiEditorialTooSimilar || 0;
    totals.structuredFallbackUsed += metrics.structuredFallbackUsed || 0;
    totals.structuredFallbackRejected += metrics.structuredFallbackRejected || 0;
    if (item.reason === "FINAL_EDITORIAL_QUALITY_REJECTED") {
      totals.qualityGateRejected += 1;
    }
    if (item.reason === "MULTI_STORY_UNCLEAR") {
      totals.multiStoryUnclear += 1;
    }
    if ((item.storyCount || 1) > 1) {
      totals.multiStorySplit += 1;
    }
    if (item.reason === "fedwatch_duplicate_skip") {
      totals.fedwatchDuplicateSkip += 1;
    }
    if (item.reason === "TELEGRAM_NEWS_UPDATE_PENDING") {
      totals.fedwatchUpdatePending += 1;
    }
  }

  return totals;
}

function buildQualityDryRunTable(discovery) {
  const rows = [];

  for (const item of discovery.processed) {
    rows.push({
      source: item.post?.sourceChannel || "",
      messageId: item.post?.sourceMessageId || "",
      classification: item.classification?.classification || item.reason || "",
      originalGenericTitle: item.originalTitle || item.facts?.title || "",
      resolvedTitle: item.resolvedTitle || "",
      originalLength: item.originalLength || String(item.post?.rawText || "").length,
      finalLength: item.finalLength || (item.formattedMessage ? item.formattedMessage.length : 0),
      storyCount: item.storyCount || 1,
      aiFirstAttempt: item.editorialMetrics?.aiEditorialAccepted ? "accepted" : item.aiResult || "none",
      aiRetry: item.editorialMetrics?.aiEditorialRetryAccepted ? "accepted" : "none",
      fallbackUsed: item.editorialMetrics?.structuredFallbackUsed ? "yes" : "no",
      similarity: item.editorialCheck?.overlap ?? "",
      qualityGateResult: item.qualityCheck?.ok === false ? item.qualityCheck?.issues?.join("|") : "ok",
      finalAction: item.skipPublish ? `skip:${item.reason}` : item.reason || "publish-ready",
    });
  }

  return rows;
}

function pickTopCandidates(processed, limit = 15) {
  const scored = processed
    .filter((item) => item.formattedMessage || item.resolvedTitle)
    .map((item) => {
      let score = 0;
      if (!item.skipPublish) score += 5;
      if (item.resolvedTitle && !isGenericTitle(item.resolvedTitle)) score += 3;
      if (item.finalLength && item.finalLength <= 600) score += 2;
      if (item.qualityCheck?.ok !== false) score += 2;
      return { item, score };
    })
    .sort((a, b) => b.score - a.score || (b.item.finalLength || 0) - (a.item.finalLength || 0));

  return scored.slice(0, limit).map((entry) => entry.item);
}

function computeLengthStats(processed) {
  const lengths = processed
    .filter((item) => item.formattedMessage)
    .map((item) => item.formattedMessage.length);

  if (!lengths.length) {
    return { average: 0, max: 0, count: 0 };
  }

  const total = lengths.reduce((sum, value) => sum + value, 0);
  return {
    average: Math.round(total / lengths.length),
    max: Math.max(...lengths),
    count: lengths.length,
  };
}

async function runTelegramNewsQualityDryRun(options = {}) {
  const parseStats = {
    promoOnlySkipped: 0,
    promoFootersRemoved: 0,
    unclearSkipped: 0,
    lowValueSkipped: 0,
    preEventMissingName: 0,
    multiStorySplit: 0,
    multiStoryUnclear: 0,
  };

  const discovery = await discoverTelegramNews({
    limitTotal: options.limitTotal || 100,
    limitPerChannel: 50,
    disableAi: true,
    dryRun: true,
    useMergeBuffer: false,
    parseStats,
    pipelineStats: parseStats,
  });

  const table = buildQualityDryRunTable(discovery);
  const previewTop15 = pickTopCandidates(discovery.processed, 15);
  const editorialTotals = aggregateEditorialMetrics(discovery.processed);
  const lengthStats = computeLengthStats(discovery.processed);

  const genericTitlesRemaining = discovery.processed.filter(
    (item) => item.resolvedTitle && isGenericTitle(item.resolvedTitle)
  ).length;
  const overLimit = discovery.processed.filter(
    (item) => item.formattedMessage && item.formattedMessage.length > 600
  ).length;
  const multiStoryBundled = discovery.processed.filter((item) => (item.storyCount || 1) > 1 && !item.skipPublish).length;

  return {
    metrics: {
      fetched: discovery.posts.length,
      processed: discovery.processed.length,
      publishReady: discovery.processed.filter((i) => !i.skipPublish).length,
      promoOnlySkipped: parseStats.promoOnlySkipped,
      promoFootersRemoved: parseStats.promoFootersRemoved,
      unclearSkipped: parseStats.unclearSkipped,
      lowValueSkipped: parseStats.lowValueSkipped,
      preEventMissingName: parseStats.preEventMissingName,
      multiStorySplit: parseStats.multiStorySplit || editorialTotals.multiStorySplit,
      multiStoryUnclear: parseStats.multiStoryUnclear || editorialTotals.multiStoryUnclear,
      genericTitlesRemaining,
      overLimitMessages: overLimit,
      multiStoryBundled,
      lengthStats,
      editorialTotals,
    },
    table,
    previewTop15: previewTop15.map((item) => ({
      source: item.post?.sourceChannel,
      messageId: item.post?.sourceMessageId,
      classification: item.classification?.classification,
      originalGenericTitle: item.originalTitle,
      resolvedTitle: item.resolvedTitle,
      originalLength: item.originalLength,
      finalLength: item.finalLength,
      storyCount: item.storyCount || 1,
      aiFirstAttempt: item.editorialMetrics?.aiEditorialAccepted ? "accepted" : item.aiResult,
      aiRetry: item.editorialMetrics?.aiEditorialRetryAccepted ? "accepted" : "none",
      fallbackUsed: item.editorialMetrics?.structuredFallbackUsed ? "yes" : "no",
      similarity: item.editorialCheck?.overlap,
      qualityGateResult: item.qualityCheck?.ok === false ? item.qualityCheck?.issues : "ok",
      finalAction: item.skipPublish ? `skip:${item.reason}` : item.reason,
      preview: item.formattedMessage ? item.formattedMessage.slice(0, 220) : null,
    })),
  };
}

module.exports = {
  runTelegramNewsQualityDryRun,
  buildQualityDryRunTable,
  pickTopCandidates,
};

if (require.main === module) {
  runTelegramNewsQualityDryRun({ limitTotal: 100 })
    .then((report) => {
      console.log("TELEGRAM_NEWS_QUALITY_DRY_RUN");
      console.log(JSON.stringify(report.metrics, null, 2));

      console.log("\nPREVIEW_TOP_15");
      console.table(report.previewTop15);

      console.log("\nDRY_RUN_TABLE");
      console.table(report.table.slice(0, 40));
    })
    .catch((error) => {
      console.error("TELEGRAM_NEWS_QUALITY_DRY_RUN_FAILED", error.message);
      process.exit(1);
    });
}
