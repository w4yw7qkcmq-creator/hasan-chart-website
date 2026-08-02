const { SWING_PIVOT_LEFT, SWING_PIVOT_RIGHT } = require("./constants");

function detectSwingPoints(candles, left = SWING_PIVOT_LEFT, right = SWING_PIVOT_RIGHT) {
  const swings = [];
  if (!Array.isArray(candles) || candles.length < left + right + 1) return swings;

  const confirmedUntil = candles.length - right - 1;

  for (let i = left; i <= confirmedUntil; i += 1) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - left; j <= i + right; j += 1) {
      if (j === i) continue;
      if (candles[j].high > current.high) isHigh = false;
      if (candles[j].low < current.low) isLow = false;
    }

    if (isHigh) {
      swings.push({
        type: "high",
        index: i,
        price: current.high,
        time: current.time,
      });
    }

    if (isLow) {
      swings.push({
        type: "low",
        index: i,
        price: current.low,
        time: current.time,
      });
    }
  }

  return swings;
}

function getRecentSwings(swings, type, count = 4) {
  return swings.filter((s) => s.type === type).slice(-count);
}

module.exports = {
  detectSwingPoints,
  getRecentSwings,
};
