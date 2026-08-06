"use client";

import { useEffect, useRef, useState } from "react";
import { fetchWithTimeout } from "../../../lib/fetch-with-timeout";
import { formatInteger } from "./formatters";
import {
  describeFearGreedArcSegment,
  FEAR_GREED_GAUGE_SEGMENTS,
  fearGreedClassificationAr,
  fearGreedPointerPosition,
} from "./fear-greed-gauge";
import { ob } from "./order-book-theme";

export { fearGreedClassificationAr, fearGreedPointerPosition } from "./fear-greed-gauge";

export const FEAR_GREED_REFRESH_MS = 15 * 60 * 1000;
const ORDER_BOOK_FEAR_GREED_URL = "/api/market-sentiment/fear-greed?source=coinmarketcap";
const LEGACY_FEAR_GREED_URL = "/api/market-sentiment/fear-greed";

function SemicircleGauge({ value, themed = false }) {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;
  const pointer = fearGreedPointerPosition(safeValue);
  const label = fearGreedClassificationAr(safeValue);

  const scoreClass = themed ? ob.textStrong : "font-bold";
  const labelClass = themed ? ob.textMuted : "text-sm opacity-80";
  const pointerFill = themed ? "var(--ob-text-strong)" : "currentColor";
  const pointerStroke = themed ? "var(--ob-surface-elevated)" : "var(--ob-surface, #fff)";

  return (
    <div className={`relative mx-auto w-full max-w-[280px] ${themed ? ob.textStrong : ""}`}>
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
          fill={pointerFill}
          stroke={pointerStroke}
          strokeWidth="2"
          className="transition-all duration-300"
        />
        <text x="100" y="88" textAnchor="middle" fill={pointerFill} className={`text-[2rem] ${scoreClass}`}>
          {formatInteger(safeValue)}
        </text>
        <text x="100" y="108" textAnchor="middle" fill={themed ? "var(--ob-text-muted)" : "currentColor"} className={labelClass}>
          {label}
        </text>
      </svg>
    </div>
  );
}

function normalizeFearGreedPayload(result, isOrderBook) {
  if (!result) return null;

  if (isOrderBook && result.source === "coinmarketcap" && result.value != null) {
    return {
      success: true,
      current: {
        value: result.value,
        classification: result.classification,
        classificationAr: result.classificationAr || fearGreedClassificationAr(result.value),
      },
      source: result.source,
      updatedAt: result.updatedAt,
      fetchedAt: result.fetchedAt,
      stale: result.stale,
      staleNotice: result.staleNotice,
      attribution: "المصدر: CoinMarketCap",
    };
  }

  if (result.current?.value != null) {
    return result;
  }

  return null;
}

async function fetchFearGreedPayload(isOrderBook) {
  const response = await fetchWithTimeout(
    isOrderBook ? ORDER_BOOK_FEAR_GREED_URL : LEGACY_FEAR_GREED_URL,
    { cache: "no-store" },
    12_000,
  );
  const result = await response.json();
  return normalizeFearGreedPayload(result, isOrderBook);
}

export default function FearGreedCard({ variant = "default" }) {
  const [payload, setPayload] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastSuccessfulRef = useRef(null);
  const isOrderBook = variant === "orderBook";

  useEffect(() => {
    let cancelled = false;

    async function load(isRefresh = false) {
      if (isRefresh) {
        setIsRefreshing(true);
      }

      try {
        const result = await fetchFearGreedPayload(isOrderBook);
        if (cancelled) return;

        if (result?.current?.value != null) {
          lastSuccessfulRef.current = result;
          setPayload(result);
        } else if (lastSuccessfulRef.current) {
          setPayload({
            ...lastSuccessfulRef.current,
            stale: true,
            staleNotice: "بيانات قديمة",
          });
        } else {
          setPayload(result || { success: false });
        }
      } catch {
        if (cancelled) return;

        if (lastSuccessfulRef.current) {
          setPayload({
            ...lastSuccessfulRef.current,
            stale: true,
            staleNotice: "بيانات قديمة",
          });
        } else {
          setPayload({ success: false });
        }
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
          setIsRefreshing(false);
        }
      }
    }

    void load(false);
    const intervalId = setInterval(() => {
      void load(true);
    }, FEAR_GREED_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [isOrderBook]);

  const displayPayload = payload?.current ? payload : lastSuccessfulRef.current;
  const value = displayPayload?.current?.value;
  const numericValue = Number(value);

  const wrapperClass = isOrderBook
    ? `${ob.surface} p-4 sm:p-5`
    : "site-price-card rounded-2xl border p-5";

  const bodyHeightClass = isOrderBook ? "min-h-[11.5rem]" : "min-h-[8rem]";

  if (isOrderBook) {
    return (
      <div className={wrapperClass}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className={`text-lg font-bold ${ob.textStrong}`}>مؤشر الخوف والطمع</h3>
          {isRefreshing ? (
            <span
              aria-hidden="true"
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--ob-border)] border-t-[var(--ob-text-strong)]"
            />
          ) : (
            <span className={ob.textSubtle} aria-hidden="true">
              ›
            </span>
          )}
        </div>

        {initialLoading && !displayPayload?.current ? (
          <div className={`flex ${bodyHeightClass} flex-col items-center justify-center gap-2`}>
            <div className={`h-[7.5rem] w-full max-w-[280px] animate-pulse rounded-t-full ${ob.surfaceMuted}`} />
            <div className={`h-4 w-24 animate-pulse rounded ${ob.surfaceMuted}`} />
          </div>
        ) : !displayPayload?.current ? (
          <p className={`${bodyHeightClass} text-sm ${ob.textMuted}`}>
            تعذّر تحميل مؤشر الخوف والطمع حاليًا.
          </p>
        ) : (
          <SemicircleGauge value={numericValue} themed />
        )}

        {displayPayload?.staleNotice ? (
          <p className={`mt-2 text-center text-[10px] ${ob.alertWarning} border-0 bg-transparent px-0 py-0`}>
            {displayPayload.staleNotice}
          </p>
        ) : null}

        {displayPayload?.attribution ? (
          <p className={`mt-2 text-center text-[10px] ${ob.textSubtle}`}>{displayPayload.attribution}</p>
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
        {displayPayload?.staleNotice ? (
          <span className={ob.badgeWarningCompact}>
            {displayPayload.staleNotice}
          </span>
        ) : null}
      </div>

      {initialLoading && !displayPayload?.current ? (
        <div className="flex min-h-[8rem] flex-col items-center justify-center gap-3">
          <div className="h-24 w-full max-w-xs animate-pulse rounded-xl bg-black/5 dark:bg-black/20" />
          <div className="h-4 w-32 animate-pulse rounded bg-black/5 dark:bg-black/20" />
        </div>
      ) : !displayPayload?.current ? (
        <p className="site-price-card__meta min-h-[5rem] text-sm">تعذّر تحميل المؤشر حاليًا</p>
      ) : (
        <>
          <div className="flex flex-col items-center gap-2">
            <SemicircleGauge value={numericValue} />
            <p className="site-price-card__value text-base font-semibold">
              {displayPayload.current.classificationAr || fearGreedClassificationAr(numericValue)}
            </p>
          </div>

          {displayPayload.history?.length ? (
            <div className="mt-4 flex h-16 items-end gap-1">
              {[...displayPayload.history].reverse().slice(-14).map((entry) => (
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

          {displayPayload.attribution ? (
            <p className="site-price-card__meta mt-4 text-xs">{displayPayload.attribution}</p>
          ) : null}
        </>
      )}
    </div>
  );
}
