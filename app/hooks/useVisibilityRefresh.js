"use client";

import { useEffect, useRef } from "react";

/**
 * Schedules background refresh while the page is active.
 *
 * @param {() => void | Promise<void>} callback
 * @param {{
 *   enabled?: boolean,
 *   intervalMs?: number | null,
 *   throttleMs?: number,
 *   singleFlight?: boolean,
 *   refreshOnFocus?: boolean,
 *   refreshOnVisible?: boolean,
 *   skipWhenHidden?: boolean,
 * }} [options]
 */
export function useVisibilityRefresh(callback, options = {}) {
  const {
    enabled = true,
    intervalMs = null,
    throttleMs = 0,
    singleFlight = false,
    refreshOnFocus = false,
    refreshOnVisible = true,
    skipWhenHidden = true,
  } = options;

  const callbackRef = useRef(callback);
  const lastRunRef = useRef(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return undefined;

    const run = async () => {
      if (skipWhenHidden && document.hidden) return;
      if (throttleMs > 0 && Date.now() - lastRunRef.current < throttleMs) return;
      if (singleFlight && inFlightRef.current) return;

      inFlightRef.current = true;
      lastRunRef.current = Date.now();

      try {
        await callbackRef.current();
      } finally {
        inFlightRef.current = false;
      }
    };

    let intervalId = null;

    const startInterval = () => {
      if (!intervalMs || intervalMs <= 0 || intervalId) return;
      intervalId = window.setInterval(run, intervalMs);
    };

    const stopInterval = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopInterval();
        return;
      }

      startInterval();

      if (refreshOnVisible) {
        void run();
      }
    };

    if (!document.hidden) {
      startInterval();
    }

    if (refreshOnFocus) {
      window.addEventListener("focus", run);
    }

    if (refreshOnVisible) {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      stopInterval();
      if (refreshOnFocus) {
        window.removeEventListener("focus", run);
      }
      if (refreshOnVisible) {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };
  }, [
    enabled,
    intervalMs,
    refreshOnFocus,
    refreshOnVisible,
    singleFlight,
    skipWhenHidden,
    throttleMs,
  ]);
}
