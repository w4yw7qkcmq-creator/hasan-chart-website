import { getUpstashRedis } from "./upstash-redis";
import {
  activateRedisFallback,
  isRedisFailureError,
  shouldUseRedis,
} from "./redis-fallback";

const REDIS_SNAPSHOT_KEY = "hc:market-pulse:snapshot";
const REDIS_SNAPSHOT_TTL_SEC = 30;
const REDIS_WRITE_INTERVAL_MS = 30000;

function getMarketPulseWriteState() {
  if (!globalThis.__hcMarketPulseWriteState) {
    globalThis.__hcMarketPulseWriteState = {
      lastWrittenPrices: null,
      nextWriteAllowedAt: 0,
      pendingSnapshot: null,
      pendingWriteTimer: null,
      writeInFlight: false,
      redisWritesThisMinute: 0,
      redisWriteMinuteStartedAt: Date.now(),
    };
  }

  return globalThis.__hcMarketPulseWriteState;
}

function pricesEqual(left, right) {
  if (!left || !right) return false;
  return (
    left.BTCUSDT === right.BTCUSDT &&
    left.ETHUSDT === right.ETHUSDT &&
    left.SOLUSDT === right.SOLUSDT
  );
}

function trackRedisWrite(state) {
  const now = Date.now();

  if (now - state.redisWriteMinuteStartedAt >= 60000) {
    console.log("marketStream: redis writes per minute", {
      timestamp: new Date().toISOString(),
      count: state.redisWritesThisMinute,
    });
    state.redisWritesThisMinute = 0;
    state.redisWriteMinuteStartedAt = now;
  }

  state.redisWritesThisMinute += 1;
}

function clearPendingWriteTimer(state) {
  if (!state.pendingWriteTimer) return;

  clearTimeout(state.pendingWriteTimer);
  state.pendingWriteTimer = null;
}

function getMsUntilNextWriteAllowed(state) {
  return Math.max(0, state.nextWriteAllowedAt - Date.now());
}

function scheduleMarketPulseFlush() {
  const state = getMarketPulseWriteState();

  if (!shouldUseRedis()) return;

  clearPendingWriteTimer(state);

  const delayMs = getMsUntilNextWriteAllowed(state);
  state.pendingWriteTimer = setTimeout(() => {
    state.pendingWriteTimer = null;
    void flushMarketPulseSnapshot();
  }, delayMs);
}

async function flushMarketPulseSnapshot() {
  const state = getMarketPulseWriteState();

  if (!shouldUseRedis()) return;

  if (state.writeInFlight) return;

  if (!state.pendingSnapshot) return;

  if (Date.now() < state.nextWriteAllowedAt) {
    scheduleMarketPulseFlush();
    return;
  }

  if (
    state.lastWrittenPrices &&
    pricesEqual(state.lastWrittenPrices, state.pendingSnapshot.prices)
  ) {
    state.pendingSnapshot = null;
    return;
  }

  const redis = getUpstashRedis();
  if (!redis) {
    state.pendingSnapshot = null;
    return;
  }

  const snapshot = state.pendingSnapshot;
  state.pendingSnapshot = null;
  state.writeInFlight = true;

  try {
    await redis.set(REDIS_SNAPSHOT_KEY, JSON.stringify(snapshot), {
      ex: REDIS_SNAPSHOT_TTL_SEC,
    });

    state.lastWrittenPrices = { ...snapshot.prices };
    state.nextWriteAllowedAt = Date.now() + REDIS_WRITE_INTERVAL_MS;
    trackRedisWrite(state);

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
    state.writeInFlight = false;

    if (
      state.pendingSnapshot &&
      (!state.lastWrittenPrices ||
        !pricesEqual(state.lastWrittenPrices, state.pendingSnapshot.prices))
    ) {
      scheduleMarketPulseFlush();
    }
  }
}

export function queueMarketPulseSnapshotWrite(snapshot) {
  const state = getMarketPulseWriteState();

  if (!shouldUseRedis()) return;

  state.pendingSnapshot = snapshot;

  if (state.lastWrittenPrices && pricesEqual(state.lastWrittenPrices, snapshot.prices)) {
    return;
  }

  if (state.writeInFlight) return;

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
