"use client";
import { UiPageShell } from "../../../../components/ui";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DetailSkeleton } from "../components/Skeleton";
import { IconRefresh } from "../components/icons";
import { useAdminFetch } from "../lib/useAdminFetch";
import { useVisibilityRefresh } from "../../../../hooks/useVisibilityRefresh";
function DetailCard({ label, value, mono = false }) {
  return (
    <div className="rounded-[24px] border border-[var(--ui-border)]200 ui-glass-solid p-5 shadow-[0_12px_40px_rgba(15,23,42,0.05)]">
      {" "}
      <p className="text-xs font-black uppercase tracking-[0.16em] admin-text-subtle">
        {label}
      </p>{" "}
      <p
        className={`mt-2 break-all text-lg font-black admin-text ${mono ? "font-mono text-sm" : ""}`}
      >
        {" "}
        {value || "—"}{" "}
      </p>{" "}
    </div>
  );
}
function EventTimeline({ events = [] }) {
  if (!events.length) {
    return (
      <div className="rounded-[28px] border border-[var(--ui-border)]200 ui-glass-solid p-8 text-center">
        {" "}
        <p className="text-sm admin-text-subtle">
          لا توجد أحداث مسجلة لهذه الرسالة بعد.
        </p>{" "}
      </div>
    );
  }
  return (
    <div className="rounded-[28px] border border-[var(--ui-border)]200 ui-glass-solid p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      {" "}
      <h2 className="text-2xl font-black admin-text">Timeline</h2>{" "}
      <div className="mt-6 space-y-4">
        {" "}
        {events.map((event, index) => (
          <div
            key={event.id}
            className="relative flex gap-4 rounded-2xl border border-[var(--ui-border)]200 bg-slate-50/80 p-4"
          >
            {" "}
            <div className="flex flex-col items-center">
              {" "}
              <div className="grid h-10 w-10 place-items-center rounded-full border admin-panel-border admin-panel text-sm font-black admin-text-muted">
                {" "}
                {index + 1}{" "}
              </div>{" "}
              {index < events.length - 1 ? (
                <div className="mt-2 h-full min-h-8 w-px bg-slate-200" />
              ) : null}{" "}
            </div>{" "}
            <div className="min-w-0 flex-1">
              {" "}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {" "}
                <p className="font-black admin-text">{event.type}</p>{" "}
                <p className="text-sm font-medium admin-text-subtle">
                  {event.createdAtLabel}
                </p>{" "}
              </div>{" "}
              {event.payload?.data?.click?.link ? (
                <p className="mt-2 break-all text-sm admin-text-muted">
                  {" "}
                  Link: {event.payload.data.click.link}{" "}
                </p>
              ) : null}{" "}
            </div>{" "}
          </div>
        ))}{" "}
      </div>{" "}
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
  const mountedRef = useRef(true);
  const loadRequestRef = useRef(0);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadRequestRef.current += 1;
    };
  }, []);
  const loadDetail = useCallback(
    async ({ silent = false } = {}) => {
      const requestId = ++loadRequestRef.current;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const response = await adminFetch(
          `/api/admin/email-analytics/${params.id}`,
          { method: "GET", cache: "no-store" },
        );
        const result = await response.json().catch(() => ({}));
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;
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
        if (!mountedRef.current || requestId !== loadRequestRef.current) return;
        setError(loadError?.message || "تعذر تحميل تفاصيل الرسالة");
      } finally {
        if (mountedRef.current && requestId === loadRequestRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [adminFetch, params.id],
  );
  useEffect(() => {
    loadDetail();
  }, [loadDetail]);
  useVisibilityRefresh(() => loadDetail({ silent: true }), {
    intervalMs: 30000,
    refreshOnVisible: false,
    refreshOnFocus: false,
  });
  if (loading) {
    return (
      <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-[var(--ui-border)]200 bg-slate-50 p-4 md:p-6">
        {" "}
        <DetailSkeleton />{" "}
      </main>
    );
  }
  if (error || !message) {
    return (
      <main className="relative min-h-[calc(100vh-120px)] overflow-hidden rounded-[34px] border border-[var(--ui-border)]200 bg-slate-50 p-6">
        {" "}
        <div className="mx-auto max-w-lg rounded-[28px] border border-[var(--ui-border)]200 ui-glass-solid p-8 text-center">
          {" "}
          <p className="text-xl font-black admin-text">
            {error || "الرسالة غير موجودة"}
          </p>{" "}
          <Link
            href="/admin/email-analytics"
            className="mt-6 inline-flex rounded-2xl border admin-panel-border admin-panel px-5 py-3 font-black admin-text-muted"
          >
            {" "}
            العودة للوحة{" "}
          </Link>{" "}
        </div>{" "}
      </main>
    );
  }
  return (
    <main className="relative z-0 overflow-hidden rounded-[34px] border border-[var(--ui-border)]200 bg-slate-50 ui-text-strong shadow-lg">
      {" "}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(0,102,255,0.08),transparent_30%)]" />{" "}
      <div className="relative z-10 space-y-6 p-4 md:p-6">
        {" "}
        <section className="rounded-[28px] border border-[var(--ui-border)]200 ui-glass-solid p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          {" "}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {" "}
            <div>
              {" "}
              <Link
                href="/admin/email-analytics"
                className="text-sm font-black admin-text-muted"
              >
                {" "}
                ← العودة للوحة{" "}
              </Link>{" "}
              <h1 className="mt-3 text-3xl font-black break-words">
                {message.subject}
              </h1>{" "}
              <p className="mt-2 text-sm admin-text-subtle">
                {message.email}
              </p>{" "}
            </div>{" "}
            <button
              type="button"
              onClick={() => loadDetail({ silent: true })}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-2xl border admin-panel-border admin-panel px-5 py-3 font-black admin-text-muted disabled:opacity-60"
            >
              {" "}
              <IconRefresh className="h-4 w-4" spinning={refreshing} />{" "}
              Refresh{" "}
            </button>{" "}
          </div>{" "}
        </section>{" "}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {" "}
          <DetailCard label="الحالة" value={message.statusLabel} />{" "}
          <DetailCard label="نوع الرسالة" value={message.messageType} />{" "}
          <DetailCard label="مرات الفتح" value={String(message.openCount)} />{" "}
          <DetailCard
            label="عدد النقرات"
            value={String(message.clickCount)}
          />{" "}
        </section>{" "}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {" "}
          <DetailCard label="وقت الإرسال" value={message.sentAtLabel} />{" "}
          <DetailCard label="وقت الفتح" value={message.openedAtLabel} />{" "}
          <DetailCard label="وقت النقر" value={message.clickedAtLabel} />{" "}
          <DetailCard label="Device" value={message.device} />{" "}
          <DetailCard label="الدولة" value={message.country} />{" "}
          <DetailCard label="IP" value={message.ipAddress} mono />{" "}
          <DetailCard label="Resend ID" value={message.resendId} mono />{" "}
        </section>{" "}
        <EventTimeline events={events} />{" "}
      </div>{" "}
    </main>
  );
}
