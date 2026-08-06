"use client";

import { memo, useEffect, useState } from "react";
import { warmupTradingViewNetwork } from "../../../lib/trading-view-network";
import { useLazyInView } from "../../hooks/useLazyInView";

const CHART_INTERVALS = [
  { value: "15", label: "15 دقيقة" },
  { value: "60", label: "1 ساعة" },
  { value: "240", label: "4 ساعات" },
  { value: "D", label: "يومي" },
  { value: "W", label: "أسبوعي" },
];

function AssetHubChartComponent({
  symbol = "BTCUSDT",
  exchange = "BINANCE",
  sectionId = "asset-chart",
  title = "شارت الأصل",
  description = "رسم بياني مباشر من TradingView.",
}) {
  const { ref, isInView } = useLazyInView({ rootMargin: "240px 0px" });
  const [chartInterval, setChartInterval] = useState("240");
  const [chartLoading, setChartLoading] = useState(true);

  useEffect(() => {
    setChartLoading(true);
  }, [symbol, chartInterval, exchange]);

  useEffect(() => {
    if (isInView) {
      warmupTradingViewNetwork();
    }
  }, [isInView]);

  const chartKey = `${exchange}:${symbol}`;

  return (
    <section id={sectionId} className="site-live-chart-section w-full">
      <div className="site-live-chart-panel glassPanel">
        <header className="site-live-chart-header">
          <h2 className="sectionTitle site-live-chart-title">{title}</h2>
          <p className="site-live-chart-desc">{description}</p>
        </header>

        <div className="site-live-chart-controls">
          <div className="site-live-chart-intervals" role="group" aria-label="الفريم الزمني">
            <span className="site-live-chart-intervals-label">الفريم الزمني</span>
            <div className="site-live-chart-intervals-list">
              {CHART_INTERVALS.map((item) => (
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
            </div>
          </div>
        </div>

        <div ref={ref} className="site-live-chart-frame" aria-busy={chartLoading || !isInView}>
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
              key={`${chartKey}-${chartInterval}`}
              src={`https://s.tradingview.com/widgetembed/?symbol=${exchange}:${symbol}&interval=${chartInterval}&theme=dark&style=1&locale=ar`}
              className={`site-live-chart-iframe${chartLoading ? " is-loading" : ""}`}
              title={`TradingView chart ${chartKey}`}
              loading="lazy"
              referrerPolicy="no-referrer"
              fetchPriority="low"
              onLoad={() => setChartLoading(false)}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

export const AssetHubChart = memo(AssetHubChartComponent);
