"use client";

import { formatPrice, formatTime, formatUsd } from "./formatters";
import { ob } from "./order-book-theme";
import { EmptyState, NumericValue, Panel } from "./order-book-ui";

function SideBadgeLabel({ side }) {
  if (side === "long") {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${ob.negative}`}>
        <span aria-hidden="true">▲</span>
        Long (تصفية مراكز شراء)
      </span>
    );
  }
  if (side === "short") {
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${ob.positive}`}>
        <span aria-hidden="true">▼</span>
        Short (تصفية مراكز بيع)
      </span>
    );
  }
  return "—";
}

function SideValue({ label, value, tone }) {
  const toneClass =
    tone === "long" ? ob.negative : tone === "short" ? ob.positive : ob.textStrong;

  return (
    <div className={`rounded-xl border px-3 py-2 ${ob.surfaceMuted}`}>
      <div className={`text-[11px] ${ob.textMuted}`}>{label}</div>
      <NumericValue className={`mt-0.5 text-sm font-semibold ${toneClass}`}>
        {formatUsd(value, { compact: true })}
      </NumericValue>
    </div>
  );
}

function SummaryWindowCard({ title, bucket }) {
  return (
    <div className={`rounded-xl border p-3 ${ob.surfaceMuted}`}>
      <div className={`mb-2 text-xs font-semibold ${ob.textMuted}`}>{title}</div>
      <div className={`mb-2 text-lg font-bold ${ob.textStrong}`}>
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
    <div className={`overflow-x-auto rounded-xl border [scrollbar-width:thin] ${ob.surfaceMuted}`}>
      <table className="w-full min-w-[520px] text-sm">
        <thead className={`text-[11px] ${ob.tableHeader} ${ob.textMuted}`}>
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
            <tr key={row.exchange} className={`border-t border-[var(--ob-border)] ${ob.rowHover}`}>
              <td className={`px-3 py-2 font-medium ${ob.textStrong}`}>{row.exchange}</td>
              <td className="px-3 py-2">
                <NumericValue>{formatUsd(row.total, { compact: true })}</NumericValue>
              </td>
              <td className={`px-3 py-2 ${ob.negative}`}>
                <NumericValue>{formatUsd(row.long, { compact: true })}</NumericValue>
              </td>
              <td className={`px-3 py-2 ${ob.positive}`}>
                <NumericValue>{formatUsd(row.short, { compact: true })}</NumericValue>
              </td>
              <td className={`px-3 py-2 text-left ${ob.textNormal}`}>
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
    <div className={`max-h-72 overflow-y-auto overflow-x-auto rounded-xl border [scrollbar-width:thin] ${ob.surfaceMuted}`}>
      <table className="w-full min-w-[560px] text-sm">
        <thead className={`sticky top-0 z-10 text-[11px] ${ob.tableHeader} ${ob.textMuted}`}>
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
          {rows.map((row, index) => (
            <tr key={`${row.id ?? "liq"}-${index}`} className={`border-t border-[var(--ob-border)] ${ob.rowHover}`}>
              <td className={`px-3 py-1.5 font-medium ${ob.textStrong}`}>{row.symbol || "—"}</td>
              <td className="px-3 py-1.5">
                <NumericValue className="text-xs">{formatPrice(row.price)}</NumericValue>
              </td>
              <td className="px-3 py-1.5">
                <NumericValue className={`font-semibold ${ob.textStrong}`}>
                  {formatUsd(row.notional, { compact: true })}
                </NumericValue>
              </td>
              <td className="px-3 py-1.5">
                <NumericValue className={`text-xs ${ob.textMuted}`}>{formatTime(row.time)}</NumericValue>
              </td>
              <td className="px-3 py-1.5">
                <SideBadgeLabel side={row.side} />
              </td>
              <td className={`px-3 py-1.5 text-left text-xs ${ob.textMuted}`}>{row.exchange || "—"}</td>
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
    <span className={ob.badgeStale}>بيانات قديمة</span>
  ) : isRefreshing ? (
    <span className={ob.badgeRefreshing}>جاري التحديث...</span>
  ) : null;

  if (initialLoading && !hasData) {
    return (
      <section className="mb-5 space-y-5">
        <Panel title="تصفيات السوق" description="جاري تحميل بيانات التصفيات...">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={`h-28 animate-pulse rounded-xl ${ob.surfaceMuted}`} />
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
        <p className={`mt-3 text-xs ${ob.textMuted}`}>
          المصدر: البيانات العامة المتاحة من CoinGlass.
        </p>
      </Panel>
    </section>
  );
}
