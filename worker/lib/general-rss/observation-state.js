/**
 * RSS ingestion checkpoint facade.
 * Legacy restart-baseline logic removed — delegates to persisted checkpoint store.
 */
const {
  isRssItemNew,
  isRssItemSeen,
  markRssItemSeen,
  bootstrapRssSource,
  bootstrapAllRssSources,
  resetCheckpointStoreForTests,
  isHydrated,
} = require("../news-ingestion/checkpoint-store");

function resetRssObservationStateForTests() {
  resetCheckpointStoreForTests();
}

function markRssObservationReady() {
  // no-op: readiness is tied to checkpoint hydration + bootstrap
}

function isRssObservationReady() {
  return isHydrated();
}

function initializeRssFeedBaselines(_items = []) {
  // Legacy API retired — bootstrap via bootstrapAllRssSources during cycle setup.
}

function isRssItemAfterBaseline(item = {}, sourceId = null) {
  const resolvedSourceId = sourceId || item.sourceName || item.sourceFeed || "unknown";
  return isRssItemNew(resolvedSourceId, item);
}

function getRssObservationSnapshot() {
  const { getCheckpointSnapshot } = require("../news-ingestion/checkpoint-store");
  return getCheckpointSnapshot();
}

module.exports = {
  resetRssObservationStateForTests,
  markRssObservationReady,
  isRssObservationReady,
  initializeRssFeedBaselines,
  isRssItemAfterBaseline,
  getRssObservationSnapshot,
  isRssItemNew,
  isRssItemSeen,
  markRssItemSeen,
  bootstrapRssSource,
  bootstrapAllRssSources,
};
