#!/usr/bin/env node

const path = require("path");

process.env.NEWS_WORKER_NO_BOOT = "1";

process.chdir(path.join(__dirname, "..", "worker"));
require(path.join(__dirname, "..", "worker", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", ".env.local"),
});
require(path.join(__dirname, "..", "worker", "node_modules", "dotenv")).config({
  path: path.join(__dirname, "..", "worker", ".env"),
});

const { runRssGeneralDryRun } = require(path.join(__dirname, "..", "worker", "news-worker.js"));

runRssGeneralDryRun()
  .then((report) => {
    console.log("\n=== RSS FEED REPORTS ===");
    for (const feed of report.feedReports) {
      console.log(
        JSON.stringify({
          name: feed.name,
          httpStatus: feed.httpStatus,
          ok: feed.ok,
          fetched: feed.fetched,
          normalized: feed.normalized,
          newestPublishedAt: feed.newestPublishedAt,
          newestAgeMinutes: feed.newestAgeMinutes,
          accepted: feed.accepted,
          rejected: feed.rejected,
          error: feed.error || null,
        })
      );
    }

    console.log("\n=== SUMMARY ===");
    console.log(JSON.stringify(report.summary, null, 2));

    console.log("\n=== TOP 10 WOULD PUBLISH ===");
    for (const item of report.topEligible) {
      console.log(
        JSON.stringify({
          source: item.sourceName,
          ageMinutes: report.table.find((row) => row.title === item.title)?.ageMinutes ?? null,
          feedDelayMinutes: report.table.find((row) => row.title === item.title)?.feedDelayMinutes ?? null,
          category: item.newsCategory,
          impact: item.impactLevel,
          score: item.marketRelevanceScore,
          marketAngle: item.marketAngle,
          title: item.title,
          action: "RSS_ELIGIBLE",
        })
      );
    }

    console.log("\n=== LATEST 50 RSS ITEMS ===");
    console.log(JSON.stringify(report.table, null, 2));

    process.exit(report.summary.wouldPublish > 0 ? 0 : 2);
  })
  .catch((error) => {
    console.error("RSS_GENERAL_DRY_RUN_FAILED", error.message);
    process.exit(1);
  });
