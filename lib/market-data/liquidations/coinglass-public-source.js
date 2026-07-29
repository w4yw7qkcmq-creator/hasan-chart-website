import {
  buildCoinglassRequestHeaders,
  decryptCoinglassPayload,
} from "./coinglass-crypto.js";

const CAPI_BASE = "https://capi.coinglass.com";
const DEFAULT_TIMEOUT_MS = 9_000;
const CACHE_TTL_MS = 20_000;
const STALE_TTL_MS = 120_000;

const SUMMARY_WINDOWS = ["1h", "4h", "12h", "24h"];
const EXCHANGE_WINDOWS = ["1h", "4h", "12h", "24h"];
const TARGET_EXCHANGES = ["Binance", "Bybit", "OKX"];

/** @type {{ payload: object|null, fetchedAt: number|null }} */
let memoryCache = { payload: null, fetchedAt: null };
/** @type {{ payload: object, fetchedAt: number }|null} */
let lastGoodPayload = null;

function emptySummary() {
  return Object.fromEntries(
    SUMMARY_WINDOWS.map((window) => [window, { total: null, long: null, short: null }]),
  );
}

export function createEmptyLiquidationsPayload({ stale = false, fetchedAt = null } = {}) {
  return {
    summary: emptySummary(),
    exchanges: [],
    realtime: [],
    fetchedAt,
    source: "coinglass-public",
    stale,
  };
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pickNumber(...values) {
  for (const value of values) {
    const n = toNumber(value);
    if (n !== null) return n;
  }
  return null;
}

function normalizeExchangeName(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.includes("binance")) return "Binance";
  if (lower.includes("bybit")) return "Bybit";
  if (lower === "okx" || lower.includes("okex")) return "OKX";
  return raw;
}

function computeSharePercent(total, grandTotal) {
  const t = toNumber(total);
  const g = toNumber(grandTotal);
  if (t === null || g === null || g <= 0) return null;
  return Number(((t / g) * 100).toFixed(2));
}

export function parseSummaryFromCoinLiquidation(data) {
  const summary = emptySummary();
  if (!data || typeof data !== "object" || Array.isArray(data)) return summary;

  const map = { h1: "1h", h4: "4h", h12: "12h", h24: "24h" };
  for (const [src, dest] of Object.entries(map)) {
    const bucket = data[src];
    if (!bucket || typeof bucket !== "object") continue;
    summary[dest] = {
      total: pickNumber(bucket.totalVolUsd, bucket.total),
      long: pickNumber(bucket.longVolUsd, bucket.long),
      short: pickNumber(bucket.shortVolUsd, bucket.short),
    };
  }

  return summary;
}

export function parseExchangeBreakdown(data) {
  const rows = Array.isArray(data) ? data : Array.isArray(data?.list) ? data.list : [];

  return rows
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const exchange = normalizeExchangeName(row.exchangeName || row.exchange || row.exName);
      if (!exchange || exchange.toLowerCase() === "all") return null;
      const total = pickNumber(row.totalVolUsd, row.total);
      const long = pickNumber(row.longVolUsd, row.long);
      const short = pickNumber(row.shortVolUsd, row.short);
      if (total === null) return null;
      return {
        exchange,
        total,
        long,
        short,
        sharePercent: pickNumber(row.rate, computeSharePercent(total, null)),
      };
    })
    .filter(Boolean);
}

function parseRealtimeSide(value) {
  const n = Number(value);
  if (n === 1) return "long";
  if (n === 2) return "short";
  const raw = String(value ?? "").toLowerCase();
  if (raw.includes("long") || raw === "buy") return "long";
  if (raw.includes("short") || raw === "sell") return "short";
  return null;
}

export function parseRealtimeOrders(data) {
  const rows = Array.isArray(data?.list)
    ? data.list
    : Array.isArray(data)
      ? data
      : Array.isArray(data?.data)
        ? data.data
        : [];

  return rows
    .map((row, index) => {
      if (!row || typeof row !== "object") return null;
      const symbol = row.symbol || row.coin || null;
      const price = pickNumber(row.price, row.avgPrice);
      const notional = pickNumber(row.volUsd, row.turnover, row.notional);
      const side = parseRealtimeSide(row.side ?? row.type);
      const time = pickNumber(row.createTime, row.turnoverTime, row.time, row.ts);
      const exchange = normalizeExchangeName(row.exchangeName || row.exName || row.exchange) || null;
      if (!symbol && !notional) return null;
      return {
        id: String(row.id || `${exchange || "x"}-${time || index}-${symbol || "?"}`),
        exchange,
        symbol: symbol ? String(symbol) : null,
        price,
        notional,
        side,
        time,
      };
    })
    .filter(Boolean)
    .slice(0, 50);
}

export function buildTargetExchangeRows(allRows) {
  const byName = new Map(allRows.map((row) => [row.exchange, row]));
  const picked = TARGET_EXCHANGES.map((exchange) => byName.get(exchange)).filter(Boolean);
  if (!picked.length) return allRows.slice(0, 4);

  const total = picked.reduce(
    (acc, row) => ({
      exchange: "الإجمالي",
      total: (acc.total || 0) + (row.total || 0),
      long: (acc.long || 0) + (row.long || 0),
      short: (acc.short || 0) + (row.short || 0),
    }),
    { exchange: "الإجمالي", total: 0, long: 0, short: 0 },
  );

  return [...picked, { ...total, sharePercent: 100 }].map((row) => ({
    ...row,
    sharePercent:
      row.exchange === "الإجمالي"
        ? 100
        : computeSharePercent(
            row.total,
            picked.reduce((sum, item) => sum + (item.total || 0), 0),
          ),
  }));
}

async function fetchEncryptedJson(path, { params = {}, timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
  const cacheTsV2 = Date.now();
  const url = new URL(path, CAPI_BASE);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abortOnParent = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abortOnParent, { once: true });
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: buildCoinglassRequestHeaders({ cacheTsV2 }),
      signal: controller.signal,
      cache: "no-store",
    });

    const rawText = await response.text();
    let envelope;
    try {
      envelope = JSON.parse(rawText);
    } catch {
      throw new Error("COINGLASS_INVALID_JSON");
    }

    if (!response.ok || envelope?.success === false) {
      throw new Error(envelope?.msg || "COINGLASS_HTTP_ERROR");
    }

    if (typeof envelope?.data === "string" && envelope.data.length > 0) {
      const user = response.headers.get("user");
      const v = response.headers.get("v") || "1";
      const timeHeader = response.headers.get("time");
      return decryptCoinglassPayload({
        encryptedBodyB64: envelope.data,
        userTokenB64: user,
        v,
        urlPath: url.pathname,
        cacheTsV2,
        timeHeader,
      });
    }

    return envelope?.data ?? envelope;
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener("abort", abortOnParent);
  }
}

export async function fetchCoinglassLiquidations({ signal } = {}) {
  const [coinLiquidation, exInfoH1, exInfoH4, exInfoH12, exInfoH24, realtimeOrders] = await Promise.all([
    fetchEncryptedJson("/api/coin/liquidation", { signal }),
    fetchEncryptedJson("/api/futures/liquidation/ex/info", { params: { time: "h1", symbol: "" }, signal }),
    fetchEncryptedJson("/api/futures/liquidation/ex/info", { params: { time: "h4", symbol: "" }, signal }),
    fetchEncryptedJson("/api/futures/liquidation/ex/info", { params: { time: "h12", symbol: "" }, signal }),
    fetchEncryptedJson("/api/futures/liquidation/ex/info", { params: { time: "h24", symbol: "" }, signal }),
    fetchEncryptedJson("/api/futures/liquidation/order", {
      params: { volUsd: "", symbol: "", exName: "", pageNum: 1, pageSize: 50 },
      signal,
    }),
  ]);

  const summary = parseSummaryFromCoinLiquidation(coinLiquidation);

  const exchangeByWindow = {
    "1h": buildTargetExchangeRows(parseExchangeBreakdown(exInfoH1)),
    "4h": buildTargetExchangeRows(parseExchangeBreakdown(exInfoH4)),
    "12h": buildTargetExchangeRows(parseExchangeBreakdown(exInfoH12)),
    "24h": buildTargetExchangeRows(parseExchangeBreakdown(exInfoH24)),
  };

  const exchanges = exchangeByWindow["4h"]?.length ? exchangeByWindow["4h"] : exchangeByWindow["24h"];
  const realtime = parseRealtimeOrders(realtimeOrders);

  return {
    summary,
    exchanges,
    exchangeByWindow,
    realtime,
    fetchedAt: Date.now(),
    source: "coinglass-public",
    stale: false,
  };
}

export async function getCoinglassLiquidations({ force = false, signal } = {}) {
  const now = Date.now();
  if (!force && memoryCache.payload && memoryCache.fetchedAt && now - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.payload;
  }

  try {
    const payload = await fetchCoinglassLiquidations({ signal });
    memoryCache = { payload, fetchedAt: now };
    lastGoodPayload = { payload, fetchedAt: now };
    return payload;
  } catch (error) {
    if (lastGoodPayload && now - lastGoodPayload.fetchedAt < STALE_TTL_MS) {
      return { ...lastGoodPayload.payload, stale: true, fetchedAt: lastGoodPayload.fetchedAt };
    }
    throw error;
  }
}

export function resetCoinglassLiquidationsCacheForTests() {
  memoryCache = { payload: null, fetchedAt: null };
  lastGoodPayload = null;
}

export { SUMMARY_WINDOWS, EXCHANGE_WINDOWS, TARGET_EXCHANGES, CACHE_TTL_MS, STALE_TTL_MS, DEFAULT_TIMEOUT_MS };
