"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  DEFAULT_LIQUIDITY_WALLS_SUMMARY_WINDOW,
  DEPTH_LEVEL_OPTIONS,
  FLOW_WINDOW_OPTIONS,
  LARGE_TRADE_THRESHOLDS,
  LARGE_TRADE_WINDOW_OPTIONS,
  LIQUIDITY_DEPTH_WINDOW_OPTIONS,
  LIQUIDITY_RANGE_OPTIONS,
  LIQUIDITY_WALLS_SUMMARY_WINDOW_OPTIONS,
} from "../../../lib/market-data/constants";
import {
  EXCHANGE_LABELS,
  formatMarketSymbol,
  getDefaultPrecision,
  normalizeMarketSymbol,
  PRECISION_OPTIONS,
} from "../../../lib/market-data/symbols";
import FearGreedCard from "./FearGreedCard";
import LiquidationsPanel from "./LiquidationsPanel";
import { useOrderBookLiquidations } from "../../hooks/useOrderBookLiquidations";
import HistoricalLiquidityWallsPanel from "./HistoricalLiquidityWallsPanel";
import LiquidityDepthChart from "./LiquidityDepthChart";
import OrderBookPanel, {
  HistoricalWallCard,
  LiveWallCard,
  LiquidityWallsState,
} from "./OrderBookPanel";
import {
  formatLargeTradeEmptyMessage,
  formatPercent,
  formatPrice,
  formatQuantity,
  formatThresholdLabel,
  formatTime,
  formatUsd,
} from "./formatters";
import {
  EmptyState,
  ConnectionStatusBadge,
  FlowSplitBar,
  HistoryState,
  MetricLine,
  NumericValue,
  Panel,
  SegmentedControl,
  SideBadge,
  StatTile,
  OrderBookListbox,
  SymbolSearchCombobox,
} from "./order-book-ui";
import { ob } from "./order-book-theme";

const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق", href: "/markets" },
  { label: "دفتر الأوامر والسيولة", href: "/order-book" },
];

export const LARGE_TRADES_MAX_VISIBLE_ROWS = 15;

function pickHistoricalWallSide(history, side) {
  const analyticsKey = side === "bid" ? "strongestBid" : "strongestAsk";
  const fromAnalytics = history?.analytics?.[analyticsKey];
  if (fromAnalytics) return fromAnalytics;

  for (const key of ["topPersistent", "topAppeared", "recentlyDisappeared"]) {
    const row = (history?.[key] || []).find((item) => item.side === side);
    if (row) return row;
  }

  return null;
}

export default function OrderBookPageContent() {
  const { data, prefs, setPrefs, hydrated, symbolSwitching, symbolRateLimitMessage } = useMarketDepthStream();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [symbolNotice, setSymbolNotice] = useState(null);
  const urlSymbolAppliedRef = useRef(false);
  const [liquidityWallWindow, setLiquidityWallWindow] = useState(DEFAULT_LIQUIDITY_WALL_WINDOW);
  const [liquidityWallsWindow, setLiquidityWallsWindow] = useState(DEFAULT_LIQUIDITY_WALLS_SUMMARY_WINDOW);
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
    initialLoading: liquidityWallsInitialLoading,
    isRefreshing: liquidityWallsRefreshing,
    loading: liquidityWallsLoading,
    error: liquidityWallsError,
    isPendingWindow: liquidityWallsPendingWindow,
    refreshError: liquidityWallsRefreshError,
  } = useOrderBookLiquidityWalls({ prefs, hydrated, wallWindow: liquidityWallWindow });
  const isSidebarWallsLive = liquidityWallsWindow === "live";
  const {
    liquidityWallsHistory: sidebarWallsHistory,
    loading: sidebarWallsLoading,
    error: sidebarWallsError,
  } = useOrderBookLiquidityWalls({
    prefs,
    hydrated,
    wallWindow: isSidebarWallsLive ? DEFAULT_LIQUIDITY_WALL_WINDOW : liquidityWallsWindow,
    enabled: !isSidebarWallsLive,
  });
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
  const {
    data: liquidationsData,
    initialLoading: liquidationsInitialLoading,
    isRefreshing: liquidationsRefreshing,
    error: liquidationsError,
  } = useOrderBookLiquidations({ hydrated });

  const lastLiveWallsRef = useRef({ bid: null, ask: null });

  const liveWallsBid = useMemo(() => {
    const wall = data?.walls?.largestBid;
    if (wall) {
      lastLiveWallsRef.current.bid = wall;
      return wall;
    }
    if ((data?.bids?.length ?? 0) > 0 && lastLiveWallsRef.current.bid) {
      return lastLiveWallsRef.current.bid;
    }
    return null;
  }, [data?.walls?.largestBid, data?.bids]);

  const liveWallsAsk = useMemo(() => {
    const wall = data?.walls?.largestAsk;
    if (wall) {
      lastLiveWallsRef.current.ask = wall;
      return wall;
    }
    if ((data?.asks?.length ?? 0) > 0 && lastLiveWallsRef.current.ask) {
      return lastLiveWallsRef.current.ask;
    }
    return null;
  }, [data?.walls?.largestAsk, data?.asks]);

  const sidebarWallsBid = isSidebarWallsLive
    ? liveWallsBid
    : pickHistoricalWallSide(sidebarWallsHistory, "bid");
  const sidebarWallsAsk = isSidebarWallsLive
    ? liveWallsAsk
    : pickHistoricalWallSide(sidebarWallsHistory, "ask");
  const sidebarWallsEmpty =
    !isSidebarWallsLive &&
    !sidebarWallsLoading &&
    !sidebarWallsError &&
    !sidebarWallsBid &&
    !sidebarWallsAsk &&
    !(sidebarWallsHistory?.totalCount > 0);
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
  const liveDominanceFlow =
    !needsDominanceHistory && data?.dominanceFlow?.window === dominanceWindow
      ? data.dominanceFlow
      : null;
  const historicalDominanceFlow =
    needsDominanceHistory && dominanceHistory?.window === dominanceWindow
      ? dominanceHistory
      : null;
  const dominanceFlow = needsDominanceHistory ? historicalDominanceFlow : liveDominanceFlow;

  const liveExecutedFlow =
    !needsFlowHistory && data?.executedFlow?.window === prefs.flowWindow
      ? data.executedFlow
      : null;
  const historicalExecutedFlow =
    needsFlowHistory && flowHistory?.window === prefs.flowWindow ? flowHistory : null;
  const executedFlow = needsFlowHistory ? historicalExecutedFlow : liveExecutedFlow;
  const executedFlowLoading = needsFlowHistory
    ? historyLoading || (Boolean(prefs.flowWindow) && !historicalExecutedFlow && !historyError)
    : !liveExecutedFlow && Boolean(data?.symbol);

  const displayedLargeTrades = useMemo(() => {
    const rows = needsLargeTradeHistory
      ? largeTradeHistory?.rows || []
      : data?.largeTrades || [];
    return [...rows]
      .sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0))
      .slice(0, LARGE_TRADES_MAX_VISIBLE_ROWS);
  }, [needsLargeTradeHistory, largeTradeHistory?.rows, data?.largeTrades]);

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
  const connectedCount = data?.connectedExchangeCount ?? (data?.exchangeStatuses || []).filter((item) => item.status === "connected").length;
  const totalExchanges = data?.expectedExchangeCount ?? (data?.exchangeStatuses?.length || 3);
  const probing = Boolean(data?.probing);
  const coverageLabel = probing
    ? "جاري التحقق من المنصات الداعمة..."
    : `${connectedCount}/${totalExchanges} متصل`;
  const displaySymbol = data?.displaySymbol || formatMarketSymbol(prefs.symbol);
  const historyCollecting = Boolean(data?.historyCollecting);

  useEffect(() => {
    if (!hydrated || urlSymbolAppliedRef.current) return;
    urlSymbolAppliedRef.current = true;

    const raw = searchParams.get("symbol");
    if (!raw) return;

    const normalized = normalizeMarketSymbol(raw);
    if (!normalized) {
      setSymbolNotice("الرمز المطلوب غير متاح حاليًا، تم الرجوع إلى BTC/USDT.");
      setPrefs(
        { symbol: "BTCUSDT", precision: getDefaultPrecision("BTCUSDT", data?.lastPrice) },
        { source: "fallback" },
      );
      router.replace("/order-book?symbol=BTCUSDT", { scroll: false });
      return;
    }

    void fetch(`/api/market-symbols?query=${encodeURIComponent(normalized)}&limit=5&minExchanges=2`)
      .then((response) => response.json())
      .then((payload) => {
        const supported = (payload?.symbols || []).some((entry) => entry.symbol === normalized);
        if (supported) {
          setPrefs(
            { symbol: normalized, precision: getDefaultPrecision(normalized, data?.lastPrice) },
            { source: "url" },
          );
          return;
        }

        if (!payload?.available) {
          setSymbolNotice("تعذّر تحميل قائمة العملات حاليًا. العملات الأساسية فقط متاحة مؤقتًا.");
        } else {
          setSymbolNotice("الرمز المطلوب غير متاح حاليًا، تم الرجوع إلى BTC/USDT.");
        }

        setPrefs(
          { symbol: "BTCUSDT", precision: getDefaultPrecision("BTCUSDT", data?.lastPrice) },
          { source: "fallback" },
        );
        router.replace("/order-book?symbol=BTCUSDT", { scroll: false });
      })
      .catch(() => {
        setSymbolNotice("تعذّر تحميل قائمة العملات حاليًا. العملات الأساسية فقط متاحة مؤقتًا.");
        setPrefs(
          { symbol: "BTCUSDT", precision: getDefaultPrecision("BTCUSDT", data?.lastPrice) },
          { source: "fallback" },
        );
        router.replace("/order-book?symbol=BTCUSDT", { scroll: false });
      });
  }, [hydrated, searchParams, setPrefs, data?.lastPrice, router]);

  function handleSymbolChange(value) {
    setSymbolNotice(null);
    const applied = setPrefs(
      { symbol: value, precision: getDefaultPrecision(value, data?.lastPrice) },
      { source: "user" },
    );
    if (!applied) return;

    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.set("symbol", value);
    router.replace(`/order-book?${params.toString()}`, { scroll: false });
  }

  if (!hydrated) {
    return (
      <div className={`mx-auto max-w-7xl px-4 py-8 ${ob.page}`}>
        <div className="h-96 animate-pulse rounded-2xl bg-[var(--ob-surface-muted)] motion-reduce:animate-none" aria-hidden="true" />
        <p className="sr-only" role="status" aria-live="polite">
          جاري تحميل دفتر الأوامر...
        </p>
      </div>
    );
  }

  return (
    <div className={`mx-auto max-w-7xl px-4 py-6 sm:py-8 ${ob.page}`} dir="rtl">
      <Breadcrumbs items={breadcrumbs} />

      <header className="mt-4 mb-6">
        <p className={ob.eyebrow}>عمق السوق</p>
        <h1 className={`mt-1 ${ob.heading}`}>دفتر الأوامر والسيولة</h1>
        <p className={`mt-2 max-w-2xl ${ob.body} ob-text-muted`}>
          متابعة لحظية لدفتر الأوامر، السيولة، جدران الأوامر، الصفقات الكبيرة، وحجم التداول المنفذ.
        </p>
      </header>

      <div className="sr-only" role="status" aria-live="polite">
        {coverageLabel}
      </div>

      {data?.symbolLoadError ? (
        <p className={`mb-4 ${ob.alertError}`} role="alert">
          {data.symbolLoadError}
        </p>
      ) : null}

      {symbolNotice ? (
        <p className={`mb-4 ${ob.alertWarning}`} role="status">
          {symbolNotice}
        </p>
      ) : null}

      {symbolRateLimitMessage ? (
        <p className={`mb-4 ${ob.alertError}`} role="alert">
          {symbolRateLimitMessage}
        </p>
      ) : null}

      {symbolSwitching ? (
        <p className={`mb-4 ${ob.alertInfo}`} role="status" aria-live="polite">
          جاري تحميل {formatMarketSymbol(prefs.symbol)}...
        </p>
      ) : null}

      {/* Row 1 — price hero + quick stats */}
      <section className="mb-5 grid items-stretch gap-3 lg:grid-cols-12 lg:gap-4">
        <div className={`flex min-h-[7.75rem] flex-col justify-between p-4 sm:p-5 lg:col-span-5 ${ob.surface}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={ob.label}>الرمز</p>
              <h2 className={`truncate text-xl font-bold ${ob.textStrong}`}>{displaySymbol}</h2>
              <p className={`mt-0.5 text-xs ${ob.textSubtle}`}>
                {EXCHANGE_LABELS[prefs.mode] || prefs.mode}
              </p>
            </div>
            <ConnectionStatusBadge
              connectedCount={connectedCount}
              totalExchanges={totalExchanges}
              probing={probing}
            />
          </div>
          <div className="mt-3">
            <p className={ob.label}>آخر سعر</p>
            <NumericValue className={`text-2xl font-bold sm:text-3xl ${ob.textStrong}`}>
              {formatPrice(data?.lastPrice)}
            </NumericValue>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-3 lg:col-span-7 lg:grid-cols-4">
          <StatTile label="السبريد" sublabel="لحظي" value={formatPrice(data?.spread, 4)} tone="neutral" icon="↔" />
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
      <section className={`mb-5 grid gap-4 p-4 sm:p-5 ${ob.surface}`}>
        <div className="grid gap-4 xl:grid-cols-2">
          <SymbolSearchCombobox
            label="العملة"
            ariaLabel="اختيار العملة"
            value={prefs.symbol}
            loading={symbolSwitching}
            onChange={handleSymbolChange}
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
          <OrderBookListbox
            label="نطاق السيولة"
            ariaLabel="نطاق السيولة"
            value={String(prefs.liquidityRange ?? DEFAULT_LIQUIDITY_RANGE_PERCENT)}
            onChange={(value) => setPrefs({ liquidityRange: Number(value) })}
            options={LIQUIDITY_RANGE_OPTIONS.map((entry) => ({ value: String(entry), label: `${entry}%` }))}
            optionValueDir="ltr"
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

        <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 border-[var(--ob-border)]">
          <OrderBookListbox
            label="دقة السعر"
            ariaLabel="دقة السعر"
            value={String(prefs.precision ?? getDefaultPrecision(prefs.symbol))}
            onChange={(value) => setPrefs({ precision: Number(value) })}
            options={precisionOptions.map((entry) => ({ value: String(entry), label: String(entry) }))}
            optionValueDir="ltr"
          />
          <OrderBookListbox
            label="عدد المستويات"
            ariaLabel="عدد المستويات"
            value={String(prefs.levels)}
            onChange={(value) => setPrefs({ levels: Number(value) })}
            options={DEPTH_LEVEL_OPTIONS.map((entry) => ({ value: String(entry), label: String(entry) }))}
            optionValueDir="ltr"
          />
        </div>
      </section>

      <div className="space-y-4">
      {/* Row 1 — order book (right) + dominance / executed flow (left) */}
      <section className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
        <div className="flex min-h-0 min-w-0 flex-col lg:col-span-8">
          <OrderBookPanel data={data} mobileSide={prefs.mobileSide} symbol={prefs.symbol} />
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:col-span-4 lg:gap-4">
          <Panel
            compact
            className="min-w-0"
            title="سيطرة الشراء والبيع"
            description={
              needsDominanceHistory
                ? "الصفقات المنفذة من السجل التاريخي ضمن الإطار المختار."
                : "الصفقات المنفذة فعلياً ضمن الإطار المختار."
            }
          >
            <div className="space-y-2">
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
                loading={
                  needsDominanceHistory &&
                  (historyLoading || (!historicalDominanceFlow && !historyError))
                }
                error={needsDominanceHistory && historyError}
                partial={historicalDominanceFlow?.partialData}
                coveragePercent={historicalDominanceFlow?.coveragePercent}
                collecting={historyCollecting && needsDominanceHistory}
              />
              {dominanceFlow ? (
                <FlowSplitBar
                  buyPercent={dominanceFlow.buyPercent}
                  sellPercent={dominanceFlow.sellPercent}
                />
              ) : (
                <div className="h-8 rounded-lg ob-surface-muted" aria-hidden="true" />
              )}
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
              <p className={`flex items-center justify-center rounded-lg px-2.5 py-2 text-center text-xs font-medium sm:col-span-2 ob-surface-muted ${ob.textStrong}`}>
                {dominanceFlow?.dominanceLabel || dominanceFlow?.dominanceClassification || "متوازن"}
              </p>
            </div>
          </Panel>

          <Panel
            compact
            className="min-w-0 transition-opacity duration-200"
            title="حجم الشراء/البيع المنفذ"
            description={
              needsFlowHistory
                ? "الحجم المنفذ من السجل التاريخي ضمن الإطار المختار."
                : "الصفقات المنفذة فعلياً، وليس السيولة الموضوعة في دفتر الأوامر."
            }
          >
            <div className="space-y-2">
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
                loading={needsFlowHistory && (historyLoading || (!historicalExecutedFlow && !historyError))}
                error={needsFlowHistory && historyError}
                partial={historicalExecutedFlow?.partialData}
                coveragePercent={historicalExecutedFlow?.coveragePercent}
                collecting={historyCollecting && needsFlowHistory}
                empty={
                  needsFlowHistory &&
                  !historyLoading &&
                  !historyError &&
                  historicalExecutedFlow &&
                  !historicalExecutedFlow.bucketCount
                }
                emptyMessage="لا توجد بيانات كافية ضمن هذا الإطار حتى الآن."
                errorMessage="تعذّر تحميل بيانات التدفق التاريخية."
              />
              {executedFlow ? (
                <FlowSplitBar
                  buyPercent={executedFlow.buyPercent}
                  sellPercent={executedFlow.sellPercent}
                />
              ) : (
                <div className="h-8 rounded-lg ob-surface-muted" aria-hidden="true" />
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 transition-opacity duration-200">
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
              <p className={`flex min-h-[2.75rem] items-center justify-center rounded-lg px-2.5 py-2 text-center text-xs font-medium sm:col-span-2 ob-surface-muted ${ob.textStrong}`}>
                {executedFlow?.dominanceLabel || executedFlow?.dominanceClassification || "متوازن"}
              </p>
            </div>
            {executedFlow?.window ? (
              <p className={`mt-2 text-xs ${ob.textMuted}`}>
                الإطار الحالي:{" "}
                <NumericValue className={`font-medium ${ob.textNormal}`}>
                  {executedFlow.window}
                </NumericValue>
                {Number.isFinite(executedFlow.tradeCount) ? (
                  <>
                    {" "}
                    · عينات:{" "}
                    <NumericValue className="font-medium">{executedFlow.tradeCount}</NumericValue>
                  </>
                ) : null}
                {Number.isFinite(executedFlow.bucketCount) ? (
                  <>
                    {" "}
                    · buckets:{" "}
                    <NumericValue className="font-medium">{executedFlow.bucketCount}</NumericValue>
                  </>
                ) : null}
              </p>
            ) : executedFlowLoading ? (
              <p className={`mt-2 text-xs ${ob.textMuted}`}>جاري تحديث الإطار...</p>
            ) : null}
          </Panel>
        </div>
      </section>

      {/* Row 2 — live / summary liquidity walls */}
      <section className="grid gap-4 lg:grid-cols-12">
        <Panel
          compact
          className="min-w-0 lg:col-span-12"
          title="جدران السيولة"
          description={
            isSidebarWallsLive
              ? "أكبر مستويات السيولة الظاهرة حاليًا في دفتر الأوامر."
              : "أقوى مستويات السيولة التي ظهرت أو استمرت خلال الفترة المحددة."
          }
        >
          <div className="mb-3">
            <SegmentedControl
              compact
              ariaLabel="إطار جدران السيولة"
              label="الإطار"
              value={liquidityWallsWindow}
              onChange={setLiquidityWallsWindow}
              scrollable
              options={LIQUIDITY_WALLS_SUMMARY_WINDOW_OPTIONS}
            />
          </div>
          {!isSidebarWallsLive ? (
            <LiquidityWallsState
              loading={sidebarWallsLoading}
              error={sidebarWallsError}
              partial={sidebarWallsHistory?.partialData}
              coveragePercent={sidebarWallsHistory?.coveragePercent}
              collecting={sidebarWallsHistory?.collecting}
            />
          ) : null}
          {isSidebarWallsLive ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <LiveWallCard title="أكبر جدار شراء" wall={sidebarWallsBid} tone="buy" />
              <LiveWallCard title="أكبر جدار بيع" wall={sidebarWallsAsk} tone="sell" />
            </div>
          ) : sidebarWallsLoading || sidebarWallsError ? null : sidebarWallsEmpty ? (
            <EmptyState message="لا توجد جدران كافية ضمن هذه الفترة حتى الآن." />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <HistoricalWallCard title="أكبر جدار شراء" wall={sidebarWallsBid} tone="buy" />
              <HistoricalWallCard title="أكبر جدار بيع" wall={sidebarWallsAsk} tone="sell" />
            </div>
          )}
        </Panel>
      </section>

      {/* Row 3 — depth chart (right) + large trades (left) */}
      <section className="relative isolate z-0 grid items-stretch gap-4 lg:grid-cols-12">
        <Panel
          className="flex h-full min-h-0 flex-col overflow-x-hidden lg:col-span-7"
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
          <div className="flex min-h-0 flex-1 flex-col">
            <LiquidityDepthChart
              fillContainer
              mode={isLiveDepth ? "live" : "historical"}
              points={isLiveDepth ? data?.depthMap || [] : depthHistory?.aggregatedDepthPoints || []}
              midPrice={data?.midPrice}
              loading={!isLiveDepth && depthHistoryLoading}
              error={!isLiveDepth && depthHistoryError}
              partial={depthHistory?.partialData}
              coveragePercent={depthHistory?.coveragePercent}
              collecting={depthHistory?.collecting}
            />
          </div>
        </Panel>

        <Panel
          className="relative z-0 flex h-full min-h-0 min-w-0 flex-col lg:col-span-5"
          title={largeTradesTitle}
          description="صفقات منفذة تجاوزت الحد المحدد ضمن النافذة الزمنية."
        >
          <div className="shrink-0 space-y-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-start lg:gap-x-8 lg:gap-y-3">
              <SegmentedControl
                compact
                className="min-w-0 lg:min-w-[18rem]"
                ariaLabel="حد الصفقة الكبيرة"
                label="الحد"
                value={String(largeTradeThreshold)}
                onChange={(value) => setPrefs({ largeTradeThreshold: Number(value) })}
                mobileScrollable
                options={LARGE_TRADE_THRESHOLDS.map((value) => ({
                  value: String(value),
                  label: formatThresholdLabel(value),
                }))}
              />
              <SegmentedControl
                compact
                className="min-w-0 lg:min-w-[20rem]"
                ariaLabel="نافذة الصفقات الكبيرة"
                label="الإطار"
                value={largeTradeWindow}
                onChange={(value) => setPrefs({ largeTradeWindow: value })}
                mobileScrollable
                options={LARGE_TRADE_WINDOW_OPTIONS.map((value) => ({ value, label: value }))}
              />
            </div>
            <HistoryState
              loading={needsLargeTradeHistory && historyLoading}
              error={needsLargeTradeHistory && historyError}
              partial={largeTradeHistory?.partialData}
              coveragePercent={largeTradeHistory?.coveragePercent}
              collecting={historyCollecting && needsLargeTradeHistory}
            />
          </div>
          <div className="mt-3 min-h-0 flex-1 min-w-0">
          {displayedLargeTrades.length ? (
            <div className="max-h-[26rem] overflow-y-auto overflow-x-auto overscroll-contain rounded-xl border [scrollbar-width:thin] border-[var(--ob-border)]">
              <table className="w-full min-w-[42rem] table-auto text-sm tabular-nums">
                <thead className={`${ob.tableHeader} text-xs leading-normal`}>
                  <tr>
                    <th className="whitespace-nowrap px-2 py-2.5 text-right sm:px-3">الوقت</th>
                    <th className="whitespace-nowrap px-2 py-2.5 text-right sm:px-3">المنصة</th>
                    <th className="whitespace-nowrap px-2 py-2.5 text-right sm:px-3">الاتجاه</th>
                    <th className="whitespace-nowrap px-2 py-2.5 text-right sm:px-3">السعر</th>
                    <th className="whitespace-nowrap px-2 py-2.5 text-right sm:px-3">الكمية</th>
                    <th className="whitespace-nowrap px-2 py-2.5 text-right sm:px-3">القيمة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ob-border)]">
                  {displayedLargeTrades.map((trade) => (
                    <tr
                      key={`${trade.exchange}-${trade.ts}-${trade.price}-${trade.quantity}`}
                      className={`align-middle ${ob.rowHover}`}
                    >
                      <td className="whitespace-nowrap px-2 py-2.5 align-middle sm:px-3">
                        <NumericValue className="text-xs leading-normal">{formatTime(trade.ts)}</NumericValue>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 align-middle text-xs leading-normal sm:px-3">
                        {EXCHANGE_LABELS[trade.exchange] || trade.exchange}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 align-middle sm:px-3">
                        <SideBadge side={trade.side} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 align-middle sm:px-3">
                        <NumericValue className="text-xs leading-normal">{formatPrice(trade.price)}</NumericValue>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 align-middle sm:px-3">
                        <NumericValue className="text-xs leading-normal">{formatQuantity(trade.quantity)}</NumericValue>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2.5 align-middle sm:px-3">
                        <NumericValue className={`font-semibold leading-normal ${ob.textStrong}`}>
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
          </div>
        </Panel>
      </section>

      {/* Full-width sections */}
      <section className="space-y-4">
        <HistoricalLiquidityWallsPanel
          wallWindow={liquidityWallWindow}
          onWallWindowChange={setLiquidityWallWindow}
          loading={liquidityWallsInitialLoading}
          isRefreshing={liquidityWallsRefreshing}
          isPendingWindow={liquidityWallsPendingWindow}
          error={liquidityWallsError}
          refreshError={liquidityWallsRefreshError}
          history={liquidityWallsHistory}
        />

        <LiquidationsPanel
          data={liquidationsData}
          initialLoading={liquidationsInitialLoading}
          isRefreshing={liquidationsRefreshing}
          error={liquidationsError}
        />

        <FearGreedCard variant="orderBook" />
      </section>

      {/* Last — data sources */}
      <section>
        <details open className={`group ${ob.surface}`}>
          <summary className={`cursor-pointer list-none p-4 sm:p-5 [&::-webkit-details-marker]:hidden ${ob.focusRing}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className={ob.subheading}>مصادر البيانات</h2>
                <p className={`mt-0.5 text-sm ${ob.textMuted}`}>
                  حالة اتصال منصات دفتر الأوامر والتنفيذ.
                </p>
              </div>
              <span className={`text-xs ${ob.textSubtle} group-open:rotate-180 transition-transform motion-reduce:transition-none`} aria-hidden="true">▾</span>
            </div>
          </summary>
          <div className={`${ob.divider} px-4 pb-4 pt-3 sm:px-5 sm:pb-5`}>
            <div className="grid gap-2 sm:grid-cols-3">
              {(data?.exchangeStatuses || []).map((item) => {
                const connected = item.status === "connected";
                const label = item.probeLabel || (connected ? "متصل" : "غير متصل");
                return (
                  <div
                    key={item.exchange}
                    className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-sm ${ob.surfaceMuted}`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          connected
                            ? "ob-status-dot-connected h-2 w-2 rounded-full"
                            : item.status === "probing"
                              ? "ob-status-dot-probing h-2 w-2 rounded-full"
                              : ob.statusDotWarning
                        }
                      />
                      <span className={`font-medium ${ob.textStrong}`}>
                        {EXCHANGE_LABELS[item.exchange] || item.exchange}
                      </span>
                    </div>
                    <span
                      className={
                        connected
                          ? `text-xs ${ob.positive}`
                          : item.status === "probing"
                            ? `text-xs ${ob.neutral}`
                            : `text-xs ${ob.textMuted}`
                      }
                    >
                      {label}
                    </span>
                  </div>
                );
              })}
            </div>
            {data?.disclaimer ? (
              <p className={`mt-2 text-xs leading-5 ${ob.textMuted}`}>{data.disclaimer}</p>
            ) : null}
          </div>
        </details>
      </section>
      </div>
    </div>
  );
}
