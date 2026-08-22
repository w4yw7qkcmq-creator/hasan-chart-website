const RSS_IMAGE_SOURCES = ["CNBC", "MarketWatch", "ForexLive", "CoinDesk"];

const EVENT_FIELDS = {
  rss_image_resolution_attempted: "attempted",
  rss_image_resolved: "resolved",
  rss_image_missing: "missing",
  rss_image_from_enclosure: "fromEnclosure",
  rss_image_from_media_content: "fromMediaContent",
  rss_image_from_media_thumbnail: "fromMediaThumbnail",
  rss_image_from_rss_html: "fromRssHtml",
  rss_image_from_og: "fromOg",
  rss_image_from_twitter: "fromTwitter",
  rss_image_from_jsonld: "fromJsonLd",
  rss_image_generic_rejected: "genericRejected",
  rss_image_validation_failed: "validationFailed",
  rss_article_image_fetch_attempted: "articleFetchAttempted",
  rss_article_image_fetch_failed: "articleFetchFailed",
};

function createEmptyBucket() {
  return {
    attempted: 0,
    resolved: 0,
    missing: 0,
    fromEnclosure: 0,
    fromMediaContent: 0,
    fromMediaThumbnail: 0,
    fromRssHtml: 0,
    fromOg: 0,
    fromTwitter: 0,
    fromJsonLd: 0,
    genericRejected: 0,
    validationFailed: 0,
    articleFetchAttempted: 0,
    articleFetchFailed: 0,
  };
}

const globalCounters = createEmptyBucket();
const bySource = Object.fromEntries(RSS_IMAGE_SOURCES.map((source) => [source, createEmptyBucket()]));

function normalizeSourceKey(source = "") {
  const value = String(source || "").trim();
  if (!value) return null;
  const match = RSS_IMAGE_SOURCES.find((key) => key.toLowerCase() === value.toLowerCase());
  return match || null;
}

function bump(bucket, field, amount = 1) {
  if (!bucket || !field) return;
  bucket[field] = (bucket[field] || 0) + amount;
}

function recordRssImageTelemetryEvent(source, event, amount = 1) {
  const field = EVENT_FIELDS[event] || null;
  if (!field) return;
  bump(globalCounters, field, amount);
  const sourceKey = normalizeSourceKey(source);
  if (sourceKey) bump(bySource[sourceKey], field, amount);
}

function recordRssImageResolutionOutcome(source, result = null) {
  recordRssImageTelemetryEvent(source, "rss_image_resolution_attempted");
  if (result?.url) {
    recordRssImageTelemetryEvent(source, "rss_image_resolved");
    const sourceFieldMap = {
      enclosure: "rss_image_from_enclosure",
      media_content: "rss_image_from_media_content",
      media_thumbnail: "rss_image_from_media_thumbnail",
      rss_html: "rss_image_from_rss_html",
      og_image: "rss_image_from_og",
      twitter_image: "rss_image_from_twitter",
      json_ld: "rss_image_from_jsonld",
    };
    const event = sourceFieldMap[result.source];
    if (event) recordRssImageTelemetryEvent(source, event);
    return;
  }
  recordRssImageTelemetryEvent(source, "rss_image_missing");
}

function getRssImageTelemetrySnapshot() {
  return {
    global: { ...globalCounters },
    bySource: Object.fromEntries(RSS_IMAGE_SOURCES.map((source) => [source, { ...bySource[source] }])),
  };
}

function resetRssImageTelemetryForTests() {
  Object.assign(globalCounters, createEmptyBucket());
  for (const source of RSS_IMAGE_SOURCES) {
    Object.assign(bySource[source], createEmptyBucket());
  }
}

module.exports = {
  RSS_IMAGE_SOURCES,
  recordRssImageTelemetryEvent,
  recordRssImageResolutionOutcome,
  getRssImageTelemetrySnapshot,
  resetRssImageTelemetryForTests,
};
