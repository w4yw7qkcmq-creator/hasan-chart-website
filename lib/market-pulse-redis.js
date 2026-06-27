import { getUpstashRedis } from "./upstash-redis";
import {
  activateRedisFallback,
  isRedisFailureError,
  shouldUseRedis,
} from "./redis-fallback";

const REDIS_SNAPSHOT_KEY = "hc:market-pulse:snapshot";
const REDIS_SNAPSHOT_TTL_SEC = 30;
const REDIS_WRITE_INTERVAL_MS = 30000;

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

function clearPendingWriteTimer() {
  if (!pendingWriteTimer) return;

  clearTimeout(pendingWriteTimer);
  pendingWriteTimer = null;
}

function getMsUntilNextWriteAllowed() {
  if (!lastWrittenAt) return 0;

  return Math.max(0, REDIS_WRITE_INTERVAL_MS - (Date.now() - lastWrittenAt));
}

function scheduleMarketPulseFlush() {
  if (!shouldUseRedis()) return;

  clearPendingWriteTimer();

  const delayMs = getMsUntilNextWriteAllowed();
  pendingWriteTimer = setTimeout(() => {
    pendingWriteTimer = null;
    void flushMarketPulseSnapshot();
  }, delayMs);
}

async function flushMarketPulseSnapshot() {
  if (!shouldUseRedis()) return;

  if (writeInFlight) {
    scheduleMarketPulseFlush();
    return;
  }

  if (!pendingSnapshot) return;

  if (lastWrittenAt > 0 && Date.now() - lastWrittenAt < REDIS_WRITE_INTERVAL_MS) {
    scheduleMarketPulseFlush();
    return;
  }

  if (lastWrittenPrices && pricesEqual(lastWrittenPrices, pendingSnapshot.prices)) {
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

    if (pendingSnapshot) {
      scheduleMarketPulseFlush();
    }
  }
}

export function queueMarketPulseSnapshotWrite(snapshot) {
  if (!shouldUseRedis()) return;

  pendingSnapshot = snapshot;

  if (lastWrittenPrices && pricesEqual(lastWrittenPrices, snapshot.prices)) {
    return;
  }

  scheduleMarketPulseFlush();
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
