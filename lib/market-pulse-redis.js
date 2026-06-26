import { getUpstashRedis } from "./upstash-redis";
import {
  activateRedisFallback,
  isRedisFailureError,
  shouldUseRedis,
} from "./redis-fallback";

const REDIS_SNAPSHOT_KEY = "hc:market-pulse:snapshot";
const REDIS_SNAPSHOT_TTL_SEC = 30;
const REDIS_WRITE_INTERVAL_MS = 10000;

let lastWrittenPrices = null;
let lastWrittenAt = 0;
let pendingSnapshot = null;
let pendingWriteTimer = null;
let writeInFlight = false;
let redisWritesThisMinute = 0;
let redisWriteMinuteStartedAt = Date.now();

function pricesEqual(left, right) {
  if (!left || !right) return false;
  return (
    left.BTCUSDT === right.BTCUSDT &&
    left.ETHUSDT === right.ETHUSDT &&
    left.SOLUSDT === right.SOLUSDT
  );
}

function trackRedisWrite() {
  const now = Date.now();

  if (now - redisWriteMinuteStartedAt >= 60000) {
    console.log("marketStream: redis writes per minute", {
      timestamp: new Date().toISOString(),
      count: redisWritesThisMinute,
    });
    redisWritesThisMinute = 0;
    redisWriteMinuteStartedAt = now;
  }

  redisWritesThisMinute += 1;
}

async function flushMarketPulseSnapshot() {
  pendingWriteTimer = null;

  if (writeInFlight || !pendingSnapshot || !shouldUseRedis()) {
    pendingSnapshot = null;
    return;
  }

  const redis = getUpstashRedis();
  if (!redis) {
    pendingSnapshot = null;
    return;
  }

  const snapshot = pendingSnapshot;
  pendingSnapshot = null;

  if (lastWrittenPrices && pricesEqual(lastWrittenPrices, snapshot.prices)) {
    return;
  }

  writeInFlight = true;

  try {
    await redis.set(REDIS_SNAPSHOT_KEY, JSON.stringify(snapshot), {
      ex: REDIS_SNAPSHOT_TTL_SEC,
    });

    lastWrittenPrices = { ...snapshot.prices };
    lastWrittenAt = Date.now();
    trackRedisWrite();

    console.log("marketStream: snapshot saved", {
      timestamp: new Date().toISOString(),
      provider: snapshot?.provider || "okx",
      status: snapshot?.status || "unknown",
      stale: Boolean(snapshot?.stale),
      updatedAt: snapshot?.updatedAt || null,
    });
  } catch (error) {
    if (isRedisFailureError(error)) {
      activateRedisFallback(error?.message || "redis-write failed");
    }
  } finally {
    writeInFlight = false;
  }
}

export function queueMarketPulseSnapshotWrite(snapshot) {
  if (!shouldUseRedis() || writeInFlight) return;

  pendingSnapshot = snapshot;

  if (lastWrittenPrices && pricesEqual(lastWrittenPrices, snapshot.prices)) {
    return;
  }

  const elapsed = Date.now() - lastWrittenAt;
  if (elapsed >= REDIS_WRITE_INTERVAL_MS) {
    void flushMarketPulseSnapshot();
    return;
  }

  if (pendingWriteTimer) return;

  pendingWriteTimer = setTimeout(() => {
    void flushMarketPulseSnapshot();
  }, REDIS_WRITE_INTERVAL_MS - elapsed);
}

export async function readMarketPulseSnapshot() {
  if (!shouldUseRedis()) return null;

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
    if (isRedisFailureError(error)) {
      activateRedisFallback(error?.message || "redis-read failed");
    }

    return null;
  }
}
