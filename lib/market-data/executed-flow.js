const FLOW_WINDOW_MS = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
};

export function classifyDominanceStrength(strength) {
  const value = Number(strength);
  if (!Number.isFinite(value) || value < 10) return "متوازن";
  if (value < 25) return "غلبة ضعيفة";
  if (value < 45) return "غلبة متوسطة";
  if (value < 65) return "غلبة قوية";
  return "غلبة شديدة";
}

export function dominantSideLabelAr(side) {
  if (side === "buyers") return "المشترون";
  if (side === "sellers") return "البائعون";
  return "متوازن";
}

export class ExecutedFlowTracker {
  constructor() {
    /** @type {Array<{ ts: number, side: 'buy'|'sell', notional: number, exchange: string, symbol: string, price: number, quantity: number }>} */
    this.trades = [];
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
    const dominanceStrength = total > 0 ? (Math.abs(netNotional) / total) * 100 : 0;

    let dominantSide = "balanced";
    if (buyNotional > sellNotional) dominantSide = "buyers";
    else if (sellNotional > buyNotional) dominantSide = "sellers";

    const dominanceLabel = classifyDominanceStrength(dominanceStrength);

    return {
      buyNotional,
      sellNotional,
      totalNotional: total,
      netNotional,
      buyPercent: total > 0 ? (buyNotional / total) * 100 : 50,
      sellPercent: total > 0 ? (sellNotional / total) * 100 : 50,
      window,
      tradeCount: relevant.length,
      dominanceStrength,
      dominantSide,
      dominanceClassification: dominanceLabel,
      dominanceLabel,
      dominantSideLabel: dominantSideLabelAr(dominantSide),
    };
  }

  getRecentTrades(limit = 50) {
    return [...this.trades].sort((a, b) => b.ts - a.ts).slice(0, limit);
  }

  getLargeTrades(threshold, window = "15m", limit = 50) {
    const windowMs = FLOW_WINDOW_MS[window] || FLOW_WINDOW_MS["15m"];
    const cutoff = Date.now() - windowMs;
    const inWindow = this.trades.filter((t) => t.ts >= cutoff);
    const aboveThreshold = inWindow.filter((t) => t.notional >= threshold);
    const trades = [...aboveThreshold].sort((a, b) => b.ts - a.ts).slice(0, limit);

    return {
      trades,
      tradesInWindow: inWindow.length,
      tradesAboveThreshold: aboveThreshold.length,
    };
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
