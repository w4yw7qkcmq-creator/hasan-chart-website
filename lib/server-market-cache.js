import { fetchWithTimeout } from "./fetch-with-timeout";
import { getBinanceMarketStreamHub, getSharedMarketPrices } from "./binance-market-stream";
import { readMarketPulseSnapshot } from "./market-pulse-redis";

const REST_CACHE_TTL_MS = 8000;
const BINANCE_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];

const restCache = {
  prices: null,
  expiresAt: 0,
  inFlight: null,
};

function formatPrices(rows) {
  const prices = {
    BTCUSDT: "0",
    ETHUSDT: "0",
    SOLUSDT: "0",
  };

  for (const row of rows || []) {
    const symbol = String(row?.symbol || "").toUpperCase();
    const price = Number(row?.price);

    if (!BINANCE_SYMBOLS.includes(symbol) || !Number.isFinite(price)) continue;
    prices[symbol] = price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return prices;
}

function hasKnownPrice(prices) {
  return Object.values(prices || {}).some((value) => value && value !== "0");
}

async function fetchBinancePricesRest() {
  const symbolsQuery = encodeURIComponent(JSON.stringify(BINANCE_SYMBOLS));
  const url = `https://api.binance.com/api/v3/ticker/price?symbols=${symbolsQuery}`;

  const response = await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    },
    5000
  );

  if (!response.ok) {
    throw new Error(`BINANCE_HTTP_${response.status}`);
  }

  const payload = await response.json();
  return formatPrices(Array.isArray(payload) ? payload : []);
}

async function getRestFallbackPrices() {
  const now = Date.now();

  if (restCache.prices && restCache.expiresAt > now) {
    return restCache.prices;
  }

  if (restCache.inFlight) {
    return restCache.inFlight;
  }

  restCache.inFlight = fetchBinancePricesRest()
    .then((prices) => {
      restCache.prices = prices;
      restCache.expiresAt = Date.now() + REST_CACHE_TTL_MS;
      restCache.inFlight = null;
      return prices;
    })
    .catch((error) => {
      restCache.inFlight = null;

      if (restCache.prices) {
        return restCache.prices;
      }

      throw error;
    });

  return restCache.inFlight;
}

export async function getCachedMarketPulse() {
  const hub = getBinanceMarketStreamHub();
  hub.ensureConnected();

  const snapshot = getSharedMarketPrices();
  const isFresh =
    hasKnownPrice(snapshot.prices) &&
    snapshot.updatedAt > 0 &&
    Date.now() - snapshot.updatedAt <= REST_CACHE_TTL_MS;

  if (isFresh) {
    return {
      prices: snapshot.prices,
      stale: snapshot.stale,
      cachedAt: snapshot.updatedAt,
      source: snapshot.source,
    };
  }

  if (hasKnownPrice(snapshot.prices)) {
    return {
      prices: snapshot.prices,
      stale: true,
      cachedAt: snapshot.updatedAt || Date.now(),
      source: snapshot.source,
    };
  }

  const redisSnapshot = await readMarketPulseSnapshot();
  if (redisSnapshot && hasKnownPrice(redisSnapshot.prices)) {
    return {
      prices: redisSnapshot.prices,
      stale: Boolean(redisSnapshot.stale),
      cachedAt: redisSnapshot.updatedAt || Date.now(),
      source: redisSnapshot.source,
    };
  }

  try {
    const prices = await getRestFallbackPrices();
    return {
      prices,
      stale: false,
      cachedAt: Date.now(),
      source: "rest-fallback",
    };
  } catch (error) {
    if (hasKnownPrice(snapshot.prices)) {
      return {
        prices: snapshot.prices,
        stale: true,
        cachedAt: snapshot.updatedAt || Date.now(),
        source: snapshot.source,
      };
    }

    throw error;
  }
}
