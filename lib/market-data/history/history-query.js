import { fetchWithTimeout } from "../../fetch-with-timeout.js";
import {
  classifyDominanceStrength,
  dominantSideLabelAr,
} from "../executed-flow.js";
import {
  calculateCompleteness,
  getWindowStart,
} from "./window-utils.js";

const QUERY_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 30_000;

/** @type {Map<string, { expiresAt: number, value: unknown }>} */
const responseCache = new Map();

/**
 * @param {string} key
 * @param {() => Promise<T>} loader
 * @returns {Promise<T>}
 * @template T
 */
async function withCache(key, loader) {
  const now = Date.now();
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  const value = await loader();
  responseCache.set(key, { expiresAt: now + CACHE_TTL_MS, value });
  return value;
}

export function clearHistoryQueryCacheForTests() {
  responseCache.clear();
}

/**
 * @param {{ url?: string, serviceKey?: string, fetchFn?: typeof fetchWithTimeout }} [options]
 */
export function createHistoryQueryClient(options = {}) {
  const url = String(
    options.url ??
      process.env.SUPABASE_URL ??
      process.env.NEXT_PUBLIC_SUPABASE_URL ??
      "",
  )
    .trim()
    .replace(/\/+$/, "");
  const serviceKey = String(
    options.serviceKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  ).trim();
  const fetchFn = options.fetchFn ?? fetchWithTimeout;

  if (!url || !serviceKey) {
    throw new Error("HISTORY_QUERY_CLIENT_MISSING_CONFIG");
  }

  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    Accept: "application/json",
  };

  async function restGet(path) {
    const response = await fetchFn(`${url}${path}`, { method: "GET", headers }, QUERY_TIMEOUT_MS);
    if (!response.ok) {
      const error = new Error("HISTORY_QUERY_FAILED");
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  return { restGet, url };
}

/**
 * @param {Record<string, unknown>} row
 */
function mapFlowBucketRow(row) {
  return {
    bucketStart: new Date(row.bucket_start).getTime(),
    buyNotional: Number(row.buy_notional) || 0,
    sellNotional: Number(row.sell_notional) || 0,
    buyCount: Number(row.buy_count) || 0,
    sellCount: Number(row.sell_count) || 0,
  };
}

/**
 * @param {Record<string, unknown>} row
 */
function mapLargeTradeRow(row) {
  return {
    tradeKey: row.trade_key,
    symbol: row.symbol,
    exchange: row.exchange,
    ts: new Date(row.ts).getTime(),
    side: row.side,
    price: Number(row.price),
    quantity: Number(row.quantity),
    notional: Number(row.notional),
    thresholdBand: Number(row.threshold_band),
  };
}

/**
 * @param {{
 *   buyNotional: number,
 *   sellNotional: number,
 *   buyCount: number,
 *   sellCount: number,
 * }} totals
 */
export function buildFlowDominance(totals) {
  const total = totals.buyNotional + totals.sellNotional;
  const netFlow = totals.buyNotional - totals.sellNotional;
  const dominanceStrength = total > 0 ? (Math.abs(netFlow) / total) * 100 : 0;

  let dominantSide = "balanced";
  if (totals.buyNotional > totals.sellNotional) dominantSide = "buyers";
  else if (totals.sellNotional > totals.buyNotional) dominantSide = "sellers";

  const dominanceLabel = classifyDominanceStrength(dominanceStrength);

  return {
    buyNotional: totals.buyNotional,
    sellNotional: totals.sellNotional,
    netFlow,
    buyCount: totals.buyCount,
    sellCount: totals.sellCount,
    totalCount: totals.buyCount + totals.sellCount,
    buyPercent: total > 0 ? (totals.buyNotional / total) * 100 : 50,
    sellPercent: total > 0 ? (totals.sellNotional / total) * 100 : 50,
    dominantSide,
    dominanceStrength,
    dominanceLabel,
    dominantSideLabel: dominantSideLabelAr(dominantSide),
  };
}

/**
 * @param {{
 *   client: ReturnType<typeof createHistoryQueryClient>,
 *   symbol: string,
 *   window: string,
 *   scope: string,
 *   now?: number,
 *   collectingSince?: number|null,
 * }} params
 */
export async function queryHistoricalFlow(params) {
  const now = params.now ?? Date.now();
  const windowStart = getWindowStart(params.window, now);
  const windowStartIso = new Date(windowStart).toISOString();
  const cacheKey = `flow:${params.symbol}:${params.scope}:${params.window}:${windowStartIso}`;

  return withCache(cacheKey, async () => {
    const filter =
      `symbol=eq.${encodeURIComponent(params.symbol)}` +
      `&exchange_scope=eq.${encodeURIComponent(params.scope)}` +
      `&bucket_start=gte.${encodeURIComponent(windowStartIso)}` +
      `&select=bucket_start,buy_notional,sell_notional,buy_count,sell_count` +
      `&order=bucket_start.asc`;

    const rows = await params.client.restGet(`/rest/v1/market_flow_buckets?${filter}`);

    let collectingSince = params.collectingSince ?? null;
    if (collectingSince == null && Array.isArray(rows) && rows.length > 0) {
      collectingSince = new Date(rows[0].bucket_start).getTime();
    }

    const totals = {
      buyNotional: 0,
      sellNotional: 0,
      buyCount: 0,
      sellCount: 0,
    };

    for (const row of rows || []) {
      const mapped = mapFlowBucketRow(row);
      totals.buyNotional += mapped.buyNotional;
      totals.sellNotional += mapped.sellNotional;
      totals.buyCount += mapped.buyCount;
      totals.sellCount += mapped.sellCount;
    }

    const dominance = buildFlowDominance(totals);
    const completeness = calculateCompleteness({
      bucketCount: (rows || []).length,
      window: params.window,
      collectingSince,
      now,
    });

    const coverageStart = (rows || []).length
      ? new Date(rows[0].bucket_start).getTime()
      : windowStart;
    const coverageEnd = (rows || []).length
      ? new Date(rows[rows.length - 1].bucket_start).getTime()
      : null;

    return {
      success: true,
      symbol: params.symbol,
      window: params.window,
      scope: params.scope,
      ...dominance,
      bucketCount: (rows || []).length,
      expectedBucketCount: completeness.expectedBuckets,
      coverageStart,
      coverageEnd,
      completeness: completeness.completeness,
      partialData: completeness.partialData,
      collectingSince,
    };
  });
}

/**
 * @param {{
 *   client: ReturnType<typeof createHistoryQueryClient>,
 *   symbol: string,
 *   window: string,
 *   minNotional: number,
 *   limit: number,
 *   exchange?: string|null,
 *   now?: number,
 *   collectingSince?: number|null,
 * }} params
 */
export async function queryHistoricalLargeTrades(params) {
  const now = params.now ?? Date.now();
  const windowStart = getWindowStart(params.window, now);
  const windowStartIso = new Date(windowStart).toISOString();
  const cacheKey =
    `large:${params.symbol}:${params.window}:${params.minNotional}:${params.limit}:` +
    `${params.exchange || "all"}:${windowStartIso}`;

  return withCache(cacheKey, async () => {
    let filter =
      `symbol=eq.${encodeURIComponent(params.symbol)}` +
      `&ts=gte.${encodeURIComponent(windowStartIso)}` +
      `&notional=gte.${params.minNotional}` +
      `&select=trade_key,symbol,exchange,ts,side,price,quantity,notional,threshold_band` +
      `&order=ts.desc` +
      `&limit=${params.limit}`;

    if (params.exchange) {
      filter += `&exchange=eq.${encodeURIComponent(params.exchange)}`;
    }

    const rows = await params.client.restGet(`/rest/v1/market_large_trades?${filter}`);
    const mapped = (rows || []).map(mapLargeTradeRow);

    let buyCount = 0;
    let sellCount = 0;
    let buyNotional = 0;
    let sellNotional = 0;
    let maxTrade = 0;

    for (const row of mapped) {
      if (row.side === "buy") {
        buyCount += 1;
        buyNotional += row.notional;
      } else {
        sellCount += 1;
        sellNotional += row.notional;
      }
      if (row.notional > maxTrade) maxTrade = row.notional;
    }

    let collectingSince = params.collectingSince ?? null;
    if (collectingSince == null && mapped.length > 0) {
      collectingSince = Math.min(...mapped.map((row) => row.ts));
    }

    const completeness = calculateCompleteness({
      bucketCount: mapped.length > 0 ? 1 : 0,
      window: params.window,
      collectingSince,
      now,
    });

    return {
      success: true,
      rows: mapped,
      totalCount: mapped.length,
      buyCount,
      sellCount,
      buyNotional,
      sellNotional,
      maxTrade,
      window: params.window,
      partialData: completeness.partialData || collectingSince == null,
      collectingSince,
      completeness: completeness.completeness,
    };
  });
}
