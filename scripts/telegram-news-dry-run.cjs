const { discoverTelegramNews } = require("../worker/lib/telegram-news");
const { buildEconomicTripleKey } = require("../worker/lib/telegram-news/fingerprint");

function findTripleMergeRows(processed, triple = { previous: "49.5", forecast: "54.4", actual: "55.2" }) {
  return processed.filter((item) => {
    return (
      item.facts.previous === triple.previous &&
      item.facts.forecast === triple.forecast &&
      item.facts.actual === triple.actual
    );
  });
}

function buildDryRunTable(discovery) {
  const economicDuplicates = discovery.processed.filter((item) => item.mergedFrom?.length > 0);
  const exactDuplicates = discovery.posts.length - new Set(discovery.posts.map((p) => `${p.sourceChannel}:${p.sourceMessageId}`)).size;

  return {
    metrics: {
      postsByChannel: discovery.posts.reduce((acc, post) => {
        acc[post.sourceChannel] = (acc[post.sourceChannel] || 0) + 1;
        return acc;
      }, {}),
      exactDuplicates,
      economicEventDuplicates: economicDuplicates.filter((item) => item.newsType === "economic").length,
      semanticDuplicates: discovery.processed.filter((item) => item.duplicateOf).length,
      mergedEvents: economicDuplicates.length,
      promoOnlySkipped: discovery.parseStats?.promoOnlySkipped || 0,
      promoFootersRemoved: discovery.parseStats?.promoFootersRemoved || 0,
      aiAccepted: discovery.processed.filter((item) => item.aiResult === "accepted").length,
      aiFallback: discovery.processed.filter((item) => item.aiResult === "fallback").length,
      aiRejectedFactMismatch: discovery.processed.filter((item) => item.aiResult === "rejected_fact_mismatch").length,
      mergeBufferPeakSize: discovery.mergeBufferMetrics?.peakSize || 0,
      mergeBufferTimersEnd: discovery.mergeBufferTimers || 0,
    },
    table: discovery.processed.map((item) => ({
      "Source A": item.metadata?.sourceChannels?.[0] || item.post.sourceChannel,
      "Source B": item.metadata?.sourceChannels?.[1] || item.mergedFrom?.[0] || "",
      "Canonical Key": item.facts.canonicalEventKey || "general",
      Previous: item.facts.previous || item.facts.revisedPrevious || "",
      Forecast: item.facts.forecast || "",
      Actual: item.facts.actual || "",
      "Merge Key": item.mergeKey || item.fingerprints?.mergeKey || "",
      Merged: item.mergedFrom?.length > 0 ? "yes" : "no",
      "Selected Source": item.post.sourceChannel,
      "AI Result": item.aiResult || "none",
      "Promo Removed": item.post.promoFooterRemoved ? "yes" : "no",
      "Final Action": item.skipPublish ? "Skipped" : item.reason || "Selected",
    })),
    tripleExample: findTripleMergeRows(discovery.processed),
  };
}

async function runTelegramNewsDryRun(options = {}) {
  const discovery = await discoverTelegramNews({
    limitTotal: options.limitTotal || 100,
    limitPerChannel: 50,
    disableAi: true,
    dryRun: true,
    useMergeBuffer: true,
    flushImmediately: true,
  });

  const report = buildDryRunTable(discovery);
  return {
    totalFetched: discovery.posts.length,
    processedCount: discovery.processed.length,
    publishReady: discovery.processed.filter((item) => !item.skipPublish).length,
    ...report,
  };
}

runTelegramNewsDryRun({ limitTotal: 100 })
  .then((report) => {
    console.log("TELEGRAM_NEWS_DRY_RUN");
    console.log(JSON.stringify(report.metrics, null, 2));
    console.log("\nTRIPLE_EXAMPLE", JSON.stringify(report.tripleExample, null, 2));
    console.log("\nDRY_RUN_TABLE");
    console.table(report.table.slice(0, 35));
    console.log("\nSUMMARY", JSON.stringify({
      totalFetched: report.totalFetched,
      processedCount: report.processedCount,
      publishReady: report.publishReady,
      tripleMergedCount: report.tripleExample.length,
    }));
    process.exit(report.totalFetched > 0 ? 0 : 2);
  })
  .catch((error) => {
    console.error("TELEGRAM_NEWS_DRY_RUN_FAILED", error.message);
    process.exit(1);
  });

module.exports = {
  runTelegramNewsDryRun,
  buildDryRunTable,
  findTripleMergeRows,
};
