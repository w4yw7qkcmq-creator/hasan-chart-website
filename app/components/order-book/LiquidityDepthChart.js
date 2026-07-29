"use client";

import { useMemo } from "react";
import { formatPrice, formatUsd } from "./formatters";
import { NumericValue } from "./order-book-ui";

export default function LiquidityDepthChart({ points = [], midPrice }) {
  const { maxNotional, chartPoints } = useMemo(() => {
    const max = Math.max(...points.map((p) => p.notional || 0), 1);
    return {
      maxNotional: max,
      chartPoints: points,
    };
  }, [points]);

  if (!chartPoints.length || !midPrice) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400 sm:h-52">
        بانتظار بيانات السيولة...
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            شراء
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
            بيع
          </span>
        </div>
        <span className="text-slate-500 dark:text-slate-400">
          السعر الحالي:{" "}
          <NumericValue className="font-semibold text-slate-800 dark:text-slate-100">
            {formatPrice(midPrice)}
          </NumericValue>
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-slate-950/40 sm:p-4">
        <svg viewBox="0 0 600 160" className="h-40 w-full sm:h-48" role="img" aria-label="خريطة عمق السيولة">
          {[30, 60, 120, 150].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="600"
              y2={y}
              stroke="currentColor"
              className="text-slate-200 dark:text-slate-700"
              strokeDasharray="4 4"
            />
          ))}
          <line x1="0" y1="80" x2="600" y2="80" stroke="currentColor" className="text-slate-400 dark:text-slate-500" />
          <line x1="300" y1="8" x2="300" y2="152" stroke="currentColor" className="text-slate-400 dark:text-slate-500" strokeDasharray="3 3" />
          <text x="305" y="18" className="fill-slate-500 text-[10px]">
            Mid
          </text>
          {chartPoints.map((point) => {
            const x = 300 + ((point.price - midPrice) / midPrice) * 260;
            const height = Math.max(4, (point.notional / maxNotional) * 62);
            const y = point.side === "bid" ? 80 - height : 80;
            const fill = point.side === "bid" ? "#10b981" : "#f43f5e";
            const opacity = 0.3 + (point.notional / maxNotional) * 0.7;

            return (
              <rect
                key={`${point.side}-${point.price}`}
                x={Math.max(0, Math.min(590, x - 3))}
                y={y}
                width={6}
                height={height}
                fill={fill}
                opacity={opacity}
                rx={1}
              >
                <title>{`${point.side === "bid" ? "شراء" : "بيع"} — ${formatUsd(point.notional)} @ ${formatPrice(point.price)}`}</title>
              </rect>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
