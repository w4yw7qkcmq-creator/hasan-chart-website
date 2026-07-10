"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAppModal } from "../AppModalProvider";
import { NotificationListItem } from "./NotificationListItem";
import { useNotifications } from "./NotificationProvider";

export function NotificationDropdown({ open, onClose, anchorRef }) {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    recentlyAddedIds,
    refreshNotifications,
  } = useNotifications();
  const { showAppConfirm } = useAppModal();
  const panelRef = useRef(null);
  const markedReadAfterOpenRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!open) {
      markedReadAfterOpenRef.current = false;
      setRefreshing(false);
      return;
    }

    setRefreshing(true);
    void refreshNotifications().finally(() => {
      setRefreshing(false);
    });
  }, [open, refreshNotifications]);

  useEffect(() => {
    if (!open || refreshing || markedReadAfterOpenRef.current) return;
    if (notifications.length === 0 && unreadCount === 0) return;

    markedReadAfterOpenRef.current = true;
    markAllAsRead();
  }, [open, refreshing, notifications.length, unreadCount, markAllAsRead]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return;
      if (anchorRef?.current?.contains(event.target)) return;
      onClose();
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose, anchorRef]);

  const visibleItems = notifications.slice(0, 8);

  useEffect(() => {
    if (!open) return;
    console.log("BELL_NOTIFICATIONS_RENDERED", {
      count: visibleItems.length,
      totalNotifications: notifications.length,
      unreadCount,
      loading,
    });
  }, [open, visibleItems.length, notifications.length, unreadCount, loading]);

  const handleDeleteAll = async () => {
    if (!notifications.length) return;

    const confirmed = await showAppConfirm({
      type: "warning",
      title: "حذف جميع الإشعارات",
      message: "هل أنت متأكد من حذف جميع الإشعارات؟ لا يمكن التراجع عن هذا الإجراء.",
      confirmText: "حذف الكل",
      cancelText: "إلغاء",
    });

    if (!confirmed) return;

    await deleteAllNotifications();
  };

  return (
    <div
      ref={panelRef}
      className={`notificationDropdown fixed left-4 top-20 z-[120] w-[min(100vw-2rem,24rem)] overflow-hidden rounded-[28px] border p-4 shadow-[0_24px_80px_rgba(0,102,255,0.22)] backdrop-blur-2xl sm:left-5 sm:top-24 ${
        open ? "notificationDropdown--open" : "notificationDropdown--closed"
      }`}
      aria-hidden={!open}
    >
      <div className="notificationDropdown__glow pointer-events-none absolute inset-0" />

      <div className="relative z-10 mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="notificationDropdown__title font-black text-lg">الإشعارات</h3>
          <p className="notificationDropdown__subtitle text-xs font-bold">
            {unreadCount > 0 ? `${unreadCount} غير مقروء` : "لا توجد إشعارات جديدة"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="notificationDropdown__close grid h-8 w-8 place-items-center rounded-full border font-black transition"
          aria-label="إغلاق الإشعارات"
        >
          ✕
        </button>
      </div>

      {refreshing && !visibleItems.length ? (
        <div className="notificationDropdown__empty relative z-10 rounded-[20px] border p-4 text-sm font-bold">
          جاري تحميل الإشعارات...
        </div>
      ) : visibleItems.length ? (
        <div className="relative z-10 max-h-[22rem] space-y-2 overflow-y-auto customScroll">
          {visibleItems.map((notification) => (
            <NotificationListItem
              key={notification.id}
              notification={notification}
              compact
              isNew={recentlyAddedIds.includes(notification.id)}
              onMarkRead={markAsRead}
              onDelete={deleteNotification}
              onNavigate={onClose}
            />
          ))}
        </div>
      ) : (
        <div className="notificationDropdown__empty relative z-10 rounded-[20px] border p-4 text-sm font-bold">
          لا توجد إشعارات حالياً.
        </div>
      )}

      <div className="relative z-10 mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => markAllAsRead()}
              className="notificationDropdown__action rounded-xl border px-3 py-2 text-xs font-black transition"
            >
              تحديد الكل كمقروء
            </button>
          ) : null}
          {notifications.length > 0 ? (
            <button
              type="button"
              onClick={() => void handleDeleteAll()}
              className="notificationDropdown__danger rounded-xl border px-3 py-2 text-xs font-black transition"
            >
              حذف الكل
            </button>
          ) : null}
        </div>
        <Link
          href="/notifications"
          onClick={onClose}
          className="notificationDropdown__action rounded-xl border px-3 py-2 text-xs font-black transition"
        >
          عرض الكل
        </Link>
      </div>
    </div>
  );
}
