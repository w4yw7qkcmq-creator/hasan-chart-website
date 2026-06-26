import { fetchWithTimeout } from "./fetch-with-timeout";
import { getSharedMarketPrices, startMarketStream } from "./okx-market-stream";
import { readMarketPulseSnapshot } from "./market-pulse-redis";

const REST_CACHE_TTL_MS = 8000;
const SITE_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const OKX_INSTRUMENTS = ["BTC-USDT", "ETH-USDT", "SOL-USDT"];

const OKX_TO_SITE_SYMBOL = {
  "BTC-USDT": "BTCUSDT",
  "ETH-USDT": "ETHUSDT",
  "SOL-USDT": "SOLUSDT",
};

const restCache = {
  prices: null,
  expiresAt: 0,
  inFlight: null,
};

function createDefaultPrices() {
  return {
    BTCUSDT: "0",
    ETHUSDT: "0",
    SOLUSDT: "0",
  };
}

function formatPricesFromOkxRows(rows) {
  const prices = createDefaultPrices();

  for (const row of rows || []) {
    const instId = String(row?.instId || "").toUpperCase();
    const siteSymbol = OKX_TO_SITE_SYMBOL[instId];
    const price = Number(row?.last);

    if (!siteSymbol || !SITE_SYMBOLS.includes(siteSymbol) || !Number.isFinite(price)) {
      continue;
    }

    prices[siteSymbol] = price.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return prices;
}

function hasKnownPrice(prices) {
  return Object.values(prices || {}).some((value) => value && value !== "0");
}

async function fetchOkxPricesRest() {
  const url = "https://www.okx.com/api/v5/market/tickers?instType=SPOT";

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
    throw new Error(`OKX_HTTP_${response.status}`);
  }

  const payload = await response.json();
  if (payload?.code !== "0") {
    throw new Error(`OKX_API_${payload?.code || "UNKNOWN"}`);
  }

  return formatPricesFromOkxRows(
    (Array.isArray(payload?.data) ? payload.data : []).filter((row) =>
      OKX_INSTRUMENTS.includes(String(row?.instId || "").toUpperCase())
    )
  );
}

async function getRestFallbackPrices() {
  const now = Date.now();

  if (restCache.prices && restCache.expiresAt > now) {
    return restCache.prices;
  }

  if (restCache.inFlight) {
    return restCache.inFlight;
  }

  restCache.inFlight = fetchOkxPricesRest()
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
  startMarketStream("market-pulse-cache");

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
      source: "okx-rest-fallback",
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
