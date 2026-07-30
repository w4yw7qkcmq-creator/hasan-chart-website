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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLiquidityWallsWithRetry({ symbol, window, exchange }, attempts = 2) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        `/api/market-depth/history/liquidity-walls?${buildQuery({ symbol, window, exchange })}`,
        { cache: "no-store" },
        30_000,
      );
      const data = await response.json();
      if (!data?.success) {
        throw new Error("HISTORY_FETCH_FAILED");
      }
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(1000 * (attempt + 1));
      }
    }
  }

  throw lastError;
}

export function useOrderBookLiquidityWalls({ prefs, hydrated, wallWindow, enabled: enabledOverride = true }) {
  const [payload, setPayload] = useState(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const cacheByKeyRef = useRef(new Map());
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
      return undefined;
    }

    const requestId = ++requestIdRef.current;
    let cancelled = false;
    const cached = cacheByKeyRef.current.get(queryKey) || null;

    if (cached) {
      setPayload(cached);
      setInitialLoading(false);
      setIsRefreshing(true);
      setError(null);
    } else {
      setInitialLoading(true);
      setIsRefreshing(false);
      setError(null);
    }

    const exchange = prefs.mode === "aggregated" ? null : prefs.mode;

    void fetchLiquidityWallsWithRetry({
      symbol: prefs.symbol,
      window: wallWindow,
      exchange,
    })
      .then((data) => {
        if (cancelled || requestId !== requestIdRef.current) return;

        if (hasHistoricalWallRows(data)) {
          cacheByKeyRef.current.set(queryKey, data);
        }

        setPayload(data);
        setError(null);
      })
      .catch(() => {
        if (cancelled || requestId !== requestIdRef.current) return;

        const fallback = cacheByKeyRef.current.get(queryKey);
        if (fallback) {
          setPayload({ ...fallback, stale: true });
          setError(null);
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
