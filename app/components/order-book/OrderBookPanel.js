"use client";

import { useMemo } from "react";
import { EXCHANGE_LABELS, SYMBOL_LABELS } from "../../../lib/market-data/symbols";
import {
  formatDurationAr,
  formatMinutesAgoAr,
  formatPrice,
  formatQuantity,
  formatSpreadPercent,
  formatUsd,
} from "./formatters";
import { CoverageBadge, NumericValue } from "./order-book-ui";

import { computeDepthBarWidthPercent } from "./depth-bar-utils";

export const ORDER_BOOK_VISIBLE_ROWS = 12;
export const ORDER_BOOK_ROW_HEIGHT = "h-[36rem]";
export const ORDER_BOOK_ROW_HEIGHT_LG = "lg:h-[36rem]";

function DepthGlowBar({ side, widthPercent }) {
  const isAsk = side === "ask";
  const width = Math.min(100, Math.max(0, widthPercent || 0));
  if (width <= 0) return null;

  const lightGradient = isAsk
    ? "linear-gradient(to left, rgba(244,63,94,0.22) 0%, rgba(244,63,94,0.14) 42%, rgba(244,63,94,0) 100%)"
    : "linear-gradient(to left, rgba(16,185,129,0.22) 0%, rgba(16,185,129,0.14) 42%, rgba(16,185,129,0) 100%)";
  const darkGradient = isAsk
    ? "linear-gradient(to left, rgba(244,63,94,0.28) 0%, rgba(244,63,94,0.16) 42%, rgba(244,63,94,0) 100%)"
    : "linear-gradient(to left, rgba(16,185,129,0.28) 0%, rgba(16,185,129,0.16) 42%, rgba(16,185,129,0) 100%)";

  return (
    <>
      <div
        className="pointer-events-none absolute inset-y-0 right-0 dark:hidden"
        style={{ width: `${width}%`, background: lightGradient }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 hidden dark:block"
        style={{ width: `${width}%`, background: darkGradient }}
        aria-hidden="true"
      />
    </>
  );
}

function DepthRow({ level, side, widthPercent }) {
  const isAsk = side === "ask";
  const textColor = isAsk
    ? "text-rose-600 dark:text-rose-400"
    : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className="group relative grid grid-cols-3 gap-2 px-3 py-1 text-sm">
      <DepthGlowBar side={side} widthPercent={widthPercent} />
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
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
        {connected}/{statuses.length || 3}
      </span>
      {statuses.map((item) => (
        <span
          key={item.exchange}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${
            item.status === "connected"
              ? "border-emerald-200/60 text-emerald-700 dark:border-emerald-900/40 dark:text-emerald-300"
              : "border-amber-200/60 text-amber-700 dark:border-amber-900/40 dark:text-amber-300"
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

  const maxAskNotional = useMemo(
    () => Math.max(...asks.map((level) => Number(level.notional) || 0), 0),
    [asks],
  );
  const maxBidNotional = useMemo(
    () => Math.max(...bids.map((level) => Number(level.notional) || 0), 0),
    [bids],
  );

  const visibleAsks = asks.slice(0, ORDER_BOOK_VISIBLE_ROWS);
  const visibleBids = bids.slice(0, ORDER_BOOK_VISIBLE_ROWS);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900/80">
      <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">دفتر الأوامر اللحظي</p>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">{symbolLabel}</h2>
          </div>
          <ExchangePills statuses={data?.exchangeStatuses || []} />
        </div>
        <div className="mt-2 flex flex-wrap items-end gap-x-5 gap-y-1">
          <div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">آخر سعر</p>
            <NumericValue className="text-2xl font-bold text-slate-900 dark:text-white sm:text-[1.65rem]">
              {formatPrice(data?.lastPrice)}
            </NumericValue>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
            <p>
              المتوسط:{" "}
              <NumericValue className="font-medium text-slate-700 dark:text-slate-200">
                {formatPrice(data?.midPrice)}
              </NumericValue>
            </p>
            <p>
              السبريد:{" "}
              <NumericValue className="font-medium text-slate-700 dark:text-slate-200">
                {formatPrice(data?.spread, 4)}
              </NumericValue>{" "}
              ({formatSpreadPercent(data?.spreadPercent)})
            </p>
          </div>
        </div>
      </div>

      <div className="sticky top-0 z-10 grid grid-cols-3 gap-2 border-b border-slate-200 bg-slate-50/95 px-3 py-1.5 text-[11px] font-semibold text-slate-500 backdrop-blur dark:border-white/10 dark:bg-slate-950/90 dark:text-slate-400">
        <span className="text-left">السعر</span>
        <span className="text-center">الكمية</span>
        <span className="text-right">القيمة</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {showAsks ? (
        <div>
          {visibleAsks.map((level) => (
            <DepthRow
              key={`ask-${level.price}`}
              level={level}
              side="ask"
              widthPercent={computeDepthBarWidthPercent(level.notional, maxAskNotional)}
            />
          ))}
        </div>
      ) : null}

      <div className="sticky z-[2] border-y border-slate-200 bg-slate-100/60 px-3 py-1.5 text-center text-[11px] font-medium text-slate-600 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300">
        خط السعر —{" "}
        <NumericValue className="font-semibold text-slate-900 dark:text-white">
          {formatPrice(data?.midPrice)}
        </NumericValue>
      </div>

      {showBids ? (
        <div>
          {visibleBids.map((level) => (
            <DepthRow
              key={`bid-${level.price}`}
              level={level}
              side="bid"
              widthPercent={computeDepthBarWidthPercent(level.notional, maxBidNotional)}
            />
          ))}
        </div>
      ) : null}
      </div>
    </div>
  );
}

const WALL_TOOLTIP = "أكبر مستوى سيولة ظاهر حاليًا ضمن دفتر الأوامر.";

export function LiveWallCard({ title, wall, tone, compact = false }) {
  const pad = compact ? "p-2" : "p-3";
  const priceSize = compact ? "text-base" : "text-lg";
  const isBuy = tone === "buy";
  const border = isBuy
    ? "border-emerald-200/80 dark:border-emerald-900/40"
    : "border-rose-200/80 dark:border-rose-900/40";
  const bg = isBuy
    ? "bg-emerald-50/40 dark:bg-emerald-950/15"
    : "bg-rose-50/40 dark:bg-rose-950/15";
  const bar = isBuy ? "bg-emerald-500" : "bg-rose-500";
  const accent = isBuy ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

  if (!wall) {
    return (
      <div
        className={`flex flex-col justify-center rounded-xl border border-dashed ${pad} text-sm text-slate-500 ${border} ${bg}`}
        title={WALL_TOOLTIP}
      >
        <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
        <p className="mt-1 text-xs">لا يوجد جدار بارز حالياً</p>
      </div>
    );
  }

  const strength = Math.min(100, Math.max(12, (wall.notional / 500_000) * 100));

  return (
    <div className={`flex flex-col rounded-xl border ${pad} ${border} ${bg}`} title={WALL_TOOLTIP}>
      <div className={`${compact ? "mb-1" : "mb-2"} flex items-center justify-between gap-2`}>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${accent}`}>
          {isBuy ? "شراء" : "بيع"}
        </span>
      </div>
      <div className={`${compact ? "mb-1" : "mb-2"} flex items-end justify-between gap-3`}>
        <div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">السعر</p>
          <NumericValue className={`${priceSize} font-bold ${accent}`}>{formatPrice(wall.price)}</NumericValue>
        </div>
        <div className="text-left">
          <p className="text-[10px] text-slate-500 dark:text-slate-400">القيمة</p>
          <NumericValue className={`${priceSize} font-bold text-slate-900 dark:text-white`}>
            {formatUsd(wall.notional, { compact: true })}
          </NumericValue>
        </div>
      </div>
      <div className={`${compact ? "mb-1" : "mb-2"} h-1 overflow-hidden rounded-full bg-white/60 dark:bg-black/20`}>
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${strength}%` }} />
      </div>
      <div className="mt-auto flex justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span>
          الكمية: <NumericValue className="text-slate-700 dark:text-slate-200">{formatQuantity(wall.quantity)}</NumericValue>
        </span>
        <span>
          البعد: <NumericValue>{formatSpreadPercent(wall.distancePercent)}</NumericValue>
        </span>
      </div>
    </div>
  );
}

export function HistoricalWallCard({ title, wall, tone, compact = false }) {
  const pad = compact ? "p-2" : "p-3";
  const priceSize = compact ? "text-base" : "text-lg";
  const isBuy = tone === "buy";
  const border = isBuy
    ? "border-emerald-200/80 dark:border-emerald-900/40"
    : "border-rose-200/80 dark:border-rose-900/40";
  const bg = isBuy
    ? "bg-emerald-50/40 dark:bg-emerald-950/15"
    : "bg-rose-50/40 dark:bg-rose-950/15";
  const accent = isBuy ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";

  if (!wall) {
    return (
      <div className={`flex flex-col justify-center rounded-xl border border-dashed ${pad} text-sm ${border} ${bg}`}>
        <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
        <p className="mt-1 text-xs text-slate-500">لا توجد جدران كافية ضمن هذه الفترة حتى الآن.</p>
      </div>
    );
  }

  const notional = wall.strongestNotional ?? wall.notional;

  return (
    <div className={`flex flex-col rounded-xl border ${pad} ${border} ${bg}`}>
      <div className={`${compact ? "mb-1" : "mb-2"} flex items-center justify-between gap-2`}>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${accent}`}>
          {isBuy ? "شراء" : "بيع"}
        </span>
      </div>
      <div className={`${compact ? "mb-1" : "mb-2"} flex items-end justify-between gap-3`}>
        <div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400">السعر</p>
          <NumericValue className={`${priceSize} font-bold ${accent}`}>{formatPrice(wall.price)}</NumericValue>
        </div>
        <div className="text-left">
          <p className="text-[10px] text-slate-500 dark:text-slate-400">القيمة</p>
          <NumericValue className={`${priceSize} font-bold text-slate-900 dark:text-white`}>
            {formatUsd(notional, { compact: true })}
          </NumericValue>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span>
          الثبات:{" "}
          <NumericValue className="font-medium text-slate-700 dark:text-slate-200">
            {Math.round(wall.persistenceScore)}%
          </NumericValue>
        </span>
        <span>مدة: {formatDurationAr(wall.lifetimeSeconds)}</span>
        <span>
          ظهور: <NumericValue>{wall.appearanceCount ?? wall.reappearCount ?? 0}</NumericValue>
        </span>
        <span>{EXCHANGE_LABELS[wall.exchange] || wall.exchange || "—"}</span>
        {wall.lastSeen ? (
          <span className="col-span-2">آخر ظهور: {formatMinutesAgoAr(wall.lastSeen)}</span>
        ) : null}
      </div>
    </div>
  );
}

export function LiquidityWallsState({ loading, error, partial, coveragePercent, collecting }) {
  if (loading) {
    return (
      <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
        جاري تحميل جدران السيولة...
      </p>
    );
  }

  if (error) {
    return (
      <p className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
        تعذّر تحميل جدران السيولة.
      </p>
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
        <CoverageBadge partial coveragePercent={coveragePercent} compact />
      </div>
    );
  }

  return null;
}
