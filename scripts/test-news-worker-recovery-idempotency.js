#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { dryRunRecoverMissingSitePosts } = require("../worker/lib/news-site-recovery.js");

function createMockSupabase() {
  const published = [
    {
      link: "scheduled-alert:us-market-open-5m-2026-08-05",
      title: "Telegram-only alert",
      normalized_title: "telegram alert",
      topic_cluster: "scheduled_market_alert",
      published_at: "2026-08-05T13:25:38.604+00:00",
    },
    {
      link: "https://www.cnbc.com/2026/08/05/us-iran-war-trump-hormuz-bessent-iran-deal-close.html",
      title: "Iran, Oman say Strait of Hormuz talks in final stages ...",
      normalized_title: "iran oman hormuz",
      topic_cluster: "hormuz_iran_us",
      published_at: "2026-08-05T18:16:48.169+00:00",
    },
    {
      link: "https://www.cnbc.com/2026/08/05/oil-prices-iran-war-houthis-saudi-tanker.html",
      title: "Oil prices fall on negotiations to manage ship traffic in Strait of Hormuz ...",
      normalized_title: "oil prices hormuz",
      topic_cluster: "hormuz_iran_us",
      published_at: "2026-08-05T18:24:51.980+00:00",
    },
  ];

  const posts = [
    {
      id: "post-1",
      source_link: "https://www.cnbc.com/2026/08/05/us-iran-war-trump-hormuz-bessent-iran-deal-close.html",
      title: "Iran, Oman say Strait of Hormuz talks in final stages ...",
      created_at: "2026-08-05T18:16:48.169+00:00",
    },
  ];

  return {
    from(table) {
      const api = {
        select() {
          return api;
        },
        order() {
          return api;
        },
        limit() {
          return api;
        },
        gte() {
          return api;
        },
        then(resolve) {
          if (table === "published_news") {
            resolve({ data: published, error: null });
            return;
          }
          resolve({ data: posts, error: null });
        },
      };
      return api;
    },
  };
}

(async () => {
  const result = await dryRunRecoverMissingSitePosts(() => createMockSupabase(), {
    since: "2026-08-03T07:03:02.521+00:00",
  });

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.summary.telegramOnlyIntentional, 1);
  assert.equal(result.summary.siteEligible, 2);
  assert.equal(result.summary.sitePublished, 1);
  assert.equal(result.summary.dedupeMarkers, 1);
  assert.equal(result.summary.siteMissingRecoverable, 0);
  assert.equal(result.wouldRecover, 0);

  console.log("news worker recovery idempotency PASS");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
