"use client";

import { useRouter } from "next/navigation";
import {
  formatNotificationTime,
  getNotificationHref,
} from "../../../lib/notifications-shared";
import { useNotifications } from "./NotificationProvider";

export function NotificationToastStack() {
  const router = useRouter();
  const { activeToast, dismissToast, markAsRead } = useNotifications();

  if (!activeToast) return null;

  const { id, kind = "single", count = 0, notification, exiting = false } = activeToast;
  const isGrouped = kind === "grouped";
  const visualType = isGrouped ? "general" : notification?.visualType || "general";
  const targetHref = isGrouped
    ? "/notifications"
    : notification?.href || getNotificationHref(notification?.type) || "/notifications";

  const toastTitle = isGrouped
    ? `لديك ${count} إشعارات جديدة`
    : notification?.title || "إشعار جديد";

  const navigateFromToast = () => {
    if (!isGrouped && notification?.id && !notification.isRead) {
      markAsRead(notification.id);
    }

    dismissToast(id);
    router.push(targetHref);
  };

  return (
    <div className="notificationToastStack">
      <div
        key={id}
        className={`notificationToast notificationToast--${visualType} ${
          exiting ? "notificationToast--exit" : "notificationToast--enter"
        } pointer-events-auto relative overflow-hidden rounded-[24px] border p-4 text-white backdrop-blur-2xl`}
        aria-live="polite"
        aria-label={toastTitle}
      >
        <div className="notificationToast__glow pointer-events-none absolute inset-0" />
        <div className="relative z-10 flex items-start gap-3">
          <div className="notificationToast__icon grid h-11 w-11 shrink-0 place-items-center rounded-2xl border text-xl">
            {isGrouped ? "🔔" : notification?.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-black leading-6">{toastTitle}</p>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={navigateFromToast}
                className="notificationToast__action rounded-xl px-4 py-2 text-xs font-black text-white"
              >
                عرض
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => dismissToast(id)}
            className="notificationToast__close grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-black transition"
            aria-label="إغلاق الإشعار"
          >
            ✕
          </button>
        </div>
        {!isGrouped && notification?.createdAt ? (
          <p className="notificationToast__time relative z-10 mt-3 text-[11px] font-bold">
            {formatNotificationTime(notification.createdAt)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
