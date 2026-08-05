#!/usr/bin/env node
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  classifyPublishedNewsLink,
  isSiteEligiblePublishedLink,
  isTelegramOnlyPublishedLink,
} = require("../worker/lib/news-site-eligibility.js");
const { buildRecoveryCandidate } = require("../worker/lib/news-site-recovery.js");

assert.equal(classifyPublishedNewsLink("scheduled-alert:us-market-open-5m-2026-08-05"), "scheduled_alert_telegram_only");
assert.equal(isTelegramOnlyPublishedLink("https://t.me/ForexNewspaper/13470"), true);
assert.equal(isSiteEligiblePublishedLink("https://www.cnbc.com/example.html"), true);
assert.equal(isSiteEligiblePublishedLink("scheduled-alert:x"), false);

const dedupeMarker = buildRecoveryCandidate(
  {
    link: "https://www.cnbc.com/2026/08/05/oil-prices.html",
    title: "Oil prices fall on negotiations to manage ship traffic in Strait of Hormuz ...",
    topic_cluster: "hormuz_iran_us",
    published_at: "2026-08-05T18:24:51.000Z",
  },
  new Map(),
  new Map([["hormuz_iran_us", { source_link: "https://www.cnbc.com/other.html" }]])
);
assert.equal(dedupeMarker.action, "skip_dedupe_marker");

const recoverable = buildRecoveryCandidate(
  {
    link: "https://www.cnbc.com/2026/08/05/example.html",
    title: "A sufficiently long Arabic market headline that should be recoverable on the site without Telegram duplication",
    topic_cluster: "unique_cluster",
    published_at: "2026-08-05T18:24:51.000Z",
  },
  new Map(),
  new Map()
);
assert.equal(recoverable.action, "recover_site_post");

console.log("news worker site publish parity PASS");
