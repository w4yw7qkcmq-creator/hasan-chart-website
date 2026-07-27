import WebSocket from "ws";
import { fetchWithTimeout } from "../../fetch-with-timeout.js";
import { CONNECT_TIMEOUT_MS, STALE_THRESHOLD_MS, WS_BACKOFF_MS } from "../constants.js";
import { logMarketDepth } from "../logging.js";
import { levelsFromObjectRows, LocalOrderBook } from "../order-book.js";
import { toExchangeSymbol } from "../symbols.js";

const BYBIT_REST_ORDERBOOK = "https://api.bybit.com/v5/market/orderbook";
const BYBIT_WS_URL = "wss://stream.bybit.com/v5/public/spot";

export class BybitOrderBookConnection {
  constructor({ siteSymbol, onUpdate, onTrade }) {
    this.exchange = "bybit";
    this.siteSymbol = siteSymbol;
    this.exchangeSymbol = toExchangeSymbol("bybit", siteSymbol);
    this.book = new LocalOrderBook();
    this.onUpdate = onUpdate;
    this.onTrade = onTrade;
    this.status = "idle";
    this.ws = null;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.connectTimeoutTimer = null;
    this.pingTimer = null;
    this.closedByShutdown = false;
    this.lastMessageAt = 0;
    this.lastError = null;
    this.lastSeq = null;
  }

  ensureConnected() {
    if (this.closedByShutdown) return;
    if (this.ws?.readyState === 1 || this.ws?.readyState === 0) return;
    this.connect();
  }

  incrementSubscribers() {
    this.ensureConnected();
  }

  decrementSubscribers() {}

  async fetchSnapshot() {
    const url = `${BYBIT_REST_ORDERBOOK}?category=spot&symbol=${encodeURIComponent(this.exchangeSymbol)}&limit=200`;
    const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 8000);
    if (!response.ok) throw new Error(`BYBIT_SNAPSHOT_HTTP_${response.status}`);

    const payload = await response.json();
    const result = payload?.result;
    if (payload?.retCode !== 0 || !result) {
      throw new Error(`BYBIT_SNAPSHOT_${payload?.retCode || "EMPTY"}`);
    }

    this.lastSeq = Number(result.u);
    this.book.applySnapshot({
      bids: levelsFromObjectRows(result.b, "bid"),
      asks: levelsFromObjectRows(result.a, "ask"),
      updateId: this.lastSeq,
    });

    logMarketDepth("snapshot received", {
      exchange: this.exchange,
      symbol: this.siteSymbol,
      updateId: this.lastSeq,
    });

    this.status = "connected";
    this.notifyUpdate();
  }

  connect() {
    if (this.closedByShutdown) return;
    clearTimeout(this.reconnectTimer);
    this.clearTimers();
    this.book.reset();
    this.lastSeq = null;
    this.status = "reconnecting";

    void this.fetchSnapshot()
      .catch((error) => {
        this.lastError = error?.message || String(error);
        this.status = "unavailable";
        logMarketDepth("error", {
          exchange: this.exchange,
          symbol: this.siteSymbol,
          message: this.lastError,
          phase: "snapshot",
        });
      })
      .finally(() => {
        if (this.closedByShutdown) return;
        this.openWebSocket();
      });
  }

  openWebSocket() {
    if (this.closedByShutdown) return;

    try {
      this.ws = new WebSocket(BYBIT_WS_URL);
    } catch (error) {
      this.scheduleReconnect(error?.message);
      return;
    }

    this.connectTimeoutTimer = setTimeout(() => {
      if (this.ws?.readyState === 0) {
        try {
          this.ws.terminate();
        } catch {
          // ignore
        }
      }
    }, CONNECT_TIMEOUT_MS);

    this.ws.on("open", () => {
      clearTimeout(this.connectTimeoutTimer);
      this.reconnectAttempt = 0;
      this.ws.send(
        JSON.stringify({
          op: "subscribe",
          args: [
            `orderbook.200.${this.exchangeSymbol}`,
            `publicTrade.${this.exchangeSymbol}`,
          ],
        })
      );
      this.startPing();
    });

    this.ws.on("message", (event) => {
      this.lastMessageAt = Date.now();

      try {
        const payload = JSON.parse(String(event));
        if (payload?.op === "pong") return;

        const topic = String(payload?.topic || "");
        if (topic.startsWith("publicTrade.")) {
          const rows = Array.isArray(payload?.data) ? payload.data : [];
          for (const row of rows) {
            const price = Number(row.p);
            const quantity = Number(row.v);
            const side = String(row.S || row.side || "").toLowerCase() === "buy" ? "buy" : "sell";
            if (!Number.isFinite(price) || !Number.isFinite(quantity)) continue;
            this.onTrade?.({
              exchange: this.exchange,
              symbol: this.siteSymbol,
              price,
              quantity,
              side,
              ts: Number(row.T || row.t) || Date.now(),
            });
          }
          return;
        }

        if (!topic.startsWith("orderbook.")) return;

        const data = payload?.data;
        if (!data) return;

        const updateId = Number(data.u);
        const type = payload?.type;

        if (type === "snapshot") {
          this.book.applySnapshot({
            bids: levelsFromObjectRows(data.b, "bid"),
            asks: levelsFromObjectRows(data.a, "ask"),
            updateId,
          });
          this.lastSeq = updateId;
        } else {
          if (this.lastSeq != null && updateId <= this.lastSeq) return;

          const result = this.book.applyDelta({
            bids: levelsFromObjectRows(data.b, "bid"),
            asks: levelsFromObjectRows(data.a, "ask"),
            updateId,
            prevUpdateId: this.lastSeq,
          });

          if (!result.ok && result.reason === "sequence_gap") {
            logMarketDepth("sequence_gap", {
              exchange: this.exchange,
              symbol: this.siteSymbol,
              expected: this.lastSeq,
              got: updateId,
            });
            this.resync();
            return;
          }

          this.lastSeq = updateId;
        }

        this.status = "connected";
        this.notifyUpdate();
      } catch {
        // ignore
      }
    });

    this.ws.on("close", () => {
      this.clearTimers();
      this.ws = null;
      if (!this.closedByShutdown) this.scheduleReconnect("ws_close");
    });

    this.ws.on("error", () => {
      if (this.status !== "connected") this.status = "reconnecting";
    });
  }

  resync() {
    this.book.reset();
    this.lastSeq = null;
    this.status = "reconnecting";
    logMarketDepth("recovered", {
      exchange: this.exchange,
      symbol: this.siteSymbol,
      action: "resync",
    });

    try {
      this.ws?.close();
    } catch {
      // ignore
    }

    this.ws = null;
    this.connect();
  }

  scheduleReconnect(reason) {
    const delay = WS_BACKOFF_MS[Math.min(this.reconnectAttempt, WS_BACKOFF_MS.length - 1)];
    this.reconnectAttempt += 1;
    this.status = this.book.synced ? "stale" : "reconnecting";

    logMarketDepth("reconnecting", {
      exchange: this.exchange,
      symbol: this.siteSymbol,
      delayMs: delay,
      reason,
      attempt: this.reconnectAttempt,
    });

    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  startPing() {
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === 1) {
        this.ws.send(JSON.stringify({ op: "ping" }));
      }
    }, 20000);
  }

  clearTimers() {
    clearTimeout(this.connectTimeoutTimer);
    clearTimeout(this.reconnectTimer);
    clearInterval(this.pingTimer);
    this.connectTimeoutTimer = null;
    this.reconnectTimer = null;
    this.pingTimer = null;
  }

  notifyUpdate() {
    this.onUpdate?.(this.getConnectionSnapshot());
  }

  getConnectionSnapshot() {
    const now = Date.now();
    const stale =
      !this.book.synced ||
      !this.lastMessageAt ||
      now - this.lastMessageAt > STALE_THRESHOLD_MS ||
      this.status === "stale";

    if (stale && this.status === "connected") {
      this.status = "stale";
      logMarketDepth("stale", { exchange: this.exchange, symbol: this.siteSymbol });
    }

    const levels = this.book.cloneLevels();
    return {
      exchange: this.exchange,
      symbol: this.siteSymbol,
      status: this.status,
      stale,
      synced: this.book.synced && !stale,
      updatedAt: this.book.updatedAt,
      lastMessageAt: this.lastMessageAt,
      bids: levels.bids,
      asks: levels.asks,
      lastPrice: this.book.lastPrice,
      lastError: this.lastError,
    };
  }

  shutdown() {
    this.closedByShutdown = true;
    this.clearTimers();
    try {
      this.ws?.close();
    } catch {
      // ignore
    }
    this.ws = null;
  }
}
