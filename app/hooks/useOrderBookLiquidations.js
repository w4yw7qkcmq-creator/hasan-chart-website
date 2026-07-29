"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout.js";

const REFRESH_MS = 25_000;

export function useOrderBookLiquidations({ hydrated }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!hydrated) {
      setData(null);
      setLoading(false);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    let timer;

    const load = ({ background = false } = {}) => {
      const requestId = ++requestIdRef.current;
      if (!background) {
        setLoading(true);
        setError(null);
      }

      void fetchWithTimeout("/api/market-depth/liquidations", {}, 10_000)
        .then((response) => response.json())
        .then((payload) => {
          if (cancelled || requestId !== requestIdRef.current) return;
          if (!payload?.success || payload?.available === false) {
            setData(payload);
            setError("UNAVAILABLE");
            return;
          }
          setData(payload);
          setError(null);
        })
        .catch(() => {
          if (cancelled || requestId !== requestIdRef.current) return;
          setError("FETCH_FAILED");
          setData(null);
        })
        .finally(() => {
          if (!cancelled && requestId === requestIdRef.current) {
            setLoading(false);
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

  return { data, loading, error };
}
