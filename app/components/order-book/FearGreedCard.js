"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "../../../lib/fetch-with-timeout";
import { formatInteger } from "./formatters";
import {
  describeFearGreedArcSegment,
  FEAR_GREED_GAUGE_SEGMENTS,
  fearGreedClassificationAr,
  fearGreedPointerPosition,
} from "./fear-greed-gauge";

export { fearGreedClassificationAr, fearGreedPointerPosition } from "./fear-greed-gauge";

function SemicircleGauge({ value }) {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
  const pointer = fearGreedPointerPosition(safeValue);
  const label = fearGreedClassificationAr(safeValue);

  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      <svg viewBox="0 0 200 118" className="h-[7.5rem] w-full" role="img" aria-label="مؤشر الخوف والطمع">
        {FEAR_GREED_GAUGE_SEGMENTS.map((segment) => (
          <path
            key={`${segment.from}-${segment.to}`}
            d={describeFearGreedArcSegment(segment.from, segment.to)}
            fill="none"
            stroke={segment.color}
            strokeWidth="12"
            strokeLinecap="round"
          />
        ))}
        <circle
          cx={pointer.x}
          cy={pointer.y}
          r="5.5"
          className="fill-slate-900 stroke-white stroke-[2px] transition-all duration-300 dark:fill-white dark:stroke-slate-900"
        />
        <text
          x="100"
          y="88"
          textAnchor="middle"
          className="fill-slate-900 text-[2rem] font-bold dark:fill-white"
        >
          {formatInteger(safeValue)}
        </text>
        <text x="100" y="108" textAnchor="middle" className="fill-slate-600 text-sm dark:fill-slate-300">
          {label}
        </text>
      </svg>
    </div>
  );
}

export default function FearGreedCard({ variant = "default" }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const isOrderBook = variant === "orderBook";

  useEffect(() => {
    let cancelled = false;

    void fetchWithTimeout("/api/market-sentiment/fear-greed", {}, 8000)
      .then((response) => response.json())
      .then((result) => {
        if (!cancelled) setPayload(result);
      })
      .catch(() => {
        if (!cancelled) setPayload({ success: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = payload?.current?.value;
  const numericValue = Number(value);

  const wrapperClass = isOrderBook
    ? "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/80 sm:p-5"
    : "site-price-card rounded-2xl border border-slate-200/80 bg-white/90 p-5 dark:border-white/10 dark:bg-slate-900/70";

  const bodyHeightClass = isOrderBook ? "min-h-[11.5rem]" : "min-h-[8rem]";

  if (isOrderBook) {
    return (
      <div className={wrapperClass}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">مؤشر الخوف والطمع</h3>
          <span className="text-slate-400" aria-hidden="true">
            ›
          </span>
        </div>

        {loading ? (
          <div className={`flex ${bodyHeightClass} flex-col items-center justify-center gap-2`}>
            <div className="h-[7.5rem] w-full max-w-[280px] animate-pulse rounded-t-full bg-slate-100 dark:bg-white/5" />
            <div className="h-4 w-24 animate-pulse rounded bg-slate-100 dark:bg-white/5" />
          </div>
        ) : !payload?.current ? (
          <p className={`${bodyHeightClass} text-sm text-slate-500 dark:text-slate-400`}>
            تعذّر تحميل مؤشر الخوف والطمع حاليًا.
          </p>
        ) : (
          <SemicircleGauge value={numericValue} />
        )}

        {payload?.staleNotice ? (
          <p className="mt-2 text-center text-[10px] text-amber-700 dark:text-amber-300">{payload.staleNotice}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="site-price-card__eyebrow">Sentiment</p>
          <h3 className="site-price-card__title mb-0">مؤشر الخوف والطمع</h3>
        </div>
        {payload?.staleNotice ? (
          <span className="rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-0.5 text-[10px] text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            {payload.staleNotice}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="flex min-h-[8rem] flex-col items-center justify-center gap-3">
          <div className="h-24 w-full max-w-xs animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />
          <div className="h-4 w-32 animate-pulse rounded bg-slate-100 dark:bg-white/5" />
        </div>
      ) : !payload?.current ? (
        <p className="min-h-[5rem] text-sm text-slate-500 dark:text-slate-400">
          تعذّر تحميل المؤشر حاليًا
        </p>
      ) : (
        <>
          <div className="flex flex-col items-center gap-2">
            <SemicircleGauge value={numericValue} />
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {payload.current.classificationAr || fearGreedClassificationAr(numericValue)}
            </p>
          </div>

          {payload.history?.length ? (
            <div className="mt-4 flex h-16 items-end gap-1">
              {[...payload.history].reverse().slice(-14).map((entry) => (
                <div
                  key={entry.timestamp}
                  className="flex-1 rounded-t"
                  style={{
                    height: `${Math.max(8, entry.value)}%`,
                    backgroundColor:
                      FEAR_GREED_GAUGE_SEGMENTS.find((s) => entry.value >= s.from && entry.value < s.to)?.color ||
                      "#64748b",
                  }}
                  title={`${formatInteger(entry.value)} - ${entry.classificationAr}`}
                />
              ))}
            </div>
          ) : null}

          {payload.attribution ? (
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{payload.attribution}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
