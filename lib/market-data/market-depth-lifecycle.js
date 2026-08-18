import { IDLE_TTL_MS } from "./dynamic-symbol-constants.js";
import { logMarketDepth } from "./logging.js";
import { getMarketDepthHub } from "./market-depth-hub.js";

export const MARKET_DEPTH_LIFECYCLE_STATES = Object.freeze({
  STOPPED: "STOPPED",
  STARTING: "STARTING",
  RUNNING: "RUNNING",
  IDLE_PENDING: "IDLE_PENDING",
  STOPPING: "STOPPING",
  ERROR: "ERROR",
});

function resolveIdleTtlMs() {
  const raw = String(process.env.MARKET_DEPTH_IDLE_TTL_MS ?? "").trim();
  const parsed = Number(raw);
  const minAllowed =
    process.env.MARKET_DEPTH_LIFECYCLE_TEST_MODE === "1" ? 50 : 30_000;
  if (Number.isFinite(parsed) && parsed >= minAllowed) {
    return parsed;
  }
  return IDLE_TTL_MS;
}

class MarketDepthLifecycle {
  constructor() {
    this.state = MARKET_DEPTH_LIFECYCLE_STATES.STOPPED;
    this.consumerCount = 0;
    this.idleTimer = null;
    this.startPromise = null;
    this.idleTtlMs = resolveIdleTtlMs();
    this.lastError = null;
  }

  getSnapshot() {
    const hub = getMarketDepthHub();
    return {
      state: this.state,
      consumerCount: this.consumerCount,
      idleTtlMs: this.idleTtlMs,
      hubStarted: hub.started,
      connections: hub.connections.size,
      sseSubscribers: hub.subscribers.size,
      broadcastActive: Boolean(hub.broadcastTimer || hub.pendingBroadcast),
      lastError: this.lastError,
    };
  }

  cancelIdleShutdown() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (this.state === MARKET_DEPTH_LIFECYCLE_STATES.IDLE_PENDING) {
      this.state = getMarketDepthHub().started
        ? MARKET_DEPTH_LIFECYCLE_STATES.RUNNING
        : MARKET_DEPTH_LIFECYCLE_STATES.STOPPED;
    }
  }

  scheduleIdleShutdown(reason = "idle-ttl") {
    if (this.consumerCount > 0) return;
    if (this.idleTimer) return;

    this.state = MARKET_DEPTH_LIFECYCLE_STATES.IDLE_PENDING;
    logMarketDepth("lifecycle_idle_pending", {
      reason,
      idleTtlMs: this.idleTtlMs,
      consumerCount: this.consumerCount,
    });

    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.consumerCount === 0) {
        this.shutdown(reason);
      }
    }, this.idleTtlMs);
    this.idleTimer.unref?.();
  }

  async acquireConsumer(reason = "consumer") {
    this.cancelIdleShutdown();
    this.consumerCount += 1;

    logMarketDepth("lifecycle_acquire", {
      reason,
      consumerCount: this.consumerCount,
      state: this.state,
    });

    if (
      this.state === MARKET_DEPTH_LIFECYCLE_STATES.RUNNING ||
      this.state === MARKET_DEPTH_LIFECYCLE_STATES.STARTING
    ) {
      if (this.startPromise) {
        await this.startPromise;
      }
      return {
        ok: true,
        state: this.state,
        warming: this.state === MARKET_DEPTH_LIFECYCLE_STATES.STARTING,
      };
    }

    return this.start(reason);
  }

  releaseConsumer(reason = "consumer") {
    this.consumerCount = Math.max(0, this.consumerCount - 1);

    logMarketDepth("lifecycle_release", {
      reason,
      consumerCount: this.consumerCount,
      state: this.state,
    });

    if (this.consumerCount === 0) {
      this.scheduleIdleShutdown(reason);
    }
  }

  async start(reason = "manual") {
    const hub = getMarketDepthHub();
    if (hub.started && this.state === MARKET_DEPTH_LIFECYCLE_STATES.RUNNING) {
      return { ok: true, state: this.state, warming: false };
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.state = MARKET_DEPTH_LIFECYCLE_STATES.STARTING;
    this.lastError = null;

    this.startPromise = Promise.resolve()
      .then(() => {
        hub.start(reason);
        this.state = MARKET_DEPTH_LIFECYCLE_STATES.RUNNING;
        logMarketDepth("lifecycle_running", { reason, connections: hub.connections.size });
        return { ok: true, state: this.state, warming: false };
      })
      .catch((error) => {
        this.state = MARKET_DEPTH_LIFECYCLE_STATES.ERROR;
        this.lastError = error?.message || String(error);
        logMarketDepth("lifecycle_error", { reason, error: this.lastError });
        throw error;
      })
      .finally(() => {
        this.startPromise = null;
      });

    return this.startPromise;
  }

  shutdown(reason = "manual") {
    if (
      this.state === MARKET_DEPTH_LIFECYCLE_STATES.STOPPING ||
      (this.state === MARKET_DEPTH_LIFECYCLE_STATES.STOPPED && !getMarketDepthHub().started)
    ) {
      return { ok: true, state: this.state };
    }

    this.cancelIdleShutdown();
    this.state = MARKET_DEPTH_LIFECYCLE_STATES.STOPPING;

    logMarketDepth("lifecycle_stopping", { reason, consumerCount: this.consumerCount });

    try {
      getMarketDepthHub().stop(reason);
      this.state = MARKET_DEPTH_LIFECYCLE_STATES.STOPPED;
      logMarketDepth("lifecycle_stopped", { reason });
      return { ok: true, state: this.state };
    } catch (error) {
      this.state = MARKET_DEPTH_LIFECYCLE_STATES.ERROR;
      this.lastError = error?.message || String(error);
      logMarketDepth("lifecycle_shutdown_error", { reason, error: this.lastError });
      throw error;
    }
  }

  resetForTests() {
    this.cancelIdleShutdown();
    this.consumerCount = 0;
    this.startPromise = null;
    this.lastError = null;
    this.state = MARKET_DEPTH_LIFECYCLE_STATES.STOPPED;
  }
}

export function getMarketDepthLifecycle() {
  if (!globalThis.__marketDepthLifecycle) {
    globalThis.__marketDepthLifecycle = new MarketDepthLifecycle();
  }
  return globalThis.__marketDepthLifecycle;
}

export async function ensureMarketDepthConsumer(reason = "consumer") {
  return getMarketDepthLifecycle().acquireConsumer(reason);
}

export function releaseMarketDepthConsumer(reason = "consumer") {
  getMarketDepthLifecycle().releaseConsumer(reason);
}

export function resetMarketDepthLifecycleForTests() {
  if (globalThis.__marketDepthLifecycle) {
    globalThis.__marketDepthLifecycle.resetForTests();
    delete globalThis.__marketDepthLifecycle;
  }
}
