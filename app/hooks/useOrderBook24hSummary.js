"use client";

import { useEffect, useRef, useState } from "react";
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

    let cancelled = false;
    let refreshTimer;

    const load = ({ background = false } = {}) => {
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

      void fetchWithTimeout(
        `/api/market-depth/history/flow?${buildQuery(symbol)}`,
        {},
        10_000,
      )
        .then((response) => response.json())
        .then((payload) => {
          if (cancelled || requestId !== requestIdRef.current) return;
          if (!payload?.success) {
            if (!hasDataRef.current) {
              setError("SUMMARY_FETCH_FAILED");
              setSummary(null);
            }
            return;
          }
          setSummary(payload);
          hasDataRef.current = true;
          setError(null);
        })
        .catch(() => {
          if (cancelled || requestId !== requestIdRef.current) return;
          if (!hasDataRef.current) {
            setError("SUMMARY_FETCH_FAILED");
            setSummary(null);
          }
        })
        .finally(() => {
          if (!cancelled && requestId === requestIdRef.current) {
            setInitialLoading(false);
            setIsRefreshing(false);
          }
        });
    };

    load({ background: false });
    refreshTimer = setInterval(() => load({ background: true }), REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
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
