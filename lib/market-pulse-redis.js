import { getUpstashRedis, isUpstashEnvConfigured } from "./upstash-redis";

const REDIS_SNAPSHOT_KEY = "hc:market-pulse:snapshot";
const REDIS_SNAPSHOT_TTL_SEC = 10;

let lastRedisSaveLogAt = 0;

export async function writeMarketPulseSnapshot(snapshot) {
  if (!isUpstashEnvConfigured()) return;

  const redis = getUpstashRedis();
  if (!redis) return;

  try {
    await redis.set(REDIS_SNAPSHOT_KEY, JSON.stringify(snapshot), {
      ex: REDIS_SNAPSHOT_TTL_SEC,
    });

    const now = Date.now();
    if (now - lastRedisSaveLogAt >= 30000) {
      lastRedisSaveLogAt = now;
      console.log("marketStream: snapshot saved to Redis", {
        timestamp: new Date().toISOString(),
        status: snapshot?.status || "unknown",
        stale: Boolean(snapshot?.stale),
        updatedAt: snapshot?.updatedAt || null,
      });
    }
  } catch (error) {
    console.log("marketStream: error", {
      timestamp: new Date().toISOString(),
      phase: "redis-write",
      message: error?.message || String(error),
    });
  }
}

export async function readMarketPulseSnapshot() {
  if (!isUpstashEnvConfigured()) return null;

  const redis = getUpstashRedis();
  if (!redis) return null;

  try {
    const raw = await redis.get(REDIS_SNAPSHOT_KEY);
    if (!raw) return null;

    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed?.prices) return null;

    return {
      ...parsed,
      source: "redis-shared",
    };
  } catch (error) {
    console.log("marketStream: error", {
      timestamp: new Date().toISOString(),
      phase: "redis-read",
      message: error?.message || String(error),
    });
    return null;
  }
}
