"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { warmupBybitNetwork } from "../../../lib/bybit-network";
import { warmupTradingViewNetwork } from "../../../lib/trading-view-network";
import { useLazyInView } from "../../hooks/useLazyInView";

function getFullscreenElement() {
  if (typeof document === "undefined") {
    return null;
  }

  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

async function requestElementFullscreen(element) {
  if (process.env.NODE_ENV === "development") {
    console.info(
      "[hc-live-chart] pre-fullscreen viewport children:",
      [...element.children].map((child) => child.className || child.tagName)
    );
  }

  if (element.requestFullscreen) {
    await element.requestFullscreen();
    return;
  }

  if (element.webkitRequestFullscreen) {
    await element.webkitRequestFullscreen();
    return;
  }

  throw new Error("Fullscreen API is not supported");
}

async function exitElementFullscreen() {
  if (document.exitFullscreen) {
    await document.exitFullscreen();
    return;
  }

  if (document.webkitExitFullscreen) {
    await document.webkitExitFullscreen();
  }
}

function FullscreenEnterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

function FullscreenExitIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 9 5 5M15 9l4-4M9 15l-4 4M15 15l4 4" />
      <path d="M5 9V5h4M15 9V5h-4M5 15v4h4M15 15v4h-4" />
    </svg>
  );
}

function LiveChartSectionComponent({
  chartSearch,
  setChartSearch,
  chartInterval,
  setChartInterval,
  chartSymbol,
  chartSearchError,
  onApplySearch,
}) {
  const { ref: inViewRef, isInView } = useLazyInView({ rootMargin: "240px 0px" });
  const viewportRef = useRef(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const setViewportRef = useCallback(
    (node) => {
      viewportRef.current = node;
      inViewRef.current = node;
    },
    [inViewRef]
  );

  useEffect(() => {
    setChartLoading(true);
  }, [chartSymbol, chartInterval]);

  useEffect(() => {
    if (isInView) {
      warmupTradingViewNetwork();
      warmupBybitNetwork();
    }
  }, [isInView]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncDesktop = () => setIsDesktop(mediaQuery.matches);

    syncDesktop();
    mediaQuery.addEventListener("change", syncDesktop);

    return () => mediaQuery.removeEventListener("change", syncDesktop);
  }, []);

  useEffect(() => {
    const syncFullscreenState = () => {
      const viewport = viewportRef.current;
      setIsFullscreen(Boolean(viewport && getFullscreenElement() === viewport));
    };

    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    };
  }, []);

  const enterFullscreen = useCallback(async () => {
    const viewport = viewportRef.current;

    if (!viewport || !isDesktop || getFullscreenElement() === viewport) {
      return;
    }

    try {
      await requestElementFullscreen(viewport);

      if (process.env.NODE_ENV === "development") {
        const fsEl = getFullscreenElement();
        console.info("[hc-live-chart] post-fullscreen target:", {
          tag: fsEl?.tagName ?? null,
          className: fsEl?.className ?? null,
          isViewport: fsEl === viewport,
          childCount: fsEl?.childElementCount ?? 0,
          childClassNames: fsEl ? [...fsEl.children].map((child) => child.className || child.tagName) : [],
        });
      }
    } catch (error) {
      console.warn("Live chart fullscreen request failed:", error);
      setIsFullscreen(getFullscreenElement() === viewport);
    }
  }, [isDesktop]);

  const exitFullscreen = useCallback(async () => {
    const viewport = viewportRef.current;

    if (!viewport || getFullscreenElement() !== viewport) {
      return;
    }

    try {
      await exitElementFullscreen();
    } catch (error) {
      console.warn("Live chart fullscreen exit failed:", error);
      setIsFullscreen(getFullscreenElement() === viewport);
    }
  }, []);

  const chartIntervals = [
    { value: "1", label: "1 دقيقة" },
    { value: "5", label: "5 دقائق" },
    { value: "15", label: "15 دقيقة" },
    { value: "60", label: "1 ساعة" },
    { value: "240", label: "4 ساعات" },
    { value: "D", label: "يومي" },
    { value: "W", label: "أسبوعي" },
  ];

  return (
    <section
      id="chart"
      className="site-live-chart-section w-full"
      data-hc-live-chart-build="intervals-fullscreen-v8"
    >
      <div className="site-live-chart-panel glassPanel">
        <header className="site-live-chart-header">
          <h2 className="sectionTitle site-live-chart-title">الشارت الحي</h2>
          <p className="site-live-chart-desc">
            اختر العملة والفريم الزمني لمتابعة الرسم البياني المباشر.
          </p>
        </header>

        <div className="site-live-chart-controls">
          <div className="site-live-chart-symbol-row">
            <input
              value={chartSearch}
              onChange={(e) => setChartSearch(e.target.value)}
              onFocus={warmupBybitNetwork}
              onKeyDown={(e) => {
                if (e.key === "Enter") onApplySearch();
              }}
              placeholder="ابحث عن أي عملة مثل BTC أو PEPE أو BTCUSDT"
              className="site-live-chart-input"
              aria-label="رمز العملة"
            />

            <div className="site-live-chart-action-stack">
              <button type="button" onClick={onApplySearch} className="site-live-chart-btn">
                عرض الشارت
              </button>
            </div>
          </div>

          <div className="site-live-chart-intervals" role="group" aria-label="الفريم الزمني">
            <span className="site-live-chart-intervals-label">الفريم الزمني</span>
            <div className="site-live-chart-intervals-list">
              {chartIntervals.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setChartInterval(item.value)}
                  className={`site-live-chart-interval-btn${
                    chartInterval === item.value ? " is-active" : ""
                  }`}
                  aria-pressed={chartInterval === item.value}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                className="site-live-chart-fullscreen-btn"
                onClick={enterFullscreen}
                aria-label="ملء الشاشة"
                title="ملء الشاشة"
              >
                <FullscreenEnterIcon />
                <span className="site-live-chart-fullscreen-btn-label">ملء الشاشة</span>
              </button>
            </div>
          </div>

          {chartSearchError ? (
            <div className="site-live-chart-error" role="alert">
              {chartSearchError}
            </div>
          ) : null}
        </div>

        <div className="site-live-chart-frame" aria-busy={chartLoading || !isInView}>
          <div
            ref={setViewportRef}
            className={`site-live-chart-viewport${isFullscreen ? " is-fullscreen" : ""}`}
          >
            {isFullscreen ? (
              <button
                type="button"
                className="site-live-chart-fullscreen-exit-btn"
                onClick={exitFullscreen}
                aria-label="الخروج من ملء الشاشة"
                title="الخروج من ملء الشاشة"
              >
                <FullscreenExitIcon />
              </button>
            ) : null}

            {!isInView || chartLoading ? (
              <div className="site-live-chart-skeleton" aria-live="polite">
                <div className="site-live-chart-skeleton-bars">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
                <p className="site-live-chart-skeleton-text">
                  {isInView ? "جاري تحميل الشارت..." : "سيُحمّل الشارت عند الظهور..."}
                </p>
              </div>
            ) : null}

            {isInView ? (
              <iframe
                key={`${chartSymbol}-${chartInterval}`}
                src={`https://s.tradingview.com/widgetembed/?symbol=BINANCE:${chartSymbol}&interval=${chartInterval}&theme=dark&style=1&locale=ar`}
                className={`site-live-chart-iframe${chartLoading ? " is-loading" : ""}`}
                title={`TradingView chart ${chartSymbol}`}
                loading="lazy"
                referrerPolicy="no-referrer"
                fetchPriority="low"
                onLoad={() => setChartLoading(false)}
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

export const LiveChartSection = memo(LiveChartSectionComponent);
