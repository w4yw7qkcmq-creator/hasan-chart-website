"use client";
import { useEffect, useRef, useState } from "react";
import { createAdaptivePoller } from "../../lib/client/adaptive-poller.js";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout.js";
const SUMMARY_WINDOW = "1d";
const SUMMARY_SCOPE = "aggregated";
const REFRESH_MS = 45_000;
function buildQuery(symbol) {
  const params = new URLSearchParams();
  params.set("symbol", symbol);
  params.set("window", SUMMARY_WINDOW);
  params.set("scope", SUMMARY_SCOPE);
  return params.toString();
}
export function useOrderBook24hSummary({ symbol, hydrated }) {
  const [summary, setSummary] = useState(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const hasDataRef = useRef(false);
  useEffect(() => {
    if (!hydrated || !symbol) {
      setSummary(null);
      setInitialLoading(false);
      setIsRefreshing(false);
      setError(null);
      hasDataRef.current = false;
      return undefined;
    }
    const load = ({ background = false, signal } = {}) => {
      const requestId = ++requestIdRef.current;
      const hasCachedData = hasDataRef.current;
      if (!background || !hasCachedData) {
        setInitialLoading(!hasCachedData);
      }
      if (background && hasCachedData) {
        setIsRefreshing(true);
      }
      if (!background) {
        setError(null);
      }
      return fetchWithTimeout(
        `/api/market-depth/history/flow?${buildQuery(symbol)}`,
        { signal },
        10_000,
      )
        .then((response) => response.json())
        .then((payload) => {
          if (requestId !== requestIdRef.current) return;
          if (!payload?.success) {
            if (!hasDataRef.current) {
              setError("SUMMARY_FETCH_FAILED");
              setSummary(null);
            }
            throw new Error("SUMMARY_FETCH_FAILED");
          }
          setSummary(payload);
          hasDataRef.current = true;
          setError(null);
        })
        .catch((fetchError) => {
          if (fetchError?.name === "AbortError") return;
          if (requestId !== requestIdRef.current) return;
          if (!hasDataRef.current) {
            setError("SUMMARY_FETCH_FAILED");
            setSummary(null);
          }
          throw fetchError;
        })
        .finally(() => {
          if (requestId === requestIdRef.current) {
            setInitialLoading(false);
            setIsRefreshing(false);
          }
        });
    };
    const poller = createAdaptivePoller({
      intervalMs: REFRESH_MS,
      minIntervalMs: REFRESH_MS,
      maxIntervalMs: REFRESH_MS * 3,
      shouldPoll: () => !document.hidden && navigator.onLine !== false,
      fetch: async ({ signal, reason }) => {
        await load({ background: reason !== "initial", signal });
      },
    });
    poller.start({ immediate: true });
    return () => {
      poller.destroy();
      requestIdRef.current += 1;
    };
  }, [hydrated, symbol]);
  return {
    summary,
    initialLoading,
    isRefreshing,
    loading: initialLoading,
    error,
    summaryWindow: SUMMARY_WINDOW,
  };
}
