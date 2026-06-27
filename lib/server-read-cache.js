const globalForCache = globalThis;
const MEMORY_STALE_GRACE_MS = 30000;

function getMemoryStore() {
  if (!globalForCache.__hcReadApiCache) {
    globalForCache.__hcReadApiCache = new Map();
  }
  return globalForCache.__hcReadApiCache;
}

function rememberMemoryEntry(store, cacheKey, data, ttlMs) {
  store.set(cacheKey, {
    data,
    expiresAt: Date.now() + ttlMs,
    inFlight: null,
    storage: "memory",
  });
}

export async function withReadCache(cacheKey, ttlMs, fetcher) {
  const store = getMemoryStore();
  const now = Date.now();
  const entry = store.get(cacheKey) || {};

  if (entry.data !== undefined && entry.expiresAt > now) {
    return {
      data: entry.data,
      cacheHit: true,
      stale: false,
      storage: "memory",
    };
  }

  if (
    entry.data !== undefined &&
    now - entry.expiresAt <= MEMORY_STALE_GRACE_MS
  ) {
    if (!entry.inFlight) {
      entry.inFlight = (async () => {
        try {
          const data = await fetcher();
          rememberMemoryEntry(store, cacheKey, data, ttlMs);
          return data;
        } catch {
          return entry.data;
        } finally {
          const current = store.get(cacheKey) || {};
          store.set(cacheKey, { ...current, inFlight: null });
        }
      })();
    }

    return {
      data: entry.data,
      cacheHit: true,
      stale: true,
      storage: "memory-stale",
    };
  }

  if (entry.inFlight) {
    const data = await entry.inFlight;
    return {
      data,
      cacheHit: true,
      stale: entry.expiresAt <= now,
      storage: "memory",
    };
  }

  const inFlight = (async () => {
    try {
      const data = await fetcher();
      rememberMemoryEntry(store, cacheKey, data, ttlMs);
      return data;
    } catch (error) {
      const current = store.get(cacheKey) || {};
      store.set(cacheKey, { ...current, inFlight: null });

      if (current.data !== undefined) {
        return current.data;
      }

      throw error;
    }
  })();

  store.set(cacheKey, {
    ...entry,
    inFlight,
  });

  const data = await inFlight;

  return {
    data,
    cacheHit: false,
    stale: false,
    storage: "memory",
  };
}

export function invalidateReadCache(prefix) {
  const store = getMemoryStore();

  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

export function invalidateReadCacheKey(cacheKey) {
  getMemoryStore().delete(cacheKey);
}
