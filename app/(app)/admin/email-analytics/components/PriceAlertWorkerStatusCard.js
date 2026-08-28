"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAdminFetch } from "../lib/useAdminFetch";
import { useVisibilityRefresh } from "../../../../hooks/useVisibilityRefresh";

const STATUS_LABELS = {
  HEALTHY: "سليم",
  STALE: "متوقف / قديم",
  DOWN: "متوقف",
  UNKNOWN: "غير معروف",
};

const STATUS_TONE = {
  HEALTHY: "emerald",
  STALE: "amber",
  DOWN: "red",
  UNKNOWN: "slate",
};

function formatRelativeAge(fromIso) {
  if (!fromIso) return "—";
  const fromMs = Date.parse(fromIso);
  if (Number.isNaN(fromMs)) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - fromMs) / 1000));
  if (diffSec < 60) return `منذ ${diffSec} ثانية`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return mins === 1 ? "منذ دقيقة" : `منذ ${mins} دقيقة`;
  const hours = Math.floor(mins / 60);
  return hours === 1 ? "منذ ساعة" : `منذ ${hours} ساعة`;
}

function formatGregorianDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ar-EG-u-ca-gregory-nu-latn", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    calendar: "gregory",
    numberingSystem: "latn",
  });
}

function toneClasses(tone) {
  const map = {
    emerald:
      "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200",
    amber:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-500/10 dark:text-amber-200",
    red: "border-red-200 bg-red-50 text-red-800 dark:border-red-400/20 dark:bg-red-500/10 dark:text-red-200",
    slate:
      "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-400/20 dark:bg-slate-500/10 dark:text-slate-200",
  };
  return map[tone] || map.slate;
}

export function PriceAlertWorkerStatusCard() {
  const adminFetch = useAdminFetch();
  const [workerStatus, setWorkerStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inFlightRef = useRef(false);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        if (!silent) setLoading(true);
        setError("");
        const res = await adminFetch("/api/admin/price-alerts/worker-status");
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "تعذر تحميل حالة عامل التنبيهات");
        setWorkerStatus(data.status);
      } catch (err) {
        setError(err.message || "تعذر تحميل حالة عامل التنبيهات");
      } finally {
        setLoading(false);
        inFlightRef.current = false;
      }
    },
    [adminFetch]
  );

  useEffect(() => {
    load();
  }, [load]);

  useVisibilityRefresh(() => load({ silent: true }), {
    intervalMs: 30_000,
    singleFlight: true,
  });

  const statusKey = workerStatus?.workerStatus || "UNKNOWN";
  const tone = STATUS_TONE[statusKey] || STATUS_TONE.UNKNOWN;

  const metaLine = useMemo(() => {
    if (!workerStatus?.lastCycleCompletedAt) return "لا توجد دورة مسجّلة بعد";
    return `آخر دورة: ${formatRelativeAge(workerStatus.lastCycleCompletedAt)} (${formatGregorianDateTime(workerStatus.lastCycleCompletedAt)})`;
  }, [workerStatus]);

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white/95 p-5 dark:border-cyan-300/15 dark:bg-[#07142f]/60 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            مراقبة العمليات
          </p>
          <h2 className="mt-1 text-lg font-black">عامل تنبيهات الأسعار</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            نبض الدورة من جدول price_alert_worker_runs — لا يعتمد على آخر خبر منشور.
          </p>
        </div>
        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${toneClasses(tone)}`}>
          {STATUS_LABELS[statusKey] || statusKey}
        </span>
      </div>

      {error ? (
        <p className="text-sm font-bold text-red-600 dark:text-red-300" role="alert">
          {error}
        </p>
      ) : loading && !workerStatus ? (
        <p className="text-sm text-slate-500">جاري تحميل حالة العامل...</p>
      ) : workerStatus ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs font-bold text-slate-500">آخر دورة</p>
            <p className="mt-1 text-sm font-black">{metaLine}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs font-bold text-slate-500">عتبة التقادم</p>
            <p className="mt-1 text-sm font-black">
              {workerStatus.staleThresholdMs ? `${Math.round(workerStatus.staleThresholdMs / 60_000)} دقيقة` : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs font-bold text-slate-500">إخفاقات متتالية</p>
            <p className="mt-1 text-sm font-black">{workerStatus.consecutiveFailures ?? 0}</p>
          </div>
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
            <p className="text-xs font-bold text-slate-500">آخر دورة — push / email</p>
            <p className="mt-1 text-sm font-black">
              {workerStatus.deliverySnapshot
                ? `push ${workerStatus.deliverySnapshot.pushSent}/${workerStatus.deliverySnapshot.pushFailed} · email ${workerStatus.deliverySnapshot.emailQueued}/${workerStatus.deliverySnapshot.emailFailed}`
                : "—"}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
