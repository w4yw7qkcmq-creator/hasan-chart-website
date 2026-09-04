import { normalizeMarketSymbol } from "./market-data/symbols.js";

export const LIVE_CHART_SEARCH_ERRORS = {
  EMPTY: "اكتب رمز العملة أولاً مثل BTC أو BTCUSDT",
  NOT_FOUND: "لم يتم العثور على هذه العملة",
  NETWORK: "تعذر البحث عن العملة حاليًا، حاول مرة أخرى",
};

const LIVE_CHART_EXCHANGE = "binance";

/**
 * Normalize user input to canonical site symbol (e.g. ZECUSDT).
 * @param {string|null|undefined} input
 * @returns {string|null}
 */
export function normalizeLiveChartSymbol(input) {
  return normalizeMarketSymbol(input);
}

/**
 * TradingView live chart uses BINANCE:{symbol}; require Binance support.
 * @param {{ symbol?: string, supportedExchanges?: string[], candidateExchanges?: string[] }|null|undefined} entry
 * @returns {boolean}
 */
export function isLiveChartSymbolSupported(entry) {
  if (!entry?.symbol) return false;

  const exchanges = entry.candidateExchanges || entry.supportedExchanges || [];
  return exchanges.includes(LIVE_CHART_EXCHANGE);
}

/**
 * @param {string} normalized
 * @param {Array<{ symbol?: string, supportedExchanges?: string[], candidateExchanges?: string[] }>|null|undefined} symbols
 * @returns {string|null}
 */
export function pickLiveChartSymbolMatch(normalized, symbols) {
  if (!normalized || !Array.isArray(symbols)) return null;

  const exact = symbols.find((entry) => entry.symbol === normalized);
  return exact && isLiveChartSymbolSupported(exact) ? exact.symbol : null;
}

/**
 * @param {object|null|undefined} payload
 * @param {string|null} normalized
 * @returns {{ ok: true, symbol: string } | { ok: false, error: string, type: "empty"|"not_found"|"network" }}
 */
export function interpretLiveChartSearchResponse(payload, normalized) {
  if (!normalized) {
    return { ok: false, error: LIVE_CHART_SEARCH_ERRORS.EMPTY, type: "empty" };
  }

  if (!payload || payload.success === false) {
    return { ok: false, error: LIVE_CHART_SEARCH_ERRORS.NETWORK, type: "network" };
  }

  if (!payload.available) {
    return { ok: false, error: LIVE_CHART_SEARCH_ERRORS.NETWORK, type: "network" };
  }

  const match = pickLiveChartSymbolMatch(normalized, payload.symbols);
  if (match) {
    return { ok: true, symbol: match };
  }

  return { ok: false, error: LIVE_CHART_SEARCH_ERRORS.NOT_FOUND, type: "not_found" };
}

/**
 * Fetch helper that respects caller abort while still enforcing timeout.
 * @param {AbortSignal|undefined} parentSignal
 * @param {number} [timeoutMs=8000]
 */
export function createLiveChartSearchFetch(parentSignal, timeoutMs = 8000) {
  return async (input, init = {}) => {
    if (parentSignal?.aborted) {
      const abortError = new Error("Aborted");
      abortError.name = "AbortError";
      throw abortError;
    }

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      timeoutController.abort(new Error("FETCH_TIMEOUT"));
    }, timeoutMs);

    const onParentAbort = () => {
      timeoutController.abort(parentSignal.reason || new DOMException("Aborted", "AbortError"));
    };

    if (parentSignal) {
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
    }

    const signal =
      parentSignal && typeof AbortSignal.any === "function"
        ? AbortSignal.any([parentSignal, timeoutController.signal])
        : parentSignal || timeoutController.signal;

    try {
      return await fetch(input, { ...init, signal });
    } catch (error) {
      if (parentSignal?.aborted || error?.name === "AbortError") {
        const abortError = new Error("Aborted");
        abortError.name = "AbortError";
        throw abortError;
      }

      if (String(error?.message || "").includes("FETCH_TIMEOUT")) {
        const timeoutError = new Error("FETCH_TIMEOUT");
        timeoutError.code = "FETCH_TIMEOUT";
        throw timeoutError;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", onParentAbort);
    }
  };
}

/**
 * @param {string} input
 * @param {{ fetchFn?: typeof fetch, signal?: AbortSignal, requestBase?: string }} [options]
 */
export async function searchLiveChartSymbol(input, { fetchFn = fetch, signal, requestBase = "" } = {}) {
  const normalized = normalizeLiveChartSymbol(input);
  if (!normalized) {
    return { ok: false, error: LIVE_CHART_SEARCH_ERRORS.EMPTY, type: "empty" };
  }

  if (signal?.aborted) {
    return { ok: false, aborted: true };
  }

  const url = `${requestBase}/api/market-symbols?query=${encodeURIComponent(normalized)}&limit=10&minExchanges=1`;

  try {
    const response = await fetchFn(url, {
      headers: { Accept: "application/json" },
      signal,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      return { ok: false, error: LIVE_CHART_SEARCH_ERRORS.NETWORK, type: "network" };
    }

    return interpretLiveChartSearchResponse(payload, normalized);
  } catch (error) {
    if (signal?.aborted || error?.name === "AbortError") {
      return { ok: false, aborted: true };
    }

    return { ok: false, error: LIVE_CHART_SEARCH_ERRORS.NETWORK, type: "network" };
  }
}

/**
 * Resolve the latest in-flight search result (last request wins).
 * @param {Array<Promise<{ ok?: boolean, symbol?: string, error?: string, aborted?: boolean }>>} requests
 * @returns {Promise<{ ok: true, symbol: string } | { ok: false, error: string, type?: string }>}
 */
export async function resolveLatestLiveChartSearch(requests) {
  let latestResult = { ok: false, error: LIVE_CHART_SEARCH_ERRORS.NETWORK, type: "network" };

  for (const request of requests) {
    const result = await request;
    if (result?.aborted) continue;
    latestResult = result;
  }

  return latestResult;
}
