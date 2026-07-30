"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout.js";
import { HISTORICAL_LIQUIDITY_WALL_WINDOWS } from "../../lib/market-data/constants.js";

export function isHistoricalLiquidityWallWindow(window) {
  return HISTORICAL_LIQUIDITY_WALL_WINDOWS.includes(window);
}

function buildQuery({ symbol, window, exchange }) {
  const params = new URLSearchParams();
  params.set("symbol", symbol);
  params.set("window", window);
  params.set("limit", "20");
  if (exchange && exchange !== "aggregated") {
    params.set("exchange", exchange);
  }
  return params.toString();
}

function hasHistoricalWallRows(payload) {
  if (!payload?.success) return false;
  return (
    (payload.totalCount ?? 0) > 0 ||
    (payload.topPersistent?.length ?? 0) > 0 ||
    (payload.topAppeared?.length ?? 0) > 0 ||
    (payload.recentlyDisappeared?.length ?? 0) > 0 ||
    Boolean(payload.analytics?.strongestBid || payload.analytics?.strongestAsk)
  );
}

export function useOrderBookLiquidityWalls({ prefs, hydrated, wallWindow, enabled: enabledOverride = true }) {
  const [payload, setPayload] = useState(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const lastSuccessfulRef = useRef(null);
  const requestIdRef = useRef(0);

  const enabled = enabledOverride && isHistoricalLiquidityWallWindow(wallWindow);
  const queryKey = useMemo(
    () => [prefs.symbol, prefs.mode, wallWindow].join("|"),
    [prefs.symbol, prefs.mode, wallWindow],
  );

  useEffect(() => {
    if (!hydrated || !enabled) {
      setPayload(null);
      setInitialLoading(false);
      setIsRefreshing(false);
      setError(null);
      lastSuccessfulRef.current = null;
      return undefined;
    }

    const requestId = ++requestIdRef.current;
    let cancelled = false;
    const hasPriorData = lastSuccessfulRef.current != null;

    if (hasPriorData) {
      setIsRefreshing(true);
    } else {
      setInitialLoading(true);
      setError(null);
    }

    const exchange = prefs.mode === "aggregated" ? null : prefs.mode;

    void fetchWithTimeout(
      `/api/market-depth/history/liquidity-walls?${buildQuery({
        symbol: prefs.symbol,
        window: wallWindow,
        exchange,
      })}`,
      {},
      10_000,
    )
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        if (!data?.success) {
          if (lastSuccessfulRef.current) {
            setPayload({ ...lastSuccessfulRef.current, stale: true });
            setError("REFRESH_FAILED");
            return;
          }
          setError("HISTORY_FETCH_FAILED");
          setPayload(null);
          return;
        }
        if (hasHistoricalWallRows(data)) {
          lastSuccessfulRef.current = data;
        }
        setPayload(data);
        setError(null);
      })
      .catch(() => {
        if (cancelled || requestId !== requestIdRef.current) return;
        if (lastSuccessfulRef.current) {
          setPayload({ ...lastSuccessfulRef.current, stale: true });
          setError("REFRESH_FAILED");
          return;
        }
        setError("HISTORY_FETCH_FAILED");
        setPayload(null);
      })
      .finally(() => {
        if (!cancelled && requestId === requestIdRef.current) {
          setInitialLoading(false);
          setIsRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, hydrated, prefs.mode, prefs.symbol, queryKey, wallWindow]);

  return {
    liquidityWallsHistory: payload,
    initialLoading,
    isRefreshing,
    loading: initialLoading || isRefreshing,
    error,
    enabled,
  };
}
