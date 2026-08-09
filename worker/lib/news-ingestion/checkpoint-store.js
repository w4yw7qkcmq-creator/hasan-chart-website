const { TELEGRAM_SOURCE_CHANNELS } = require("../telegram-news/sources");
const { parseMessageId } = require("../telegram-news/message-id");
const { buildRssItemIdentity, getRssItemPublishedAtMs, normalizeLink } = require("./rss-item-identity");

const SOURCE_TYPES = Object.freeze({
  RSS: "rss",
  TELEGRAM: "telegram",
});

const CURSOR_TYPES = Object.freeze({
  RSS_ITEM_IDENTITY: "rss_item_identity",
  TELEGRAM_MESSAGE_ID: "telegram_message_id",
});

const MAX_RECENT_SEEN = 500;
const DEFAULT_BOOTSTRAP_MAX_AGE_HOURS = 24;

/** @type {Map<string, object>} */
const memory = new Map();
let hydrated = false;
let dirtyKeys = new Set();

function sourceKey(sourceType, sourceId) {
  return `${sourceType}:${sourceId}`;
}

function emptyRssState() {
  return {
    cursorType: CURSOR_TYPES.RSS_ITEM_IDENTITY,
    bootstrapped: false,
    highestObservedAtMs: null,
    recentSeenKeys: [],
  };
}

function emptyTelegramState() {
  return {
    cursorType: CURSOR_TYPES.TELEGRAM_MESSAGE_ID,
    bootstrapped: false,
    highestMessageId: 0,
    recentSeenKeys: [],
  };
}

function trimRecentSeen(keys = []) {
  if (keys.length <= MAX_RECENT_SEEN) return keys;
  return keys.slice(keys.length - MAX_RECENT_SEEN);
}

function addRecentSeen(state, key) {
  if (!key) return;
  const set = new Set(state.recentSeenKeys || []);
  set.delete(key);
  set.add(key);
  state.recentSeenKeys = trimRecentSeen([...set]);
}

function rowToState(row) {
  const cursor = row.cursor_value || {};
  const recent = row.recent_seen_metadata || {};
  if (row.cursor_type === CURSOR_TYPES.TELEGRAM_MESSAGE_ID) {
    return {
      cursorType: CURSOR_TYPES.TELEGRAM_MESSAGE_ID,
      bootstrapped: Boolean(row.bootstrapped_at),
      highestMessageId: Number(cursor.highestMessageId || 0),
      recentSeenKeys: Array.isArray(recent.recentSeenKeys) ? recent.recentSeenKeys.slice(-MAX_RECENT_SEEN) : [],
      lastObservedAt: row.last_observed_at || null,
    };
  }
  return {
    cursorType: CURSOR_TYPES.RSS_ITEM_IDENTITY,
    bootstrapped: Boolean(row.bootstrapped_at),
    highestObservedAtMs: cursor.highestObservedAtMs ?? null,
    recentSeenKeys: Array.isArray(recent.recentSeenKeys) ? recent.recentSeenKeys.slice(-MAX_RECENT_SEEN) : [],
    lastObservedAt: row.last_observed_at || null,
  };
}

function stateToRow(sourceType, sourceId, state) {
  const key = sourceKey(sourceType, sourceId);
  const now = new Date().toISOString();
  if (state.cursorType === CURSOR_TYPES.TELEGRAM_MESSAGE_ID) {
    return {
      source_key: key,
      source_type: sourceType,
      source_id: sourceId,
      cursor_type: CURSOR_TYPES.TELEGRAM_MESSAGE_ID,
      cursor_value: { highestMessageId: state.highestMessageId || 0 },
      recent_seen_metadata: { recentSeenKeys: state.recentSeenKeys || [] },
      last_observed_at: state.lastObservedAt || now,
      bootstrapped_at: state.bootstrapped ? state.bootstrappedAt || now : null,
      updated_at: now,
    };
  }
  return {
    source_key: key,
    source_type: sourceType,
    source_id: sourceId,
    cursor_type: CURSOR_TYPES.RSS_ITEM_IDENTITY,
    cursor_value: { highestObservedAtMs: state.highestObservedAtMs ?? null },
    recent_seen_metadata: { recentSeenKeys: state.recentSeenKeys || [] },
    last_observed_at: state.lastObservedAt || now,
    bootstrapped_at: state.bootstrapped ? state.bootstrappedAt || now : null,
    updated_at: now,
  };
}

function getRssState(sourceId) {
  const key = sourceKey(SOURCE_TYPES.RSS, sourceId);
  if (!memory.has(key)) memory.set(key, emptyRssState());
  return memory.get(key);
}

function getTelegramState(channel) {
  const key = sourceKey(SOURCE_TYPES.TELEGRAM, channel);
  if (!memory.has(key)) memory.set(key, emptyTelegramState());
  return memory.get(key);
}

function markDirty(sourceType, sourceId) {
  dirtyKeys.add(sourceKey(sourceType, sourceId));
}

function isRssItemSeen(sourceId, item) {
  const identity = buildRssItemIdentity(item);
  if (!identity) return false;
  const state = getRssState(sourceId);
  return (state.recentSeenKeys || []).includes(identity);
}

function isRssItemNew(sourceId, item) {
  return !isRssItemSeen(sourceId, item);
}

function markRssItemSeen(sourceId, item, { outcome } = {}) {
  const identity = buildRssItemIdentity(item);
  if (!identity) return { marked: false, reason: "missing_identity" };
  const state = getRssState(sourceId);
  addRecentSeen(state, identity);
  const publishedAtMs = getRssItemPublishedAtMs(item);
  if (publishedAtMs != null) {
    if (state.highestObservedAtMs == null || publishedAtMs > state.highestObservedAtMs) {
      state.highestObservedAtMs = publishedAtMs;
    }
  }
  state.lastObservedAt = new Date().toISOString();
  markDirty(SOURCE_TYPES.RSS, sourceId);
  return { marked: true, identity, outcome: outcome || null };
}

function bootstrapRssSource(sourceId, items = [], options = {}) {
  const state = getRssState(sourceId);
  if (state.bootstrapped) return { alreadyBootstrapped: true, marked: 0, evaluate: 0 };

  const nowMs = options.nowMs || Date.now();
  const maxAgeMs = (options.maxAgeHours ?? DEFAULT_BOOTSTRAP_MAX_AGE_HOURS) * 60 * 60 * 1000;
  const publishedLinks = options.publishedLinks || new Set();
  let marked = 0;
  let evaluate = 0;

  for (const item of items) {
    const identity = buildRssItemIdentity(item);
    if (!identity) continue;
    const link = normalizeLink(item.link || "");
    const publishedAtMs = getRssItemPublishedAtMs(item);
    const tooOld = publishedAtMs != null && nowMs - publishedAtMs > maxAgeMs;
    const alreadyPublished = link && publishedLinks.has(link);

    if (alreadyPublished || tooOld) {
      markRssItemSeen(sourceId, item, { outcome: alreadyPublished ? "bootstrap_published" : "bootstrap_stale" });
      marked += 1;
    } else {
      evaluate += 1;
    }
  }

  state.bootstrapped = true;
  state.bootstrappedAt = new Date().toISOString();
  markDirty(SOURCE_TYPES.RSS, sourceId);
  return { alreadyBootstrapped: false, marked, evaluate };
}

function isTelegramMessageNew(channel, post) {
  const messageId = parseMessageId(post?.sourceMessageId);
  const state = getTelegramState(channel);
  const key = `msg:${messageId}`;
  if ((state.recentSeenKeys || []).includes(key)) return false;
  if (messageId > 0 && messageId <= state.highestMessageId) return false;
  return true;
}

function classifyTelegramMessage(channel, post) {
  const messageId = parseMessageId(post?.sourceMessageId);
  const state = getTelegramState(channel);
  const isPinned = Boolean(post?.isPinned);
  const key = `msg:${messageId}`;

  if ((state.recentSeenKeys || []).includes(key)) {
    return { classification: isPinned ? "PINNED_OLD_MESSAGE" : "OLD_SEEN_MESSAGE", messageId, new: false };
  }
  if (messageId > 0 && messageId <= state.highestMessageId) {
    return { classification: isPinned ? "PINNED_OLD_MESSAGE" : "OLD_SEEN_MESSAGE", messageId, new: false };
  }
  return { classification: "NEW_MESSAGE", messageId, new: true };
}

function markTelegramMessageSeen(channel, post, { outcome } = {}) {
  const messageId = parseMessageId(post?.sourceMessageId);
  if (!messageId) return { marked: false };
  const state = getTelegramState(channel);
  addRecentSeen(state, `msg:${messageId}`);
  if (messageId > state.highestMessageId) {
    state.highestMessageId = messageId;
  }
  state.lastObservedAt = new Date().toISOString();
  markDirty(SOURCE_TYPES.TELEGRAM, channel);
  return { marked: true, messageId, outcome: outcome || null };
}

function bootstrapTelegramChannel(channel, posts = [], options = {}) {
  const state = getTelegramState(channel);
  if (state.bootstrapped) return { alreadyBootstrapped: true, marked: 0, evaluate: 0 };

  const nowMs = options.nowMs || Date.now();
  const maxAgeMs = (options.maxAgeHours ?? DEFAULT_BOOTSTRAP_MAX_AGE_HOURS) * 60 * 60 * 1000;
  const publishedKeys = options.publishedKeys || new Set();
  let marked = 0;
  let evaluate = 0;

  for (const post of posts) {
    const messageId = parseMessageId(post.sourceMessageId);
    const key = `${channel}:${messageId}`;
    const publishedAtMs = new Date(post.sourcePublishedAt || 0).getTime();
    const tooOld = Number.isFinite(publishedAtMs) && nowMs - publishedAtMs > maxAgeMs;
    const alreadyPublished = publishedKeys.has(key);

    if (alreadyPublished || tooOld) {
      markTelegramMessageSeen(channel, post, {
        outcome: alreadyPublished ? "bootstrap_published" : "bootstrap_stale",
      });
      marked += 1;
    } else {
      evaluate += 1;
    }
  }

  state.bootstrapped = true;
  state.bootstrappedAt = new Date().toISOString();
  markDirty(SOURCE_TYPES.TELEGRAM, channel);
  return { alreadyBootstrapped: false, marked, evaluate };
}

async function hydrateFromDb(supabase) {
  memory.clear();
  dirtyKeys.clear();
  hydrated = false;
  if (!supabase) {
    hydrated = true;
    return { loaded: 0, skipped: true };
  }
  try {
    const { data, error } = await supabase.from("news_source_ingestion_checkpoints").select("*");
    if (error) throw error;
    for (const row of data || []) {
      memory.set(row.source_key, rowToState(row));
    }
    hydrated = true;
    return { loaded: (data || []).length };
  } catch (error) {
    console.error("NEWS_CHECKPOINT_HYDRATE_FAILED", JSON.stringify({ error: error.message }));
    hydrated = true;
    return { loaded: 0, error: error.message };
  }
}

async function flushDirtyToDb(supabase) {
  if (!supabase || !dirtyKeys.size) return { flushed: 0 };
  let flushed = 0;
  const keys = [...dirtyKeys];
  dirtyKeys.clear();
  for (const key of keys) {
    const state = memory.get(key);
    if (!state) continue;
    const [sourceType, ...rest] = key.split(":");
    const sourceId = rest.join(":");
    const row = stateToRow(sourceType, sourceId, state);
    try {
      const { error } = await supabase
        .from("news_source_ingestion_checkpoints")
        .upsert(row, { onConflict: "source_key" });
      if (error) throw error;
      flushed += 1;
    } catch (error) {
      dirtyKeys.add(key);
      console.error("NEWS_CHECKPOINT_PERSIST_FAILED", JSON.stringify({ key, error: error.message }));
    }
  }
  return { flushed };
}

function bootstrapAllRssSources(items = [], options = {}) {
  const bySource = new Map();
  for (const item of items) {
    const sourceId = item.sourceName || item.sourceFeed || "unknown";
    if (!bySource.has(sourceId)) bySource.set(sourceId, []);
    bySource.get(sourceId).push(item);
  }
  const results = {};
  for (const [sourceId, sourceItems] of bySource.entries()) {
    results[sourceId] = bootstrapRssSource(sourceId, sourceItems, options);
  }
  return results;
}

function bootstrapAllTelegramSources(posts = [], options = {}) {
  const byChannel = new Map();
  for (const post of posts) {
    const channel = post.sourceChannel;
    if (!channel) continue;
    if (!byChannel.has(channel)) byChannel.set(channel, []);
    byChannel.get(channel).push(post);
  }
  for (const channel of TELEGRAM_SOURCE_CHANNELS) {
    if (!byChannel.has(channel.name)) byChannel.set(channel.name, []);
  }
  const results = {};
  for (const [channel, channelPosts] of byChannel.entries()) {
    results[channel] = bootstrapTelegramChannel(channel, channelPosts, options);
  }
  return results;
}

function resetCheckpointStoreForTests() {
  memory.clear();
  dirtyKeys.clear();
  hydrated = false;
}

function isHydrated() {
  return hydrated;
}

function markCheckpointsHydrated() {
  hydrated = true;
}

function getCheckpointSnapshot() {
  return {
    hydrated,
    sources: Object.fromEntries(
      [...memory.entries()].map(([key, state]) => [
        key,
        {
          bootstrapped: state.bootstrapped,
          recentSeenCount: (state.recentSeenKeys || []).length,
          highestMessageId: state.highestMessageId ?? null,
          highestObservedAtMs: state.highestObservedAtMs ?? null,
        },
      ])
    ),
  };
}

module.exports = {
  SOURCE_TYPES,
  CURSOR_TYPES,
  MAX_RECENT_SEEN,
  DEFAULT_BOOTSTRAP_MAX_AGE_HOURS,
  sourceKey,
  isRssItemNew,
  isRssItemSeen,
  markRssItemSeen,
  bootstrapRssSource,
  bootstrapAllRssSources,
  isTelegramMessageNew,
  classifyTelegramMessage,
  markTelegramMessageSeen,
  bootstrapTelegramChannel,
  bootstrapAllTelegramSources,
  hydrateFromDb,
  flushDirtyToDb,
  resetCheckpointStoreForTests,
  isHydrated,
  markCheckpointsHydrated,
  getCheckpointSnapshot,
  getRssState,
  getTelegramState,
};
