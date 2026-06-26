"use client";

import { memo } from "react";

function MiniTickerComponent({ symbol, price, feedStatus = "connecting" }) {
  const hasPrice = price && price !== "0";

  let displayPrice = "جاري التحديث...";
  if (hasPrice) {
    displayPrice = `$${price}`;
  } else if (feedStatus === "offline" || feedStatus === "retrying") {
    displayPrice = "غير متاح مؤقتاً";
  }

  return (
    <div className="site-price-card site-price-card--pulse">
      <span className="site-price-card__title mb-0 text-base">{symbol}</span>
      <span className="site-price-card__value text-base">{displayPrice}</span>
    </div>
  );
}

export const MiniTicker = memo(MiniTickerComponent);
