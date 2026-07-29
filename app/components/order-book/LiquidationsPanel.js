"use client";

import { formatPrice, formatTime, formatUsd } from "./formatters";
import { EmptyState, NumericValue, Panel } from "./order-book-ui";

function SideValue({ label, value, tone }) {
  const toneClass =
    tone === "long"
      ? "text-rose-600 dark:text-rose-400"
      : tone === "short"
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-slate-900 dark:text-white";

  return (
    <div className="rounded-xl border border-slate-200 px-3 py-2 dark:border-white/10">
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      <NumericValue className={`mt-0.5 text-sm font-semibold ${toneClass}`}>
        {formatUsd(value, { compact: true })}
      </NumericValue>
    </div>
  );
}

function SummaryWindowCard({ title, bucket }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-white/10">
      <div className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</div>
      <div className="mb-2 text-lg font-bold text-slate-900 dark:text-white">
        <NumericValue>{formatUsd(bucket?.total, { compact: true })}</NumericValue>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SideValue label="Long" value={bucket?.long} tone="long" />
        <SideValue label="Short" value={bucket?.short} tone="short" />
      </div>
    </div>
  );
}

function ExchangeTable({ rows }) {
  if (!rows?.length) {
    return <EmptyState message="لا توجد بيانات منصات متاحة." />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 [scrollbar-width:thin] dark:border-white/10">
      <table className="w-full min-w-[520px] text-sm">
        <thead className="bg-slate-50 text-[11px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2 text-right">المنصة</th>
            <th className="px-3 py-2 text-right">الإجمالي</th>
            <th className="px-3 py-2 text-right">Long</th>
            <th className="px-3 py-2 text-right">Short</th>
            <th className="px-3 py-2 text-left">الحصة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.exchange} className="border-t border-slate-100 dark:border-white/5">
              <td className="px-3 py-2 font-medium">{row.exchange}</td>
              <td className="px-3 py-2">
                <NumericValue>{formatUsd(row.total, { compact: true })}</NumericValue>
              </td>
              <td className="px-3 py-2 text-rose-600 dark:text-rose-400">
                <NumericValue>{formatUsd(row.long, { compact: true })}</NumericValue>
              </td>
              <td className="px-3 py-2 text-emerald-600 dark:text-emerald-400">
                <NumericValue>{formatUsd(row.short, { compact: true })}</NumericValue>
              </td>
              <td className="px-3 py-2 text-left">
                <NumericValue>{row.sharePercent != null ? `${row.sharePercent}%` : "—"}</NumericValue>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RealtimeTable({ rows }) {
  if (!rows?.length) {
    return <EmptyState message="لا توجد تصفيات لحظية متاحة." />;
  }

  return (
    <div className="max-h-72 overflow-y-auto overflow-x-auto rounded-xl border border-slate-200 [scrollbar-width:thin] dark:border-white/10">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <tr>
            <th className="px-3 py-2 text-right">الرمز</th>
            <th className="px-3 py-2 text-right">السعر</th>
            <th className="px-3 py-2 text-right">القيمة</th>
            <th className="px-3 py-2 text-right">الوقت</th>
            <th className="px-3 py-2 text-right">المركز</th>
            <th className="px-3 py-2 text-left">المنصة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-slate-100 dark:border-white/5">
              <td className="px-3 py-1.5 font-medium">{row.symbol || "—"}</td>
              <td className="px-3 py-1.5">
                <NumericValue className="text-xs">{formatPrice(row.price)}</NumericValue>
              </td>
              <td className="px-3 py-1.5">
                <NumericValue className="font-semibold">{formatUsd(row.notional, { compact: true })}</NumericValue>
              </td>
              <td className="px-3 py-1.5">
                <NumericValue className="text-xs">{formatTime(row.time)}</NumericValue>
              </td>
              <td className="px-3 py-1.5">
                {row.side === "long" ? (
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">Long</span>
                ) : row.side === "short" ? (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Short</span>
                ) : (
                  "—"
                )}
              </td>
              <td className="px-3 py-1.5 text-left text-xs">{row.exchange || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function hasDisplayableData(data) {
  if (!data?.summary) return false;
  return Object.values(data.summary).some(
    (bucket) => bucket?.total != null && Number.isFinite(Number(bucket.total)),
  );
}

export default function LiquidationsPanel({ data, initialLoading, isRefreshing, error }) {
  const hasData = hasDisplayableData(data);
  const unavailable =
    !hasData &&
    !initialLoading &&
    (error === "UNAVAILABLE" || error === "FETCH_FAILED" || data?.available === false || data?.success === false);
  const summary = data?.summary;
  const exchanges = data?.exchanges || [];
  const realtime = data?.realtime || [];
  const showStaleBadge = Boolean(data?.stale);
  const statusAction = showStaleBadge ? (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
      بيانات قديمة
    </span>
  ) : isRefreshing ? (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
      جاري التحديث...
    </span>
  ) : null;

  if (initialLoading && !hasData) {
    return (
      <section className="mb-5 space-y-5">
        <Panel title="تصفيات السوق" description="جاري تحميل بيانات التصفيات...">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
            ))}
          </div>
        </Panel>
      </section>
    );
  }

  if (unavailable) {
    return (
      <section className="mb-5">
        <Panel title="تصفيات السوق" description="ملخص التصفيات حسب الإطار الزمني والمنصة.">
          <EmptyState message="بيانات التصفيات غير متاحة مؤقتًا." />
        </Panel>
      </section>
    );
  }

  return (
    <section className="mb-5 space-y-5">
      <Panel
        title="ملخص التصفيات"
        description="إجمالي تصفيات Long وShort عبر الإطارات الزمنية."
        action={statusAction}
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryWindowCard title="1h" bucket={summary?.["1h"]} />
          <SummaryWindowCard title="4h" bucket={summary?.["4h"]} />
          <SummaryWindowCard title="12h" bucket={summary?.["12h"]} />
          <SummaryWindowCard title="24h" bucket={summary?.["24h"]} />
        </div>
      </Panel>

      <Panel title="التصفيات حسب المنصة" description="Binance وBybit وOKX مع الإجمالي والحصة (4h).">
        <ExchangeTable rows={exchanges} />
      </Panel>

      <Panel title="التصفيات في الوقت الفعلي" description="آخر أوامر التصفية الظاهرة على CoinGlass.">
        <RealtimeTable rows={realtime} />
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          المصدر: البيانات العامة المتاحة من CoinGlass.
        </p>
      </Panel>
    </section>
  );
}
