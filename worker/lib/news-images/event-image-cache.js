const {
  CACHE_TTL_MS,
  getCachedEventImage,
  setCachedEventImage,
  purgeExpiredEntries,
  getEventImageCacheMetrics,
  recordTextFirstFallback,
  resetEventImageCacheForTests,
  buildCacheKey,
} = require("../news-intelligence/event-image-cache-store");
const {
  selectEconomicFastLaneImage,
  SELECTION_STATUS,
} = require("./economic-image-pool");

async function prewarmEventImage(eventKey, context = {}, options = {}) {
  purgeExpiredEntries();
  const country = context.country || "US";
  const existing = getCachedEventImage(eventKey, country);
  if (existing) {
    return existing;
  }

  const selection = selectEconomicFastLaneImage({
    canonicalEventId: eventKey,
    countryCode: country,
    sourceMessageId: `prewarm:${eventKey}`,
    publishedAt: context.releaseTime || context.scheduledAt || null,
    poolBaseDir: options.poolBaseDir,
  });

  if (selection.status !== SELECTION_STATUS.PREBUILT_SELECTED || !selection.filePath) {
    return null;
  }

  setCachedEventImage(
    eventKey,
    {
      filePath: selection.filePath,
      imageUrl: selection.assetPath || null,
      createdAt: Date.now(),
      eventKey,
      source: "prebuilt_pool",
      imageMode: selection.imageMode,
      category: selection.category,
    },
    country
  );

  return getCachedEventImage(eventKey, country);
}

module.exports = {
  CACHE_TTL_MS,
  getCachedEventImage,
  prewarmEventImage,
  purgeExpiredEntries,
  getEventImageCacheMetrics,
  recordTextFirstFallback,
  resetEventImageCacheForTests,
  buildCacheKey,
};
