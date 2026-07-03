"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithTimeout } from "../../lib/fetch-with-timeout";
import {
  installNotificationSoundListener,
  installNotificationSoundTestHook,
  setupBrowserSoundUnlock,
} from "../../lib/notification-sound-manager";
import {
  clearNotificationCenterRendered,
  handleNotificationCenterRealtimeEvent,
  installNotificationCenterTestHook,
  markNotificationCenterRendered,
  registerNotificationCenterBridge,
  unregisterNotificationCenterBridge,
} from "../../lib/notification-center";
import { scheduleAfterPaint } from "../../lib/schedule-after-paint";
import { normalizeNotification, countUnreadNotifications, isNotificationUnread } from "../../lib/notifications-shared";
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

function logNotificationMetrics(label, list) {
  console.log("notifications:count", { label, count: list.length });
  console.log("notifications:unread-count", {
    label,
    unreadCount: countUnreadNotifications(list),
  });
}

export function useSiteNotifications() {
  const { authResolved, user } = useAuth();
  const userEmail = String(user?.email || "").trim().toLowerCase();

  const [notifications, setNotifications] = useState([]);
  const [activeToast, setActiveToast] = useState(null);
  const [bellShakeKey, setBellShakeKey] = useState(0);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recentlyAddedIds, setRecentlyAddedIds] = useState([]);

  const knownIdsRef = useRef(new Set());
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
  const mutationEpochRef = useRef(0);
  const mutationInFlightRef = useRef(false);
  const clearedAllNotificationsRef = useRef(false);
  const markedAllReadAtRef = useRef(0);

  const applyServerSnapshot = useCallback((serverNotifications) => {
    let list = (serverNotifications || []).filter(Boolean);

    if (clearedAllNotificationsRef.current && list.length > 0) {
      setNotifications([]);
      knownIdsRef.current = new Set();
      return [];
    }

    if (clearedAllNotificationsRef.current && list.length === 0) {
      clearedAllNotificationsRef.current = false;
    }

    if (Date.now() - markedAllReadAtRef.current < 8000) {
      list = list.map((item) => ({ ...item, isRead: true }));
    }

    knownIdsRef.current = new Set(list.map((item) => item.id).filter(Boolean));
    setNotifications(list);
    return list;
  }, []);

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
    (rawNotification, { bumpUnread = false, animateList = false } = {}) => {
      if (mutationInFlightRef.current || clearedAllNotificationsRef.current) {
        return null;
      }

      const normalized = normalizeNotification(rawNotification);
      if (!normalized?.id) return null;

      const alreadyKnown = knownIdsRef.current.has(normalized.id);

      if (!alreadyKnown) {
        knownIdsRef.current.add(normalized.id);

        setNotifications((current) => {
          const withoutDuplicate = current.filter((item) => item.id !== normalized.id);
          return [normalized, ...withoutDuplicate].slice(0, 50);
        });

        if (animateList || bumpUnread) {
          markNotificationAsRecentlyAdded(normalized.id);
        }
      }

      return normalized;
    },
    [markNotificationAsRecentlyAdded]
  );

  const processNotificationCenterEvent = useCallback(
    (rawRow, { source = "realtime" } = {}) => {
      if (!initialSyncCompleteRef.current) return null;
      if (mutationInFlightRef.current || clearedAllNotificationsRef.current) return null;

      registerIncomingNotification(rawRow, {
        bumpUnread: true,
        animateList: true,
      });

      void handleNotificationCenterRealtimeEvent(rawRow, { source });
      return rawRow;
    },
    [registerIncomingNotification]
  );

  const syncFromServer = useCallback(
    async ({ announceNew = false, generation = 0, mutationEpoch = 0, fresh = false } = {}) => {
      if (!userEmail) return null;

      if (mutationInFlightRef.current && !mutationEpoch) {
        return null;
      }

      if (mutationEpoch && mutationEpoch !== mutationEpochRef.current) {
        return null;
      }

      try {
        const response = await fetchWithTimeout(
          `/api/my-notifications?include_read=1&limit=50&fresh=${fresh ? "1" : "0"}&_=${Date.now()}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
          },
          FETCH_TIMEOUT_MS
        );

        const result = await response.json().catch(() => null);

        if (!response.ok || !result?.success) return null;
        if (generation && generation !== syncGenerationRef.current) return null;
        if (mutationEpoch && mutationEpoch !== mutationEpochRef.current) return null;

        const serverNotifications = (result.notifications || []).filter(Boolean);
        const previousKnownIds = new Set(knownIdsRef.current);

        if (!initializedRef.current) {
          serverNotifications.forEach((item) => {
            if (item?.id) {
              markNotificationCenterRendered(item.id);
            }
          });
          applyServerSnapshot(serverNotifications);
          initializedRef.current = true;
          initialSyncCompleteRef.current = true;
          return serverNotifications;
        }

        applyServerSnapshot(serverNotifications);

        if (announceNew && initialSyncCompleteRef.current) {
          serverNotifications.forEach((item) => {
            if (!item?.id || item.isRead || previousKnownIds.has(item.id)) return;

            processNotificationCenterEvent(
              {
                id: item.id,
                user_email: item.userEmail,
                title: item.title,
                message: item.message,
                type: item.type,
                notification_key: item.notificationKey,
                url: item.href,
                metadata: item.metadata,
                is_read: item.isRead,
                created_at: item.createdAt,
              },
              { source: "polling" }
            );
          });
        }

        return serverNotifications;
      } catch (err) {
        console.warn("Notification sync skipped:", err?.message || err);
        return null;
      }
    },
    [applyServerSnapshot, processNotificationCenterEvent, userEmail]
  );

  const refetchNotifications = useCallback(async () => {
    return syncFromServer({ mutationEpoch: mutationEpochRef.current, fresh: true });
  }, [syncFromServer]);

  const startFallbackPolling = useCallback(() => {
    if (pollTimerRef.current || !userEmail || document.hidden) return;

    pollTimerRef.current = window.setInterval(() => {
      if (document.hidden || !userEmail || mutationInFlightRef.current) return;
      void syncFromServer({ announceNew: true });
    }, FALLBACK_POLL_MS);
  }, [syncFromServer, userEmail]);

  const handleRealtimeUpdate = useCallback((payload) => {
    if (!initialSyncCompleteRef.current || mutationInFlightRef.current || clearedAllNotificationsRef.current) {
      return;
    }

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
  }, []);

  const handleRealtimeDelete = useCallback((payload) => {
    if (!initialSyncCompleteRef.current || clearedAllNotificationsRef.current) return;

    const deletedId = payload.old?.id;
    if (!deletedId) return;

    knownIdsRef.current.delete(deletedId);

    setNotifications((current) => current.filter((item) => item.id !== deletedId));
  }, []);

  const runNotificationMutation = useCallback(
    async (mutator) => {
      const epoch = mutationEpochRef.current + 1;
      mutationEpochRef.current = epoch;
      mutationInFlightRef.current = true;

      try {
        await mutator(epoch);
      } finally {
        mutationInFlightRef.current = false;
        await syncFromServer({ mutationEpoch: epoch, fresh: true });
      }
    },
    [syncFromServer]
  );

  const markAsRead = useCallback(
    async (notificationId) => {
      if (!notificationId) return;

      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, isRead: true } : item
        )
      );

      await runNotificationMutation(async () => {
        try {
          const response = await fetch("/api/mark-notifications-read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ ids: [notificationId] }),
          });

          if (!response.ok) {
            console.warn("Mark notification read failed:", response.status);
          }
        } catch (err) {
          console.warn("Mark notification read skipped:", err?.message || err);
        }
      });
    },
    [runNotificationMutation]
  );

  const markAllAsRead = useCallback(() => {
    markedAllReadAtRef.current = Date.now();

    setNotifications((current) => {
      const next = current.map((item) => ({ ...item, isRead: true }));
      logNotificationMetrics("after-mark-read-local", next);
      console.log("notifications:after-mark-read");
      return next;
    });

    void (async () => {
      try {
        const response = await fetch("/api/mark-notifications-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ all: true }),
        });

        if (!response.ok) {
          console.warn("Mark all notifications read failed:", response.status);
          return;
        }

        void syncFromServer({ fresh: true });
      } catch (err) {
        console.warn("Mark all notifications read skipped:", err?.message || err);
      }
    })();
  }, [syncFromServer]);

  const deleteNotification = useCallback(
    async (notificationId) => {
      if (!notificationId) return;

      setNotifications((current) => current.filter((item) => item.id !== notificationId));
      knownIdsRef.current.delete(notificationId);

      await runNotificationMutation(async () => {
        try {
          const response = await fetch("/api/delete-notifications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ ids: [notificationId] }),
          });

          if (!response.ok) {
            console.warn("Delete notification failed:", response.status);
          }
        } catch (err) {
          console.warn("Delete notification skipped:", err?.message || err);
        }
      });
    },
    [runNotificationMutation]
  );

  const deleteAllNotifications = useCallback(async () => {
    clearedAllNotificationsRef.current = true;
    setNotifications([]);
    knownIdsRef.current = new Set();
    clearNotificationCenterRendered();
    logNotificationMetrics("after-delete-all-local", []);
    console.log("notifications:after-delete-all");

    await runNotificationMutation(async () => {
      try {
        const response = await fetch("/api/delete-notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ all: true }),
        });

        if (!response.ok) {
          console.warn("Delete all notifications failed:", response.status);
        }
      } catch (err) {
        console.warn("Delete all notifications skipped:", err?.message || err);
      }
    });
  }, [runNotificationMutation]);

  useEffect(() => {
    registerNotificationCenterBridge({
      showToast: (notification) => {
        if (!notificationPanelOpenRef.current) {
          pushToast(notification);
        }
      },
      registerNotification: (rawNotification, options) =>
        registerIncomingNotification(rawNotification, options),
      isAuthenticated: () => Boolean(userEmail),
      shouldSkipToast: () => notificationPanelOpenRef.current,
      bumpBell: () => setBellShakeKey((value) => value + 1),
    });

    const removeCenterTestHook = installNotificationCenterTestHook();

    return () => {
      unregisterNotificationCenterBridge();
      removeCenterTestHook();
    };
  }, [pushToast, registerIncomingNotification, userEmail]);

  useEffect(() => {
    if (!authResolved) {
      syncGenerationRef.current += 1;
      setNotifications([]);
      setActiveToast(null);
      pendingToastBatchRef.current = [];
      deferredToastBatchRef.current = [];
      toastShowingRef.current = false;
      clearToastTimers();
      listEnterTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      listEnterTimersRef.current.clear();
      setRecentlyAddedIds([]);
      knownIdsRef.current = new Set();
      clearNotificationCenterRendered();
      mutationEpochRef.current = 0;
      mutationInFlightRef.current = false;
      clearedAllNotificationsRef.current = false;
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

    setupBrowserSoundUnlock();
    const removeSoundTestHook = installNotificationSoundTestHook();
    const removeNotificationSoundListener = installNotificationSoundListener();

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
              processNotificationCenterEvent(payload.new, { source: "realtime" });
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

      if (mutationInFlightRef.current) return;

      void syncFromServer({
        generation: syncGenerationRef.current,
        announceNew: true,
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
      removeSoundTestHook();
      removeNotificationSoundListener();
    };
  }, [
    authResolved,
    userEmail,
    clearToastTimers,
    handleRealtimeDelete,
    handleRealtimeUpdate,
    processNotificationCenterEvent,
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

  const unreadCount = useMemo(
    () => countUnreadNotifications(sortedNotifications),
    [sortedNotifications]
  );

  useEffect(() => {
    logNotificationMetrics("state", notifications);
  }, [notifications]);

  const unreadAnalysisCount = useMemo(
    () =>
      sortedNotifications.filter(
        (item) => isNotificationUnread(item) && item.type === "analysis-reply"
      ).length,
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
    refreshNotifications: refetchNotifications,
    setNotificationPanelOpen,
  };
}
