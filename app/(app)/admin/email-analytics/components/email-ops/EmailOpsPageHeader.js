"use client";

import { IconRefresh } from "../icons";

export function EmailOpsPageHeader({
  eyebrow = "Email Operations Center",
  title,
  description,
  statusLabel,
  statusLevel = "healthy",
  lastRefresh,
  onRefresh,
  refreshing = false,
  actions = null,
}) {
  const statusStyles = {
    healthy: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-200",
    warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200",
    unknown: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-400/25 dark:bg-white/5 dark:text-slate-200",
  };

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur-sm dark:border-cyan-300/15 dark:bg-[#07142f]/75 md:p-7">
      <div className="absolute -left-20 top-0 h-48 w-48 rounded-full bg-blue-500/10 blur-3xl dark:bg-blue-500/20" />
      <div className="absolute bottom-0 right-0 h-40 w-40 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <span className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-800 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-100">
            {eyebrow}
          </span>
          <h1 className="mt-4 text-2xl font-black leading-tight md:text-3xl">{title}</h1>
          {description ? (
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300 md:text-base">
              {description}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            {statusLabel ? (
              <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-bold ${statusStyles[statusLevel] || statusStyles.unknown}`}>
                <span className="h-2 w-2 rounded-full bg-current opacity-80" aria-hidden="true" />
                {statusLabel}
              </span>
            ) : null}
            {lastRefresh ? (
              <span className="text-slate-500 dark:text-slate-400">آخر تحديث: {lastRefresh}</span>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-[18px] border border-cyan-200 bg-cyan-50 px-4 py-2.5 text-sm font-black text-cyan-900 transition hover:-translate-y-0.5 disabled:opacity-60 dark:border-cyan-300/20 dark:bg-cyan-400/10 dark:text-cyan-100"
            >
              <IconRefresh className="h-4 w-4" spinning={refreshing} />
              {refreshing ? "جاري التحديث..." : "تحديث"}
            </button>
          ) : null}
          {actions}
        </div>
      </div>
    </section>
  );
}
