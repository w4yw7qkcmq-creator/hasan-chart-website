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
      const barHeight = Math.max(6, Math.round((item.count / maxCount) * (chartHeight - 56)));
      return { ...item, barHeight, index };
    });
  }, [series, maxCount]);

  const totalInPeriod = series.reduce((sum, item) => sum + item.count, 0);
  const hovered = hoveredIndex != null ? points[hoveredIndex] : null;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-cyan-300/15 dark:bg-white/[0.045] dark:shadow-[0_18px_50px_rgba(0,0,0,0.25)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600 dark:text-cyan-300">
            Volume
          </p>
          <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">نشاط الإرسال</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
            {totalInPeriod.toLocaleString("ar")} رسالة في الفترة المحددة
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setPeriod(item.id);
                setHoveredIndex(null);
              }}
              className={`rounded-2xl border px-4 py-2 text-sm font-black transition duration-200 ${
                period === item.id
                  ? "border-cyan-300 bg-cyan-50 text-cyan-900 shadow-sm dark:border-cyan-300/30 dark:bg-cyan-400/15 dark:text-cyan-100"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-cyan-300/10 dark:bg-black/20 dark:text-slate-300 dark:hover:bg-white/[0.06]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "آخر 24 ساعة", value: todayActivity.last24Hours },
          { label: "آخر ساعة", value: todayActivity.lastHour },
          { label: "متوسط التسليم", value: todayActivity.averageSendTime },
          { label: "أكثر نوع", value: todayActivity.topMessageType },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-cyan-300/10 dark:bg-black/20"
          >
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{item.label}</p>
            <p className="mt-1 truncate text-lg font-black text-slate-950 dark:text-white">
              {typeof item.value === "number" ? item.value.toLocaleString("ar") : item.value || "—"}
            </p>
          </div>
        ))}
      </div>

      <div className="relative mt-8 overflow-x-auto pb-2">
        {hovered ? (
          <div className="pointer-events-none absolute left-4 top-0 z-20 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur dark:border-cyan-300/20 dark:bg-[#07142f]/95">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{hovered.label || hovered.key}</p>
            <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
              {hovered.count.toLocaleString("ar")}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">رسالة</p>
          </div>
        ) : null}

        <svg
          viewBox={`0 0 ${width} ${chartHeight + 40}`}
          className="min-w-full"
          role="img"
          aria-label="مخطط نشاط الإيميلات"
        >
          <defs>
            <linearGradient id="emailAnalyticsBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor="#2563eb" />
            </linearGradient>
            <linearGradient id="emailAnalyticsBarHover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#67e8f9" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = 24 + (chartHeight - 56) * (1 - ratio);
            return (
              <g key={ratio}>
                <line
                  x1="24"
                  y1={y}
                  x2={width - 12}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-700"
                  strokeDasharray="4 6"
                  opacity="0.55"
                />
                <text x="0" y={y + 4} className="fill-slate-400 text-[10px] dark:fill-slate-500">
                  {Math.round(maxCount * ratio)}
                </text>
              </g>
            );
          })}

          {points.map((item) => {
            const barWidth = period === "24h" ? 18 : 14;
            const gap = period === "24h" ? 10 : 12;
            const x = 28 + item.index * (barWidth + gap);
            const y = chartHeight - item.barHeight;
            const isHovered = hoveredIndex === item.index;

            return (
              <g key={`${item.key || item.label}-${item.index}`}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={item.barHeight}
                  rx="7"
                  fill={isHovered ? "url(#emailAnalyticsBarHover)" : "url(#emailAnalyticsBar)"}
                  opacity={item.count ? (isHovered ? 1 : 0.92) : 0.18}
                  className="cursor-pointer transition duration-200"
                  onMouseEnter={() => setHoveredIndex(item.index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
                {(period !== "24h" ? item.index % Math.ceil(series.length / 8) === 0 : item.index % 2 === 0) && (
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight + 18}
                    textAnchor="middle"
                    className="fill-slate-500 text-[10px] dark:fill-slate-400"
                  >
                    {item.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
