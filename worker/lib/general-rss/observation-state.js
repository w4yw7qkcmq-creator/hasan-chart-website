const feedBaselines = new Map();
let rssObservationReady = false;
let workerStartedAt = Date.now();

function resetRssObservationStateForTests() {
  feedBaselines.clear();
  rssObservationReady = false;
  workerStartedAt = Date.now();
}

function markRssObservationReady() {
  rssObservationReady = true;
}

function isRssObservationReady() {
  return rssObservationReady;
}

function initializeRssFeedBaselines(items = []) {
  for (const item of items) {
    const feedUrl = item.feedUrl || item.sourceFeed || "unknown";
    const publishedAt = new Date(item.isoDate || item.pubDate || 0).getTime();
    if (Number.isNaN(publishedAt) || !publishedAt) {
      continue;
    }

    const current = feedBaselines.get(feedUrl);
    if (!current || publishedAt > current.latestPublishedAt) {
      feedBaselines.set(feedUrl, {
        latestPublishedAt: publishedAt,
        latestLink: item.link || null,
      });
    }
  }

  rssObservationReady = true;
}

function isRssItemAfterBaseline(item = {}) {
  if (!rssObservationReady) {
    return false;
  }

  const feedUrl = item.feedUrl || item.sourceFeed || "unknown";
  const baseline = feedBaselines.get(feedUrl);
  const publishedAt = new Date(item.isoDate || item.pubDate || 0).getTime();

  if (!baseline || Number.isNaN(publishedAt) || !publishedAt) {
    return true;
  }

  return publishedAt > baseline.latestPublishedAt;
}

function getRssObservationSnapshot() {
  return {
    rssObservationReady,
    workerStartedAt: new Date(workerStartedAt).toISOString(),
    feedBaselines: Object.fromEntries(feedBaselines.entries()),
  };
}

module.exports = {
  resetRssObservationStateForTests,
  markRssObservationReady,
  isRssObservationReady,
  initializeRssFeedBaselines,
  isRssItemAfterBaseline,
  getRssObservationSnapshot,
};
