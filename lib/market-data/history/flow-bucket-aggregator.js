import {
  AGGREGATED_SCOPE,
  BUCKET_MS,
  BUCKET_SECONDS,
  LARGE_TRADE_BANDS,
  LATE_TRADE_GRACE_MS,
} from "./constants.js";
import { TradeDedup, buildTradeKey } from "./trade-dedup.js";
import { EXCHANGE_IDS, SITE_SYMBOLS } from "../symbols.js";
import { floorToMinute } from "./window-utils.js";

/** @typedef {"okx"|"binance"|"bybit"} ExchangeId */
/** @typedef {"aggregated"|ExchangeId} ExchangeScope */

/**
 * @returns {import("./flow-bucket-aggregator.js").FlowBucketState}
 */
function createEmptyBucketState() {
  return {
    buyNotional: 0,
    sellNotional: 0,
    buyCount: 0,
    sellCount: 0,
    maxTradeNotional: 0,
    large25kCount: 0,
    large50kCount: 0,
    large100kCount: 0,
    large250kCount: 0,
    large500kCount: 0,
    large1mCount: 0,
  };
}

/**
 * @param {number} notional
 * @param {import("./flow-bucket-aggregator.js").FlowBucketState} bucket
 */
function applyLargeTradeBands(notional, bucket) {
  if (notional >= 25_000) bucket.large25kCount += 1;
  if (notional >= 50_000) bucket.large50kCount += 1;
  if (notional >= 100_000) bucket.large100kCount += 1;
  if (notional >= 250_000) bucket.large250kCount += 1;
  if (notional >= 500_000) bucket.large500kCount += 1;
  if (notional >= 1_000_000) bucket.large1mCount += 1;
}

/**
 * @param {string} symbol
 * @param {ExchangeScope} exchangeScope
 * @param {number} bucketStart
 * @returns {string}
 */
function bucketKey(symbol, exchangeScope, bucketStart) {
  return `${symbol}:${exchangeScope}:${bucketStart}`;
}

/**
 * @param {string} key
 * @returns {{ symbol: string, exchangeScope: string, bucketStart: number }}
 */
function parseBucketKey(key) {
  const parts = key.split(":");
  const bucketStart = Number(parts.pop());
  const exchangeScope = parts.pop();
  const symbol = parts.join(":");
  return { symbol, exchangeScope, bucketStart };
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isPositiveFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * @param {unknown} value
 * @returns {value is number}
 */
function isFiniteTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * @param {string} symbol
 * @returns {boolean}
 */
function isValidSymbol(symbol) {
  return typeof symbol === "string" && SITE_SYMBOLS.includes(symbol);
}

/**
 * @param {number} tradeTs
 * @param {number} now
 * @returns {{ accepted: boolean, lateAccepted: boolean, lateDropped: boolean }}
 */
export function classifyLateTrade(tradeTs, now) {
  const bucketStart = floorToMinute(tradeTs);
  const currentBucket = floorToMinute(now);
  const previousBucket = currentBucket - BUCKET_MS;

  if (bucketStart >= previousBucket && bucketStart <= currentBucket) {
    return { accepted: true, lateAccepted: false, lateDropped: false };
  }

  if (now - tradeTs <= LATE_TRADE_GRACE_MS) {
    return { accepted: true, lateAccepted: true, lateDropped: false };
  }

  return { accepted: false, lateAccepted: false, lateDropped: true };
}

/**
 * @param {Record<string, unknown>} trade
 * @returns {{ ok: true, trade: NormalizedTrade } | { ok: false, reason: string }}
 */
export function validateTradeInput(trade) {
  if (!trade || typeof trade !== "object") {
    return { ok: false, reason: "invalid_trade" };
  }

  const exchange = trade.exchange;
  if (typeof exchange !== "string" || !EXCHANGE_IDS.includes(exchange)) {
    return { ok: false, reason: "invalid_exchange" };
  }

  const symbol = trade.symbol;
  if (!isValidSymbol(symbol)) {
    return { ok: false, reason: "invalid_symbol" };
  }

  if (!isFiniteTimestamp(trade.ts)) {
    return { ok: false, reason: "invalid_timestamp" };
  }

  const side = trade.side;
  if (side !== "buy" && side !== "sell") {
    return { ok: false, reason: "invalid_side" };
  }

  if (!isPositiveFiniteNumber(trade.price)) {
    return { ok: false, reason: "invalid_price" };
  }

  if (!isPositiveFiniteNumber(trade.quantity)) {
    return { ok: false, reason: "invalid_quantity" };
  }

  let notional = trade.notional;
  if (notional == null) {
    notional = trade.price * trade.quantity;
  }
  if (!isPositiveFiniteNumber(notional)) {
    return { ok: false, reason: "invalid_notional" };
  }

  /** @type {NormalizedTrade} */
  const normalized = {
    exchange,
    symbol,
    tradeId: trade.tradeId ?? null,
    ts: trade.ts,
    side,
    price: trade.price,
    quantity: trade.quantity,
    notional,
  };

  return { ok: true, trade: normalized };
}

/**
 * @typedef {Object} NormalizedTrade
 * @property {ExchangeId} exchange
 * @property {string} symbol
 * @property {string|number|null} tradeId
 * @property {number} ts
 * @property {"buy"|"sell"} side
 * @property {number} price
 * @property {number} quantity
 * @property {number} notional
 */

/**
 * @typedef {ReturnType<typeof createEmptyBucketState>} FlowBucketState
 */

/**
 * @typedef {FlowBucketState & {
 *   symbol: string,
 *   exchangeScope: ExchangeScope,
 *   bucketStart: number,
 *   bucketSeconds: number,
 * }} FlowBucketSnapshot
 */

export class FlowBucketAggregator {
  /**
   * @param {{ dedup?: TradeDedup, now?: () => number }} [options]
   */
  constructor(options = {}) {
    this.dedup = options.dedup ?? new TradeDedup();
    this.nowFn = options.now ?? (() => Date.now());
    /** @type {Map<string, FlowBucketState>} */
    this.buckets = new Map();
    this.stats = {
      accepted: 0,
      duplicate: 0,
      invalid: 0,
      lateAccepted: 0,
      lateDropped: 0,
    };
  }

  resetStats() {
    this.stats = {
      accepted: 0,
      duplicate: 0,
      invalid: 0,
      lateAccepted: 0,
      lateDropped: 0,
    };
  }

  /**
   * @param {Record<string, unknown>} trade
   * @param {{ now?: number }} [options]
   * @returns {{
   *   ok: boolean,
   *   reason?: string,
   *   duplicate?: boolean,
   *   lateAccepted?: boolean,
   *   tradeKey?: string,
   * }}
   */
  addTrade(trade, options = {}) {
    const now = options.now ?? this.nowFn();
    const validated = validateTradeInput(trade);
    if (!validated.ok) {
      this.stats.invalid += 1;
      return { ok: false, reason: validated.reason };
    }

    const normalized = validated.trade;
    const late = classifyLateTrade(normalized.ts, now);
    if (!late.accepted) {
      this.stats.lateDropped += 1;
      return { ok: false, reason: "late_dropped" };
    }

    const dedupResult = this.dedup.checkAndAdd(normalized);
    if (dedupResult.duplicate) {
      this.stats.duplicate += 1;
      return { ok: false, reason: "duplicate", duplicate: true, tradeKey: dedupResult.key };
    }

    const bucketStart = floorToMinute(normalized.ts);
    this.applyTradeToScope(normalized, normalized.exchange, bucketStart);
    this.applyTradeToScope(normalized, AGGREGATED_SCOPE, bucketStart);

    this.stats.accepted += 1;
    if (late.lateAccepted) {
      this.stats.lateAccepted += 1;
    }

    return {
      ok: true,
      lateAccepted: late.lateAccepted,
      tradeKey: dedupResult.key,
    };
  }

  /**
   * @param {NormalizedTrade} trade
   * @param {ExchangeScope} exchangeScope
   * @param {number} bucketStart
   */
  applyTradeToScope(trade, exchangeScope, bucketStart) {
    const key = bucketKey(trade.symbol, exchangeScope, bucketStart);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = createEmptyBucketState();
      this.buckets.set(key, bucket);
    }

    if (trade.side === "buy") {
      bucket.buyNotional += trade.notional;
      bucket.buyCount += 1;
    } else {
      bucket.sellNotional += trade.notional;
      bucket.sellCount += 1;
    }

    if (trade.notional > bucket.maxTradeNotional) {
      bucket.maxTradeNotional = trade.notional;
    }

    applyLargeTradeBands(trade.notional, bucket);
  }

  /**
   * @param {string} symbol
   * @param {ExchangeScope} exchangeScope
   * @param {number} bucketStart
   * @returns {FlowBucketSnapshot|null}
   */
  getBucket(symbol, exchangeScope, bucketStart) {
    const key = bucketKey(symbol, exchangeScope, bucketStart);
    const bucket = this.buckets.get(key);
    if (!bucket) return null;
    return this.toSnapshot(symbol, exchangeScope, bucketStart, bucket);
  }

  /**
   * @returns {FlowBucketSnapshot[]}
   */
  getBuckets() {
    const snapshots = [];
    for (const [key, bucket] of this.buckets) {
      const { symbol, exchangeScope, bucketStart } = parseBucketKey(key);
      snapshots.push(this.toSnapshot(symbol, exchangeScope, bucketStart, bucket));
    }
    return snapshots.sort((a, b) => a.bucketStart - b.bucketStart);
  }

  /**
   * @param {number} [now]
   * @returns {FlowBucketSnapshot[]}
   */
  drainReadyBuckets(now = this.nowFn()) {
    const currentBucket = floorToMinute(now);
    const ready = [];

    for (const [key, bucket] of this.buckets) {
      const { symbol, exchangeScope, bucketStart } = parseBucketKey(key);
      if (bucketStart >= currentBucket) continue;
      if (now < bucketStart + BUCKET_MS + LATE_TRADE_GRACE_MS) continue;

      ready.push(this.toSnapshot(symbol, exchangeScope, bucketStart, bucket));
      this.buckets.delete(key);
    }

    return ready.sort((a, b) => a.bucketStart - b.bucketStart);
  }

  /**
   * @returns {FlowBucketSnapshot[]}
   */
  snapshot() {
    return this.getBuckets();
  }

  clear() {
    this.buckets.clear();
    this.dedup.clear();
    this.resetStats();
  }

  /**
   * @param {string} symbol
   * @param {ExchangeScope} exchangeScope
   * @param {number} bucketStart
   * @param {FlowBucketState} bucket
   * @returns {FlowBucketSnapshot}
   */
  toSnapshot(symbol, exchangeScope, bucketStart, bucket) {
    return {
      symbol,
      exchangeScope,
      bucketStart,
      bucketSeconds: BUCKET_SECONDS,
      buyNotional: bucket.buyNotional,
      sellNotional: bucket.sellNotional,
      buyCount: bucket.buyCount,
      sellCount: bucket.sellCount,
      maxTradeNotional: bucket.maxTradeNotional,
      large25kCount: bucket.large25kCount,
      large50kCount: bucket.large50kCount,
      large100kCount: bucket.large100kCount,
      large250kCount: bucket.large250kCount,
      large500kCount: bucket.large500kCount,
      large1mCount: bucket.large1mCount,
    };
  }
}

export { buildTradeKey, LARGE_TRADE_BANDS };
