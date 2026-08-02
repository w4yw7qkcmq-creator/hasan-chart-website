const { FVG_MIN_ATR_RATIO } = require("./constants");
const { roundPrice } = require("./utils");

const MAX_ACTIVE_FVG = 3;

function detectFairValueGaps(candles, atr) {
  const gaps = [];
  const minGap = Math.max(atr * FVG_MIN_ATR_RATIO, candles[candles.length - 1]?.close * 0.0008 || 0);

  for (let i = 2; i < candles.length; i += 1) {
    const c0 = candles[i - 2];
    const c2 = candles[i];

    const bullishGapLow = c0.high;
    const bullishGapHigh = c2.low;
    if (bullishGapHigh > bullishGapLow && bullishGapHigh - bullishGapLow >= minGap) {
      gaps.push({
        direction: "bullish",
        from: roundPrice(bullishGapLow),
        to: roundPrice(bullishGapHigh),
        status: classifyFvgStatus(candles.slice(i), bullishGapLow, bullishGapHigh, "bullish"),
        index: i,
      });
    }

    const bearishGapHigh = c0.low;
    const bearishGapLow = c2.high;
    if (bearishGapHigh > bearishGapLow && bearishGapHigh - bearishGapLow >= minGap) {
      gaps.push({
        direction: "bearish",
        from: roundPrice(bearishGapLow),
        to: roundPrice(bearishGapHigh),
        status: classifyFvgStatus(candles.slice(i), bearishGapLow, bearishGapHigh, "bearish"),
        index: i,
      });
    }
  }

  return gaps.slice(-12);
}

function classifyFvgStatus(futureCandles, from, to, direction) {
  for (const candle of futureCandles) {
    if (direction === "bullish" && candle.low <= from) return "filled";
    if (direction === "bearish" && candle.high >= to) return "filled";
    if (direction === "bullish" && candle.low <= to && candle.low > from) return "partially_filled";
    if (direction === "bearish" && candle.high >= from && candle.high < to) return "partially_filled";
  }
  return "active";
}

function selectDisplayFairValueGaps(gaps, currentPrice) {
  return gaps
    .filter((g) => g.status === "active" || g.status === "partially_filled")
    .map((g) => ({
      ...g,
      distance: Math.abs(((g.from + g.to) / 2) - currentPrice),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_ACTIVE_FVG)
    .map(({ distance, ...rest }) => rest);
}

module.exports = {
  detectFairValueGaps,
  selectDisplayFairValueGaps,
  MAX_ACTIVE_FVG,
};
