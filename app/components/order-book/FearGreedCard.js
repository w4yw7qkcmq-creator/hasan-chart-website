"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "../../../lib/fetch-with-timeout";
import { formatInteger } from "./formatters";
import { NumericValue } from "./order-book-ui";

function gaugeColor(value) {
  if (value <= 25) return "#dc2626";
  if (value <= 45) return "#f97316";
  if (value <= 55) return "#64748b";
  if (value <= 75) return "#22c55e";
  return "#059669";
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
  const formattedValue = formatInteger(value);
  const color = gaugeColor(Number.isFinite(numericValue) ? numericValue : 50);

  const wrapperClass = isOrderBook
    ? "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900/80 sm:p-5"
    : "site-price-card rounded-2xl border border-slate-200/80 bg-white/90 p-5 dark:border-white/10 dark:bg-slate-900/70";

  return (
    <div className={wrapperClass}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          {!isOrderBook ? <p className="site-price-card__eyebrow">Sentiment</p> : null}
          <h3
            className={
              isOrderBook
                ? "text-lg font-bold text-slate-900 dark:text-white"
                : "site-price-card__title mb-0"
            }
          >
            مؤشر الخوف والطمع
          </h3>
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
            <svg viewBox="0 0 200 110" className="h-24 w-full max-w-xs sm:h-28">
              <path
                d="M20 100 A80 80 0 0 1 180 100"
                fill="none"
                stroke="currentColor"
                className="text-slate-200 dark:text-slate-700"
                strokeWidth="10"
              />
              <path
                d="M20 100 A80 80 0 0 1 180 100"
                fill="none"
                stroke={color}
                strokeWidth="10"
                strokeDasharray={`${((Number.isFinite(numericValue) ? numericValue : 0) / 100) * 251} 251`}
              />
              <text
                x="100"
                y="78"
                textAnchor="middle"
                className="fill-slate-900 text-3xl font-bold dark:fill-white"
              >
                {formattedValue}
              </text>
            </svg>
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {payload.current.classificationAr}
            </p>
          </div>

          {payload.history?.length && !isOrderBook ? (
            <div className="mt-4 flex h-16 items-end gap-1">
              {[...payload.history].reverse().slice(-14).map((entry) => (
                <div
                  key={entry.timestamp}
                  className="flex-1 rounded-t"
                  style={{ height: `${Math.max(8, entry.value)}%`, backgroundColor: gaugeColor(entry.value) }}
                  title={`${formatInteger(entry.value)} - ${entry.classificationAr}`}
                />
              ))}
            </div>
          ) : null}

          {payload.attribution && !isOrderBook ? (
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{payload.attribution}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
