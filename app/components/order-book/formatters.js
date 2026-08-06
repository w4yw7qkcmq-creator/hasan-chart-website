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
    case "1m":
      return "دقيقة واحدة";
    case "5m":
      return "5 دقائق";
    case "15m":
      return "15 دقيقة";
    case "1h":
      return "ساعة واحدة";
    case "4h":
      return "4 ساعات";
    case "12h":
      return "12 ساعة";
    case "1d":
      return "يوم واحد";
    case "3d":
      return "3 أيام";
    case "7d":
      return "7 أيام";
    default:
      return window || "—";
  }
}
export function formatLargeTradeEmptyMessage(threshold, window) {
  return `لا توجد صفقات كبيرة ضمن الحد المحدد (${formatThresholdLabel(threshold)}) في هذه الفترة (${formatFlowWindowLabelAr(window)}).`;
} /** * @param {number} seconds */
export function formatDurationAr(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  if (total === 0) return "حديثًا";
  if (total < 60) {
    return total < 10 ? "أقل من دقيقة" : `${total} ث`;
  }
  const minutes = Math.floor(total / 60);
  if (minutes < 60) {
    return `${minutes} دقيقة`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes ? `${hours} س ${remMinutes} د` : `${hours} س`;
} /** * @param {number} ts * @param {number} [now] */
export function formatMinutesAgoAr(ts, now = Date.now()) {
  const diffMs = now - Number(ts);
  if (!Number.isFinite(diffMs) || diffMs < 0) return "—";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "أقل من دقيقة";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `منذ ${hours} س ${rem} د` : `منذ ${hours} س`;
}
export function sideLabelAr(side) {
  if (side === "bid" || side === "buy") return "شراء";
  if (side === "ask" || side === "sell") return "بيع";
  return side || "—";
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
