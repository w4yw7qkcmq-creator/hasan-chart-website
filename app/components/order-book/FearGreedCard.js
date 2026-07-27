"use client";

import { useEffect, useState } from "react";
import { fetchWithTimeout } from "../../../lib/fetch-with-timeout";

function gaugeColor(value) {
  if (value <= 25) return "#dc2626";
  if (value <= 45) return "#f97316";
  if (value <= 55) return "#64748b";
  if (value <= 75) return "#22c55e";
  return "#059669";
}

export default function FearGreedCard() {
  const [payload, setPayload] = useState(null);

  useEffect(() => {
    let cancelled = false;

    void fetchWithTimeout("/api/market-sentiment/fear-greed", {}, 8000)
      .then((response) => response.json())
      .then((result) => {
        if (!cancelled) setPayload(result);
      })
      .catch(() => {
        if (!cancelled) setPayload({ success: false });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const value = payload?.current?.value;
  const color = gaugeColor(Number(value) || 50);

  return (
    <div className="site-price-card rounded-2xl border border-slate-200/80 bg-white/90 p-5 dark:border-white/10 dark:bg-slate-900/70">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="site-price-card__eyebrow">Sentiment</p>
          <h3 className="site-price-card__title mb-0">مؤشر الخوف والطمع</h3>
        </div>
        {payload?.staleNotice ? (
          <span className="rounded-full bg-amber-500/10 px-3 py-1 text-xs text-amber-700 dark:text-amber-300">
            {payload.staleNotice}
          </span>
        ) : null}
      </div>

      {!payload?.current ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">تعذر تحميل المؤشر حالياً.</p>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3">
            <svg viewBox="0 0 200 110" className="h-28 w-full max-w-xs">
              <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#e2e8f0" strokeWidth="12" />
              <path
                d="M20 100 A80 80 0 0 1 180 100"
                fill="none"
                stroke={color}
                strokeWidth="12"
                strokeDasharray={`${(value / 100) * 251} 251`}
              />
              <text x="100" y="78" textAnchor="middle" className="fill-slate-900 text-3xl font-semibold dark:fill-white">
                {value}
              </text>
            </svg>
            <p className="text-lg font-medium text-slate-800 dark:text-slate-100">
              {payload.current.classificationAr}
            </p>
          </div>

          {payload.history?.length ? (
            <div className="mt-4 flex h-16 items-end gap-1">
              {[...payload.history].reverse().slice(-14).map((entry) => (
                <div
                  key={entry.timestamp}
                  className="flex-1 rounded-t bg-slate-200 dark:bg-slate-700"
                  style={{ height: `${Math.max(8, entry.value)}%`, backgroundColor: gaugeColor(entry.value) }}
                  title={`${entry.value} - ${entry.classificationAr}`}
                />
              ))}
            </div>
          ) : null}

          <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">{payload.attribution}</p>
        </>
      )}
    </div>
  );
}
