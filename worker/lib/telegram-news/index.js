const axios = require("axios");
const { TELEGRAM_SOURCE_CHANNELS } = require("./sources");
const { parseTelegramChannelHtml } = require("./fetcher");
const { processTelegramPosts } = require("./dedupe");
const { getTelegramMergeBuffer } = require("./merge-buffer");
const {
  beginFetchCycle,
  isBaselineReadyForPublish,
  isSourcePublishable,
  bootstrapTelegramChannelForAll,
} = require("./publish-state");
const {
  classifyTelegramMessage,
  markTelegramMessageSeen,
  bootstrapAllTelegramSources,
} = require("../news-ingestion/checkpoint-store");

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
    ingestionClassification: item.ingestionClassification || null,
  }));
}

function summarizeTelegramIngestion(posts = [], processed = []) {
  let newMessages = 0;
  let oldSeen = 0;
  let pinnedOld = 0;

  for (const post of posts) {
    const classified = classifyTelegramMessage(post.sourceChannel, post);
    if (classified.classification === "PINNED_OLD_MESSAGE") {
      pinnedOld += 1;
      oldSeen += 1;
    } else if (!classified.new) {
      oldSeen += 1;
    } else {
      newMessages += 1;
    }
  }

  const candidates = processed.filter(
    (item) =>
      item.ingestionClassification === "NEW_MESSAGE" &&
      !item.skipPublish &&
      item.formattedMessage
  ).length;

  const factCheckFailed = processed.filter((item) => item.finalFactCheck?.ok === false).length;
  const economicEligible = processed.filter(
    (item) => item.ingestionClassification === "NEW_MESSAGE" && item.newsType === "economic" && !item.skipPublish
  ).length;

  return {
    fetched: posts.length,
    newMessages,
    oldSeen,
    pinnedOld,
    normalized: processed.length,
    candidates,
    factCheckFailed,
    economicEligible,
    published: 0,
  };
}

function tagProcessedWithIngestionClassification(processed = [], posts = []) {
  const postMap = new Map(posts.map((post) => [`${post.sourceChannel}:${post.sourceMessageId}`, post]));
  for (const item of processed) {
    const post = item.post || postMap.get(`${item.post?.sourceChannel}:${item.post?.sourceMessageId}`);
    if (!post) continue;
    const classified = classifyTelegramMessage(post.sourceChannel, post);
    item.ingestionClassification = classified.classification;
    if (!classified.new) {
      item.skipPublish = true;
      item.observabilityOnly = true;
    }
  }
  return processed;
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

  if (!isBaselineReadyForPublish() && options.bootstrapOptions) {
    bootstrapAllTelegramSources(posts, options.bootstrapOptions);
  } else if (!isBaselineReadyForPublish()) {
    bootstrapTelegramChannelForAll(posts, options.bootstrapOptions || {});
  }

  const processed = await processTelegramPosts(posts, { ...options, pipelineStats: parseStats, parseStats });
  tagProcessedWithIngestionClassification(processed, posts);

  let buffer = null;
  let bufferFlushed = [];
  let bufferSubmitted = 0;
  let bufferBacklogSkipped = 0;
  let bufferOldSeenSkipped = 0;

  if (options.useMergeBuffer) {
    buffer = options.mergeBuffer || getTelegramMergeBuffer({
      dryRun: options.dryRun === true,
      onReady: options.onMergeReady || null,
    });
  }

  let bufferSubmittedKeys = new Set();
  if (buffer && isBaselineReadyForPublish()) {
    for (const post of posts) {
      const publishable = isSourcePublishable(post);
      if (!publishable.ok) {
        if (
          publishable.reason === "OLD_SEEN_MESSAGE" ||
          publishable.reason === "PINNED_OLD_MESSAGE"
        ) {
          bufferOldSeenSkipped += 1;
        } else {
          bufferBacklogSkipped += 1;
        }
        continue;
      }
      const result = buffer.submit(post);
      if (!result?.skip) {
        bufferSubmitted += 1;
        bufferSubmittedKeys.add(`${post.sourceChannel}:${post.sourceMessageId}`);
      }
    }

    if (options.dryRun || options.flushImmediately) {
      bufferFlushed = await buffer.flushAllSync(options);
      for (const item of bufferFlushed) {
        const post = item?.post;
        if (post?.sourceChannel && post?.sourceMessageId) {
          bufferSubmittedKeys.delete(`${post.sourceChannel}:${post.sourceMessageId}`);
        }
      }
    }
  }

  for (const post of posts) {
    const classified = classifyTelegramMessage(post.sourceChannel, post);
    if (!classified.new) continue;
    if (bufferSubmittedKeys.has(`${post.sourceChannel}:${post.sourceMessageId}`)) {
      continue;
    }
    const matchingProcessed = processed.filter(
      (item) =>
        item.post?.sourceChannel === post.sourceChannel &&
        String(item.post?.sourceMessageId) === String(post.sourceMessageId)
    );
    const terminal = matchingProcessed.every(
      (item) =>
        item.skipPublish ||
        item.observabilityOnly ||
        item.finalFactCheck?.ok !== false ||
        Boolean(item.newsType)
    );
    if (terminal && matchingProcessed.length > 0) {
      markTelegramMessageSeen(post.sourceChannel, post, { outcome: "processed" });
    }
  }

  const ingestionSummary = summarizeTelegramIngestion(posts, processed);

  return {
    posts,
    processed,
    bufferFlushed,
    bufferSubmitted,
    bufferBacklogSkipped,
    bufferOldSeenSkipped,
    ingestionSummary,
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
  summarizeTelegramIngestion,
  tagProcessedWithIngestionClassification,
};
