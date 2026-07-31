import {
  CORE_SYMBOLS,
  HISTORY_ACTIVATION_MS,
  IDLE_TTL_MS,
  MAX_ACTIVE_DYNAMIC_SYMBOLS,
  MAX_SYMBOLS_PER_CLIENT,
} from "./dynamic-symbol-constants.js";
import {
  getRegistryEntry,
  getSupportedExchangesForSymbol,
  isKnownRegistrySymbol,
} from "./symbol-registry.js";
import { normalizeMarketSymbol } from "./symbols.js";

/**
 * @typedef {Object} SymbolSubscriptionState
 * @property {string} symbol
 * @property {number} referenceCount
 * @property {Set<string>} activeClients
 * @property {number} startedAt
 * @property {number} lastUsedAt
 * @property {string[]} supportedExchanges
 * @property {ReturnType<typeof setTimeout>|null} idleTimer
 * @property {boolean} isCore
 * @property {boolean} historyEligible
 * @property {number|null} historyEligibleSince
 * @property {"live"|"bootstrap"|"core"} source
 * @property {"probing"|"complete"|"failed"|"verified"} probeStatus
 * @property {string[]} candidateExchanges
 * @property {string[]} confirmedExchanges
 * @property {string|null} probeErrorSafe
 */

class DynamicSymbolManager {
  constructor({ idleTtlMs = IDLE_TTL_MS, historyActivationMs = HISTORY_ACTIVATION_MS } = {}) {
    this.idleTtlMs = idleTtlMs;
    this.historyActivationMs = historyActivationMs;
    /** @type {Map<string, SymbolSubscriptionState>} */
    this.symbols = new Map();
    /** @type {Map<string, Set<string>>} */
    this.clientSymbols = new Map();
    this.lastErrorSafe = null;
    /** @type {((symbol: string, exchanges: string[]) => void)|null} */
    this.onActivate = null;
    /** @type {((symbol: string) => void)|null} */
    this.onDeactivate = null;
    /** @type {((symbol: string) => void)|null} */
    this.onHistoryEligible = null;
  }

  setHooks({ onActivate, onDeactivate, onHistoryEligible }) {
    this.onActivate = onActivate || null;
    this.onDeactivate = onDeactivate || null;
    this.onHistoryEligible = onHistoryEligible || null;
  }

  isCoreSymbol(symbol) {
    return CORE_SYMBOLS.includes(symbol);
  }

  getActiveDynamicCount() {
    let count = 0;
    for (const state of this.symbols.values()) {
      if (!state.isCore && state.referenceCount > 0) count += 1;
    }
    return count;
  }

  getState(symbol) {
    return this.symbols.get(symbol) || null;
  }

  ensureCoreSymbols() {
    for (const symbol of CORE_SYMBOLS) {
      if (this.symbols.has(symbol)) continue;
      const exchanges = getSupportedExchangesForSymbol(symbol);
      this.symbols.set(symbol, {
        symbol,
        referenceCount: 0,
        activeClients: new Set(),
        startedAt: Date.now(),
        lastUsedAt: Date.now(),
        supportedExchanges: exchanges.length ? exchanges : ["binance", "bybit", "okx"],
        idleTimer: null,
        isCore: true,
        historyEligible: true,
        historyEligibleSince: Date.now(),
      });
    }
  }

  /**
   * @param {string} symbol
   * @param {string} clientId
   */
  acquire(symbol, clientId) {
    const normalized = normalizeMarketSymbol(symbol);
    if (!normalized) {
      return { ok: false, error: "INVALID_SYMBOL" };
    }

    if (!this.isCoreSymbol(normalized) && !isKnownRegistrySymbol(normalized)) {
      return { ok: false, error: "UNSUPPORTED_SYMBOL" };
    }

    const clientSet = this.clientSymbols.get(clientId) || new Set();
    if (!this.isCoreSymbol(normalized) && !clientSet.has(normalized) && clientSet.size >= MAX_SYMBOLS_PER_CLIENT) {
      return { ok: false, error: "CLIENT_SYMBOL_LIMIT" };
    }

    let state = this.symbols.get(normalized);
    const isNewDynamic = !state && !this.isCoreSymbol(normalized);

    if (isNewDynamic && this.getActiveDynamicCount() >= MAX_ACTIVE_DYNAMIC_SYMBOLS) {
      return { ok: false, error: "MAX_ACTIVE_SYMBOLS" };
    }

    const entry = getRegistryEntry(normalized);
    const bootstrap = !this.isCoreSymbol(normalized) && entry?.source === "bootstrap";
    const candidateExchanges = bootstrap
      ? getSupportedExchangesForSymbol(normalized)
      : this.isCoreSymbol(normalized)
        ? (getSupportedExchangesForSymbol(normalized).length
            ? getSupportedExchangesForSymbol(normalized)
            : ["binance", "bybit", "okx"])
        : entry?.supportedExchanges || [];

    const supportedExchanges = bootstrap ? [] : candidateExchanges;
    const source = this.isCoreSymbol(normalized) ? "core" : entry?.source === "live" ? "live" : bootstrap ? "bootstrap" : "live";
    const probeStatus = bootstrap ? "probing" : "verified";

    if (!state) {
      state = {
        symbol: normalized,
        referenceCount: 0,
        activeClients: new Set(),
        startedAt: Date.now(),
        lastUsedAt: Date.now(),
        supportedExchanges,
        candidateExchanges,
        confirmedExchanges: [],
        idleTimer: null,
        isCore: this.isCoreSymbol(normalized),
        historyEligible: this.isCoreSymbol(normalized),
        historyEligibleSince: this.isCoreSymbol(normalized) ? Date.now() : null,
        source,
        probeStatus,
        probeErrorSafe: null,
      };
      this.symbols.set(normalized, state);
    }

    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }

    const wasInactive = state.referenceCount === 0;
    if (!state.activeClients.has(clientId)) {
      state.referenceCount += 1;
      state.activeClients.add(clientId);
      clientSet.add(normalized);
      this.clientSymbols.set(clientId, clientSet);
    }

    state.lastUsedAt = Date.now();
    state.supportedExchanges = bootstrap ? state.confirmedExchanges : supportedExchanges.length ? supportedExchanges : candidateExchanges;
    state.candidateExchanges = candidateExchanges;
    state.source = source;
    if (bootstrap && state.probeStatus !== "failed") {
      state.probeStatus = state.confirmedExchanges.length ? "complete" : "probing";
    }

    if (wasInactive) {
      this.onActivate?.(normalized, candidateExchanges, {
        bootstrap,
        probe: bootstrap,
        source,
      });
    }

    this.scheduleHistoryActivation(normalized);

    return {
      ok: true,
      symbol: normalized,
      supportedExchanges: state.supportedExchanges,
      candidateExchanges,
      expectedExchangeCount: candidateExchanges.length,
      isCore: state.isCore,
      historyEligible: state.historyEligible,
      source,
      probeStatus: state.probeStatus,
      bootstrap,
    };
  }

  completeProbe(symbol, summary) {
    const normalized = normalizeMarketSymbol(symbol);
    if (!normalized) return { ok: false };

    const state = this.symbols.get(normalized);
    if (!state || state.isCore) return { ok: false };

    state.probeStatus = summary.supportedExchanges.length > 0 ? "complete" : "failed";
    state.confirmedExchanges = summary.supportedExchanges;
    state.supportedExchanges = summary.supportedExchanges;

    if (state.probeStatus === "failed") {
      state.probeErrorSafe = `symbol_probe_failed:${normalized}`;
      this.lastErrorSafe = state.probeErrorSafe;
      this.forceReleaseSymbol(normalized);
      return { ok: false, error: "SYMBOL_UNAVAILABLE", summary };
    }

    state.probeErrorSafe = null;
    return { ok: true, summary };
  }

  forceReleaseSymbol(symbol) {
    const normalized = normalizeMarketSymbol(symbol);
    const state = this.symbols.get(normalized);
    if (!state) return;

    for (const clientId of Array.from(state.activeClients)) {
      this.release(normalized, clientId);
    }

    if (state.referenceCount === 0 && !state.isCore) {
      this.deactivateSymbol(normalized);
    }
  }

  getProbeStatus(symbol) {
    const state = this.symbols.get(normalizeMarketSymbol(symbol) || "");
    if (!state) return null;
    return {
      probeStatus: state.probeStatus,
      source: state.source,
      candidateExchanges: state.candidateExchanges,
      confirmedExchanges: state.confirmedExchanges,
      probeErrorSafe: state.probeErrorSafe,
    };
  }

  scheduleHistoryActivation(symbol) {
    const state = this.symbols.get(symbol);
    if (!state || state.historyEligible || state.isCore) return;

    const timer = setTimeout(() => {
      const current = this.symbols.get(symbol);
      if (!current || current.historyEligible || current.referenceCount === 0) return;
      if (Date.now() - current.startedAt < this.historyActivationMs) return;

      current.historyEligible = true;
      current.historyEligibleSince = Date.now();
      this.onHistoryEligible?.(symbol);
    }, this.historyActivationMs);
    timer.unref?.();
  }

  /**
   * @param {string} symbol
   * @param {string} clientId
   */
  release(symbol, clientId) {
    const normalized = normalizeMarketSymbol(symbol);
    if (!normalized) return { ok: false };

    const state = this.symbols.get(normalized);
    if (!state) return { ok: true };

    if (!state.activeClients.has(clientId)) {
      return { ok: true };
    }

    state.activeClients.delete(clientId);
    state.referenceCount = Math.max(0, state.referenceCount - 1);
    state.lastUsedAt = Date.now();

    const clientSet = this.clientSymbols.get(clientId);
    clientSet?.delete(normalized);

    if (state.isCore) {
      return { ok: true };
    }

    if (state.referenceCount === 0) {
      state.idleTimer = setTimeout(() => {
        const current = this.symbols.get(normalized);
        if (!current || current.referenceCount > 0 || current.isCore) return;
        this.deactivateSymbol(normalized);
      }, this.idleTtlMs);
      state.idleTimer.unref?.();
    }

    return { ok: true };
  }

  releaseClient(clientId) {
    const clientSet = this.clientSymbols.get(clientId);
    if (!clientSet) return;

    for (const symbol of Array.from(clientSet)) {
      this.release(symbol, clientId);
    }

    this.clientSymbols.delete(clientId);
  }

  deactivateSymbol(symbol) {
    const state = this.symbols.get(symbol);
    if (!state || state.isCore) return;

    if (state.idleTimer) {
      clearTimeout(state.idleTimer);
      state.idleTimer = null;
    }

    this.symbols.delete(symbol);
    this.onDeactivate?.(symbol);
  }

  isHistoryEligible(symbol) {
    const normalized = normalizeMarketSymbol(symbol);
    if (!normalized) return false;
    const state = this.symbols.get(normalized);
    if (!state) return CORE_SYMBOLS.includes(normalized);
    return Boolean(state.historyEligible);
  }

  getHealthSnapshot({ getConnectedCount, listenerCount = 0 } = {}) {
    const subscriptions = { binance: 0, bybit: 0, okx: 0 };
    let activeSymbols = 0;
    let dynamicSymbols = 0;
    let idleSymbols = 0;
    let idleTimerCount = 0;
    let totalClients = 0;
    const clientIds = new Set();
    const symbols = [];

    for (const state of this.symbols.values()) {
      if (state.idleTimer) {
        idleTimerCount += 1;
      }

      let status = "idle";
      if (state.isCore) {
        status = state.referenceCount > 0 ? "core_active" : "core_idle";
      } else if (state.referenceCount > 0) {
        status = "active";
      } else {
        status = "idle";
      }

      if (state.referenceCount > 0) {
        activeSymbols += 1;
        if (!state.isCore) dynamicSymbols += 1;
      } else if (!state.isCore) {
        idleSymbols += 1;
      }

      for (const exchange of state.supportedExchanges) {
        if (state.referenceCount > 0) {
          subscriptions[exchange] = (subscriptions[exchange] || 0) + 1;
        }
      }

      for (const clientId of state.activeClients) {
        clientIds.add(clientId);
      }

      symbols.push({
        symbol: state.symbol,
        referenceCount: state.referenceCount,
        status,
        source: state.source,
        probeStatus: state.probeStatus,
        supportedExchangeCount: state.supportedExchanges.length,
        connectedExchangeCount: getConnectedCount?.(state.symbol) ?? 0,
        hasIdleTimer: Boolean(state.idleTimer),
        historyActive: Boolean(state.historyEligible),
      });
    }

    totalClients = clientIds.size;

    return {
      enabled: true,
      activeSymbols,
      dynamicSymbols,
      maxActiveSymbols: MAX_ACTIVE_DYNAMIC_SYMBOLS,
      totalClients,
      subscriptions,
      idleSymbols,
      idleTimerCount,
      listenerCount,
      symbols,
      lastErrorSafe: this.lastErrorSafe,
    };
  }

  resetForTests() {
    for (const state of this.symbols.values()) {
      if (state.idleTimer) clearTimeout(state.idleTimer);
    }
    this.symbols.clear();
    this.clientSymbols.clear();
    this.lastErrorSafe = null;
    this.onActivate = null;
    this.onDeactivate = null;
    this.onHistoryEligible = null;
  }
}

export function getDynamicSymbolManager() {
  if (!globalThis.__dynamicSymbolManager) {
    globalThis.__dynamicSymbolManager = new DynamicSymbolManager();
  }
  return globalThis.__dynamicSymbolManager;
}

export { DynamicSymbolManager };
