"use client";

import { useEffect, useRef } from "react";

/**
 * Schedules background refresh while the page is active.
 *
 * @param {() => void} callback
 * @param {{
 *   enabled?: boolean,
 *   intervalMs?: number | null,
 *   refreshOnFocus?: boolean,
 *   refreshOnVisible?: boolean,
 *   skipWhenHidden?: boolean,
 * }} [options]
 */
export function useVisibilityRefresh(callback, options = {}) {
  const {
    enabled = true,
    intervalMs = null,
    refreshOnFocus = false,
    refreshOnVisible = true,
    skipWhenHidden = true,
  } = options;

  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return undefined;

    const run = () => {
      if (skipWhenHidden && document.hidden) return;
      callbackRef.current();
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
        callbackRef.current();
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
  }, [enabled, intervalMs, refreshOnFocus, refreshOnVisible, skipWhenHidden]);
}
