"use client";

import dynamic from "next/dynamic";

const TradingViewPrice = dynamic(
  () => import("../market/TradingViewWidgets").then((mod) => mod.TradingViewPrice),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-[120px] animate-pulse rounded-2xl border border-slate-800 bg-black/40"
        aria-hidden="true"
      />
    ),
  }
);

const AssetHubChart = dynamic(
  () => import("./AssetHubChart").then((mod) => mod.AssetHubChart),
  {
    ssr: false,
    loading: () => (
      <div
        className="site-live-chart-skeleton min-h-[420px] rounded-2xl border border-slate-800/60 bg-black/20"
        aria-hidden="true"
      />
    ),
  }
);

export function AssetPagePriceWidget({ config }) {
  return (
    <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-8 shadow-2xl backdrop-blur-2xl md:p-10">
      <div className="mb-6 text-center">
        <h2 className="text-3xl font-black text-white md:text-4xl">السعر الحالي</h2>
        <p className="mt-3 text-slate-400">سعر مباشر من TradingView — {config.tradingViewSymbol}</p>
      </div>
      <div className="mx-auto max-w-md">
        <TradingViewPrice
          title={config.name}
          symbol={config.pricePairLabel}
          tvSymbol={config.tradingViewSymbol}
        />
      </div>
    </section>
  );
}

export function AssetPageChartWidget({ config }) {
  return (
    <section className="public-seo-card rounded-[34px] border border-cyan-300/15 bg-white/[0.045] p-6 shadow-2xl backdrop-blur-2xl md:p-8">
      <AssetHubChart
        symbol={config.chartSymbol}
        exchange={config.chartExchange}
        sectionId={`${config.id}-chart`}
        title={`شارت ${config.name}`}
        description={`رسم بياني مباشر من TradingView لـ ${config.pricePairLabel} على ${config.description.platform}.`}
      />
    </section>
  );
}
