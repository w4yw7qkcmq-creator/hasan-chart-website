"use client";
import { useEffect, useRef, useState } from "react";
import { createAdaptivePoller } from "../../lib/client/adaptive-poller.js";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout.js";
const REFRESH_MS = 25_000;
export const LIQUIDATIONS_CLIENT_TIMEOUT_MS = 18_000;
function hasDisplayableData(payload) {
  if (!payload?.summary) return false;
  return Object.values(payload.summary).some(
    (bucket) => bucket?.total != null && Number.isFinite(Number(bucket.total)),
  );
}
function isSuccessfulPayload(payload) {
  return (
    payload?.success === true &&
    payload?.available !== false &&
    hasDisplayableData(payload)
  );
}
export function useOrderBookLiquidations({ hydrated }) {
  const [data, setData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const lastSuccessfulRef = useRef(null);
  const requestIdRef = useRef(0);
  useEffect(() => {
    if (!hydrated) {
      setData(null);
      setInitialLoading(false);
      setIsRefreshing(false);
      setError(null);
      lastSuccessfulRef.current = null;
      return undefined;
    }
    const load = ({ background = false, signal } = {}) => {
      const requestId = ++requestIdRef.current;
      const hasPriorData = lastSuccessfulRef.current != null;
      if (background || hasPriorData) {
        setIsRefreshing(true);
      } else {
        setInitialLoading(true);
        setError(null);
      }
      return fetchWithTimeout(
        "/api/market-depth/liquidations",
        { signal },
        LIQUIDATIONS_CLIENT_TIMEOUT_MS,
      )
        .then((response) => response.json())
        .then((payload) => {
          if (requestId !== requestIdRef.current) return;
          if (isSuccessfulPayload(payload)) {
            lastSuccessfulRef.current = payload;
            setData(payload);
            setError(null);
            return;
          }
          if (lastSuccessfulRef.current) {
            setData({ ...lastSuccessfulRef.current, stale: true });
            setError("REFRESH_FAILED");
            throw new Error("REFRESH_FAILED");
          }
          setData(payload);
          setError("UNAVAILABLE");
          throw new Error("UNAVAILABLE");
        })
        .catch((fetchError) => {
          if (fetchError?.name === "AbortError") return;
          if (requestId !== requestIdRef.current) return;
          if (lastSuccessfulRef.current) {
            setData({ ...lastSuccessfulRef.current, stale: true });
            setError("REFRESH_FAILED");
            throw fetchError;
          }
          setError("FETCH_FAILED");
          setData(null);
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
  }, [hydrated]);
  return { data, initialLoading, isRefreshing, error };
}
