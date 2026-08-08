const { GENERAL_RSS_FEEDS, RSS_FEED_DELAY_GRACE_MINUTES } = require("./constants");
const { fetchGeneralRssFeeds } = require("./feed-fetch");
const { processGeneralRssItems } = require("./pipeline");
const { evaluateGeneralNewsMarketRelevance } = require("./market-relevance");
const { evaluateRssDuplicate, buildRssDuplicateKey, buildRssEventFingerprint } = require("./dedup");
const { evaluateItemFreshness, getFeedDelayMinutes } = require("./age-policy");
const { classifyNewsCategory } = require("./news-category");
const {
  initializeRssFeedBaselines,
  isRssObservationReady,
  isRssItemAfterBaseline,
  resetRssObservationStateForTests,
  getRssObservationSnapshot,
} = require("./observation-state");
const {
  BLOCK_REASONS: RSS_EDITORIAL_BLOCK_REASONS,
  validateGeneralRssEditorialOutput,
  buildRawSourceText,
} = require("./editorial-safety");

module.exports = {
  GENERAL_RSS_FEEDS,
  RSS_FEED_DELAY_GRACE_MINUTES,
  fetchGeneralRssFeeds,
  processGeneralRssItems,
  evaluateGeneralNewsMarketRelevance,
  evaluateRssDuplicate,
  buildRssDuplicateKey,
  buildRssEventFingerprint,
  evaluateItemFreshness,
  getFeedDelayMinutes,
  classifyNewsCategory,
  initializeRssFeedBaselines,
  isRssObservationReady,
  isRssItemAfterBaseline,
  resetRssObservationStateForTests,
  getRssObservationSnapshot,
  RSS_EDITORIAL_BLOCK_REASONS,
  validateGeneralRssEditorialOutput,
  buildRawSourceText,
};
