"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveMarketDepthConnectionStatus } from "../../lib/market-data/connection-status";
import {
  createSymbolChangeRateLimiter,
  SYMBOL_CHANGE_RATE_LIMIT_MESSAGE,
} from "../../lib/market-data/symbol-change-rate-limit.js";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";
import {
  buildMarketDepthQuery,
  DEFAULT_ORDER_BOOK_PREFS,
  readOrderBookPreferences,
  writeOrderBookPreferences,
} from "./useOrderBookPreferences";

const UI_BATCH_MS = 150;
const SSE_RETRY_MS = 3000;
const EMPTY_OVERRIDES = Object.freeze({});

export function useMarketDepthStream(overrides = EMPTY_OVERRIDES) {
  const [prefs, setPrefsState] = useState(DEFAULT_ORDER_BOOK_PREFS);
  const [data, setData] = useState(null);
  const [ssePhase, setSsePhase] = useState("connecting");
  const [browserOnline, setBrowserOnline] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  const prefsRef = useRef(DEFAULT_ORDER_BOOK_PREFS);
  const eventSourceRef = useRef(null);
  const batchTimerRef = useRef(null);
  const pendingRef = useRef(null);
  const retryTimerRef = useRef(null);
  const intentionalCloseRef = useRef(false);
  const mountedRef = useRef(false);
  const receivedMessageRef = useRef(false);
  const [symbolSwitching, setSymbolSwitching] = useState(false);
  const [symbolRateLimitMessage, setSymbolRateLimitMessage] = useState(null);
  const lastDataSymbolRef = useRef(null);
  const symbolRateLimiterRef = useRef(createSymbolChangeRateLimiter());

  const streamQuery = useMemo(() => buildMarketDepthQuery(prefs), [prefs]);

  useEffect(() => {
    const stored = readOrderBookPreferences();
    const merged = { ...stored, ...overrides };
    prefsRef.current = merged;
    setPrefsState(merged);
    setHydrated(true);
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
    // Hydrate once on mount; overrides are fixed via EMPTY_OVERRIDES default.
  }, []);

  const connection = useMemo(
    () =>
      resolveMarketDepthConnectionStatus({
        ssePhase,
        payload: data,
        browserOnline,
      }),
    [ssePhase, data, browserOnline]
  );

  const setPrefs = useCallback((patch, options = {}) => {
    const current = prefsRef.current;
    const source = options.source || "internal";

    if (patch.symbol && patch.symbol !== current.symbol && source === "user") {
      const check = symbolRateLimiterRef.current.canChange(patch.symbol);
      if (!check.allowed) {
        setSymbolRateLimitMessage(check.message || SYMBOL_CHANGE_RATE_LIMIT_MESSAGE);
        return false;
      }
      if (!check.duplicate) {
        symbolRateLimiterRef.current.recordChange(patch.symbol);
      }
      setSymbolRateLimitMessage(null);
    }

    setPrefsState((prev) => {
      const next = { ...prev, ...patch };
      if (patch.symbol && patch.symbol !== prev.symbol) {
        setSymbolSwitching(true);
      }
      prefsRef.current = next;
      writeOrderBookPreferences(next, {
        explicitLargeTradeThreshold: patch.largeTradeThreshold != null ? true : undefined,
      });
      return next;
    });

    return true;
  }, []);

  const flushPending = useCallback(() => {
    batchTimerRef.current = null;
    if (!pendingRef.current || !mountedRef.current) return;

    const payload = pendingRef.current;
    pendingRef.current = null;
    receivedMessageRef.current = true;
    if (payload?.symbol) {
      lastDataSymbolRef.current = payload.symbol;
      if (payload.symbol === prefsRef.current.symbol) {
        setSymbolSwitching(false);
      }
    }
    setData(payload);
    setSsePhase("open");
  }, []);

  const scheduleFlush = useCallback(() => {
    if (batchTimerRef.current) return;
    batchTimerRef.current = setTimeout(flushPending, UI_BATCH_MS);
  }, [flushPending]);

  const closeStream = useCallback(() => {
    intentionalCloseRef.current = true;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.onopen = null;
      eventSourceRef.current.onmessage = null;
      eventSourceRef.current.onerror = null;
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    intentionalCloseRef.current = false;
  }, []);

  const connectStreamRef = useRef(() => {});

  const connectStream = useCallback(() => {
    if (typeof EventSource === "undefined" || !mountedRef.current || !browserOnline) {
      return;
    }

    closeStream();
    receivedMessageRef.current = false;
    setSsePhase("connecting");

    const source = new EventSource(`/api/market-depth/stream?${streamQuery}`);
    eventSourceRef.current = source;

    source.onopen = () => {
      if (!mountedRef.current) return;
      setSsePhase("open");
    };

    source.onmessage = (event) => {
      if (!mountedRef.current || !event?.data) return;

      try {
        const payload = JSON.parse(event.data);
        if (!payload?.success) return;

        pendingRef.current = payload;

        if (document.visibilityState === "hidden") {
          flushPending();
          return;
        }

        scheduleFlush();
      } catch {
        // ignore malformed payloads
      }
    };

    source.onerror = () => {
      if (intentionalCloseRef.current || !mountedRef.current) return;

      source.onopen = null;
      source.onmessage = null;
      source.onerror = null;

      try {
        source.close();
      } catch {
        // ignore close errors
      }

      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }

      if (receivedMessageRef.current) {
        setSsePhase("reconnecting");
      } else {
        setSsePhase("disconnected");
      }

      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }

      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        if (mountedRef.current && browserOnline) {
          connectStreamRef.current();
        }
      }, SSE_RETRY_MS);
    };
  }, [browserOnline, closeStream, flushPending, scheduleFlush, streamQuery]);

  connectStreamRef.current = connectStream;

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return undefined;

    const syncBrowserOnline = (event) => {
      if (!mountedRef.current) return;
      if (event?.type === "offline") {
        setBrowserOnline(false);
        return;
      }
      if (event?.type === "online") {
        setBrowserOnline(true);
        return;
      }
      setBrowserOnline(navigator.onLine);
    };

    window.addEventListener("online", syncBrowserOnline);
    window.addEventListener("offline", syncBrowserOnline);
    syncBrowserOnline();

    return () => {
      window.removeEventListener("online", syncBrowserOnline);
      window.removeEventListener("offline", syncBrowserOnline);
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return undefined;

    let cancelled = false;

    if (!browserOnline) {
      closeStream();
      setSsePhase("disconnected");
      return () => {
        cancelled = true;
        closeStream();
      };
    }

    void fetchWithTimeout(`/api/market-depth/snapshot?${streamQuery}`, {}, 8000)
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled || !mountedRef.current || !payload?.success) return;
        receivedMessageRef.current = true;
        if (payload.symbol) {
          lastDataSymbolRef.current = payload.symbol;
          if (payload.symbol === prefsRef.current.symbol) {
            setSymbolSwitching(false);
          }
        }
        setData(payload);
        setSsePhase("open");
      })
      .catch(() => {
        // stream/bootstrap retry will recover
      });

    connectStream();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && mountedRef.current && browserOnline) {
        connectStream();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      closeStream();
    };
  }, [hydrated, streamQuery, connectStream, closeStream, browserOnline]);

  return {
    data,
    prefs,
    setPrefs,
    connection,
    ssePhase,
    browserOnline,
    hydrated,
    symbolSwitching,
    symbolRateLimitMessage,
  };
}
