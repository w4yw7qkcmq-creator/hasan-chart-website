"use client";
import dynamic from "next/dynamic";
import { memo } from "react";
import { useLazyInView } from "../../hooks/useLazyInView";
const TradingViewPrice = dynamic(
  () => import("./TradingViewWidgets").then((mod) => mod.TradingViewPrice),
  { ssr: false },
);
const LIVE_PRICE_CARDS = [
  { title: "Bitcoin", symbol: "BTC", tvSymbol: "BINANCE:BTCUSDT" },
  { title: "Ethereum", symbol: "ETH", tvSymbol: "BINANCE:ETHUSDT" },
  { title: "Solana", symbol: "SOL", tvSymbol: "BINANCE:SOLUSDT" },
  { title: "Gold Ounce", symbol: "GOLD", tvSymbol: "OANDA:XAUUSD" },
  { title: "Silver Ounce", symbol: "SILVER", tvSymbol: "OANDA:XAGUSD" },
];
function LivePricesSkeleton() {
  return (
    <section id="prices" className="w-full" aria-busy="true" aria-live="polite">
      {" "}
      <h2 className="sectionTitle text-center lg:text-right">
        الأسعار المباشرة
      </h2>{" "}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 w-full">
        {" "}
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="site-home-skeleton-card site-price-card site-price-card--tv"
          />
        ))}{" "}
      </div>{" "}
    </section>
  );
}
function HomeLivePricesSectionComponent() {
  const { ref, isInView } = useLazyInView({ rootMargin: "240px 0px" });
  if (!isInView) {
    return (
      <div ref={ref}>
        {" "}
        <LivePricesSkeleton />{" "}
      </div>
    );
  }
  return (
    <section id="prices" ref={ref} className="w-full">
      {" "}
      <h2 className="sectionTitle text-center lg:text-right">
        الأسعار المباشرة
      </h2>{" "}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 w-full">
        {" "}
        {LIVE_PRICE_CARDS.map((item) => (
          <TradingViewPrice
            key={item.symbol}
            title={item.title}
            symbol={item.symbol}
            tvSymbol={item.tvSymbol}
          />
        ))}{" "}
      </div>{" "}
    </section>
  );
}
export const HomeLivePricesSection = memo(HomeLivePricesSectionComponent);
export { LivePricesSkeleton };
