"use client";

import { useCallback, useMemo, useState } from "react";
import { EXCHANGE_LABELS } from "../../../lib/market-data/symbols";
import {
  formatMinutesAgoAr,
  formatPrice,
  formatQuantity,
  formatSpreadPercent,
  formatUsd,
} from "./formatters";
import { ChartPlaceholder, DepthHistoryState, NumericValue } from "./order-book-ui";

export const DEPTH_CHART_MIN_ROWS = 1;

const VIEW_WIDTH = 640;
const VIEW_HEIGHT = 220;
const MARGIN = { top: 18, right: 14, bottom: 34, left: 52 };
const PLOT_WIDTH = VIEW_WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = VIEW_HEIGHT - MARGIN.top - MARGIN.bottom;
const BASELINE_Y = MARGIN.top + PLOT_HEIGHT;

const CHART_SHELL_MIN = "min-h-[14rem]";
const FALLBACK_MIN = "h-48 sm:h-56";

function sqrtScale(value, max) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(max) || max <= 0) return 0;
  return Math.sqrt(value / max);
}

function buildPriceTicks(minPrice, maxPrice, midPrice, mobile = false) {
  const count = mobile ? 3 : 5;
  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || minPrice >= maxPrice) {
    return Number.isFinite(midPrice) ? [midPrice] : [];
  }

  const ticks = new Set();
  for (let index = 0; index < count; index += 1) {
    const ratio = count === 1 ? 0.5 : index / (count - 1);
    ticks.add(minPrice + (maxPrice - minPrice) * ratio);
  }
  if (Number.isFinite(midPrice)) ticks.add(midPrice);
  return [...ticks].sort((a, b) => a - b);
}

function buildValueTicks(maxNotional, mobile = false) {
  const steps = mobile ? 3 : 4;
  if (!Number.isFinite(maxNotional) || maxNotional <= 0) return [0];
  const ticks = [];
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    ticks.push(maxNotional * ratio * ratio);
  }
  return ticks;
}

function formatExchangeLabel(point, mode) {
  if (mode === "historical") {
    if (point.exchangeCount > 1) return `${point.exchangeCount} منصات`;
    if (point.exchanges?.length === 1) {
      return EXCHANGE_LABELS[point.exchanges[0]] || point.exchanges[0];
    }
  }
  if (Array.isArray(point.exchanges) && point.exchanges.length > 1) {
    return `${point.exchanges.length} منصات`;
  }
  if (Array.isArray(point.exchanges) && point.exchanges.length === 1) {
    return EXCHANGE_LABELS[point.exchanges[0]] || point.exchanges[0];
  }
  return "مجمّع";
}

function buildTooltipLines(point, mode, midPrice) {
  const sideLabel = point.side === "bid" ? "شراء" : "بيع";
  const distance =
    Number.isFinite(midPrice) && midPrice !== 0
      ? formatSpreadPercent(((point.price - midPrice) / midPrice) * 100)
      : "—";

  const lines = [
    `${sideLabel}`,
    `السعر: ${formatPrice(point.price)}`,
    `القيمة: ${formatUsd(point.notional, { compact: true })}`,
    `الكمية: ${formatQuantity(point.quantity ?? point.notional / (point.price || 1))}`,
    `البعد عن السعر: ${distance}`,
    `المنصة: ${formatExchangeLabel(point, mode)}`,
  ];

  if (mode === "historical") {
    if (Number.isFinite(point.persistenceScore)) {
      lines.push(`الثبات: ${Math.round(point.persistenceScore)}%`);
    }
    if (point.lastSeen) {
      lines.push(`آخر ظهور: ${formatMinutesAgoAr(point.lastSeen)}`);
    }
  }

  return lines;
}

function ChartFrame({ fillContainer, children, className = "" }) {
  const shell = fillContainer
    ? `flex ${CHART_SHELL_MIN} flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-slate-950/40`
    : `min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50 dark:border-white/10 dark:bg-slate-950/40`;
  const inner = fillContainer ? "relative min-h-0 flex-1" : "relative";

  return (
    <div className={`${shell} ${className}`}>
      <div className={inner}>{children}</div>
    </div>
  );
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
  const [hovered, setHovered] = useState(null);
  const mobile =
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false;
  const clearHover = useCallback(() => setHovered(null), []);

  const chartModel = useMemo(() => {
    const bids = points.filter((point) => point.side === "bid");
    const asks = points.filter((point) => point.side === "ask");
    const maxNotional = Math.max(...points.map((point) => Number(point.notional) || 0), 1);
    const prices = points.map((point) => point.price).filter(Number.isFinite);
    const minPrice = prices.length ? Math.min(...prices) : midPrice;
    const maxPrice = prices.length ? Math.max(...prices) : midPrice;
    const priceRange = Math.max(maxPrice - minPrice, Number(midPrice) * 0.002 || 1);
    const barWidth = Math.max(
      4,
      Math.min(12, PLOT_WIDTH / Math.max(points.length, 8) - 1),
    );

    const xForPrice = (price) =>
      MARGIN.left + ((price - minPrice) / priceRange) * PLOT_WIDTH;

    const bars = points.map((point) => {
      const height = sqrtScale(Number(point.notional) || 0, maxNotional) * PLOT_HEIGHT;
      const xCenter = xForPrice(point.price);
      return {
        point,
        x: xCenter - barWidth / 2,
        y: BASELINE_Y - height,
        width: barWidth,
        height: Math.max(height, point.notional > 0 ? 2 : 0),
      };
    });

    return {
      bids,
      asks,
      maxNotional,
      minPrice,
      maxPrice,
      priceRange,
      bars,
      priceTicks: buildPriceTicks(minPrice, maxPrice, midPrice, mobile),
      valueTicks: buildValueTicks(maxNotional, mobile),
      midX: Number.isFinite(midPrice) ? xForPrice(midPrice) : MARGIN.left + PLOT_WIDTH / 2,
    };
  }, [points, midPrice, mobile]);

  const placeholderClass = fillContainer ? `${CHART_SHELL_MIN} flex-1` : FALLBACK_MIN;

  if (mode === "historical") {
    if (loading) {
      return (
        <DepthHistoryState
          loading
          error={false}
          partial={false}
          coveragePercent={coveragePercent}
          collecting={false}
          minHeight={placeholderClass}
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
          minHeight={placeholderClass}
        />
      );
    }

    if (!points.length || !midPrice) {
      if (collecting && (!Number.isFinite(coveragePercent) || coveragePercent <= 0)) {
        return (
          <DepthHistoryState
            loading={false}
            error={false}
            partial={false}
            coveragePercent={coveragePercent}
            collecting
            minHeight={placeholderClass}
          />
        );
      }
      return (
        <ChartPlaceholder
          minHeight={placeholderClass}
          message="لا توجد جدران سيولة كافية ضمن هذه الفترة حتى الآن."
        />
      );
    }
  } else if (!points.length || !midPrice) {
    return (
      <ChartPlaceholder minHeight={placeholderClass} message="بانتظار بيانات السيولة..." />
    );
  }

  const chartLabel =
    mode === "historical" ? "خريطة جدران السيولة التاريخية" : "خريطة عمق السيولة";
  const shellClass = fillContainer ? `flex ${CHART_SHELL_MIN} min-h-0 flex-1 flex-col` : "min-w-0";
  const svgClass = fillContainer ? "h-full min-h-[14rem] w-full flex-1" : `${FALLBACK_MIN} w-full`;

  return (
    <div className={shellClass} onMouseLeave={clearHover}>
      {mode === "historical" ? (
        <DepthHistoryState
          loading={false}
          error={false}
          partial={partial}
          coveragePercent={coveragePercent}
          collecting={collecting && partial}
        />
      ) : null}

      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />
            شراء
          </span>
          <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
            <span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />
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

      <ChartFrame fillContainer={fillContainer} className="px-1 py-1 sm:px-2">
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          className={svgClass}
          preserveAspectRatio="none"
          role="img"
          aria-label={chartLabel}
        >
          {chartModel.valueTicks.map((tickValue) => {
            const y = BASELINE_Y - sqrtScale(tickValue, chartModel.maxNotional) * PLOT_HEIGHT;
            return (
              <g key={`grid-${tickValue}`}>
                <line
                  x1={MARGIN.left}
                  y1={y}
                  x2={VIEW_WIDTH - MARGIN.right}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-700/80"
                  strokeDasharray="3 4"
                />
                <text
                  x={MARGIN.left - 6}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[9px] dark:fill-slate-500"
                >
                  {formatUsd(tickValue, { compact: true })}
                </text>
              </g>
            );
          })}

          <line
            x1={MARGIN.left}
            y1={BASELINE_Y}
            x2={VIEW_WIDTH - MARGIN.right}
            y2={BASELINE_Y}
            stroke="currentColor"
            className="text-slate-300 dark:text-slate-600"
          />

          <line
            x1={chartModel.midX}
            y1={MARGIN.top - 4}
            x2={chartModel.midX}
            y2={BASELINE_Y + 4}
            stroke="currentColor"
            className="text-slate-400 dark:text-slate-500"
            strokeDasharray="4 3"
          />

          {chartModel.bars.map((bar) => {
            const isBid = bar.point.side === "bid";
            const fill = isBid ? "#10b981" : "#f43f5e";
            const opacity =
              0.35 +
              sqrtScale(Number(bar.point.notional) || 0, chartModel.maxNotional) * 0.6;

            return (
              <rect
                key={`${bar.point.side}-${bar.point.price}`}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                fill={fill}
                opacity={opacity}
                rx={1.5}
                onMouseEnter={() => setHovered(bar.point)}
                onFocus={() => setHovered(bar.point)}
                onMouseLeave={clearHover}
              />
            );
          })}

          {chartModel.priceTicks.map((tickPrice) => {
            const x =
              MARGIN.left +
              ((tickPrice - chartModel.minPrice) / chartModel.priceRange) * PLOT_WIDTH;
            return (
              <text
                key={`price-${tickPrice}`}
                x={x}
                y={VIEW_HEIGHT - 10}
                textAnchor="middle"
                className="fill-slate-500 text-[9px] dark:fill-slate-400"
              >
                {formatPrice(tickPrice, tickPrice >= 1000 ? 0 : 2)}
              </text>
            );
          })}
        </svg>

        {hovered ? (
          <div
            className="pointer-events-none absolute bottom-2 left-2 z-10 max-w-[min(100%,16rem)] rounded-lg border border-slate-200 bg-white/95 px-2.5 py-2 text-[11px] leading-5 text-slate-700 shadow-sm backdrop-blur dark:border-white/10 dark:bg-slate-900/95 dark:text-slate-200"
            dir="rtl"
          >
            {buildTooltipLines(hovered, mode, midPrice).map((line) => (
              <div key={line} dir="auto">
                {line}
              </div>
            ))}
          </div>
        ) : null}
      </ChartFrame>

      <p className="mt-1 shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
        {chartModel.bids.length} مستوى شراء · {chartModel.asks.length} مستوى بيع · مقياس sqrt
      </p>
    </div>
  );
}
