"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useAppModal } from "../components/AppModalProvider";
import { NotificationListItem } from "../components/notifications/NotificationListItem";
import { useNotifications } from "../components/notifications/NotificationProvider";

export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications,
    setNotificationPanelOpen,
    recentlyAddedIds,
  } = useNotifications();
  const { showAppConfirm } = useAppModal();

  useEffect(() => {
    setNotificationPanelOpen(true);
    return () => setNotificationPanelOpen(false);
  }, [setNotificationPanelOpen]);

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
    <main className="notificationsPage relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border p-6 shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      <div className="notificationsPage__glow pointer-events-none absolute inset-0" />

      <div className="relative z-10 mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="notificationsPage__title text-3xl font-black">الإشعارات</h1>
            <p className="notificationsPage__subtitle mt-2 text-sm font-bold">
              {unreadCount > 0 ? `${unreadCount} إشعار غير مقروء` : "كل الإشعارات مقروءة"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={() => markAllAsRead()}
                className="notificationsPage__action rounded-2xl border px-4 py-3 text-sm font-black transition"
              >
                تحديد الكل كمقروء
              </button>
            ) : null}
            {notifications.length > 0 ? (
              <button
                type="button"
                onClick={() => void handleDeleteAll()}
                className="notificationsPage__danger rounded-2xl border px-4 py-3 text-sm font-black transition"
              >
                حذف الكل
              </button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="notificationsPage__panel rounded-[28px] border p-8 text-center backdrop-blur-2xl">
            <p className="font-black">جاري تحميل الإشعارات...</p>
          </div>
        ) : notifications.length ? (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <NotificationListItem
                key={notification.id}
                notification={notification}
                isNew={recentlyAddedIds.includes(notification.id)}
                onMarkRead={markAsRead}
                onDelete={deleteNotification}
              />
            ))}
          </div>
        ) : (
          <div className="notificationsPage__panel rounded-[28px] border p-8 text-center backdrop-blur-2xl">
            <p className="font-black">لا توجد إشعارات حالياً.</p>
            <Link
              href="/"
              className="notificationsPage__action mt-4 inline-flex rounded-2xl border px-4 py-3 text-sm font-black transition"
            >
              العودة للرئيسية
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
