"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
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

let marketPulseBootstrapPromise = null;
let lastMarketPulseBootstrapAt = 0;

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

export function useMarketPulseStream() {
  const [prices, setPrices] = useState(() => ({ ...DEFAULT_MARKET_PRICES }));
  const [liveFeedStatus, setLiveFeedStatus] = useState("connecting");
  const pricesRef = useRef(prices);
  const mountedRef = useRef(true);
  const pollTimerRef = useRef(null);
  const retryTimerRef = useRef(null);
  const streamRetryTimerRef = useRef(null);
  const eventSourceRef = useRef(null);
  const sseConnectTimerRef = useRef(null);
  const sseLiveRef = useRef(false);
  const applySnapshotRef = useRef(() => false);

  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  useEffect(() => {
    mountedRef.current = true;

    const clearPollTimer = () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const clearRetryTimer = () => {
      if (retryTimerRef.current) {
        window.clearInterval(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const clearStreamRetryTimer = () => {
      if (streamRetryTimerRef.current) {
        window.clearTimeout(streamRetryTimerRef.current);
        streamRetryTimerRef.current = null;
      }
    };

    const clearSseConnectTimer = () => {
      if (sseConnectTimerRef.current) {
        window.clearTimeout(sseConnectTimerRef.current);
        sseConnectTimerRef.current = null;
      }
    };

    const closeEventSource = () => {
      clearSseConnectTimer();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const applySnapshot = (snapshot) => {
      if (!mountedRef.current || !snapshot?.prices) return false;

      const next = normalizeMarketPrices(snapshot.prices);
      const nextStatus = mapSnapshotToStatus(snapshot, next);

      flushSync(() => {
        setPrices(next);
        setLiveFeedStatus(nextStatus);
      });

      pricesRef.current = next;
      writeStoredMarketPulse(next);
      return hasKnownMarketPrice(next);
    };

    applySnapshotRef.current = applySnapshot;

    const stored = readStoredMarketPulse();
    if (stored) {
      const next = normalizeMarketPrices(stored);
      flushSync(() => {
        setPrices(next);
        setLiveFeedStatus(hasKnownMarketPrice(next) ? "stale" : "connecting");
      });
      pricesRef.current = next;
    }

    const bootstrapFromApi = async () => {
      try {
        const payload = await fetchMarketPulsePayload();
        if (!payload) return false;

        const { response, result } = payload;

        if (!mountedRef.current || !response.ok || !result?.success || !result?.prices) {
          return false;
        }

        return applySnapshot({
          prices: result.prices,
          status: result.stale ? "stale" : "live",
          stale: Boolean(result.stale),
        });
      } catch {
        return false;
      }
    };

    const startPollFallback = () => {
      if (pollTimerRef.current || !mountedRef.current || document.hidden) return;

      pollTimerRef.current = window.setInterval(() => {
        if (!mountedRef.current || document.hidden) return;
        void bootstrapFromApi();
      }, POLL_FALLBACK_MS);
    };

    const markSseLive = () => {
      sseLiveRef.current = true;
      clearSseConnectTimer();
      clearStreamRetryTimer();
      clearPollTimer();

      if (hasKnownMarketPrice(pricesRef.current)) {
        flushSync(() => {
          setLiveFeedStatus("live");
        });
      }
    };

    const scheduleStreamRetry = () => {
      clearStreamRetryTimer();
      if (!mountedRef.current || sseLiveRef.current) return;

      streamRetryTimerRef.current = window.setTimeout(() => {
        if (mountedRef.current && !sseLiveRef.current) {
          connectStream();
        }
      }, SSE_RETRY_MS);
    };

    const handleSseFailure = () => {
      closeEventSource();
      sseLiveRef.current = false;

      if (hasKnownMarketPrice(pricesRef.current)) {
        flushSync(() => {
          setLiveFeedStatus("stale");
        });
      }

      scheduleStreamRetry();
    };

    const connectStream = () => {
      if (!mountedRef.current) return;

      if (typeof EventSource === "undefined") {
        startPollFallback();
        return;
      }

      closeEventSource();
      sseLiveRef.current = false;

      const source = new EventSource("/api/market-stream");
      eventSourceRef.current = source;
      let receivedData = false;

      sseConnectTimerRef.current = window.setTimeout(() => {
        if (!mountedRef.current || receivedData) return;
        handleSseFailure();
      }, SSE_CONNECT_TIMEOUT_MS);

      source.onmessage = (event) => {
        if (!mountedRef.current || !event?.data) return;

        try {
          const payload = JSON.parse(event.data);
          if (!payload?.prices) return;

          receivedData = true;
          const hasPrices = applySnapshotRef.current(payload);

          if (hasPrices) {
            markSseLive();
          }
        } catch {
          // Ignore malformed SSE payloads.
        }
      };

      source.onerror = () => {
        if (!mountedRef.current) return;
        handleSseFailure();
      };
    };

    const handleVisibilityChange = () => {
      if (!mountedRef.current) return;

      if (document.visibilityState === "hidden") {
        clearPollTimer();
        clearRetryTimer();
        closeEventSource();
        sseLiveRef.current = false;
        return;
      }

      void bootstrapFromApi();

      if (!sseLiveRef.current) {
        connectStream();
      }
    };

    const handleSessionReady = () => {
      void bootstrapFromApi();
    };

    void bootstrapFromApi();

    retryTimerRef.current = window.setInterval(() => {
      if (
        !mountedRef.current ||
        document.hidden ||
        hasKnownMarketPrice(pricesRef.current)
      ) {
        if (hasKnownMarketPrice(pricesRef.current)) {
          clearRetryTimer();
        }
        return;
      }

      void bootstrapFromApi();
    }, BOOTSTRAP_RETRY_MS);

    const cancelPageLoadSchedule = scheduleAfterPageLoad(() => {
      if (!mountedRef.current) return;
      connectStream();
    });

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("hc:session-ready", handleSessionReady);

    return () => {
      mountedRef.current = false;
      cancelPageLoadSchedule();
      clearPollTimer();
      clearRetryTimer();
      clearStreamRetryTimer();
      closeEventSource();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("hc:session-ready", handleSessionReady);
    };
  }, []);

  return { prices, liveFeedStatus };
}
