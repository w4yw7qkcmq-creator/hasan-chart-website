import WebSocket from "ws";
import { fetchWithTimeout } from "../../fetch-with-timeout.js";
import { CONNECT_TIMEOUT_MS, STALE_THRESHOLD_MS, WS_BACKOFF_MS } from "../constants.js";
import { logMarketDepth } from "../logging.js";
import { levelsFromRawArray, LocalOrderBook } from "../order-book.js";
import { toExchangeSymbol } from "../symbols.js";

const OKX_WS_URL = "wss://ws.okx.com:8443/ws/v5/public";
const OKX_REST_BOOKS = "https://www.okx.com/api/v5/market/books";

export class OkxOrderBookConnection {
  constructor({ siteSymbol, onUpdate, onTrade }) {
    this.exchange = "okx";
    this.siteSymbol = siteSymbol;
    this.instId = toExchangeSymbol("okx", siteSymbol);
    this.book = new LocalOrderBook();
    this.onUpdate = onUpdate;
    this.onTrade = onTrade;
    this.status = "idle";
    this.ws = null;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.connectTimeoutTimer = null;
    this.closedByShutdown = false;
    this.lastMessageAt = 0;
    this.lastError = null;
    this.subscribers = 0;
  }

  ensureConnected() {
    if (this.closedByShutdown) return;
    if (this.ws?.readyState === 1 || this.ws?.readyState === 0) return;
    this.connect();
  }

  incrementSubscribers() {
    this.subscribers += 1;
    this.ensureConnected();
  }

  decrementSubscribers() {
    this.subscribers = Math.max(0, this.subscribers - 1);
    if (this.subscribers === 0) {
      this.shutdown();
    }
  }

  async fetchSnapshot() {
    const url = `${OKX_REST_BOOKS}?instId=${encodeURIComponent(this.instId)}&sz=400`;
    const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 8000);
    if (!response.ok) throw new Error(`OKX_SNAPSHOT_HTTP_${response.status}`);

    const payload = await response.json();
    if (payload?.code !== "0" || !payload?.data?.[0]) {
      throw new Error(`OKX_SNAPSHOT_${payload?.code || "EMPTY"}`);
    }

    const row = payload.data[0];
    this.book.applySnapshot({
      bids: levelsFromRawArray(row.bids, "bid"),
      asks: levelsFromRawArray(row.asks, "ask"),
      updateId: Number(row.seqId),
    });

    logMarketDepth("snapshot received", {
      exchange: this.exchange,
      symbol: this.siteSymbol,
      updateId: this.book.updateId,
    });

    this.status = "connected";
    this.notifyUpdate();
  }

  connect() {
    if (this.closedByShutdown) return;
    clearTimeout(this.reconnectTimer);
    this.clearTimers();
    this.book.reset();
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
      this.ws = new WebSocket(OKX_WS_URL);
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
      this.status = this.book.synced ? "connected" : "reconnecting";
      this.ws.send(
        JSON.stringify({
          op: "subscribe",
          args: [
            { channel: "books", instId: this.instId },
            { channel: "trades", instId: this.instId },
          ],
        })
      );
      this.startPing();
    });

    this.ws.on("message", (event) => {
      const text = String(event);
      if (text === "pong") return;
      if (text === "ping") {
        this.ws?.send("pong");
        return;
      }

      try {
        const payload = JSON.parse(text);
        if (payload?.event === "pong" || payload?.event === "subscribe") return;
        this.handlePayload(payload);
      } catch {
        // ignore malformed
      }
    });

    this.ws.on("error", () => {
      if (this.status !== "connected") this.status = "reconnecting";
    });

    this.ws.on("close", () => {
      this.clearTimers();
      this.ws = null;
      if (!this.closedByShutdown) this.scheduleReconnect("ws_close");
    });
  }

  handlePayload(payload) {
    const arg = payload?.arg;
    if (!arg?.channel) return;

    this.lastMessageAt = Date.now();
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    if (!rows.length) return;

    if (arg.channel === "trades") {
      for (const row of rows) {
        const price = Number(row.px);
        const quantity = Number(row.sz);
        const side = String(row.side || "").toLowerCase() === "buy" ? "buy" : "sell";
        if (!Number.isFinite(price) || !Number.isFinite(quantity)) continue;
        this.onTrade?.({
          exchange: this.exchange,
          symbol: this.siteSymbol,
          price,
          quantity,
          side,
          ts: Number(row.ts) || Date.now(),
        });
      }
      return;
    }

    if (arg.channel !== "books") return;

    for (const row of rows) {
      const action = payload.action || "update";
      const seqId = Number(row.seqId);
      const prevSeqId = Number(row.prevSeqId);

      if (action === "snapshot") {
        this.book.applySnapshot({
          bids: levelsFromRawArray(row.bids, "bid"),
          asks: levelsFromRawArray(row.asks, "ask"),
          updateId: seqId,
        });
        logMarketDepth("snapshot received", {
          exchange: this.exchange,
          symbol: this.siteSymbol,
          updateId: seqId,
          source: "ws",
        });
      } else {
        const result = this.book.applyDelta({
          bids: levelsFromRawArray(row.bids, "bid"),
          asks: levelsFromRawArray(row.asks, "ask"),
          updateId: seqId,
          prevUpdateId: prevSeqId,
        });

        if (!result.ok && result.reason === "sequence_gap") {
          logMarketDepth("sequence_gap", {
            exchange: this.exchange,
            symbol: this.siteSymbol,
            expected: result.expected,
            got: result.got,
          });
          this.resync();
          return;
        }
      }
    }

    this.status = "connected";
    this.notifyUpdate();
  }

  resync() {
    this.book.reset();
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
    if (this.closedByShutdown || this.reconnectTimer) return;

    const base = WS_BACKOFF_MS[Math.min(this.reconnectAttempt, WS_BACKOFF_MS.length - 1)];
    const jitter = Math.floor(Math.random() * base * 0.25);
    const delay = base + jitter;
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
      if (this.ws?.readyState === 1) this.ws.send("ping");
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
