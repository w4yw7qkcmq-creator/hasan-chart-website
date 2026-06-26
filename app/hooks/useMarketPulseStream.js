"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";

export const MARKET_PULSE_STORAGE_KEY = "hasan-chart-market-pulse-v1";
export const DEFAULT_MARKET_PRICES = {
  BTCUSDT: "0",
  ETHUSDT: "0",
  SOLUSDT: "0",
};

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

export function hasKnownMarketPrice(prices) {
  return Object.values(prices || {}).some((value) => value && value !== "0");
}

function mapSnapshotToStatus(snapshot, prices) {
  if (snapshot?.status === "live") return "live";
  if (hasKnownMarketPrice(prices)) return "stale";
  if (snapshot?.status === "offline") return "offline";
  if (snapshot?.status === "retrying") return "retrying";
  return "connecting";
}

export function useMarketPulseStream() {
  const [prices, setPrices] = useState(DEFAULT_MARKET_PRICES);
  const [liveFeedStatus, setLiveFeedStatus] = useState("connecting");
  const pricesRef = useRef(DEFAULT_MARKET_PRICES);
  const reconnectAttemptRef = useRef(0);
  const pollTimerRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    pricesRef.current = prices;
  }, [prices]);

  useEffect(() => {
    const storedPrices = readStoredMarketPulse();
    if (storedPrices) {
      setPrices((current) => ({ ...current, ...storedPrices }));
      setLiveFeedStatus(hasKnownMarketPrice(storedPrices) ? "stale" : "connecting");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const clearPollTimer = () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const closeEventSource = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    const applySnapshot = (snapshot) => {
      if (cancelled || !snapshot?.prices) return;

      setPrices((current) => {
        const next = { ...current, ...snapshot.prices };
        writeStoredMarketPulse(next);
        pricesRef.current = next;
        return next;
      });

      setLiveFeedStatus(mapSnapshotToStatus(snapshot, snapshot.prices));
    };

    const bootstrapFromApi = async () => {
      try {
        const response = await fetchWithTimeout("/api/market-pulse", { cache: "no-store" }, 5000);
        const result = await response.json().catch(() => null);

        if (cancelled || !response.ok || !result?.success || !result?.prices) return;

        applySnapshot({
          prices: result.prices,
          status: result.stale ? "stale" : "live",
        });
      } catch {
        // Silent fallback; stream or cached values remain available.
      }
    };

    const startPollFallback = () => {
      if (pollTimerRef.current || cancelled) return;

      pollTimerRef.current = window.setInterval(() => {
        void bootstrapFromApi();
      }, 8000);
    };

    const scheduleReconnect = () => {
      if (cancelled) return;

      clearReconnectTimer();

      const delays = [1000, 3000, 5000, 10000];
      const delay = delays[Math.min(reconnectAttemptRef.current, delays.length - 1)];
      reconnectAttemptRef.current += 1;

      setLiveFeedStatus(
        hasKnownMarketPrice(pricesRef.current)
          ? "stale"
          : reconnectAttemptRef.current >= delays.length
            ? "offline"
            : "retrying"
      );

      reconnectTimerRef.current = window.setTimeout(() => {
        connectStream();
      }, delay);
    };

    const connectStream = () => {
      if (cancelled) return;

      if (typeof EventSource === "undefined") {
        startPollFallback();
        return;
      }

      closeEventSource();

      const source = new EventSource("/api/market-stream");
      eventSourceRef.current = source;

      source.onopen = () => {
        reconnectAttemptRef.current = 0;
        clearPollTimer();
        setLiveFeedStatus((current) =>
          hasKnownMarketPrice(pricesRef.current) ? "live" : current
        );
      };

      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          applySnapshot(payload);
        } catch {
          // Ignore malformed SSE payloads.
        }
      };

      source.onerror = () => {
        closeEventSource();
        startPollFallback();
        scheduleReconnect();
      };
    };

    void bootstrapFromApi().finally(() => {
      if (!cancelled) {
        connectStream();
      }
    });

    return () => {
      cancelled = true;
      clearPollTimer();
      clearReconnectTimer();
      closeEventSource();
    };
  }, []);

  return { prices, liveFeedStatus };
}
