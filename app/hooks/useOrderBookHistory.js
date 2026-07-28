"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout.js";
import {
  HISTORICAL_FLOW_WINDOWS,
  HISTORICAL_LARGE_TRADE_WINDOWS,
  LIVE_FLOW_WINDOWS,
  LIVE_LARGE_TRADE_WINDOWS,
} from "../../lib/market-data/constants.js";

export function isHistoricalFlowWindow(window) {
  return HISTORICAL_FLOW_WINDOWS.includes(window);
}

export function isHistoricalLargeTradeWindow(window) {
  return HISTORICAL_LARGE_TRADE_WINDOWS.includes(window);
}

export function isLiveFlowWindow(window) {
  return LIVE_FLOW_WINDOWS.has(window);
}

export function isLiveLargeTradeWindow(window) {
  return LIVE_LARGE_TRADE_WINDOWS.has(window);
}

function buildFlowQuery({ symbol, window, scope }) {
  const params = new URLSearchParams();
  params.set("symbol", symbol);
  params.set("window", window);
  params.set("scope", scope);
  return params.toString();
}

function buildLargeTradesQuery({ symbol, window, minNotional, exchange }) {
  const params = new URLSearchParams();
  params.set("symbol", symbol);
  params.set("window", window);
  params.set("minNotional", String(minNotional));
  params.set("limit", "100");
  if (exchange && exchange !== "aggregated") {
    params.set("exchange", exchange);
  }
  return params.toString();
}

export function useOrderBookHistory({ prefs, hydrated }) {
  const [flowHistory, setFlowHistory] = useState(null);
  const [largeTradeHistory, setLargeTradeHistory] = useState(null);
  const [dominanceHistory, setDominanceHistory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  const needsFlowHistory = isHistoricalFlowWindow(prefs.flowWindow);
  const needsDominanceHistory = isHistoricalFlowWindow(prefs.dominanceWindow);
  const needsLargeTradeHistory = isHistoricalLargeTradeWindow(prefs.largeTradeWindow);

  const historyKey = useMemo(
    () =>
      [
        prefs.symbol,
        prefs.mode,
        prefs.flowWindow,
        prefs.dominanceWindow,
        prefs.largeTradeWindow,
        prefs.largeTradeThreshold,
      ].join("|"),
    [prefs],
  );

  useEffect(() => {
    if (!hydrated) return undefined;
    if (!needsFlowHistory && !needsDominanceHistory && !needsLargeTradeHistory) {
      setFlowHistory(null);
      setDominanceHistory(null);
      setLargeTradeHistory(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    const requestId = ++requestIdRef.current;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const scope = prefs.mode === "aggregated" ? "aggregated" : prefs.mode;
    const tasks = [];

    if (needsFlowHistory) {
      tasks.push(
        fetchWithTimeout(
          `/api/market-depth/history/flow?${buildFlowQuery({
            symbol: prefs.symbol,
            window: prefs.flowWindow,
            scope,
          })}`,
          {},
          10_000,
        ).then((response) => response.json()),
      );
    } else {
      tasks.push(Promise.resolve(null));
    }

    if (needsDominanceHistory) {
      tasks.push(
        fetchWithTimeout(
          `/api/market-depth/history/flow?${buildFlowQuery({
            symbol: prefs.symbol,
            window: prefs.dominanceWindow,
            scope,
          })}`,
          {},
          10_000,
        ).then((response) => response.json()),
      );
    } else {
      tasks.push(Promise.resolve(null));
    }

    if (needsLargeTradeHistory) {
      tasks.push(
        fetchWithTimeout(
          `/api/market-depth/history/large-trades?${buildLargeTradesQuery({
            symbol: prefs.symbol,
            window: prefs.largeTradeWindow,
            minNotional: prefs.largeTradeThreshold,
            exchange: scope,
          })}`,
          {},
          10_000,
        ).then((response) => response.json()),
      );
    } else {
      tasks.push(Promise.resolve(null));
    }

    void Promise.all(tasks)
      .then(([flowPayload, dominancePayload, largePayload]) => {
        if (cancelled || requestId !== requestIdRef.current) return;

        const failed =
          (needsFlowHistory && !flowPayload?.success) ||
          (needsDominanceHistory && !dominancePayload?.success) ||
          (needsLargeTradeHistory && !largePayload?.success);

        if (failed) {
          setError("HISTORY_FETCH_FAILED");
          setFlowHistory(null);
          setDominanceHistory(null);
          setLargeTradeHistory(null);
          return;
        }

        setFlowHistory(needsFlowHistory ? flowPayload : null);
        setDominanceHistory(needsDominanceHistory ? dominancePayload : null);
        setLargeTradeHistory(needsLargeTradeHistory ? largePayload : null);
        setError(null);
      })
      .catch(() => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setError("HISTORY_FETCH_FAILED");
        setFlowHistory(null);
        setDominanceHistory(null);
        setLargeTradeHistory(null);
      })
      .finally(() => {
        if (!cancelled && requestId === requestIdRef.current) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    hydrated,
    historyKey,
    needsFlowHistory,
    needsDominanceHistory,
    needsLargeTradeHistory,
    prefs.dominanceWindow,
    prefs.flowWindow,
    prefs.largeTradeThreshold,
    prefs.largeTradeWindow,
    prefs.mode,
    prefs.symbol,
  ]);

  return {
    flowHistory,
    dominanceHistory,
    largeTradeHistory,
    loading,
    error,
    needsFlowHistory,
    needsDominanceHistory,
    needsLargeTradeHistory,
  };
}
