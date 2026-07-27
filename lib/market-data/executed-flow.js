import { MAX_LARGE_TRADES_BUFFER } from "./constants.js";

const FLOW_WINDOW_MS = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
};

export class ExecutedFlowTracker {
  constructor() {
    /** @type {Array<{ ts: number, side: 'buy'|'sell', notional: number, exchange: string, symbol: string, price: number, quantity: number }>} */
    this.trades = [];
    /** @type {Array<object>} */
    this.largeTrades = [];
  }

  addTrade(trade) {
    const notional = trade.price * trade.quantity;
    if (!Number.isFinite(notional) || notional <= 0) return;

    const entry = {
      ts: trade.ts || Date.now(),
      side: trade.side,
      notional,
      exchange: trade.exchange,
      symbol: trade.symbol,
      price: trade.price,
      quantity: trade.quantity,
    };

    this.trades.push(entry);
    this.prune(Date.now());
    return entry;
  }

  addLargeTrade(trade, threshold) {
    const entry = this.addTrade(trade);
    if (!entry || entry.notional < threshold) return null;

    const largeEntry = {
      ...entry,
      id: `${entry.exchange}-${entry.ts}-${entry.price}-${entry.quantity}`,
    };

    this.largeTrades.unshift(largeEntry);
    if (this.largeTrades.length > MAX_LARGE_TRADES_BUFFER) {
      this.largeTrades.length = MAX_LARGE_TRADES_BUFFER;
    }

    return largeEntry;
  }

  prune(now = Date.now()) {
    const maxWindow = FLOW_WINDOW_MS["1h"];
    const cutoff = now - maxWindow;
    this.trades = this.trades.filter((t) => t.ts >= cutoff);
  }

  computeFlow(window = "5m") {
    const windowMs = FLOW_WINDOW_MS[window] || FLOW_WINDOW_MS["5m"];
    const cutoff = Date.now() - windowMs;
    const relevant = this.trades.filter((t) => t.ts >= cutoff);

    let buyNotional = 0;
    let sellNotional = 0;

    for (const trade of relevant) {
      if (trade.side === "buy") buyNotional += trade.notional;
      else sellNotional += trade.notional;
    }

    const total = buyNotional + sellNotional;
    const netNotional = buyNotional - sellNotional;

    return {
      buyNotional,
      sellNotional,
      netNotional,
      buyPercent: total > 0 ? (buyNotional / total) * 100 : 50,
      sellPercent: total > 0 ? (sellNotional / total) * 100 : 50,
      window,
      tradeCount: relevant.length,
    };
  }

  getRecentTrades(limit = 50) {
    return [...this.trades].sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  getLargeTrades(threshold, limit = 50) {
    return [...this.trades]
      .filter((t) => t.notional >= threshold)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit);
  }
}

export function classifyOkxTrade(side) {
  const normalized = String(side || "").toLowerCase();
  return normalized === "buy" ? "buy" : "sell";
}

export function classifyBinanceTrade(isBuyerMaker) {
  // m=true => buyer is maker => taker is seller
  return isBuyerMaker ? "sell" : "buy";
}

export function classifyBybitTrade(side) {
  const normalized = String(side || "").toLowerCase();
  return normalized === "buy" ? "buy" : "sell";
}

export function sideLabelAr(side) {
  return side === "buy" ? "شراء منفذ" : "بيع منفذ";
}
