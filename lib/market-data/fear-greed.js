import { fetchWithTimeout } from "../fetch-with-timeout.js";
import { FEAR_GREED_API_URL, FEAR_GREED_CACHE_MS } from "./constants.js";

const FEAR_GREED_LABELS = {
  "Extreme Fear": "خوف شديد",
  Fear: "خوف",
  Neutral: "حياد",
  Greed: "طمع",
  "Extreme Greed": "طمع شديد",
};

function getCacheStore() {
  if (!globalThis.__fearGreedCache) {
    globalThis.__fearGreedCache = {
      payload: null,
      expiresAt: 0,
      inFlight: null,
    };
  }
  return globalThis.__fearGreedCache;
}

function normalizeEntry(entry) {
  const value = Number(entry?.value);
  const classification = String(entry?.value_classification || "");
  return {
    value: Number.isFinite(value) ? value : null,
    classification,
    classificationAr: FEAR_GREED_LABELS[classification] || classification || "غير متاح",
    timestamp: entry?.timestamp ? Number(entry.timestamp) * 1000 : Date.now(),
  };
}

export async function fetchFearGreedIndex({ force = false } = {}) {
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
      const response = await fetchWithTimeout(
        FEAR_GREED_API_URL,
        { headers: { Accept: "application/json" } },
        8000
      );

      if (!response.ok) {
        throw new Error(`FEAR_GREED_HTTP_${response.status}`);
      }

      const payload = await response.json();
      const rows = Array.isArray(payload?.data) ? payload.data : [];
      const current = normalizeEntry(rows[0]);
      const history = rows.slice(0, 30).map(normalizeEntry);

      if (current.value == null) {
        throw new Error("FEAR_GREED_EMPTY");
      }

      const result = {
        success: true,
        current,
        history,
        source: "alternative.me",
        attribution: "مصدر البيانات: Alternative.me Fear & Greed Index",
        updatedAt: current.timestamp,
        cached: false,
        stale: false,
      };

      cache.payload = result;
      cache.expiresAt = Date.now() + FEAR_GREED_CACHE_MS;
      return result;
    } catch (error) {
      if (cache.payload) {
        return {
          ...cache.payload,
          cached: true,
          stale: true,
          staleNotice: "قد تكون متأخرة",
          error: error?.message || String(error),
        };
      }

      return {
        success: false,
        stale: true,
        error: error?.message || String(error),
        current: null,
        history: [],
        source: "alternative.me",
      };
    } finally {
      cache.inFlight = null;
    }
  })();

  return cache.inFlight;
}
