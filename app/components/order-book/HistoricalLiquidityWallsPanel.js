"use client";

import { useMemo, useState } from "react";
import { HISTORICAL_LIQUIDITY_WALL_WINDOWS } from "../../../lib/market-data/constants";
import { EXCHANGE_LABELS } from "../../../lib/market-data/symbols";
import {
  formatDurationAr,
  formatMinutesAgoAr,
  formatPrice,
  formatQuantity,
} from "./formatters";
import {
  CoverageBadge,
  EmptyState,
  HistoryState,
  NumericValue,
  Panel,
  SegmentedControl,
  SideBadge,
} from "./order-book-ui";

const WALL_TABS = [
  {
    id: "persistent",
    label: "الأكثر ثباتًا",
    hint: "مستويات سيولة بقيت ظاهرة لفترة أطول وحافظت على حجمها.",
    rowsKey: "topPersistent",
  },
  {
    id: "appeared",
    label: "الأكثر ظهورًا",
    hint: "مستويات اختفت وعادت للظهور عدة مرات قرب السعر نفسه.",
    rowsKey: "topAppeared",
  },
  {
    id: "disappeared",
    label: "المختفية حديثًا",
    hint: "مستويات كانت موجودة ثم أزيلت أو نُفذت مؤخرًا.",
    rowsKey: "recentlyDisappeared",
  },
];

const ANALYTICS_ITEMS = [
  { key: "strongestWall", label: "أقوى جدار", hint: "الجدار صاحب أعلى مؤشر قوة وثبات خلال الفترة." },
  { key: "longestLivingWall", label: "الأطول بقاءً", hint: "الجدار الذي بقي ظاهرًا لأطول مدة." },
  { key: "mostReappearedWall", label: "الأكثر تكرارًا", hint: "الجدار الذي اختفى وعاد للظهور أكثر من مرة." },
  { key: "largestNotionalWall", label: "الأكبر من حيث القيمة", hint: "الجدار صاحب أعلى قيمة نقدية مسجّلة." },
];

const DEFAULT_VISIBLE = 8;
const EXPANDED_VISIBLE = 20;

function AnalyticsCard({ label, hint, row }) {
  if (!row) return null;
  const isBuy = row.side === "bid";

  return (
    <div
      className={`rounded-xl border p-4 ${
        isBuy
          ? "border-emerald-200/80 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-950/20"
          : "border-rose-200/80 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20"
      }`}
      title={hint}
    >
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</p>
      <div className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500 dark:text-slate-400">السعر</span>
          <NumericValue className="font-semibold text-slate-900 dark:text-white">
            {formatPrice(row.price)}
          </NumericValue>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500 dark:text-slate-400">الاتجاه</span>
          <SideBadge side={row.side} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-500 dark:text-slate-400">الثبات</span>
          <NumericValue className={`font-semibold ${isBuy ? "text-emerald-600" : "text-rose-600"}`}>
            {Math.round(row.persistenceScore)}%
          </NumericValue>
        </div>
        {row.exchange ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500 dark:text-slate-400">المنصة</span>
            <span>{EXCHANGE_LABELS[row.exchange] || row.exchange}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function WallsTable({ rows, showLastSeen = false }) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows.slice(0, EXPANDED_VISIBLE) : rows.slice(0, DEFAULT_VISIBLE);

  if (!rows.length) {
    return <EmptyState message="لا توجد جدران تاريخية مهمة ضمن الإطار المختار بعد." />;
  }

  return (
    <div>
      <div className="hidden overflow-x-auto md:block">
        <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2.5 text-right">الاتجاه</th>
                <th className="px-3 py-2.5 text-right">السعر</th>
                <th className="px-3 py-2.5 text-right">الحجم</th>
                <th className="px-3 py-2.5 text-right">الثبات</th>
                <th className="px-3 py-2.5 text-right">مدة البقاء</th>
                <th className="px-3 py-2.5 text-right">مرات الظهور</th>
                <th className="px-3 py-2.5 text-right">المنصة</th>
                {showLastSeen ? <th className="px-3 py-2.5 text-right">آخر ظهور</th> : null}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr
                  key={row.wallKey}
                  className="border-t border-slate-100 transition hover:bg-slate-50/80 dark:border-white/5 dark:hover:bg-white/5"
                >
                  <td className="px-3 py-2.5">
                    <SideBadge side={row.side} />
                  </td>
                  <td className="px-3 py-2.5">
                    <NumericValue>{formatPrice(row.price)}</NumericValue>
                  </td>
                  <td className="px-3 py-2.5">
                    <NumericValue>{formatQuantity(row.size)}</NumericValue>
                  </td>
                  <td className="px-3 py-2.5">
                    <NumericValue>{Math.round(row.persistenceScore)}%</NumericValue>
                  </td>
                  <td className="px-3 py-2.5">{formatDurationAr(row.lifetimeSeconds)}</td>
                  <td className="px-3 py-2.5">
                    <NumericValue>{row.appearanceCount}</NumericValue>
                  </td>
                  <td className="px-3 py-2.5">{EXCHANGE_LABELS[row.exchange] || row.exchange}</td>
                  {showLastSeen ? (
                    <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                      {formatMinutesAgoAr(row.lastSeen)}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 md:hidden">
        {visibleRows.map((row) => {
          const isBuy = row.side === "bid";
          return (
            <div
              key={row.wallKey}
              className={`rounded-xl border p-3 ${
                isBuy
                  ? "border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-950/15"
                  : "border-rose-200/70 bg-rose-50/40 dark:border-rose-900/30 dark:bg-rose-950/15"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <SideBadge side={row.side} />
                <span className="text-xs text-slate-500">{EXCHANGE_LABELS[row.exchange] || row.exchange}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">السعر</span>
                  <p className="font-semibold">
                    <NumericValue>{formatPrice(row.price)}</NumericValue>
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">الثبات</span>
                  <p className="font-semibold">
                    <NumericValue>{Math.round(row.persistenceScore)}%</NumericValue>
                  </p>
                </div>
                <div>
                  <span className="text-slate-500">مدة البقاء</span>
                  <p>{formatDurationAr(row.lifetimeSeconds)}</p>
                </div>
                <div>
                  <span className="text-slate-500">مرات الظهور</span>
                  <p>
                    <NumericValue>{row.appearanceCount}</NumericValue>
                  </p>
                </div>
              </div>
              {showLastSeen ? (
                <p className="mt-2 text-xs text-slate-500">آخر ظهور: {formatMinutesAgoAr(row.lastSeen)}</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {rows.length > DEFAULT_VISIBLE ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
        >
          {expanded ? "عرض أقل" : `عرض المزيد (${Math.min(rows.length, EXPANDED_VISIBLE) - DEFAULT_VISIBLE}+)`}
        </button>
      ) : null}
    </div>
  );
}

export default function HistoricalLiquidityWallsPanel({
  wallWindow,
  onWallWindowChange,
  loading,
  error,
  history,
}) {
  const [activeTab, setActiveTab] = useState("persistent");
  const currentTab = WALL_TABS.find((tab) => tab.id === activeTab) || WALL_TABS[0];
  const rows = history?.[currentTab.rowsKey] || [];

  const analytics = useMemo(() => {
    if (!history?.analytics) return [];
    return ANALYTICS_ITEMS.map((item) => ({
      ...item,
      row: history.analytics[item.key],
    })).filter((item) => item.row);
  }, [history?.analytics]);

  return (
    <Panel
      title="جدران السيولة التاريخية"
      description="يعرض مستويات السيولة التي استمرت أو تكررت خلال الفترة المحددة، مع قياس قوة وثبات كل جدار."
      action={
        <SegmentedControl
          compact
          ariaLabel="إطار الجدران التاريخية"
          label="الإطار الزمني"
          value={wallWindow}
          onChange={onWallWindowChange}
          scrollable
          options={HISTORICAL_LIQUIDITY_WALL_WINDOWS.map((value) => ({ value, label: value }))}
        />
      }
      className="col-span-full"
    >
      <details className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
        <summary className="cursor-pointer font-medium">ما المقصود بالجدار؟</summary>
        <ul className="mt-2 list-disc space-y-1 pr-4 leading-6">
          <li>الجدار المستمر: مستوى سيولة بقي ظاهرًا لفترة طويلة.</li>
          <li>مرات الظهور: عدد المرات التي سُجّل فيها الجدار.</li>
          <li>مدة البقاء: الزمن بين أول وآخر ظهور.</li>
          <li>مؤشر الثبات: قياس مركّب للقوة والاستمرارية (0–100).</li>
        </ul>
      </details>

      <HistoryState loading={loading} error={error} partial={history?.partialData} coveragePercent={history?.coveragePercent} />

      {analytics.length ? (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {analytics.map((item) => (
            <AnalyticsCard key={item.key} label={item.label} hint={item.hint} row={item.row} />
          ))}
        </div>
      ) : null}

      <SegmentedControl
        ariaLabel="تبويبات جدران السيولة التاريخية"
        value={activeTab}
        onChange={setActiveTab}
        scrollable
        options={WALL_TABS.map((tab) => ({ value: tab.id, label: tab.label }))}
      />

      <p className="mt-3 text-xs leading-6 text-slate-500 dark:text-slate-400">{currentTab.hint}</p>

      <div className="mt-4">
        <WallsTable rows={rows} showLastSeen={activeTab === "disappeared"} />
      </div>
    </Panel>
  );
}
