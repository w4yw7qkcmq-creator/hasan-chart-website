import { fetchWithTimeout } from "./fetch-with-timeout";
import { getSharedMarketPrices, startMarketStream } from "./okx-market-stream";
import { readMarketPulseSnapshot } from "./market-pulse-redis";

const REST_CACHE_TTL_MS = 8000;
const RESPONSE_MEMORY_CACHE_MS = 15000;

function getResponseCache() {
  if (!globalThis.__hcMarketPulseResponseCache) {
    globalThis.__hcMarketPulseResponseCache = {
      value: null,
      expiresAt: 0,
    };
  }

  return globalThis.__hcMarketPulseResponseCache;
}
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
  const responseCache = getResponseCache();
  const now = Date.now();

  if (responseCache.value && responseCache.expiresAt > now) {
    return responseCache.value;
  }

  startMarketStream("market-pulse-cache");

  const snapshot = getSharedMarketPrices();
  const isFresh =
    hasKnownPrice(snapshot.prices) &&
    snapshot.updatedAt > 0 &&
    now - snapshot.updatedAt <= REST_CACHE_TTL_MS;

  let result;

  if (isFresh) {
    result = {
      prices: snapshot.prices,
      stale: snapshot.stale,
      cachedAt: snapshot.updatedAt,
      source: snapshot.source,
    };
  } else if (hasKnownPrice(snapshot.prices)) {
    result = {
      prices: snapshot.prices,
      stale: true,
      cachedAt: snapshot.updatedAt || now,
      source: snapshot.source,
    };
  } else {
    const memorySnapshot = await readMarketPulseSnapshot();
    if (memorySnapshot && hasKnownPrice(memorySnapshot.prices)) {
      result = {
        prices: memorySnapshot.prices,
        stale: Boolean(memorySnapshot.stale),
        cachedAt: memorySnapshot.updatedAt || now,
        source: memorySnapshot.source,
      };
    } else {
      try {
        const prices = await getRestFallbackPrices();
        result = {
          prices,
          stale: false,
          cachedAt: now,
          source: "okx-rest-fallback",
        };
      } catch (error) {
        if (hasKnownPrice(snapshot.prices)) {
          result = {
            prices: snapshot.prices,
            stale: true,
            cachedAt: snapshot.updatedAt || now,
            source: snapshot.source,
          };
        } else {
          throw error;
        }
      }
    }
  }

  responseCache.value = result;
  responseCache.expiresAt = now + RESPONSE_MEMORY_CACHE_MS;
  return result;
}
