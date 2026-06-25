"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DetailSkeleton } from "../components/Skeleton";
import { IconRefresh } from "../components/icons";
import { useAdminFetch } from "../lib/useAdminFetch";

function DetailCard({ label, value, mono = false }) {
  return (
    <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,0.05)] dark:border-cyan-300/15 dark:bg-white/[0.045] dark:shadow-[0_12px_40px_rgba(0,0,0,0.22)]">
      <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={`mt-2 break-all text-lg font-black text-slate-950 dark:text-white ${
          mono ? "font-mono text-sm" : ""
        }`}
      >
        {value || "—"}
      </p>
    </div>
  );
}

function EventTimeline({ events = [] }) {
  if (!events.length) {
    return (
      <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-center dark:border-cyan-300/15 dark:bg-white/[0.045]">
        <p className="text-sm text-slate-500 dark:text-slate-300">لا توجد أحداث مسجلة لهذه الرسالة بعد.</p>
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-cyan-300/15 dark:bg-white/[0.045] dark:shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
      <h2 className="text-2xl font-black text-slate-950 dark:text-white">Timeline</h2>
      <div className="mt-6 space-y-4">
        {events.map((event, index) => (
          <div
            key={event.id}
            className="relative flex gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-cyan-300/10 dark:bg-black/20"
          >
            <div className="flex flex-col items-center">
              <div className="grid h-10 w-10 place-items-center rounded-full border border-cyan-200 bg-cyan-50 text-sm font-black text-cyan-700 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-100">
                {index + 1}
              </div>
              {index < events.length - 1 ? (
                <div className="mt-2 h-full min-h-8 w-px bg-slate-200 dark:bg-cyan-300/20" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-black text-slate-950 dark:text-white">{event.type}</p>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-300">{event.createdAtLabel}</p>
              </div>
              {event.payload?.data?.click?.link ? (
                <p className="mt-2 break-all text-sm text-slate-600 dark:text-slate-300">
                  Link: {event.payload.data.click.link}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EmailMessageDetailPage({ params }) {
  const adminFetch = useAdminFetch();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState("");

  const loadDetail = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      try {
        const response = await adminFetch(`/api/admin/email-analytics/${params.id}`, {
          method: "GET",
          cache: "no-store",
        });

        const result = await response.json().catch(() => ({}));

        if (response.status === 401 || response.status === 403) {
          throw new Error(result?.error || "تعذر تحميل تفاصيل الرسالة");
        }

        if (response.status === 404) {
          setError("الرسالة غير موجودة");
          return;
        }

        if (!response.ok || !result?.success) {
          throw new Error(result?.error || "تعذر تحميل تفاصيل الرسالة");
        }

        setMessage(result.message);
        setEvents(result.events || []);
        setError("");
      } catch (loadError) {
        setError(loadError?.message || "تعذر تحميل تفاصيل الرسالة");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [adminFetch, params.id]
  );

  useEffect(() => {
    loadDetail();
    const interval = setInterval(() => loadDetail({ silent: true }), 30000);
    return () => clearInterval(interval);
  }, [loadDetail]);

  if (loading) {
    return (
      <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-slate-200 bg-slate-50 p-4 dark:border-cyan-300/10 dark:bg-[#020617] md:p-6">
        <DetailSkeleton />
      </main>
    );
  }

  if (error || !message) {
    return (
      <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-slate-200 bg-slate-50 p-6 dark:border-cyan-300/10 dark:bg-[#020617]">
        <div className="mx-auto max-w-lg rounded-[28px] border border-slate-200 bg-white p-8 text-center dark:border-cyan-300/15 dark:bg-white/[0.045]">
          <p className="text-xl font-black text-slate-950 dark:text-white">{error || "الرسالة غير موجودة"}</p>
          <Link
            href="/admin/email-analytics"
            className="mt-6 inline-flex rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-3 font-black text-cyan-900 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-100"
          >
            العودة للوحة
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative z-0 overflow-hidden rounded-[34px] border border-slate-200 bg-slate-50 text-slate-900 shadow-lg dark:border-cyan-300/10 dark:bg-[#020617] dark:text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.08),transparent_30%)] dark:bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.35),transparent_30%),linear-gradient(135deg,#020617,#07142f_48%,#030712)]" />

      <div className="relative z-10 space-y-6 p-4 md:p-6">
        <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-cyan-300/15 dark:bg-white/[0.045]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <Link
                href="/admin/email-analytics"
                className="text-sm font-black text-cyan-700 dark:text-cyan-300"
              >
                ← العودة للوحة
              </Link>
              <h1 className="mt-3 text-3xl font-black break-words">{message.subject}</h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-300">{message.email}</p>
            </div>
            <button
              type="button"
              onClick={() => loadDetail({ silent: true })}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-2xl border border-cyan-200 bg-cyan-50 px-5 py-3 font-black text-cyan-900 disabled:opacity-60 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-100"
            >
              <IconRefresh className="h-4 w-4" spinning={refreshing} />
              Refresh
            </button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <DetailCard label="الحالة" value={message.statusLabel} />
          <DetailCard label="نوع الرسالة" value={message.messageType} />
          <DetailCard label="مرات الفتح" value={String(message.openCount)} />
          <DetailCard label="عدد النقرات" value={String(message.clickCount)} />
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <DetailCard label="وقت الإرسال" value={message.sentAtLabel} />
          <DetailCard label="وقت الفتح" value={message.openedAtLabel} />
          <DetailCard label="وقت النقر" value={message.clickedAtLabel} />
          <DetailCard label="Device" value={message.device} />
          <DetailCard label="الدولة" value={message.country} />
          <DetailCard label="IP" value={message.ipAddress} mono />
          <DetailCard label="Resend ID" value={message.resendId} mono />
        </section>

        <EventTimeline events={events} />
      </div>
    </main>
  );
}
