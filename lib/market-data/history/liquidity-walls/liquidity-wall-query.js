import { calculateCoverage, getWindowStart } from "../window-utils.js";
import { HISTORY_LIQUIDITY_WALL_WINDOWS } from "./wall-detector.js";

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
function buildAnalytics(rows) {
  if (!rows.length) {
    return {
      strongestWall: null,
      longestLivingWall: null,
      mostReappearedWall: null,
      largestNotionalWall: null,
    };
  }

  const strongestWall = [...rows].sort((a, b) => b.persistenceScore - a.persistenceScore)[0];
  const longestLivingWall = [...rows].sort((a, b) => b.lifetimeSeconds - a.lifetimeSeconds)[0];
  const mostReappearedWall = [...rows].sort(
    (a, b) => b.reappearCount - a.reappearCount || b.appearanceCount - a.appearanceCount,
  )[0];
  const largestNotionalWall = [...rows].sort((a, b) => b.strongestNotional - a.strongestNotional)[0];

  return { strongestWall, longestLivingWall, mostReappearedWall, largestNotionalWall };
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

    const coverage = calculateCoverage({
      bucketCount: mapped.length > 0 ? 1 : 0,
      window: params.window,
    });

    return {
      success: true,
      symbol: params.symbol,
      window: params.window,
      exchange: params.exchange ?? null,
      side: params.side ?? null,
      topPersistent,
      topAppeared,
      recentlyDisappeared,
      analytics: buildAnalytics(mapped),
      totalCount: mapped.length,
      partialData: coverage.partialData || params.collectingSince == null,
      coverageRatio: coverage.coverageRatio,
      coveragePercent: coverage.coveragePercent,
      collectingSince: params.collectingSince ?? null,
      coverageStart: mapped.length ? Math.min(...mapped.map((row) => row.firstSeen)) : windowStart,
      coverageEnd: mapped.length ? Math.max(...mapped.map((row) => row.lastSeen)) : null,
    };
  });
}

export { HISTORY_LIQUIDITY_WALL_WINDOWS };
