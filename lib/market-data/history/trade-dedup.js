import { DEDUP_MAX_ENTRIES, DEDUP_TTL_MS } from "./constants.js";

/**
 * @param {unknown} tradeId
 * @returns {boolean}
 */
function hasTradeId(tradeId) {
  if (tradeId == null) return false;
  const value = String(tradeId).trim();
  return value.length > 0;
}

/**
 * @param {{
 *   exchange: string,
 *   symbol: string,
 *   tradeId?: string|number|null,
 *   ts: number,
 *   price: number,
 *   quantity: number,
 *   side: string,
 * }} trade
 * @returns {string}
 */
export function buildTradeKey(trade) {
  if (hasTradeId(trade.tradeId)) {
    return `${trade.exchange}:${trade.symbol}:${trade.tradeId}`;
  }
  return `${trade.exchange}:${trade.symbol}:${trade.ts}:${trade.price}:${trade.quantity}:${trade.side}`;
}

/**
 * Local in-process trade deduplication (Phase 3A).
 * O(1) average lookup via Map; evicts oldest entries when max size exceeded.
 */
export class TradeDedup {
  /**
   * @param {{ ttlMs?: number, maxEntries?: number }} [options]
   */
  constructor(options = {}) {
    this.ttlMs = options.ttlMs ?? DEDUP_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEDUP_MAX_ENTRIES;
    /** @type {Map<string, number>} */
    this.entries = new Map();
  }

  /**
   * @param {string} key
   * @returns {boolean}
   */
  has(key) {
    return this.entries.has(key);
  }

  /**
   * @param {string} key
   * @param {number} [ts]
   * @returns {boolean}
   */
  add(key, ts) {
    const addedAt = ts ?? Date.now();
    this.entries.set(key, addedAt);
    this.enforceMaxEntries();
    return true;
  }

  /**
   * @param {{
   *   exchange: string,
   *   symbol: string,
   *   tradeId?: string|number|null,
   *   ts: number,
   *   price: number,
   *   quantity: number,
   *   side: string,
   * }} trade
   * @returns {{ duplicate: boolean, key: string }}
   */
  checkAndAdd(trade) {
    const key = buildTradeKey(trade);
    this.prune(trade.ts ?? Date.now());
    if (this.entries.has(key)) {
      return { duplicate: true, key };
    }
    this.add(key, trade.ts);
    return { duplicate: false, key };
  }

  /**
   * @param {number} [now]
   */
  prune(now = Date.now()) {
    for (const [key, addedAt] of this.entries) {
      if (now - addedAt > this.ttlMs) {
        this.entries.delete(key);
      }
    }
  }

  enforceMaxEntries() {
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }

  size() {
    return this.entries.size;
  }

  clear() {
    this.entries.clear();
  }
}
