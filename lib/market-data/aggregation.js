import {
  DOMINANCE_BUY_THRESHOLD,
  DOMINANCE_SELL_THRESHOLD,
  WALL_MEDIAN_MULTIPLIER,
  WALL_MIN_NOTIONAL_USD,
} from "./constants.js";
import { resolveWallMinNotional } from "./symbol-thresholds.js";

export function bucketPrice(price, precision) {
  const p = Number(precision);
  if (!Number.isFinite(price) || !Number.isFinite(p) || p <= 0) return price;
  return Math.round(price / p) * p;
}

export function aggregateLevels(levels, precision, exchange) {
  /** @type {Map<number, { price: number, quantity: number, notional: number, exchanges: Set<string> }>} */
  const buckets = new Map();

  for (const level of levels || []) {
    const price = Number(level.price);
    const quantity = Number(level.quantity);
    if (!Number.isFinite(price) || !Number.isFinite(quantity) || quantity <= 0) continue;

    const bucket = bucketPrice(price, precision);
    const existing = buckets.get(bucket) || {
      price: bucket,
      quantity: 0,
      notional: 0,
      exchanges: new Set(),
    };

    existing.quantity += quantity;
    existing.notional += price * quantity;
    if (exchange) existing.exchanges.add(exchange);
    if (level.exchanges) {
      for (const ex of level.exchanges) existing.exchanges.add(ex);
    }

    buckets.set(bucket, existing);
  }

  return [...buckets.values()].map((row) => ({
    price: row.price,
    quantity: row.quantity,
    notional: row.notional,
    exchanges: [...row.exchanges],
  }));
}

export function mergeExchangeBooks(books, { precision, side, limit = 50 }) {
  const combined = [];

  for (const book of books) {
    if (!book?.synced) continue;
    const levels = side === "bid" ? book.bids : book.asks;
    for (const level of levels) {
      combined.push({ ...level, exchanges: [book.exchange] });
    }
  }

  const aggregated = aggregateLevels(combined, precision);
  aggregated.sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price));
  return aggregated.slice(0, limit);
}

export function enrichLevelsWithDepth(levels) {
  const maxNotional = Math.max(...levels.map((l) => l.notional || l.price * l.quantity), 0);

  return levels.map((level) => {
    const notional = level.notional ?? level.price * level.quantity;
    return {
      ...level,
      notional,
      depthPercent: maxNotional > 0 ? (notional / maxNotional) * 100 : 0,
    };
  });
}

export function computeSpread(bestBid, bestAsk) {
  if (!bestBid || !bestAsk) {
    return { spread: null, spreadPercent: null, midPrice: null };
  }

  const spread = bestAsk.price - bestBid.price;
  const midPrice = (bestAsk.price + bestBid.price) / 2;
  const spreadPercent = midPrice > 0 ? (spread / midPrice) * 100 : null;

  return { spread, spreadPercent, midPrice };
}

export function computeLiquidityDominance({ bids, asks, midPrice, rangePercent }) {
  if (!midPrice || !Number.isFinite(rangePercent)) {
    return {
      bidNotional: 0,
      askNotional: 0,
      bidPercent: 50,
      askPercent: 50,
      dominance: "متوازن",
    };
  }

  const lower = midPrice * (1 - rangePercent / 100);
  const upper = midPrice * (1 + rangePercent / 100);

  let bidNotional = 0;
  let askNotional = 0;

  for (const level of bids || []) {
    if (level.price >= lower && level.price <= midPrice) {
      bidNotional += level.notional ?? level.price * level.quantity;
    }
  }

  for (const level of asks || []) {
    if (level.price >= midPrice && level.price <= upper) {
      askNotional += level.notional ?? level.price * level.quantity;
    }
  }

  const total = bidNotional + askNotional;
  if (total <= 0) {
    return {
      bidNotional: 0,
      askNotional: 0,
      bidPercent: 50,
      askPercent: 50,
      dominance: "متوازن",
    };
  }

  const bidPercent = (bidNotional / total) * 100;
  const askPercent = (askNotional / total) * 100;

  let dominance = "متوازن";
  if (bidPercent > DOMINANCE_BUY_THRESHOLD) dominance = "غلبة شراء";
  else if (askPercent > 100 - DOMINANCE_SELL_THRESHOLD) dominance = "غلبة بيع";

  return {
    bidNotional,
    askNotional,
    bidPercent,
    askPercent,
    dominance,
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}


export function detectLiquidityWalls({
  bids,
  asks,
  midPrice,
  minNotional = WALL_MIN_NOTIONAL_USD,
  symbol,
  supportedExchangeCount,
}) {
  const bidNotionals = (bids || []).map((l) => l.notional ?? l.price * l.quantity);
  const askNotionals = (asks || []).map((l) => l.notional ?? l.price * l.quantity);
  const bidMedian = median(bidNotionals);
  const askMedian = median(askNotionals);
  const adaptiveFloor = symbol
    ? resolveWallMinNotional(symbol, {
        medianNotional: Math.max(bidMedian, askMedian),
        lastPrice: midPrice,
        supportedExchangeCount,
      })
    : minNotional;
  const bidThreshold = Math.max(adaptiveFloor, bidMedian * WALL_MEDIAN_MULTIPLIER);
  const askThreshold = Math.max(adaptiveFloor, askMedian * WALL_MEDIAN_MULTIPLIER);

  const largestBid = findLargestWall(bids, bidThreshold, midPrice, "bid");
  const largestAsk = findLargestWall(asks, askThreshold, midPrice, "ask");

  return { largestBid, largestAsk };
}

function buildWallLevel(level, notional, midPrice, side) {
  const distancePercent =
    midPrice && midPrice > 0
      ? side === "bid"
        ? ((midPrice - level.price) / midPrice) * 100
        : ((level.price - midPrice) / midPrice) * 100
      : null;

  return {
    price: level.price,
    quantity: level.quantity,
    notional,
    distancePercent,
    exchanges: level.exchanges || [],
  };
}

function findLargestWall(levels, threshold, midPrice, side) {
  let best = null;
  let largest = null;

  for (const level of levels || []) {
    const notional = level.notional ?? level.price * level.quantity;
    if (!Number.isFinite(notional) || notional <= 0) continue;

    if (!largest || notional > largest.notional) {
      largest = buildWallLevel(level, notional, midPrice, side);
    }

    if (notional < threshold) continue;
    if (!best || notional > best.notional) {
      best = buildWallLevel(level, notional, midPrice, side);
    }
  }

  return best || largest;
}

export function buildDepthMapPoints({ bids, asks, midPrice, rangePercent = 2 }) {
  if (!midPrice) return [];

  const lower = midPrice * (1 - rangePercent / 100);
  const upper = midPrice * (1 + rangePercent / 100);
  const points = [];

  for (const level of bids || []) {
    if (level.price < lower || level.price > midPrice) continue;
    points.push({
      price: level.price,
      quantity: level.quantity,
      notional: level.notional ?? level.price * level.quantity,
      side: "bid",
      exchanges: level.exchanges || [],
    });
  }

  for (const level of asks || []) {
    if (level.price < midPrice || level.price > upper) continue;
    points.push({
      price: level.price,
      quantity: level.quantity,
      notional: level.notional ?? level.price * level.quantity,
      side: "ask",
      exchanges: level.exchanges || [],
    });
  }

  return points.sort((a, b) => a.price - b.price);
}
