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

  const { id, notification } = activeToast;
  const visualType = notification.visualType || "general";
  const targetHref = notification.href || getNotificationHref(notification.type) || "/notifications";

  const navigateFromToast = () => {
    if (!notification.isRead) markAsRead(notification.id);
    dismissToast(id);
    router.push(targetHref);
  };

  const handleToastClick = (event) => {
    if (event.target.closest("button")) return;
    navigateFromToast();
  };

  const handleToastKeyDown = (event) => {
    if (event.target.closest("button")) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      navigateFromToast();
    }
  };

  return (
    <div className="notificationToastStack pointer-events-none fixed left-4 top-24 z-[9997] w-[min(100vw-2rem,24rem)]">
      <div
        key={id}
        role="link"
        tabIndex={0}
        onClick={handleToastClick}
        onKeyDown={handleToastKeyDown}
        className={`notificationToast notificationToast--${visualType} pointer-events-auto relative cursor-pointer overflow-hidden rounded-[24px] border p-4 text-white backdrop-blur-2xl`}
        aria-label={`${notification.title}. اضغط للانتقال`}
      >
        <div className="notificationToast__glow pointer-events-none absolute inset-0" />
        <div className="relative z-10 flex items-start gap-3">
          <div className="notificationToast__icon grid h-11 w-11 shrink-0 place-items-center rounded-2xl border text-xl">
            {notification.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-black leading-6">{notification.title}</p>
            {notification.message ? (
              <p className="notificationToast__message mt-1 text-sm leading-6">{notification.message}</p>
            ) : null}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  navigateFromToast();
                }}
                className="notificationToast__action rounded-xl px-3 py-2 text-xs font-black text-white"
              >
                فتح
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  dismissToast(id);
                }}
                className="notificationToast__dismiss rounded-xl border px-3 py-2 text-xs font-black transition"
              >
                تجاهل
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              dismissToast(id);
            }}
            className="notificationToast__close grid h-8 w-8 shrink-0 place-items-center rounded-full border text-sm font-black transition"
            aria-label="إغلاق الإشعار"
          >
            ✕
          </button>
        </div>
        <p className="notificationToast__time relative z-10 mt-3 text-[11px] font-bold">
          {formatNotificationTime(notification.createdAt)}
        </p>
      </div>
    </div>
  );
}
