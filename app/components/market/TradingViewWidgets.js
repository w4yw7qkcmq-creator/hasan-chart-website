"use client";
import { memo, useEffect, useRef, useState } from "react";
import {
  loadTradingViewEmbedScriptOnce,
  scheduleTradingViewEmbed,
  TRADING_VIEW_SINGLE_QUOTE_SRC,
} from "../../../lib/trading-view-network";
import { useLazyInView } from "../../hooks/useLazyInView";
function tradingViewWidgetPropsAreEqual(prev, next) {
  return prev.symbol === next.symbol && prev.height === next.height;
}
function TradingViewWidgetComponent({ symbol, height = "120" }) {
  const containerRef = useRef(null);
  const mountedSymbolRef = useRef(null);
  const { ref: inViewRef, isInView } = useLazyInView({
    rootMargin: "160px 0px",
  });
  const [feedStatus, setFeedStatus] = useState("loading");
  useEffect(() => {
    if (!isInView || !containerRef.current) {
      return undefined;
    }
    const container = containerRef.current;
    if (
      mountedSymbolRef.current === symbol &&
      container.childElementCount > 0
    ) {
      setFeedStatus("live");
      return undefined;
    }
    setFeedStatus("loading");
    let fallbackTimer = null;
    let cancelled = false;
    const cancelSchedule = scheduleTradingViewEmbed(() => {
      void loadTradingViewEmbedScriptOnce()
        .then(() => {
          if (cancelled || !containerRef.current) return;
          container.innerHTML = "";
          const widgetBox = document.createElement("div");
          widgetBox.className = "tradingview-widget-container__widget";
          container.appendChild(widgetBox);
          const script = document.createElement("script");
          script.src = TRADING_VIEW_SINGLE_QUOTE_SRC;
          script.async = true;
          script.innerHTML = JSON.stringify({
            symbol,
            width: "100%",
            isTransparent: false,
            colorTheme: "dark",
            locale: "ar",
          });
          script.onload = () => {
            if (!cancelled) {
              mountedSymbolRef.current = symbol;
              setFeedStatus("live");
            }
          };
          script.onerror = () => {
            if (!cancelled) {
              setFeedStatus("unavailable");
            }
          };
          container.appendChild(script);
          mountedSymbolRef.current = symbol;
          fallbackTimer = window.setTimeout(() => {
            if (!cancelled) {
              setFeedStatus((current) =>
                current === "loading" ? "unavailable" : current,
              );
            }
          }, 8000);
        })
        .catch(() => {
          if (!cancelled) {
            setFeedStatus("unavailable");
          }
        });
    });
    return () => {
      cancelled = true;
      cancelSchedule();
      if (fallbackTimer !== null) {
        window.clearTimeout(fallbackTimer);
      }
      mountedSymbolRef.current = null;
      container.innerHTML = "";
    };
  }, [symbol, isInView]);
  const statusLabel =
    feedStatus === "live"
      ? "TradingView Live"
      : feedStatus === "unavailable"
        ? "غير متاح مؤقتاً"
        : "جاري التحديث...";
  const setContainerRef = (node) => {
    containerRef.current = node;
    inViewRef.current = node;
  };
  return (
    <div>
      {" "}
      <div className="relative">
        {" "}
        <div
          ref={setContainerRef}
          className="tradingview-widget-container overflow-hidden rounded-2xl border border-slate-800 admin-panel shadow-[inset_0_0_30px_rgba(0,0,0,0.65)]"
          style={{ height }}
        />{" "}
        {!isInView || feedStatus === "loading" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/70 text-xs font-bold admin-text-muted">
            {" "}
            {isInView ? "جاري التحديث..." : "سيُحمّل عند الظهور..."}{" "}
          </div>
        ) : feedStatus === "unavailable" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-950/55 text-xs font-bold ui-text-muted">
            {" "}
            غير متاح مؤقتاً{" "}
          </div>
        ) : null}{" "}
      </div>{" "}
      <p className="site-price-card__status">● {statusLabel}</p>{" "}
    </div>
  );
}
export const TradingViewWidget = memo(
  TradingViewWidgetComponent,
  tradingViewWidgetPropsAreEqual,
);
function tradingViewPricePropsAreEqual(prev, next) {
  return (
    prev.title === next.title &&
    prev.symbol === next.symbol &&
    prev.tvSymbol === next.tvSymbol
  );
}
function TradingViewPriceComponent({ title, symbol, tvSymbol }) {
  return (
    <div className="site-price-card site-price-card--tv">
      {" "}
      <p className="site-price-card__eyebrow">{title}</p>{" "}
      <h3 className="site-price-card__title">{symbol}</h3>{" "}
      <TradingViewWidget symbol={tvSymbol} height="120" />{" "}
    </div>
  );
}
export const TradingViewPrice = memo(
  TradingViewPriceComponent,
  tradingViewPricePropsAreEqual,
);
function marketWindowPropsAreEqual(prev, next) {
  return (
    prev.title === next.title &&
    prev.label === next.label &&
    prev.symbol === next.symbol &&
    prev.widgetHeight === next.widgetHeight
  );
}
function MarketWindowComponent({ title, label, symbol, widgetHeight = "120" }) {
  return (
    <div className="site-price-card site-price-card--tv">
      {" "}
      <p className="site-price-card__eyebrow">{label}</p>{" "}
      <h3 className="site-price-card__title">{title}</h3>{" "}
      <TradingViewWidget symbol={symbol} height={widgetHeight} />{" "}
    </div>
  );
}
export const MarketWindow = memo(
  MarketWindowComponent,
  marketWindowPropsAreEqual,
);
