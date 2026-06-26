import { getUpstashRedis } from "./upstash-redis";
import {
  activateRedisFallback,
  isRedisFailureError,
  shouldUseRedis,
} from "./redis-fallback";

const globalForCache = globalThis;
const REDIS_KEY_PREFIX = "hc:read-cache:";

function getMemoryStore() {
  if (!globalForCache.__hcReadApiCache) {
    globalForCache.__hcReadApiCache = new Map();
  }
  return globalForCache.__hcReadApiCache;
}

function getRedisCacheKey(cacheKey) {
  return `${REDIS_KEY_PREFIX}${cacheKey}`;
}

async function readRedisCacheEntry(cacheKey) {
  if (!shouldUseRedis()) return null;

  const redis = getUpstashRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get(getRedisCacheKey(cacheKey));
    if (!raw) return null;

    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || parsed.expiresAt <= Date.now()) return null;

    return parsed.data;
  } catch (error) {
    if (isRedisFailureError(error)) {
      activateRedisFallback(error?.message || "redis read cache failed");
    }

    return null;
  }
}

async function writeRedisCacheEntry(cacheKey, data, ttlMs) {
  if (!shouldUseRedis()) return;

  const redis = getUpstashRedis();
  if (!redis) return;

  try {
    await redis.set(
      getRedisCacheKey(cacheKey),
      JSON.stringify({
        data,
        expiresAt: Date.now() + ttlMs,
      }),
      {
        ex: Math.max(1, Math.ceil(ttlMs / 1000)),
      }
    );
  } catch (error) {
    if (isRedisFailureError(error)) {
      activateRedisFallback(error?.message || "redis write cache failed");
    }
  }
}

async function invalidateRedisCachePrefix(prefix) {
  if (!shouldUseRedis()) return;

  const redis = getUpstashRedis();
  if (!redis) return;

  try {
    const keys = await redis.keys(`${REDIS_KEY_PREFIX}${prefix}*`);
    if (Array.isArray(keys) && keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    if (isRedisFailureError(error)) {
      activateRedisFallback(error?.message || "redis cache invalidation failed");
    }
  }
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
      storage: entry.storage || "memory",
    };
  }

  if (shouldUseRedis()) {
    const redisData = await readRedisCacheEntry(cacheKey);
    if (redisData !== null) {
      store.set(cacheKey, {
        data: redisData,
        expiresAt: now + ttlMs,
        inFlight: null,
        storage: "redis",
      });

      return {
        data: redisData,
        cacheHit: true,
        stale: false,
        storage: "redis",
      };
    }
  }

  if (entry.inFlight) {
    const data = await entry.inFlight;
    return {
      data,
      cacheHit: true,
      stale: entry.expiresAt <= now,
      storage: entry.storage || "memory",
    };
  }

  const inFlight = (async () => {
    try {
      const data = await fetcher();
      const expiresAt = Date.now() + ttlMs;

      store.set(cacheKey, {
        data,
        expiresAt,
        inFlight: null,
        storage: shouldUseRedis() ? "redis+memory" : "memory",
      });

      if (shouldUseRedis()) {
        await writeRedisCacheEntry(cacheKey, data, ttlMs);
      }

      return data;
    } catch (error) {
      const current = store.get(cacheKey) || {};
      store.set(cacheKey, { ...current, inFlight: null });

      if (current.data !== undefined) {
        return current.data;
      }

      if (shouldUseRedis()) {
        const redisData = await readRedisCacheEntry(cacheKey);
        if (redisData !== null) {
          return redisData;
        }
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
    storage: shouldUseRedis() ? "redis+memory" : "memory",
  };
}

export function invalidateReadCache(prefix) {
  const store = getMemoryStore();

  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }

  if (shouldUseRedis()) {
    void invalidateRedisCachePrefix(prefix);
  }
}

export function invalidateReadCacheKey(cacheKey) {
  getMemoryStore().delete(cacheKey);

  if (!shouldUseRedis()) return;

  const redis = getUpstashRedis();
  if (redis) {
    void redis.del(getRedisCacheKey(cacheKey)).catch((error) => {
      if (isRedisFailureError(error)) {
        activateRedisFallback(error?.message || "redis cache delete failed");
      }
    });
  }
}
