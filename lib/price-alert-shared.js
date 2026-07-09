export const normalizeSymbol = (value) => {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
};

export const toOkxInstId = (symbol) => {
  const cleanSymbol = normalizeSymbol(symbol);

  if (!cleanSymbol) {
    throw new Error("EMPTY_SYMBOL");
  }

  const base = cleanSymbol.endsWith("USDT")
    ? cleanSymbol.slice(0, -4)
    : cleanSymbol;

  if (!base) {
    throw new Error("EMPTY_SYMBOL");
  }

  return `${base}-USDT`;
};

export const getOkxMarketPrice = async (symbol) => {
  const cleanSymbol = normalizeSymbol(symbol);

  if (!cleanSymbol) {
    throw new Error("EMPTY_SYMBOL");
  }

  const okxSymbol = toOkxInstId(symbol);

  const response = await fetch(
    `https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(okxSymbol)}`,
    {
      cache: "no-store",
    }
  );

  const data = await response.json().catch(() => null);
  const currentPrice = Number(data?.data?.[0]?.last);

  if (Number.isFinite(currentPrice)) {
    return currentPrice;
  }

  throw new Error(`تعذر جلب السعر الحالي لـ ${cleanSymbol}. تأكد من اسم العملة وحاول مرة أخرى.`);
};

export const resolveAlertCondition = async ({ coin, targetPrice }) => {
  const target = Number(targetPrice);
  const MAX_ALERT_PRICE = 1_000_000_000;

  if (!Number.isFinite(target) || target <= 0 || target > MAX_ALERT_PRICE) {
    throw new Error("السعر المستهدف غير صالح.");
  }

  const currentPrice = await getOkxMarketPrice(coin);

  return target >= currentPrice ? "above" : "below";
};

export const mapPriceAlertRow = (row) => ({
  id: row.id,
  coin: row.coin,
  price: row.target_price,
  condition: row.condition,
  status: row.status,
  createdAt: row.created_at,
});
