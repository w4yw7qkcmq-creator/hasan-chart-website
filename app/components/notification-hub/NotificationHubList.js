"use client";

import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { NotificationHubItem } from "./NotificationHubItem";

const VIRTUAL_THRESHOLD = 100;
const ESTIMATED_ROW_HEIGHT = 168;

export function NotificationHubList({
  items,
  loadingMore,
  hasMore,
  onLoadMore,
  onMarkRead,
  onDelete,
  onTogglePin,
}) {
  const parentRef = useRef(null);
  const sentinelRef = useRef(null);
  const useVirtual = items.length > VIRTUAL_THRESHOLD;

  useEffect(() => {
    if (!hasMore || loadingMore) return;

    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onLoadMore();
        }
      },
      { root: parentRef.current, rootMargin: "240px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore, items.length]);

  const virtualizer = useVirtualizer({
    count: useVirtual ? items.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 8,
  });

  if (!useVirtual) {
    return (
      <div ref={parentRef} className="notificationHubList">
        <div className="notificationHubList__stack">
          {items.map((notification) => (
            <NotificationHubItem
              key={notification.id}
              notification={notification}
              onMarkRead={onMarkRead}
              onDelete={onDelete}
              onTogglePin={onTogglePin}
            />
          ))}
        </div>
        <div ref={sentinelRef} className="notificationHubList__sentinel" aria-hidden="true" />
        {loadingMore ? <p className="notificationHubList__loadingMore">جاري تحميل المزيد...</p> : null}
      </div>
    );
  }

  return (
    <div ref={parentRef} className="notificationHubList notificationHubList--virtual">
      <div
        className="notificationHubList__virtualInner"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const notification = items[virtualRow.index];
          if (!notification) return null;

          return (
            <div
              key={notification.id}
              className="notificationHubList__virtualRow"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <NotificationHubItem
                notification={notification}
                onMarkRead={onMarkRead}
                onDelete={onDelete}
                onTogglePin={onTogglePin}
              />
            </div>
          );
        })}
      </div>
      <div ref={sentinelRef} className="notificationHubList__sentinel" aria-hidden="true" />
      {loadingMore ? <p className="notificationHubList__loadingMore">جاري تحميل المزيد...</p> : null}
    </div>
  );
}
