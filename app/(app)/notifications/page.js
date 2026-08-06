"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useNotifications } from "../../components/notifications/NotificationProvider";

const NotificationHub = dynamic(
  () =>
    import("../../components/notification-hub/NotificationHub").then(
      (mod) => mod.NotificationHub
    ),
  {
    ssr: false,
    loading: () => (
      <div
        className="rounded-[28px] border border-white/10 bg-white/5 p-10 text-center text-sm font-bold text-slate-300"
        role="status"
        aria-live="polite"
      >
        جاري تحميل مركز الإشعارات...
      </div>
    ),
  }
);

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
