"use client";

import { useRouter } from "next/navigation";
import { formatNotificationTime } from "../../../lib/notifications-shared";

export function NotificationListItem({
  notification,
  compact = false,
  isNew = false,
  onMarkRead,
  onDelete,
  onNavigate,
}) {
  const router = useRouter();

  const openNotification = () => {
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }

    onNavigate?.();

    if (notification.href) {
      router.push(notification.href);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openNotification();
    }
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={openNotification}
      onKeyDown={handleKeyDown}
      className={`notificationListItem group cursor-pointer rounded-[20px] border transition ${
        compact ? "p-3" : "p-4"
      } ${
        notification.isRead ? "notificationListItem--read" : "notificationListItem--unread"
      } ${isNew ? "notificationListItem--enter" : ""}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`notificationListItem__icon grid shrink-0 place-items-center rounded-xl border text-lg ${
            compact ? "h-10 w-10" : "h-12 w-12 rounded-2xl text-2xl"
          }`}
        >
          {notification.icon}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`font-black leading-6 ${compact ? "text-sm" : ""}`}>
                {notification.title}
              </p>
              {!notification.isRead ? (
                <span className="notificationListItem__badge mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-black">
                  جديد
                </span>
              ) : null}
            </div>
            {!notification.isRead ? (
              <span
                className="notificationListItem__dot mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.65)]"
                aria-hidden="true"
              />
            ) : null}
          </div>

          {notification.message ? (
            <p
              className={`notificationListItem__message mt-1 leading-6 ${
                compact ? "text-sm" : ""
              }`}
            >
              {notification.message}
            </p>
          ) : null}

          <p className="notificationListItem__time mt-2 text-[11px] font-bold">
            {formatNotificationTime(notification.createdAt)}
          </p>

          <div
            className={`mt-3 flex flex-wrap gap-2 ${compact ? "" : "mt-4"}`}
            onClick={(event) => event.stopPropagation()}
          >
            {!notification.isRead ? (
              <button
                type="button"
                onClick={() => onMarkRead(notification.id)}
                className="notificationListItem__action rounded-xl border px-3 py-2 text-xs font-black transition"
              >
                ✓ مقروء
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onDelete(notification.id)}
              className="notificationListItem__delete rounded-xl border px-3 py-2 text-xs font-black transition"
              aria-label="حذف الإشعار"
            >
              🗑 حذف
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
