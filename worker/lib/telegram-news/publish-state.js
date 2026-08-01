const { TELEGRAM_SOURCE_CHANNELS } = require("./sources");

let newsWorkerStartedAt = new Date().toISOString();
let publishingEnabledAt = null;
let minimumPublishableSourceTime = null;
let baselineInitialized = false;
let baselineFetchDone = false;
let firstFetchCompleted = false;
let fetchCycleCount = 0;
let lastPublishingEnabled = null;
let onPublishingEnabledHook = null;

function setOnPublishingEnabledHook(fn) {
  onPublishingEnabledHook = typeof fn === "function" ? fn : null;
}

/** @type {Map<string, { latestMessageId: number, latestPublishedAt: string|null }>} */
const channelBaselines = new Map();

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

function parseMessageId(value) {
  const raw = String(value || "").split(":")[0];
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
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
  for (const post of posts) {
    const channel = post.sourceChannel;
    if (!channel) {
      continue;
    }
    const messageId = parseMessageId(post.sourceMessageId);
    const current = channelBaselines.get(channel);
    if (!current || messageId > current.latestMessageId) {
      channelBaselines.set(channel, {
        latestMessageId: messageId,
        latestPublishedAt: post.sourcePublishedAt || null,
      });
    }
  }

  baselineInitialized = true;
  for (const channel of TELEGRAM_SOURCE_CHANNELS) {
    const baseline = channelBaselines.get(channel.name);
    console.log(
      "TELEGRAM_SOURCE_BASELINE_INITIALIZED",
      JSON.stringify({
        channel: channel.name,
        latestMessageId: baseline?.latestMessageId ?? null,
        latestPublishedAt: baseline?.latestPublishedAt ?? null,
      })
    );
  }
}

function completeBaselineFetch() {
  baselineFetchDone = true;
  firstFetchCompleted = true;
}

function beginFetchCycle() {
  syncPublishingTransition();
  fetchCycleCount += 1;
}

function isBaselineReadyForPublish() {
  return baselineFetchDone;
}

function isPostNewerThanBaseline(post) {
  if (!baselineInitialized) {
    return false;
  }
  const baseline = channelBaselines.get(post.sourceChannel);
  if (!baseline) {
    return true;
  }
  return parseMessageId(post.sourceMessageId) > baseline.latestMessageId;
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
    return { ok: false, reason: "TELEGRAM_BASELINE_FETCH" };
  }

  if (post && wasObservationOnly(post)) {
    return { ok: false, reason: "TELEGRAM_OBSERVATION_ONLY_DISCARDED" };
  }

  if (post && !isPostNewerThanBaseline(post)) {
    return { ok: false, reason: "TELEGRAM_NEWS_BACKLOG_SKIPPED" };
  }

  if (post && !isSourceTimePublishable(post.sourcePublishedAt)) {
    return { ok: false, reason: "TELEGRAM_NEWS_BACKLOG_SKIPPED" };
  }

  return { ok: true };
}

function updateBaselineAfterPublish(post) {
  if (!post?.sourceChannel) {
    return;
  }
  const messageId = parseMessageId(post.sourceMessageId);
  const current = channelBaselines.get(post.sourceChannel);
  if (!current || messageId > current.latestMessageId) {
    channelBaselines.set(post.sourceChannel, {
      latestMessageId: messageId,
      latestPublishedAt: post.sourcePublishedAt || new Date().toISOString(),
    });
  }
}

function getPublishStateSnapshot() {
  syncPublishingTransition();
  return {
    newsWorkerStartedAt,
    publishingEnabledAt,
    minimumPublishableSourceTime,
    baselineFetchDone,
    fetchCycleCount,
    publishingEnabled: isPublishingEnabled(),
    channelBaselines: Object.fromEntries(channelBaselines.entries()),
    observationOnlyCount: observationOnlyKeys.size,
    permanentlyDiscardedCount: permanentlyDiscardedKeys.size,
  };
}

function resetPublishStateForTests() {
  newsWorkerStartedAt = new Date().toISOString();
  publishingEnabledAt = null;
  minimumPublishableSourceTime = null;
  baselineInitialized = false;
  baselineFetchDone = false;
  firstFetchCompleted = false;
  fetchCycleCount = 0;
  lastPublishingEnabled = null;
  channelBaselines.clear();
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
};
