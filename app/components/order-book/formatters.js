const EN_US = "en-US";
const EN_US_LATN = { numberingSystem: "latn" };

export function formatUsd(value, { compact = false } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";

  if (compact) {
    const abs = Math.abs(num);
    if (abs >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  }

  return new Intl.NumberFormat(EN_US, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: num >= 1000 ? 0 : 2,
    ...EN_US_LATN,
  }).format(num);
}

export function formatPrice(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString(EN_US, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    ...EN_US_LATN,
  });
}

export function formatQuantity(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString(EN_US, { maximumFractionDigits: 6, ...EN_US_LATN });
}

export function formatPercent(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${num.toFixed(digits)}%`;
}

export function formatSpreadPercent(value, digits = 4) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${num.toFixed(digits)}%`;
}

export function formatInteger(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString(EN_US, { maximumFractionDigits: 0, ...EN_US_LATN });
}

export function formatTime(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(EN_US, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    ...EN_US_LATN,
  });
}

export function formatThresholdLabel(value) {
  return formatUsd(value, { compact: true });
}

export function formatFlowWindowLabelAr(window) {
  switch (window) {
    case "5m":
      return "5 دقائق";
    case "15m":
      return "15 دقيقة";
    case "1h":
      return "ساعة واحدة";
    case "1m":
      return "دقيقة واحدة";
    default:
      return window || "—";
  }
}

export function formatLargeTradeEmptyMessage(threshold, window) {
  return `لا توجد صفقات منفذة تتجاوز ${formatThresholdLabel(threshold)} خلال آخر ${formatFlowWindowLabelAr(window)}.`;
}

export function statusLabelAr(status) {
  switch (status) {
    case "connected":
      return "متصل";
    case "reconnecting":
      return "إعادة اتصال";
    case "stale":
      return "متأخر";
    case "unavailable":
      return "غير متاح";
    default:
      return status || "—";
  }
}
