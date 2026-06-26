"use client";

import { useRef, useState } from "react";
import { useAuth } from "../AuthProvider";
import { NotificationDropdown } from "./NotificationDropdown";
import { useNotifications } from "./NotificationProvider";

export function NotificationBell({ className = "" }) {
  const { user } = useAuth();
  const { unreadCount, bellShakeKey, markAllAsRead } = useNotifications();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const bellRef = useRef(null);

  if (!user?.email) return null;

  const handleBellClick = () => {
    setIsNotificationsOpen((current) => {
      const next = !current;

      if (next) {
        markAllAsRead();
      }

      return next;
    });
  };

  return (
    <div ref={bellRef} className={`relative ${className}`}>
      <button
        type="button"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={handleBellClick}
        className={`notificationBell relative grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/25 bg-cyan-400/10 text-xl text-cyan-100 shadow-[0_0_24px_rgba(0,163,255,0.18)] transition hover:bg-cyan-400/20`}
        data-shake={bellShakeKey || undefined}
        aria-label="الإشعارات"
        aria-expanded={isNotificationsOpen}
      >
        🔔
        {unreadCount > 0 ? (
          <span className="absolute -right-2 -top-2 grid min-h-6 min-w-6 place-items-center rounded-full bg-red-500 px-2 text-xs font-black text-white shadow-[0_0_18px_rgba(239,68,68,0.55)]">
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
