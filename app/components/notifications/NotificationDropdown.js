"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { formatNotificationTime } from "../../../lib/notifications-shared";
import { useNotifications } from "./NotificationProvider";

export function NotificationDropdown({ open, onClose, anchorRef }) {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const panelRef = useRef(null);

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

  return (
    <div
      ref={panelRef}
      className={`notificationDropdown fixed left-4 top-20 z-[120] w-[min(100vw-2rem,24rem)] overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-4 text-white shadow-[0_24px_80px_rgba(0,102,255,0.22)] backdrop-blur-2xl sm:left-5 sm:top-24 ${
        open ? "notificationDropdown--open" : "notificationDropdown--closed"
      }`}
      aria-hidden={!open}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.22),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.12),transparent_38%)]" />

      <div className="relative z-10 mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-black text-lg">الإشعارات</h3>
          <p className="text-xs font-bold text-slate-400">
            {unreadCount > 0 ? `${unreadCount} غير مقروء` : "لا توجد إشعارات جديدة"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-8 w-8 place-items-center rounded-full border border-cyan-300/20 bg-white/[0.05] font-black text-slate-200 transition hover:bg-white/[0.08]"
          aria-label="إغلاق الإشعارات"
        >
          ✕
        </button>
      </div>

      {visibleItems.length ? (
        <div className="relative z-10 max-h-[22rem] space-y-2 overflow-y-auto customScroll">
          {visibleItems.map((notification) => (
            <div
              key={notification.id}
              className={`notificationDropdown__item rounded-[20px] border p-3 transition ${
                notification.isRead
                  ? "notificationDropdown__item--read border-white/10 bg-white/[0.03]"
                  : "notificationDropdown__item--unread border-cyan-300/30 bg-cyan-400/15 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.08)]"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-300/20 bg-black/20 text-lg">
                  {notification.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-black leading-6">{notification.title}</p>
                    {!notification.isRead ? (
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.65)]"
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                  {notification.message ? (
                    <p className="mt-1 text-sm leading-6 text-slate-300">{notification.message}</p>
                  ) : null}
                  <p className="mt-2 text-[11px] font-bold text-slate-400">
                    {formatNotificationTime(notification.createdAt)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={notification.href}
                      onClick={() => {
                        if (!notification.isRead) markAsRead(notification.id);
                        onClose();
                      }}
                      className="rounded-xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-3 py-2 text-xs font-black text-white"
                    >
                      فتح
                    </Link>
                    {!notification.isRead ? (
                      <button
                        type="button"
                        onClick={() => markAsRead(notification.id)}
                        className="rounded-xl border border-cyan-300/20 bg-white/[0.04] px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-white/[0.08]"
                      >
                        ✓ مقروء
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="relative z-10 rounded-[20px] border border-white/10 bg-white/[0.03] p-4 text-sm font-bold text-slate-400">
          لا توجد إشعارات جديدة حالياً.
        </div>
      )}

      <div className="relative z-10 mt-3 flex items-center justify-between gap-2">
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => markAllAsRead()}
            className="rounded-xl border border-cyan-300/20 bg-white/[0.04] px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-white/[0.08]"
          >
            تعليم الكل كمقروء
          </button>
        ) : (
          <span />
        )}
        <Link
          href="/notifications"
          onClick={onClose}
          className="rounded-xl border border-cyan-300/20 bg-white/[0.04] px-3 py-2 text-xs font-black text-cyan-100 transition hover:bg-white/[0.08]"
        >
          عرض الكل
        </Link>
      </div>
    </div>
  );
}
