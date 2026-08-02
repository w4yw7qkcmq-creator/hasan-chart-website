const { roundPrice } = require("./utils");

const DISPLACEMENT_BODY_ATR_RATIO = 0.45;

function hasDisplacement(candles, atr, direction) {
  const last = candles[candles.length - 1];
  const body = Math.abs(last.close - last.open);
  const range = last.high - last.low;
  if (range <= 0) return false;

  const minBody = Math.max(atr * DISPLACEMENT_BODY_ATR_RATIO, last.close * 0.0006);
  const directional =
    direction === "bullish"
      ? last.close > last.open && last.close > candles[candles.length - 2]?.close
      : last.close < last.open && last.close < candles[candles.length - 2]?.close;

  return directional && body >= minBody;
}

function detectOrderBlocks({ candles, bos, direction, atr }) {
  if (!bos?.detected || !direction || direction === "neutral") return [];
  if (!hasDisplacement(candles, atr, direction)) return [];

  const displacementIndex = candles.length - 1;
  let candidate = null;

  for (let i = displacementIndex - 1; i >= Math.max(0, displacementIndex - 12); i -= 1) {
    const c = candles[i];
    const isOpposite = direction === "bullish" ? c.close < c.open : c.close > c.open;
    if (isOpposite) {
      candidate = c;
      break;
    }
  }

  if (!candidate) return [];

  const from = roundPrice(Math.min(candidate.open, candidate.close, candidate.low));
  const to = roundPrice(Math.max(candidate.open, candidate.close, candidate.high));
  const status = classifyOrderBlockStatus(candles, from, to, direction);
  const confirmed = status === "fresh" && bos.detected;

  return [
    {
      direction,
      from,
      to,
      status,
      confirmed,
      score: confirmed ? 0.72 : status === "mitigated" ? 0.45 : 0.15,
      label:
        confirmed
          ? direction === "bullish"
            ? "منطقة Order Block محتملة (طلب)"
            : "منطقة Order Block محتملة (عرض)"
          : "منطقة OB ضعيفة",
    },
  ];
}

function classifyOrderBlockStatus(candles, from, to, direction) {
  const recent = candles.slice(-8);
  for (const c of recent) {
    if (direction === "bullish" && c.low < from) return "invalidated";
    if (direction === "bearish" && c.high > to) return "invalidated";
    if (c.low <= to && c.high >= from) return "mitigated";
  }
  return "fresh";
}

module.exports = {
  detectOrderBlocks,
  hasDisplacement,
  DISPLACEMENT_BODY_ATR_RATIO,
};
