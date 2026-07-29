"use client";

import { useMemo, useState } from "react";
import Breadcrumbs from "../seo/Breadcrumbs";
import { useMarketDepthStream } from "../../hooks/useMarketDepthStream";
import { useOrderBookHistory } from "../../hooks/useOrderBookHistory";
import { useOrderBookLiquidityWalls } from "../../hooks/useOrderBookLiquidityWalls";
import {
  DEFAULT_LARGE_TRADE_THRESHOLD,
  DEFAULT_LARGE_TRADE_WINDOW,
  DEFAULT_LIQUIDITY_RANGE_PERCENT,
  DEFAULT_LIQUIDITY_WALL_WINDOW,
  DEPTH_LEVEL_OPTIONS,
  FLOW_WINDOW_OPTIONS,
  LARGE_TRADE_THRESHOLDS,
  LARGE_TRADE_WINDOW_OPTIONS,
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
  statusLabelAr,
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
    <div className="mx-auto max-w-7xl px-4 py-8" dir="rtl">
      <Breadcrumbs items={breadcrumbs} />

      <header className="mt-6 mb-6">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Market Depth
        </p>
        <h1 className="mb-2 text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
          دفتر الأوامر والسيولة
        </h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          متابعة لحظية لطلبات البيع والشراء، سيولة السوق، جدران الأوامر، الصفقات الكبيرة، وحجم التداول
          المنفذ.
        </p>
      </header>

      {/* Row 1 — price hero + quick stats */}
      <section className="mb-6 grid items-start gap-4 lg:grid-cols-12">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/80 sm:p-5 lg:col-span-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">الرمز الحالي</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-white">
                {SYMBOL_LABELS[prefs.symbol] || prefs.symbol}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {EXCHANGE_LABELS[prefs.mode] || prefs.mode}
              </p>
            </div>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
              {connectedCount}/{totalExchanges} منصات متصلة
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">آخر سعر</p>
            <NumericValue className="text-3xl font-bold text-slate-900 dark:text-white sm:text-4xl">
              {formatPrice(data?.lastPrice)}
            </NumericValue>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-7">
          <StatTile label="السبريد" value={formatPrice(data?.spread, 4)} />
          <StatTile
            label="نسبة الشراء"
            value={formatPercent(dominanceFlow?.buyPercent)}
            tone="buy"
          />
          <StatTile
            label="نسبة البيع"
            value={formatPercent(dominanceFlow?.sellPercent)}
            tone="sell"
          />
          <StatTile
            label="صافي التدفق"
            value={formatUsd(dominanceFlow?.netNotional ?? dominanceFlow?.netFlow, { compact: true })}
          />
        </div>
      </section>

      {/* Controls */}
      <section className="mb-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/80 sm:p-5">
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

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StyledSelect
            label="Precision"
            value={String(prefs.precision ?? getDefaultPrecision(prefs.symbol))}
            onChange={(value) => setPrefs({ precision: Number(value) })}
            options={precisionOptions.map((value) => ({ value: String(value), label: String(value) }))}
          />
          <StyledSelect
            label="المستويات"
            value={String(prefs.levels)}
            onChange={(value) => setPrefs({ levels: Number(value) })}
            options={DEPTH_LEVEL_OPTIONS.map((value) => ({ value: String(value), label: String(value) }))}
          />
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
      </section>

      {/* Row 2 — main order book + sidebar analytics */}
      <section className="mb-6 grid items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <OrderBookPanel data={data} mobileSide={prefs.mobileSide} symbol={prefs.symbol} />
        </div>

        <div className="space-y-6 lg:col-span-4">
          <Panel
            title="سيطرة الشراء والبيع"
            description={
              needsDominanceHistory
                ? "الصفقات المنفذة من السجل التاريخي ضمن الإطار المختار."
                : "الصفقات المنفذة فعلياً ضمن الإطار المختار."
            }
            action={
              <SegmentedControl
                compact
                ariaLabel="إطار السيطرة"
                label="الإطار"
                value={dominanceWindow}
                onChange={(value) => setPrefs({ dominanceWindow: value })}
                scrollable
                options={FLOW_WINDOW_OPTIONS.map((value) => ({ value, label: value }))}
              />
            }
          >
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
            action={
              <SegmentedControl
                compact
                ariaLabel="إطار الحجم"
                label="الإطار"
                value={prefs.flowWindow}
                onChange={(value) => setPrefs({ flowWindow: value })}
                scrollable
                options={FLOW_WINDOW_OPTIONS.map((value) => ({ value, label: value }))}
              />
            }
          >
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

          <Panel title="جدران السيولة اللحظية" description="أكبر مستويات سيولة ظاهرة حالياً في دفتر الأوامر.">
            <div className="grid gap-3">
              <LiveWallCard title="أكبر جدار شراء" wall={data?.walls?.largestBid} tone="buy" />
              <LiveWallCard title="أكبر جدار بيع" wall={data?.walls?.largestAsk} tone="sell" />
            </div>
          </Panel>
        </div>
      </section>

      {/* Row 3 — depth chart + large trades */}
      <section className="mb-6 grid items-start gap-6 lg:grid-cols-12">
        <Panel
          className="lg:col-span-7"
          title="خريطة عمق السيولة"
          description="توزيع السيولة الشرائية والبيعية حول السعر الحالي."
        >
          <LiquidityDepthChart points={data?.depthMap || []} midPrice={data?.midPrice} />
        </Panel>

        <Panel
          className="lg:col-span-5"
          title={largeTradesTitle}
          description="صفقات منفذة تجاوزت الحد المحدد ضمن النافذة الزمنية."
          action={
            <div className="flex w-full flex-col gap-3 sm:w-auto">
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
          }
        >
          <HistoryState
            loading={needsLargeTradeHistory && historyLoading}
            error={needsLargeTradeHistory && historyError}
            partial={largeTradeHistory?.partialData}
            coveragePercent={largeTradeHistory?.coveragePercent}
          />
          {displayedLargeTrades.length ? (
            <div className="max-h-80 overflow-y-auto overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2.5 text-right">الوقت</th>
                    <th className="px-3 py-2.5 text-right">المنصة</th>
                    <th className="px-3 py-2.5 text-right">الاتجاه</th>
                    <th className="px-3 py-2.5 text-left">القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedLargeTrades.map((trade) => (
                    <tr
                      key={`${trade.exchange}-${trade.ts}-${trade.price}-${trade.quantity}`}
                      className="border-t border-slate-100 transition hover:bg-slate-50/80 dark:border-white/5 dark:hover:bg-white/5"
                    >
                      <td className="px-3 py-2">
                        <NumericValue>{formatTime(trade.ts)}</NumericValue>
                      </td>
                      <td className="px-3 py-2">{EXCHANGE_LABELS[trade.exchange] || trade.exchange}</td>
                      <td className="px-3 py-2">
                        <SideBadge side={trade.side} />
                      </td>
                      <td className="px-3 py-2 text-left">
                        <NumericValue className="font-medium">
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
      <section className="mb-6">
        <HistoricalLiquidityWallsPanel
          wallWindow={liquidityWallWindow}
          onWallWindowChange={setLiquidityWallWindow}
          loading={liquidityWallsLoading}
          error={liquidityWallsError}
          history={liquidityWallsHistory}
        />
      </section>

      <section className="mb-6">
        <FearGreedCard />
      </section>

      {/* Last — data sources */}
      <section className="mb-2">
        <Panel
          title="مصادر البيانات"
          description="يتم تجميع بيانات دفتر الأوامر والتنفيذ من المنصات المتصلة."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {(data?.exchangeStatuses || []).map((item) => {
              const connected = item.status === "connected";
              return (
                <div
                  key={item.exchange}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3 text-sm dark:border-white/10"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-amber-500"}`}
                    />
                    <span className="font-medium">{EXCHANGE_LABELS[item.exchange] || item.exchange}</span>
                  </div>
                  <span className={connected ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                    {statusLabelAr(item.status)}
                  </span>
                </div>
              );
            })}
          </div>
          {data?.disclaimer ? (
            <p className="mt-3 text-xs leading-6 text-slate-500 dark:text-slate-400">{data.disclaimer}</p>
          ) : null}
        </Panel>
      </section>
    </div>
  );
}
