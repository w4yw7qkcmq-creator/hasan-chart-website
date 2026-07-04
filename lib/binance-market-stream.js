import WebSocket from "ws";
import { writeMarketPulseSnapshot } from "./market-pulse-redis";

const WS_BACKOFF_MS = [1000, 3000, 5000, 10000];
const BINANCE_STREAM_URL =
  "wss://stream.binance.com:9443/stream?streams=btcusdt@trade/ethusdt@trade/solusdt@trade";
const BINANCE_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

function formatPrice(rawPrice) {
  const price = Number(rawPrice);
  if (!Number.isFinite(price)) return "0";

  return price.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function createDefaultPrices() {
  return {
    BTCUSDT: "0",
    ETHUSDT: "0",
    SOLUSDT: "0",
  };
}

function hasKnownPrice(prices) {
  return Object.values(prices || {}).some((value) => value && value !== "0");
}

class BinanceMarketStreamHub {
  constructor() {
    this.prices = createDefaultPrices();
    this.status = "idle";
    this.updatedAt = 0;
    this.subscribers = new Set();
    this.ws = null;
    this.reconnectTimer = null;
    this.reconnectAttempt = 0;
    this.closedByShutdown = false;
    this.started = false;
  }

  ensureConnected() {
    if (this.closedByShutdown) return;
    if (!this.started) {
      this.started = true;
    }

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.connect();
  }

  connect() {
    if (this.closedByShutdown) return;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;

    this.status = hasKnownPrice(this.prices) ? "stale" : "connecting";

    try {
      this.ws = new WebSocket(BINANCE_STREAM_URL);
    } catch (error) {
      this.scheduleReconnect();
      return;
    }

    this.ws.on("open", () => {
      this.reconnectAttempt = 0;
      this.status = "live";
      this.broadcast();
    });

    this.ws.on("message", (raw) => {
      try {
        const payload = JSON.parse(String(raw));
        const trade = payload?.data;

        if (!trade?.s || !trade?.p) return;

        const symbol = String(trade.s).toUpperCase();
        if (!BINANCE_SYMBOLS.includes(symbol)) return;

        this.prices[symbol] = formatPrice(trade.p);
        this.updatedAt = Date.now();
        this.status = "live";
        this.broadcast();
      } catch {
        // Ignore malformed websocket payloads.
      }
    });

    this.ws.on("error", () => {
      if (this.status === "live") return;
      this.status = hasKnownPrice(this.prices) ? "stale" : "retrying";
      this.broadcast();
    });

    this.ws.on("close", () => {
      this.ws = null;
      if (this.closedByShutdown) return;
      this.scheduleReconnect();
    });
  }

  scheduleReconnect() {
    if (this.closedByShutdown) return;

    const delay = WS_BACKOFF_MS[Math.min(this.reconnectAttempt, WS_BACKOFF_MS.length - 1)];
    this.reconnectAttempt += 1;

    this.status = hasKnownPrice(this.prices)
      ? "stale"
      : this.reconnectAttempt >= WS_BACKOFF_MS.length
        ? "offline"
        : "retrying";

    this.broadcast();

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  subscribe(callback) {
    this.ensureConnected();
    this.subscribers.add(callback);

    try {
      callback(this.getSnapshot());
    } catch {
      // Ignore subscriber bootstrap errors.
    }

    return () => {
      this.subscribers.delete(callback);
    };
  }

  broadcast() {
    const snapshot = this.getSnapshot();
    void writeMarketPulseSnapshot(snapshot);

    for (const callback of this.subscribers) {
      try {
        callback(snapshot);
      } catch {
        // Ignore subscriber errors.
      }
    }
  }

  getSnapshot() {
    return {
      prices: { ...this.prices },
      status: this.status,
      updatedAt: this.updatedAt || 0,
      stale: this.status !== "live",
      source: "shared-memory",
    };
  }
}

export function getBinanceMarketStreamHub() {
  if (!globalThis.__binanceMarketStreamHub) {
    globalThis.__binanceMarketStreamHub = new BinanceMarketStreamHub();
  }

  return globalThis.__binanceMarketStreamHub;
}

export function getSharedMarketPrices() {
  const hub = getBinanceMarketStreamHub();
  hub.ensureConnected();
  return hub.getSnapshot();
}
