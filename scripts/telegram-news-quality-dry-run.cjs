const { discoverTelegramNews } = require("../worker/lib/telegram-news");
const { prepareTelegramPost } = require("../worker/lib/telegram-news/pipeline");
const { processTelegramPosts } = require("../worker/lib/telegram-news/dedupe");
const { formatTelegramNewsMessage, stripTimestampFooter } = require("../worker/lib/telegram-news/telegram-formatter");

function buildQualityDryRunTable(discovery) {
  const rows = [];

  for (const item of discovery.processed) {
    rows.push({
      Source: item.post?.sourceChannel || "",
      "Message ID": item.post?.sourceMessageId || "",
      Classification: item.classification?.classification || item.reason || "",
      "Promotion Detected": item.classification?.detectedPromotionSignals?.length ? "yes" : "no",
      "Promotion Removed": item.promoFooterRemoved ? "yes" : "no",
      "News Value Score": item.newsValue?.score ?? "",
      "Selected / Skipped": item.skipPublish ? "Skipped" : "Selected",
      "AI Used": item.aiImpactUsed ? "yes" : "no",
      "AI Accepted / Fallback": item.aiResult || "none",
      "Similarity Result": item.editorialCheck?.reason || (item.editorialCheck?.ok === false ? item.editorialCheck?.issues?.join("|") : "ok"),
      "Final Character Count": item.formattedMessage ? item.formattedMessage.length : 0,
      "Final Action": item.reason || "",
    });
  }

  return rows;
}

function pickExamples(processed) {
  const economic = processed.filter((i) => i.newsType === "economic" && !i.skipPublish).slice(0, 3);
  const general = processed.filter((i) => i.newsType === "general" && !i.skipPublish).slice(0, 3);
  const preEvent = processed.filter((i) => i.newsType === "pre_event" && !i.skipPublish).slice(0, 2);
  const promos = processed.filter((i) => i.skipPublish && /PROMOTION|SUBSCRIPTION|BROKER|CHANNEL|LOW_VALUE|UNCLEAR/i.test(i.reason || "")).slice(0, 2);

  return { economic, general, preEvent, promos };
}

async function runTelegramNewsQualityDryRun(options = {}) {
  const parseStats = {
    promoOnlySkipped: 0,
    promoFootersRemoved: 0,
    unclearSkipped: 0,
    lowValueSkipped: 0,
    preEventMissingName: 0,
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
  const examples = pickExamples(discovery.processed);

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
    },
    table,
    examples,
  };
}

module.exports = {
  runTelegramNewsQualityDryRun,
  buildQualityDryRunTable,
};

if (require.main === module) {
  runTelegramNewsQualityDryRun({ limitTotal: 100 })
    .then((report) => {
      console.log("TELEGRAM_NEWS_QUALITY_DRY_RUN");
      console.log(JSON.stringify(report.metrics, null, 2));
      console.log("\nDRY_RUN_TABLE");
      console.table(report.table.slice(0, 40));

      console.log("\n=== EXAMPLES ===");
      for (const [label, items] of Object.entries(report.examples)) {
        console.log(`\n--- ${label.toUpperCase()} ---`);
        for (const item of items) {
          console.log(`\n[${item.post?.sourceChannel}/${item.post?.sourceMessageId}]`);
          console.log(item.formattedMessage || `(skipped: ${item.reason})`);
        }
      }
    })
    .catch((error) => {
      console.error("TELEGRAM_NEWS_QUALITY_DRY_RUN_FAILED", error.message);
      process.exit(1);
    });
}
