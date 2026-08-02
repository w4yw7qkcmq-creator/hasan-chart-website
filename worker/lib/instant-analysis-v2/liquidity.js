const { EQUAL_LEVEL_ATR_TOLERANCE } = require("./constants");
const { roundPrice, percentDistance, uniqueByKey } = require("./utils");
const { getRecentSwings } = require("./swing-points");

function findEqualLevels(swings, type, atr, toleranceRatio = EQUAL_LEVEL_ATR_TOLERANCE) {
  const levels = swings.filter((s) => s.type === type).slice(-6);
  const groups = [];
  const tolerance = Math.max(atr * toleranceRatio, levels[0]?.price * 0.0004 || 0);

  for (const level of levels) {
    let matched = false;
    for (const group of groups) {
      if (Math.abs(group.price - level.price) <= tolerance) {
        group.prices.push(level.price);
        group.count += 1;
        group.price = group.prices.reduce((a, b) => a + b, 0) / group.prices.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      groups.push({ price: level.price, prices: [level.price], count: 1, type });
    }
  }

  return groups
    .filter((g) => g.count >= 2)
    .map((g) => ({
      type,
      price: roundPrice(g.price),
      touchCount: g.count,
      label: type === "high" ? "Equal Highs" : "Equal Lows",
    }));
}

function detectLiquiditySweeps({ candles, buySide, sellSide, atr }) {
  const sweeps = [];
  const last = candles[candles.length - 1];
  const tolerance = Math.max(atr * 0.05, last.close * 0.0003);

  for (const pool of buySide) {
    if (last.high > pool.price + tolerance && last.close < pool.price) {
      sweeps.push({
        side: "buy-side",
        price: pool.price,
        type: "sweep",
        direction: "bearish",
        label: "Buy-side liquidity sweep",
        time: new Date(last.time).toISOString(),
      });
    }
  }

  for (const pool of sellSide) {
    if (last.low < pool.price - tolerance && last.close > pool.price) {
      sweeps.push({
        side: "sell-side",
        price: pool.price,
        type: "sweep",
        direction: "bullish",
        label: "Sell-side liquidity sweep",
        time: new Date(last.time).toISOString(),
      });
    }
  }

  return sweeps;
}

function analyzeLiquidity({ candles, swings, atr, currentPrice }) {
  const buySideLiquidity = findEqualLevels(swings, "high", atr);
  const sellSideLiquidity = findEqualLevels(swings, "low", atr);
  const sweeps = detectLiquiditySweeps({ candles, buySide: buySideLiquidity, sellSide: sellSideLiquidity, atr });

  const candidates = [
    ...buySideLiquidity.map((l) => ({ ...l, side: "buy-side" })),
    ...sellSideLiquidity.map((l) => ({ ...l, side: "sell-side" })),
  ]
    .filter((l) => Number.isFinite(l.price))
    .map((l) => ({
      ...l,
      distancePercent: percentDistance(currentPrice, l.price),
    }))
    .sort((a, b) => Math.abs(a.distancePercent) - Math.abs(b.distancePercent));

  const nearestLiquidity = candidates[0]
    ? {
        type: candidates[0].label,
        side: candidates[0].side,
        price: candidates[0].price,
        distancePercent: roundPrice(candidates[0].distancePercent, 4),
      }
    : null;

  return {
    sweeps,
    buySideLiquidity,
    sellSideLiquidity,
    nearestLiquidity,
  };
}

module.exports = {
  findEqualLevels,
  detectLiquiditySweeps,
  analyzeLiquidity,
};
