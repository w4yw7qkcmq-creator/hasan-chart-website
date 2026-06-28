"use client";

import { memo, useEffect, useRef, useState } from "react";

function TradingViewWidgetComponent({ symbol, height = "120" }) {
  const containerRef = useRef(null);
  const [feedStatus, setFeedStatus] = useState("loading");

  useEffect(() => {
    if (!containerRef.current) return undefined;

    const container = containerRef.current;
    setFeedStatus("loading");
    container.innerHTML = "";

    const widgetBox = document.createElement("div");
    widgetBox.className = "tradingview-widget-container__widget";
    container.appendChild(widgetBox);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
      symbol,
      width: "100%",
      isTransparent: false,
      colorTheme: "dark",
      locale: "ar",
    });

    script.onload = () => {
      setFeedStatus("live");
    };

    script.onerror = () => {
      setFeedStatus("unavailable");
    };

    container.appendChild(script);

    const fallbackTimer = window.setTimeout(() => {
      setFeedStatus((current) => (current === "loading" ? "unavailable" : current));
    }, 8000);

    return () => {
      window.clearTimeout(fallbackTimer);
      container.innerHTML = "";
    };
  }, [symbol]);

  const statusLabel =
    feedStatus === "live"
      ? "TradingView Live"
      : feedStatus === "unavailable"
        ? "غير متاح مؤقتاً"
        : "جاري التحديث...";

  return (
    <div>
      <div className="relative">
        <div
          ref={containerRef}
          className="tradingview-widget-container overflow-hidden rounded-2xl border border-slate-800 bg-black shadow-[inset_0_0_30px_rgba(0,0,0,0.65)]"
          style={{ height }}
        />
        {feedStatus === "loading" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/70 text-xs font-bold text-cyan-200">
            جاري التحديث...
          </div>
        ) : feedStatus === "unavailable" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/55 text-xs font-bold text-slate-300">
            غير متاح مؤقتاً
          </div>
        ) : null}
      </div>
      <p className="site-price-card__status">● {statusLabel}</p>
    </div>
  );
}

export const TradingViewWidget = memo(TradingViewWidgetComponent);

function TradingViewPriceComponent({ title, symbol, tvSymbol }) {
  return (
    <div className="site-price-card site-price-card--tv">
      <p className="site-price-card__eyebrow">{title}</p>
      <h3 className="site-price-card__title">{symbol}</h3>
      <TradingViewWidget symbol={tvSymbol} height="120" />
    </div>
  );
}

export const TradingViewPrice = memo(TradingViewPriceComponent);

function MarketWindowComponent({ title, label, symbol, widgetHeight = "120" }) {
  return (
    <div className="site-price-card site-price-card--tv">
      <p className="site-price-card__eyebrow">{label}</p>
      <h3 className="site-price-card__title">{title}</h3>
      <TradingViewWidget symbol={symbol} height={widgetHeight} />
    </div>
  );
}

export const MarketWindow = memo(MarketWindowComponent);
