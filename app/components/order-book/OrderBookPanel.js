"use client";

import { useMemo } from "react";
import { EXCHANGE_LABELS, SYMBOL_LABELS } from "../../../lib/market-data/symbols";
import { formatPrice, formatQuantity, formatSpreadPercent, formatUsd } from "./formatters";
import { NumericValue } from "./order-book-ui";

function DepthRow({ level, side }) {
  const isAsk = side === "ask";
  const barColor = isAsk ? "bg-rose-500/15 dark:bg-rose-500/10" : "bg-emerald-500/15 dark:bg-emerald-500/10";
  const textColor = isAsk ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="group relative grid grid-cols-3 gap-2 px-3 py-1.5 text-sm">
      <div
        className={`absolute inset-y-0 ${isAsk ? "right-0" : "left-0"} ${barColor} transition group-hover:opacity-90`}
        style={{ width: `${Math.min(100, level.depthPercent || 0)}%` }}
        aria-hidden="true"
      />
      <span dir="ltr" className={`relative z-[1] text-left font-medium tabular-nums ${textColor}`}>
        {formatPrice(level.price)}
      </span>
      <span dir="ltr" className="relative z-[1] text-center tabular-nums text-slate-700 dark:text-slate-200">
        {formatQuantity(level.quantity)}
      </span>
      <span dir="ltr" className="relative z-[1] text-right tabular-nums text-slate-600 dark:text-slate-300">
        {formatUsd(level.notional, { compact: true })}
      </span>
    </div>
  );
}

function ExchangePills({ statuses = [] }) {
  const connected = statuses.filter((item) => item.status === "connected").length;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
        {connected}/{statuses.length || 3} منصات
      </span>
      {statuses.map((item) => (
        <span
          key={item.exchange}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
            item.status === "connected"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-amber-700 dark:text-amber-300"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              item.status === "connected" ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {EXCHANGE_LABELS[item.exchange] || item.exchange}
        </span>
      ))}
    </div>
  );
}

export default function OrderBookPanel({ data, mobileSide = "all", symbol }) {
  const asks = useMemo(() => [...(data?.asks || [])].reverse(), [data?.asks]);
  const bids = data?.bids || [];
  const showAsks = mobileSide === "all" || mobileSide === "asks";
  const showBids = mobileSide === "all" || mobileSide === "bids";
  const symbolLabel = SYMBOL_LABELS[symbol] || symbol || "—";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/80">
      <div className="border-b border-slate-200 px-4 py-4 dark:border-white/10 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">دفتر الأوامر اللحظي</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{symbolLabel}</h2>
          </div>
          <ExchangePills statuses={data?.exchangeStatuses || []} />
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">آخر سعر</p>
            <NumericValue className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
              {formatPrice(data?.lastPrice)}
            </NumericValue>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            <p>
              Mid:{" "}
              <NumericValue className="font-medium text-slate-700 dark:text-slate-200">
                {formatPrice(data?.midPrice)}
              </NumericValue>
            </p>
            <p className="mt-1">
              Spread:{" "}
              <NumericValue>{formatPrice(data?.spread, 4)}</NumericValue> (
              {formatSpreadPercent(data?.spreadPercent)})
            </p>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 grid grid-cols-3 gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:border-white/10 dark:bg-slate-950/80 dark:text-slate-400">
        <span className="text-left">السعر</span>
        <span className="text-center">الكمية</span>
        <span className="text-right">القيمة</span>
      </div>

      {showAsks ? (
        <div className="max-h-[280px] overflow-y-auto">
          {asks.map((level) => (
            <DepthRow key={`ask-${level.price}`} level={level} side="ask" />
          ))}
        </div>
      ) : null}

      <div className="border-y border-slate-200 bg-slate-100/70 px-4 py-2 text-center text-xs font-medium text-slate-600 dark:border-white/10 dark:bg-slate-950/50 dark:text-slate-300">
        خط السعر المتوسط —{" "}
        <NumericValue className="font-semibold text-slate-900 dark:text-white">
          {formatPrice(data?.midPrice)}
        </NumericValue>
      </div>

      {showBids ? (
        <div className="max-h-[280px] overflow-y-auto">
          {bids.map((level) => (
            <DepthRow key={`bid-${level.price}`} level={level} side="bid" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LiveWallCard({ title, wall, tone }) {
  const isBuy = tone === "buy";
  const border = isBuy
    ? "border-emerald-200/80 dark:border-emerald-900/40"
    : "border-rose-200/80 dark:border-rose-900/40";
  const bg = isBuy
    ? "bg-emerald-50/50 dark:bg-emerald-950/20"
    : "bg-rose-50/50 dark:bg-rose-950/20";
  const bar = isBuy ? "bg-emerald-500" : "bg-rose-500";

  if (!wall) {
    return (
      <div className={`rounded-xl border border-dashed p-4 text-sm text-slate-500 ${border} ${bg}`}>
        {title}: لا يوجد جدار بارز حالياً
      </div>
    );
  }

  const strength = Math.min(100, Math.max(8, (wall.notional / 500_000) * 100));

  return (
    <div className={`rounded-xl border p-4 ${border} ${bg}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            isBuy ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"
          }`}
        >
          {isBuy ? "شراء" : "بيع"}
        </span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/70 dark:bg-black/20">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${strength}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <p className="text-xs text-slate-500">السعر</p>
          <NumericValue className="font-semibold">{formatPrice(wall.price)}</NumericValue>
        </div>
        <div>
          <p className="text-xs text-slate-500">الكمية</p>
          <NumericValue className="font-semibold">{formatQuantity(wall.quantity)}</NumericValue>
        </div>
        <div>
          <p className="text-xs text-slate-500">القيمة</p>
          <NumericValue className="font-semibold">{formatUsd(wall.notional, { compact: true })}</NumericValue>
        </div>
        <div>
          <p className="text-xs text-slate-500">البعد عن السعر</p>
          <NumericValue>{formatSpreadPercent(wall.distancePercent)}</NumericValue>
        </div>
      </div>
    </div>
  );
}
