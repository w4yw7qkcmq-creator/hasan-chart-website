import { fetchWithTimeout } from "../../fetch-with-timeout.js";
import {
  CMC_FEAR_GREED_API_URL,
  CMC_FEAR_GREED_CACHE_MS,
} from "../constants.js";

const CMC_CLASSIFICATION_AR = {
  "Extreme Fear": "خوف شديد",
  Fear: "خوف",
  Neutral: "محايد",
  Greed: "طمع",
  "Extreme Greed": "طمع شديد",
};

function getCacheStore() {
  if (!globalThis.__cmcFearGreedCache) {
    globalThis.__cmcFearGreedCache = {
      payload: null,
      expiresAt: 0,
      inFlight: null,
    };
  }
  return globalThis.__cmcFearGreedCache;
}

export function normalizeCoinMarketCapFearGreedPayload(raw, fetchedAt = Date.now()) {
  const entry = raw?.data;
  const value = Number(entry?.value);
  const classification = String(entry?.value_classification || "").trim();

  if (!Number.isFinite(value)) {
    throw new Error("CMC_FEAR_GREED_EMPTY");
  }

  const updatedAt = entry?.update_time || new Date(fetchedAt).toISOString();

  return {
    success: true,
    value,
    classification,
    classificationAr: CMC_CLASSIFICATION_AR[classification] || classification || "غير متاح",
    updatedAt,
    fetchedAt: new Date(fetchedAt).toISOString(),
    source: "coinmarketcap",
  };
}

export async function fetchCoinMarketCapFearGreed({ force = false } = {}) {
  const cache = getCacheStore();
  const now = Date.now();

  if (!force && cache.payload && cache.expiresAt > now) {
    return { ...cache.payload, cached: true, stale: false };
  }

  if (cache.inFlight) {
    return cache.inFlight;
  }

  cache.inFlight = (async () => {
    try {
      const fetchedAt = Date.now();
      const response = await fetchWithTimeout(
        CMC_FEAR_GREED_API_URL,
        {
          headers: {
            Accept: "application/json",
          },
        },
        12_000,
      );

      if (!response.ok) {
        throw new Error(`CMC_FEAR_GREED_HTTP_${response.status}`);
      }

      const raw = await response.json();
      const result = {
        ...normalizeCoinMarketCapFearGreedPayload(raw, fetchedAt),
        cached: false,
        stale: false,
      };

      cache.payload = result;
      cache.expiresAt = Date.now() + CMC_FEAR_GREED_CACHE_MS;
      return result;
    } catch (error) {
      if (cache.payload) {
        return {
          ...cache.payload,
          cached: true,
          stale: true,
          staleNotice: "بيانات قديمة",
          error: error?.message || String(error),
        };
      }

      return {
        success: false,
        stale: true,
        staleNotice: "بيانات قديمة",
        error: error?.message || String(error),
        source: "coinmarketcap",
      };
    } finally {
      cache.inFlight = null;
    }
  })();

  return cache.inFlight;
}
