"use client";
import dynamic from "next/dynamic";
import { memo } from "react";
import { useLazyInView } from "../../hooks/useLazyInView";
const MarketWindow = dynamic(
  () => import("./TradingViewWidgets").then((mod) => mod.MarketWindow),
  { ssr: false },
);
function MarketWindowsSkeleton() {
  return (
    <section
      id="market-windows"
      className="w-full"
      aria-busy="true"
      aria-live="polite"
    >
      {" "}
      <h2 className="sectionTitle text-center lg:text-right">
        نوافذ السوق السريعة
      </h2>{" "}
      <div className="market-windows-grid grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 w-full">
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
function HomeMarketWindowsSectionComponent({ marketWindows, widgetHeight }) {
  const { ref, isInView } = useLazyInView({ rootMargin: "240px 0px" });
  if (!isInView) {
    return (
      <div ref={ref}>
        {" "}
        <MarketWindowsSkeleton />{" "}
      </div>
    );
  }
  return (
    <section id="market-windows" ref={ref} className="w-full">
      {" "}
      <h2 className="sectionTitle text-center lg:text-right">
        نوافذ السوق السريعة
      </h2>{" "}
      <div className="market-windows-grid grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 w-full">
        {" "}
        {marketWindows.map((item) => (
          <MarketWindow
            key={item.title}
            title={item.title}
            label={item.label}
            symbol={item.symbol}
            widgetHeight={widgetHeight}
          />
        ))}{" "}
      </div>{" "}
    </section>
  );
}
export const HomeMarketWindowsSection = memo(HomeMarketWindowsSectionComponent);
export { MarketWindowsSkeleton };
