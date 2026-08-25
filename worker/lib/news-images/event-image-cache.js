const fs = require("fs");
const path = require("path");
const os = require("os");
const { generateDeterministicBrandedFallbackImage } = require("./premium-image-generator");
const { FALLBACK_BRAND } = require("./image-policy");
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

const CACHE_DIR =
  process.env.ECONOMIC_EVENT_IMAGE_CACHE_DIR || path.join(os.tmpdir(), "hasan-chart-economic-event-images");

async function prewarmEventImage(eventKey, context = {}, options = {}) {
  purgeExpiredEntries();
  const country = context.country || "US";
  const existing = getCachedEventImage(eventKey, country);
  if (existing) {
    return existing;
  }

  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }

  const cacheKey = buildCacheKey(eventKey, country);
  const result = await generateDeterministicBrandedFallbackImage(
    {
      eventKey,
      eventName: context.eventName || context.title || eventKey,
      title: context.title || context.eventName || eventKey,
      country,
      brandName: FALLBACK_BRAND,
      importance: context.importance || "HIGH",
      actual: undefined,
      forecast: undefined,
      previous: undefined,
    },
    {
      ...options,
      disableInternalProviderFallback: true,
      provider: "fallback",
      outputPath: path.join(CACHE_DIR, `${cacheKey.replace(/[^a-zA-Z0-9:_-]/g, "_")}.png`),
    }
  );

  if (!result?.filePath || !fs.existsSync(result.filePath)) {
    return null;
  }

  setCachedEventImage(
    eventKey,
    {
      filePath: result.filePath,
      imageUrl: null,
      createdAt: Date.now(),
      eventKey,
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
