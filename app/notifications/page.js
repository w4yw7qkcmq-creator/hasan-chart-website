"use client";

import Link from "next/link";
import { formatNotificationTime } from "../../lib/notifications-shared";
import { useNotifications } from "../components/notifications/NotificationProvider";

export default function NotificationsPage() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead } = useNotifications();

  return (
    <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-cyan-300/10 bg-[#020617] p-6 text-white shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,102,255,0.32),transparent_30%),linear-gradient(135deg,#020617,#07142f,#030712)]" />

      <div className="relative z-10 mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black">الإشعارات</h1>
            <p className="mt-2 text-sm font-bold text-slate-400">
              {unreadCount > 0 ? `${unreadCount} إشعار غير مقروء` : "كل الإشعارات مقروءة"}
            </p>
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => markAllAsRead()}
              className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-100 transition hover:bg-cyan-400/20"
            >
              تعليم الكل كمقروء
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-8 text-center backdrop-blur-2xl">
            <p className="font-black text-slate-300">جاري تحميل الإشعارات...</p>
          </div>
        ) : notifications.length ? (
          <div className="space-y-3">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-[24px] border p-4 backdrop-blur-2xl transition ${
                  notification.isRead
                    ? "border-white/10 bg-white/[0.03]"
                    : "border-cyan-300/20 bg-white/[0.045] shadow-[0_12px_40px_rgba(0,102,255,0.12)]"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-2xl">
                    {notification.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="font-black">{notification.title}</h2>
                      <span className="text-xs font-bold text-slate-400">
                        {formatNotificationTime(notification.createdAt)}
                      </span>
                    </div>
                    {notification.message ? (
                      <p className="mt-2 leading-7 text-slate-300">{notification.message}</p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={notification.href}
                        onClick={() => {
                          if (!notification.isRead) markAsRead(notification.id);
                        }}
                        className="rounded-xl bg-gradient-to-l from-blue-700 via-blue-500 to-cyan-300 px-4 py-2 text-sm font-black text-white"
                      >
                        فتح
                      </Link>
                      {!notification.isRead ? (
                        <button
                          type="button"
                          onClick={() => markAsRead(notification.id)}
                          className="rounded-xl border border-cyan-300/20 bg-white/[0.04] px-4 py-2 text-sm font-black text-cyan-100 transition hover:bg-white/[0.08]"
                        >
                          ✓ تعليم كمقروء
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[28px] border border-cyan-300/15 bg-white/[0.045] p-8 text-center backdrop-blur-2xl">
            <p className="font-black text-slate-300">لا توجد إشعارات حالياً.</p>
          </div>
        )}
      </div>
    </main>
  );
}
