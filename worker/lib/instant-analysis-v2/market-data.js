const { MIN_CANDLES_PER_TF } = require("./constants");
const { roundPrice } = require("./utils");

function normalizeCandle(raw) {
  const candle = {
    time: Number(raw.time),
    open: Number(raw.open),
    high: Number(raw.high),
    low: Number(raw.low),
    close: Number(raw.close),
    volume: Number(raw.volume),
  };

  if (
    !Number.isFinite(candle.time) ||
    !Number.isFinite(candle.open) ||
    !Number.isFinite(candle.high) ||
    !Number.isFinite(candle.low) ||
    !Number.isFinite(candle.close)
  ) {
    return null;
  }

  if (candle.high < candle.low || candle.open <= 0 || candle.close <= 0) {
    return null;
  }

  candle.high = Math.max(candle.high, candle.open, candle.close);
  candle.low = Math.min(candle.low, candle.open, candle.close);
  return candle;
}

function sortAndDedupeCandles(candles) {
  const byTime = new Map();

  for (const raw of candles || []) {
    const candle = normalizeCandle(raw);
    if (!candle) continue;
    byTime.set(candle.time, candle);
  }

  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

function assessCandleQuality(candles, timeframeKey) {
  const issues = [];

  if (!Array.isArray(candles) || candles.length < MIN_CANDLES_PER_TF) {
    issues.push("INSUFFICIENT_CANDLES");
  }

  if (candles.length >= 2) {
    for (let i = 1; i < candles.length; i += 1) {
      if (candles[i].time <= candles[i - 1].time) {
        issues.push("UNORDERED_CANDLES");
        break;
      }
    }
  }

  const last = candles[candles.length - 1];
  const freshnessSeconds = last
    ? Math.max(0, Math.floor((Date.now() - last.time) / 1000))
    : null;

  const maxStaleByTf = {
    "15m": 20 * 60,
    "1h": 2 * 60 * 60,
    "4h": 5 * 60 * 60,
  };

  if (freshnessSeconds != null && freshnessSeconds > (maxStaleByTf[timeframeKey] || 3600)) {
    issues.push("STALE_DATA");
  }

  let quality = "good";
  if (issues.includes("INSUFFICIENT_CANDLES")) quality = "insufficient";
  else if (issues.includes("STALE_DATA") || issues.includes("UNORDERED_CANDLES")) quality = "degraded";

  return {
    quality,
    issues,
    freshnessSeconds,
    lastCandleAt: last ? new Date(last.time).toISOString() : null,
    count: candles.length,
  };
}

function buildMarketDataSnapshot({ symbol, timeframeResults, source = "okx" }) {
  const candlesUsed = {};
  const timeframes = [];
  let overallQuality = "good";
  let maxFreshness = 0;

  for (const [key, payload] of Object.entries(timeframeResults)) {
    candlesUsed[key] = payload.candles.length;
    timeframes.push(key);
    if (payload.quality === "insufficient") overallQuality = "insufficient";
    else if (payload.quality === "degraded" && overallQuality === "good") overallQuality = "degraded";
    if (Number.isFinite(payload.freshnessSeconds)) {
      maxFreshness = Math.max(maxFreshness, payload.freshnessSeconds);
    }
  }

  const execution = timeframeResults["15m"];
  const lastCandleAt = execution?.lastCandleAt || null;

  return {
    source,
    symbol: roundPrice(symbol) ? symbol : String(symbol || "").toUpperCase(),
    timeframes,
    candlesUsed,
    lastCandleAt,
    freshnessSeconds: maxFreshness,
    quality: overallQuality,
  };
}

async function fetchMultiTimeframeCandles({ symbol, timeframes, fetchCandles, timeoutMs = 12000 }) {
  const results = {};

  await Promise.all(
    timeframes.map(async (tf) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const raw = await fetchCandles(symbol, tf.bar, tf.limit);
        const candles = sortAndDedupeCandles(raw);
        const assessment = assessCandleQuality(candles, tf.key);

        results[tf.key] = {
          ...assessment,
          candles,
          role: tf.role,
          bar: tf.bar,
        };
      } catch (error) {
        results[tf.key] = {
          quality: "insufficient",
          issues: ["FETCH_FAILED"],
          freshnessSeconds: null,
          lastCandleAt: null,
          count: 0,
          candles: [],
          role: tf.role,
          bar: tf.bar,
          error: error?.message || "FETCH_FAILED",
        };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  return results;
}

module.exports = {
  normalizeCandle,
  sortAndDedupeCandles,
  assessCandleQuality,
  buildMarketDataSnapshot,
  fetchMultiTimeframeCandles,
};
