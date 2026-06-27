const READ_MEMORY_CACHE_MS = 30000;

function getMarketPulseReadCache() {
  if (!globalThis.__hcMarketPulseReadCache) {
    globalThis.__hcMarketPulseReadCache = {
      snapshot: null,
      expiresAt: 0,
    };
  }

  return globalThis.__hcMarketPulseReadCache;
}

function toSharedSnapshot(snapshot) {
  return {
    ...snapshot,
    source: "memory-shared",
  };
}

function setMarketPulseReadCache(snapshot) {
  const readCache = getMarketPulseReadCache();
  readCache.snapshot = toSharedSnapshot(snapshot);
  readCache.expiresAt = Date.now() + READ_MEMORY_CACHE_MS;
}

export function queueMarketPulseSnapshotWrite(snapshot) {
  setMarketPulseReadCache(snapshot);
}

export async function readMarketPulseSnapshot() {
  const readCache = getMarketPulseReadCache();
  const now = Date.now();

  if (readCache.snapshot && readCache.expiresAt > now) {
    return readCache.snapshot;
  }

  return null;
}
