"use client";

import { useMemo } from "react";
import { EXCHANGE_LABELS } from "../../../lib/market-data/symbols";
import { formatMinutesAgoAr, formatPrice, formatUsd } from "./formatters";
import { ChartPlaceholder, DepthHistoryState, EmptyState, NumericValue } from "./order-book-ui";

const CHART_MIN_HEIGHT = "h-48 sm:h-56";

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
  fillContainer = false,
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
      return (
        <ChartPlaceholder
          minHeight={CHART_MIN_HEIGHT}
          message="لا توجد جدران سيولة كافية ضمن هذه الفترة حتى الآن."
        />
      );
    }
  } else if (!chartPoints.length || !midPrice) {
    return (
      <ChartPlaceholder minHeight={CHART_MIN_HEIGHT} message="بانتظار بيانات السيولة..." />
    );
  }

  const chartLabel =
    mode === "historical" ? "خريطة جدران السيولة التاريخية" : "خريطة عمق السيولة";
  const shellClass = fillContainer ? "flex min-h-0 flex-1 flex-col" : "min-w-0";
  const svgShellClass = fillContainer
    ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 px-2 py-2 dark:border-white/10 dark:bg-slate-950/40 sm:px-3"
    : "min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 px-2 py-2 dark:border-white/10 dark:bg-slate-950/40 sm:px-3";
  const svgClass = fillContainer ? "h-full min-h-[12rem] w-full flex-1" : `${CHART_MIN_HEIGHT} w-full`;

  return (
    <div className={shellClass}>
      {mode === "historical" ? (
        <DepthHistoryState
          loading={false}
          error={false}
          partial={partial}
          coveragePercent={coveragePercent}
          collecting={collecting && partial}
        />
      ) : null}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="h-2 w-2 rounded-sm bg-emerald-500" />
            شراء
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="h-2 w-2 rounded-sm bg-rose-500" />
            بيع
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            <span className="h-px w-3 border-t border-dashed border-slate-400 dark:border-slate-500" />
            السعر الحالي
          </span>
        </div>
        <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-600 dark:bg-white/5 dark:text-slate-300">
          <NumericValue className="font-semibold text-slate-800 dark:text-slate-100">
            {formatPrice(midPrice)}
          </NumericValue>
        </span>
      </div>

      <div className={svgShellClass}>
        <svg viewBox="0 0 600 180" className={svgClass} preserveAspectRatio="xMidYMid meet" role="img" aria-label={chartLabel}>
          {[45, 90, 135].map((y) => (
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
          <line x1="0" y1="90" x2="600" y2="90" stroke="currentColor" className="text-slate-300 dark:text-slate-600" />
          <line
            x1="300"
            y1="6"
            x2="300"
            y2="174"
            stroke="currentColor"
            className="text-slate-400 dark:text-slate-500"
            strokeDasharray="3 3"
          />
          {chartPoints.map((point) => {
            const x = 300 + ((point.price - midPrice) / midPrice) * 270;
            const height = Math.max(6, (point.notional / maxNotional) * 78);
            const y = point.side === "bid" ? 90 - height : 90;
            const fill = point.side === "bid" ? "#10b981" : "#f43f5e";
            const opacity = 0.35 + (point.notional / maxNotional) * 0.65;

            return (
              <rect
                key={`${point.side}-${point.price}`}
                x={Math.max(0, Math.min(588, x - 4))}
                y={y}
                width={8}
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
