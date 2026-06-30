"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";
import { playNotificationSound } from "../../lib/notification-sound";
import { scheduleAfterPaint } from "../../lib/schedule-after-paint";
import { normalizeNotification } from "../../lib/notifications-shared";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../components/AuthProvider";

const FALLBACK_POLL_MS = 60000;
const TOAST_TTL_MS = 5000;
const TOAST_EXIT_MS = 280;
const TOAST_GROUP_WINDOW_MS = 1500;
const TOAST_SINGLE_DELAY_MS = 450;
const LIST_ENTER_MS = 650;
const INITIAL_SYNC_DELAY_MS = 0;
const FETCH_TIMEOUT_MS = 5000;
const REALTIME_SESSION_WAIT_MS = 2500;

function createToastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function waitForSupabaseSession(maxWaitMs = REALTIME_SESSION_WAIT_MS) {
  const started = Date.now();

  while (Date.now() - started < maxWaitMs) {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      return true;
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 150);
    });
  }

  return false;
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
  const [recentlyAddedIds, setRecentlyAddedIds] = useState([]);

  const knownIdsRef = useRef(new Set());
  const toastedIdsRef = useRef(new Set());
  const initializedRef = useRef(false);
  const initialSyncCompleteRef = useRef(false);
  const syncGenerationRef = useRef(0);
  const pollTimerRef = useRef(null);
  const realtimeConnectedRef = useRef(false);
  const channelRef = useRef(null);
  const toastHideTimerRef = useRef(null);
  const toastBatchTimerRef = useRef(null);
  const toastShowingRef = useRef(false);
  const activeToastRef = useRef(null);
  const notificationPanelOpenRef = useRef(false);
  const pendingToastBatchRef = useRef([]);
  const deferredToastBatchRef = useRef([]);
  const listEnterTimersRef = useRef(new Map());

  const setNotificationPanelOpen = useCallback((open) => {
    notificationPanelOpenRef.current = Boolean(open);
  }, []);

  useEffect(() => {
    activeToastRef.current = activeToast;
  }, [activeToast]);

  const clearToastTimers = useCallback(() => {
    if (toastHideTimerRef.current) {
      window.clearTimeout(toastHideTimerRef.current);
      toastHideTimerRef.current = null;
    }
    if (toastBatchTimerRef.current) {
      window.clearTimeout(toastBatchTimerRef.current);
      toastBatchTimerRef.current = null;
    }
  }, []);

  const markNotificationAsRecentlyAdded = useCallback((notificationId) => {
    if (!notificationId) return;

    setRecentlyAddedIds((current) =>
      current.includes(notificationId) ? current : [...current, notificationId]
    );

    const existingTimer = listEnterTimersRef.current.get(notificationId);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
    }

    const timerId = window.setTimeout(() => {
      listEnterTimersRef.current.delete(notificationId);
      setRecentlyAddedIds((current) => current.filter((item) => item !== notificationId));
    }, LIST_ENTER_MS);

    listEnterTimersRef.current.set(notificationId, timerId);
  }, []);

  const finalizeDismissToast = useCallback(
    (toastId) => {
      if (activeToastRef.current?.id !== toastId) return;

      toastShowingRef.current = false;
      setActiveToast(null);

      if (deferredToastBatchRef.current.length > 0) {
        pendingToastBatchRef.current = [...deferredToastBatchRef.current];
        deferredToastBatchRef.current = [];

        toastBatchTimerRef.current = window.setTimeout(() => {
          toastBatchTimerRef.current = null;
          flushToastBatchRef.current?.();
        }, TOAST_SINGLE_DELAY_MS);
      }
    },
    []
  );

  const beginDismissToast = useCallback(
    (toastId) => {
      if (activeToastRef.current?.id !== toastId || activeToastRef.current?.exiting) return;

      clearToastTimers();
      setActiveToast((current) => (current?.id === toastId ? { ...current, exiting: true } : current));

      window.setTimeout(() => {
        finalizeDismissToast(toastId);
      }, TOAST_EXIT_MS);
    },
    [clearToastTimers, finalizeDismissToast]
  );

  const flushToastBatchRef = useRef(null);

  const flushToastBatch = useCallback(() => {
    toastBatchTimerRef.current = null;

    const batch = pendingToastBatchRef.current;
    pendingToastBatchRef.current = [];

    if (!batch.length || notificationPanelOpenRef.current || toastShowingRef.current) {
      if (batch.length) {
        deferredToastBatchRef.current.push(...batch);
      }
      return;
    }

    const toastPayload =
      batch.length > 1
        ? {
            id: createToastId(),
            kind: "grouped",
            count: batch.length,
            exiting: false,
          }
        : {
            id: createToastId(),
            kind: "single",
            notification: batch[0],
            exiting: false,
          };

    toastShowingRef.current = true;
    setActiveToast(toastPayload);
    playNotificationSound();

    toastHideTimerRef.current = window.setTimeout(() => {
      toastHideTimerRef.current = null;
      beginDismissToast(toastPayload.id);
    }, TOAST_TTL_MS);
  }, [beginDismissToast]);

  flushToastBatchRef.current = flushToastBatch;

  const scheduleToastForNotification = useCallback(
    (notification) => {
      if (notificationPanelOpenRef.current) return;

      if (toastShowingRef.current) {
        deferredToastBatchRef.current.push(notification);
        return;
      }

      pendingToastBatchRef.current.push(notification);

      if (toastBatchTimerRef.current) {
        window.clearTimeout(toastBatchTimerRef.current);
      }

      const delay =
        pendingToastBatchRef.current.length > 1
          ? TOAST_GROUP_WINDOW_MS
          : TOAST_SINGLE_DELAY_MS;

      toastBatchTimerRef.current = window.setTimeout(() => {
        flushToastBatch();
      }, delay);
    },
    [flushToastBatch]
  );

  const dismissToast = useCallback(
    (toastId) => {
      beginDismissToast(toastId);
    },
    [beginDismissToast]
  );

  const stopFallbackPolling = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pushToast = scheduleToastForNotification;

  const registerIncomingNotification = useCallback(
    (rawNotification, { announce = false, bumpUnread = false, animateList = false } = {}) => {
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

      if (animateList || (announce && bumpUnread)) {
        markNotificationAsRecentlyAdded(normalized.id);
      }

      if (!normalized.isRead && bumpUnread) {
        setUnreadCount((count) => count + 1);
      }

      if (announce) {
        if (!initialSyncCompleteRef.current || toastedIdsRef.current.has(normalized.id)) {
          return normalized;
        }

        toastedIdsRef.current.add(normalized.id);

        if (!notificationPanelOpenRef.current) {
          pushToast(normalized);
        }

        setBellShakeKey((value) => value + 1);
      }

      return normalized;
    },
    [markNotificationAsRecentlyAdded, pushToast]
  );

  const syncFromServer = useCallback(
    async ({ announceNew = false, generation = 0 } = {}) => {
      if (!userEmail) return;

      try {
        const response = await fetchWithTimeout(
          "/api/my-notifications?include_read=1&limit=50",
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
    if (pollTimerRef.current || !userEmail || document.hidden) return;

    pollTimerRef.current = window.setInterval(() => {
      if (document.hidden || !userEmail) return;
      void syncFromServer({ announceNew: true });
    }, FALLBACK_POLL_MS);
  }, [syncFromServer, userEmail]);

  const handleRealtimeUpdate = useCallback((payload) => {
    if (!initialSyncCompleteRef.current) return;

    const updated = normalizeNotification(payload.new);
    if (!updated?.id) return;

    knownIdsRef.current.add(updated.id);

    setNotifications((current) => {
      const exists = current.some((item) => item.id === updated.id);

      if (!exists) {
        return [updated, ...current].slice(0, 50);
      }

      return current.map((item) => (item.id === updated.id ? updated : item));
    });

    const wasRead = Boolean(payload.old?.is_read);
    const isRead = Boolean(payload.new?.is_read);

    if (!wasRead && isRead) {
      setUnreadCount((count) => Math.max(0, count - 1));
    } else if (wasRead && !isRead) {
      setUnreadCount((count) => count + 1);
    }
  }, []);

  const handleRealtimeDelete = useCallback((payload) => {
    if (!initialSyncCompleteRef.current) return;

    const deletedId = payload.old?.id;
    if (!deletedId) return;

    knownIdsRef.current.delete(deletedId);
    toastedIdsRef.current.delete(deletedId);

    setNotifications((current) => current.filter((item) => item.id !== deletedId));

    if (!payload.old?.is_read) {
      setUnreadCount((count) => Math.max(0, count - 1));
    }
  }, []);

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

  const deleteNotification = useCallback(
    async (notificationId) => {
      if (!notificationId) return;

      const target = notifications.find((item) => item.id === notificationId);

      setNotifications((current) => current.filter((item) => item.id !== notificationId));
      knownIdsRef.current.delete(notificationId);

      if (target && !target.isRead) {
        setUnreadCount((count) => Math.max(0, count - 1));
      }

      try {
        const response = await fetch("/api/delete-notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ids: [notificationId] }),
        });

        const result = await response.json().catch(() => null);

        if (response.ok && result?.success) {
          setUnreadCount(Number(result.unreadCount || 0));
          return;
        }

        await syncFromServer();
      } catch (err) {
        console.warn("Delete notification skipped:", err?.message || err);
        await syncFromServer();
      }
    },
    [notifications, syncFromServer]
  );

  const deleteAllNotifications = useCallback(async () => {
    setNotifications([]);
    setUnreadCount(0);
    knownIdsRef.current = new Set();

    try {
      const response = await fetch("/api/delete-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ all: true }),
      });

      const result = await response.json().catch(() => null);

      if (response.ok && result?.success) {
        setUnreadCount(Number(result.unreadCount || 0));
        return;
      }

      await syncFromServer();
    } catch (err) {
      console.warn("Delete all notifications skipped:", err?.message || err);
      await syncFromServer();
    }
  }, [syncFromServer]);

  useEffect(() => {
    if (!authResolved) {
      syncGenerationRef.current += 1;
      setNotifications([]);
      setUnreadCount(0);
      setActiveToast(null);
      pendingToastBatchRef.current = [];
      deferredToastBatchRef.current = [];
      toastShowingRef.current = false;
      clearToastTimers();
      listEnterTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      listEnterTimersRef.current.clear();
      setRecentlyAddedIds([]);
      knownIdsRef.current = new Set();
      toastedIdsRef.current = new Set();
      initializedRef.current = false;
      initialSyncCompleteRef.current = false;
      setRealtimeConnected(false);
      stopFallbackPolling();
      return;
    }

    if (!userEmail) {
      setLoading(false);
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

      void (async () => {
        const sessionReady = await waitForSupabaseSession();
        if (!active) return;

        if (!sessionReady) {
          console.warn("Notification realtime waiting for Supabase session; using fallback polling.");
          startFallbackPolling();
        }

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
                animateList: true,
              });
            }
          )
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "notifications",
              filter: `user_email=eq.${userEmail}`,
            },
            handleRealtimeUpdate
          )
          .on(
            "postgres_changes",
            {
              event: "DELETE",
              schema: "public",
              table: "notifications",
              filter: `user_email=eq.${userEmail}`,
            },
            handleRealtimeDelete
          )
          .subscribe((status) => {
            if (!active) return;

            if (status === "SUBSCRIBED") {
              realtimeConnectedRef.current = true;
              setRealtimeConnected(true);
              stopFallbackPolling();
              return;
            }

            if (
              status === "CLOSED" ||
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT"
            ) {
              realtimeConnectedRef.current = false;
              setRealtimeConnected(false);
              if (!document.hidden) {
                startFallbackPolling();
              }
            }
          });
      })();
    }, INITIAL_SYNC_DELAY_MS);

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopFallbackPolling();
        return;
      }

      void syncFromServer({
        announceNew: true,
        generation: syncGenerationRef.current,
      });

      if (!realtimeConnectedRef.current) {
        startFallbackPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      active = false;
      cancelDeferred();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      syncGenerationRef.current += 1;
      stopFallbackPolling();
      clearToastTimers();
      pendingToastBatchRef.current = [];
      deferredToastBatchRef.current = [];
      toastShowingRef.current = false;
      listEnterTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      listEnterTimersRef.current.clear();
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      setRealtimeConnected(false);
      realtimeConnectedRef.current = false;
    };
  }, [
    authResolved,
    userEmail,
    clearToastTimers,
    handleRealtimeDelete,
    handleRealtimeUpdate,
    registerIncomingNotification,
    startFallbackPolling,
    stopFallbackPolling,
    syncFromServer,
  ]);

  const sortedNotifications = useMemo(
    () =>
      [...notifications].sort(
        (left, right) =>
          new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime()
      ),
    [notifications]
  );

  const unreadAnalysisCount = useMemo(
    () => sortedNotifications.filter((item) => !item.isRead && item.type === "analysis-reply").length,
    [sortedNotifications]
  );

  return {
    notifications: sortedNotifications,
    unreadCount,
    unreadAnalysisCount,
    activeToast,
    bellShakeKey,
    realtimeConnected,
    loading,
    recentlyAddedIds,
    dismissToast,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    refreshNotifications: () => syncFromServer(),
    setNotificationPanelOpen,
  };
}
