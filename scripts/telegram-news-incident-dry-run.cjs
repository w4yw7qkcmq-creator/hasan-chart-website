#!/usr/bin/env node

const path = require("path");
const {
  resetPublishStateForTests,
  initializeBaselinesFromPosts,
  completeBaselineFetch,
  configurePublishWindowForTests,
} = require("../worker/lib/telegram-news/publish-state");
const { processTelegramPosts } = require("../worker/lib/telegram-news/dedupe");
const {
  publishValidatedTelegramNewsCandidate,
  resetAtomicPublishForTests,
} = require("../worker/lib/telegram-news/atomic-publish");
const { isGenericTitle } = require("../worker/lib/telegram-news/editorial-title");

function post(overrides = {}) {
  return {
    sourceChannel: "ForexBreakingNews",
    sourceMessageId: "1",
    sourceUrl: "https://t.me/ForexBreakingNews/1",
    sourcePublishedAt: "2026-08-01T22:10:00+00:00",
    priority: 1,
    rawText: "",
    ...overrides,
  };
}

async function runIncidentDryRun() {
  resetPublishStateForTests();
  resetAtomicPublishForTests();
  process.env.TELEGRAM_NEWS_PUBLISH_ENABLED = "1";
  const baselineTime = "2026-08-01T21:00:00+00:00";
  configurePublishWindowForTests({
    publishingEnabledAt: baselineTime,
    minimumPublishableSourceTime: baselineTime,
  });

  initializeBaselinesFromPosts([
    post({ sourceChannel: "ForexBreakingNews", sourceMessageId: "41400", sourcePublishedAt: "2026-08-01T21:00:00+00:00" }),
    post({ sourceChannel: "ForexNewspaper", sourceMessageId: "13400", sourcePublishedAt: "2026-08-01T21:00:00+00:00" }),
  ]);
  completeBaselineFetch();

  const trumpText =
    "🚨 Trump says Iran talks could resume if Tehran agrees to nuclear limits\nOil prices eased after the remarks";
  const candidates = [
    post({ sourceChannel: "ForexNewspaper", sourceMessageId: "13469", rawText: trumpText }),
    post({ sourceChannel: "ForexNewspaper", sourceMessageId: "13477", rawText: trumpText }),
    post({ sourceChannel: "ForexBreakingNews", sourceMessageId: "41463", rawText: trumpText }),
    post({ sourceChannel: "ForexNewspaper", sourceMessageId: "13463", rawText: trumpText }),
    post({ sourceChannel: "ForexBreakingNews", sourceMessageId: "41467", rawText: "Logan: inflation progress is uneven" }),
    post({ sourceChannel: "ForexNewspaper", sourceMessageId: "13461", rawText: "عاجل :\nLogan Fed vote 9-3" }),
    post({ sourceChannel: "ForexNewspaper", sourceMessageId: "13464", rawText: "FedWatch 67% hike July FOMC" }),
    post({ sourceChannel: "ForexNewspaper", sourceMessageId: "13474", rawText: "FedWatch 67% hike July FOMC hold" }),
    post({ sourceChannel: "ForexBreakingNews", sourceMessageId: "41462", rawText: "Gold falls 1.8% to 4024" }),
    post({ sourceChannel: "ForexNewspaper", sourceMessageId: "13472", rawText: "موجز أخبار المساء\n• story A\n• story B\n• story C" }),
    post({ sourceChannel: "ForexBreakingNews", sourceMessageId: "41300", rawText: "backlog old", sourcePublishedAt: "2026-08-01T20:00:00+00:00" }),
  ];

  const processed = await processTelegramPosts(candidates, { disableAi: true });
  const summary = {
    input: candidates.length,
    processed: processed.length,
    publishReady: 0,
    rejected: 0,
    publishedDryRun: 0,
    backlogSkipped: 0,
    genericRejected: 0,
    duplicates: 0,
    titles: [],
  };

  for (const item of processed) {
    if (item.skipPublish) {
      summary.rejected += 1;
      if (item.reason === "TELEGRAM_NEWS_BACKLOG_SKIPPED") {
        summary.backlogSkipped += 1;
      }
      continue;
    }
    summary.publishReady += 1;
    const result = await publishValidatedTelegramNewsCandidate(item, {}, { dryRun: true, memoryOnly: true });
    if (result.skipped) {
      if ((result.reason || "").includes("GENERIC") || result.validation?.issues?.includes("GENERIC_TITLE_FINAL_REJECTED")) {
        summary.genericRejected += 1;
      }
      if ((result.reason || "").includes("duplicate")) {
        summary.duplicates += 1;
      }
      continue;
    }
    summary.publishedDryRun += 1;
    summary.titles.push(result.resolvedTitle);
  }

  summary.genericTitlesRemaining = summary.titles.filter((title) => isGenericTitle(title)).length;
  summary.overLimit = summary.titles.length;

  console.log("TELEGRAM_NEWS_INCIDENT_DRY_RUN");
  console.log(JSON.stringify(summary, null, 2));
}

runIncidentDryRun().catch((error) => {
  console.error("TELEGRAM_NEWS_INCIDENT_DRY_RUN_FAILED", error.message);
  process.exit(1);
});
