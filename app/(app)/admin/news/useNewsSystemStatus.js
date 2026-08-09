"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { adminFetch } from "../../../../lib/admin-fetch";
import { NEWS_SYSTEM_REFRESH_MS } from "./news-system-display";

async function fetchNewsSystemStatus(signal) {
  const [statusRes, summaryRes] = await Promise.all([
    adminFetch("/api/admin/news/system-status", { signal }),
    adminFetch("/api/admin/news/system-status?view=summary", { signal }),
  ]);
  const statusJson = await statusRes.json().catch(() => ({}));
  const summaryJson = await summaryRes.json().catch(() => ({}));

  if (!statusRes.ok || !statusJson?.success) {
    throw new Error(statusJson?.error || "بيانات المراقبة غير متاحة مؤقتًا");
  }

  return {
    status: statusJson.status || statusJson,
    summary: summaryJson.summary || null,
  };
}

export function useNewsSystemStatus() {
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const [nowTick, setNowTick] = useState(Date.now());

  const inFlightRef = useRef(false);
  const abortRef = useRef(null);
  const hasDataRef = useRef(false);

  const applySuccess = useCallback((payload) => {
    setStatus(payload.status);
    setSummary(payload.summary);
    setLastUpdatedAt(Date.now());
    setError("");
    setRefreshWarning("");
    hasDataRef.current = true;
  }, []);

  const load = useCallback(
    async ({ silent = false, force = false } = {}) => {
      if (inFlightRef.current && !force) return;
      if (abortRef.current) abortRef.current.abort();

      const controller = new AbortController();
      abortRef.current = controller;
      inFlightRef.current = true;

      if (!silent && !hasDataRef.current) {
        setLoading(true);
        setError("");
      }

      try {
        const payload = await fetchNewsSystemStatus(controller.signal);
        if (controller.signal.aborted) return;
        applySuccess(payload);
      } catch (loadError) {
        if (controller.signal.aborted || loadError?.name === "AbortError") return;
        const message = loadError?.message || "بيانات المراقبة غير متاحة مؤقتًا";
        if (hasDataRef.current) {
          setRefreshWarning("تعذر التحديث الأخير");
        } else {
          setError(message);
        }
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
        inFlightRef.current = false;
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [applySuccess]
  );

  useEffect(() => {
    load({ silent: false });
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [load]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      load({ silent: true });
    }, NEWS_SYSTEM_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, [load]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [load]);

  useEffect(() => {
    const tickId = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(tickId);
  }, []);

  return {
    status,
    summary,
    loading,
    error,
    refreshWarning,
    lastUpdatedAt,
    nowTick,
    retry: () => load({ silent: false, force: true }),
  };
}
