export function formatUsd(value, { compact = false } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";

  if (compact) {
    const abs = Math.abs(num);
    if (abs >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(2)}B`;
    if (abs >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: num >= 1000 ? 0 : 2,
  }).format(num);
}

export function formatPrice(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatQuantity(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function formatPercent(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return `${num.toFixed(digits)}%`;
}

export function formatTime(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("ar-EG", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
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
