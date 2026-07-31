import { CORE_SYMBOLS } from "./dynamic-symbol-constants.js";

const CORE_WALL_MIN_NOTIONAL = {
  BTCUSDT: 50_000,
  ETHUSDT: 25_000,
  SOLUSDT: 10_000,
  XRPUSDT: 5_000,
};

const LIQUIDITY_TIER_FLOOR = {
  high: 25_000,
  medium: 10_000,
  low: 2_500,
};

/**
 * Classify symbol liquidity tier from approximate price (optional) and exchange count.
 * @param {string} symbol
 * @param {{ lastPrice?: number|null, supportedExchangeCount?: number }} [context]
 */
export function classifyLiquidityTier(symbol, context = {}) {
  if (CORE_SYMBOLS.includes(symbol)) {
    if (symbol === "BTCUSDT" || symbol === "ETHUSDT") return "high";
    return "medium";
  }

  const price = context.lastPrice;
  const exchanges = context.supportedExchangeCount ?? 2;

  if (exchanges >= 3 && price != null && price >= 100) return "high";
  if (exchanges >= 2 && price != null && price >= 1) return "medium";
  return "low";
}

/**
 * Adaptive wall detection floor for a symbol.
 * @param {string} symbol
 * @param {{ medianNotional?: number, lastPrice?: number|null, supportedExchangeCount?: number }} [context]
 */
export function resolveWallMinNotional(symbol, context = {}) {
  if (CORE_WALL_MIN_NOTIONAL[symbol]) {
    return CORE_WALL_MIN_NOTIONAL[symbol];
  }

  const tier = classifyLiquidityTier(symbol, context);
  const floor = LIQUIDITY_TIER_FLOOR[tier];
  const median = context.medianNotional;

  if (Number.isFinite(median) && median > 0) {
    const adaptive = Math.max(median * 3, floor * 0.75);
    const percentile = median * 5;
    return Math.max(adaptive, percentile, floor);
  }

  return floor;
}

/**
 * Default order-book price precision from last price magnitude.
 * @param {number|null|undefined} lastPrice
 */
export function resolveDefaultPrecision(lastPrice) {
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) return 0.01;
  if (lastPrice >= 10_000) return 1;
  if (lastPrice >= 1_000) return 0.1;
  if (lastPrice >= 100) return 0.01;
  if (lastPrice >= 1) return 0.001;
  if (lastPrice >= 0.01) return 0.0001;
  return 0.00001;
}
