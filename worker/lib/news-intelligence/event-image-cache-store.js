const fs = require("fs");

const CACHE_TTL_MS = Number(process.env.ECONOMIC_EVENT_IMAGE_CACHE_TTL_MS || 6 * 60 * 60 * 1000);

/** @type {Map<string, { filePath: string, imageUrl: string|null, createdAt: number, eventKey: string }>} */
const memoryCache = new Map();

let metrics = {
  hits: 0,
  misses: 0,
  prewarmed: 0,
  expired: 0,
  textFirstFallbacks: 0,
};

function resetEventImageCacheForTests() {
  memoryCache.clear();
  metrics = { hits: 0, misses: 0, prewarmed: 0, expired: 0, textFirstFallbacks: 0 };
}

function getEventImageCacheMetrics() {
  return { ...metrics, size: memoryCache.size };
}

function buildCacheKey(eventKey, country = "US") {
  return `${country}:${eventKey}`;
}

function isExpired(entry, now = Date.now()) {
  return !entry || now - entry.createdAt > CACHE_TTL_MS;
}

function purgeExpiredEntries(now = Date.now()) {
  for (const [key, entry] of memoryCache.entries()) {
    if (isExpired(entry, now)) {
      memoryCache.delete(key);
      metrics.expired += 1;
      if (entry.filePath && fs.existsSync(entry.filePath)) {
        try {
          fs.unlinkSync(entry.filePath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }
}

function setCachedEventImage(eventKey, entry, country = "US") {
  const cacheKey = buildCacheKey(eventKey, country);
  memoryCache.set(cacheKey, entry);
  metrics.prewarmed += 1;
}

function getCachedEventImage(eventKey, country = "US") {
  purgeExpiredEntries();
  const cacheKey = buildCacheKey(eventKey, country);
  const entry = memoryCache.get(cacheKey);
  if (!entry || isExpired(entry)) {
    metrics.misses += 1;
    return null;
  }
  if (!entry.filePath || !fs.existsSync(entry.filePath)) {
    memoryCache.delete(cacheKey);
    metrics.misses += 1;
    return null;
  }
  metrics.hits += 1;
  return {
    generationAttempted: true,
    delivery: "photo",
    source: "event_cache",
    imageUrl: entry.imageUrl || null,
    filePath: entry.filePath,
    provider: "cache",
    cacheKey,
    cachedAt: new Date(entry.createdAt).toISOString(),
  };
}

function recordTextFirstFallback() {
  metrics.textFirstFallbacks += 1;
}

module.exports = {
  CACHE_TTL_MS,
  getCachedEventImage,
  setCachedEventImage,
  purgeExpiredEntries,
  getEventImageCacheMetrics,
  recordTextFirstFallback,
  resetEventImageCacheForTests,
  buildCacheKey,
};
