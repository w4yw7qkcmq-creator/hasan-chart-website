"use client";

import { formatCoveragePercent } from "../../../lib/market-data/history/window-utils.js";

export function NumericValue({ children, className = "" }) {
  return (
    <span dir="ltr" className={`inline-block tabular-nums ${className}`}>
      {children}
    </span>
  );
}

export function Panel({ title, description, children, action, className = "", compact = false }) {
  return (
    <section
      className={`min-w-0 overflow-x-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/80 ${
        compact ? "p-3 sm:p-4" : "p-4 sm:p-5"
      } ${className}`}
    >
      <div className={`min-w-0 shrink-0 ${compact ? "mb-3" : "mb-4"}`}>
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{description}</p>
        ) : null}
        {action ? <div className="mt-3 w-full min-w-0 max-w-full">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SegmentedControl({
  label,
  value,
  onChange,
  options,
  compact = false,
  ariaLabel,
  scrollable = false,
}) {
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-1.5">
      {label ? (
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      ) : null}
      <div
        className={`flex min-w-0 max-w-full rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-slate-950/60 ${
          scrollable ? "overflow-x-auto scrollbar-none" : "flex-wrap"
        }`}
        role="tablist"
        aria-label={ariaLabel || label}
      >
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(option.value)}
              className={`shrink-0 whitespace-nowrap rounded-lg px-3 ${compact ? "py-1.5" : "py-2"} text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 sm:text-sm ${
                active
                  ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                  : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/5 dark:hover:text-white"
              } ${option.tone === "buy" && active ? "ring-1 ring-emerald-500/30" : ""} ${
                option.tone === "sell" && active ? "ring-1 ring-rose-500/30" : ""
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StyledSelect({ label, value, onChange, options, compact = false }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 text-sm ${compact ? "min-w-[7rem]" : ""}`}>
      {label ? (
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
      ) : null}
      <div className="relative">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-white py-2 pl-3 pr-9 text-sm text-slate-800 outline-none transition focus-visible:ring-2 focus-visible:ring-slate-300 dark:border-white/10 dark:bg-slate-950 dark:text-slate-100 dark:focus-visible:ring-white/20"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        >
          ▾
        </span>
      </div>
    </label>
  );
}

export function SideBadge({ side, variant = "bid" }) {
  const isBuy = variant === "bid" || side === "bid" || side === "buy";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isBuy
          ? "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
      }`}
    >
      {isBuy ? "شراء" : "بيع"}
    </span>
  );
}

export function CoverageBadge({ partial, coveragePercent, compact = false }) {
  if (!partial) return null;
  const label = formatCoveragePercent(coveragePercent);
  return (
    <span
      className={`inline-flex items-center rounded-full border border-amber-200/80 bg-amber-50/90 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100 ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      تغطية <NumericValue className="mx-0.5">{label}%</NumericValue>
    </span>
  );
}

export function RefreshSpinner({ className = "" }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-200 ${className}`}
    />
  );
}

export function DepthHistoryState({ loading, error, partial, coveragePercent, collecting, minHeight = "h-44 sm:h-48" }) {
  if (loading) {
    return (
      <div className={`mb-3 flex ${minHeight} items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500 dark:bg-white/5 dark:text-slate-400`}>
        جاري تحميل جدران السيولة التاريخية...
      </div>
    );
  }

  if (error) {
    return (
      <div className={`mb-3 flex ${minHeight} items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200`}>
        تعذّر تحميل بيانات السيولة التاريخية.
      </div>
    );
  }

  if (collecting && (!Number.isFinite(coveragePercent) || coveragePercent <= 0)) {
    return (
      <p className="mb-3 rounded-lg border border-amber-200/80 bg-amber-50/80 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
        البيانات التاريخية قيد التجميع
      </p>
    );
  }

  if (partial) {
    return (
      <div className="mb-3">
        <CoverageBadge partial={partial} coveragePercent={coveragePercent} compact />
      </div>
    );
  }

  return null;
}

export function HistoryState({ loading, error, partial, coveragePercent }) {
  if (loading) {
    return (
      <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
        جاري تحميل البيانات التاريخية...
      </p>
    );
  }

  if (error) {
    return (
      <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
        تعذر تحميل البيانات التاريخية. حاول تحديث الإطار أو أعد المحاولة لاحقًا.
      </p>
    );
  }

  if (partial) {
    return (
      <div className="mb-3">
        <CoverageBadge partial={partial} coveragePercent={coveragePercent} compact />
      </div>
    );
  }

  return null;
}

export function MetricLine({ label, value, tone }) {
  const toneClass =
    tone === "buy"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "sell"
        ? "text-rose-600 dark:text-rose-400"
        : "text-slate-900 dark:text-white";

  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-b-0 dark:border-white/5">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <NumericValue className={`font-semibold ${toneClass}`}>{value}</NumericValue>
    </div>
  );
}

export function FlowSplitBar({ buyPercent = 0, sellPercent = 0 }) {
  const buy = Math.max(0, Math.min(100, Number(buyPercent) || 0));
  const sell = Math.max(0, Math.min(100, Number(sellPercent) || 0));
  const total = buy + sell || 1;
  const buyWidth = (buy / total) * 100;
  const sellWidth = (sell / total) * 100;

  return (
    <div className="space-y-2">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5">
        <div
          className="bg-emerald-500 transition-all dark:bg-emerald-500/90"
          style={{ width: `${buyWidth}%` }}
          aria-hidden="true"
        />
        <div
          className="bg-rose-500 transition-all dark:bg-rose-500/90"
          style={{ width: `${sellWidth}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          شراء <NumericValue>{buy.toFixed(1)}%</NumericValue>
        </span>
        <span>
          بيع <NumericValue>{sell.toFixed(1)}%</NumericValue>
        </span>
      </div>
    </div>
  );
}

export function StatTile({
  label,
  sublabel,
  value,
  tone,
  coveragePercent,
  partial,
  isRefreshing = false,
  initialLoading = false,
}) {
  const toneClass =
    tone === "buy"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "sell"
        ? "text-rose-600 dark:text-rose-400"
        : "text-slate-900 dark:text-white";

  const showCoverage =
    partial && Number.isFinite(coveragePercent) && coveragePercent > 0 && coveragePercent < 99;
  const showSkeleton = initialLoading && (value == null || value === "");

  return (
    <div className="flex h-full min-h-[7.5rem] min-w-0 flex-col rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          {sublabel ? (
            <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">{sublabel}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isRefreshing ? <RefreshSpinner /> : null}
          {showCoverage ? <CoverageBadge partial coveragePercent={coveragePercent} compact /> : null}
        </div>
      </div>
      <div className="mt-auto pt-2">
        {showSkeleton ? (
          <div className="h-7 w-20 animate-pulse rounded-md bg-slate-200/80 dark:bg-white/10" />
        ) : (
          <p className={`text-xl font-bold sm:text-2xl ${toneClass}`}>
            <NumericValue>{value ?? "—"}</NumericValue>
          </p>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ message, icon = "◌" }) {
  return (
    <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-white/10">
      <span className="mb-2 text-2xl text-slate-300 dark:text-slate-600" aria-hidden="true">
        {icon}
      </span>
      <p className="text-sm leading-6 text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}

export function ChartPlaceholder({ message, minHeight = "h-44 sm:h-48" }) {
  return (
    <div
      className={`flex ${minHeight} items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 text-sm text-slate-500 dark:border-white/10 dark:bg-slate-950/30 dark:text-slate-400`}
    >
      {message}
    </div>
  );
}
