"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";

export const MARKET_PULSE_STORAGE_KEY = "hasan-chart-market-pulse-v1";
export const DEFAULT_MARKET_PRICES = {
  BTCUSDT: "0",
  ETHUSDT: "0",
  SOLUSDT: "0",
};

const SSE_CONNECT_TIMEOUT_MS = 2500;
const SSE_RETRY_MS = 3000;
const POLL_FALLBACK_MS = 12000;
const BOOTSTRAP_RETRY_MS = 3000;
const MIN_BOOTSTRAP_GAP_MS = 1500;
const PRICE_UPDATE_BATCH_MS = 75;

let marketPulseBootstrapPromise = null;
let lastMarketPulseBootstrapAt = 0;

const sharedSubscribers = new Set();
let sharedPrices = { ...DEFAULT_MARKET_PRICES };
let sharedLiveFeedStatus = "connecting";
let sharedConnectionActive = false;

let pollTimer = null;
let retryTimer = null;
let streamRetryTimer = null;
let eventSource = null;
let sseConnectTimer = null;
let sseLive = false;
let batchTimer = null;
let pendingSnapshot = null;
let pageLoadCancel = null;
let visibilityHandlerAttached = false;
let sessionHandlerAttached = false;

async function fetchMarketPulsePayload() {
  const now = Date.now();

  if (marketPulseBootstrapPromise) {
    return marketPulseBootstrapPromise;
  }

  if (now - lastMarketPulseBootstrapAt < MIN_BOOTSTRAP_GAP_MS) {
    return null;
  }

  marketPulseBootstrapPromise = fetchWithTimeout(
    "/api/market-pulse",
    { credentials: "omit" },
    5000
  )
    .then(async (response) => {
      const result = await response.json().catch(() => null);
      return { response, result };
    })
    .finally(() => {
      marketPulseBootstrapPromise = null;
      lastMarketPulseBootstrapAt = Date.now();
    });

  return marketPulseBootstrapPromise;
}

export function readStoredMarketPulse() {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(MARKET_PULSE_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed?.prices || typeof parsed.prices !== "object") return null;

    return parsed.prices;
  } catch {
    return null;
  }
}

export function writeStoredMarketPulse(prices) {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem(
      MARKET_PULSE_STORAGE_KEY,
      JSON.stringify({
        prices,
        savedAt: Date.now(),
      })
    );
  } catch {
    // Ignore storage quota errors.
  }
}

function normalizePriceValue(value) {
  if (value == null || value === "" || value === 0 || value === "0") {
    return "0";
  }

  return String(value);
}

export function normalizeMarketPrices(raw) {
  return {
    BTCUSDT: normalizePriceValue(raw?.BTCUSDT),
    ETHUSDT: normalizePriceValue(raw?.ETHUSDT),
    SOLUSDT: normalizePriceValue(raw?.SOLUSDT),
  };
}

export function hasKnownMarketPrice(prices) {
  return Object.values(prices || {}).some((value) => {
    const normalized = normalizePriceValue(value);
    return normalized !== "0";
  });
}

function mapSnapshotToStatus(snapshot, prices) {
  if (snapshot?.status === "live" && hasKnownMarketPrice(prices)) return "live";
  if (hasKnownMarketPrice(prices)) return snapshot?.stale ? "stale" : "live";
  if (snapshot?.status === "offline") return "offline";
  if (snapshot?.status === "retrying") return "retrying";
  return "connecting";
}

function pricesEqual(left, right) {
  return (
    left.BTCUSDT === right.BTCUSDT &&
    left.ETHUSDT === right.ETHUSDT &&
    left.SOLUSDT === right.SOLUSDT
  );
}

function notifySharedSubscribers() {
  const snapshot = {
    prices: { ...sharedPrices },
    liveFeedStatus: sharedLiveFeedStatus,
  };

  for (const subscriber of sharedSubscribers) {
    subscriber(snapshot);
  }
}

function applySnapshotToSharedState(snapshot) {
  if (!snapshot?.prices) return false;

  const nextPrices = normalizeMarketPrices(snapshot.prices);
  const nextStatus = mapSnapshotToStatus(snapshot, nextPrices);

  if (pricesEqual(sharedPrices, nextPrices) && sharedLiveFeedStatus === nextStatus) {
    return hasKnownMarketPrice(nextPrices);
  }

  sharedPrices = nextPrices;
  sharedLiveFeedStatus = nextStatus;
  writeStoredMarketPulse(nextPrices);
  notifySharedSubscribers();
  return hasKnownMarketPrice(nextPrices);
}

function commitSharedSnapshot(snapshot, { immediate = false } = {}) {
  if (!snapshot?.prices) return false;

  if (immediate) {
    if (batchTimer) {
      window.clearTimeout(batchTimer);
      batchTimer = null;
    }
    pendingSnapshot = null;
    return applySnapshotToSharedState(snapshot);
  }

  pendingSnapshot = {
    ...(pendingSnapshot || {}),
    ...snapshot,
    prices: {
      ...(pendingSnapshot?.prices || sharedPrices),
      ...snapshot.prices,
    },
  };

  if (batchTimer) {
    return hasKnownMarketPrice(sharedPrices);
  }

  batchTimer = window.setTimeout(() => {
    batchTimer = null;
    const queued = pendingSnapshot;
    pendingSnapshot = null;
    if (queued) {
      applySnapshotToSharedState(queued);
    }
  }, PRICE_UPDATE_BATCH_MS);

  return hasKnownMarketPrice(sharedPrices);
}

function scheduleAfterPageLoad(callback) {
  const run = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(callback, { timeout: 2000 });
      return;
    }

    window.setTimeout(callback, 0);
  };

  if (typeof document !== "undefined" && document.readyState === "complete") {
    run();
    return () => {};
  }

  window.addEventListener("load", run, { once: true });
  return () => window.removeEventListener("load", run);
}

function clearPollTimer() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function clearRetryTimer() {
  if (retryTimer) {
    window.clearInterval(retryTimer);
    retryTimer = null;
  }
}

function clearStreamRetryTimer() {
  if (streamRetryTimer) {
    window.clearTimeout(streamRetryTimer);
    streamRetryTimer = null;
  }
}

function clearSseConnectTimer() {
  if (sseConnectTimer) {
    window.clearTimeout(sseConnectTimer);
    sseConnectTimer = null;
  }
}

function closeEventSource() {
  clearSseConnectTimer();
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

async function bootstrapFromApi() {
  try {
    const payload = await fetchMarketPulsePayload();
    if (!payload) return false;

    const { response, result } = payload;

    if (!response.ok || !result?.success || !result?.prices) {
      return false;
    }

    return commitSharedSnapshot(
      {
        prices: result.prices,
        status: result.stale ? "stale" : "live",
        stale: Boolean(result.stale),
      },
      { immediate: true }
    );
  } catch {
    return false;
  }
}

function startPollFallback() {
  if (pollTimer || document.hidden) return;

  pollTimer = window.setInterval(() => {
    if (document.hidden) return;
    void bootstrapFromApi();
  }, POLL_FALLBACK_MS);
}

function markSseLive() {
  sseLive = true;
  clearSseConnectTimer();
  clearStreamRetryTimer();
  clearPollTimer();

  if (hasKnownMarketPrice(sharedPrices) && sharedLiveFeedStatus !== "live") {
    sharedLiveFeedStatus = "live";
    notifySharedSubscribers();
  }
}

function scheduleStreamRetry() {
  clearStreamRetryTimer();
  if (sseLive) return;

  streamRetryTimer = window.setTimeout(() => {
    if (!sseLive) {
      connectStream();
    }
  }, SSE_RETRY_MS);
}

function handleSseFailure() {
  closeEventSource();
  sseLive = false;

  if (hasKnownMarketPrice(sharedPrices) && sharedLiveFeedStatus !== "stale") {
    sharedLiveFeedStatus = "stale";
    notifySharedSubscribers();
  }

  scheduleStreamRetry();
}

function connectStream() {
  if (typeof window === "undefined") return;

  if (typeof EventSource === "undefined") {
    startPollFallback();
    return;
  }

  closeEventSource();
  sseLive = false;

  const source = new EventSource("/api/market-stream");
  eventSource = source;
  let receivedData = false;

  sseConnectTimer = window.setTimeout(() => {
    if (!receivedData) {
      handleSseFailure();
    }
  }, SSE_CONNECT_TIMEOUT_MS);

  source.onmessage = (event) => {
    if (!event?.data) return;

    try {
      const payload = JSON.parse(event.data);
      if (!payload?.prices) return;

      receivedData = true;
      const hasPrices = commitSharedSnapshot(payload);

      if (hasPrices) {
        markSseLive();
      }
    } catch {
      // Ignore malformed SSE payloads.
    }
  };

  source.onerror = () => {
    handleSseFailure();
  };
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") {
    clearPollTimer();
    clearRetryTimer();
    closeEventSource();
    sseLive = false;
    return;
  }

  void bootstrapFromApi();

  if (!sseLive) {
    connectStream();
  }
}

function handleSessionReady() {
  void bootstrapFromApi();
}

function startSharedMarketPulseConnection() {
  if (sharedConnectionActive || typeof window === "undefined") {
    return;
  }

  sharedConnectionActive = true;

  const stored = readStoredMarketPulse();
  if (stored) {
    const next = normalizeMarketPrices(stored);
    sharedPrices = next;
    sharedLiveFeedStatus = hasKnownMarketPrice(next) ? "stale" : "connecting";
    notifySharedSubscribers();
  }

  void bootstrapFromApi();

  retryTimer = window.setInterval(() => {
    if (document.hidden || hasKnownMarketPrice(sharedPrices)) {
      if (hasKnownMarketPrice(sharedPrices)) {
        clearRetryTimer();
      }
      return;
    }

    void bootstrapFromApi();
  }, BOOTSTRAP_RETRY_MS);

  pageLoadCancel = scheduleAfterPageLoad(() => {
    connectStream();
  });

  if (!visibilityHandlerAttached) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    visibilityHandlerAttached = true;
  }

  if (!sessionHandlerAttached) {
    window.addEventListener("hc:session-ready", handleSessionReady);
    sessionHandlerAttached = true;
  }
}

function stopSharedMarketPulseConnection() {
  if (!sharedConnectionActive) {
    return;
  }

  sharedConnectionActive = false;
  pageLoadCancel?.();
  pageLoadCancel = null;
  clearPollTimer();
  clearRetryTimer();
  clearStreamRetryTimer();
  closeEventSource();
  sseLive = false;

  if (batchTimer) {
    window.clearTimeout(batchTimer);
    batchTimer = null;
  }

  pendingSnapshot = null;

  if (visibilityHandlerAttached) {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    visibilityHandlerAttached = false;
  }

  if (sessionHandlerAttached) {
    window.removeEventListener("hc:session-ready", handleSessionReady);
    sessionHandlerAttached = false;
  }
}

export function useMarketPulseStream() {
  const [prices, setPrices] = useState(() => ({ ...sharedPrices }));
  const [liveFeedStatus, setLiveFeedStatus] = useState(sharedLiveFeedStatus);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const handleSharedUpdate = (snapshot) => {
      if (!mountedRef.current) return;

      setPrices((current) => (pricesEqual(current, snapshot.prices) ? current : { ...snapshot.prices }));
      setLiveFeedStatus((current) =>
        current === snapshot.liveFeedStatus ? current : snapshot.liveFeedStatus
      );
    };

    sharedSubscribers.add(handleSharedUpdate);
    handleSharedUpdate({
      prices: sharedPrices,
      liveFeedStatus: sharedLiveFeedStatus,
    });

    if (sharedSubscribers.size === 1) {
      startSharedMarketPulseConnection();
    }

    return () => {
      mountedRef.current = false;
      sharedSubscribers.delete(handleSharedUpdate);

      if (sharedSubscribers.size === 0) {
        stopSharedMarketPulseConnection();
      }
    };
  }, []);

  return { prices, liveFeedStatus };
}
