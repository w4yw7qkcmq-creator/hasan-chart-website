import { FULL_COVERAGE_THRESHOLD, calculateCoverage, getWindowMs, getWindowStart } from "../window-utils.js";
import { aggregateWallsForDepthChart } from "./depth-chart-aggregation.js";
import { HISTORY_LIQUIDITY_WALL_WINDOWS, WALL_SAMPLE_INTERVAL_MS } from "./wall-detector.js";

const QUERY_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 30_000;

/** @type {Map<string, { expiresAt: number, value: unknown }>} */
const responseCache = new Map();

export function clearLiquidityWallQueryCacheForTests() {
  responseCache.clear();
}

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

/**
 * @param {Record<string, unknown>} row
 */
function mapWallRow(row) {
  return {
    wallKey: row.wall_key,
    symbol: row.symbol,
    exchange: row.exchange,
    side: row.side,
    price: Number(row.price),
    size: Number(row.size),
    notional: Number(row.notional),
    distanceFromMid: Number(row.distance_from_mid),
    snapshotTime: new Date(row.snapshot_time).getTime(),
    firstSeen: new Date(row.first_seen).getTime(),
    lastSeen: new Date(row.last_seen).getTime(),
    lifetimeSeconds: Number(row.lifetime_seconds) || 0,
    appearanceCount: Number(row.appearance_count) || 0,
    persistenceScore: Number(row.persistence_score) || 0,
    maxSize: Number(row.max_size) || 0,
    averageSize: Number(row.average_size) || 0,
    reappearCount: Number(row.reappear_count) || 0,
    strongestNotional: Number(row.strongest_notional) || 0,
    survivedSnapshots: Number(row.survived_snapshots) || 0,
    isActive: Boolean(row.is_active),
  };
}

/**
 * @param {object[]} rows
 */
/**
 * Time-based coverage for liquidity wall windows using observed wall lifetimes.
 *
 * @param {{
 *   rows: ReturnType<typeof mapWallRow>[],
 *   window: string,
 *   now: number,
 *   collectingSince?: number|null,
 * }} params
 */
export function calculateWallTimeCoverage({ rows, window, now, collectingSince = null }) {
  const windowStart = getWindowStart(window, now);
  const windowMs = getWindowMs(window);

  if (collectingSince == null) {
    return {
      coverageRatio: 0,
      coveragePercent: 0,
      partialData: true,
      collecting: true,
    };
  }

  const collectionStart = Math.max(windowStart, collectingSince);

  if (!rows.length) {
    const elapsedMs = Math.max(0, now - collectionStart);
    const coverageRatio = windowMs > 0 ? Math.min(1, elapsedMs / windowMs) : 0;
    return {
      coverageRatio,
      coveragePercent: coverageRatio * 100,
      partialData: coverageRatio < FULL_COVERAGE_THRESHOLD,
      collecting: coverageRatio < FULL_COVERAGE_THRESHOLD,
    };
  }

  const earliestSeen = Math.min(...rows.map((row) => row.firstSeen));
  const latestSeen = Math.max(...rows.map((row) => row.lastSeen));
  const observedStart = Math.max(collectionStart, earliestSeen);
  const observedEnd = Math.min(now, latestSeen);
  const observedSpanMs = Math.max(0, observedEnd - observedStart);

  const uniqueSampleMinutes = new Set();
  for (const row of rows) {
    const start = Math.max(collectionStart, row.firstSeen);
    const end = Math.min(now, row.lastSeen);
    for (let ts = start; ts <= end; ts += WALL_SAMPLE_INTERVAL_MS) {
      uniqueSampleMinutes.add(Math.floor(ts / WALL_SAMPLE_INTERVAL_MS));
    }
  }

  const expectedSamples = Math.max(1, Math.floor(windowMs / WALL_SAMPLE_INTERVAL_MS));
  const sampleRatio = Math.min(1, uniqueSampleMinutes.size / expectedSamples);
  const spanRatio = windowMs > 0 ? Math.min(1, observedSpanMs / windowMs) : 0;
  const coverageRatio = Math.min(sampleRatio, spanRatio);

  return {
    coverageRatio,
    coveragePercent: coverageRatio * 100,
    partialData: coverageRatio < FULL_COVERAGE_THRESHOLD,
    collecting: coverageRatio < FULL_COVERAGE_THRESHOLD,
  };
}

function buildAnalytics(rows) {
  if (!rows.length) {
    return {
      strongestWall: null,
      longestLivingWall: null,
      mostReappearedWall: null,
      largestNotionalWall: null,
      strongestBid: null,
      strongestAsk: null,
    };
  }

  const rankScore = (row) => {
    const notional = Number(row.strongestNotional ?? row.notional) || 0;
    const persistence = Number(row.persistenceScore) || 0;
    return notional * (0.5 + persistence / 100);
  };

  const pickStrongestBySide = (side) =>
    [...rows]
      .filter((row) => row.side === side)
      .sort((a, b) => rankScore(b) - rankScore(a))[0] || null;

  const strongestWall = [...rows].sort((a, b) => b.persistenceScore - a.persistenceScore)[0];
  const longestLivingWall = [...rows].sort((a, b) => b.lifetimeSeconds - a.lifetimeSeconds)[0];
  const mostReappearedWall = [...rows].sort(
    (a, b) => b.reappearCount - a.reappearCount || b.appearanceCount - a.appearanceCount,
  )[0];
  const largestNotionalWall = [...rows].sort((a, b) => b.strongestNotional - a.strongestNotional)[0];

  return {
    strongestWall,
    longestLivingWall,
    mostReappearedWall,
    largestNotionalWall,
    strongestBid: pickStrongestBySide("bid"),
    strongestAsk: pickStrongestBySide("ask"),
  };
}

/**
 * @param {{
 *   client: { restGet: (path: string) => Promise<unknown[]> },
 *   symbol: string,
 *   window: string,
 *   exchange?: string|null,
 *   side?: "bid"|"ask"|null,
 *   limit?: number,
 *   now?: number,
 *   collectingSince?: number|null,
 * }} params
 */
export async function queryHistoricalLiquidityWalls(params) {
  const now = params.now ?? Date.now();
  const windowStart = getWindowStart(params.window, now);
  const windowStartIso = new Date(windowStart).toISOString();
  const cacheKey =
    `walls:${params.symbol}:${params.window}:${params.exchange || "all"}:` +
    `${params.side || "all"}:${params.limit ?? 20}:${windowStartIso}`;

  return withCache(cacheKey, async () => {
    let filter =
      `symbol=eq.${encodeURIComponent(params.symbol)}` +
      `&last_seen=gte.${encodeURIComponent(windowStartIso)}` +
      `&select=wall_key,symbol,exchange,side,price,size,notional,distance_from_mid,snapshot_time,first_seen,last_seen,lifetime_seconds,appearance_count,persistence_score,max_size,average_size,reappear_count,strongest_notional,survived_snapshots,is_active` +
      `&order=last_seen.desc` +
      `&limit=500`;

    if (params.exchange) {
      filter += `&exchange=eq.${encodeURIComponent(params.exchange)}`;
    }
    if (params.side) {
      filter += `&side=eq.${encodeURIComponent(params.side)}`;
    }

    const rows = (await params.client.restGet(`/rest/v1/market_liquidity_walls?${filter}`)) || [];
    const mapped = rows.map(mapWallRow);
    const limit = params.limit ?? 20;

    const topPersistent = [...mapped]
      .sort((a, b) => b.persistenceScore - a.persistenceScore)
      .slice(0, limit);
    const topAppeared = [...mapped]
      .sort((a, b) => b.appearanceCount - a.appearanceCount)
      .slice(0, limit);
    const recentlyDisappeared = mapped
      .filter((row) => !row.isActive)
      .sort((a, b) => b.lastSeen - a.lastSeen)
      .slice(0, limit);

    const coverage = calculateWallTimeCoverage({
      rows: mapped,
      window: params.window,
      now,
      collectingSince: params.collectingSince ?? null,
    });
    const aggregatedDepthPoints = aggregateWallsForDepthChart(mapped);

    return {
      success: true,
      symbol: params.symbol,
      window: params.window,
      exchange: params.exchange ?? null,
      side: params.side ?? null,
      topPersistent,
      topAppeared,
      recentlyDisappeared,
      aggregatedDepthPoints,
      analytics: buildAnalytics(mapped),
      totalCount: mapped.length,
      partialData: coverage.partialData,
      coverageRatio: coverage.coverageRatio,
      coveragePercent: coverage.coveragePercent,
      collecting: coverage.collecting ?? false,
      collectingSince: params.collectingSince ?? null,
      coverageStart: mapped.length ? Math.min(...mapped.map((row) => row.firstSeen)) : windowStart,
      coverageEnd: mapped.length ? Math.max(...mapped.map((row) => row.lastSeen)) : null,
    };
  });
}

export { HISTORY_LIQUIDITY_WALL_WINDOWS };
