const DEFAULT_MAX_PRICE_AGE_MS = 120_000;

function normalizeSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function normalizeOkxInstrument(coin) {
  const raw = String(coin || "").trim().toUpperCase();
  if (!raw) throw new Error("EMPTY_SYMBOL");
  if (raw.includes("-")) return raw.replace(/[^A-Z0-9-]/g, "");
  const cleanSymbol = normalizeSymbol(coin);
  if (!cleanSymbol) throw new Error("EMPTY_SYMBOL");
  if (cleanSymbol.endsWith("USDT")) {
    const base = cleanSymbol.slice(0, -4);
    if (!base) throw new Error("EMPTY_SYMBOL");
    return `${base}-USDT`;
  }
  return `${cleanSymbol}-USDT`;
}

async function fetchOkxTicker(symbol, options = {}) {
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_PRICE_AGE_MS;
  const okxSymbol = normalizeOkxInstrument(symbol);
  const response = await fetch(
    `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(okxSymbol)}`,
    { cache: "no-store" }
  );
  const data = await response.json().catch(() => null);
  const row = data?.data?.[0];
  const price = Number(row?.last);
  const quoteTs = Number(row?.ts);

  if (!Number.isFinite(price)) {
    return {
      ok: false,
      reason: "missing_price",
      symbol: okxSymbol,
      status: response.status,
    };
  }

  const quotedAt = Number.isFinite(quoteTs) ? quoteTs : Date.now();
  const ageMs = Date.now() - quotedAt;
  if (ageMs > maxAgeMs) {
    return {
      ok: false,
      reason: "stale_price",
      symbol: okxSymbol,
      price,
      ageMs,
      quotedAt,
    };
  }

  return {
    ok: true,
    price,
    symbol: okxSymbol,
    source: "okx",
    quotedAt,
    ageMs,
    status: response.status,
  };
}

async function fetchOkxPricesByCoin(coins, options = {}) {
  const uniqueCoins = [...new Set(coins.map((c) => normalizeSymbol(c)).filter(Boolean))];
  const results = new Map();

  for (const coin of uniqueCoins) {
    try {
      const quote = await fetchOkxTicker(coin, options);
      results.set(coin, quote);
    } catch (error) {
      results.set(coin, { ok: false, reason: error.message || "fetch_failed", symbol: coin });
    }
  }

  return results;
}

module.exports = {
  DEFAULT_MAX_PRICE_AGE_MS,
  normalizeSymbol,
  normalizeOkxInstrument,
  fetchOkxTicker,
  fetchOkxPricesByCoin,
};
