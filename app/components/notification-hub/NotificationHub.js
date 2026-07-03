"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useAppModal } from "../AppModalProvider";
import { useNotificationHub } from "../../hooks/useNotificationHub";
import { getNotificationHubKeyDefinitions } from "../../../lib/notification-hub-registry";
import { NotificationHubList } from "./NotificationHubList";

export function NotificationHub({ onPanelOpenChange }) {
  const { showAppConfirm } = useAppModal();
  const keyDefinitions = useMemo(() => getNotificationHubKeyDefinitions(), []);

  const {
    items,
    loading,
    loadingMore,
    hasMore,
    unreadCount,
    search,
    setSearch,
    filterKey,
    setFilterKey,
    filterRead,
    setFilterRead,
    error,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    togglePin,
  } = useNotificationHub();

  useEffect(() => {
    onPanelOpenChange?.(true);
    return () => onPanelOpenChange?.(false);
  }, [onPanelOpenChange]);

  const handleDeleteAll = async () => {
    if (!items.length) return;

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
    <div className="notificationHub">
      <div className="notificationHub__toolbar">
        <div className="notificationHub__searchWrap">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="ابحث في الإشعارات..."
            className="notificationHub__search"
            aria-label="بحث في الإشعارات"
          />
        </div>

        <div className="notificationHub__filters">
          <select
            value={filterKey}
            onChange={(event) => setFilterKey(event.target.value)}
            className="notificationHub__select"
            aria-label="تصفية حسب النوع"
          >
            <option value="all">كل الأنواع</option>
            {keyDefinitions.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>

          <select
            value={filterRead}
            onChange={(event) => setFilterRead(event.target.value)}
            className="notificationHub__select"
            aria-label="تصفية حسب الحالة"
          >
            <option value="all">الكل</option>
            <option value="unread">غير مقروء</option>
            <option value="read">مقروء</option>
          </select>
        </div>
      </div>

      <div className="notificationHub__actions">
        <p className="notificationHub__summary">
          {unreadCount > 0 ? `${unreadCount} إشعار غير مقروء` : "كل الإشعارات مقروءة"}
          {items.length > 100 ? ` • ${items.length} عنصر (قائمة افتراضية)` : null}
        </p>

        <div className="notificationHub__actionRow">
          <Link href="/notification-sound-settings" className="notificationHub__actionBtn">
            إعدادات الصوت
          </Link>
          {unreadCount > 0 ? (
            <button type="button" onClick={() => void markAllAsRead()} className="notificationHub__actionBtn">
              تحديد الكل كمقروء
            </button>
          ) : null}
          {items.length > 0 ? (
            <button
              type="button"
              onClick={() => void handleDeleteAll()}
              className="notificationHub__actionBtn notificationHub__actionBtn--danger"
            >
              حذف الكل
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="notificationHub__empty">جاري تحميل الإشعارات...</div>
      ) : error ? (
        <div className="notificationHub__empty notificationHub__empty--error">{error}</div>
      ) : items.length ? (
        <NotificationHubList
          items={items}
          loadingMore={loadingMore}
          hasMore={hasMore}
          onLoadMore={loadMore}
          onMarkRead={markAsRead}
          onDelete={deleteNotification}
          onTogglePin={togglePin}
        />
      ) : (
        <div className="notificationHub__empty">
          <p>لا توجد إشعارات مطابقة.</p>
          <Link href="/" className="notificationHub__actionBtn notificationHub__actionBtn--inline">
            العودة للرئيسية
          </Link>
        </div>
      )}
    </div>
  );
}
