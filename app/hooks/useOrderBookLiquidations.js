"use client";

import { useEffect, useRef, useState } from "react";
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
  return payload?.success === true && payload?.available !== false && hasDisplayableData(payload);
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

    let cancelled = false;
    let timer;

    const load = ({ background = false } = {}) => {
      const requestId = ++requestIdRef.current;
      const hasPriorData = lastSuccessfulRef.current != null;

      if (background || hasPriorData) {
        setIsRefreshing(true);
      } else {
        setInitialLoading(true);
        setError(null);
      }

      void fetchWithTimeout("/api/market-depth/liquidations", {}, LIQUIDATIONS_CLIENT_TIMEOUT_MS)
        .then((response) => response.json())
        .then((payload) => {
          if (cancelled || requestId !== requestIdRef.current) return;

          if (isSuccessfulPayload(payload)) {
            lastSuccessfulRef.current = payload;
            setData(payload);
            setError(null);
            return;
          }

          if (lastSuccessfulRef.current) {
            setData({ ...lastSuccessfulRef.current, stale: true });
            setError("REFRESH_FAILED");
            return;
          }

          setData(payload);
          setError("UNAVAILABLE");
        })
        .catch(() => {
          if (cancelled || requestId !== requestIdRef.current) return;

          if (lastSuccessfulRef.current) {
            setData({ ...lastSuccessfulRef.current, stale: true });
            setError("REFRESH_FAILED");
            return;
          }

          setError("FETCH_FAILED");
          setData(null);
        })
        .finally(() => {
          if (!cancelled && requestId === requestIdRef.current) {
            setInitialLoading(false);
            setIsRefreshing(false);
          }
        });
    };

    load();
    timer = setInterval(() => load({ background: true }), REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [hydrated]);

  return { data, initialLoading, isRefreshing, error };
}
