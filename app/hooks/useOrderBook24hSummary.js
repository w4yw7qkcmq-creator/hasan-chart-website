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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!hydrated || !symbol) {
      setSummary(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    let refreshTimer;

    const load = () => {
      const requestId = ++requestIdRef.current;
      setLoading(true);
      setError(null);

      void fetchWithTimeout(
        `/api/market-depth/history/flow?${buildQuery(symbol)}`,
        {},
        10_000,
      )
        .then((response) => response.json())
        .then((payload) => {
          if (cancelled || requestId !== requestIdRef.current) return;
          if (!payload?.success) {
            setError("SUMMARY_FETCH_FAILED");
            setSummary(null);
            return;
          }
          setSummary(payload);
          setError(null);
        })
        .catch(() => {
          if (cancelled || requestId !== requestIdRef.current) return;
          setError("SUMMARY_FETCH_FAILED");
          setSummary(null);
        })
        .finally(() => {
          if (!cancelled && requestId === requestIdRef.current) {
            setLoading(false);
          }
        });
    };

    load();
    refreshTimer = setInterval(load, REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(refreshTimer);
    };
  }, [hydrated, symbol]);

  return {
    summary,
    loading,
    error,
    summaryWindow: SUMMARY_WINDOW,
  };
}
