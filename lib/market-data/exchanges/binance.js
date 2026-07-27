import WebSocket from "ws";
import { fetchWithTimeout } from "../../fetch-with-timeout.js";
import { CONNECT_TIMEOUT_MS, STALE_THRESHOLD_MS, WS_BACKOFF_MS } from "../constants.js";
import { logMarketDepth } from "../logging.js";
import { levelsFromRawArray, LocalOrderBook } from "../order-book.js";
import { toExchangeSymbol } from "../symbols.js";

const BINANCE_REST_DEPTH = "https://api.binance.com/api/v3/depth";

export class BinanceOrderBookConnection {
  constructor({ siteSymbol, onUpdate, onTrade }) {
    this.exchange = "binance";
    this.siteSymbol = siteSymbol;
    this.exchangeSymbol = toExchangeSymbol("binance", siteSymbol);
    this.book = new LocalOrderBook();
    this.onUpdate = onUpdate;
    this.onTrade = onTrade;
    this.status = "idle";
    this.ws = null;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.connectTimeoutTimer = null;
    this.closedByShutdown = false;
    this.lastMessageAt = 0;
    this.lastError = null;
    this.pendingEvents = [];
    this.snapshotLastUpdateId = null;
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
    const url = `${BINANCE_REST_DEPTH}?symbol=${encodeURIComponent(this.exchangeSymbol)}&limit=1000`;
    const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 8000);
    if (!response.ok) throw new Error(`BINANCE_SNAPSHOT_HTTP_${response.status}`);

    const payload = await response.json();
    this.snapshotLastUpdateId = Number(payload.lastUpdateId);
    this.book.applySnapshot({
      bids: levelsFromRawArray(payload.bids, "bid"),
      asks: levelsFromRawArray(payload.asks, "ask"),
      updateId: this.snapshotLastUpdateId,
    });

    logMarketDepth("snapshot received", {
      exchange: this.exchange,
      symbol: this.siteSymbol,
      updateId: this.snapshotLastUpdateId,
    });

    this.applyBufferedEvents();
    this.status = "connected";
    this.notifyUpdate();
  }

  applyBufferedEvents() {
    if (!this.book.synced || this.snapshotLastUpdateId == null) return;

    const events = this.pendingEvents.sort((a, b) => a.u - b.u);
    this.pendingEvents = [];

    for (const event of events) {
      if (event.u <= this.snapshotLastUpdateId) continue;
      if (event.U > this.snapshotLastUpdateId + 1) {
        logMarketDepth("sequence_gap", {
          exchange: this.exchange,
          symbol: this.siteSymbol,
          expected: this.snapshotLastUpdateId + 1,
          got: event.U,
        });
        this.resync();
        return;
      }

      const result = this.book.applyDelta({
        bids: levelsFromRawArray(event.b, "bid"),
        asks: levelsFromRawArray(event.a, "ask"),
        updateId: event.u,
      });

      if (!result.ok && result.reason === "sequence_gap") {
        this.resync();
        return;
      }

      this.snapshotLastUpdateId = event.u;
    }
  }

  connect() {
    if (this.closedByShutdown) return;
    clearTimeout(this.reconnectTimer);
    this.clearTimers();
    this.book.reset();
    this.pendingEvents = [];
    this.snapshotLastUpdateId = null;
    this.status = "reconnecting";

    const streamSymbol = this.exchangeSymbol.toLowerCase();
    const streams = `${streamSymbol}@depth@100ms/${streamSymbol}@trade`;
    const wsUrl = `wss://stream.binance.com:9443/stream?streams=${streams}`;

    try {
      this.ws = new WebSocket(wsUrl);
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
      void this.fetchSnapshot().catch((error) => {
        this.lastError = error?.message || String(error);
        this.status = "unavailable";
        logMarketDepth("error", {
          exchange: this.exchange,
          symbol: this.siteSymbol,
          message: this.lastError,
          phase: "snapshot",
        });
      });
    });

    this.ws.on("message", (event) => {
      this.lastMessageAt = Date.now();

      try {
        const envelope = JSON.parse(String(event));
        const payload = envelope?.data ?? envelope;
        if (payload?.e === "trade") {
          const price = Number(payload.p);
          const quantity = Number(payload.q);
          const side = payload.m ? "sell" : "buy";
          if (!Number.isFinite(price) || !Number.isFinite(quantity)) return;
          this.onTrade?.({
            exchange: this.exchange,
            symbol: this.siteSymbol,
            price,
            quantity,
            side,
            ts: Number(payload.T) || Date.now(),
          });
          return;
        }

        if (payload?.e === "depthUpdate") {
          if (!this.book.synced) {
            this.pendingEvents.push(payload);
            if (this.pendingEvents.length > 2000) this.pendingEvents.shift();
            return;
          }

          if (payload.u <= this.snapshotLastUpdateId) return;
          if (payload.U > this.snapshotLastUpdateId + 1) {
            logMarketDepth("sequence_gap", {
              exchange: this.exchange,
              symbol: this.siteSymbol,
              expected: this.snapshotLastUpdateId + 1,
              got: payload.U,
            });
            this.resync();
            return;
          }

          const result = this.book.applyDelta({
            bids: levelsFromRawArray(payload.b, "bid"),
            asks: levelsFromRawArray(payload.a, "ask"),
            updateId: payload.u,
          });

          if (!result.ok && result.reason === "sequence_gap") {
            this.resync();
            return;
          }

          this.snapshotLastUpdateId = payload.u;
          this.status = "connected";
          this.notifyUpdate();
        }
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
    this.pendingEvents = [];
    this.snapshotLastUpdateId = null;
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

  clearTimers() {
    clearTimeout(this.connectTimeoutTimer);
    clearTimeout(this.reconnectTimer);
    this.connectTimeoutTimer = null;
    this.reconnectTimer = null;
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
