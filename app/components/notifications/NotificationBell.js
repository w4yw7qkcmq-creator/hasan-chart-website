"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import { NotificationDropdown } from "./NotificationDropdown";
import { useNotifications } from "./NotificationProvider";

export function NotificationBell({ className = "" }) {
  const { user } = useAuth();
  const { unreadCount, bellShakeKey, setNotificationPanelOpen } = useNotifications();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const bellRef = useRef(null);

  useEffect(() => {
    setNotificationPanelOpen(isNotificationsOpen);
  }, [isNotificationsOpen, setNotificationPanelOpen]);

  useEffect(() => {
    return () => setNotificationPanelOpen(false);
  }, [setNotificationPanelOpen]);

  if (!user?.email) return null;

  const handleBellClick = () => {
    setIsNotificationsOpen((current) => !current);
  };

  return (
    <div ref={bellRef} className={`relative ${className}`}>
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={handleBellClick}
        className="notificationBell relative grid h-11 w-11 place-items-center rounded-2xl border text-xl transition"
        data-shake={bellShakeKey || undefined}
        aria-label="الإشعارات"
        aria-expanded={isNotificationsOpen}
      >
        🔔
        {unreadCount > 0 ? (
          <span className="notificationBell__badge absolute -right-2 -top-2 grid min-h-6 min-w-6 place-items-center rounded-full bg-red-500 px-2 text-xs font-black text-white shadow-[0_0_18px_rgba(239,68,68,0.55)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      <NotificationDropdown
        open={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        anchorRef={bellRef}
      />
    </div>
  );
}
