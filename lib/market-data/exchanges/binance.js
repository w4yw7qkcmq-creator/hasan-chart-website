import dns from "node:dns";
import WebSocket from "ws";
import { fetchWithTimeout } from "../../fetch-with-timeout.js";
import { CONNECT_TIMEOUT_MS, STALE_THRESHOLD_MS, WS_BACKOFF_MS } from "../constants.js";
import { logMarketDepth } from "../logging.js";
import { levelsFromRawArray, LocalOrderBook } from "../order-book.js";
import { toExchangeSymbol } from "../symbols.js";

/** @typedef {{ id: string, host: string, port: number, path: string }} BinanceWsEndpoint */

export const BINANCE_WS_ENDPOINTS = Object.freeze([
  { id: "stream-9443", host: "stream.binance.com", port: 9443, path: "/stream" },
  { id: "stream-443", host: "stream.binance.com", port: 443, path: "/stream" },
  { id: "vision", host: "data-stream.binance.vision", port: 443, path: "/stream" },
]);

export const BINANCE_REST_BASES = Object.freeze([
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api4.binance.com",
  "https://data-api.binance.vision",
]);

const ENDPOINT_FAILURES_BEFORE_ROTATE = 2;

export function buildBinanceStreamNames(exchangeSymbol) {
  const streamSymbol = exchangeSymbol.toLowerCase();
  return `${streamSymbol}@depth@100ms/${streamSymbol}@trade`;
}

export function buildBinanceWsUrl(endpoint, exchangeSymbol) {
  const streams = buildBinanceStreamNames(exchangeSymbol);
  return `wss://${endpoint.host}:${endpoint.port}${endpoint.path}?streams=${streams}`;
}

export function buildBinanceRestDepthUrl(base, exchangeSymbol) {
  return `${base}/api/v3/depth?symbol=${encodeURIComponent(exchangeSymbol)}&limit=1000`;
}

export function computeBinanceReconnectDelay(attempt) {
  const index = Math.min(Math.max(attempt, 0), WS_BACKOFF_MS.length - 1);
  const base = WS_BACKOFF_MS[index];
  const jitter = Math.floor(Math.random() * base * 0.25);
  return base + jitter;
}

export function resolveBinanceEndpointRotation({
  pinnedIndex = null,
  activeIndex = 0,
  endpointFailures = 0,
  rotate = false,
  endpointCount = BINANCE_WS_ENDPOINTS.length,
}) {
  if (pinnedIndex != null && !rotate) {
    return { nextIndex: pinnedIndex, rotated: false, pinnedIndex };
  }

  const nextIndex = rotate ? (activeIndex + 1) % endpointCount : activeIndex;
  return {
    nextIndex,
    rotated: rotate,
    pinnedIndex: rotate ? null : pinnedIndex,
    endpointFailures: rotate ? 0 : endpointFailures,
  };
}

export function isBinanceLiveConnected({
  wsOpen = false,
  snapshotReceived = false,
  firstDeltaApplied = false,
}) {
  return Boolean(wsOpen && snapshotReceived && firstDeltaApplied);
}

function lookupIpv4(hostname, options, callback) {
  dns.lookup(hostname, { ...options, family: 4 }, callback);
}

function logBinanceTransport(phase, details = {}) {
  console.log("marketDepth: binance_transport", {
    timestamp: new Date().toISOString(),
    phase,
    ...details,
  });
}

function isNetworkFailureReason(reason) {
  const value = String(reason || "").toLowerCase();
  return (
    value.includes("ws_close") ||
    value.includes("connect_timeout") ||
    value.includes("ws_error") ||
    value.includes("snapshot_") ||
    value.includes("econnreset") ||
    value.includes("etimedout") ||
    value.includes("enotfound") ||
    value.includes("socket hang up")
  );
}

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
    this.wsOpenedAt = 0;
    this.wsOpen = false;
    this.snapshotReceived = false;
    this.firstDeltaApplied = false;
    this.activeWsEndpointIndex = 0;
    this.pinnedWsEndpointIndex = null;
    this.pinnedRestBaseIndex = null;
    this.endpointFailures = 0;
    this.currentWsHostname = null;
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

  getActiveWsEndpointIndex() {
    return this.pinnedWsEndpointIndex ?? this.activeWsEndpointIndex;
  }

  getWsEndpoint() {
    return BINANCE_WS_ENDPOINTS[this.getActiveWsEndpointIndex()];
  }

  orderedRestBaseIndices() {
    if (this.pinnedRestBaseIndex == null) {
      return BINANCE_REST_BASES.map((_, index) => index);
    }

    const order = [this.pinnedRestBaseIndex];
    for (let index = 0; index < BINANCE_REST_BASES.length; index += 1) {
      if (index !== this.pinnedRestBaseIndex) order.push(index);
    }
    return order;
  }

  async fetchSnapshot() {
    const errors = [];

    for (const baseIndex of this.orderedRestBaseIndices()) {
      const base = BINANCE_REST_BASES[baseIndex];
      const hostname = new URL(base).hostname;
      const url = buildBinanceRestDepthUrl(base, this.exchangeSymbol);

      try {
        logBinanceTransport("snapshot_attempt", {
          hostname,
          symbol: this.siteSymbol,
          restBaseIndex: baseIndex,
        });

        const response = await fetchWithTimeout(url, { headers: { Accept: "application/json" } }, 8000);
        if (!response.ok) {
          throw new Error(`BINANCE_SNAPSHOT_HTTP_${response.status}`);
        }

        const payload = await response.json();
        this.snapshotLastUpdateId = Number(payload.lastUpdateId);
        this.book.applySnapshot({
          bids: levelsFromRawArray(payload.bids, "bid"),
          asks: levelsFromRawArray(payload.asks, "ask"),
          updateId: this.snapshotLastUpdateId,
        });

        this.pinnedRestBaseIndex = baseIndex;
        this.snapshotReceived = true;
        this.firstDeltaApplied = false;
        this.status = "reconnecting";

        logBinanceTransport("snapshot_success", {
          hostname,
          symbol: this.siteSymbol,
          restBaseIndex: baseIndex,
          updateId: this.snapshotLastUpdateId,
        });

        logMarketDepth("snapshot received", {
          exchange: this.exchange,
          symbol: this.siteSymbol,
          updateId: this.snapshotLastUpdateId,
          restHost: hostname,
        });

        this.applyBufferedEvents();
        this.notifyUpdate();
        return;
      } catch (error) {
        const message = error?.message || String(error);
        errors.push(`${hostname}:${message}`);
        logBinanceTransport("snapshot_failure", {
          hostname,
          symbol: this.siteSymbol,
          restBaseIndex: baseIndex,
          message,
        });
      }
    }

    this.lastError = errors.join(" | ") || "BINANCE_SNAPSHOT_FAILED";
    this.status = "unavailable";
    logMarketDepth("error", {
      exchange: this.exchange,
      symbol: this.siteSymbol,
      message: this.lastError,
      phase: "snapshot",
    });
    throw new Error(this.lastError);
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
      this.markFirstDeltaApplied();
    }
  }

  markFirstDeltaApplied() {
    if (this.firstDeltaApplied) return;
    this.firstDeltaApplied = true;
    this.status = "connected";
    logBinanceTransport("first_delta", {
      hostname: this.currentWsHostname,
      symbol: this.siteSymbol,
      wsEndpointId: this.getWsEndpoint()?.id,
    });
  }

  connect() {
    if (this.closedByShutdown) return;
    clearTimeout(this.reconnectTimer);
    this.clearTimers();
    this.book.reset();
    this.pendingEvents = [];
    this.snapshotLastUpdateId = null;
    this.wsOpenedAt = 0;
    this.wsOpen = false;
    this.snapshotReceived = false;
    this.firstDeltaApplied = false;
    this.status = "reconnecting";

    const endpoint = this.getWsEndpoint();
    const wsUrl = buildBinanceWsUrl(endpoint, this.exchangeSymbol);
    this.currentWsHostname = endpoint.host;

    logBinanceTransport("connecting", {
      hostname: endpoint.host,
      symbol: this.siteSymbol,
      wsEndpointId: endpoint.id,
      wsEndpointIndex: this.getActiveWsEndpointIndex(),
      reconnectAttempt: this.reconnectAttempt,
    });

    try {
      this.ws = new WebSocket(wsUrl, { lookup: lookupIpv4 });
    } catch (error) {
      this.handleTransportFailure(error?.message || "ws_construct_error", { beforeOpen: true });
      return;
    }

    this.connectTimeoutTimer = setTimeout(() => {
      if (this.ws?.readyState === 0) {
        logBinanceTransport("connect_timeout", {
          hostname: endpoint.host,
          symbol: this.siteSymbol,
          wsEndpointId: endpoint.id,
        });
        try {
          this.ws.terminate();
        } catch {
          // ignore
        }
        this.handleTransportFailure("connect_timeout", { beforeOpen: true, closeCode: 1006 });
      }
    }, CONNECT_TIMEOUT_MS);

    this.ws.on("open", () => {
      clearTimeout(this.connectTimeoutTimer);
      this.reconnectAttempt = 0;
      this.endpointFailures = 0;
      this.wsOpenedAt = Date.now();
      this.wsOpen = true;
      this.pinnedWsEndpointIndex = this.getActiveWsEndpointIndex();

      logBinanceTransport("open", {
        hostname: endpoint.host,
        symbol: this.siteSymbol,
        wsEndpointId: endpoint.id,
        wsEndpointIndex: this.pinnedWsEndpointIndex,
      });

      void this.fetchSnapshot().catch((error) => {
        this.lastError = error?.message || String(error);
        this.handleTransportFailure(this.lastError, { beforeOpen: false, snapshotFailure: true });
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
          if (!this.book.synced || !this.snapshotReceived) {
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
          this.markFirstDeltaApplied();
          this.notifyUpdate();
        }
      } catch {
        // ignore malformed payloads
      }
    });

    this.ws.on("close", (code, reasonBuffer) => {
      const reason = reasonBuffer?.toString?.() || "";
      const uptimeMs = this.wsOpenedAt ? Date.now() - this.wsOpenedAt : 0;
      this.clearTimers();
      this.ws = null;
      this.wsOpen = false;

      logBinanceTransport("close", {
        hostname: this.currentWsHostname,
        symbol: this.siteSymbol,
        closeCode: code,
        closeReason: reason || null,
        uptimeMs,
        hadLiveDelta: this.firstDeltaApplied,
      });

      if (!this.closedByShutdown) {
        this.handleTransportFailure(reason || "ws_close", {
          beforeOpen: !this.snapshotReceived,
          closeCode: code,
          uptimeMs,
        });
      }
    });

    this.ws.on("error", (error) => {
      this.lastError = error?.message || "ws_error";
      if (this.status !== "connected") this.status = "reconnecting";
      logBinanceTransport("error", {
        hostname: this.currentWsHostname,
        symbol: this.siteSymbol,
        message: this.lastError,
        code: error?.code || null,
        name: error?.name || null,
      });
    });
  }

  handleTransportFailure(reason, { beforeOpen = false, snapshotFailure = false, closeCode = null } = {}) {
    if (this.reconnectTimer) return;

    const networkFailure = isNetworkFailureReason(reason) || beforeOpen || snapshotFailure;

    if (networkFailure) {
      this.endpointFailures += 1;
    }

    const shouldRotate =
      networkFailure &&
      !this.firstDeltaApplied &&
      this.endpointFailures >= ENDPOINT_FAILURES_BEFORE_ROTATE;

    if (shouldRotate) {
      const rotation = resolveBinanceEndpointRotation({
        pinnedIndex: this.pinnedWsEndpointIndex,
        activeIndex: this.getActiveWsEndpointIndex(),
        endpointFailures: this.endpointFailures,
        rotate: true,
      });

      this.activeWsEndpointIndex = rotation.nextIndex;
      this.pinnedWsEndpointIndex = rotation.pinnedIndex;
      this.endpointFailures = rotation.endpointFailures;

      logBinanceTransport("endpoint_rotate", {
        hostname: this.currentWsHostname,
        symbol: this.siteSymbol,
        nextWsEndpointId: BINANCE_WS_ENDPOINTS[this.activeWsEndpointIndex]?.id,
        nextWsEndpointIndex: this.activeWsEndpointIndex,
        reason,
        closeCode,
      });
    }

    this.scheduleReconnect(reason);
  }

  resync() {
    this.book.reset();
    this.pendingEvents = [];
    this.snapshotLastUpdateId = null;
    this.snapshotReceived = false;
    this.firstDeltaApplied = false;
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
    this.wsOpen = false;
    this.connect();
  }

  scheduleReconnect(reason) {
    if (this.closedByShutdown || this.reconnectTimer) return;

    const delay = computeBinanceReconnectDelay(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.status = this.firstDeltaApplied ? "stale" : "reconnecting";

    logBinanceTransport("reconnect_scheduled", {
      hostname: this.currentWsHostname,
      symbol: this.siteSymbol,
      delayMs: delay,
      reason,
      attempt: this.reconnectAttempt,
      wsEndpointId: this.getWsEndpoint()?.id,
    });

    logMarketDepth("reconnecting", {
      exchange: this.exchange,
      symbol: this.siteSymbol,
      delayMs: delay,
      reason,
      attempt: this.reconnectAttempt,
      wsEndpointId: this.getWsEndpoint()?.id,
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
    const liveConnected = isBinanceLiveConnected({
      wsOpen: this.wsOpen,
      snapshotReceived: this.snapshotReceived,
      firstDeltaApplied: this.firstDeltaApplied,
    });

    const stale =
      !liveConnected ||
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
      status: liveConnected && !stale ? "connected" : this.status,
      stale,
      synced: liveConnected && !stale,
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
    this.wsOpen = false;
  }
}
