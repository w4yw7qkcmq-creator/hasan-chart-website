import { getUpstashRedis, isUpstashEnvConfigured } from "./upstash-redis";

const REDIS_SNAPSHOT_KEY = "hc:market-pulse:snapshot";
const REDIS_SNAPSHOT_TTL_SEC = 10;

export async function writeMarketPulseSnapshot(snapshot) {
  if (!isUpstashEnvConfigured()) return;

  const redis = getUpstashRedis();
  if (!redis) return;

  try {
    await redis.set(REDIS_SNAPSHOT_KEY, JSON.stringify(snapshot), {
      ex: REDIS_SNAPSHOT_TTL_SEC,
    });
  } catch (error) {
    console.warn("Redis market pulse write skipped:", error?.message || error);
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
    console.warn("Redis market pulse read skipped:", error?.message || error);
    return null;
  }
}
