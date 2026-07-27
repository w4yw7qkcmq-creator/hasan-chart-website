"use client";

import { useMemo } from "react";
import Breadcrumbs from "../seo/Breadcrumbs";
import { useMarketDepthStream } from "../../hooks/useMarketDepthStream";
import {
  DEFAULT_LARGE_TRADE_THRESHOLD,
  DEFAULT_LIQUIDITY_RANGE_PERCENT,
  DEPTH_LEVEL_OPTIONS,
  FLOW_WINDOW_OPTIONS,
  LARGE_TRADE_THRESHOLDS,
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
import LiquidityDepthChart from "./LiquidityDepthChart";
import OrderBookPanel from "./OrderBookPanel";
import { formatPercent, formatPrice, formatTime, formatUsd, statusLabelAr } from "./formatters";
import { formatExchangeConnectionHint } from "../../../lib/market-data/connection-status";

const breadcrumbs = [
  { label: "الرئيسية", href: "/" },
  { label: "الأسواق", href: "/markets" },
  { label: "دفتر الأوامر والسيولة", href: "/order-book" },
];

export default function OrderBookPageContent() {
  const { data, prefs, setPrefs, connection, hydrated } = useMarketDepthStream();

  const precisionOptions = useMemo(() => {
    const base = getDefaultPrecision(prefs.symbol);
    const set = new Set(PRECISION_OPTIONS);
    set.add(base);
    return [...set].sort((a, b) => a - b);
  }, [prefs.symbol]);

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

      <header className="mt-6 mb-8">
        <p className="site-price-card__eyebrow">Market Depth</p>
        <h1 className="mb-3 text-3xl font-bold text-slate-900 dark:text-white">دفتر الأوامر والسيولة</h1>
        <p className="max-w-3xl text-sm leading-7 text-slate-600 dark:text-slate-300">
          متابعة لحظية لطلبات البيع والشراء، سيولة السوق، جدران الأوامر، الصفقات الكبيرة، وحجم التداول
          المنفذ — بيانات مجمعة من المنصات المدعومة: OKX، Binance، Bybit.
        </p>
      </header>

      <section className="mb-6 grid gap-3 rounded-2xl border border-slate-200/80 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-900/70 lg:grid-cols-4 xl:grid-cols-8">
        <ControlSelect
          label="العملة"
          value={prefs.symbol}
          onChange={(value) =>
            setPrefs({ symbol: value, precision: getDefaultPrecision(value) })
          }
          options={SITE_SYMBOLS.map((symbol) => ({ value: symbol, label: SYMBOL_LABELS[symbol] }))}
        />
        <ControlSelect
          label="المنصة"
          value={prefs.mode}
          onChange={(value) => setPrefs({ mode: value })}
          options={[
            { value: "aggregated", label: EXCHANGE_LABELS.aggregated },
            { value: "okx", label: EXCHANGE_LABELS.okx },
            { value: "binance", label: EXCHANGE_LABELS.binance },
            { value: "bybit", label: EXCHANGE_LABELS.bybit },
          ]}
        />
        <ControlSelect
          label="Precision"
          value={String(prefs.precision ?? getDefaultPrecision(prefs.symbol))}
          onChange={(value) => setPrefs({ precision: Number(value) })}
          options={precisionOptions.map((value) => ({ value: String(value), label: String(value) }))}
        />
        <ControlSelect
          label="المستويات"
          value={String(prefs.levels)}
          onChange={(value) => setPrefs({ levels: Number(value) })}
          options={DEPTH_LEVEL_OPTIONS.map((value) => ({ value: String(value), label: String(value) }))}
        />
        <ControlSelect
          label="نطاق السيولة"
          value={String(prefs.liquidityRange ?? DEFAULT_LIQUIDITY_RANGE_PERCENT)}
          onChange={(value) => setPrefs({ liquidityRange: Number(value) })}
          options={LIQUIDITY_RANGE_OPTIONS.map((value) => ({ value: String(value), label: `${value}%` }))}
        />
        <ControlSelect
          label="إطار الحجم"
          value={prefs.flowWindow}
          onChange={(value) => setPrefs({ flowWindow: value })}
          options={FLOW_WINDOW_OPTIONS.map((value) => ({ value, label: value }))}
        />
        <ControlSelect
          label="صفقة كبيرة"
          value={String(prefs.largeTradeThreshold ?? DEFAULT_LARGE_TRADE_THRESHOLD)}
          onChange={(value) => setPrefs({ largeTradeThreshold: Number(value) })}
          options={LARGE_TRADE_THRESHOLDS.map((value) => ({
            value: String(value),
            label: formatUsd(value, { compact: true }),
          }))}
        />
        <div className="flex flex-col gap-1 lg:col-span-1 xl:col-span-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">عرض الجوال</span>
          <div className="flex rounded-xl border border-slate-200 dark:border-white/10">
            {[
              { value: "all", label: "الكل" },
              { value: "asks", label: "بيع" },
              { value: "bids", label: "شراء" },
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setPrefs({ mobileSide: item.value })}
                className={`flex-1 px-2 py-2 text-xs ${
                  prefs.mobileSide === item.value
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                    : "text-slate-600 dark:text-slate-300"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="آخر سعر" value={formatPrice(data?.lastPrice)} />
        <SummaryCard
          title="حالة الاتصال"
          value={connection.label}
          hint={`${formatExchangeConnectionHint(connection)} · تأخير تقريبي: ${data?.latencyMs ?? "—"}ms`}
        />
        <SummaryCard
          title="مصادر البيانات"
          value={data?.exchanges?.length ? data.exchanges.map((e) => EXCHANGE_LABELS[e] || e).join("، ") : "—"}
          hint={data?.disclaimer}
        />
        <SummaryCard
          title="آخر تحديث"
          value={data?.updatedAt ? formatTime(data.updatedAt) : "—"}
          hint={data?.stale ? "بيانات متأخرة" : "تحديث حي"}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <OrderBookPanel data={data} mobileSide={prefs.mobileSide} />

          <Panel title="خريطة عمق السيولة">
            <LiquidityDepthChart points={data?.depthMap || []} midPrice={data?.midPrice} />
          </Panel>

          <Panel title="الصفقات الكبيرة اللحظية">
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-2 text-right">الوقت</th>
                    <th className="py-2 text-right">المنصة</th>
                    <th className="py-2 text-right">الاتجاه</th>
                    <th className="py-2 text-left tabular-nums">القيمة</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.largeTrades || []).map((trade) => (
                    <tr
                      key={`${trade.exchange}-${trade.ts}-${trade.price}`}
                      className="border-t border-slate-100 dark:border-white/5"
                    >
                      <td className="py-2">{formatTime(trade.ts)}</td>
                      <td className="py-2">{EXCHANGE_LABELS[trade.exchange] || trade.exchange}</td>
                      <td className="py-2">{trade.side === "buy" ? "شراء منفذ" : "بيع منفذ"}</td>
                      <td className="py-2 text-left tabular-nums">{formatUsd(trade.notional, { compact: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data?.largeTrades?.length ? (
                <p className="py-6 text-center text-sm text-slate-500">لا توجد صفقات كبيرة ضمن العتبة الحالية.</p>
              ) : null}
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="سيطرة الشراء والبيع">
            <div className="space-y-3 text-sm">
              <MetricLine label="سيولة الشراء" value={formatUsd(data?.liquidity?.bidNotional, { compact: true })} />
              <MetricLine label="سيولة البيع" value={formatUsd(data?.liquidity?.askNotional, { compact: true })} />
              <MetricLine label="سيطرة المشترين" value={formatPercent(data?.liquidity?.bidPercent)} />
              <MetricLine label="سيطرة البائعين" value={formatPercent(data?.liquidity?.askPercent)} />
              <p className="rounded-xl bg-slate-100 px-3 py-2 text-center font-medium text-slate-800 dark:bg-white/5 dark:text-slate-100">
                {data?.liquidity?.dominance || "متوازن"}
              </p>
              <p className="text-xs leading-6 text-slate-500 dark:text-slate-400">
                وجود أوامر كبيرة لا يضمن تنفيذها، وقد يتم إلغاؤها قبل الوصول إليها.
              </p>
            </div>
          </Panel>

          <Panel title="حجم الشراء/البيع المنفذ">
            <div className="space-y-3 text-sm">
              <MetricLine
                label="شراء منفذ"
                value={formatUsd(data?.executedFlow?.buyNotional, { compact: true })}
              />
              <MetricLine
                label="بيع منفذ"
                value={formatUsd(data?.executedFlow?.sellNotional, { compact: true })}
              />
              <MetricLine
                label="صافي التدفق"
                value={formatUsd(data?.executedFlow?.netNotional, { compact: true })}
              />
              <MetricLine label="نسبة الشراء" value={formatPercent(data?.executedFlow?.buyPercent)} />
              <MetricLine label="نسبة البيع" value={formatPercent(data?.executedFlow?.sellPercent)} />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                هذا القسم يقيس الصفقات المنفذة فعلياً، وليس السيولة الموضوعة في دفتر الأوامر.
              </p>
            </div>
          </Panel>

          <Panel title="جدران السيولة">
            <WallBlock title="أكبر جدار شراء" wall={data?.walls?.largestBid} />
            <WallBlock title="أكبر جدار بيع" wall={data?.walls?.largestAsk} />
          </Panel>

          <Panel title="حالة المنصات">
            <div className="space-y-2">
              {(data?.exchangeStatuses || []).map((item) => (
                <div
                  key={item.exchange}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10"
                >
                  <span>{EXCHANGE_LABELS[item.exchange] || item.exchange}</span>
                  <span className="text-slate-500 dark:text-slate-400">{statusLabelAr(item.status)}</span>
                </div>
              ))}
            </div>
          </Panel>

          <FearGreedCard />
        </div>
      </div>
    </div>
  );
}

function ControlSelect({ label, value, onChange, options }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none dark:border-white/10 dark:bg-slate-950 dark:text-slate-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryCard({ title, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-900/70">
      <p className="text-xs text-slate-500 dark:text-slate-400">{title}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-white">{value || "—"}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white/90 p-5 dark:border-white/10 dark:bg-slate-900/70">
      <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">{title}</h2>
      {children}
    </section>
  );
}

function MetricLine({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-600 dark:text-slate-300">{label}</span>
      <span className="tabular-nums font-medium text-slate-900 dark:text-white">{value}</span>
    </div>
  );
}

function WallBlock({ title, wall }) {
  if (!wall) {
    return (
      <div className="mb-3 rounded-xl border border-dashed border-slate-200 p-3 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
        {title}: لا يوجد جدار بارز حالياً
      </div>
    );
  }

  return (
    <div className="mb-3 rounded-xl border border-slate-200 p-3 text-sm dark:border-white/10">
      <p className="mb-2 font-medium text-slate-800 dark:text-slate-100">{title}</p>
      <div className="space-y-1 tabular-nums text-slate-600 dark:text-slate-300">
        <p>السعر: {formatPrice(wall.price)}</p>
        <p>الكمية: {wall.quantity}</p>
        <p>القيمة: {formatUsd(wall.notional, { compact: true })}</p>
        <p>البعد عن السعر: {formatPercent(wall.distancePercent)}</p>
      </div>
    </div>
  );
}
