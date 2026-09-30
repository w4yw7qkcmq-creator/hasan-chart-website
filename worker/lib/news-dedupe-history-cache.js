const DEFAULT_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_FAILURE_BACKOFF_MS = 60 * 1000;
const DEFAULT_LIMIT = 200;

function createDedupeHistoryCache(options = {}) {
  const refreshIntervalMs = options.refreshIntervalMs || DEFAULT_REFRESH_INTERVAL_MS;
  const failureBackoffMs = options.failureBackoffMs || DEFAULT_FAILURE_BACKOFF_MS;
  const limit = options.limit || DEFAULT_LIMIT;
  const now = options.now || (() => Date.now());
  const loadHistory = options.loadHistory;

  const state = {
    hydrated: false,
    publishedItems: [],
    newsPostItems: [],
    refreshedAt: 0,
    retryAfter: 0,
    inFlight: null,
    epoch: 0,
    fetchCount: 0,
    lastError: null,
  };

  function prependBounded(list, item) {
    const link = item && item.link ? item.link : "";
    const rest = link ? list.filter((entry) => entry.link !== link) : list.slice();
    return [item, ...rest].slice(0, limit);
  }

  function note(listName, item) {
    if (!item || typeof item !== "object") return;
    state.epoch += 1;
    state[listName] = prependBounded(state[listName], item);
  }

  async function refresh(currentNow) {
    const epochAtStart = state.epoch;
    const previousPublished = state.publishedItems;
    const previousPosts = state.newsPostItems;
    state.fetchCount += 1;

    try {
      const loaded = await loadHistory();
      if (!loaded || loaded.ok === false) {
        throw new Error((loaded && loaded.error) || "dedupe_history_refresh_failed");
      }

      const publishedItems = (loaded.publishedItems || []).slice(0, limit);
      const newsPostItems = (loaded.newsPostItems || []).slice(0, limit);
      const notedPublished =
        state.epoch === epochAtStart
          ? []
          : state.publishedItems.filter(
              (item) => item && item.link && !publishedItems.some((row) => row.link === item.link)
            );
      const notedPosts =
        state.epoch === epochAtStart
          ? []
          : state.newsPostItems.filter(
              (item) => item && item.link && !newsPostItems.some((row) => row.link === item.link)
            );

      state.publishedItems = [...notedPublished, ...publishedItems].slice(0, limit);
      state.newsPostItems = [...notedPosts, ...newsPostItems].slice(0, limit);
      state.hydrated = true;
      state.refreshedAt = currentNow;
      state.retryAfter = 0;
      state.lastError = null;
    } catch (error) {
      if (state.epoch === epochAtStart) {
        state.publishedItems = previousPublished;
        state.newsPostItems = previousPosts;
      }
      state.retryAfter = currentNow + failureBackoffMs;
      state.lastError = error.message;
    }
  }

  async function ensureFresh() {
    const currentNow = now();
    if (state.inFlight) return state.inFlight;

    const withinInterval =
      state.hydrated && currentNow < state.refreshedAt + refreshIntervalMs;
    if (withinInterval || currentNow < state.retryAfter) {
      return state;
    }

    const run = refresh(currentNow);
    state.inFlight = run;
    try {
      await run;
    } finally {
      if (state.inFlight === run) state.inFlight = null;
    }
    return state;
  }

  return {
    ensureFresh,
    async getPublishedItems() {
      await ensureFresh();
      return state.publishedItems.slice();
    },
    async getNewsPostItems() {
      await ensureFresh();
      return state.newsPostItems.slice();
    },
    notePublishedItem(item) {
      note("publishedItems", item);
    },
    noteNewsPostItem(item) {
      note("newsPostItems", item);
    },
    getStats() {
      return {
        hydrated: state.hydrated,
        fetchCount: state.fetchCount,
        publishedCount: state.publishedItems.length,
        newsPostCount: state.newsPostItems.length,
        lastError: state.lastError,
        refreshedAt: state.refreshedAt,
      };
    },
  };
}

module.exports = {
  DEFAULT_REFRESH_INTERVAL_MS,
  DEFAULT_FAILURE_BACKOFF_MS,
  DEFAULT_LIMIT,
  createDedupeHistoryCache,
};
