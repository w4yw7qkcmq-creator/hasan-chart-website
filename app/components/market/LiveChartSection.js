"use client";
import { memo, useEffect, useState } from "react";
import { warmupBybitNetwork } from "../../../lib/bybit-network";
import { warmupTradingViewNetwork } from "../../../lib/trading-view-network";
import { useLazyInView } from "../../hooks/useLazyInView";
function LiveChartSectionComponent({
  chartSearch,
  setChartSearch,
  chartInterval,
  setChartInterval,
  chartSymbol,
  chartSearchError,
  onApplySearch,
}) {
  const { ref, isInView } = useLazyInView({ rootMargin: "240px 0px" });
  const [chartLoading, setChartLoading] = useState(true);
  useEffect(() => {
    setChartLoading(true);
  }, [chartSymbol, chartInterval]);
  useEffect(() => {
    if (isInView) {
      warmupTradingViewNetwork();
      warmupBybitNetwork();
    }
  }, [isInView]);
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
    <section id="chart" className="site-live-chart-section w-full">
      {" "}
      <div className="site-live-chart-panel glassPanel">
        {" "}
        <header className="site-live-chart-header">
          {" "}
          <h2 className="sectionTitle site-live-chart-title">
            الشارت الحي
          </h2>{" "}
          <p className="site-live-chart-desc">
            {" "}
            اختر العملة والفريم الزمني لمتابعة الرسم البياني المباشر.{" "}
          </p>{" "}
        </header>{" "}
        <div className="site-live-chart-controls">
          {" "}
          <div className="site-live-chart-symbol-row">
            {" "}
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
            />{" "}
            <button
              type="button"
              onClick={onApplySearch}
              className="site-live-chart-btn"
            >
              {" "}
              عرض الشارت{" "}
            </button>{" "}
          </div>{" "}
          <div
            className="site-live-chart-intervals"
            role="group"
            aria-label="الفريم الزمني"
          >
            {" "}
            <span className="site-live-chart-intervals-label">
              الفريم الزمني
            </span>{" "}
            <div className="site-live-chart-intervals-list">
              {" "}
              {chartIntervals.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setChartInterval(item.value)}
                  className={`site-live-chart-interval-btn${chartInterval === item.value ? " is-active" : ""}`}
                  aria-pressed={chartInterval === item.value}
                >
                  {" "}
                  {item.label}{" "}
                </button>
              ))}{" "}
            </div>{" "}
          </div>{" "}
          {chartSearchError ? (
            <div className="site-live-chart-error" role="alert">
              {" "}
              {chartSearchError}{" "}
            </div>
          ) : null}{" "}
        </div>{" "}
        <div
          ref={ref}
          className="site-live-chart-frame"
          aria-busy={chartLoading || !isInView}
        >
          {" "}
          {!isInView || chartLoading ? (
            <div className="site-live-chart-skeleton" aria-live="polite">
              {" "}
              <div className="site-live-chart-skeleton-bars">
                {" "}
                <span /> <span /> <span /> <span /> <span /> <span /> <span />{" "}
                <span />{" "}
              </div>{" "}
              <p className="site-live-chart-skeleton-text">
                {" "}
                {isInView
                  ? "جاري تحميل الشارت..."
                  : "سيُحمّل الشارت عند الظهور..."}{" "}
              </p>{" "}
            </div>
          ) : null}{" "}
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
          ) : null}{" "}
        </div>{" "}
      </div>{" "}
    </section>
  );
}
export const LiveChartSection = memo(LiveChartSectionComponent);
