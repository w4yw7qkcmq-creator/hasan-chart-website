"use client";

import { useMemo } from "react";
import { EXCHANGE_LABELS } from "../../../lib/market-data/symbols";
import { formatMinutesAgoAr, formatPrice, formatUsd } from "./formatters";
import { DepthHistoryState, EmptyState, NumericValue } from "./order-book-ui";

function buildTooltip(point, mode) {
  const sideLabel = point.side === "bid" ? "شراء" : "بيع";
  const lines = [
    `${sideLabel} — ${formatPrice(point.price)}`,
    `القيمة: ${formatUsd(point.notional, { compact: true })}`,
  ];

  if (mode === "historical") {
    if (Number.isFinite(point.persistenceScore)) {
      lines.push(`الثبات: ${Math.round(point.persistenceScore)}`);
    }
    if (point.exchangeCount > 1) {
      lines.push(`المنصات: ${point.exchangeCount}`);
    } else if (point.exchanges?.length === 1) {
      lines.push(`المنصة: ${EXCHANGE_LABELS[point.exchanges[0]] || point.exchanges[0]}`);
    }
    if (point.lastSeen) {
      lines.push(`آخر ظهور: ${formatMinutesAgoAr(point.lastSeen)}`);
    }
  }

  return lines.join("\n");
}

export default function LiquidityDepthChart({
  mode = "live",
  points = [],
  midPrice,
  loading = false,
  error = false,
  partial = false,
  coveragePercent,
  collecting = false,
}) {
  const { maxNotional, chartPoints } = useMemo(() => {
    const max = Math.max(...points.map((p) => p.notional || 0), 1);
    return {
      maxNotional: max,
      chartPoints: points,
    };
  }, [points]);

  if (mode === "historical") {
    if (loading) {
      return (
        <DepthHistoryState
          loading
          error={false}
          partial={false}
          coveragePercent={coveragePercent}
          collecting={false}
        />
      );
    }

    if (error) {
      return (
        <DepthHistoryState
          loading={false}
          error
          partial={false}
          coveragePercent={coveragePercent}
          collecting={false}
        />
      );
    }

    if (!chartPoints.length || !midPrice) {
      if (collecting && (!Number.isFinite(coveragePercent) || coveragePercent <= 0)) {
        return (
          <DepthHistoryState
            loading={false}
            error={false}
            partial={false}
            coveragePercent={coveragePercent}
            collecting
          />
        );
      }
      return <EmptyState message="لا توجد جدران سيولة كافية ضمن هذه الفترة حتى الآن." />;
    }
  } else if (!chartPoints.length || !midPrice) {
    return (
      <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400 sm:h-52">
        بانتظار بيانات السيولة...
      </div>
    );
  }

  const chartLabel =
    mode === "historical" ? "خريطة جدران السيولة التاريخية" : "خريطة عمق السيولة";

  return (
    <div className="min-w-0">
      {mode === "historical" ? (
        <DepthHistoryState
          loading={false}
          error={false}
          partial={partial}
          coveragePercent={coveragePercent}
          collecting={collecting && partial}
        />
      ) : null}
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
          {mode === "historical" ? "Mid Price: " : "السعر الحالي: "}
          <NumericValue className="font-semibold text-slate-800 dark:text-slate-100">
            {formatPrice(midPrice)}
          </NumericValue>
        </span>
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-slate-950/40 sm:p-4">
        <svg viewBox="0 0 600 160" className="h-40 w-full sm:h-48" role="img" aria-label={chartLabel}>
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
          <line
            x1="300"
            y1="8"
            x2="300"
            y2="152"
            stroke="currentColor"
            className="text-slate-400 dark:text-slate-500"
            strokeDasharray="3 3"
          />
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
                <title>{buildTooltip(point, mode)}</title>
              </rect>
            );
          })}
        </svg>
      </div>

    </div>
  );
}
