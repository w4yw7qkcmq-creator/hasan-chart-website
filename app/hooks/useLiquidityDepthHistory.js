"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout.js";
import { isHistoricalLiquidityDepthWindow } from "../../lib/market-data/constants.js";

function buildQuery({ symbol, window, exchange }) {
  const params = new URLSearchParams();
  params.set("symbol", symbol);
  params.set("window", window);
  params.set("limit", "50");
  if (exchange && exchange !== "aggregated") {
    params.set("exchange", exchange);
  }
  return params.toString();
}

export function useLiquidityDepthHistory({ prefs, hydrated, depthWindow }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const enabled = isHistoricalLiquidityDepthWindow(depthWindow);
  const queryKey = useMemo(
    () => [prefs.symbol, prefs.mode, depthWindow].join("|"),
    [prefs.symbol, prefs.mode, depthWindow],
  );

  useEffect(() => {
    if (!hydrated || !enabled) {
      setPayload(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const requestId = ++requestIdRef.current;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const exchange = prefs.mode === "aggregated" ? null : prefs.mode;

    void fetchWithTimeout(
      `/api/market-depth/history/liquidity-walls?${buildQuery({
        symbol: prefs.symbol,
        window: depthWindow,
        exchange,
      })}`,
      {},
      10_000,
    )
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        if (!data?.success) {
          setError("DEPTH_HISTORY_FETCH_FAILED");
          setPayload(null);
          return;
        }
        setPayload(data);
        setError(null);
      })
      .catch(() => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setError("DEPTH_HISTORY_FETCH_FAILED");
        setPayload(null);
      })
      .finally(() => {
        if (!cancelled && requestId === requestIdRef.current) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [depthWindow, enabled, hydrated, prefs.mode, prefs.symbol, queryKey]);

  return {
    depthHistory: payload,
    loading,
    error,
    enabled,
  };
}
