const { average } = require("./utils");

function computeAtr(candles, period = 14) {
  if (!Array.isArray(candles) || candles.length < period + 1) return 0;

  const trs = [];
  for (let i = 1; i < candles.length; i += 1) {
    const current = candles[i];
    const prev = candles[i - 1];
    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - prev.close),
      Math.abs(current.low - prev.close)
    );
    trs.push(tr);
  }

  return average(trs.slice(-period));
}

function computeEma(values, period) {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i += 1) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function classifyVolatility(atr, price) {
  if (!Number.isFinite(atr) || !Number.isFinite(price) || price <= 0) return "medium";
  const ratio = atr / price;
  if (ratio >= 0.025) return "extreme";
  if (ratio >= 0.015) return "high";
  if (ratio >= 0.006) return "medium";
  return "low";
}

function computeTrendFromStructure({ swings, emaFast, emaSlow, lastClose }) {
  const highs = swings.filter((s) => s.type === "high").slice(-3);
  const lows = swings.filter((s) => s.type === "low").slice(-3);

  const hh = highs.length >= 2 && highs[highs.length - 1].price > highs[highs.length - 2].price;
  const hl = lows.length >= 2 && lows[lows.length - 1].price > lows[lows.length - 2].price;
  const lh = highs.length >= 2 && highs[highs.length - 1].price < highs[highs.length - 2].price;
  const ll = lows.length >= 2 && lows[lows.length - 1].price < lows[lows.length - 2].price;

  if ((hh && hl) || (lastClose > emaFast && emaFast > emaSlow)) return "bullish";
  if ((lh && ll) || (lastClose < emaFast && emaFast < emaSlow)) return "bearish";
  return "neutral";
}

function computeTrendStrength(trend, signalsCount, alignment) {
  let strength = trend === "neutral" ? 3 : 5;
  strength += Math.min(3, signalsCount);
  if (alignment === "aligned") strength += 2;
  if (alignment === "conflicting") strength -= 2;
  return Math.max(0, Math.min(10, strength));
}

function computeMomentum(candles, lookback = 10) {
  if (candles.length < lookback + 1) return 0;
  const start = candles[candles.length - lookback - 1].close;
  const end = candles[candles.length - 1].close;
  if (!start) return 0;
  return ((end - start) / start) * 100;
}

module.exports = {
  computeAtr,
  computeEma,
  classifyVolatility,
  computeTrendFromStructure,
  computeTrendStrength,
  computeMomentum,
};
