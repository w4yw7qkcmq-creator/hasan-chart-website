"use client";

import { useMemo, useState } from "react";
import { HISTORICAL_LIQUIDITY_WALL_WINDOWS } from "../../../lib/market-data/constants";
import { EXCHANGE_LABELS } from "../../../lib/market-data/symbols";
import {
  formatDurationAr,
  formatFlowWindowLabelAr,
  formatMinutesAgoAr,
  formatPrice,
  formatQuantity,
  formatUsd,
} from "./formatters";
import { ob } from "./order-book-theme";
import {
  CoverageBadge,
  EmptyState,
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
  { key: "strongestBid", label: "أقوى جدار شراء", hint: "أقوى مستوى شراء خلال الفترة." },
  { key: "strongestAsk", label: "أقوى جدار بيع", hint: "أقوى مستوى بيع خلال الفترة." },
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
      className={`flex h-full min-h-[8.5rem] flex-col rounded-xl border p-3 sm:p-4 ${
        isBuy
          ? "border-[var(--ob-positive-border)] bg-[var(--ob-positive-soft)]"
          : "border-[var(--ob-negative-border)] bg-[var(--ob-negative-soft)]"
      }`}
      title={hint}
    >
      <p className={`text-xs font-medium ${ob.textMuted}`}>{label}</p>
      <div className="mt-2 flex flex-1 flex-col justify-end gap-1.5 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs ${ob.textSubtle}`}>السعر</span>
          <NumericValue className={`font-bold ${ob.textStrong}`}>
            {formatPrice(row.price)}
          </NumericValue>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className={`text-xs ${ob.textSubtle}`}>الاتجاه</span>
          <SideBadge side={row.side} />
        </div>
        {Number.isFinite(row.notional) ? (
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs ${ob.textSubtle}`}>القيمة</span>
            <NumericValue className={`font-semibold ${ob.textStrong}`}>
              {formatUsd(row.notional, { compact: true })}
            </NumericValue>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <span className={`text-xs ${ob.textSubtle}`}>الثبات</span>
            <NumericValue className={`font-semibold ${isBuy ? ob.positive : ob.negative}`}>
              {Math.round(row.persistenceScore)}%
            </NumericValue>
          </div>
        )}
      </div>
    </div>
  );
}

function historyHasRows(history) {
  return (
    (history?.totalCount ?? 0) > 0 ||
    (history?.topPersistent?.length ?? 0) > 0 ||
    (history?.topAppeared?.length ?? 0) > 0 ||
    (history?.recentlyDisappeared?.length ?? 0) > 0 ||
    Boolean(history?.analytics?.strongestBid || history?.analytics?.strongestAsk)
  );
}

function mergeHistoryRows(history) {
  const merged = [];
  const seen = new Set();
  for (const key of ["topPersistent", "topAppeared", "recentlyDisappeared"]) {
    for (const row of history?.[key] || []) {
      if (seen.has(row.wallKey)) continue;
      seen.add(row.wallKey);
      merged.push(row);
    }
  }
  return merged;
}

function resolveTabRows(history, rowsKey) {
  const tabRows = history?.[rowsKey] || [];
  if (tabRows.length) return tabRows;
  if (history?.topPersistent?.length) return history.topPersistent;
  if (history?.topAppeared?.length) return history.topAppeared;
  if (history?.recentlyDisappeared?.length) return history.recentlyDisappeared;
  return mergeHistoryRows(history);
}

function WallsTable({ rows, showLastSeen = false, usingFallback = false }) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows.slice(0, EXPANDED_VISIBLE) : rows.slice(0, DEFAULT_VISIBLE);

  if (!rows.length) {
    return <EmptyState message="لا توجد جدران تاريخية ضمن الإطار المختار بعد." />;
  }

  return (
    <div>
      {usingFallback ? (
        <p className={`mb-3 text-xs ${ob.textMuted}`}>
          لا توجد نتائج في هذا التبويب حاليًا — يُعرض أفضل ما هو متاح من بقية السجل.
        </p>
      ) : null}
      <div className="hidden overflow-x-auto md:block">
        <div className={`max-h-80 overflow-y-auto rounded-xl border ${ob.surfaceMuted}`}>
          <table className="w-full min-w-[640px] text-sm">
            <thead className={`text-xs ${ob.tableHeader} ${ob.textMuted}`}>
              <tr>
                <th className="px-3 py-2.5 text-right">الاتجاه</th>
                <th className="px-3 py-2.5 text-right">السعر</th>
                <th className="px-3 py-2.5 text-right">الحجم</th>
                <th className="px-3 py-2.5 text-right">القيمة</th>
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
                  className={`border-t border-[var(--ob-border)] ${ob.rowHover}`}
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
                    <NumericValue>{formatUsd(row.notional, { compact: true })}</NumericValue>
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
                    <td className={`px-3 py-2.5 text-xs ${ob.textMuted}`}>
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
                  ? "border-[var(--ob-positive-border)] bg-[var(--ob-positive-soft)]"
                  : "border-[var(--ob-negative-border)] bg-[var(--ob-negative-soft)]"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <SideBadge side={row.side} />
                <span className={`text-xs ${ob.textMuted}`}>
                  {EXCHANGE_LABELS[row.exchange] || row.exchange}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className={ob.textSubtle}>السعر</span>
                  <p className={`font-semibold ${ob.textStrong}`}>
                    <NumericValue>{formatPrice(row.price)}</NumericValue>
                  </p>
                </div>
                <div>
                  <span className={ob.textSubtle}>الثبات</span>
                  <p className={`font-semibold ${ob.textStrong}`}>
                    <NumericValue>{Math.round(row.persistenceScore)}%</NumericValue>
                  </p>
                </div>
                <div>
                  <span className={ob.textSubtle}>مدة البقاء</span>
                  <p className={ob.textNormal}>{formatDurationAr(row.lifetimeSeconds)}</p>
                </div>
                <div>
                  <span className={ob.textSubtle}>مرات الظهور</span>
                  <p className={ob.textNormal}>
                    <NumericValue>{row.appearanceCount}</NumericValue>
                  </p>
                </div>
              </div>
              {showLastSeen ? (
                <p className={`mt-2 text-xs ${ob.textMuted}`}>
                  آخر ظهور: {formatMinutesAgoAr(row.lastSeen)}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {rows.length > DEFAULT_VISIBLE ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className={`mt-3 rounded-lg px-3 py-1.5 text-xs font-medium ${ob.segmentedIdle} ${ob.focusRing}`}
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
  isRefreshing,
  isPendingWindow = false,
  error,
  refreshError,
  history,
}) {
  const [activeTab, setActiveTab] = useState("persistent");
  const selectedWindow = wallWindow;
  const displayHistory = history;
  const displayedWindow = displayHistory?.window ?? null;
  const isShowingPreviousWindow = Boolean(
    isPendingWindow && displayedWindow && displayedWindow !== selectedWindow,
  );
  const selectedFrameLabel = formatFlowWindowLabelAr(selectedWindow);
  const displayedFrameLabel = formatFlowWindowLabelAr(displayedWindow);

  const currentTab = WALL_TABS.find((tab) => tab.id === activeTab) || WALL_TABS[0];
  const tabRows = displayHistory?.[currentTab.rowsKey] || [];
  const rows = resolveTabRows(displayHistory, currentTab.rowsKey);
  const usingFallback = Boolean(displayHistory && tabRows.length === 0 && rows.length > 0);

  const analytics = useMemo(() => {
    if (!displayHistory?.analytics) return [];
    return ANALYTICS_ITEMS.map((item) => ({
      ...item,
      row: displayHistory.analytics[item.key],
    })).filter((item) => item.row);
  }, [displayHistory]);

  const showInitialLoading = loading && !displayHistory;
  const showRefreshOverlay = isShowingPreviousWindow && analytics.length > 0;
  return (
    <Panel
      title="جدران السيولة التاريخية"
      description="يعرض مستويات السيولة التي استمرت أو تكررت خلال الفترة المحددة، مع قياس قوة وثبات كل جدار."
      action={
        <div className="flex flex-wrap items-center gap-2">
          {displayHistory?.stale && !isShowingPreviousWindow ? (
            <span className={ob.badgeStale}>بيانات قديمة</span>
          ) : isRefreshing && !isShowingPreviousWindow ? (
            <span className={ob.badgeRefreshing}>جاري التحديث...</span>
          ) : null}
          <SegmentedControl
            compact
            ariaLabel="إطار الجدران التاريخية"
            label="الإطار الزمني"
            value={wallWindow}
            onChange={onWallWindowChange}
            mobileScrollable
            options={HISTORICAL_LIQUIDITY_WALL_WINDOWS.map((value) => ({ value, label: value }))}
          />
        </div>
      }
      className="col-span-full"
    >
      <details className={`mb-4 rounded-xl border px-3 py-2 text-xs ${ob.surfaceMuted} ${ob.textNormal}`}>
        <summary className={`cursor-pointer font-medium ${ob.textStrong}`}>ما المقصود بالجدار؟</summary>
        <ul className={`mt-2 list-disc space-y-1 pr-4 leading-6 ${ob.textMuted}`}>
          <li>الجدار المستمر: مستوى سيولة بقي ظاهرًا لفترة طويلة.</li>
          <li>مرات الظهور: عدد المرات التي سُجّل فيها الجدار.</li>
          <li>مدة البقاء: الزمن بين أول وآخر ظهور.</li>
          <li>مؤشر الثبات: قياس مركّب للقوة والاستمرارية (0–100).</li>
        </ul>
      </details>

      {showInitialLoading ? (
        <p className={`mb-4 min-h-[2.5rem] ${ob.alertInfo}`}>
          جاري تحميل بيانات إطار {selectedWindow}...
        </p>
      ) : null}

      {!showInitialLoading && error && !displayHistory ? (
        <p className={`mb-4 min-h-[2.5rem] ${ob.alertError}`}>
          تعذر تحميل البيانات التاريخية. حاول تحديث الإطار أو أعد المحاولة لاحقًا.
        </p>
      ) : null}

      {refreshError && displayHistory ? (
        <p className={`mb-4 min-h-[2.5rem] ${ob.alertWarning}`}>
          تعذّر تحديث بيانات هذا الإطار. يتم عرض آخر بيانات ناجحة.
        </p>
      ) : null}

      {displayHistory ? (
        <div className="mb-4 space-y-2">
          {isShowingPreviousWindow ? (
            <>
              <p className={`text-[11px] ${ob.textMuted}`}>
                الإطار المطلوب:{" "}
                <NumericValue className={`font-medium ${ob.textStrong}`}>
                  {selectedFrameLabel}
                </NumericValue>
              </p>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] ${ob.alertInfo}`}>
                يعرض مؤقتًا بيانات {displayedFrameLabel}
              </span>
              <p className={`text-[11px] leading-5 ${ob.textMuted}`}>
                البيانات المعروضة من الإطار السابق حتى اكتمال التحديث.
              </p>
            </>
          ) : (
            <p className={`text-[11px] ${ob.textMuted}`}>
              الإطار الحالي:{" "}
              <NumericValue className={`font-medium ${ob.textStrong}`}>
                {displayedFrameLabel}
              </NumericValue>
              {Number.isFinite(displayHistory.totalCount) ? (
                <>
                  {" "}
                  · جدران:{" "}
                  <NumericValue className="font-medium">{displayHistory.totalCount}</NumericValue>
                </>
              ) : null}
            </p>
          )}
          <CoverageBadge
            forceShow
            partial={displayHistory.partialData}
            coveragePercent={displayHistory.coveragePercent}
          />
          {!isShowingPreviousWindow ? (
            <p className={`text-[11px] leading-5 ${ob.textMuted}`}>
              قد تبقى أسعار الجدران متطابقة بين الإطارات إذا كان نفس الجدار هو الأقوى خلالها.
            </p>
          ) : null}
        </div>
      ) : null}

      {analytics.length ? (
        <div className="relative mb-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {analytics.map((item) => (
              <AnalyticsCard key={item.key} label={item.label} hint={item.hint} row={item.row} />
            ))}
          </div>
          {showRefreshOverlay ? (
            <div
              aria-hidden="true"
              className={`${ob.overlayScrim} flex items-center justify-center rounded-xl`}
            >
              <p className={ob.overlayPanel}>
                جاري تحميل بيانات إطار {selectedFrameLabel}...
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <SegmentedControl
        ariaLabel="تبويبات جدران السيولة التاريخية"
        value={activeTab}
        onChange={setActiveTab}
        scrollable
        options={WALL_TABS.map((tab) => ({ value: tab.id, label: tab.label }))}
      />

      <p className={`mt-3 text-xs leading-6 ${ob.textMuted}`}>{currentTab.hint}</p>

      <div className="relative mt-4">
        {showRefreshOverlay ? (
          <div aria-hidden="true" className={`${ob.overlayScrim} z-10 rounded-xl`} />
        ) : null}
        {!showInitialLoading && !(error && !displayHistory) && !rows.length && !analytics.length ? (
          <EmptyState message="لا توجد جدران تاريخية ضمن الإطار المختار بعد." />
        ) : displayHistory && (rows.length || analytics.length) ? (
          <WallsTable rows={rows} showLastSeen={activeTab === "disappeared"} usingFallback={usingFallback} />
        ) : null}
      </div>
    </Panel>
  );
}
