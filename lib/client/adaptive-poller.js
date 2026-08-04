import { incrementPollingMetric } from "./polling-metrics.js";

function randomJitter(maxMs) {
  if (!maxMs || maxMs <= 0) return 0;
  return Math.floor(Math.random() * maxMs);
}

/**
 * Visibility-aware polling controller for client hooks.
 * Pauses when hidden/offline, prevents overlap, backs off on errors.
 */
export function createAdaptivePoller({
  intervalMs,
  minIntervalMs = intervalMs,
  maxIntervalMs = intervalMs * 4,
  visibilityJitterMs = 250,
  pauseWhenHidden = true,
  pauseWhenOffline = true,
  shouldPoll = () => true,
  fetch: fetchFn,
  onError,
} = {}) {
  let timer = null;
  let destroyed = false;
  let inFlight = false;
  let abortController = null;
  let requestSeq = 0;
  let backoffMs = 0;
  let currentIntervalMs = intervalMs;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function scheduleNext(delayMs) {
    clearTimer();
    if (destroyed) return;
    if (pauseWhenHidden && typeof document !== "undefined" && document.hidden) return;
    if (pauseWhenOffline && typeof navigator !== "undefined" && navigator.onLine === false) return;

    timer = setTimeout(() => {
      void run("interval");
    }, Math.max(0, delayMs));
  }

  async function run(reason) {
    if (destroyed) return;
    if (pauseWhenHidden && typeof document !== "undefined" && document.hidden) {
      incrementPollingMetric("pollingPausedHidden");
      return;
    }
    if (pauseWhenOffline && typeof navigator !== "undefined" && navigator.onLine === false) {
      return;
    }
    if (!shouldPoll()) {
      scheduleNext(currentIntervalMs);
      return;
    }
    if (inFlight) {
      incrementPollingMetric("pollingRequestsSkippedOverlap");
      scheduleNext(currentIntervalMs);
      return;
    }

    inFlight = true;
    incrementPollingMetric("pollingRequestsStarted");
    if (reason === "fallback") {
      incrementPollingMetric("fallbackPolls");
    }

    abortController?.abort();
    abortController = new AbortController();
    const seq = ++requestSeq;

    try {
      await fetchFn({ signal: abortController.signal, reason, seq });
      if (destroyed || seq !== requestSeq) return;
      backoffMs = 0;
      scheduleNext(currentIntervalMs);
    } catch (error) {
      if (destroyed || error?.name === "AbortError") return;
      incrementPollingMetric("pollingRetries");
      onError?.(error);
      backoffMs = Math.min(
        maxIntervalMs,
        Math.max(minIntervalMs, backoffMs ? backoffMs * 2 : minIntervalMs * 2)
      );
      scheduleNext(backoffMs);
    } finally {
      inFlight = false;
    }
  }

  function onVisibilityChange() {
    if (typeof document === "undefined") return;
    if (document.hidden) {
      incrementPollingMetric("pollingPausedHidden");
      clearTimer();
      abortController?.abort();
      inFlight = false;
      return;
    }
    scheduleNext(visibilityJitterMs + randomJitter(visibilityJitterMs));
  }

  function onOnline() {
    scheduleNext(visibilityJitterMs + randomJitter(visibilityJitterMs));
  }

  function onOffline() {
    clearTimer();
    abortController?.abort();
    inFlight = false;
  }

  function start({ immediate = true } = {}) {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
    }
    if (immediate) {
      void run("initial");
    } else {
      scheduleNext(currentIntervalMs);
    }
  }

  function destroy() {
    destroyed = true;
    clearTimer();
    abortController?.abort();
    inFlight = false;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    }
  }

  function triggerRefresh(reason = "manual") {
    clearTimer();
    void run(reason);
  }

  function setIntervalMs(nextMs) {
    currentIntervalMs = nextMs;
  }

  function resetBackoff() {
    backoffMs = 0;
  }

  return {
    start,
    destroy,
    triggerRefresh,
    setIntervalMs,
    resetBackoff,
    scheduleNext,
    clearTimer,
  };
}
