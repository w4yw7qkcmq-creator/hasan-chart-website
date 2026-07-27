"use client";

import { useMemo } from "react";
import { formatPrice, formatQuantity, formatUsd } from "./formatters";

function DepthRow({ level, side }) {
  const isAsk = side === "ask";
  const barColor = isAsk ? "bg-red-500/15 dark:bg-red-400/10" : "bg-emerald-500/15 dark:bg-teal-400/10";
  const textColor = isAsk ? "text-red-600 dark:text-red-300" : "text-emerald-700 dark:text-teal-300";

  return (
    <div className="relative grid grid-cols-3 gap-2 px-3 py-1.5 text-sm tabular-nums">
      <div
        className={`absolute inset-y-0 ${isAsk ? "right-0" : "left-0"} ${barColor}`}
        style={{ width: `${Math.min(100, level.depthPercent || 0)}%` }}
        aria-hidden="true"
      />
      <span className={`relative z-[1] text-left ${textColor}`}>{formatPrice(level.price)}</span>
      <span className="relative z-[1] text-center text-slate-700 dark:text-slate-200">
        {formatQuantity(level.quantity)}
      </span>
      <span className="relative z-[1] text-right text-slate-600 dark:text-slate-300">
        {formatUsd(level.notional, { compact: true })}
      </span>
    </div>
  );
}

export default function OrderBookPanel({ data, mobileSide = "all" }) {
  const asks = useMemo(() => [...(data?.asks || [])].reverse(), [data?.asks]);
  const bids = data?.bids || [];
  const showAsks = mobileSide === "all" || mobileSide === "asks";
  const showBids = mobileSide === "all" || mobileSide === "bids";

  return (
    <div className="site-price-card overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 dark:border-white/10 dark:bg-slate-900/70">
      <div className="grid grid-cols-3 gap-2 border-b border-slate-200/70 px-3 py-2 text-xs font-medium text-slate-500 dark:border-white/10 dark:text-slate-400">
        <span className="text-left">السعر</span>
        <span className="text-center">الكمية</span>
        <span className="text-right">USDT</span>
      </div>

      {showAsks && (
        <div className="max-h-[280px] overflow-y-auto">
          {asks.map((level) => (
            <DepthRow key={`ask-${level.price}`} level={level} side="ask" />
          ))}
        </div>
      )}

      <div className="border-y border-slate-200/80 bg-slate-50 px-4 py-4 text-center dark:border-white/10 dark:bg-slate-950/60">
        <div className="text-3xl font-semibold tabular-nums text-slate-900 dark:text-white">
          {formatPrice(data?.lastPrice)}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span>Mid: {formatPrice(data?.midPrice)}</span>
          <span>Spread: {formatPrice(data?.spread, 4)}</span>
          <span>{data?.spreadPercent != null ? `${Number(data.spreadPercent).toFixed(4)}%` : "—"}</span>
        </div>
      </div>

      {showBids && (
        <div className="max-h-[280px] overflow-y-auto">
          {bids.map((level) => (
            <DepthRow key={`bid-${level.price}`} level={level} side="bid" />
          ))}
        </div>
      )}
    </div>
  );
}
