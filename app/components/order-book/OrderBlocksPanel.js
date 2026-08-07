"use client";

import { useMemo } from "react";
import { formatPrice, formatQuantity, formatUsd } from "./formatters";
import { NumericValue } from "./order-book-ui";
import { ob } from "./order-book-theme";
import { computeDepthBarWidthPercent } from "./depth-bar-utils";

export const ORDER_BLOCKS_VISIBLE_ROWS = 12;
/** Desktop-only inner scroll cap; mobile/tablet use natural page flow (< lg). */
export const ORDER_BLOCKS_DESKTOP_SCROLL_MAX = "lg:max-h-[min(70vh,36rem)]";
/** @deprecated use ORDER_BLOCKS_DESKTOP_SCROLL_MAX */
export const ORDER_BLOCKS_MOBILE_SCROLL_MAX = ORDER_BLOCKS_DESKTOP_SCROLL_MAX;

function DepthGlowBar({ side, widthPercent }) {
  const isAsk = side === "ask";
  const width = Math.min(100, Math.max(0, widthPercent || 0));
  if (width <= 0) return null;

  const lightGradient = isAsk
    ? "linear-gradient(to left, rgba(244,63,94,0.22) 0%, rgba(244,63,94,0.14) 42%, rgba(244,63,94,0) 100%)"
    : "linear-gradient(to left, rgba(16,185,129,0.22) 0%, rgba(16,185,129,0.14) 42%, rgba(16,185,129,0) 100%)";
  const darkGradient = isAsk
    ? "linear-gradient(to left, rgba(244,63,94,0.28) 0%, rgba(244,63,94,0.16) 42%, rgba(244,63,94,0) 100%)"
    : "linear-gradient(to left, rgba(16,185,129,0.28) 0%, rgba(16,185,129,0.16) 42%, rgba(16,185,129,0) 100%)";

  return (
    <>
      <div
        className="pointer-events-none absolute inset-y-0 right-0 dark:hidden"
        style={{ width: `${width}%`, background: lightGradient }}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 hidden dark:block"
        style={{ width: `${width}%`, background: darkGradient }}
        aria-hidden="true"
      />
    </>
  );
}

function DepthRow({ level, side, widthPercent }) {
  const isAsk = side === "ask";
  const textColor = isAsk ? ob.negative : ob.positive;

  return (
    <div className={`group relative grid grid-cols-3 gap-2 px-3 py-1 text-sm ${ob.rowHover}`}>
      <DepthGlowBar side={side} widthPercent={widthPercent} />
      <span dir="ltr" className={`relative z-[1] text-left font-medium tabular-nums ${textColor}`}>
        {formatPrice(level.price)}
      </span>
      <span dir="ltr" className={`relative z-[1] text-center tabular-nums ${ob.textNormal}`}>
        {formatQuantity(level.quantity)}
      </span>
      <span dir="ltr" className={`relative z-[1] text-right tabular-nums ${ob.textMuted}`}>
        {formatUsd(level.notional, { compact: true })}
      </span>
    </div>
  );
}

export default function OrderBlocksPanel({
  asks = [],
  bids = [],
  midPrice,
  mobileSide = "all",
}) {
  const showAsks = mobileSide === "all" || mobileSide === "asks";
  const showBids = mobileSide === "all" || mobileSide === "bids";

  const maxAskNotional = useMemo(
    () => Math.max(...asks.map((level) => Number(level.notional) || 0), 0),
    [asks],
  );
  const maxBidNotional = useMemo(
    () => Math.max(...bids.map((level) => Number(level.notional) || 0), 0),
    [bids],
  );

  const visibleAsks = asks.slice(0, ORDER_BLOCKS_VISIBLE_ROWS);
  const visibleBids = bids.slice(0, ORDER_BLOCKS_VISIBLE_ROWS);

  return (
    <div
      className={`ob-order-blocks max-lg:h-auto max-lg:max-h-none max-lg:min-h-0 max-lg:overflow-visible max-lg:overscroll-none flex-none ${ORDER_BLOCKS_DESKTOP_SCROLL_MAX} lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain`}
    >
      {showAsks ? (
        <div data-order-blocks-section="sell">
          {visibleAsks.map((level) => (
            <DepthRow
              key={`ask-${level.price}`}
              level={level}
              side="ask"
              widthPercent={computeDepthBarWidthPercent(level.notional, maxAskNotional)}
            />
          ))}
        </div>
      ) : null}

      <div className={`${ob.midPrice} max-lg:!static lg:sticky top-0`} data-order-blocks-section="mid">
        خط السعر —{" "}
        <NumericValue className={`font-semibold ${ob.textStrong}`}>
          {formatPrice(midPrice)}
        </NumericValue>
      </div>

      {showBids ? (
        <div data-order-blocks-section="buy">
          {visibleBids.map((level) => (
            <DepthRow
              key={`bid-${level.price}`}
              level={level}
              side="bid"
              widthPercent={computeDepthBarWidthPercent(level.notional, maxBidNotional)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
