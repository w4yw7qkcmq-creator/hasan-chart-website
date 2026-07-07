"use client";

import Link from "next/link";
import { NotificationHub } from "../components/notification-hub/NotificationHub";
import { useNotifications } from "../components/notifications/NotificationProvider";

export default function NotificationsPage() {
  const { setNotificationPanelOpen } = useNotifications();

  return (
    <main className="notificationsPage relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border p-6 shadow-[0_25px_90px_rgba(0,102,255,0.16)]">
      <div className="notificationsPage__glow pointer-events-none absolute inset-0" />

      <div className="relative z-10 mx-auto max-w-4xl">
        <div className="mb-6">
          <h1 className="notificationsPage__title text-3xl font-black">مركز الإشعارات</h1>
          <p className="notificationsPage__subtitle mt-2 text-sm font-bold">
            Notification Hub — بحث، تصفية، تثبيت، وتحديث فوري
          </p>
        </div>

        <div className="notificationsPage__hub">
          <NotificationHub onPanelOpenChange={setNotificationPanelOpen} />
        </div>

        <p className="mt-4 text-center text-xs font-bold text-slate-500">
          <Link href="/" className="notificationsPage__action inline-flex rounded-xl border px-3 py-2">
            العودة للرئيسية
          </Link>
        </p>
      </div>
    </main>
  );
}
