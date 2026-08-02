const { BOS_ATR_TOLERANCE } = require("./constants");
const { roundPrice } = require("./utils");
const { getRecentSwings } = require("./swing-points");

function detectBos({ candles, swings, atr, lastClose }) {
  const highs = getRecentSwings(swings, "high", 3);
  const lows = getRecentSwings(swings, "low", 3);
  const lastSwingHigh = highs[highs.length - 1];
  const lastSwingLow = lows[lows.length - 1];
  const tolerance = Math.max(atr * BOS_ATR_TOLERANCE, lastClose * 0.0005);

  const bullish =
    lastSwingHigh &&
    lastClose > lastSwingHigh.price + tolerance &&
    candles[candles.length - 1].close > candles[candles.length - 1].open * 0.999;

  const bearish =
    lastSwingLow &&
    lastClose < lastSwingLow.price - tolerance &&
    candles[candles.length - 1].close < candles[candles.length - 1].open * 1.001;

  if (bullish) {
    return {
      detected: true,
      direction: "bullish",
      level: roundPrice(lastSwingHigh.price),
      confirmedAt: new Date(candles[candles.length - 1].time).toISOString(),
    };
  }

  if (bearish) {
    return {
      detected: true,
      direction: "bearish",
      level: roundPrice(lastSwingLow.price),
      confirmedAt: new Date(candles[candles.length - 1].time).toISOString(),
    };
  }

  return {
    detected: false,
    direction: null,
    level: null,
    confirmedAt: null,
  };
}

function detectChoch({ priorTrend, bos, swings, candles, atr }) {
  if (priorTrend === "neutral" || !bos.detected) {
    return {
      detected: false,
      direction: null,
      level: null,
      confirmedAt: null,
    };
  }

  const last = candles[candles.length - 1];
  const tolerance = Math.max(atr * BOS_ATR_TOLERANCE, last.close * 0.0005);

  if (priorTrend === "bearish" && bos.direction === "bullish" && last.close > (bos.level || 0) + tolerance) {
    return {
      detected: true,
      direction: "bullish",
      level: bos.level,
      confirmedAt: new Date(last.time).toISOString(),
    };
  }

  if (priorTrend === "bullish" && bos.direction === "bearish" && last.close < (bos.level || 0) - tolerance) {
    return {
      detected: true,
      direction: "bearish",
      level: bos.level,
      confirmedAt: new Date(last.time).toISOString(),
    };
  }

  const highs = getRecentSwings(swings, "high", 2);
  const lows = getRecentSwings(swings, "low", 2);

  if (priorTrend === "bearish" && highs.length >= 2 && last.close > highs[highs.length - 2].price + tolerance) {
    return {
      detected: true,
      direction: "bullish",
      level: roundPrice(highs[highs.length - 2].price),
      confirmedAt: new Date(last.time).toISOString(),
    };
  }

  if (priorTrend === "bullish" && lows.length >= 2 && last.close < lows[lows.length - 2].price - tolerance) {
    return {
      detected: true,
      direction: "bearish",
      level: roundPrice(lows[lows.length - 2].price),
      confirmedAt: new Date(last.time).toISOString(),
    };
  }

  return {
    detected: false,
    direction: null,
    level: null,
    confirmedAt: null,
  };
}

function analyzeTimeframeStructure({ candles, swings, atr }) {
  const lastClose = candles[candles.length - 1]?.close;
  const priorTrend =
    swings.filter((s) => s.type === "high").slice(-2).length >= 2 &&
    swings.filter((s) => s.type === "low").slice(-2).length >= 2
      ? swings.filter((s) => s.type === "high").slice(-1)[0]?.price >
        swings.filter((s) => s.type === "high").slice(-2)[0]?.price
        ? "bullish"
        : "bearish"
      : "neutral";

  const bos = detectBos({ candles, swings, atr, lastClose });
  const choch = detectChoch({ priorTrend, bos, swings, candles, atr });

  const swingHighs = getRecentSwings(swings, "high", 1);
  const swingLows = getRecentSwings(swings, "low", 1);

  return {
    bos,
    choch,
    swingHigh: swingHighs[0]?.price ?? null,
    swingLow: swingLows[0]?.price ?? null,
    priorTrend,
  };
}

module.exports = {
  detectBos,
  detectChoch,
  analyzeTimeframeStructure,
};
