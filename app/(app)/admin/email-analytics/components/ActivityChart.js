"use client";
import { useMemo, useState } from "react";
const PERIODS = [
  { id: "24h", label: "24 ساعة" },
  { id: "7d", label: "7 أيام" },
  { id: "30d", label: "30 يوماً" },
];
export function ActivityChart({ chartSeries = {}, todayActivity = {} }) {
  const [period, setPeriod] = useState("30d");
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const series = chartSeries[period] || [];
  const maxCount = Math.max(...series.map((item) => item.count), 1);
  const chartHeight = 260;
  const width = Math.max(series.length * 28, 720);
  const points = useMemo(() => {
    return series.map((item, index) => {
      const barHeight = Math.max(
        6,
        Math.round((item.count / maxCount) * (chartHeight - 56)),
      );
      return { ...item, barHeight, index };
    });
  }, [series, maxCount]);
  const totalInPeriod = series.reduce((sum, item) => sum + item.count, 0);
  const hovered = hoveredIndex != null ? points[hoveredIndex] : null;
  return (
    <div className="rounded-[28px] border border-[var(--ui-border)]200 ui-glass-solid p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      {" "}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        {" "}
        <div>
          {" "}
          <p className="text-xs font-black uppercase tracking-[0.18em] admin-text-muted">
            {" "}
            Volume{" "}
          </p>{" "}
          <h2 className="mt-2 text-2xl font-black admin-text">
            نشاط الإرسال
          </h2>{" "}
          <p className="mt-1 text-sm admin-text-subtle">
            {" "}
            {totalInPeriod.toLocaleString("ar")} رسالة في الفترة المحددة{" "}
          </p>{" "}
        </div>{" "}
        <div className="flex flex-wrap gap-2">
          {" "}
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setPeriod(item.id);
                setHoveredIndex(null);
              }}
              className={`rounded-2xl border px-4 py-2 text-sm font-black transition duration-200 ${period === item.id ? "admin-panel-border admin-panel admin-text-muted shadow-sm " : "border-[var(--ui-border)]200 ui-glass-solid admin-text-muted hover:bg-slate-50 "}`}
            >
              {" "}
              {item.label}{" "}
            </button>
          ))}{" "}
        </div>{" "}
      </div>{" "}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {" "}
        {[
          { label: "آخر 24 ساعة", value: todayActivity.last24Hours },
          { label: "آخر ساعة", value: todayActivity.lastHour },
          { label: "متوسط التسليم", value: todayActivity.averageSendTime },
          { label: "أكثر نوع", value: todayActivity.topMessageType },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-[var(--ui-border)]200 bg-slate-50/80 px-4 py-3"
          >
            {" "}
            <p className="text-xs font-bold admin-text-subtle">
              {item.label}
            </p>{" "}
            <p className="mt-1 truncate text-lg font-black admin-text">
              {" "}
              {typeof item.value === "number"
                ? item.value.toLocaleString("ar")
                : item.value || "—"}{" "}
            </p>{" "}
          </div>
        ))}{" "}
      </div>{" "}
      <div className="relative mt-8 overflow-x-auto pb-2">
        {" "}
        {hovered ? (
          <div className="pointer-events-none absolute left-4 top-0 z-20 rounded-2xl border border-[var(--ui-border)]200 ui-surface-elevated px-4 py-3 shadow-xl backdrop-blur">
            {" "}
            <p className="text-xs font-bold admin-text-subtle">
              {hovered.label || hovered.key}
            </p>{" "}
            <p className="mt-1 text-2xl font-black admin-text">
              {" "}
              {hovered.count.toLocaleString("ar")}{" "}
            </p>{" "}
            <p className="text-xs admin-text-subtle">رسالة</p>{" "}
          </div>
        ) : null}{" "}
        <svg
          viewBox={`0 0 ${width} ${chartHeight + 40}`}
          className="min-w-full"
          role="img"
          aria-label="مخطط نشاط الإيميلات"
        >
          {" "}
          <defs>
            {" "}
            <linearGradient id="emailAnalyticsBar" x1="0" y1="0" x2="0" y2="1">
              {" "}
              <stop offset="0%" stopColor="var(--ui-chart-series-1)" />{" "}
              <stop offset="100%" stopColor="var(--ui-chart-series-2)" />{" "}
            </linearGradient>{" "}
            <linearGradient
              id="emailAnalyticsBarHover"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              {" "}
              <stop offset="0%" stopColor="var(--ui-chart-series-1)" />{" "}
              <stop offset="100%" stopColor="var(--ui-chart-series-2)" />{" "}
            </linearGradient>{" "}
          </defs>{" "}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = 24 + (chartHeight - 56) * (1 - ratio);
            return (
              <g key={ratio}>
                {" "}
                <line
                  x1="24"
                  y1={y}
                  x2={width - 12}
                  y2={y}
                  stroke="currentColor"
                  className="admin-text-muted"
                  strokeDasharray="4 6"
                  opacity="0.55"
                />{" "}
                <text x="0" y={y + 4} className="fill-slate-400 text-[10px]">
                  {" "}
                  {Math.round(maxCount * ratio)}{" "}
                </text>{" "}
              </g>
            );
          })}{" "}
          {points.map((item) => {
            const barWidth = period === "24h" ? 18 : 14;
            const gap = period === "24h" ? 10 : 12;
            const x = 28 + item.index * (barWidth + gap);
            const y = chartHeight - item.barHeight;
            const isHovered = hoveredIndex === item.index;
            return (
              <g key={`${item.key || item.label}-${item.index}`}>
                {" "}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={item.barHeight}
                  rx="7"
                  fill={
                    isHovered
                      ? "url(#emailAnalyticsBarHover)"
                      : "url(#emailAnalyticsBar)"
                  }
                  opacity={item.count ? (isHovered ? 1 : 0.92) : 0.18}
                  className="cursor-pointer transition duration-200"
                  onMouseEnter={() => setHoveredIndex(item.index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />{" "}
                {(period !== "24h"
                  ? item.index % Math.ceil(series.length / 8) === 0
                  : item.index % 2 === 0) && (
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight + 18}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px]"
                  >
                    {" "}
                    {item.label}{" "}
                  </text>
                )}{" "}
              </g>
            );
          })}{" "}
        </svg>{" "}
      </div>{" "}
    </div>
  );
}
