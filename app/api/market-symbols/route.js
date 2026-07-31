import { jsonResponse, CACHE_NO_STORE } from "../../../lib/api-response";
import { enforceRateLimit } from "../../../lib/enforce-rate-limit";
import { getClientIp, marketHistoryLimiter } from "../../../lib/rate-limit";
import {
  MIN_SUPPORTED_EXCHANGES,
  REGISTRY_CACHE_TTL_MS,
} from "../../../lib/market-data/dynamic-symbol-constants.js";
import {
  getSymbolRegistrySnapshot,
  refreshSymbolRegistry,
  searchRegistrySymbols,
} from "../../../lib/market-data/symbol-registry.js";
import { normalizeMarketSymbol } from "../../../lib/market-data/symbols.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_QUERY_LENGTH = 32;
const CACHE_CONTROL = `public, max-age=${Math.floor(REGISTRY_CACHE_TTL_MS / 1000)}, s-maxage=${Math.floor(REGISTRY_CACHE_TTL_MS / 1000)}, stale-while-revalidate=300`;

function parseLimit(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(1, parsed));
}

function parseMinExchanges(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return MIN_SUPPORTED_EXCHANGES;
  return Math.min(3, Math.max(1, parsed));
}

export async function GET(request) {
  try {
    const rateLimited = await enforceRateLimit(marketHistoryLimiter, getClientIp(request));
    if (rateLimited) return rateLimited;

    const url = new URL(request.url);
    const query = String(url.searchParams.get("query") || "").trim();
    const limit = parseLimit(url.searchParams.get("limit"));
    const minExchanges = parseMinExchanges(url.searchParams.get("minExchanges"));

    if (query.length > MAX_QUERY_LENGTH) {
      return jsonResponse(
        { success: false, error: "QUERY_TOO_LONG" },
        { status: 400, cacheControl: CACHE_NO_STORE },
      );
    }

    if (query && normalizeMarketSymbol(query) === null && query.length >= 2) {
      const compact = query.toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (compact && !/^[A-Z0-9]{1,12}$/.test(compact)) {
        return jsonResponse(
          { success: false, error: "INVALID_QUERY" },
          { status: 400, cacheControl: CACHE_NO_STORE },
        );
      }
    }

    await refreshSymbolRegistry();
    const snapshot = getSymbolRegistrySnapshot();
    const symbols = searchRegistrySymbols(query, { limit, minExchanges }).map((entry) => ({
      symbol: entry.symbol,
      base: entry.base,
      quote: entry.quote,
      displaySymbol: entry.displaySymbol,
      displayName: entry.displayName,
      supportedExchanges: entry.supportedExchanges,
      supportedExchangeCount: entry.supportedExchangeCount,
    }));

    return jsonResponse(
      {
        success: true,
        available: snapshot.available || symbols.length > 0,
        stale: snapshot.stale,
        fetchedAt: snapshot.fetchedAt,
        symbols,
      },
      {
        status: 200,
        cacheControl: CACHE_CONTROL,
      },
    );
  } catch {
    const snapshot = getSymbolRegistrySnapshot();
    return jsonResponse(
      {
        success: true,
        available: false,
        stale: snapshot.stale,
        fetchedAt: snapshot.fetchedAt,
        symbols: [],
        messageSafe: "symbol_registry_unavailable",
      },
      { status: 200, cacheControl: CACHE_NO_STORE },
    );
  }
}
