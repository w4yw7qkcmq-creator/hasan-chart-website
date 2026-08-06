"use client";
import { memo } from "react";
function miniTickerPropsAreEqual(prev, next) {
  return (
    prev.symbol === next.symbol &&
    prev.price === next.price &&
    prev.feedStatus === next.feedStatus
  );
}
function MiniTickerComponent({ symbol, price, feedStatus = "connecting" }) {
  const normalized = price == null || price === "" ? "0" : String(price);
  const hasPrice = normalized !== "0";
  let displayPrice = "جاري التحديث...";
  if (hasPrice) {
    displayPrice = `$${normalized}`;
  } else if (feedStatus === "offline" || feedStatus === "retrying") {
    displayPrice = "غير متاح مؤقتاً";
  }
  return (
    <div className="site-price-card site-price-card--pulse">
      {" "}
      <span className="site-price-card__title mb-0 text-base">
        {symbol}
      </span>{" "}
      <span className="site-price-card__value text-base">
        {displayPrice}
      </span>{" "}
    </div>
  );
}
export const MiniTicker = memo(MiniTickerComponent, miniTickerPropsAreEqual);
