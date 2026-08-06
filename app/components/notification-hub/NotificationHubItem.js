"use client";
import { useRouter } from "next/navigation";
import { formatRelativeNotificationTime } from "../../../lib/notification-hub-registry";
export function NotificationHubItem({
  notification,
  onMarkRead,
  onDelete,
  onTogglePin,
}) {
  const router = useRouter();
  const openNotification = () => {
    if (!notification.isRead) {
      onMarkRead(notification.id);
    }
    if (notification.href) {
      router.push(notification.href);
    }
  };
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={openNotification}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openNotification();
        }
      }}
      className={`notificationHubItem ${notification.isRead ? "notificationHubItem--read" : "notificationHubItem--unread"} ${notification.isPinned ? "notificationHubItem--pinned" : ""}`}
      style={{
        "--hub-accent": notification.hubColor || "var(--ui-chart-series-1)",
      }}
    >
      {" "}
      <div className="notificationHubItem__accent" aria-hidden="true" />{" "}
      <div className="notificationHubItem__body">
        {" "}
        <div className="notificationHubItem__header">
          {" "}
          <div className="notificationHubItem__icon" aria-hidden="true">
            {" "}
            {notification.hubIcon}{" "}
          </div>{" "}
          <div className="notificationHubItem__meta">
            {" "}
            <div className="notificationHubItem__titleRow">
              {" "}
              <p className="notificationHubItem__title">
                {notification.displayTitle}
              </p>{" "}
              {!notification.isRead ? (
                <span className="notificationHubItem__dot" aria-hidden="true" />
              ) : null}{" "}
            </div>{" "}
            <div className="notificationHubItem__badges">
              {" "}
              <span className="notificationHubItem__badge">
                {notification.hubBadge}
              </span>{" "}
              {notification.isPinned ? (
                <span className="notificationHubItem__badge notificationHubItem__badge--pin">
                  {" "}
                  مثبت{" "}
                </span>
              ) : null}{" "}
            </div>{" "}
          </div>{" "}
        </div>{" "}
        {notification.message ? (
          <p className="notificationHubItem__message">{notification.message}</p>
        ) : null}{" "}
        <p className="notificationHubItem__time">
          {" "}
          {formatRelativeNotificationTime(notification.createdAt)}{" "}
        </p>{" "}
        <div
          className="notificationHubItem__actions"
          onClick={(event) => event.stopPropagation()}
        >
          {" "}
          <button
            type="button"
            onClick={() => onTogglePin(notification.id, !notification.isPinned)}
            className="notificationHubItem__action"
          >
            {" "}
            {notification.isPinned ? "إلغاء التثبيت" : "📌 تثبيت"}{" "}
          </button>{" "}
          {!notification.isRead ? (
            <button
              type="button"
              onClick={() => onMarkRead(notification.id)}
              className="notificationHubItem__action"
            >
              {" "}
              ✓ مقروء{" "}
            </button>
          ) : null}{" "}
          <button
            type="button"
            onClick={() => onDelete(notification.id)}
            className="notificationHubItem__action notificationHubItem__action--danger"
          >
            {" "}
            🗑 حذف{" "}
          </button>{" "}
        </div>{" "}
      </div>{" "}
    </article>
  );
}
