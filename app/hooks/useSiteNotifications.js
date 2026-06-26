"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";
import { scheduleAfterPaint } from "../../lib/schedule-after-paint";
import { normalizeNotification } from "../../lib/notifications-shared";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../components/AuthProvider";

const FALLBACK_POLL_MS = 45000;
const TOAST_TTL_MS = 6500;
const TOAST_GAP_MS = 450;
const INITIAL_SYNC_DELAY_MS = 2000;
const FETCH_TIMEOUT_MS = 5000;

function createToastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useSiteNotifications() {
  const { authResolved, user } = useAuth();
  const userEmail = String(user?.email || "").trim().toLowerCase();

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeToast, setActiveToast] = useState(null);
  const [bellShakeKey, setBellShakeKey] = useState(0);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  const knownIdsRef = useRef(new Set());
  const toastedIdsRef = useRef(new Set());
  const initializedRef = useRef(false);
  const initialSyncCompleteRef = useRef(false);
  const syncGenerationRef = useRef(0);
  const pollTimerRef = useRef(null);
  const channelRef = useRef(null);
  const toastQueueRef = useRef([]);
  const toastHideTimerRef = useRef(null);
  const toastGapTimerRef = useRef(null);
  const toastShowingRef = useRef(false);
  const activeToastRef = useRef(null);

  useEffect(() => {
    activeToastRef.current = activeToast;
  }, [activeToast]);

  const clearToastTimers = useCallback(() => {
    if (toastHideTimerRef.current) {
      window.clearTimeout(toastHideTimerRef.current);
      toastHideTimerRef.current = null;
    }
    if (toastGapTimerRef.current) {
      window.clearTimeout(toastGapTimerRef.current);
      toastGapTimerRef.current = null;
    }
  }, []);

  const showNextToast = useCallback(() => {
    if (toastShowingRef.current) return;

    const next = toastQueueRef.current.shift();
    if (!next) {
      toastShowingRef.current = false;
      setActiveToast(null);
      return;
    }

    toastShowingRef.current = true;
    setActiveToast(next);

    toastHideTimerRef.current = window.setTimeout(() => {
      toastHideTimerRef.current = null;
      toastShowingRef.current = false;
      setActiveToast(null);

      if (toastQueueRef.current.length > 0) {
        toastGapTimerRef.current = window.setTimeout(() => {
          toastGapTimerRef.current = null;
          showNextToast();
        }, TOAST_GAP_MS);
      }
    }, TOAST_TTL_MS);
  }, []);

  const isToastCycleActive = useCallback(() => {
    return (
      toastShowingRef.current ||
      Boolean(toastHideTimerRef.current) ||
      Boolean(toastGapTimerRef.current)
    );
  }, []);

  const enqueueToast = useCallback(
    (notification) => {
      toastQueueRef.current.push({
        id: createToastId(),
        notification,
      });

      if (!isToastCycleActive()) {
        showNextToast();
      }
    },
    [isToastCycleActive, showNextToast]
  );

  const dismissToast = useCallback(
    (toastId) => {
      toastQueueRef.current = toastQueueRef.current.filter((item) => item.id !== toastId);

      if (activeToastRef.current?.id !== toastId) return;

      clearToastTimers();
      toastShowingRef.current = false;
      setActiveToast(null);

      if (toastQueueRef.current.length > 0) {
        toastGapTimerRef.current = window.setTimeout(() => {
          toastGapTimerRef.current = null;
          showNextToast();
        }, TOAST_GAP_MS);
      }
    },
    [clearToastTimers, showNextToast]
  );

  const stopFallbackPolling = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pushToast = enqueueToast;

  const registerIncomingNotification = useCallback(
    (rawNotification, { announce = false, bumpUnread = false } = {}) => {
      const normalized = normalizeNotification(rawNotification);
      if (!normalized?.id) return null;

      if (knownIdsRef.current.has(normalized.id)) {
        return null;
      }

      knownIdsRef.current.add(normalized.id);

      setNotifications((current) => {
        const withoutDuplicate = current.filter((item) => item.id !== normalized.id);
        return [normalized, ...withoutDuplicate].slice(0, 50);
      });

      if (!normalized.isRead && bumpUnread) {
        setUnreadCount((count) => count + 1);
      }

      if (announce) {
        if (!initialSyncCompleteRef.current || toastedIdsRef.current.has(normalized.id)) {
          return normalized;
        }

        toastedIdsRef.current.add(normalized.id);
        pushToast(normalized);
        setBellShakeKey((value) => value + 1);
      }

      return normalized;
    },
    [pushToast]
  );

  const syncFromServer = useCallback(
    async ({ announceNew = false, generation = 0 } = {}) => {
      if (!userEmail) return;

      try {
        const response = await fetchWithTimeout(
          "/api/my-notifications?include_read=1&limit=30",
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          },
          FETCH_TIMEOUT_MS
        );

        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.success) return;
        if (generation && generation !== syncGenerationRef.current) return;

        const serverNotifications = (result.notifications || []).filter(Boolean);

        if (!initializedRef.current) {
          serverNotifications.forEach((item) => {
            if (item?.id) {
              knownIdsRef.current.add(item.id);
              toastedIdsRef.current.add(item.id);
            }
          });
          setNotifications(serverNotifications);
          setUnreadCount(Number(result.unreadCount || 0));
          initializedRef.current = true;
          initialSyncCompleteRef.current = true;
          return;
        }

        setNotifications(serverNotifications);
        setUnreadCount(Number(result.unreadCount || 0));

        if (announceNew && initialSyncCompleteRef.current) {
          serverNotifications.forEach((item) => {
            if (!item?.id || item.isRead || knownIdsRef.current.has(item.id)) return;

            registerIncomingNotification(
              {
                id: item.id,
                user_email: item.userEmail,
                title: item.title,
                message: item.message,
                type: item.type,
                is_read: item.isRead,
                created_at: item.createdAt,
              },
              { announce: true, bumpUnread: false }
            );
          });

          setUnreadCount(Number(result.unreadCount || 0));
          setNotifications(serverNotifications);
          serverNotifications.forEach((item) => {
            if (item?.id) knownIdsRef.current.add(item.id);
          });
          return;
        }

        serverNotifications.forEach((item) => {
          if (item?.id) knownIdsRef.current.add(item.id);
        });
      } catch (err) {
        console.warn("Notification sync skipped:", err?.message || err);
      }
    },
    [registerIncomingNotification, userEmail]
  );

  const startFallbackPolling = useCallback(() => {
    if (pollTimerRef.current) return;

    pollTimerRef.current = window.setInterval(() => {
      void syncFromServer({ announceNew: true });
    }, FALLBACK_POLL_MS);
  }, [syncFromServer]);

  const markAsRead = useCallback(
    async (notificationId) => {
      if (!notificationId) return;

      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, isRead: true } : item
        )
      );
      setUnreadCount((count) => Math.max(0, count - 1));

      try {
        const response = await fetch("/api/mark-notifications-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ids: [notificationId] }),
        });

        const result = await response.json().catch(() => null);

        if (response.ok && result?.success) {
          setUnreadCount(Number(result.unreadCount || 0));
        }
      } catch (err) {
        console.warn("Mark notification read skipped:", err?.message || err);
      }
    },
    []
  );

  const markAllAsRead = useCallback(async () => {
    setNotifications((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);

    try {
      const response = await fetch("/api/mark-notifications-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ all: true }),
      });

      const result = await response.json().catch(() => null);

      if (response.ok && result?.success) {
        setUnreadCount(Number(result.unreadCount || 0));
      }
    } catch (err) {
      console.warn("Mark all notifications read skipped:", err?.message || err);
    }
  }, []);

  useEffect(() => {
    if (!authResolved) {
      syncGenerationRef.current += 1;
      setNotifications([]);
      setUnreadCount(0);
      setActiveToast(null);
      toastQueueRef.current = [];
      toastShowingRef.current = false;
      clearToastTimers();
      knownIdsRef.current = new Set();
      toastedIdsRef.current = new Set();
      initializedRef.current = false;
      initialSyncCompleteRef.current = false;
      setRealtimeConnected(false);
      stopFallbackPolling();
      return;
    }

    if (!userEmail) {
      stopFallbackPolling();
      return;
    }

    let active = true;
    const generation = syncGenerationRef.current + 1;
    syncGenerationRef.current = generation;
    setLoading(true);

    const cancelDeferred = scheduleAfterPaint(() => {
      if (!active) return;

      void syncFromServer({ generation }).finally(() => {
        if (active) setLoading(false);
      });

      channelRef.current = supabase
        .channel(`site-notifications-${userEmail}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_email=eq.${userEmail}`,
          },
          (payload) => {
            if (!initialSyncCompleteRef.current) return;

            registerIncomingNotification(payload.new, {
              announce: true,
              bumpUnread: true,
            });
          }
        )
        .subscribe((status) => {
          if (!active) return;

          if (status === "SUBSCRIBED") {
            setRealtimeConnected(true);
            stopFallbackPolling();
            return;
          }

          if (
            status === "CLOSED" ||
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT"
          ) {
            setRealtimeConnected(false);
            startFallbackPolling();
          }
        });
    }, INITIAL_SYNC_DELAY_MS);

    return () => {
      active = false;
      cancelDeferred();
      syncGenerationRef.current += 1;
      stopFallbackPolling();
      clearToastTimers();
      toastQueueRef.current = [];
      toastShowingRef.current = false;
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setRealtimeConnected(false);
    };
  }, [
    authResolved,
    userEmail,
    clearToastTimers,
    registerIncomingNotification,
    startFallbackPolling,
    stopFallbackPolling,
    syncFromServer,
  ]);

  const unreadAnalysisCount = useMemo(
    () => notifications.filter((item) => !item.isRead && item.type === "analysis-reply").length,
    [notifications]
  );

  return {
    notifications,
    unreadCount,
    unreadAnalysisCount,
    activeToast,
    bellShakeKey,
    realtimeConnected,
    loading,
    dismissToast,
    markAsRead,
    markAllAsRead,
    refreshNotifications: () => syncFromServer(),
  };
}
