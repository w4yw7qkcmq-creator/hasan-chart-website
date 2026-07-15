export function trimText(value, maxLength) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

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

export const PRICE_ALERT_LIST_COLUMNS =
  "id, coin, target_price, condition, status, created_at, triggered_at, triggered_price";

export const PRICE_ALERT_STATUS = {
  ACTIVE: "active",
  TRIGGERED: "triggered",
  CANCELLED: "cancelled",
};

export const PRICE_ALERT_TAB_LIMITS = {
  active: 15,
  triggered: 15,
  cancelled: 15,
};

export function formatPriceAlertCondition(condition) {
  if (condition === "above") return "فوق";
  if (condition === "below") return "تحت";
  return condition || "—";
}

export function formatPriceAlertStatus(status) {
  if (status === PRICE_ALERT_STATUS.ACTIVE) return "قيد الانتظار";
  if (status === PRICE_ALERT_STATUS.TRIGGERED) return "تم التنفيذ";
  if (status === PRICE_ALERT_STATUS.CANCELLED) return "ملغاة";
  return status || "غير محدد";
}

export function formatPriceAlertDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("ar-SY-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Damascus",
  }).format(date);
}

export const mapPriceAlertRow = (row) => ({
  id: row.id,
  coin: row.coin,
  price: row.target_price,
  condition: row.condition,
  status: row.status,
  createdAt: row.created_at,
  triggeredAt: row.triggered_at,
  triggeredPrice: row.triggered_price,
});
