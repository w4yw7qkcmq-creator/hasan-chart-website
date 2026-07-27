export function parseLevelPrice(value) {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function parseLevelQuantity(value) {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : null;
}

export class LocalOrderBook {
  constructor() {
    /** @type {Map<number, number>} */
    this.bids = new Map();
    /** @type {Map<number, number>} */
    this.asks = new Map();
    this.synced = false;
    this.updateId = null;
    this.prevUpdateId = null;
    this.lastPrice = null;
    this.updatedAt = 0;
  }

  reset() {
    this.bids.clear();
    this.asks.clear();
    this.synced = false;
    this.updateId = null;
    this.prevUpdateId = null;
    this.updatedAt = 0;
  }

  applySnapshot({ bids = [], asks = [], updateId = null, lastPrice = null }) {
    this.bids.clear();
    this.asks.clear();

    for (const level of bids) {
      this.setSideLevel("bid", level.price, level.quantity);
    }

    for (const level of asks) {
      this.setSideLevel("ask", level.price, level.quantity);
    }

    this.updateId = updateId;
    this.prevUpdateId = updateId;
    this.synced = true;
    this.updatedAt = Date.now();

    if (lastPrice != null) {
      const parsed = parseLevelPrice(lastPrice);
      if (parsed) this.lastPrice = parsed;
    }
  }

  setSideLevel(side, priceRaw, quantityRaw) {
    const price = parseLevelPrice(priceRaw);
    const quantity = parseLevelQuantity(quantityRaw);
    if (price == null || quantity == null) return;

    const book = side === "bid" ? this.bids : this.asks;
    if (quantity === 0) {
      book.delete(price);
      return;
    }

    book.set(price, quantity);
  }

  applyDelta({ bids = [], asks = [], updateId = null, prevUpdateId = null }) {
    if (!this.synced) return { ok: false, reason: "not_synced" };

    if (prevUpdateId != null && this.updateId != null && prevUpdateId !== this.updateId) {
      return { ok: false, reason: "sequence_gap", expected: this.updateId, got: prevUpdateId };
    }

    if (updateId != null && this.updateId != null && updateId <= this.updateId) {
      return { ok: true, reason: "duplicate" };
    }

    for (const level of bids) {
      this.setSideLevel("bid", level.price, level.quantity);
    }

    for (const level of asks) {
      this.setSideLevel("ask", level.price, level.quantity);
    }

    if (updateId != null) {
      this.prevUpdateId = this.updateId;
      this.updateId = updateId;
    }

    this.updatedAt = Date.now();
    return { ok: true, reason: "applied" };
  }

  getSortedBids(limit = 50) {
    return [...this.bids.entries()]
      .sort((a, b) => b[0] - a[0])
      .slice(0, limit)
      .map(([price, quantity]) => ({ price, quantity }));
  }

  getSortedAsks(limit = 50) {
    return [...this.asks.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, limit)
      .map(([price, quantity]) => ({ price, quantity }));
  }

  getBestBid() {
    const bids = this.getSortedBids(1);
    return bids[0] || null;
  }

  getBestAsk() {
    const asks = this.getSortedAsks(1);
    return asks[0] || null;
  }

  getMidPrice() {
    const bestBid = this.getBestBid();
    const bestAsk = this.getBestAsk();
    if (!bestBid || !bestAsk) return this.lastPrice;
    return (bestBid.price + bestAsk.price) / 2;
  }

  cloneLevels() {
    return {
      bids: this.getSortedBids(MAX_EXPORT_LEVELS),
      asks: this.getSortedAsks(MAX_EXPORT_LEVELS),
      updateId: this.updateId,
      synced: this.synced,
      updatedAt: this.updatedAt,
      lastPrice: this.lastPrice,
    };
  }
}

const MAX_EXPORT_LEVELS = 400;

export function levelsFromRawArray(rows, side = "bid") {
  const levels = [];

  for (const row of rows || []) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const price = parseLevelPrice(row[0]);
    const quantity = parseLevelQuantity(row[1]);
    if (price == null || quantity == null) continue;
    levels.push({ price, quantity, side });
  }

  return levels;
}

export function levelsFromObjectRows(rows, side = "bid") {
  const levels = [];

  for (const row of rows || []) {
    const price = parseLevelPrice(row?.price ?? row?.[0]);
    const quantity = parseLevelQuantity(row?.size ?? row?.qty ?? row?.quantity ?? row?.[1]);
    if (price == null || quantity == null) continue;
    levels.push({ price, quantity, side });
  }

  return levels;
}
