const { RSS_FEED_DELAY_GRACE_MINUTES } = require("./constants");
const { classifyNewsCategory, getAgeBucketForCategory } = require("./news-category");

const AGE_LIMITS_MS = {
  breaking: 120 * 60 * 1000,
  market_move: 4 * 60 * 60 * 1000,
  central_bank_commentary: 6 * 60 * 60 * 1000,
  earnings: 12 * 60 * 60 * 1000,
  analysis_with_new_development: 6 * 60 * 60 * 1000,
};

const GRACE_MS = RSS_FEED_DELAY_GRACE_MINUTES * 60 * 1000;

function classifyContentAgeBucket(text = "") {
  const category = classifyNewsCategory(text);

  if (category === "evergreen" || category === "product_lifestyle" || category === "opinion") {
    return category;
  }

  return getAgeBucketForCategory(category);
}

function getMaxAgeMsForItem(item = {}) {
  const text = `${item.title || ""} ${item.contentSnippet || ""} ${item.summary || ""}`;
  const bucket = classifyContentAgeBucket(text);

  if (bucket === "evergreen" || bucket === "product_lifestyle" || bucket === "opinion") {
    return 0;
  }

  return AGE_LIMITS_MS[bucket] || AGE_LIMITS_MS.market_move;
}

function getItemPublishedAt(item = {}) {
  const raw = item.articlePublishedAt || item.isoDate || item.pubDate || item.publishedAt || null;
  if (!raw) {
    return null;
  }
  const time = new Date(raw).getTime();
  return Number.isNaN(time) ? null : time;
}

function getFeedDelayMinutes(item = {}, nowMs = Date.now()) {
  const publishedAt = getItemPublishedAt(item);
  const fetchedAt = item.fetchedAt || nowMs;

  if (!publishedAt || !fetchedAt) {
    return 0;
  }

  return Math.max(0, Math.round((fetchedAt - publishedAt) / 60000));
}

function evaluateItemFreshness(item = {}, nowMs = Date.now()) {
  const text = `${item.title || ""} ${item.contentSnippet || ""} ${item.summary || ""}`;
  const category = classifyNewsCategory(text);
  const bucket = classifyContentAgeBucket(text);
  const publishedAt = getItemPublishedAt(item);
  const feedDelayMinutes = getFeedDelayMinutes(item, nowMs);

  if (category === "evergreen") {
    return {
      fresh: false,
      ageMinutes: publishedAt ? Math.round((nowMs - publishedAt) / 60000) : null,
      bucket: "evergreen",
      category,
      feedDelayMinutes,
      maxAgeMinutes: 0,
      reason: "evergreen_educational",
    };
  }

  if (!publishedAt) {
    return {
      fresh: false,
      ageMinutes: null,
      bucket: "unknown",
      category,
      feedDelayMinutes,
      reason: "missing_published_at",
    };
  }

  const ageMs = nowMs - publishedAt;
  const maxAgeMs = getMaxAgeMsForItem(item);
  const maxAgeMinutes = Math.round(maxAgeMs / 60000);
  const ageMinutes = Math.round(ageMs / 60000);
  const effectiveMaxAgeMs = maxAgeMs > 0 ? maxAgeMs + GRACE_MS : 0;

  const fresh = maxAgeMs > 0 && ageMs >= 0 && ageMs <= effectiveMaxAgeMs;

  return {
    fresh,
    ageMinutes,
    bucket,
    category,
    feedDelayMinutes,
    maxAgeMinutes,
    graceApplied: fresh && ageMs > maxAgeMs,
    reason: fresh ? null : "stale_for_content_type",
  };
}

module.exports = {
  AGE_LIMITS_MS,
  GRACE_MS,
  classifyContentAgeBucket,
  getMaxAgeMsForItem,
  getItemPublishedAt,
  getFeedDelayMinutes,
  evaluateItemFreshness,
};
