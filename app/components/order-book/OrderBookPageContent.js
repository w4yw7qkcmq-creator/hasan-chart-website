"use client";

import { useMemo, useState } from "react";
import Breadcrumbs from "../seo/Breadcrumbs";
import { useMarketDepthStream } from "../../hooks/useMarketDepthStream";
import { useOrderBookHistory } from "../../hooks/useOrderBookHistory";
import { useOrderBookLiquidityWalls } from "../../hooks/useOrderBookLiquidityWalls";
import { useOrderBook24hSummary } from "../../hooks/useOrderBook24hSummary";
import { useLiquidityDepthHistory } from "../../hooks/useLiquidityDepthHistory";
import {
  DEFAULT_LARGE_TRADE_THRESHOLD,
  DEFAULT_LARGE_TRADE_WINDOW,
  DEFAULT_LIQUIDITY_DEPTH_WINDOW,
  DEFAULT_LIQUIDITY_RANGE_PERCENT,
  DEFAULT_LIQUIDITY_WALL_WINDOW,
  DEPTH_LEVEL_OPTIONS,
  FLOW_WINDOW_OPTIONS,
  LARGE_TRADE_THRESHOLDS,
  LARGE_TRADE_WINDOW_OPTIONS,
  LIQUIDITY_DEPTH_WINDOW_OPTIONS,
  LIQUIDITY_RANGE_OPTIONS,
} from "../../../lib/market-data/constants";
import {
  EXCHANGE_LABELS,
  getDefaultPrecision,
  PRECISION_OPTIONS,
  SITE_SYMBOLS,
  SYMBOL_LABELS,
} from "../../../lib/market-data/symbols";
import FearGreedCard from "./FearGreedCard";
import HistoricalLiquidityWallsPanel from "./HistoricalLiquidityWallsPanel";
import LiquidityDepthChart from "./LiquidityDepthChart";
import OrderBookPanel, { LiveWallCard } from "./OrderBookPanel";
import {
  formatLargeTradeEmptyMessage,
  formatPercent,
  formatPrice,
  formatThresholdLabel,
  formatTime,
  formatUsd,
} from "./formatters";
import {
  EmptyState,
  FlowSplitBar,
  HistoryState,
  MetricLine,
  NumericValue,
  Panel,
  SegmentedControl,
  SideBadge,
  StatTile,
  StyledSelect,
} from "./order-book-ui";

const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق", href: "/markets" },
  { label: "دفتر الأوامر والسيولة", href: "/order-book" },
];

export default function OrderBookPageContent() {
  const { data, prefs, setPrefs, hydrated } = useMarketDepthStream();
  const [liquidityWallWindow, setLiquidityWallWindow] = useState(DEFAULT_LIQUIDITY_WALL_WINDOW);
  const [liquidityDepthWindow, setLiquidityDepthWindow] = useState(DEFAULT_LIQUIDITY_DEPTH_WINDOW);
  const {
    flowHistory,
    dominanceHistory,
    largeTradeHistory,
    loading: historyLoading,
    error: historyError,
    needsFlowHistory,
    needsDominanceHistory,
    needsLargeTradeHistory,
  } = useOrderBookHistory({ prefs, hydrated });
  const {
    liquidityWallsHistory,
    loading: liquidityWallsLoading,
    error: liquidityWallsError,
  } = useOrderBookLiquidityWalls({ prefs, hydrated, wallWindow: liquidityWallWindow });
  const {
    summary: summary24h,
    initialLoading: summary24hInitialLoading,
    isRefreshing: summary24hRefreshing,
    error: summary24hError,
  } = useOrderBook24hSummary({ symbol: prefs.symbol, hydrated });
  const {
    depthHistory,
    loading: depthHistoryLoading,
    error: depthHistoryError,
  } = useLiquidityDepthHistory({ prefs, hydrated, depthWindow: liquidityDepthWindow });

  const isLiveDepth = liquidityDepthWindow === "live";

  const precisionOptions = useMemo(() => {
    const base = getDefaultPrecision(prefs.symbol);
    const set = new Set(PRECISION_OPTIONS);
    set.add(base);
    return [...set].sort((a, b) => a - b);
  }, [prefs.symbol]);

  const largeTradeThreshold = prefs.largeTradeThreshold ?? DEFAULT_LARGE_TRADE_THRESHOLD;
  const largeTradeWindow = prefs.largeTradeWindow ?? DEFAULT_LARGE_TRADE_WINDOW;
  const dominanceWindow = prefs.dominanceWindow ?? prefs.flowWindow;
  const dominanceFlow = needsDominanceHistory ? dominanceHistory : data?.dominanceFlow;
  const executedFlow = needsFlowHistory ? flowHistory : data?.executedFlow;

  const displayedLargeTrades = needsLargeTradeHistory
    ? largeTradeHistory?.rows || []
    : data?.largeTrades || [];

  const largeTradesTitle = needsLargeTradeHistory
    ? "الصفقات الكبيرة التاريخية"
    : "الصفقات الكبيرة اللحظية";

  const largeTradeEmptyMessage = useMemo(
    () => formatLargeTradeEmptyMessage(largeTradeThreshold, largeTradeWindow),
    [largeTradeThreshold, largeTradeWindow],
  );

  const summaryNetFlow = summary24h?.netFlow ?? summary24h?.netNotional;
  const summaryNetTone =
    Number(summaryNetFlow) > 0 ? "buy" : Number(summaryNetFlow) < 0 ? "sell" : undefined;
  const summaryPartial = Boolean(summary24h?.partialData);
  const summaryCoverage = summary24h?.coveragePercent;
  const connectedCount = (data?.exchangeStatuses || []).filter((item) => item.status === "connected").length;
  const totalExchanges = data?.exchangeStatuses?.length || 3;

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="h-96 animate-pulse rounded-2xl bg-slate-200/70 dark:bg-white/5" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:py-8" dir="rtl">
      <Breadcrumbs items={breadcrumbs} />

      <header className="mt-4 mb-5">
        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">عمق السوق</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white sm:text-[1.65rem]">
          دفتر الأوامر والسيولة
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          متابعة لحظية لدفتر الأوامر، السيولة، جدران الأوامر، الصفقات الكبيرة، وحجم التداول المنفذ.
        </p>
      </header>

      {/* Row 1 — price hero + quick stats */}
      <section className="mb-5 grid items-stretch gap-3 lg:grid-cols-12 lg:gap-4">
        <div className="flex min-h-[7.5rem] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/80 sm:p-5 lg:col-span-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-slate-500 dark:text-slate-400">الرمز</p>
              <h2 className="truncate text-xl font-bold text-slate-900 dark:text-white">
                {SYMBOL_LABELS[prefs.symbol] || prefs.symbol}
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {EXCHANGE_LABELS[prefs.mode] || prefs.mode}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
              {connectedCount}/{totalExchanges} متصل
            </span>
          </div>
          <div className="mt-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">آخر سعر</p>
            <NumericValue className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
              {formatPrice(data?.lastPrice)}
            </NumericValue>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-3 lg:col-span-7 lg:grid-cols-4">
          <StatTile label="السبريد" sublabel="لحظي" value={formatPrice(data?.spread, 4)} />
          <StatTile
            label="نسبة الشراء"
            sublabel="آخر 24 ساعة"
            value={
              summary24hError && !summary24h
                ? "—"
                : summary24h
                  ? formatPercent(summary24h.buyPercent)
                  : null
            }
            tone="buy"
            partial={summaryPartial}
            coveragePercent={summaryCoverage}
            initialLoading={summary24hInitialLoading}
            isRefreshing={summary24hRefreshing}
          />
          <StatTile
            label="نسبة البيع"
            sublabel="آخر 24 ساعة"
            value={
              summary24hError && !summary24h
                ? "—"
                : summary24h
                  ? formatPercent(summary24h.sellPercent)
                  : null
            }
            tone="sell"
            partial={summaryPartial}
            coveragePercent={summaryCoverage}
            initialLoading={summary24hInitialLoading}
            isRefreshing={summary24hRefreshing}
          />
          <StatTile
            label="صافي التدفق"
            sublabel="آخر 24 ساعة"
            value={
              summary24hError && !summary24h
                ? "—"
                : summary24h
                  ? formatUsd(summaryNetFlow, { compact: true })
                  : null
            }
            tone={summaryNetTone}
            partial={summaryPartial}
            coveragePercent={summaryCoverage}
            initialLoading={summary24hInitialLoading}
            isRefreshing={summary24hRefreshing}
          />
        </div>
      </section>

      {/* Controls */}
      <section className="mb-5 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/80 sm:p-5">
        <div className="grid gap-4 xl:grid-cols-2">
          <SegmentedControl
            label="العملة"
            ariaLabel="اختيار العملة"
            value={prefs.symbol}
            onChange={(value) => setPrefs({ symbol: value, precision: getDefaultPrecision(value) })}
            options={SITE_SYMBOLS.map((symbol) => ({ value: symbol, label: SYMBOL_LABELS[symbol] }))}
            scrollable
          />
          <SegmentedControl
            label="المنصة"
            ariaLabel="اختيار المنصة"
            value={prefs.mode}
            onChange={(value) => setPrefs({ mode: value })}
            options={[
              { value: "aggregated", label: EXCHANGE_LABELS.aggregated },
              { value: "okx", label: EXCHANGE_LABELS.okx },
              { value: "binance", label: EXCHANGE_LABELS.binance },
              { value: "bybit", label: EXCHANGE_LABELS.bybit },
            ]}
            scrollable
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <StyledSelect
            label="نطاق السيولة"
            value={String(prefs.liquidityRange ?? DEFAULT_LIQUIDITY_RANGE_PERCENT)}
            onChange={(value) => setPrefs({ liquidityRange: Number(value) })}
            options={LIQUIDITY_RANGE_OPTIONS.map((value) => ({ value: String(value), label: `${value}%` }))}
          />
          <SegmentedControl
            label="عرض الجوال"
            ariaLabel="عرض الجوال"
            value={prefs.mobileSide}
            onChange={(value) => setPrefs({ mobileSide: value })}
            options={[
              { value: "all", label: "الكل" },
              { value: "asks", label: "بيع", tone: "sell" },
              { value: "bids", label: "شراء", tone: "buy" },
            ]}
          />
        </div>

        <div className="grid gap-3 border-t border-slate-100 pt-4 dark:border-white/5 sm:grid-cols-2">
          <StyledSelect
            label="دقة السعر"
            value={String(prefs.precision ?? getDefaultPrecision(prefs.symbol))}
            onChange={(value) => setPrefs({ precision: Number(value) })}
            options={precisionOptions.map((value) => ({ value: String(value), label: String(value) }))}
          />
          <StyledSelect
            label="عدد المستويات"
            value={String(prefs.levels)}
            onChange={(value) => setPrefs({ levels: Number(value) })}
            options={DEPTH_LEVEL_OPTIONS.map((value) => ({ value: String(value), label: String(value) }))}
          />
        </div>
      </section>

      {/* Row 2 — main order book + sidebar analytics */}
      <section className="mb-5 grid items-start gap-5 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <OrderBookPanel data={data} mobileSide={prefs.mobileSide} symbol={prefs.symbol} />
        </div>

        <div className="space-y-5 lg:col-span-4">
          <Panel
            title="سيطرة الشراء والبيع"
            description={
              needsDominanceHistory
                ? "الصفقات المنفذة من السجل التاريخي ضمن الإطار المختار."
                : "الصفقات المنفذة فعلياً ضمن الإطار المختار."
            }
          >
            <SegmentedControl
              compact
              ariaLabel="إطار السيطرة"
              label="الإطار"
              value={dominanceWindow}
              onChange={(value) => setPrefs({ dominanceWindow: value })}
              scrollable
              options={FLOW_WINDOW_OPTIONS.map((value) => ({ value, label: value }))}
            />
            <HistoryState
              loading={needsDominanceHistory && historyLoading}
              error={needsDominanceHistory && historyError}
              partial={dominanceHistory?.partialData}
              coveragePercent={dominanceHistory?.coveragePercent}
            />
            <FlowSplitBar
              buyPercent={dominanceFlow?.buyPercent}
              sellPercent={dominanceFlow?.sellPercent}
            />
            <div className="mt-4 space-y-2">
              <MetricLine
                label="شراء منفذ"
                value={formatUsd(dominanceFlow?.buyNotional, { compact: true })}
                tone="buy"
              />
              <MetricLine
                label="بيع منفذ"
                value={formatUsd(dominanceFlow?.sellNotional, { compact: true })}
                tone="sell"
              />
              <MetricLine
                label="صافي التدفق"
                value={formatUsd(dominanceFlow?.netNotional ?? dominanceFlow?.netFlow, { compact: true })}
              />
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-center text-sm font-medium text-slate-800 dark:bg-white/5 dark:text-slate-100">
                {dominanceFlow?.dominanceLabel || dominanceFlow?.dominanceClassification || "متوازن"}
              </p>
            </div>
          </Panel>

          <Panel
            title="حجم الشراء/البيع المنفذ"
            description={
              needsFlowHistory
                ? "الحجم المنفذ من السجل التاريخي."
                : "الصفقات المنفذة فعلياً، وليس السيولة الموضوعة في دفتر الأوامر."
            }
          >
            <SegmentedControl
              compact
              ariaLabel="إطار الحجم"
              label="الإطار"
              value={prefs.flowWindow}
              onChange={(value) => setPrefs({ flowWindow: value })}
              scrollable
              options={FLOW_WINDOW_OPTIONS.map((value) => ({ value, label: value }))}
            />
            <HistoryState
              loading={needsFlowHistory && historyLoading}
              error={needsFlowHistory && historyError}
              partial={flowHistory?.partialData}
              coveragePercent={flowHistory?.coveragePercent}
            />
            <FlowSplitBar buyPercent={executedFlow?.buyPercent} sellPercent={executedFlow?.sellPercent} />
            <div className="mt-4 space-y-2">
              <MetricLine
                label="شراء منفذ"
                value={formatUsd(executedFlow?.buyNotional, { compact: true })}
                tone="buy"
              />
              <MetricLine
                label="بيع منفذ"
                value={formatUsd(executedFlow?.sellNotional, { compact: true })}
                tone="sell"
              />
              <MetricLine
                label="صافي التدفق"
                value={formatUsd(executedFlow?.netNotional ?? executedFlow?.netFlow, { compact: true })}
              />
            </div>
          </Panel>

          <Panel
            title="جدران السيولة اللحظية"
            description="أكبر مستويات سيولة ظاهرة حالياً في دفتر الأوامر."
          >
            <div className="grid gap-2.5">
              <LiveWallCard title="أكبر جدار شراء" wall={data?.walls?.largestBid} tone="buy" />
              <LiveWallCard title="أكبر جدار بيع" wall={data?.walls?.largestAsk} tone="sell" />
            </div>
          </Panel>
        </div>
      </section>

      {/* Row 3 — depth chart + large trades */}
      <section className="mb-5 grid items-start gap-5 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          title={isLiveDepth ? "خريطة عمق السيولة" : "خريطة جدران السيولة التاريخية"}
          description={
            isLiveDepth
              ? "توزيع أوامر الشراء والبيع الظاهرة حاليًا حول السعر."
              : "مستويات السيولة التي ظهرت أو استمرت خلال الفترة المحددة."
          }
        >
          <div className="mb-4">
            <SegmentedControl
              compact
              ariaLabel="إطار خريطة السيولة"
              label="الإطار"
              value={liquidityDepthWindow}
              onChange={setLiquidityDepthWindow}
              scrollable
              options={LIQUIDITY_DEPTH_WINDOW_OPTIONS}
            />
          </div>
          <LiquidityDepthChart
            mode={isLiveDepth ? "live" : "historical"}
            points={isLiveDepth ? data?.depthMap || [] : depthHistory?.aggregatedDepthPoints || []}
            midPrice={data?.midPrice}
            loading={!isLiveDepth && depthHistoryLoading}
            error={!isLiveDepth && depthHistoryError}
            partial={depthHistory?.partialData}
            coveragePercent={depthHistory?.coveragePercent}
            collecting={depthHistory?.collecting}
          />
        </Panel>

        <Panel
          className="lg:col-span-5"
          title={largeTradesTitle}
          description="صفقات منفذة تجاوزت الحد المحدد ضمن النافذة الزمنية."
        >
          <div className="mb-4 space-y-3">
            <SegmentedControl
              compact
              ariaLabel="حد الصفقة الكبيرة"
              label="الحد"
              value={String(largeTradeThreshold)}
              onChange={(value) => setPrefs({ largeTradeThreshold: Number(value) })}
              scrollable
              options={LARGE_TRADE_THRESHOLDS.map((value) => ({
                value: String(value),
                label: formatThresholdLabel(value),
              }))}
            />
            <SegmentedControl
              compact
              ariaLabel="نافذة الصفقات الكبيرة"
              label="الإطار"
              value={largeTradeWindow}
              onChange={(value) => setPrefs({ largeTradeWindow: value })}
              scrollable
              options={LARGE_TRADE_WINDOW_OPTIONS.map((value) => ({ value, label: value }))}
            />
          </div>
          <HistoryState
            loading={needsLargeTradeHistory && historyLoading}
            error={needsLargeTradeHistory && historyError}
            partial={largeTradeHistory?.partialData}
            coveragePercent={largeTradeHistory?.coveragePercent}
          />
          {displayedLargeTrades.length ? (
            <div className="max-h-72 overflow-y-auto overflow-x-auto rounded-xl border border-slate-200 [scrollbar-width:thin] dark:border-white/10">
              <table className="w-full min-w-[480px] text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 text-right">الوقت</th>
                    <th className="px-3 py-2 text-right">المنصة</th>
                    <th className="px-3 py-2 text-right">الاتجاه</th>
                    <th className="px-3 py-2 text-right">السعر</th>
                    <th className="px-3 py-2 text-left">القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedLargeTrades.map((trade) => (
                    <tr
                      key={`${trade.exchange}-${trade.ts}-${trade.price}-${trade.quantity}`}
                      className="border-t border-slate-100 transition hover:bg-slate-50/80 dark:border-white/5 dark:hover:bg-white/5"
                    >
                      <td className="px-3 py-1.5">
                        <NumericValue className="text-xs">{formatTime(trade.ts)}</NumericValue>
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {EXCHANGE_LABELS[trade.exchange] || trade.exchange}
                      </td>
                      <td className="px-3 py-1.5">
                        <SideBadge side={trade.side} />
                      </td>
                      <td className="px-3 py-1.5">
                        <NumericValue className="text-xs">{formatPrice(trade.price)}</NumericValue>
                      </td>
                      <td className="px-3 py-1.5 text-left">
                        <NumericValue className="font-semibold text-slate-900 dark:text-white">
                          {formatUsd(trade.notional, { compact: true })}
                        </NumericValue>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !(needsLargeTradeHistory && historyLoading) && (
              <EmptyState message={largeTradeEmptyMessage} />
            )
          )}
        </Panel>
      </section>

      {/* Row 5 — historical liquidity walls full width */}
      <section className="mb-5">
        <HistoricalLiquidityWallsPanel
          wallWindow={liquidityWallWindow}
          onWallWindowChange={setLiquidityWallWindow}
          loading={liquidityWallsLoading}
          error={liquidityWallsError}
          history={liquidityWallsHistory}
        />
      </section>

      <section className="mb-5">
        <FearGreedCard variant="orderBook" />
      </section>

      {/* Last — data sources */}
      <section className="mb-2">
        <details open className="group rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/80">
          <summary className="cursor-pointer list-none p-4 sm:p-5 [&::-webkit-details-marker]:hidden">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">مصادر البيانات</h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  حالة اتصال منصات دفتر الأوامر والتنفيذ.
                </p>
              </div>
              <span className="text-xs text-slate-400 group-open:rotate-180 transition-transform">▾</span>
            </div>
          </summary>
          <div className="border-t border-slate-100 px-4 pb-4 pt-3 dark:border-white/5 sm:px-5 sm:pb-5">
            <div className="grid gap-2 sm:grid-cols-3">
              {(data?.exchangeStatuses || []).map((item) => {
                const connected = item.status === "connected";
                return (
                  <div
                    key={item.exchange}
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-sm dark:border-white/10"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
                      />
                      <span className="font-medium">{EXCHANGE_LABELS[item.exchange] || item.exchange}</span>
                    </div>
                    <span
                      className={
                        connected
                          ? "text-xs text-emerald-600 dark:text-emerald-400"
                          : "text-xs text-amber-600 dark:text-amber-400"
                      }
                    >
                      {connected ? "متصل" : "غير متصل"}
                    </span>
                  </div>
                );
              })}
            </div>
            {data?.disclaimer ? (
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">{data.disclaimer}</p>
            ) : null}
          </div>
        </details>
      </section>
    </div>
  );
}
