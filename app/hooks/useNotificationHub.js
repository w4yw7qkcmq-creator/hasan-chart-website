"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  emitNotificationHubBulkRead,
  emitNotificationHubClear,
  emitNotificationHubPatch,
  emitNotificationHubRemove,
  subscribeNotificationHub,
} from "../../lib/notification-hub-events";
import {
  enrichHubNotification,
  matchesHubFilters,
  sortHubNotifications,
} from "../../lib/notification-hub-registry";
const PAGE_SIZE = 20;
async function parseJsonResponse(response) {
  return response.json().catch(() => null);
}
export function useNotificationHub() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [search, setSearch] = useState("");
  const [filterKey, setFilterKey] = useState("all");
  const [filterRead, setFilterRead] = useState("all");
  const [error, setError] = useState("");
  const filtersRef = useRef({
    search: "",
    filterKey: "all",
    filterRead: "all",
  });
  const requestGenerationRef = useRef(0);
  useEffect(() => {
    filtersRef.current = { search, filterKey, filterRead };
  }, [search, filterKey, filterRead]);
  const buildFeedQuery = useCallback(
    ({ cursor = null } = {}) => {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        key: filterKey,
        read: filterRead,
      });
      if (search.trim()) {
        params.set("search", search.trim());
      }
      if (cursor) {
        params.set("cursor", cursor);
      }
      return `/api/notification-hub/feed?${params.toString()}`;
    },
    [filterKey, filterRead, search],
  );
  const fetchFeed = useCallback(
    async ({ append = false, cursor = null } = {}) => {
      const generation = requestGenerationRef.current + 1;
      requestGenerationRef.current = generation;
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError("");
      }
      try {
        const response = await fetch(buildFeedQuery({ cursor }), {
          method: "GET",
          credentials: "include",
          cache: "no-store",
        });
        const result = await parseJsonResponse(response);
        if (!response.ok || !result?.success) {
          throw new Error(result?.error || "تعذر تحميل الإشعارات");
        }
        if (generation !== requestGenerationRef.current) {
          return null;
        }
        const incoming = (result.items || []).filter(Boolean);
        setItems((current) =>
          sortHubNotifications(
            append ? mergeHubItems(current, incoming) : incoming,
          ),
        );
        setHasMore(Boolean(result.hasMore));
        setNextCursor(result.nextCursor || null);
        setUnreadCount(Number(result.unreadCount || 0));
        return result;
      } catch (fetchError) {
        if (generation === requestGenerationRef.current) {
          setError(fetchError?.message || "تعذر تحميل الإشعارات");
        }
        return null;
      } finally {
        if (generation === requestGenerationRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [buildFeedQuery],
  );
  useEffect(() => {
    void fetchFeed({ append: false });
  }, [fetchFeed]);
  useEffect(() => {
    return subscribeNotificationHub((event) => {
      const filters = filtersRef.current;
      if (event.type === "upsert" && event.notification) {
        const notification = enrichHubNotification(event.notification);
        if (!notification?.id) return;
        setItems((current) => {
          const exists = current.some((item) => item.id === notification.id);
          const matches = matchesHubFilters(notification, filters);
          if (!exists && !notification.isRead) {
            setUnreadCount((count) => count + 1);
          }
          if (!exists && !matches) {
            return current;
          }
          const without = current.filter((item) => item.id !== notification.id);
          return matches
            ? sortHubNotifications([notification, ...without])
            : without;
        });
        return;
      }
      if (event.type === "patch" && event.id) {
        setItems((current) =>
          sortHubNotifications(
            current.map((item) =>
              item.id === event.id
                ? enrichHubNotification({ ...item, ...event.patch })
                : item,
            ),
          ),
        );
        return;
      }
      if (event.type === "remove" && event.id) {
        setItems((current) => {
          const target = current.find((item) => item.id === event.id);
          if (target && !target.isRead) {
            setUnreadCount((count) => Math.max(0, count - 1));
          }
          return current.filter((item) => item.id !== event.id);
        });
        return;
      }
      if (event.type === "bulk-read") {
        setItems((current) =>
          current.map((item) => ({ ...item, isRead: true })),
        );
        setUnreadCount(0);
        return;
      }
      if (event.type === "clear") {
        setItems([]);
        setUnreadCount(0);
      }
    });
  }, []);
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !nextCursor) return;
    await fetchFeed({ append: true, cursor: nextCursor });
  }, [fetchFeed, hasMore, loadingMore, nextCursor]);
  const markAsRead = useCallback(async (notificationId) => {
    if (!notificationId) return;
    let wasUnread = false;
    setItems((current) =>
      current.map((item) => {
        if (item.id !== notificationId) return item;
        wasUnread = !item.isRead;
        return { ...item, isRead: true };
      }),
    );
    if (wasUnread) {
      setUnreadCount((count) => Math.max(0, count - 1));
    }
    emitNotificationHubPatch(notificationId, { isRead: true });
    try {
      const response = await fetch("/api/mark-notifications-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids: [notificationId] }),
      });
      if (!response.ok) {
        throw new Error("mark-read-failed");
      }
    } catch {
      setItems((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, isRead: false } : item,
        ),
      );
      if (wasUnread) {
        setUnreadCount((count) => count + 1);
      }
      emitNotificationHubPatch(notificationId, { isRead: false });
    }
  }, []);
  const markAllAsRead = useCallback(async () => {
    const previousItems = items;
    const previousUnread = unreadCount;
    setItems((current) => current.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
    emitNotificationHubBulkRead();
    try {
      const response = await fetch("/api/mark-notifications-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) {
        throw new Error("mark-all-read-failed");
      }
    } catch {
      setItems(previousItems);
      setUnreadCount(previousUnread);
    }
  }, [items, unreadCount]);
  const deleteNotification = useCallback(
    async (notificationId) => {
      if (!notificationId) return;
      const previousItems = items;
      const previousUnread = unreadCount;
      const target = items.find((item) => item.id === notificationId);
      setItems((current) =>
        current.filter((item) => item.id !== notificationId),
      );
      if (target && !target.isRead) {
        setUnreadCount((count) => Math.max(0, count - 1));
      }
      emitNotificationHubRemove(notificationId);
      try {
        const response = await fetch("/api/delete-notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ ids: [notificationId] }),
        });
        if (!response.ok) {
          throw new Error("delete-failed");
        }
      } catch {
        setItems(previousItems);
        setUnreadCount(previousUnread);
      }
    },
    [items, unreadCount],
  );
  const deleteAllNotifications = useCallback(async () => {
    const previousItems = items;
    const previousUnread = unreadCount;
    setItems([]);
    setUnreadCount(0);
    emitNotificationHubClear();
    try {
      const response = await fetch("/api/delete-notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) {
        throw new Error("delete-all-failed");
      }
    } catch {
      setItems(previousItems);
      setUnreadCount(previousUnread);
    }
  }, [items, unreadCount]);
  const togglePin = useCallback(
    async (notificationId, pinned) => {
      if (!notificationId) return;
      const previousItems = items;
      setItems((current) =>
        sortHubNotifications(
          current.map((item) =>
            item.id === notificationId ? { ...item, isPinned: pinned } : item,
          ),
        ),
      );
      emitNotificationHubPatch(notificationId, { isPinned: pinned });
      try {
        const response = await fetch("/api/notification-hub/pin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id: notificationId, pinned }),
        });
        const result = await parseJsonResponse(response);
        if (!response.ok || !result?.success) {
          throw new Error(result?.error || "pin-failed");
        }
        if (result.notification) {
          setItems((current) =>
            sortHubNotifications(
              current.map((item) =>
                item.id === notificationId ? result.notification : item,
              ),
            ),
          );
        }
      } catch {
        setItems(previousItems);
        emitNotificationHubPatch(
          notificationId,
          { isPinned: !pinned },
          { source: "notification-hub-revert" },
        );
      }
    },
    [items],
  );
  const visibleUnreadCount = useMemo(
    () => items.filter((item) => !item.isRead).length,
    [items],
  );
  return {
    items,
    loading,
    loadingMore,
    hasMore,
    unreadCount,
    visibleUnreadCount,
    search,
    setSearch,
    filterKey,
    setFilterKey,
    filterRead,
    setFilterRead,
    error,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    togglePin,
    refresh: () => fetchFeed({ append: false }),
  };
}
function mergeHubItems(current = [], incoming = []) {
  const map = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => {
    map.set(item.id, item);
  });
  return Array.from(map.values());
}
