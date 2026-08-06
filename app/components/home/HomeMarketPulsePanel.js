"use client";
import { memo, useMemo } from "react";
import { MiniTicker } from "../market/MiniTicker";
import { useClientMounted } from "../../hooks/useClientMounted";
import {
  DEFAULT_MARKET_PRICES,
  hasKnownMarketPrice,
  useMarketPulseStream,
} from "../../hooks/useMarketPulseStream";
const PULSE_SYMBOLS = [
  { symbol: "BTC", key: "BTCUSDT" },
  { symbol: "ETH", key: "ETHUSDT" },
  { symbol: "SOL", key: "SOLUSDT" },
];
function HomeMarketPulsePanelComponent() {
  const mounted = useClientMounted();
  const { prices, liveFeedStatus } = useMarketPulseStream();
  const pulsePrices = mounted ? prices : DEFAULT_MARKET_PRICES;
  const pulseFeedStatus = mounted ? liveFeedStatus : "connecting";
  const pulseBadge = useMemo(() => {
    if (!mounted) {
      return "جاري التحديث...";
    }
    if (liveFeedStatus === "live") {
      return "OKX Live";
    }
    if (hasKnownMarketPrice(prices)) {
      return "آخر سعر معروف";
    }
    if (liveFeedStatus === "offline") {
      return "غير متاح مؤقتاً";
    }
    return "جاري التحديث...";
  }, [mounted, liveFeedStatus, prices]);
  return (
    <div className="site-market-pulse-panel">
      {" "}
      <div className="site-market-pulse-header flex items-center justify-between gap-3 mb-5">
        {" "}
        <div>
          {" "}
          <p className="site-price-card__eyebrow">Market Pulse</p>{" "}
          <h3 className="site-price-card__title mb-0">BTC / ETH / SOL</h3>{" "}
        </div>{" "}
        <span className="site-market-pulse-badge">{pulseBadge}</span>{" "}
      </div>{" "}
      <div className="space-y-3">
        {" "}
        {PULSE_SYMBOLS.map((item) => (
          <MiniTicker
            key={item.key}
            symbol={item.symbol}
            price={pulsePrices[item.key]}
            feedStatus={pulseFeedStatus}
          />
        ))}{" "}
      </div>{" "}
    </div>
  );
}
export const HomeMarketPulsePanel = memo(HomeMarketPulsePanelComponent);
