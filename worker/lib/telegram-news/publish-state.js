const { TELEGRAM_SOURCE_CHANNELS } = require("./sources");
const { parseMessageId } = require("./message-id");
const {
  classifyTelegramMessage,
  markTelegramMessageSeen,
  bootstrapTelegramChannel,
  isTelegramMessageNew,
  isHydrated,
  markCheckpointsHydrated,
} = require("../news-ingestion/checkpoint-store");

let newsWorkerStartedAt = new Date().toISOString();
let publishingEnabledAt = null;
let minimumPublishableSourceTime = null;
let fetchCycleCount = 0;
let lastPublishingEnabled = null;
let onPublishingEnabledHook = null;

/** @type {Set<string>} */
const observationOnlyKeys = new Set();

/** @type {Set<string>} */
const permanentlyDiscardedKeys = new Set();

function isPublishingEnabled() {
  return (
    process.env.TELEGRAM_NEWS_PUBLISH_ENABLED !== "0" &&
    process.env.TELEGRAM_NEWS_PUBLISH_ENABLED !== "false"
  );
}

function syncPublishingTransition() {
  const enabled = isPublishingEnabled();
  if (lastPublishingEnabled === false && enabled === true) {
    clearObservationBufferBeforeEnable();
    publishingEnabledAt = new Date().toISOString();
    minimumPublishableSourceTime = publishingEnabledAt;
    if (onPublishingEnabledHook) {
      onPublishingEnabledHook();
    }
  } else if (enabled && !publishingEnabledAt) {
    publishingEnabledAt = new Date().toISOString();
    minimumPublishableSourceTime = publishingEnabledAt;
  } else if (!enabled) {
    publishingEnabledAt = null;
    minimumPublishableSourceTime = null;
  }
  lastPublishingEnabled = enabled;
  return enabled;
}

function setOnPublishingEnabledHook(fn) {
  onPublishingEnabledHook = typeof fn === "function" ? fn : null;
}

function clearObservationBufferBeforeEnable() {
  for (const key of observationOnlyKeys) {
    permanentlyDiscardedKeys.add(key);
  }
  observationOnlyKeys.clear();
}

function discardCandidatesSeenWhilePublishingDisabled(keys = []) {
  for (const key of keys) {
    permanentlyDiscardedKeys.add(key);
    observationOnlyKeys.delete(key);
  }
}

function markObservationOnly(post) {
  const key = `${post.sourceChannel}:${post.sourceMessageId}`;
  observationOnlyKeys.add(key);
  return key;
}

function wasObservationOnly(post) {
  const key = `${post.sourceChannel}:${post.sourceMessageId}`;
  return observationOnlyKeys.has(key) || permanentlyDiscardedKeys.has(key);
}

function initializeBaselinesFromPosts(posts = []) {
  bootstrapTelegramChannelForAll(posts);
}

function bootstrapTelegramChannelForAll(posts = [], options = {}) {
  const byChannel = new Map();
  for (const post of posts) {
    if (!post.sourceChannel) continue;
    if (!byChannel.has(post.sourceChannel)) byChannel.set(post.sourceChannel, []);
    byChannel.get(post.sourceChannel).push(post);
  }
  for (const channel of TELEGRAM_SOURCE_CHANNELS) {
    const channelPosts = byChannel.get(channel.name) || [];
    bootstrapTelegramChannel(channel.name, channelPosts, options);
    console.log(
      "TELEGRAM_SOURCE_CHECKPOINT_BOOTSTRAP",
      JSON.stringify({
        channel: channel.name,
        posts: channelPosts.length,
      })
    );
  }
}

function completeBaselineFetch() {
  markCheckpointsHydrated();
}

function beginFetchCycle() {
  syncPublishingTransition();
  fetchCycleCount += 1;
}

function isBaselineReadyForPublish() {
  return isHydrated();
}

function isPostNewerThanBaseline(post) {
  if (!post?.sourceChannel) return false;
  return isTelegramMessageNew(post.sourceChannel, post);
}

function isSourceTimePublishable(sourcePublishedAt) {
  if (!minimumPublishableSourceTime || !sourcePublishedAt) {
    return true;
  }
  return new Date(sourcePublishedAt).getTime() >= new Date(minimumPublishableSourceTime).getTime();
}

function isSourcePublishable(post) {
  syncPublishingTransition();

  if (!isPublishingEnabled()) {
    if (post) {
      markObservationOnly(post);
    }
    return { ok: false, reason: "TELEGRAM_NEWS_PUBLISH_DISABLED" };
  }

  if (!isBaselineReadyForPublish()) {
    return { ok: false, reason: "TELEGRAM_CHECKPOINT_NOT_READY" };
  }

  if (post && wasObservationOnly(post)) {
    return { ok: false, reason: "TELEGRAM_OBSERVATION_ONLY_DISCARDED" };
  }

  if (post) {
    const classified = classifyTelegramMessage(post.sourceChannel, post);
    if (!classified.new) {
      return {
        ok: false,
        reason: classified.classification,
        classification: classified.classification,
      };
    }
  }

  if (post && !isSourceTimePublishable(post.sourcePublishedAt)) {
    return { ok: false, reason: "TELEGRAM_NEWS_BACKLOG_SKIPPED" };
  }

  return { ok: true };
}

function updateBaselineAfterPublish(post) {
  if (!post?.sourceChannel) return;
  markTelegramMessageSeen(post.sourceChannel, post, { outcome: "published" });
}

function getPublishStateSnapshot() {
  syncPublishingTransition();
  const { getCheckpointSnapshot } = require("../news-ingestion/checkpoint-store");
  return {
    newsWorkerStartedAt,
    publishingEnabledAt,
    minimumPublishableSourceTime,
    checkpointHydrated: isHydrated(),
    fetchCycleCount,
    publishingEnabled: isPublishingEnabled(),
    checkpoints: getCheckpointSnapshot(),
    observationOnlyCount: observationOnlyKeys.size,
    permanentlyDiscardedCount: permanentlyDiscardedKeys.size,
  };
}

function resetPublishStateForTests() {
  newsWorkerStartedAt = new Date().toISOString();
  publishingEnabledAt = null;
  minimumPublishableSourceTime = null;
  fetchCycleCount = 0;
  lastPublishingEnabled = null;
  observationOnlyKeys.clear();
  permanentlyDiscardedKeys.clear();
}

function configurePublishWindowForTests(options = {}) {
  if (options.publishingEnabledAt) {
    publishingEnabledAt = options.publishingEnabledAt;
  }
  if (options.minimumPublishableSourceTime) {
    minimumPublishableSourceTime = options.minimumPublishableSourceTime;
  } else if (options.publishingEnabledAt) {
    minimumPublishableSourceTime = options.publishingEnabledAt;
  }
  lastPublishingEnabled = true;
}

module.exports = {
  newsWorkerStartedAt,
  isPublishingEnabled,
  syncPublishingTransition,
  clearObservationBufferBeforeEnable,
  discardCandidatesSeenWhilePublishingDisabled,
  markObservationOnly,
  wasObservationOnly,
  initializeBaselinesFromPosts,
  bootstrapTelegramChannelForAll,
  completeBaselineFetch,
  beginFetchCycle,
  isBaselineReadyForPublish,
  isPostNewerThanBaseline,
  isSourceTimePublishable,
  isSourcePublishable,
  updateBaselineAfterPublish,
  getPublishStateSnapshot,
  resetPublishStateForTests,
  parseMessageId,
  setOnPublishingEnabledHook,
  configurePublishWindowForTests,
  classifyTelegramMessage,
};
