const axios = require("axios");
const { TELEGRAM_SOURCE_CHANNELS } = require("./sources");
const { parseTelegramChannelHtml } = require("./fetcher");
const { processTelegramPosts } = require("./dedupe");
const { getTelegramMergeBuffer } = require("./merge-buffer");
const {
  beginFetchCycle,
  initializeBaselinesFromPosts,
  completeBaselineFetch,
  isBaselineReadyForPublish,
  isSourcePublishable,
} = require("./publish-state");

const DEFAULT_USER_AGENT = "HasanChartWorld-TelegramDiscovery/1.0 (+https://hasanchart.world)";

async function fetchTelegramSourcePosts(options = {}) {
  const limitPerChannel = options.limitPerChannel || 50;
  const httpClient = options.httpClient || axios;
  const parseStats = options.parseStats || null;
  const allPosts = [];

  for (const channel of TELEGRAM_SOURCE_CHANNELS) {
    try {
      const response = await httpClient.get(channel.url, {
        timeout: options.timeoutMs || 15000,
        headers: {
          "User-Agent": options.userAgent || DEFAULT_USER_AGENT,
        },
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        continue;
      }

      const parsed = parseTelegramChannelHtml(response.data, channel, parseStats);
      allPosts.push(...parsed.slice(-limitPerChannel));
    } catch (_error) {
      // channel fetch failed — continue with other source
    }
  }

  allPosts.sort((a, b) => new Date(b.sourcePublishedAt).getTime() - new Date(a.sourcePublishedAt).getTime());
  return allPosts.slice(0, options.limitTotal || 100);
}

function mapProcessedToNewsItems(processed) {
  return processed.map((item) => ({
    title: item.facts.title || item.post.rawText.slice(0, 160),
    contentSnippet: item.post.rawText,
    summary: item.formattedMessage || "",
    description: item.post.rawText,
    link: item.post.sourceUrl,
    isoDate: item.post.sourcePublishedAt,
    pubDate: item.post.sourcePublishedAt,
    feedUrl: item.post.sourceUrl,
    sourceName: item.post.sourceChannel,
    isTelegramSource: true,
    telegramFingerprint: item.fingerprint || item.fingerprints?.mergeKey || item.fingerprints?.semantic,
    telegramSources: item.sources,
    telegramMergedFrom: item.mergedFrom,
    sourceChannels: item.metadata?.sourceChannels || item.sources,
    sourceMessageIds: item.metadata?.sourceMessageIds || [],
    sourceUrls: item.metadata?.sourceUrls || [item.post.sourceUrl],
    firstSeenAt: item.metadata?.firstSeenAt || item.post.sourcePublishedAt,
    lastSeenAt: item.metadata?.lastSeenAt || item.post.sourcePublishedAt,
    selectedSource: item.post.sourceChannel,
    mergedSources: item.metadata?.mergedSources || item.sources,
    sourceChannel: item.post.sourceChannel,
    sourceMessageId: item.post.sourceMessageId,
    sourceUrl: item.post.sourceUrl,
    sourcePublishedAt: item.post.sourcePublishedAt,
    formattedMessage: item.formattedMessage,
    skipPublish: item.skipPublish,
    validation: item.validation,
    newsType: item.newsType,
    missingFields: item.missingFields,
    conflict: item.conflict,
    finalFactCheck: item.finalFactCheck,
    aiImpactUsed: item.aiImpactUsed,
    aiResult: item.aiResult,
    mergeKey: item.mergeKey || item.fingerprints?.mergeKey,
    action: item.reason,
    imageUrl: null,
  }));
}

async function discoverTelegramNews(options = {}) {
  beginFetchCycle();

  const parseStats = options.parseStats || {
    promoOnlySkipped: 0,
    promoFootersRemoved: 0,
    unclearSkipped: 0,
    lowValueSkipped: 0,
    preEventMissingName: 0,
  };
  const posts = await fetchTelegramSourcePosts({ ...options, parseStats });
  const processed = await processTelegramPosts(posts, { ...options, pipelineStats: parseStats, parseStats });

  let buffer = null;
  let bufferFlushed = [];
  let bufferSubmitted = 0;
  let bufferBacklogSkipped = 0;

  if (options.useMergeBuffer) {
    buffer = options.mergeBuffer || getTelegramMergeBuffer({
      dryRun: options.dryRun === true,
      onReady: options.onMergeReady || null,
    });
  }

  if (!isBaselineReadyForPublish()) {
    initializeBaselinesFromPosts(posts);
    completeBaselineFetch();
  } else if (buffer) {
    for (const post of posts) {
      const publishable = isSourcePublishable(post);
      if (!publishable.ok) {
        bufferBacklogSkipped += 1;
        continue;
      }
      const result = buffer.submit(post);
      if (!result?.skip) {
        bufferSubmitted += 1;
      }
    }

    if (options.dryRun || options.flushImmediately) {
      bufferFlushed = await buffer.flushAllSync(options);
    }
  }

  return {
    posts,
    processed,
    bufferFlushed,
    bufferSubmitted,
    bufferBacklogSkipped,
    items: mapProcessedToNewsItems(processed),
    parseStats,
    mergeBuffer: buffer,
    mergeBufferTimers: buffer ? buffer.getActiveTimerCount() : 0,
    mergeBufferMetrics: buffer ? buffer.metrics : null,
  };
}

module.exports = {
  DEFAULT_USER_AGENT,
  fetchTelegramSourcePosts,
  discoverTelegramNews,
  mapProcessedToNewsItems,
};
