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
};
