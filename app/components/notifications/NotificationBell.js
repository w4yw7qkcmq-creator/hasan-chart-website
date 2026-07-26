"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "../AuthProvider";
import { useNotifications } from "./NotificationProvider";

const NotificationDropdown = dynamic(
  () => import("./NotificationDropdown").then((mod) => mod.NotificationDropdown),
  { ssr: false }
);

export function NotificationBell({ className = "" }) {
  const { user } = useAuth();
  const { unreadCount, bellShakeKey, setNotificationPanelOpen, refreshNotifications } = useNotifications();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    setNotificationPanelOpen(isNotificationsOpen);
  }, [isNotificationsOpen, setNotificationPanelOpen]);

  useEffect(() => {
    return () => setNotificationPanelOpen(false);
  }, [setNotificationPanelOpen]);

  if (!user?.email) return null;

  const notificationAriaLabel =
    unreadCount > 0
      ? `الإشعارات، ${unreadCount > 9 ? "أكثر من تسع" : unreadCount} غير مقروءة`
      : "الإشعارات";

  const handleBellClick = () => {
    setIsNotificationsOpen((current) => {
      const opening = !current;
      if (opening) {
        void refreshNotifications();
      }
      return opening;
    });
  };

  return (
    <div ref={bellRef} className={`relative ${className}`}>
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={handleBellClick}
        className="notificationBell relative grid h-11 w-11 place-items-center rounded-2xl border text-xl transition"
        data-shake={bellShakeKey || undefined}
        aria-label={notificationAriaLabel}
        aria-expanded={isNotificationsOpen}
        aria-haspopup="true"
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="notificationBell__badge absolute -right-2 -top-2 grid min-h-6 min-w-6 place-items-center rounded-full bg-red-500 px-2 text-xs font-black text-white shadow-[0_0_18px_rgba(239,68,68,0.55)]"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {isNotificationsOpen ? (
        <NotificationDropdown
          open={isNotificationsOpen}
          onClose={() => setIsNotificationsOpen(false)}
          anchorRef={bellRef}
        />
      ) : null}
    </div>
  );
}
