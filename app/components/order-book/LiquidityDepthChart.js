"use client";

import { useMemo } from "react";
import { formatUsd } from "./formatters";

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
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
        بانتظار بيانات السيولة...
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-900/70">
      <svg viewBox="0 0 600 180" className="h-48 w-full" role="img" aria-label="خريطة عمق السيولة">
        <line x1="0" y1="90" x2="600" y2="90" stroke="currentColor" className="text-slate-300 dark:text-slate-600" />
        {chartPoints.map((point) => {
          const x = 300 + ((point.price - midPrice) / midPrice) * 260;
          const height = Math.max(4, (point.notional / maxNotional) * 70);
          const y = point.side === "bid" ? 90 - height : 90;
          const fill = point.side === "bid" ? "#059669" : "#dc2626";
          const opacity = 0.25 + (point.notional / maxNotional) * 0.75;

          return (
            <rect
              key={`${point.side}-${point.price}`}
              x={Math.max(0, Math.min(590, x - 3))}
              y={y}
              width={6}
              height={height}
              fill={fill}
              opacity={opacity}
            >
              <title>{`${formatUsd(point.notional)} @ ${point.price}`}</title>
            </rect>
          );
        })}
      </svg>
    </div>
  );
}
