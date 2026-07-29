import { WALL_MEDIAN_MULTIPLIER } from "../../constants.js";
import { getDefaultPrecision } from "../../symbols.js";

export const WALL_SAMPLE_INTERVAL_MS = 60_000;
export const WALL_REAPPEAR_GRACE_MS = 5 * 60_000;
export const WALL_MAX_DISTANCE_PERCENT = 2;
export const WALL_MAX_PER_SIDE = 5;

/** @type {Record<string, number>} */
export const SYMBOL_WALL_MIN_NOTIONAL = {
  BTCUSDT: 50_000,
  ETHUSDT: 25_000,
  SOLUSDT: 10_000,
  XRPUSDT: 5_000,
};

export const HISTORY_LIQUIDITY_WALL_WINDOWS = ["1h", "4h", "12h", "1d", "3d", "7d"];

/**
 * @param {number} price
 * @param {number} precision
 */
export function roundWallPrice(price, precision) {
  if (!Number.isFinite(price) || !Number.isFinite(precision) || precision <= 0) {
    return price;
  }
  const factor = 1 / precision;
  return Math.round(price * factor) / factor;
}

/**
 * @param {string} symbol
 * @param {string} exchange
 * @param {"bid"|"ask"} side
 * @param {number} price
 */
export function buildLiquidityWallKey(symbol, exchange, side, price) {
  const precision = getDefaultPrecision(symbol);
  const rounded = roundWallPrice(price, precision);
  return `${symbol}:${exchange}:${side}:${rounded}`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * pct));
  return sorted[index];
}

/**
 * @param {number} price
 * @param {number} midPrice
 * @param {"bid"|"ask"} side
 */
export function computeDistanceFromMid(price, midPrice, side) {
  if (!midPrice || midPrice <= 0 || !Number.isFinite(price)) return 0;
  if (side === "bid") {
    return ((midPrice - price) / midPrice) * 100;
  }
  return ((price - midPrice) / midPrice) * 100;
}

/**
 * @param {{
 *   symbol: string,
 *   bids?: Array<{ price: number, quantity: number, notional?: number, exchanges?: string[] }>,
 *   asks?: Array<{ price: number, quantity: number, notional?: number, exchanges?: string[] }>,
 *   midPrice: number,
 *   maxDistancePercent?: number,
 *   maxPerSide?: number,
 * }} params
 */
export function detectSignificantLiquidityWalls(params) {
  const {
    symbol,
    bids = [],
    asks = [],
    midPrice,
    maxDistancePercent = WALL_MAX_DISTANCE_PERCENT,
    maxPerSide = WALL_MAX_PER_SIDE,
  } = params;

  const minNotional = SYMBOL_WALL_MIN_NOTIONAL[symbol] ?? 25_000;
  /** @type {Array<Record<string, unknown>>} */
  const walls = [];

  for (const side of /** @type {const} */ (["bid", "ask"])) {
    const levels = side === "bid" ? bids : asks;
    const notionals = levels
      .map((level) => level.notional ?? level.price * level.quantity)
      .filter((value) => value > 0);
    const med = median(notionals);
    const p90 = percentile(notionals, 0.9);
    const threshold = Math.max(minNotional, med * WALL_MEDIAN_MULTIPLIER, p90 * 0.75);

    const candidates = [];
    for (const level of levels) {
      const notional = level.notional ?? level.price * level.quantity;
      if (notional < threshold) continue;
      const distanceFromMid = computeDistanceFromMid(level.price, midPrice, side);
      if (distanceFromMid < 0 || distanceFromMid > maxDistancePercent) continue;
      candidates.push({
        side,
        price: level.price,
        size: level.quantity,
        notional,
        distanceFromMid,
      });
    }

    candidates.sort((a, b) => b.notional - a.notional);
    walls.push(...candidates.slice(0, maxPerSide));
  }

  return walls;
}
