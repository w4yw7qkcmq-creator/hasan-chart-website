import WebSocket from "ws";
import { queueMarketPulseSnapshotWrite } from "./market-pulse-redis";

const PROVIDER = "okx";
const WS_BACKOFF_MS = [1000, 3000, 5000, 10000];
const CONNECT_TIMEOUT_MS = 5000;
const OKX_WS_URL = "wss://ws.okx.com:8443/ws/v5/public";
const OKX_INSTRUMENTS = ["BTC-USDT", "ETH-USDT", "SOL-USDT"];
const SITE_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const OKX_TO_SITE_SYMBOL = {
  "BTC-USDT": "BTCUSDT",
  "ETH-USDT": "ETHUSDT",
  "SOL-USDT": "SOLUSDT",
};

const OKX_SUBSCRIBE_MESSAGE = JSON.stringify({
  op: "subscribe",
  args: OKX_INSTRUMENTS.map((instId) => ({
    channel: "tickers",
    instId,
  })),
});

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

function wsReadyStateLabel(ws) {
  if (!ws) return "none";
  switch (ws.readyState) {
    case WebSocket.CONNECTING:
      return "connecting";
    case WebSocket.OPEN:
      return "open";
    case WebSocket.CLOSING:
      return "closing";
    case WebSocket.CLOSED:
      return "closed";
    default:
      return "unknown";
  }
}

let providerLogged = false;
const PRODUCTION_LOG_EVENTS = new Set(["error", "reconnecting"]);

function shouldLogMarketStreamEvent(event) {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  return PRODUCTION_LOG_EVENTS.has(event);
}

export function logMarketStream(event, details = {}) {
  if (!shouldLogMarketStreamEvent(event)) {
    return;
  }

  if (!providerLogged) {
    providerLogged = true;
    console.log("marketStream: provider okx", {
      timestamp: new Date().toISOString(),
    });
  }

  console.log(`marketStream: ${event}`, {
    timestamp: new Date().toISOString(),
    provider: PROVIDER,
    ...details,
  });
}

class OkxMarketStreamHub {
  constructor() {
    this.prices = createDefaultPrices();
    this.status = "idle";
    this.updatedAt = 0;
    this.subscribers = new Set();
    this.ws = null;
    this.reconnectTimer = null;
    this.connectTimeoutTimer = null;
    this.pingTimer = null;
    this.reconnectAttempt = 0;
    this.closedByShutdown = false;
    this.started = false;
    this.subscribed = false;
    this.lastError = null;
    this.lastErrorAt = null;
    this.connectedAt = null;
    this.messagesReceived = 0;
    this.lastMessageAt = null;
  }

  ensureConnected() {
    if (this.closedByShutdown) return;
    if (!this.started) {
      this.started = true;
      logMarketStream("starting", {
        url: OKX_WS_URL,
        reason: "ensureConnected",
      });
    }

    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.connect();
  }

  clearConnectTimeout() {
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
  }

  clearPingTimer() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  setError(message, meta = {}) {
    this.lastError = message;
    this.lastErrorAt = Date.now();
    logMarketStream("error", {
      message,
      reconnectAttempt: this.reconnectAttempt,
      wsReadyState: wsReadyStateLabel(this.ws),
      ...meta,
    });
  }

  startPingLoop() {
    this.clearPingTimer();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send("ping");
      }
    }, 20000);
  }

  subscribeToTickers() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.subscribed = false;
    this.ws.send(OKX_SUBSCRIBE_MESSAGE);
  }

  connect() {
    if (this.closedByShutdown) return;

    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.clearConnectTimeout();
    this.clearPingTimer();
    this.subscribed = false;

    this.status = hasKnownPrice(this.prices) ? "stale" : "connecting";
    logMarketStream("starting", {
      url: OKX_WS_URL,
      reconnectAttempt: this.reconnectAttempt,
      reason: "connect",
    });

    try {
      this.ws = new WebSocket(OKX_WS_URL);
    } catch (error) {
      this.setError(error?.message || String(error), { phase: "constructor" });
      this.scheduleReconnect();
      return;
    }

    this.connectTimeoutTimer = setTimeout(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.CONNECTING) return;

      this.setError(`WebSocket connection timed out after ${CONNECT_TIMEOUT_MS}ms`, {
        phase: "connect-timeout",
      });

      try {
        this.ws.terminate();
      } catch {
        // Ignore terminate errors.
      }
    }, CONNECT_TIMEOUT_MS);

    this.ws.on("open", () => {
      this.clearConnectTimeout();
      this.reconnectAttempt = 0;
      this.lastError = null;
      this.lastErrorAt = null;
      this.connectedAt = Date.now();
      this.status = "connecting";
      logMarketStream("connected", {
        url: OKX_WS_URL,
        wsReadyState: wsReadyStateLabel(this.ws),
      });
      this.subscribeToTickers();
      this.startPingLoop();
    });

    this.ws.on("message", (raw) => {
      const text = String(raw);

      if (text === "pong") return;

      if (text === "ping") {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send("pong");
        }
        return;
      }

      try {
        const payload = JSON.parse(text);

        if (payload?.event === "pong") return;

        if (payload?.event === "subscribe") {
          this.subscribed = true;
          logMarketStream("subscribed", {
            channel: payload?.arg?.channel || "tickers",
            instId: payload?.arg?.instId || null,
          });
          return;
        }

        if (payload?.event === "error") {
          this.setError(payload?.msg || "OKX subscription error", {
            phase: "subscribe-error",
            code: payload?.code || null,
          });
          return;
        }

        const rows = Array.isArray(payload?.data) ? payload.data : [];
        if (!rows.length) return;

        let updated = false;

        for (const row of rows) {
          const instId = String(row?.instId || "").toUpperCase();
          const siteSymbol = OKX_TO_SITE_SYMBOL[instId];
          const lastPrice = row?.last;

          if (!siteSymbol || !SITE_SYMBOLS.includes(siteSymbol) || lastPrice == null) {
            continue;
          }

          const formatted = formatPrice(lastPrice);
          if (this.prices[siteSymbol] === formatted) continue;

          this.prices[siteSymbol] = formatted;
          updated = true;

          const ts = Number(row?.ts);
          this.updatedAt = Number.isFinite(ts) && ts > 0 ? ts : Date.now();
        }

        if (!updated) return;

        this.status = "live";
        this.messagesReceived += 1;
        this.lastMessageAt = this.updatedAt;

        if (this.messagesReceived === 1 || this.messagesReceived % 50 === 0) {
          logMarketStream("message received", {
            messagesReceived: this.messagesReceived,
            status: this.status,
          });
        }

        this.broadcast({ pricesChanged: true });
      } catch {
        // Ignore malformed websocket payloads.
      }
    });

    this.ws.on("error", (error) => {
      this.clearConnectTimeout();
      this.clearPingTimer();
      const message = error?.message || String(error);
      this.setError(message, { phase: "ws-error" });

      if (this.status === "live") return;
      this.status = hasKnownPrice(this.prices) ? "stale" : "retrying";
      this.broadcast({ pricesChanged: false });
    });

    this.ws.on("close", (code, reasonBuffer) => {
      this.clearConnectTimeout();
      this.clearPingTimer();
      this.ws = null;
      this.subscribed = false;

      const reason = reasonBuffer ? String(reasonBuffer) : "";
      if (!this.closedByShutdown) {
        logMarketStream("error", {
          message: `WebSocket closed (code=${code}${reason ? `, reason=${reason}` : ""})`,
          phase: "ws-close",
          reconnectAttempt: this.reconnectAttempt,
        });
      }

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

    logMarketStream("reconnecting", {
      delayMs: delay,
      reconnectAttempt: this.reconnectAttempt,
      status: this.status,
      lastError: this.lastError,
    });

    this.broadcast({ pricesChanged: false });

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

  broadcast({ pricesChanged = false } = {}) {
    const snapshot = this.getSnapshot();

    if (pricesChanged) {
      queueMarketPulseSnapshotWrite(snapshot);
    }

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
      stale: this.status !== "live" || !hasKnownPrice(this.prices),
      source: "shared-memory",
      provider: PROVIDER,
      lastError: this.lastError,
      lastErrorAt: this.lastErrorAt || null,
      reconnectAttempt: this.reconnectAttempt,
      wsReadyState: wsReadyStateLabel(this.ws),
      connectedAt: this.connectedAt || null,
      subscribed: this.subscribed,
      messagesReceived: this.messagesReceived,
      lastMessageAt: this.lastMessageAt || null,
    };
  }
}

export function getMarketStreamHub() {
  if (!globalThis.__okxMarketStreamHub) {
    globalThis.__okxMarketStreamHub = new OkxMarketStreamHub();
  }

  return globalThis.__okxMarketStreamHub;
}

export function startMarketStream(reason = "manual") {
  const hub = getMarketStreamHub();
  logMarketStream("starting", { reason });
  hub.ensureConnected();
  return hub;
}

export function getSharedMarketPrices() {
  const hub = getMarketStreamHub();
  hub.ensureConnected();
  return hub.getSnapshot();
}

export function waitForMarketStreamLive(timeoutMs = 8000, pollMs = 200) {
  const hub = getMarketStreamHub();
  hub.ensureConnected();

  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    const check = () => {
      const snapshot = hub.getSnapshot();
      const isLive =
        snapshot.status === "live" &&
        hasKnownPrice(snapshot.prices) &&
        snapshot.updatedAt > 0;

      if (isLive || Date.now() >= deadline) {
        resolve(snapshot);
        return;
      }

      setTimeout(check, pollMs);
    };

    check();
  });
}
